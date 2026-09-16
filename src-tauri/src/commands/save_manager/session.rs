use crate::commands::save_manager::error::SaveManagerError;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex as StdMutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActiveGameSession {
    pub session_id: String,
    pub game_id: String,
    pub profile_id: String,
    pub process_id: u32,
    pub started_at: String,
    pub save_transaction_id: String,
}

pub struct SessionManager {
    sessions: StdMutex<HashMap<String, ActiveGameSession>>,
}

impl Default for SessionManager {
    fn default() -> Self {
        Self::new()
    }
}

impl SessionManager {
    pub fn new() -> Self {
        Self {
            sessions: StdMutex::new(HashMap::new()),
        }
    }

    pub fn has_any_running_session(&self) -> bool {
        let guard = self.sessions.lock().expect("session manager mutex poisoned");
        !guard.is_empty()
    }

    pub fn has_session_for_profile(&self, profile_id: &str) -> bool {
        let guard = self.sessions.lock().expect("session manager mutex poisoned");
        guard.values().any(|s| s.profile_id == profile_id)
    }

    pub fn get_session_by_game(&self, game_id: &str) -> Option<ActiveGameSession> {
        let guard = self.sessions.lock().expect("session manager mutex poisoned");
        guard.get(game_id).cloned()
    }

    pub fn register_session(&self, session: ActiveGameSession) -> Result<(), SaveManagerError> {
        let mut guard = self.sessions.lock().expect("session manager mutex poisoned");
        if guard.contains_key(&session.game_id) {
            return Err(SaveManagerError::GameSessionActive(format!(
                "Game {} already has an active session",
                session.game_id
            )));
        }
        guard.insert(session.game_id.clone(), session);
        Ok(())
    }

    pub fn remove_session(&self, game_id: &str) -> Option<ActiveGameSession> {
        let mut guard = self.sessions.lock().expect("session manager mutex poisoned");
        guard.remove(game_id)
    }

    #[allow(dead_code)]
    pub fn list_active_sessions(&self) -> Vec<ActiveGameSession> {
        let guard = self.sessions.lock().expect("session manager mutex poisoned");
        guard.values().cloned().collect()
    }
}

/// Windows Job Object helper for process-tree tracking (Section 7).
/// Assigns the root process so all children are tracked in the same job.
#[cfg(windows)]
pub struct ProcessJobTracker {
    job_handle: windows_sys::Win32::Foundation::HANDLE,
}

#[cfg(windows)]
unsafe impl Send for ProcessJobTracker {}
#[cfg(windows)]
unsafe impl Sync for ProcessJobTracker {}

#[cfg(windows)]
impl ProcessJobTracker {
    pub fn new() -> Option<Self> {
        use windows_sys::Win32::System::JobObjects::CreateJobObjectW;
        let handle = unsafe { CreateJobObjectW(std::ptr::null(), std::ptr::null()) };
        if handle.is_null() {
            None
        } else {
            Some(Self { job_handle: handle })
        }
    }

    pub fn assign_process(&self, pid: u32) -> bool {
        use windows_sys::Win32::System::JobObjects::AssignProcessToJobObject;
        use windows_sys::Win32::System::Threading::{OpenProcess, PROCESS_SET_QUOTA, PROCESS_TERMINATE};

        let proc_handle = unsafe {
            OpenProcess(PROCESS_SET_QUOTA | PROCESS_TERMINATE, 0, pid)
        };
        if proc_handle.is_null() {
            return false;
        }

        let assigned = unsafe { AssignProcessToJobObject(self.job_handle, proc_handle) != 0 };
        unsafe {
            windows_sys::Win32::Foundation::CloseHandle(proc_handle);
        }
        assigned
    }

    pub fn is_active(&self) -> bool {
        use windows_sys::Win32::System::JobObjects::{
            QueryInformationJobObject, JobObjectBasicAccountingInformation,
            JOBOBJECT_BASIC_ACCOUNTING_INFORMATION,
        };
        let mut info: JOBOBJECT_BASIC_ACCOUNTING_INFORMATION = unsafe { std::mem::zeroed() };
        let cb = std::mem::size_of::<JOBOBJECT_BASIC_ACCOUNTING_INFORMATION>() as u32;
        let success = unsafe {
            QueryInformationJobObject(
                self.job_handle,
                JobObjectBasicAccountingInformation,
                &mut info as *mut _ as *mut _,
                cb,
                std::ptr::null_mut(),
            )
        };
        if success != 0 {
            info.ActiveProcesses > 0
        } else {
            false
        }
    }
}

#[cfg(windows)]
impl Drop for ProcessJobTracker {
    fn drop(&mut self) {
        if !self.job_handle.is_null() {
            unsafe {
                windows_sys::Win32::Foundation::CloseHandle(self.job_handle);
            }
        }
    }
}

#[cfg(not(windows))]
pub struct ProcessJobTracker;

#[cfg(not(windows))]
impl ProcessJobTracker {
    pub fn new() -> Option<Self> {
        Some(Self)
    }
    pub fn assign_process(&self, _pid: u32) -> bool {
        true
    }
    pub fn is_active(&self) -> bool {
        false
    }
}
