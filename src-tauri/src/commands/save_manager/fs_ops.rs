use crate::commands::save_manager::error::{SaveManagerError, SaveResult};
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::fs::{self, File};
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::thread;
use std::time::Duration;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TreeHashResult {
    pub hash: String,
    pub file_count: usize,
    pub total_size: u64,
}

const SHARING_VIOLATION_BACKOFF_MS: [u64; 5] = [200, 400, 800, 1600, 3200];
const DISK_SPACE_SAFETY_MARGIN_BYTES: u64 = 50 * 1024 * 1024; // 50MB

/// Retry wrapper for filesystem operations that may encounter Windows sharing violations.
/// Backoff: 200ms, 400ms, 800ms, 1600ms, 3200ms (5 attempts, ~6.2s total).
/// ERROR_ACCESS_DENIED (5) fails immediately without retry.
pub fn with_locked_retry<T, F: FnMut() -> io::Result<T>>(path: &Path, mut op: F) -> SaveResult<T> {
    let mut attempt = 0;
    loop {
        match op() {
            Ok(val) => return Ok(val),
            Err(err) => {
                let os_code = err.raw_os_error();
                // 5 = ERROR_ACCESS_DENIED on Windows
                if os_code == Some(5) {
                    return Err(SaveManagerError::SavePathAccessDenied(format!(
                        "Access denied to path: {} ({})",
                        path.display(),
                        err
                    )));
                }

                // 32 = ERROR_SHARING_VIOLATION on Windows
                if os_code == Some(32) {
                    if attempt < SHARING_VIOLATION_BACKOFF_MS.len() {
                        let delay = SHARING_VIOLATION_BACKOFF_MS[attempt];
                        attempt += 1;
                        thread::sleep(Duration::from_millis(delay));
                        continue;
                    }
                    return Err(SaveManagerError::SavePathLocked(format!(
                        "Path locked by another process after retries: {} ({})",
                        path.display(),
                        err
                    )));
                }

                return Err(SaveManagerError::IoError(format!(
                    "Filesystem error on {}: {}",
                    path.display(),
                    err
                )));
            }
        }
    }
}

/// Computes SHA-256 for a single file with locked-file retry.
pub fn calculate_file_sha256(path: &Path) -> SaveResult<(String, u64)> {
    with_locked_retry(path, || {
        let mut file = File::open(path)?;
        let mut hasher = Sha256::new();
        let mut buffer = [0u8; 65536];
        let mut total_size = 0u64;

        loop {
            let n = file.read(&mut buffer)?;
            if n == 0 {
                break;
            }
            hasher.update(&buffer[..n]);
            total_size += n as u64;
        }

        let hash = hex::encode(hasher.finalize());
        Ok((hash, total_size))
    })
}

/// Deterministic Tree Hash (Section 7 & 9).
/// Traverses directory recursively, normalizes paths to forward slashes,
/// sorts entries lexicographically, and computes overall SHA-256 over:
/// `<rel_path>:<file_size>:<file_sha256>\n`
pub fn calculate_tree_hash(path: &Path) -> SaveResult<TreeHashResult> {
    if !path.exists() {
        return Ok(TreeHashResult {
            hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855".to_string(),
            file_count: 0,
            total_size: 0,
        });
    }

    if path.is_file() {
        let (file_hash, file_size) = calculate_file_sha256(path)?;
        let mut hasher = Sha256::new();
        hasher.update(format!("SINGLE_FILE:{}:{}\n", file_size, file_hash).as_bytes());
        return Ok(TreeHashResult {
            hash: hex::encode(hasher.finalize()),
            file_count: 1,
            total_size: file_size,
        });
    }

    let mut entries = Vec::new();
    let walker = walkdir::WalkDir::new(path)
        .sort_by_file_name()
        .into_iter();

    for entry in walker {
        let entry = entry.map_err(|e| {
            SaveManagerError::IoError(format!("Failed to walk directory {}: {}", path.display(), e))
        })?;

        if entry.file_type().is_file() {
            let entry_path = entry.path();
            let rel_path = entry_path
                .strip_prefix(path)
                .map_err(|e| SaveManagerError::IoError(e.to_string()))?;
            let normalized_rel = rel_path.to_string_lossy().replace('\\', "/");
            let (file_hash, file_size) = calculate_file_sha256(entry_path)?;
            entries.push((normalized_rel, file_size, file_hash));
        }
    }

    // Sort lexicographically by relative path
    entries.sort_by(|a, b| a.0.cmp(&b.0));

    let file_count = entries.len();
    let mut total_size = 0u64;
    let mut overall_hasher = Sha256::new();

    for (rel_path, size, file_hash) in entries {
        total_size += size;
        overall_hasher.update(format!("{}:{}:{}\n", rel_path, size, file_hash).as_bytes());
    }

    Ok(TreeHashResult {
        hash: hex::encode(overall_hasher.finalize()),
        file_count,
        total_size,
    })
}

