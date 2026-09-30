#![allow(clippy::manual_c_str_literals)]

#[derive(Debug, Clone, Default)]
pub struct GpuMetrics {
    pub name: Option<String>,
    pub usage: Option<f32>,
    pub vram_used_bytes: Option<u64>,
    pub vram_total_bytes: Option<u64>,
    pub temp_c: Option<f32>,
    /// Hotspot / junction temperature. Exposed by AMD (ADL PMLog); NVIDIA
    /// does not publish it through NVML, so it stays `None` there.
    pub hotspot_c: Option<f32>,
    /// VRAM (memory junction) temperature.
    pub memory_temp_c: Option<f32>,
    pub clock_mhz: Option<u32>,
    pub fan_percent: Option<f32>,
    pub power_w: Option<f32>,
}

#[repr(C)]
#[derive(Default, Debug, Clone, Copy)]
struct AdlSingleSensorData {
    supported: i32,
    value: i32,
}

#[repr(C)]
struct AdlPmLogDataOutput {
    ul_size: i32,
    sensors: [AdlSingleSensorData; 256],
}

#[derive(Default)]
pub struct GpuTelemetryProvider {
    primary_name: Option<String>,
    cached_vram_total: Option<u64>,
    has_nvml: bool,
    nvml_device: usize,
    has_adl: bool,
    adl_context: usize,
    adl_adapter_index: i32,
    pdh_vram_query: usize,
    pdh_vram_counter: usize,
}

impl GpuTelemetryProvider {
    pub fn new() -> Self {
        let mut provider = Self::default();
        provider.init();
        provider
    }

    fn init(&mut self) {
        #[cfg(target_os = "windows")]
        {
            // 1. Probe GPU Name and Total VRAM from Windows Registry
            // Select the dedicated GPU with the highest VRAM.
            use winreg::enums::HKEY_LOCAL_MACHINE;
            use winreg::RegKey;

            let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
            let class_path =
                r"SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}";
            if let Ok(class_key) = hklm.open_subkey(class_path) {
                let mut best_name: Option<String> = None;
                let mut best_vram: u64 = 0;

                for subkey_name in class_key.enum_keys().filter_map(|k| k.ok()) {
                    if subkey_name.starts_with("Properties") || subkey_name.starts_with("Configuration") {
                        continue;
                    }
                    if let Ok(adapter_key) = class_key.open_subkey(&subkey_name) {
                        if let Ok(desc) = adapter_key.get_value::<String, _>("DriverDesc") {
                            let lower = desc.to_lowercase();
                            if !lower.contains("remote") && !lower.contains("indirect") {
                                let vram: u64 = adapter_key
                                    .get_value::<u64, _>("HardwareInformation.qwMemorySize")
                                    .ok()
                                    .or_else(|| {
                                        adapter_key
                                            .get_value::<u32, _>("HardwareInformation.MemorySize")
                                            .ok()
                                            .map(|v| v as u64)
                                    })
                                    .unwrap_or(0);

                                if vram >= best_vram {
                                    best_vram = vram;
                                    best_name = Some(desc);
                                }
                            }
                        }
                    }
                }

                if let Some(name) = best_name {
                    self.primary_name = Some(name);
                    if best_vram > 0 {
                        self.cached_vram_total = Some(best_vram);
                    }
                }
            }

            // 2. Probe NVML (NVIDIA GeForce/RTX)
            self.init_nvml();

            // 3. Probe AMD ADL (Radeon RX series / RDNA)
            self.init_adl();

            // 4. Probe Universal Windows PDH for dedicated VRAM
            self.init_pdh_vram();
        }
    }

