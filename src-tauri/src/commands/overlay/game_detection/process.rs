#[derive(Debug, Clone)]
pub struct ForegroundProcess {
    pub pid: u32,
    /// Native handle of the foreground game window, used for window-specific
    /// DWM frame timing.
    pub window_handle: isize,
    pub exe_path: String,
    pub exe_name: String,
    /// True when the window covers its whole monitor (exclusive or
    /// borderless fullscreen) — the strongest generic "this is a game"
    /// signal we have for titles that are not in the library.
    pub is_fullscreen: bool,
}

pub struct ProcessScanner;

impl ProcessScanner {
    #[cfg(target_os = "windows")]
    pub fn get_foreground_process() -> Option<ForegroundProcess> {
        use windows_sys::Win32::Foundation::{CloseHandle, HWND};
        use windows_sys::Win32::System::Threading::{
            OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION,
        };
        use windows_sys::Win32::UI::WindowsAndMessaging::{
            GetForegroundWindow, GetWindowThreadProcessId,
        };

        unsafe {
            let hwnd: HWND = GetForegroundWindow();
            if hwnd.is_null() {
                return None;
            }

            let mut pid: u32 = 0;
            GetWindowThreadProcessId(hwnd, &mut pid);
            if pid == 0 {
                return None;
            }

            let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
            if handle.is_null() {
                return None;
            }

            let mut buffer = [0u16; 1024];
            let mut size: u32 = buffer.len() as u32;
            let success = QueryFullProcessImageNameW(handle, 0, buffer.as_mut_ptr(), &mut size);
            CloseHandle(handle);

            if success == 0 || size == 0 {
                return None;
            }

            let full_path = String::from_utf16_lossy(&buffer[..size as usize]);
            let exe_name = std::path::Path::new(&full_path)
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();

            // Filter out system and launcher processes
            let lower = exe_name.to_lowercase();
            let ignored = [
                "explorer.exe",
                "taskmgr.exe",
                "searchhost.exe",
                "shellexperiencehost.exe",
                "startmenuexperiencehost.exe",
                "applicationframehost.exe",
                "systemsettings.exe",
                "app.exe",
                "nexus.exe",
                "steam.exe",
                "steamservice.exe",
                "steamwebhelper.exe",
                "epicgameslauncher.exe",
                "epicwebhelper.exe",
                "galaxyclient.exe",
                "battle.net.exe",
                "ubisoftconnect.exe",
                "origin.exe",
                "eadesktop.exe",
                "riotclientservices.exe",
                "cmd.exe",
                "powershell.exe",
                "pwsh.exe",
                "conhost.exe",
                "windowsterminal.exe",
                "devenv.exe",
                "code.exe",
                "chrome.exe",
                "firefox.exe",
                "msedge.exe",
                "edge.exe",
                "brave.exe",
                "opera.exe",
                "opera_gx.exe",
                "discord.exe",
                "spotify.exe",
                "slack.exe",
                "telegram.exe",
                "whatsapp.exe",
                "notepad.exe",
                "notepad++.exe",
            ];

            if ignored.contains(&lower.as_str()) {
                return None;
            }

            Some(ForegroundProcess {
                pid,
                window_handle: hwnd as isize,
                exe_path: full_path,
                exe_name,
                is_fullscreen: window_covers_monitor(hwnd),
            })
        }
    }

    /// Whether a process id still refers to a running process.
    #[cfg(target_os = "windows")]
    pub fn is_pid_alive(pid: u32) -> bool {
        unsafe {
            use windows_sys::Win32::Foundation::CloseHandle;
            use windows_sys::Win32::System::Threading::{
                GetExitCodeProcess, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION,
            };
            let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
            if handle.is_null() {
                return false;
            }
            let mut exit_code: u32 = 0;
            let success = GetExitCodeProcess(handle, &mut exit_code);
            CloseHandle(handle);
            success != 0 && exit_code == 259 // STILL_ACTIVE
        }
    }

    #[cfg(not(target_os = "windows"))]
    pub fn is_pid_alive(_pid: u32) -> bool {
        false
    }

    #[cfg(not(target_os = "windows"))]
    pub fn get_foreground_process() -> Option<ForegroundProcess> {
        None
    }
}

#[cfg(target_os = "windows")]
unsafe fn window_covers_monitor(hwnd: windows_sys::Win32::Foundation::HWND) -> bool {
    use windows_sys::Win32::Foundation::RECT;
    use windows_sys::Win32::Graphics::Gdi::{
        GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::GetWindowRect;

    let mut rect: RECT = std::mem::zeroed();
    if GetWindowRect(hwnd, &mut rect) == 0 {
        return false;
    }
    let monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
    if monitor.is_null() {
        return false;
    }
    let mut info: MONITORINFO = std::mem::zeroed();
    info.cbSize = std::mem::size_of::<MONITORINFO>() as u32;
    if GetMonitorInfoW(monitor, &mut info) == 0 {
        return false;
    }
    let m = info.rcMonitor;
    rect.left <= m.left && rect.top <= m.top && rect.right >= m.right && rect.bottom >= m.bottom
}