/// Disk Space Preflight Check (Section 7 & 11).
/// Verifies available disk space on the target volume meets requirements plus safety margin.
pub fn verify_disk_space(target_path: &Path, required_bytes: u64) -> SaveResult<()> {
    #[cfg(windows)]
    {
        use std::ffi::OsStr;
        use std::os::windows::ffi::OsStrExt;
        use windows_sys::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;

        let mut curr = target_path;
        while !curr.exists() {
            if let Some(parent) = curr.parent() {
                curr = parent;
            } else {
                break;
            }
        }
        let path_to_check = curr.to_path_buf();

        let mut wide: Vec<u16> = OsStr::new(&path_to_check).encode_wide().collect();
        wide.push(0);

        let mut free_bytes_available: u64 = 0;
        let mut total_number_of_bytes: u64 = 0;
        let mut total_number_of_free_bytes: u64 = 0;

        let success = unsafe {
            GetDiskFreeSpaceExW(
                wide.as_ptr(),
                &mut free_bytes_available,
                &mut total_number_of_bytes,
                &mut total_number_of_free_bytes,
            )
        };

        if success != 0 {
            let threshold = required_bytes.saturating_add(DISK_SPACE_SAFETY_MARGIN_BYTES);
            if free_bytes_available < threshold {
                return Err(SaveManagerError::DiskSpaceInsufficient(format!(
                    "Required: {} bytes (inc. 50MB margin), Available: {} bytes on {}",
                    threshold,
                    free_bytes_available,
                    path_to_check.display()
                )));
            }
        }
    }

    #[cfg(not(windows))]
    {
        let _ = (target_path, required_bytes);
    }

    Ok(())
}

/// Flushes file or directory buffers to disk (Section 3 & 10).
/// In Windows, calls FlushFileBuffers on the handle.
pub fn flush_file_or_dir_buffers(path: &Path) -> SaveResult<()> {
    #[cfg(windows)]
    {
        use std::ffi::OsStr;
        use std::os::windows::ffi::OsStrExt;
        use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
        use windows_sys::Win32::Storage::FileSystem::{
            CreateFileW, FlushFileBuffers, FILE_FLAG_BACKUP_SEMANTICS, FILE_READ_ATTRIBUTES,
            FILE_SHARE_DELETE, FILE_SHARE_READ, FILE_SHARE_WRITE, FILE_WRITE_ATTRIBUTES,
            OPEN_EXISTING,
        };

        if !path.exists() {
            return Ok(());
        }

        let mut wide: Vec<u16> = OsStr::new(path).encode_wide().collect();
        wide.push(0);

        let handle = unsafe {
            CreateFileW(
                wide.as_ptr(),
                FILE_READ_ATTRIBUTES | FILE_WRITE_ATTRIBUTES,
                FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
                std::ptr::null(),
                OPEN_EXISTING,
                FILE_FLAG_BACKUP_SEMANTICS, // Required to open directories as well as files
                0 as _,
            )
        };

        if handle == INVALID_HANDLE_VALUE {
            // Non-fatal if we cannot open with write attributes, fallback or continue
            return Ok(());
        }

        let success = unsafe { FlushFileBuffers(handle) };
        unsafe { CloseHandle(handle) };

        if success == 0 {
            let err = io::Error::last_os_error();
            // Some drivers or virtual drives fail FlushFileBuffers with ERROR_INVALID_FUNCTION (1)
            if err.raw_os_error() != Some(1) {
                log::warn!("FlushFileBuffers warning on {}: {}", path.display(), err);
            }
        }
    }

    #[cfg(not(windows))]
    {
        let _ = path;
    }

    Ok(())
}

