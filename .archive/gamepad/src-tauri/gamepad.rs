use serde::Serialize;
use tauri::command;

#[derive(Debug, Clone, Serialize)]
pub struct ControllerBatteryResponse {
    pub status: String,
    pub level: Option<f32>,
    pub charging: bool,
    pub is_wired: bool,
}

#[cfg(target_os = "windows")]
#[repr(C)]
struct XInputBatteryInformation {
    battery_type: u8,
    battery_level: u8,
}

#[cfg(target_os = "windows")]
type PfnXInputGetBatteryInformation = unsafe extern "system" fn(
    dw_user_index: u32,
    dev_type: u8,
    p_battery_information: *mut XInputBatteryInformation,
) -> u32;

/// Queries Windows XInput for real battery level and charging/wired state.
#[command]
pub fn get_xinput_battery(user_index: u32) -> Option<ControllerBatteryResponse> {
    #[cfg(target_os = "windows")]
    {
        use std::ffi::CString;
        unsafe {
            let dll_names = ["xinput1_4.dll\0", "xinput1_3.dll\0", "xinput9_1_0.dll\0"];
            for name in dll_names {
                let h_mod = windows_sys::Win32::System::LibraryLoader::LoadLibraryA(name.as_ptr());
                if !h_mod.is_null() {
                    let fn_name = CString::new("XInputGetBatteryInformation").ok()?;
                    let proc = windows_sys::Win32::System::LibraryLoader::GetProcAddress(
                        h_mod,
                        fn_name.as_ptr() as *const u8,
                    );
                    if let Some(proc_fn) = proc {
                        let get_battery: PfnXInputGetBatteryInformation = std::mem::transmute(proc_fn);
                        let mut info = XInputBatteryInformation {
                            battery_type: 0,
                            battery_level: 0,
                        };
                        // BATTERY_DEVTYPE_GAMEPAD = 0x00
                        let ret = get_battery(user_index, 0, &mut info);
                        if ret == 0 {
                            match info.battery_type {
                                0x00 => return None, // BATTERY_TYPE_DISCONNECTED
                                0x01 => {
                                    // BATTERY_TYPE_WIRED
                                    return Some(ControllerBatteryResponse {
                                        status: "wired".to_string(),
                                        level: Some(1.0),
                                        charging: true,
                                        is_wired: true,
                                    });
                                }
                                0x02 | 0x03 => {
                                    // BATTERY_TYPE_ALKALINE or NIMH
                                    let level = match info.battery_level {
                                        0x00 => 0.10, // EMPTY
                                        0x01 => 0.35, // LOW
                                        0x02 => 0.70, // MEDIUM
                                        0x03 => 1.00, // FULL
                                        _ => 0.50,
                                    };
                                    return Some(ControllerBatteryResponse {
                                        status: "percentage".to_string(),
                                        level: Some(level),
                                        charging: false,
                                        is_wired: false,
                                    });
                                }
                                _ => {
                                    return Some(ControllerBatteryResponse {
                                        status: "unknown".to_string(),
                                        level: None,
                                        charging: false,
                                        is_wired: false,
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    None
}
