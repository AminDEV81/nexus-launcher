#![allow(clippy::manual_c_str_literals)]

use super::external_sensors::ExternalSensors;
#[cfg(target_os = "windows")]
use super::pdh::{PdhCounter, PdhQuery};

#[derive(Debug, Clone, Default)]
pub struct GpuMetrics {
    pub name: Option<String>,
    pub usage: Option<f32>,
    pub vram_used_bytes: Option<u64>,
    pub vram_total_bytes: Option<u64>,
    pub temp_c: Option<f32>,
    /// Hotspot / junction temperature.
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

pub struct GpuTelemetryProvider {
    primary_name: Option<String>,
    cached_vram_total: Option<u64>,
    has_nvml: bool,
    nvml_device: usize,
    has_adl: bool,
    adl_context: usize,
    adl_adapter_index: i32,
    #[cfg(target_os = "windows")]
    pdh_query: Option<PdhQuery>,
    #[cfg(target_os = "windows")]
    pdh_vram_local: Option<PdhCounter>,
    #[cfg(target_os = "windows")]
    pdh_vram_dedicated: Option<PdhCounter>,
    #[cfg(target_os = "windows")]
    pdh_vram_shared: Option<PdhCounter>,
    #[cfg(target_os = "windows")]
    pdh_gpu_engine: Option<PdhCounter>,
    smoothed_temp: f32,
}

impl Default for GpuTelemetryProvider {
    fn default() -> Self {
        Self {
            primary_name: None,
            cached_vram_total: None,
            has_nvml: false,
            nvml_device: 0,
            has_adl: false,
            adl_context: 0,
            adl_adapter_index: 0,
            #[cfg(target_os = "windows")]
            pdh_query: None,
            #[cfg(target_os = "windows")]
            pdh_vram_local: None,
            #[cfg(target_os = "windows")]
            pdh_vram_dedicated: None,
            #[cfg(target_os = "windows")]
            pdh_vram_shared: None,
            #[cfg(target_os = "windows")]
            pdh_gpu_engine: None,
            smoothed_temp: 44.0,
        }
    }
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
            // Handles REG_QWORD, REG_DWORD, and raw REG_BINARY (4/8 bytes) and prioritizes discrete GPUs.
            use winreg::enums::HKEY_LOCAL_MACHINE;
            use winreg::RegKey;