/// Determines whether two paths reside on the same filesystem volume.
pub fn is_same_volume(a: &Path, b: &Path) -> bool {
    let a_canon = fs::canonicalize(a).unwrap_or_else(|_| a.to_path_buf());
    let b_canon = fs::canonicalize(b).unwrap_or_else(|_| b.to_path_buf());

    let a_prefix = a_canon.components().next();
    let b_prefix = b_canon.components().next();

    match (a_prefix, b_prefix) {
        (Some(p1), Some(p2)) => p1 == p2,
        _ => false,
    }
}

#[allow(clippy::permissions_set_readonly_false)]
fn ensure_writable(p: &Path) {
    if let Ok(mut perms) = fs::metadata(p).map(|m| m.permissions()) {
        if perms.readonly() {
            perms.set_readonly(false);
            let _ = fs::set_permissions(p, perms);
        }
    }
}

/// Recursively copies directory tree or single file with locked-file retry on every copy.
pub fn copy_dir_recursive(src: &Path, dst: &Path) -> SaveResult<u64> {
    if !src.exists() {
        return Err(SaveManagerError::SavePathNotFound(format!(
            "Source path does not exist: {}",
            src.display()
        )));
    }

    if src.is_file() {
        let src_meta = src.metadata().map_err(|e| SaveManagerError::IoError(e.to_string()))?;
        if dst.exists() {
            if dst.is_dir() {
                let _ = remove_path_all_with_retry(dst);
            } else {
                ensure_writable(dst);
                if let Ok(dst_meta) = dst.metadata() {
                    if dst_meta.len() == src_meta.len() {
                        if let (Ok(m1), Ok(m2)) = (src_meta.modified(), dst_meta.modified()) {
                            if m1 == m2 {
                                return Ok(src_meta.len());
                            }
                        }
                    }
                }
            }
        }
        if let Some(parent) = dst.parent() {
            fs::create_dir_all(parent)?;
        }
        let bytes = with_locked_retry(src, || fs::copy(src, dst))?;
        if let Ok(mtime) = src_meta.modified() {
            if let Ok(f) = fs::OpenOptions::new().write(true).open(dst) {
                let _ = f.set_modified(mtime);
            }
        }
        flush_file_or_dir_buffers(dst)?;
        return Ok(bytes);
    }

    if dst.exists() && dst.is_file() {
        let _ = remove_path_all_with_retry(dst);
    }
    fs::create_dir_all(dst)?;
    let mut total_bytes = 0u64;
    let mut files_written = 0usize;

    for entry in walkdir::WalkDir::new(src) {
        let entry = entry.map_err(|e| SaveManagerError::IoError(e.to_string()))?;
        let rel_path = entry
            .path()
            .strip_prefix(src)
            .map_err(|e| SaveManagerError::IoError(e.to_string()))?;
        let target_path = dst.join(rel_path);

        if entry.file_type().is_dir() {
            if target_path.exists() && target_path.is_file() {
                let _ = remove_path_all_with_retry(&target_path);
            }
            fs::create_dir_all(&target_path)?;
        } else if entry.file_type().is_file() {
            let src_file = entry.path();
            let src_meta = src_file.metadata().map_err(|e| SaveManagerError::IoError(e.to_string()))?;

            if target_path.exists() {
                if target_path.is_dir() {
                    let _ = remove_path_all_with_retry(&target_path);
                } else {
                    ensure_writable(&target_path);
                    if let Ok(target_meta) = target_path.metadata() {
                        if target_meta.len() == src_meta.len() {
                            if let (Ok(m1), Ok(m2)) = (src_meta.modified(), target_meta.modified()) {
                                if m1 == m2 {
                                    total_bytes += src_meta.len();
                                    continue;
                                }
                            }
                        }
                    }
                }
            }
            if let Some(parent) = target_path.parent() {
                fs::create_dir_all(parent)?;
            }
            let bytes = with_locked_retry(src_file, || fs::copy(src_file, &target_path))?;
            if let Ok(mtime) = src_meta.modified() {
                if let Ok(f) = fs::OpenOptions::new().write(true).open(&target_path) {
                    let _ = f.set_modified(mtime);
                }
            }
            total_bytes += bytes;
            files_written += 1;
        }
    }

    if files_written > 0 {
        flush_file_or_dir_buffers(dst)?;
    }
    Ok(total_bytes)
}

/// Removes directory or file with retry for transient file locks.
pub fn remove_path_all_with_retry(path: &Path) -> SaveResult<()> {
    if !path.exists() {
        return Ok(());
    }

    if path.is_dir() {
        for entry in walkdir::WalkDir::new(path).into_iter().flatten() {
            ensure_writable(entry.path());
        }
    } else {
        ensure_writable(path);
    }

    with_locked_retry(path, || {
        if path.is_file() {
            fs::remove_file(path)
        } else {
            fs::remove_dir_all(path)
        }
    })
}