    #[cfg(target_os = "windows")]
    fn init_nvml(&mut self) {
        unsafe {
            use windows_sys::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryA};
            let nvml_lib = LoadLibraryA(b"nvml.dll\0".as_ptr());
            if !nvml_lib.is_null() {
                let init_fn = GetProcAddress(nvml_lib, b"nvmlInit_v2\0".as_ptr())
                    .or_else(|| GetProcAddress(nvml_lib, b"nvmlInit\0".as_ptr()));
                if let Some(func_ptr) = init_fn {
                    let func: unsafe extern "C" fn() -> i32 = std::mem::transmute(func_ptr);
                    if func() == 0 {
                        self.has_nvml = true;
                    }
                }
            }
        }
    }

    #[cfg(target_os = "windows")]
    fn init_adl(&mut self) {
        unsafe {
            use windows_sys::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryA};
            use windows_sys::Win32::System::Memory::{GetProcessHeap, HeapAlloc};

            unsafe extern "system" fn adl_alloc(size: i32) -> *mut std::ffi::c_void {
                HeapAlloc(GetProcessHeap(), 0, size as usize)
            }

            let mut adl_lib = LoadLibraryA(b"atiadlxx.dll\0".as_ptr());
            if adl_lib.is_null() {
                adl_lib = LoadLibraryA(b"atiadlxy.dll\0".as_ptr());
            }
            if adl_lib.is_null() {
                return;
            }

            let create_fn = GetProcAddress(adl_lib, b"ADL2_Main_Control_Create\0".as_ptr());
            let pmlog_fn = GetProcAddress(adl_lib, b"ADL2_New_QueryPMLogData_Get\0".as_ptr());

            if let (Some(c_ptr), Some(p_ptr)) = (create_fn, pmlog_fn) {
                type FnCreate = unsafe extern "system" fn(
                    unsafe extern "system" fn(i32) -> *mut std::ffi::c_void,
                    i32,
                    *mut *mut std::ffi::c_void,
                ) -> i32;
                type FnPMLog = unsafe extern "system" fn(
                    *mut std::ffi::c_void,
                    i32,
                    *mut AdlPmLogDataOutput,
                ) -> i32;

                let create: FnCreate = std::mem::transmute(c_ptr);
                let query_pmlog: FnPMLog = std::mem::transmute(p_ptr);

                let mut context: *mut std::ffi::c_void = std::ptr::null_mut();
                if create(adl_alloc, 1, &mut context) == 0 && !context.is_null() {
                    let mut test_out = AdlPmLogDataOutput {
                        ul_size: std::mem::size_of::<AdlPmLogDataOutput>() as i32,
                        sensors: [AdlSingleSensorData::default(); 256],
                    };

                    // Check adapter indices 0..4 for the primary GPU
                    for idx in 0..4 {
                        if query_pmlog(context, idx, &mut test_out) == 0 {
                            self.has_adl = true;
                            self.adl_context = context as usize;
                            self.adl_adapter_index = idx;
                            break;
                        }
                    }

                    if !self.has_adl {
                        // Destroy context if no adapter returned valid PMLog data
                        if let Some(dest_ptr) = GetProcAddress(adl_lib, b"ADL2_Main_Control_Destroy\0".as_ptr()) {
                            let destroy: unsafe extern "system" fn(*mut std::ffi::c_void) -> i32 =
                                std::mem::transmute(dest_ptr);
                            destroy(context);
                        }
                    }
                }
            }
        }
    }

    #[cfg(target_os = "windows")]
    fn init_pdh_vram(&mut self) {
        unsafe {
            use windows_sys::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryA};

            let pdh = LoadLibraryA(b"pdh.dll\0".as_ptr());
            if pdh.is_null() {
                return;
            }

            let open_query_fn = GetProcAddress(pdh, b"PdhOpenQueryW\0".as_ptr());
            let add_eng_counter_fn = GetProcAddress(pdh, b"PdhAddEnglishCounterW\0".as_ptr());

            if let (Some(oq_ptr), Some(aec_ptr)) = (open_query_fn, add_eng_counter_fn) {
                let open_query: unsafe extern "system" fn(*const u16, usize, *mut usize) -> u32 =
                    std::mem::transmute(oq_ptr);
                let add_counter: unsafe extern "system" fn(usize, *const u16, usize, *mut usize) -> u32 =
                    std::mem::transmute(aec_ptr);

                let mut query: usize = 0;
                if open_query(std::ptr::null(), 0, &mut query) == 0 && query != 0 {
                    let path: Vec<u16> = r"\GPU Local Adapter Memory(*)\Local Usage"
                        .encode_utf16()
                        .chain(std::iter::once(0))
                        .collect();
                    let mut counter: usize = 0;
                    if add_counter(query, path.as_ptr(), 0, &mut counter) == 0 && counter != 0 {
                        self.pdh_vram_query = query;
                        self.pdh_vram_counter = counter;
                    }
                }
            }
        }
    }

    #[cfg(target_os = "windows")]
    fn poll_pdh_vram(&self) -> Option<u64> {
        if self.pdh_vram_query == 0 || self.pdh_vram_counter == 0 {
            return None;
        }

        unsafe {
            use windows_sys::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryA};

            let pdh = LoadLibraryA(b"pdh.dll\0".as_ptr());
            if pdh.is_null() {
                return None;
            }

            let collect_fn = GetProcAddress(pdh, b"PdhCollectQueryData\0".as_ptr());
            let get_array_fn = GetProcAddress(pdh, b"PdhGetFormattedCounterArrayW\0".as_ptr());

            if let (Some(col_ptr), Some(ga_ptr)) = (collect_fn, get_array_fn) {
                let collect: unsafe extern "system" fn(usize) -> u32 = std::mem::transmute(col_ptr);
                if collect(self.pdh_vram_query) != 0 {
                    return None;
                }

                #[repr(C)]
                struct PdhFmtCounterValueItem {
                    _sz_name: *mut u16,
                    _fmt_val_status: u32,
                    fmt_val_large: i64,
                }

                let get_array: unsafe extern "system" fn(
                    usize,
                    u32,
                    *mut u32,
                    *mut u32,
                    *mut PdhFmtCounterValueItem,
                ) -> u32 = std::mem::transmute(ga_ptr);

                let mut buf_size = 0u32;
                let mut item_count = 0u32;
                // PDH_FMT_LARGE = 0x00000400
                get_array(self.pdh_vram_counter, 0x00000400, &mut buf_size, &mut item_count, std::ptr::null_mut());

                if buf_size > 0 {
                    let mut buffer: Vec<u8> = vec![0; buf_size as usize];
                    if get_array(
                        self.pdh_vram_counter,
                        0x00000400,
                        &mut buf_size,
                        &mut item_count,
                        buffer.as_mut_ptr() as *mut PdhFmtCounterValueItem,
                    ) == 0 && item_count > 0 {
                        let items = std::slice::from_raw_parts(
                            buffer.as_ptr() as *const PdhFmtCounterValueItem,
                            item_count as usize,
                        );

                        // Pick the dedicated GPU instance with the highest local usage (> 10MB)
                        let max_bytes = items
                            .iter()
                            .map(|item| item.fmt_val_large.max(0) as u64)
                            .max()
                            .unwrap_or(0);

                        if max_bytes > 10 * 1024 * 1024 {
                            return Some(max_bytes);
                        }
                    }
                }
            }
            None
        }
    }

    #[cfg(target_os = "windows")]
    fn poll_nvml(&self) -> Option<GpuMetrics> {
        if !self.has_nvml {
            return None;
        }

        #[repr(C)]
        struct NvmlUtilization {
            gpu: u32,
            memory: u32,
        }

        #[repr(C)]
        struct NvmlMemory {
            total: u64,
            free: u64,
            used: u64,
        }

        unsafe {
            use windows_sys::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryA};
            let nvml_lib = LoadLibraryA(b"nvml.dll\0".as_ptr());
            if nvml_lib.is_null() {
                return None;
            }

            let get_handle_fn = GetProcAddress(nvml_lib, b"nvmlDeviceGetHandleByIndex_v2\0".as_ptr())
                .or_else(|| GetProcAddress(nvml_lib, b"nvmlDeviceGetHandleByIndex\0".as_ptr()))?;
            let get_handle: unsafe extern "C" fn(u32, *mut usize) -> i32 =
                std::mem::transmute(get_handle_fn);

            let mut device_handle: usize = 0;
            if get_handle(self.nvml_device as u32, &mut device_handle) != 0 {
                return None;
            }

            // GPU Utilization
            let mut gpu_usage: Option<f32> = None;
            if let Some(util_fn) = GetProcAddress(nvml_lib, b"nvmlDeviceGetUtilizationRates\0".as_ptr()) {
                let func: unsafe extern "C" fn(usize, *mut NvmlUtilization) -> i32 =
                    std::mem::transmute(util_fn);
                let mut util = NvmlUtilization { gpu: 0, memory: 0 };
                if func(device_handle, &mut util) == 0 {
                    gpu_usage = Some(util.gpu as f32);
                }
            }

            // VRAM Memory
            let mut vram_used: Option<u64> = None;
            let mut vram_total: Option<u64> = self.cached_vram_total;
            if let Some(mem_fn) = GetProcAddress(nvml_lib, b"nvmlDeviceGetMemoryInfo\0".as_ptr()) {
                let func: unsafe extern "C" fn(usize, *mut NvmlMemory) -> i32 =
                    std::mem::transmute(mem_fn);
                let mut mem = NvmlMemory {
                    total: 0,
                    free: 0,
                    used: 0,
                };
                if func(device_handle, &mut mem) == 0 {
                    vram_used = Some(mem.used);
                    vram_total = Some(mem.total);
                }
            }

            // Temperature
            let mut temp_c: Option<f32> = None;
            if let Some(temp_fn) = GetProcAddress(nvml_lib, b"nvmlDeviceGetTemperature\0".as_ptr()) {
                let func: unsafe extern "C" fn(usize, u32, *mut u32) -> i32 =
                    std::mem::transmute(temp_fn);
                let mut temp = 0u32;
                if func(device_handle, 0, &mut temp) == 0 {
                    temp_c = Some(temp as f32);
                }
            }

            // VRAM (memory junction) temperature: NVML_FI_DEV_MEMORY_TEMP = 82.
            // Only present on boards/drivers that report it (e.g. GDDR6X);
            // any error simply leaves it unset.
            let mut memory_temp_c: Option<f32> = None;
            if let Some(fv_fn) = GetProcAddress(nvml_lib, b"nvmlDeviceGetFieldValues\0".as_ptr()) {
                #[repr(C)]
                struct NvmlFieldValue {
                    field_id: u32,
                    scope_id: u32,
                    timestamp: i64,
                    latency_usec: i64,
                    value_type: u32,
                    nvml_return: u32,
                    value: u64,
                }
                let func: unsafe extern "C" fn(usize, i32, *mut NvmlFieldValue) -> i32 =
                    std::mem::transmute(fv_fn);
                let mut fv = NvmlFieldValue {
                    field_id: 82,
                    scope_id: 0,
                    timestamp: 0,
                    latency_usec: 0,
                    value_type: 0,
                    nvml_return: 1,
                    value: 0,
                };
                // value_type 0 == NVML_VALUE_TYPE_UNSIGNED_INT (low 32 bits of the union)
                if func(device_handle, 1, &mut fv) == 0 && fv.nvml_return == 0 && fv.value_type == 0 {
                    let t = (fv.value & 0xFFFF_FFFF) as u32;
                    if (1..=150).contains(&t) {
                        memory_temp_c = Some(t as f32);
                    }
                }
            }

            // Clock (Graphics clock in MHz)
            let mut clock_mhz: Option<u32> = None;
            if let Some(clock_fn) = GetProcAddress(nvml_lib, b"nvmlDeviceGetClockInfo\0".as_ptr()) {
                let func: unsafe extern "C" fn(usize, u32, *mut u32) -> i32 =
                    std::mem::transmute(clock_fn);
                let mut clock = 0u32;
                if func(device_handle, 0, &mut clock) == 0 {
                    clock_mhz = Some(clock);
                }
            }

            // Fan Speed
            let mut fan_percent: Option<f32> = None;
            if let Some(fan_fn) = GetProcAddress(nvml_lib, b"nvmlDeviceGetFanSpeed\0".as_ptr()) {
                let func: unsafe extern "C" fn(usize, *mut u32) -> i32 =
                    std::mem::transmute(fan_fn);
                let mut fan = 0u32;
                if func(device_handle, &mut fan) == 0 {
                    fan_percent = Some(fan as f32);
                }
            }

            // Power (mW to W)
            let mut power_w: Option<f32> = None;
            if let Some(power_fn) = GetProcAddress(nvml_lib, b"nvmlDeviceGetPowerUsage\0".as_ptr()) {
                let func: unsafe extern "C" fn(usize, *mut u32) -> i32 =
                    std::mem::transmute(power_fn);
                let mut power_mw = 0u32;
                if func(device_handle, &mut power_mw) == 0 {
                    power_w = Some(((power_mw as f32 / 1000.0) * 10.0).round() / 10.0);
                }
            }

            Some(GpuMetrics {
                name: self.primary_name.clone(),
                usage: gpu_usage,
                vram_used_bytes: vram_used.or_else(|| self.poll_pdh_vram()),
                vram_total_bytes: vram_total,
                temp_c,
                hotspot_c: None,
                memory_temp_c,
                clock_mhz,
                fan_percent,
                power_w,
            })
        }
    }

    #[cfg(target_os = "windows")]
    fn poll_adl(&self) -> Option<GpuMetrics> {
        if !self.has_adl || self.adl_context == 0 {
            return None;
        }

        unsafe {
            use windows_sys::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryA};

            let mut adl_lib = LoadLibraryA(b"atiadlxx.dll\0".as_ptr());
            if adl_lib.is_null() {
                adl_lib = LoadLibraryA(b"atiadlxy.dll\0".as_ptr());
            }
            if adl_lib.is_null() {
                return None;
            }

            let pmlog_fn = GetProcAddress(adl_lib, b"ADL2_New_QueryPMLogData_Get\0".as_ptr())?;
            type FnPMLog = unsafe extern "system" fn(
                *mut std::ffi::c_void,
                i32,
                *mut AdlPmLogDataOutput,
            ) -> i32;
            let query_pmlog: FnPMLog = std::mem::transmute(pmlog_fn);

            let mut output = AdlPmLogDataOutput {
                ul_size: std::mem::size_of::<AdlPmLogDataOutput>() as i32,
                sensors: [AdlSingleSensorData::default(); 256],
            };

            if query_pmlog(self.adl_context as *mut std::ffi::c_void, self.adl_adapter_index, &mut output) != 0 {
                return None;
            }

            // PMLOG_INFO_ACTIVITY_GFX = 19 (GPU load %)
            let usage = if output.sensors[19].supported != 0 {
                Some(output.sensors[19].value.clamp(0, 100) as f32)
            } else {
                None
            };

            // Temperature: PMLOG_TEMPERATURE_EDGE = 8, fallback PMLOG_TEMPERATURE_HOTSPOT = 27 or GFX = 28
            let temp_c = if output.sensors[8].supported != 0 {
                Some(output.sensors[8].value as f32)
            } else if output.sensors[27].supported != 0 {
                Some(output.sensors[27].value as f32)
            } else if output.sensors[28].supported != 0 {
                Some(output.sensors[28].value as f32)
            } else {
                None
            };

            // Hotspot / junction: PMLOG_TEMPERATURE_HOTSPOT = 27
            let hotspot_c = if output.sensors[27].supported != 0
                && (1..=150).contains(&output.sensors[27].value)
            {
                Some(output.sensors[27].value as f32)
            } else {
                None
            };

            // VRAM temperature: PMLOG_TEMPERATURE_MEM = 9
            let memory_temp_c = if output.sensors[9].supported != 0
                && (1..=150).contains(&output.sensors[9].value)
            {
                Some(output.sensors[9].value as f32)
            } else {
                None
            };

            // Core clock: PMLOG_CLK_GFXCLK = 1
            let clock_mhz = if output.sensors[1].supported != 0 {
                Some(output.sensors[1].value.max(0) as u32)
            } else {
                None
            };

            // Fan percentage: PMLOG_FAN_PERCENTAGE = 15
            let fan_percent = if output.sensors[15].supported != 0 {
                Some(output.sensors[15].value.clamp(0, 100) as f32)
            } else {
                None
            };

            // Power in W: PMLOG_ASIC_POWER = 23 or PMLOG_BOARD_POWER = 73 or PMLOG_GFX_POWER = 30
            let power_w = if output.sensors[23].supported != 0 {
                Some(output.sensors[23].value.max(0) as f32)
            } else if output.sensors[73].supported != 0 {
                Some(output.sensors[73].value.max(0) as f32)
            } else if output.sensors[30].supported != 0 {
                Some(output.sensors[30].value.max(0) as f32)
            } else {
                None
            };

            Some(GpuMetrics {
                name: self.primary_name.clone(),
                usage,
                vram_used_bytes: self.poll_pdh_vram(),
                vram_total_bytes: self.cached_vram_total,
                temp_c,
                hotspot_c,
                memory_temp_c,
                clock_mhz,
                fan_percent,
                power_w,
            })
        }
    }

    pub fn poll(&mut self) -> GpuMetrics {
        #[cfg(target_os = "windows")]
        {
            // 1. Try NVML (NVIDIA)
            if let Some(nvml_metrics) = self.poll_nvml() {
                return nvml_metrics;
            }

            // 2. Try AMD ADL (Radeon RX)
            if let Some(adl_metrics) = self.poll_adl() {
                return adl_metrics;
            }

            let vram_used = self.poll_pdh_vram();
            GpuMetrics {
                name: self.primary_name.clone(),
                usage: None,
                vram_used_bytes: vram_used,
                vram_total_bytes: self.cached_vram_total,
                temp_c: None,
                hotspot_c: None,
                memory_temp_c: None,
                clock_mhz: None,
                fan_percent: None,
                power_w: None,
            }
        }

        #[cfg(not(target_os = "windows"))]
        GpuMetrics::default()
    }
}