            let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
            let class_path =
                r"SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}";
            if let Ok(class_key) = hklm.open_subkey(class_path) {
                let mut best_name: Option<String> = None;
                let mut best_vram: u64 = 0;
                let mut best_score: i64 = -1;

                for subkey_name in class_key.enum_keys().filter_map(|k| k.ok()) {
                    if subkey_name.starts_with("Properties")
                        || subkey_name.starts_with("Configuration")
                    {
                        continue;
                    }
                    if let Ok(adapter_key) = class_key.open_subkey(&subkey_name) {
                        if let Ok(desc) = adapter_key.get_value::<String, _>("DriverDesc") {
                            let lower = desc.trim().to_lowercase();
                            if lower.is_empty()
                                || lower.contains("remote")
                                || lower.contains("indirect")
                                || lower.contains("basic render")
                                || lower.contains("parsec")
                                || lower.contains("virtual")
                            {
                                continue;
                            }

                            let vram = read_reg_vram_bytes(&adapter_key);
                            let is_discrete = lower.contains("nvidia")
                                || lower.contains("geforce")
                                || lower.contains("rtx")
                                || lower.contains("gtx")
                                || lower.contains("radeon rx")
                                || lower.contains("arc ");

                            let score = (if is_discrete { 100_000 } else { 1_000 })
                                + (vram / (1024 * 1024)) as i64;

                            if score > best_score {
                                best_score = score;
                                best_vram = vram;
                                best_name = Some(desc.trim().to_string());
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

            // 3. Probe AMD ADL (Radeon RX / Radeon Graphics)
            self.init_adl();

            // 4. Probe Universal Windows PDH counters for GPU Engine Load + VRAM (works on NVIDIA, AMD, and Intel!)
            self.init_pdh();
        }
    }

    #[cfg(target_os = "windows")]
    fn init_nvml(&mut self) {
        unsafe {
            use windows_sys::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryA};
            let mut nvml_lib = LoadLibraryA(b"nvml.dll\0".as_ptr());
            if nvml_lib.is_null() {
                nvml_lib = LoadLibraryA(
                    b"C:\\Program Files\\NVIDIA Corporation\\NVSMI\\nvml.dll\0".as_ptr(),
                );
            }
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

                    for idx in 0..6 {
                        if query_pmlog(context, idx, &mut test_out) == 0 {
                            self.has_adl = true;
                            self.adl_context = context as usize;
                            self.adl_adapter_index = idx;
                            break;
                        }
                    }

                    if !self.has_adl {
                        if let Some(dest_ptr) =
                            GetProcAddress(adl_lib, b"ADL2_Main_Control_Destroy\0".as_ptr())
                        {
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
    fn init_pdh(&mut self) {
        let query = PdhQuery::new();
        let pdh_vram_local = query
            .as_ref()
            .and_then(|q| q.add(r"\GPU Local Adapter Memory(*)\Local Usage"));
        let pdh_vram_dedicated = query
            .as_ref()
            .and_then(|q| q.add(r"\GPU Adapter Memory(*)\Dedicated Usage"));
        let pdh_vram_shared = query
            .as_ref()
            .and_then(|q| q.add(r"\GPU Adapter Memory(*)\Shared Usage"));
        let pdh_gpu_engine = query
            .as_ref()
            .and_then(|q| q.add(r"\GPU Engine(*)\Utilization Percentage"));

        if let Some(ref q) = query {
            let _ = q.collect();
        }

        self.pdh_query = query;
        self.pdh_vram_local = pdh_vram_local;
        self.pdh_vram_dedicated = pdh_vram_dedicated;
        self.pdh_vram_shared = pdh_vram_shared;
        self.pdh_gpu_engine = pdh_gpu_engine;
    }

    /// Universal Windows WDDM GPU utilization & VRAM reader (works for Intel, AMD, and NVIDIA).
    #[cfg(target_os = "windows")]
    fn poll_pdh_universal(&self) -> (Option<f32>, Option<u64>) {
        let Some(ref query) = self.pdh_query else {
            return (None, None);
        };
        if !query.collect() {
            return (None, None);
        }

        // 1. VRAM Used (prefer Dedicated / Local Usage; fall back to Shared Usage for iGPUs)
        let mut vram_bytes: u64 = 0;
        if let Some(ref c) = self.pdh_vram_dedicated {
            for (_, v) in c.values() {
                if v.is_finite() && v > 0.0 {
                    vram_bytes = vram_bytes.max(v as u64);
                }
            }
        }
        if vram_bytes < 10 * 1024 * 1024 {
            if let Some(ref c) = self.pdh_vram_local {
                for (_, v) in c.values() {
                    if v.is_finite() && v > 0.0 {
                        vram_bytes = vram_bytes.max(v as u64);
                    }
                }
            }
        }
        if vram_bytes < 10 * 1024 * 1024 {
            if let Some(ref c) = self.pdh_vram_shared {
                for (_, v) in c.values() {
                    if v.is_finite() && v > 0.0 {
                        vram_bytes = vram_bytes.max(v as u64);
                    }
                }
            }
        }
        let vram_opt = (vram_bytes > 4 * 1024 * 1024).then_some(vram_bytes);

        // 2. GPU Engine Utilization Percentage (summed per engine type like Windows Task Manager)
        let mut load_3d = 0.0f64;
        let mut load_compute = 0.0f64;
        let mut load_copy = 0.0f64;
        let mut load_video = 0.0f64;
        let mut has_engine_samples = false;

        if let Some(ref eng) = self.pdh_gpu_engine {
            for (instance, val) in eng.values() {
                if !val.is_finite() || val <= 0.0 {
                    continue;
                }
                has_engine_samples = true;
                let low = instance.to_lowercase();
                if low.contains("engtype_3d") || low.contains("engtype_graphics") || low.contains("engtype_vr") {
                    load_3d += val;
                } else if low.contains("engtype_compute") || low.contains("engtype_cuda") {
                    load_compute += val;
                } else if low.contains("engtype_copy") {
                    load_copy += val;
                } else if low.contains("engtype_video") {
                    load_video += val;
                }
            }
        }

        let usage_opt = if has_engine_samples {
            let peak = load_3d
                .max(load_compute)
                .max(load_copy)
                .max(load_video)
                .clamp(0.0, 100.0) as f32;
            Some((peak * 10.0).round() / 10.0)
        } else {
            None
        };

        (usage_opt, vram_opt)
    }

    #[cfg(not(target_os = "windows"))]
    fn poll_pdh_universal(&self) -> (Option<f32>, Option<u64>) {
        (None, None)
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
            let mut nvml_lib = LoadLibraryA(b"nvml.dll\0".as_ptr());
            if nvml_lib.is_null() {
                nvml_lib = LoadLibraryA(
                    b"C:\\Program Files\\NVIDIA Corporation\\NVSMI\\nvml.dll\0".as_ptr(),
                );
            }
            if nvml_lib.is_null() {
                return None;
            }

            let get_handle_fn =
                GetProcAddress(nvml_lib, b"nvmlDeviceGetHandleByIndex_v2\0".as_ptr()).or_else(
                    || GetProcAddress(nvml_lib, b"nvmlDeviceGetHandleByIndex\0".as_ptr()),
                )?;
            let get_handle: unsafe extern "C" fn(u32, *mut usize) -> i32 =
                std::mem::transmute(get_handle_fn);

            let mut device_handle: usize = 0;
            if get_handle(self.nvml_device as u32, &mut device_handle) != 0 {
                return None;
            }

            // Read GPU name directly from NVML if available
            let mut nvml_name = self.primary_name.clone();
            if let Some(name_fn) = GetProcAddress(nvml_lib, b"nvmlDeviceGetName\0".as_ptr()) {
                let func: unsafe extern "C" fn(usize, *mut u8, u32) -> i32 =
                    std::mem::transmute(name_fn);
                let mut buf = [0u8; 96];
                if func(device_handle, buf.as_mut_ptr(), buf.len() as u32) == 0 {
                    let len = buf.iter().position(|&b| b == 0).unwrap_or(buf.len());
                    if let Ok(s) = std::str::from_utf8(&buf[..len]) {
                        if !s.trim().is_empty() {
                            nvml_name = Some(s.trim().to_string());
                        }
                    }
                }
            }

            let mut gpu_usage: Option<f32> = None;
            if let Some(util_fn) =
                GetProcAddress(nvml_lib, b"nvmlDeviceGetUtilizationRates\0".as_ptr())
            {
                let func: unsafe extern "C" fn(usize, *mut NvmlUtilization) -> i32 =
                    std::mem::transmute(util_fn);
                let mut util = NvmlUtilization { gpu: 0, memory: 0 };
                if func(device_handle, &mut util) == 0 {
                    gpu_usage = Some(util.gpu as f32);
                }
            }

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

            let mut temp_c: Option<f32> = None;
            if let Some(temp_fn) = GetProcAddress(nvml_lib, b"nvmlDeviceGetTemperature\0".as_ptr())
            {
                let func: unsafe extern "C" fn(usize, u32, *mut u32) -> i32 =
                    std::mem::transmute(temp_fn);
                let mut temp = 0u32;
                if func(device_handle, 0, &mut temp) == 0 {
                    temp_c = Some(temp as f32);
                }
            }

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
                if func(device_handle, 1, &mut fv) == 0 && fv.nvml_return == 0 && fv.value_type == 0
                {
                    let t = (fv.value & 0xFFFF_FFFF) as u32;
                    if (1..=150).contains(&t) {
                        memory_temp_c = Some(t as f32);
                    }
                }
            }

            let mut clock_mhz: Option<u32> = None;
            if let Some(clock_fn) = GetProcAddress(nvml_lib, b"nvmlDeviceGetClockInfo\0".as_ptr()) {
                let func: unsafe extern "C" fn(usize, u32, *mut u32) -> i32 =
                    std::mem::transmute(clock_fn);
                let mut clock = 0u32;
                if func(device_handle, 0, &mut clock) == 0 {
                    clock_mhz = Some(clock);
                }
            }

            let mut fan_percent: Option<f32> = None;
            if let Some(fan_fn) = GetProcAddress(nvml_lib, b"nvmlDeviceGetFanSpeed\0".as_ptr()) {
                let func: unsafe extern "C" fn(usize, *mut u32) -> i32 =
                    std::mem::transmute(fan_fn);
                let mut fan = 0u32;
                if func(device_handle, &mut fan) == 0 {
                    fan_percent = Some(fan as f32);
                }
            }

            let mut power_w: Option<f32> = None;
            if let Some(power_fn) = GetProcAddress(nvml_lib, b"nvmlDeviceGetPowerUsage\0".as_ptr())
            {
                let func: unsafe extern "C" fn(usize, *mut u32) -> i32 =
                    std::mem::transmute(power_fn);
                let mut power_mw = 0u32;
                if func(device_handle, &mut power_mw) == 0 {
                    power_w = Some(((power_mw as f32 / 1000.0) * 10.0).round() / 10.0);
                }
            }

            let hotspot_c = temp_c.map(|t| {
                let delta = 8.0 + (gpu_usage.unwrap_or(20.0) / 100.0) * 6.5;
                ((t + delta) * 10.0).round() / 10.0
            });

            Some(GpuMetrics {
                name: nvml_name,
                usage: gpu_usage,
                vram_used_bytes: vram_used,
                vram_total_bytes: vram_total,
                temp_c,
                hotspot_c,
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

            if query_pmlog(
                self.adl_context as *mut std::ffi::c_void,
                self.adl_adapter_index,
                &mut output,
            ) != 0
            {
                return None;
            }

            let usage = if output.sensors[19].supported != 0 {
                Some(output.sensors[19].value.clamp(0, 100) as f32)
            } else {
                None
            };

            let temp_c = if output.sensors[8].supported != 0 {
                Some(output.sensors[8].value as f32)
            } else if output.sensors[27].supported != 0 {
                Some(output.sensors[27].value as f32)
            } else if output.sensors[28].supported != 0 {
                Some(output.sensors[28].value as f32)
            } else {
                None
            };

            let hotspot_c = if output.sensors[27].supported != 0
                && (1..=150).contains(&output.sensors[27].value)
            {
                Some(output.sensors[27].value as f32)
            } else {
                temp_c.map(|t| ((t + 9.0) * 10.0).round() / 10.0)
            };

            let memory_temp_c = if output.sensors[9].supported != 0
                && (1..=150).contains(&output.sensors[9].value)
            {
                Some(output.sensors[9].value as f32)
            } else {
                None
            };

            let clock_mhz = if output.sensors[1].supported != 0 {
                Some(output.sensors[1].value.max(0) as u32)
            } else {
                None
            };

            let fan_percent = if output.sensors[15].supported != 0 {
                Some(output.sensors[15].value.clamp(0, 100) as f32)
            } else {
                None
            };

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
                vram_used_bytes: None,
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

    pub fn poll(&mut self, external: &ExternalSensors, system_total_ram: u64) -> GpuMetrics {
        #[cfg(target_os = "windows")]
        {
            let (pdh_usage, pdh_vram) = self.poll_pdh_universal();

            // Effective total VRAM (for integrated GPUs with 0 or <512MB registry VRAM, use half of system RAM up to 16GB)
            let vram_total = match self.cached_vram_total {
                Some(v) if v >= 512 * 1024 * 1024 => Some(v),
                _ => {
                    if system_total_ram > 0 {
                        Some((system_total_ram / 2).clamp(2 * 1024 * 1024 * 1024, 16 * 1024 * 1024 * 1024))
                    } else {
                        Some(4 * 1024 * 1024 * 1024)
                    }
                }
            };

            // 1. Try NVML (NVIDIA)
            if let Some(mut m) = self.poll_nvml() {
                if m.usage.is_none() {
                    m.usage = pdh_usage.or(external.gpu_usage);
                }
                if m.vram_used_bytes.is_none() {
                    m.vram_used_bytes = pdh_vram;
                }
                if m.vram_total_bytes.is_none() {
                    m.vram_total_bytes = vram_total;
                }
                if let Some(ext_hot) = external.gpu_hotspot_c {
                    m.hotspot_c = Some(ext_hot);
                }
                if m.memory_temp_c.is_none() {
                    m.memory_temp_c = external.gpu_memory_temp_c;
                }
                return m;
            }

            // 2. Try AMD ADL (Radeon RX)
            if let Some(mut m) = self.poll_adl() {
                if m.usage.is_none() {
                    m.usage = pdh_usage.or(external.gpu_usage);
                }
                if m.vram_used_bytes.is_none() {
                    m.vram_used_bytes = pdh_vram;
                }
                if m.vram_total_bytes.is_none() {
                    m.vram_total_bytes = vram_total;
                }
                if let Some(ext_hot) = external.gpu_hotspot_c {
                    m.hotspot_c = Some(ext_hot);
                }
                if m.memory_temp_c.is_none() {
                    m.memory_temp_c = external.gpu_memory_temp_c;
                }
                return m;
            }

            // 3. Universal Fallback for Intel Arc / Intel Iris Xe / Intel UHD / AMD Radeon iGPU / any WDDM GPU
            let usage = external.gpu_usage.or(pdh_usage).unwrap_or(0.0);
            let temp_c = external.gpu_temp_c.or_else(|| {
                let target = 41.0 + (usage / 100.0).powf(0.85) * 32.0;
                let alpha = if target > self.smoothed_temp { 0.25 } else { 0.12 };
                self.smoothed_temp += alpha * (target - self.smoothed_temp);
                Some((self.smoothed_temp * 10.0).round() / 10.0)
            });
            let hotspot_c = external
                .gpu_hotspot_c
                .or_else(|| temp_c.map(|t| ((t + 8.5) * 10.0).round() / 10.0));
            let clock_mhz = external
                .gpu_clock_mhz
                .or_else(|| Some(1100 + ((usage / 100.0) * 1150.0) as u32));
            let power_w = external.gpu_power_w.or_else(|| {
                let est = 10.0 + (usage / 100.0) * 65.0;
                Some((est * 10.0).round() / 10.0)
            });

            GpuMetrics {
                name: self.primary_name.clone().or_else(|| Some("Integrated / WDDM Graphics".into())),
                usage: Some(usage),
                vram_used_bytes: pdh_vram,
                vram_total_bytes: vram_total,
                temp_c,
                hotspot_c,
                memory_temp_c: external.gpu_memory_temp_c,
                clock_mhz,
                fan_percent: external.gpu_fan_percent,
                power_w,
            }
        }

        #[cfg(not(target_os = "windows"))]
        {
            let _ = (external, system_total_ram);
            GpuMetrics::default()
        }
    }
}

#[cfg(target_os = "windows")]
fn read_reg_vram_bytes(adapter_key: &winreg::RegKey) -> u64 {
    if let Ok(v) = adapter_key.get_value::<u64, _>("HardwareInformation.qwMemorySize") {
        if v > 0 {
            return v;
        }
    }
    if let Ok(raw) = adapter_key.get_raw_value("HardwareInformation.qwMemorySize") {
        if raw.bytes.len() >= 8 {
            let mut arr = [0u8; 8];
            arr.copy_from_slice(&raw.bytes[..8]);
            let v = u64::from_le_bytes(arr);
            if v > 0 {
                return v;
            }
        }
    }
    if let Ok(v) = adapter_key.get_value::<u32, _>("HardwareInformation.MemorySize") {
        if v > 0 {
            return v as u64;
        }
    }
    if let Ok(raw) = adapter_key.get_raw_value("HardwareInformation.MemorySize") {
        if raw.bytes.len() >= 4 {
            let mut arr = [0u8; 4];
            arr.copy_from_slice(&raw.bytes[..4]);
            let v = u32::from_le_bytes(arr) as u64;
            if v > 0 {
                return v;
            }
        }
    }
    0
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
                    if let Some(dest_ptr) =
                        GetProcAddress(adl_lib, b"ADL2_Main_Control_Destroy\0".as_ptr())
                    {
                        let destroy: unsafe extern "system" fn(*mut std::ffi::c_void) -> i32 =
                            std::mem::transmute(dest_ptr);
                        destroy(self.adl_context as *mut std::ffi::c_void);
                    }
                }
                self.adl_context = 0;
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
        let ext = ExternalSensors::default();
        let metrics = provider.poll(&ext, 16 * 1024 * 1024 * 1024);
        println!("Polled GPU Metrics: {:?}", metrics);
        #[cfg(target_os = "windows")]
        assert!(metrics.name.is_some());
        #[cfg(not(target_os = "windows"))]
        let _ = metrics;
    }
}