/// Atomically replaces or moves `staging_path` to `target_path`.
/// If `target_path` exists and `backup_path` is given:
///   1. Moves/copies `target_path` to `backup_path` and flushes.
///   2. Moves/copies `staging_path` to `target_path` and flushes.
/// Validates that a single identifier segment (`profile_id`, `game_id`, `location_id`, `op_id`, `snapshot_id`)
/// cannot escape its parent directory or override a base path in `Path::join`.
pub fn is_valid_id_segment(raw: &str) -> bool {
    let trimmed = raw.trim();
    !trimmed.is_empty()
        && trimmed.len() <= 128
        && trimmed != "."
        && trimmed != ".."
        && trimmed
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_'))
}

/// Sanitizes an identifier into a safe single path segment.
pub fn sanitize_safe_id_segment(raw: &str) -> String {
    let trimmed = raw.trim();
    if is_valid_id_segment(trimmed) {
        return trimmed.to_string();
    }
    let cleaned: String = trimmed
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_'))
        .take(128)
        .collect();
    if cleaned.is_empty() || cleaned == "." || cleaned == ".." {
        "_invalid_id_".to_string()
    } else {
        cleaned
    }
}

fn normalize_for_guard(p: &Path) -> String {
    p.to_string_lossy()
        .replace('/', "\\")
        .trim_end_matches('\\')
        .to_lowercase()
}

/// Resolves symlinks/junctions on any existing ancestor of `path` and strips the Windows `\\?\` verbatim prefix.
fn resolve_real_path_preserving_tail(path: &Path) -> PathBuf {
    let mut cur = path;
    let mut tail: Vec<std::ffi::OsString> = Vec::new();
    while !cur.exists() {
        if let Some(name) = cur.file_name() {
            tail.push(name.to_os_string());
        } else {
            break;
        }
        if let Some(parent) = cur.parent() {
            if parent == cur {
                break;
            }
            cur = parent;
        } else {
            break;
        }
    }

    let mut base = if cur.exists() {
        std::fs::canonicalize(cur).unwrap_or_else(|_| cur.to_path_buf())
    } else {
        path.to_path_buf()
    };

    // Strip Windows extended-length `\\?\` prefix if canonicalize added it
    let base_str = base.to_string_lossy().to_string();
    if let Some(stripped) = base_str.strip_prefix("\\\\?\\UNC\\") {
        base = PathBuf::from(format!("\\\\{stripped}"));
    } else if let Some(stripped) = base_str.strip_prefix("\\\\?\\") {
        base = PathBuf::from(stripped);
    }

    if cur.exists() {
        for comp in tail.into_iter().rev() {
            base.push(comp);
        }
    }
    base
}

