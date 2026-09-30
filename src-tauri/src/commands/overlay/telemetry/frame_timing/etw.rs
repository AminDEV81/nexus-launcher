//! Real-time ETW consumer that records Present() calls per process.
//!
//! This is the same source PresentMon uses: the `Microsoft-Windows-DXGI`
//! provider (covers D3D10/11/12 swap chains) and `Microsoft-Windows-D3D9`.
//! Starting a real-time session needs administrator rights (the release
//! build is already elevated via its manifest); without them `start()`
//! returns an error and FPS is reported as unavailable instead of as a
//! made-up number.

use std::collections::{HashMap, VecDeque};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

use windows_sys::core::GUID;
use windows_sys::Win32::System::Diagnostics::Etw::{
    CloseTrace, ControlTraceW, EnableTraceEx2, OpenTraceW, ProcessTrace, StartTraceW,
    CONTROLTRACE_HANDLE, EVENT_CONTROL_CODE_ENABLE_PROVIDER, EVENT_RECORD,
    EVENT_TRACE_CONTROL_STOP, EVENT_TRACE_LOGFILEW, EVENT_TRACE_PROPERTIES,
    EVENT_TRACE_REAL_TIME_MODE, PROCESS_TRACE_MODE_EVENT_RECORD, PROCESS_TRACE_MODE_REAL_TIME,
    TRACE_LEVEL_VERBOSE, WNODE_FLAG_TRACED_GUID,
};
use windows_sys::Win32::System::Performance::QueryPerformanceFrequency;

const ERROR_SUCCESS: u32 = 0;
const ERROR_ACCESS_DENIED: u32 = 5;
const ERROR_ALREADY_EXISTS: u32 = 183;
const INVALID_PROCESSTRACE_HANDLE: u64 = u64::MAX;

const SESSION_NAME: &str = "NexusOverlayFrameTiming";

/// Microsoft-Windows-DXGI {CA11C036-0102-4A2D-A6AD-F03CFED5D3C9}
const DXGI_PROVIDER: GUID = GUID {
    data1: 0xCA11C036,
    data2: 0x0102,
    data3: 0x4A2D,
    data4: [0xA6, 0xAD, 0xF0, 0x3C, 0xFE, 0xD5, 0xD3, 0xC9],
};
/// Microsoft-Windows-D3D9 {783ACA0A-790E-4D7F-8451-AA850511C6B9}
const D3D9_PROVIDER: GUID = GUID {
    data1: 0x783ACA0A,
    data2: 0x790E,
    data3: 0x4D7F,
    data4: [0x84, 0x51, 0xAA, 0x85, 0x05, 0x11, 0xC6, 0xB9],
};

const DXGI_PRESENT_START: u16 = 42;
const D3D9_PRESENT_START: u16 = 1;

/// Per-process cap so a runaway process can't grow memory without bound.
const MAX_EVENTS_PER_PID: usize = 4096;
/// Drop processes that have been silent for this long.
const STALE_AFTER: Duration = Duration::from_secs(10);

struct PidEvents {
    /// Present timestamps in QPC ticks, oldest first.
    times: VecDeque<i64>,
    last_seen: Instant,
}

struct Shared {
    pids: Mutex<HashMap<u32, PidEvents>>,
    /// QPC ticks per second.
    qpc_freq: i64,
}

static SHARED: OnceLock<Arc<Shared>> = OnceLock::new();

pub struct EtwPresentMonitor {
    shared: Arc<Shared>,
    running: Arc<AtomicBool>,
    session: Arc<Mutex<u64>>,
}

/// One Present() that happened since the last drain.
pub struct PresentEvent {
    #[allow(dead_code)]
    pub pid: u32,
    /// Seconds since an arbitrary fixed origin (monotonic, QPC based).
    pub time_secs: f64,
}

#[repr(C)]
struct SessionProps {
    props: EVENT_TRACE_PROPERTIES,
    name: [u16; 64],
}

fn session_props() -> Box<SessionProps> {
    let mut boxed: Box<SessionProps> = Box::new(unsafe { std::mem::zeroed() });
    boxed.props.Wnode.BufferSize = std::mem::size_of::<SessionProps>() as u32;
    boxed.props.Wnode.Flags = WNODE_FLAG_TRACED_GUID;
    // 1 = QPC timestamps (cheap, monotonic, high resolution).
    boxed.props.Wnode.ClientContext = 1;
    boxed.props.LogFileMode = EVENT_TRACE_REAL_TIME_MODE;
    boxed.props.FlushTimer = 1;
    boxed.props.LoggerNameOffset = std::mem::offset_of!(SessionProps, name) as u32;
    boxed
}

/// `EVENT_TRACE_PROPERTIES` is the first field of the `repr(C)` wrapper.
fn props_ptr(p: &mut SessionProps) -> *mut EVENT_TRACE_PROPERTIES {
    p as *mut SessionProps as *mut EVENT_TRACE_PROPERTIES
}

fn session_name_wide() -> Vec<u16> {
    SESSION_NAME.encode_utf16().chain(std::iter::once(0)).collect()
}

unsafe extern "system" fn on_event(record: *mut EVENT_RECORD) {
    if record.is_null() {
        return;
    }
    let rec = &*record;
    let id = rec.EventHeader.EventDescriptor.Id;
    let provider = rec.EventHeader.ProviderId;

    let is_present = (id == DXGI_PRESENT_START && guid_eq(&provider, &DXGI_PROVIDER))
        || (id == D3D9_PRESENT_START && guid_eq(&provider, &D3D9_PROVIDER));
    if !is_present {
        return;
    }

    let Some(shared) = SHARED.get() else {
        return;
    };
    let pid = rec.EventHeader.ProcessId;
    let ts = rec.EventHeader.TimeStamp;

    if let Ok(mut map) = shared.pids.lock() {
        let entry = map.entry(pid).or_insert_with(|| PidEvents {
            times: VecDeque::new(),
            last_seen: Instant::now(),
        });
        entry.last_seen = Instant::now();
        if entry.times.len() >= MAX_EVENTS_PER_PID {
            entry.times.pop_front();
        }
        entry.times.push_back(ts);
    }
}