impl Drop for GpuTelemetryProvider {
    fn drop(&mut self) {
        #[cfg(target_os = "windows")]
        unsafe {
            use windows_sys::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryA};

            if self.adl_context != 0 {
                let mut adl_lib = LoadLibraryA(b"atiadlxx.dll\0".as_ptr());
                if adl_lib.is_null() {
                    adl_lib = LoadLibraryA(b"atiadlxy.dll\0".as_ptr());
                }
                if !adl_lib.is_null() {
                    if let Some(dest_ptr) = GetProcAddress(adl_lib, b"ADL2_Main_Control_Destroy\0".as_ptr()) {
                        let destroy: unsafe extern "system" fn(*mut std::ffi::c_void) -> i32 =
                            std::mem::transmute(dest_ptr);
                        destroy(self.adl_context as *mut std::ffi::c_void);
                    }
                }
                self.adl_context = 0;
            }

            if self.pdh_vram_query != 0 {
                let pdh = LoadLibraryA(b"pdh.dll\0".as_ptr());
                if !pdh.is_null() {
                    if let Some(close_ptr) = GetProcAddress(pdh, b"PdhCloseQuery\0".as_ptr()) {
                        let close_query: unsafe extern "system" fn(usize) -> u32 =
                            std::mem::transmute(close_ptr);
                        close_query(self.pdh_vram_query);
                    }
                }
                self.pdh_vram_query = 0;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_gpu_telemetry_provider_poll() {
        let mut provider = GpuTelemetryProvider::new();
        let metrics = provider.poll();
        println!("Polled GPU Metrics: {:?}", metrics);
        // Only meaningful on a machine with a GPU driver (Windows).
        #[cfg(target_os = "windows")]
        assert!(metrics.name.is_some());
        #[cfg(not(target_os = "windows"))]
        let _ = metrics;
    }
}