/// Validates that a candidate save location path is not a drive root, user home root,
/// system directory, top-level user shell folder (Documents, Documents\My Games, AppData,
/// AppData\Local, AppData\Roaming, AppData\LocalLow, Saved Games root, Desktop, Downloads),
/// or an ancestor/parent of any protected directory. Also resolves symlinks/junctions on existing ancestors.
pub fn validate_safe_save_location_path(raw: &str) -> Result<PathBuf, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("Save path cannot be empty.".into());
    }
    let expanded = expand_save_path(trimmed);
    if !expanded.is_absolute() {
        return Err("Save path must be an absolute path.".into());
    }
    for comp in expanded.components() {
        if matches!(comp, std::path::Component::ParentDir | std::path::Component::CurDir) {
            return Err("Save path cannot contain relative traversal segments ('.' or '..').".into());
        }
    }

    let resolved = resolve_real_path_preserving_tail(&expanded);

    let normal_count = resolved
        .components()
        .filter(|c| matches!(c, std::path::Component::Normal(_)))
        .count();
    if normal_count < 3 {
        return Err(
            "Save path is too shallow; root and top-level system/user directories cannot be used as a game save path."
                .into(),
        );
    }

    let norm = normalize_for_guard(&resolved);
    let profiles_root_norm = normalize_for_guard(&get_nexus_profiles_root());
    if norm == profiles_root_norm
        || norm.starts_with(&format!("{profiles_root_norm}\\"))
        || profiles_root_norm.starts_with(&format!("{norm}\\"))
    {
        return Err("Nexus internal profile storage (or its parent directory) cannot be configured as an OS save path.".into());
    }

    let sys_drive = std::env::var("SystemDrive")
        .unwrap_or_else(|_| "C:".to_string())
        .trim_end_matches('\\')
        .to_lowercase();

    let mut protected_dirs: Vec<String> = vec![
        sys_drive.clone(),
        format!("{sys_drive}\\users"),
        format!("{sys_drive}\\users\\public"),
        format!("{sys_drive}\\users\\public\\documents"),
        format!("{sys_drive}\\programdata"),
        format!("{sys_drive}\\windows"),
        format!("{sys_drive}\\program files"),
        format!("{sys_drive}\\program files (x86)"),
        "/".into(),
        "/home".into(),
        "/users".into(),
        "/root".into(),
        "/etc".into(),
        "/usr".into(),
        "/var".into(),
        "/bin".into(),
        "/sbin".into(),
        "/lib".into(),
    ];

    for env_key in ["WINDIR", "SystemRoot", "ProgramFiles", "ProgramFiles(x86)", "ProgramData", "PUBLIC", "APPDATA", "LOCALAPPDATA", "USERPROFILE"] {
        if let Ok(val) = std::env::var(env_key) {
            let p = PathBuf::from(val.trim());
            if p.is_absolute() {
                protected_dirs.push(normalize_for_guard(&p));
            }
        }
    }

    if let Some(home) = dirs::home_dir() {
        protected_dirs.push(normalize_for_guard(&home));
        protected_dirs.push(normalize_for_guard(&home.join("AppData")));
        protected_dirs.push(normalize_for_guard(&home.join("AppData").join("Local")));
        protected_dirs.push(normalize_for_guard(&home.join("AppData").join("Roaming")));
        protected_dirs.push(normalize_for_guard(&home.join("AppData").join("LocalLow")));
        protected_dirs.push(normalize_for_guard(&home.join("Saved Games")));
        protected_dirs.push(normalize_for_guard(&home.join("OneDrive")));
        protected_dirs.push(normalize_for_guard(&home.join("Documents")));
        protected_dirs.push(normalize_for_guard(&home.join("Documents").join("My Games")));
    }
    if let Some(doc_dir) = dirs::document_dir() {
        protected_dirs.push(normalize_for_guard(&doc_dir));
        protected_dirs.push(normalize_for_guard(&doc_dir.join("My Games")));
    }
    for dir_opt in [
        dirs::config_dir(),
        dirs::data_local_dir(),
        dirs::desktop_dir(),
        dirs::download_dir(),
        dirs::picture_dir(),
        dirs::video_dir(),
        dirs::audio_dir(),
    ]
    .into_iter()
    .flatten()
    {
        protected_dirs.push(normalize_for_guard(&dir_opt));
    }

    // Reject if `norm` IS a protected directory OR is a parent/ancestor of ANY protected directory!
    let norm_with_sep = format!("{norm}\\");
    if protected_dirs
        .iter()
        .any(|p| p == &norm || p.starts_with(&norm_with_sep))
    {
        return Err(format!(
            "Refusing to use top-level or parent user/system directory '{}' as a save folder; please select a game-specific subfolder.",
            resolved.display()
        ));
    }

    // Reject any path inside OS system binary directories on any drive
    let mut sys_prefixes = vec![
        format!("{sys_drive}\\windows\\"),
        format!("{sys_drive}\\program files\\windowsapps\\"),
        "/etc/".to_string(),
        "/usr/".to_string(),
        "/bin/".to_string(),
        "/sbin/".to_string(),
        "/lib/".to_string(),
    ];
    if let Ok(windir) = std::env::var("WINDIR") {
        let wn = normalize_for_guard(Path::new(&windir));
        if !wn.is_empty() {
            sys_prefixes.push(format!("{wn}\\"));
        }
    }
    for sys_prefix in &sys_prefixes {
        if norm.starts_with(sys_prefix) {
            return Err("System operating directories cannot be used as game save paths.".into());
        }
    }

    Ok(resolved)
}