fn guid_eq(a: &GUID, b: &GUID) -> bool {
    a.data1 == b.data1 && a.data2 == b.data2 && a.data3 == b.data3 && a.data4 == b.data4
}

impl EtwPresentMonitor {
    /// Starts the ETW session and its consumer thread.
    pub fn start() -> Result<Self, String> {
        let mut freq: i64 = 0;
        unsafe { QueryPerformanceFrequency(&mut freq) };
        if freq <= 0 {
            return Err("QueryPerformanceFrequency failed".into());
        }

        let shared = SHARED
            .get_or_init(|| {
                Arc::new(Shared {
                    pids: Mutex::new(HashMap::new()),
                    qpc_freq: freq,
                })
            })
            .clone();

        let name = session_name_wide();
        let mut props = session_props();
        let mut handle = CONTROLTRACE_HANDLE { Value: 0 };

        let mut status = unsafe { StartTraceW(&mut handle, name.as_ptr(), props_ptr(&mut props)) };
        if status == ERROR_ALREADY_EXISTS {
            // A previous run crashed without stopping its session: stop it and retry.
            let mut stale = session_props();
            unsafe {
                ControlTraceW(
                    CONTROLTRACE_HANDLE { Value: 0 },
                    name.as_ptr(),
                    &mut *stale as *mut SessionProps as *mut EVENT_TRACE_PROPERTIES,
                    EVENT_TRACE_CONTROL_STOP,
                );
            }
            props = session_props();
            status = unsafe { StartTraceW(&mut handle, name.as_ptr(), props_ptr(&mut props)) };
        }
        if status == ERROR_ACCESS_DENIED {
            return Err("Administrator rights are required to measure FPS".into());
        }
        if status != ERROR_SUCCESS {
            return Err(format!("StartTrace failed ({status})"));
        }

        for provider in [&DXGI_PROVIDER, &D3D9_PROVIDER] {
            let status = unsafe {
                EnableTraceEx2(
                    handle,
                    provider,
                    EVENT_CONTROL_CODE_ENABLE_PROVIDER,
                    TRACE_LEVEL_VERBOSE as u8,
                    u64::MAX,
                    0,
                    0,
                    std::ptr::null(),
                )
            };
            if status != ERROR_SUCCESS {
                log::warn!("[Overlay] EnableTraceEx2 failed ({status})");
            }
        }

        let running = Arc::new(AtomicBool::new(true));
        let session = Arc::new(Mutex::new(handle.Value));

        // Consumer thread: ProcessTrace blocks until the session is stopped.
        std::thread::spawn(move || unsafe {
            let mut logger_name = session_name_wide();
            let mut logfile: EVENT_TRACE_LOGFILEW = std::mem::zeroed();
            logfile.LoggerName = logger_name.as_mut_ptr();
            logfile.Anonymous1.ProcessTraceMode =
                PROCESS_TRACE_MODE_REAL_TIME | PROCESS_TRACE_MODE_EVENT_RECORD;
            logfile.Anonymous2.EventRecordCallback = Some(on_event);

            let trace = OpenTraceW(&mut logfile);
            if trace.Value == INVALID_PROCESSTRACE_HANDLE {
                log::warn!("[Overlay] OpenTrace failed");
                return;
            }
            ProcessTrace(&trace, 1, std::ptr::null(), std::ptr::null());
            CloseTrace(trace);
        });

        Ok(Self {
            shared,
            running,
            session,
        })
    }

    /// Removes and returns the Present events recorded for `pid`, oldest first.
    /// Also prunes processes that went silent.
    pub fn drain(&self, pid: u32) -> Vec<PresentEvent> {
        let freq = self.shared.qpc_freq as f64;
        let Ok(mut map) = self.shared.pids.lock() else {
            return Vec::new();
        };
        map.retain(|p, e| *p == pid || e.last_seen.elapsed() < STALE_AFTER);
        match map.get_mut(&pid) {
            Some(entry) => entry
                .times
                .drain(..)
                .map(|t| PresentEvent {
                    pid,
                    time_secs: t as f64 / freq,
                })
                .collect(),
            None => Vec::new(),
        }
    }

    /// Converts an event time to "seconds since now" (negative = in the past),
    /// using the current QPC reading.
    pub fn now_secs(&self) -> f64 {
        let mut now: i64 = 0;
        unsafe {
            windows_sys::Win32::System::Performance::QueryPerformanceCounter(&mut now);
        }
        now as f64 / self.shared.qpc_freq as f64
    }

    pub fn stop(&self) {
        if !self.running.swap(false, Ordering::SeqCst) {
            return;
        }
        let name = session_name_wide();
        let mut props = session_props();
        if let Ok(handle) = self.session.lock() {
            unsafe {
                ControlTraceW(
                    CONTROLTRACE_HANDLE { Value: *handle },
                    name.as_ptr(),
                    &mut *props as *mut SessionProps as *mut EVENT_TRACE_PROPERTIES,
                    EVENT_TRACE_CONTROL_STOP,
                );
            }
        }
    }
}

impl Drop for EtwPresentMonitor {
    fn drop(&mut self) {
        self.stop();
    }
}
