use crate::error::{AppError, AppResult};
use serde::Serialize;
use std::path::Path;
use walkdir::WalkDir;

#[derive(Debug, Serialize)]
pub struct ResolvedShortcut {
    pub target_path: Option<String>,
    pub working_dir: Option<String>,
    pub arguments: Option<String>,
}

/// Resolves a `.lnk` shortcut to its real target via the Windows Shell
/// COM APIs (through the `lnks` crate), rather than parsing the binary
/// format by hand — the OS's own resolver handles edge cases (moved
/// targets, environment variables, etc.) that a hand-rolled parser
/// would get wrong.
#[cfg(windows)]
#[tauri::command]
pub fn resolve_shortcut(path: String) -> AppResult<ResolvedShortcut> {
    let shortcut = lnks::Shortcut::load(&path)
        .map_err(|err| AppError::Invalid(format!("could not read shortcut: {err}")))?;

    Ok(ResolvedShortcut {
        target_path: shortcut
            .target_path
            .map(|p| p.to_string_lossy().to_string()),
        working_dir: shortcut
            .working_dir
            .map(|p| p.to_string_lossy().to_string()),
        arguments: shortcut.arguments,
    })
}

#[cfg(not(windows))]
#[tauri::command]
pub fn resolve_shortcut(_path: String) -> AppResult<ResolvedShortcut> {
    Err(AppError::Invalid(
        "shortcut (.lnk) resolution is only supported on Windows".into(),
    ))
}

#[derive(Debug, Serialize)]
pub struct ExecutableCandidate {
    pub path: String,
    pub file_name: String,
    pub size_bytes: u64,
}

/// Executable names that are almost never the actual game — installers,
/// uninstallers, redistributable setups, and engine/crash-handler
/// utilities that happen to ship next to the real game binary. Filtering
/// these out means a folder with exactly one "real" candidate can be
/// auto-selected instead of always prompting the user to choose.
const IGNORED_EXECUTABLE_NAMES: &[&str] = &[
    "unins000.exe",
    "unins001.exe",
    "uninstall.exe",
    "uninst.exe",
    "installer.exe",
    "setup.exe",
    "vcredist.exe",
    "vcredist_x86.exe",
    "vcredist_x64.exe",
    "dxsetup.exe",
    "directx_setup.exe",
    "crashreporter.exe",
    "crashpad_handler.exe",
    "unitycrashhandler64.exe",
    "unitycrashhandler32.exe",
    "eossdk-win64-shipping.exe",
    "eossdk-win32-shipping.exe",
];

/// Shared by `scan_folder_for_executables` (Epic 4's manual folder add)
/// and `commands::scan` (Epic 5's automatic store scan, for stores like
/// EA/Ubisoft whose registry entries give an install folder but not the
/// exe within it). A few levels deep, since many games keep the real
/// binary in a `bin/` or `Binaries/Win64`-style subfolder; sorted
/// largest-first since the main game binary is very often the biggest
/// exe in the tree while launchers/helpers tend to be small.
pub(crate) fn list_executable_candidates(root: &Path) -> Vec<ExecutableCandidate> {
    let mut candidates: Vec<ExecutableCandidate> = WalkDir::new(root)
        .max_depth(4)
        .into_iter()
        .filter_map(|entry| entry.ok())
        .filter(|entry| {
            entry.file_type().is_file()
                && entry
                    .path()
                    .extension()
                    .and_then(|ext| ext.to_str())
                    .map(|ext| {
                        ext.eq_ignore_ascii_case("exe")
                            || ext.eq_ignore_ascii_case("bat")
                            || ext.eq_ignore_ascii_case("cmd")
                    })
                    .unwrap_or(false)
        })
        .filter(|entry| {
            let name = entry.file_name().to_string_lossy().to_lowercase();
            !IGNORED_EXECUTABLE_NAMES.contains(&name.as_str())
        })
        .map(|entry| {
            let size_bytes = entry.metadata().map(|meta| meta.len()).unwrap_or(0);
            ExecutableCandidate {
                path: entry.path().to_string_lossy().to_string(),
                file_name: entry.file_name().to_string_lossy().to_string(),
                size_bytes,
            }
        })
        .collect();

    candidates.sort_by_key(|candidate| std::cmp::Reverse(candidate.size_bytes));
    candidates
}

/// Best single guess at "the" game executable in a folder — used by
/// Epic 5's scanners, which get an install directory from the registry
/// but no exe path, and have no user standing by to pick from a list.
pub(crate) fn find_best_executable(root: &Path) -> Option<String> {
    list_executable_candidates(root)
        .into_iter()
        .next()
        .map(|c| c.path)
}

/// Scans a folder for `.exe` candidates — see `list_executable_candidates`
/// for the matching/sorting rules. The frontend auto-selects when
/// there's exactly one candidate and otherwise shows this list for the
/// user to pick from.
#[tauri::command]
pub fn scan_folder_for_executables(folder_path: String) -> AppResult<Vec<ExecutableCandidate>> {
    let root = Path::new(&folder_path);
    if !root.is_dir() {
        return Err(AppError::Invalid(format!("{folder_path} is not a folder")));
    }

    Ok(list_executable_candidates(root))
}

/// Total size on disk for a file or, recursively, a folder — used to
/// populate `games.install_size_bytes` when a game is added by folder
/// (a single exe's own size isn't a meaningful "install size").
#[tauri::command]
pub fn compute_path_size(path: String) -> AppResult<u64> {
    let root = Path::new(&path);
    if !root.exists() {
        return Err(AppError::Invalid(format!("{path} does not exist")));
    }

    if root.is_file() {
        return Ok(root.metadata().map(|meta| meta.len()).unwrap_or(0));
    }

    let total = WalkDir::new(root)
        .into_iter()
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.file_type().is_file())
        .filter_map(|entry| entry.metadata().ok())
        .map(|meta| meta.len())
        .sum();

    Ok(total)
}