pub fn safe_replace_dir(
    staging_path: &Path,
    target_path: &Path,
    backup_path: Option<&Path>,
) -> SaveResult<()> {
    // Defense-in-depth: if target_path is outside Nexus profiles vault, enforce safe save location depth/blacklist
    let profiles_root_norm = normalize_for_guard(&get_nexus_profiles_root());
    let target_norm = normalize_for_guard(target_path);
    if !target_norm.starts_with(&format!("{profiles_root_norm}\\")) {
        if let Err(msg) = validate_safe_save_location_path(&target_path.to_string_lossy()) {
            return Err(SaveManagerError::IoError(msg));
        }
    }

    let same_vol = if let Some(bp) = backup_path {
        is_same_volume(staging_path, target_path) && is_same_volume(target_path, bp)
    } else {
        is_same_volume(staging_path, target_path)
    };

    let mut backed_up_to: Option<&Path> = None;

    // Step 1: Backup existing target if present
    if target_path.exists() {
        if let Some(bp) = backup_path {
            if bp.exists() {
                remove_path_all_with_retry(bp)?;
            }
            if let Some(bp_parent) = bp.parent() {
                fs::create_dir_all(bp_parent)?;
            }

            if same_vol {
                with_locked_retry(target_path, || fs::rename(target_path, bp))?;
                if let Some(parent) = target_path.parent() {
                    flush_file_or_dir_buffers(parent)?;
                }
            } else {
                copy_dir_recursive(target_path, bp)?;
                flush_file_or_dir_buffers(bp)?;
                remove_path_all_with_retry(target_path)?;
            }
            backed_up_to = Some(bp);
        } else {
            remove_path_all_with_retry(target_path)?;
        }
    }

    // Step 2: Move staging to target (with self-contained rollback from `backed_up_to` on failure)
    let step2_res: SaveResult<()> = (|| {
        if let Some(parent) = target_path.parent() {
            fs::create_dir_all(parent)?;
        }

        if same_vol {
            with_locked_retry(staging_path, || fs::rename(staging_path, target_path))?;
            if let Some(parent) = target_path.parent() {
                flush_file_or_dir_buffers(parent)?;
            }
        } else {
            copy_dir_recursive(staging_path, target_path)?;
            flush_file_or_dir_buffers(target_path)?;
            remove_path_all_with_retry(staging_path)?;
        }
        Ok(())
    })();

    if let Err(err) = step2_res {
        if let Some(bp) = backed_up_to {
            if bp.exists() {
                let _ = remove_path_all_with_retry(target_path);
                if same_vol {
                    let _ = with_locked_retry(bp, || fs::rename(bp, target_path));
                } else if copy_dir_recursive(bp, target_path).is_ok() {
                    let _ = flush_file_or_dir_buffers(target_path);
                }
            }
        }
        return Err(err);
    }

    Ok(())
}

/// Resolves standard Nexus profiles path: `%APPDATA%\Nexus\profiles`
pub fn get_nexus_profiles_root() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("Nexus")
        .join("profiles")
}

fn replace_token_ignore_case(input: &str, token: &str, replacement: &str) -> String {
    let token_lower = token.to_lowercase();
    let input_lower = input.to_lowercase();
    let mut result = String::with_capacity(input.len());
    let mut last_idx = 0;

    for (idx, _) in input_lower.match_indices(&token_lower) {
        if idx >= last_idx {
            result.push_str(&input[last_idx..idx]);
            result.push_str(replacement);
            last_idx = idx + token.len();
        }
    }
    result.push_str(&input[last_idx..]);
    result
}

