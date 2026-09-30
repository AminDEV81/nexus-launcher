//! Minimal PDH (Performance Data Helper) wrapper. Used for disk throughput
//! and ACPI thermal zones — both are plain performance counters that need
//! no kernel driver.

use windows_sys::Win32::System::Performance::{
    PdhAddEnglishCounterW, PdhCloseQuery, PdhCollectQueryData, PdhGetFormattedCounterArrayW,
    PdhGetFormattedCounterValue, PdhOpenQueryW, PDH_FMT_COUNTERVALUE,
    PDH_FMT_COUNTERVALUE_ITEM_W,
};

const PDH_FMT_DOUBLE: u32 = 0x0000_0200;
const PDH_FMT_NOCAP100: u32 = 0x0000_8000;
const PDH_MORE_DATA: u32 = 0x8000_07D2;

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

fn valid(status: u32) -> bool {
    // PDH_CSTATUS_VALID_DATA (0) or PDH_CSTATUS_NEW_DATA (1)
    status == 0 || status == 1
}

#[derive(Clone, Copy)]
pub struct PdhCounter(*mut std::ffi::c_void);

unsafe impl Send for PdhCounter {}

pub struct PdhQuery {
    query: *mut std::ffi::c_void,
}

// The handle is an opaque integer and all access goes through `&mut`/`&` on
// a single owner.
unsafe impl Send for PdhQuery {}

impl PdhQuery {
    pub fn new() -> Option<Self> {
        let mut query: *mut std::ffi::c_void = std::ptr::null_mut();
        let status = unsafe { PdhOpenQueryW(std::ptr::null(), 0, &mut query) };
        if status != 0 || query.is_null() {
            return None;
        }
        Some(Self { query })
    }

    /// Adds a counter by its locale-independent English path, e.g.
    /// `\PhysicalDisk(_Total)\Disk Read Bytes/sec`. Wildcards are allowed.
    pub fn add(&self, path: &str) -> Option<PdhCounter> {
        let path = wide(path);
        let mut counter: *mut std::ffi::c_void = std::ptr::null_mut();
        let status = unsafe { PdhAddEnglishCounterW(self.query, path.as_ptr(), 0, &mut counter) };
        if status != 0 || counter.is_null() {
            return None;
        }
        Some(PdhCounter(counter))
    }

    pub fn collect(&self) -> bool {
        unsafe { PdhCollectQueryData(self.query) == 0 }
    }
}

impl Drop for PdhQuery {
    fn drop(&mut self) {
        unsafe {
            PdhCloseQuery(self.query);
        }
    }
}

impl PdhCounter {
    /// Formatted value of a single-instance counter. Rate counters return
    /// `None` until a second `collect()` has happened.
    pub fn value(&self) -> Option<f64> {
        unsafe {
            let mut value: PDH_FMT_COUNTERVALUE = std::mem::zeroed();
            let status = PdhGetFormattedCounterValue(
                self.0,
                PDH_FMT_DOUBLE | PDH_FMT_NOCAP100,
                std::ptr::null_mut(),
                &mut value,
            );
            if status != 0 || !valid(value.CStatus) {
                return None;
            }
            Some(value.Anonymous.doubleValue)
        }
    }

    /// All instances of a wildcard counter as `(instance name, value)`.
    pub fn values(&self) -> Vec<(String, f64)> {
        unsafe {
            let mut size: u32 = 0;
            let mut count: u32 = 0;
            let status = PdhGetFormattedCounterArrayW(
                self.0,
                PDH_FMT_DOUBLE | PDH_FMT_NOCAP100,
                &mut size,
                &mut count,
                std::ptr::null_mut(),
            );
            if status != PDH_MORE_DATA || size == 0 {
                return Vec::new();
            }

            // u64 backing store keeps the buffer 8-byte aligned for the item structs.
            let mut buffer = vec![0u64; (size as usize).div_ceil(8)];
            let items = buffer.as_mut_ptr() as *mut PDH_FMT_COUNTERVALUE_ITEM_W;
            let status = PdhGetFormattedCounterArrayW(
                self.0,
                PDH_FMT_DOUBLE | PDH_FMT_NOCAP100,
                &mut size,
                &mut count,
                items,
            );
            if status != 0 {
                return Vec::new();
            }

            let mut out = Vec::with_capacity(count as usize);
            for i in 0..count as usize {
                let item = &*items.add(i);
                if !valid(item.FmtValue.CStatus) {
                    continue;
                }
                let mut len = 0usize;
                while *item.szName.add(len) != 0 {
                    len += 1;
                }
                let name = String::from_utf16_lossy(std::slice::from_raw_parts(item.szName, len));
                out.push((name, item.FmtValue.Anonymous.doubleValue));
            }
            out
        }
    }
}
