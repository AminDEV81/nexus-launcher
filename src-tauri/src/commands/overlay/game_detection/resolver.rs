use super::process::ForegroundProcess;
use std::time::Instant;

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct ActiveGameInfo {
    pub game_id: Option<String>,
    pub title: String,
    pub pid: u32,
    pub session_duration_secs: u64,
}

pub struct GameResolver {
    active_pid: Option<u32>,
    active_title: Option<String>,
    active_game_id: Option<String>,
    session_start: Option<Instant>,
}

fn normalize_path(path: &str) -> String {
    path.replace('/', "\\").to_lowercase()
}

impl GameResolver {
    /// Matches a running process against the library by executable path or
    /// install folder (on a directory boundary, so `C:\Games\Foo` does not
    /// match `C:\Games\FooBar\x.exe`).
    pub fn match_known_game(
        known_games: &[(String, String, Option<String>, Option<String>)],
        proc: &ForegroundProcess,
    ) -> Option<(String, String)> {
        let proc_exe = normalize_path(&proc.exe_path);
        for (gid, title, exe_opt, install_opt) in known_games {
            if let Some(exe) = exe_opt {
                if !exe.is_empty() && normalize_path(exe) == proc_exe {
                    return Some((gid.clone(), title.clone()));
                }
            }
            if let Some(install) = install_opt {
                let install = normalize_path(install);
                let install = install.trim_end_matches('\\');
                if !install.is_empty()
                    && proc_exe.starts_with(install)
                    && proc_exe[install.len()..].starts_with('\\')
                {
                    return Some((gid.clone(), title.clone()));
                }
            }
        }
        None
    }

    /// A foreground process counts as a game when it is in the library or
    /// is running fullscreen. Everything else (Word, a file manager…) must
    /// never trigger the HUD or be reported as a game.
    pub fn is_game_like(
        known_games: &[(String, String, Option<String>, Option<String>)],
        proc: &ForegroundProcess,
    ) -> bool {
        proc.is_fullscreen || Self::match_known_game(known_games, proc).is_some()
    }

    pub fn new() -> Self {
        Self {
            active_pid: None,
            active_title: None,
            active_game_id: None,
            session_start: None,
        }
    }

    pub fn resolve(
        &mut self,
        known_games: &[(String, String, Option<String>, Option<String>)],
        process: Option<&ForegroundProcess>,
    ) -> Option<ActiveGameInfo> {
        let proc = match process {
            Some(p) => p,
            None => {
                return None;
            }
        };

        // If same game process continues running
        if self.active_pid == Some(proc.pid) {
            let session_duration_secs = self
                .session_start
                .map(|t| t.elapsed().as_secs())
                .unwrap_or(0);
            return Some(ActiveGameInfo {
                game_id: self.active_game_id.clone(),
                title: self
                    .active_title
                    .clone()
                    .unwrap_or_else(|| proc.exe_name.clone()),
                pid: proc.pid,
                session_duration_secs,
            });
        }

        // New game detected! Try matching in Nexus database
        let (matched_id, matched_title) = match Self::match_known_game(known_games, proc) {
            Some((id, title)) => (Some(id), Some(title)),
            None => (None, None),
        };

        let title = matched_title.unwrap_or_else(|| {
            // Prettify executable name (e.g. "witcher3.exe" -> "Witcher 3")
            let base = proc.exe_name.trim_end_matches(".exe");
            base.replace(['_', '-'], " ")
        });

        self.active_pid = Some(proc.pid);
        self.active_title = Some(title.clone());
        self.active_game_id = matched_id.clone();
        self.session_start = Some(Instant::now());

        Some(ActiveGameInfo {
            game_id: matched_id,
            title,
            pid: proc.pid,
            session_duration_secs: 0,
        })
    }
}

impl Default for GameResolver {
    fn default() -> Self {
        Self::new()
    }
}