/// Expands standard environment variables and Windows path tokens (e.g. %USERPROFILE%, %APPDATA%, %LOCALAPPDATA%, %DOCUMENTS%, %SAVEDGAMES%, %PUBLIC%, %PROGRAMDATA%)
pub fn expand_save_path(raw: &str) -> PathBuf {
    let mut expanded = raw.to_string();

    if let Some(home) = dirs::home_dir() {
        let home_str = home.to_string_lossy();
        expanded = replace_token_ignore_case(&expanded, "%USERPROFILE%", &home_str);
        expanded = replace_token_ignore_case(&expanded, "%HOMEPATH%", &home_str);
        let saved_games = home.join("Saved Games");
        expanded = replace_token_ignore_case(&expanded, "%SAVEDGAMES%", &saved_games.to_string_lossy());
    }

    if let Some(appdata) = dirs::config_dir() {
        expanded = replace_token_ignore_case(&expanded, "%APPDATA%", &appdata.to_string_lossy());
    }

    if let Some(local_appdata) = dirs::data_local_dir() {
        expanded = replace_token_ignore_case(&expanded, "%LOCALAPPDATA%", &local_appdata.to_string_lossy());
    }

    if let Some(docs) = dirs::document_dir() {
        expanded = replace_token_ignore_case(&expanded, "%DOCUMENTS%", &docs.to_string_lossy());
    }

    // Windows Public Documents / Users\Public
    if let Ok(pub_dir) = std::env::var("PUBLIC") {
        expanded = replace_token_ignore_case(&expanded, "%PUBLIC%", &pub_dir);
    } else {
        expanded = replace_token_ignore_case(&expanded, "%PUBLIC%", "C:\\Users\\Public");
    }

    // Windows ProgramData
    if let Ok(prog_data) = std::env::var("ProgramData") {
        expanded = replace_token_ignore_case(&expanded, "%PROGRAMDATA%", &prog_data);
    } else {
        expanded = replace_token_ignore_case(&expanded, "%PROGRAMDATA%", "C:\\ProgramData");
    }

    // Windows System Root / WinDir
    if let Ok(windir) = std::env::var("WINDIR") {
        expanded = replace_token_ignore_case(&expanded, "%WINDIR%", &windir);
        expanded = replace_token_ignore_case(&expanded, "%SYSTEMROOT%", &windir);
    } else {
        expanded = replace_token_ignore_case(&expanded, "%WINDIR%", "C:\\Windows");
        expanded = replace_token_ignore_case(&expanded, "%SYSTEMROOT%", "C:\\Windows");
    }

    PathBuf::from(expanded)
}

/// Scans a file or directory path and computes (file_count, total_size_bytes)
/// without hashing full file contents, tracking seen normalized paths to avoid double-counting.
/// Avoids `canonicalize()` which opens file handles to every file and thrashes HDDs on Windows.
pub fn scan_path_file_stats(
    path: &Path,
    seen_paths: &mut HashSet<PathBuf>,
) -> (i64, i64) {
    if !path.exists() {
        return (0, 0);
    }

    #[cfg(windows)]
    let normalize = |p: &Path| PathBuf::from(p.to_string_lossy().to_lowercase());
    #[cfg(not(windows))]
    let normalize = |p: &Path| p.to_path_buf();

    if path.is_file() {
        let norm = normalize(path);
        if seen_paths.insert(norm) {
            if let Ok(meta) = fs::metadata(path) {
                return (1, meta.len() as i64);
            }
            return (1, 0);
        }
        return (0, 0);
    }

    let mut count = 0i64;
    let mut size = 0i64;

    let walker = walkdir::WalkDir::new(path)
        .follow_links(false)
        .into_iter();

    for entry in walker.filter_map(|e| e.ok()) {
        if entry.file_type().is_file() {
            let entry_path = entry.path();
            let norm = normalize(entry_path);
            if seen_paths.insert(norm) {
                count += 1;
                if let Ok(meta) = entry.metadata() {
                    size += meta.len() as i64;
                }
            }
        }
    }

    (count, size)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn test_tree_hash_empty_and_nonexistent() {
        let non_existent = Path::new("non_existent_path_12345");
        let res = calculate_tree_hash(non_existent).unwrap();
        assert_eq!(res.file_count, 0);
        assert_eq!(res.total_size, 0);
        assert_eq!(res.hash, "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    }

    #[test]
    fn test_tree_hash_deterministic() {
        let temp_dir = std::env::temp_dir().join(format!("nexus_test_tree_hash_{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(temp_dir.join("sub")).unwrap();

        let f1_path = temp_dir.join("b_file.txt");
        let mut f1 = File::create(&f1_path).unwrap();
        f1.write_all(b"Hello World").unwrap();

        let f2_path = temp_dir.join("sub").join("a_file.txt");
        let mut f2 = File::create(&f2_path).unwrap();
        f2.write_all(b"Subdir Content").unwrap();

        let res1 = calculate_tree_hash(&temp_dir).unwrap();
        let res2 = calculate_tree_hash(&temp_dir).unwrap();

        assert_eq!(res1.file_count, 2);
        assert_eq!(res1.total_size, 11 + 14);
        assert_eq!(res1.hash, res2.hash);

        let _ = remove_path_all_with_retry(&temp_dir);
    }

    #[test]
    fn test_expand_save_path() {
        let p = expand_save_path("%APPDATA%\\MyGame\\save.dat");
        assert!(!p.to_string_lossy().contains("%APPDATA%"));
    }
}


