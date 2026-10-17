//! Raw Win32 HID Enumeration, Input Report Parser, and Output Report Writer for Sony DualSense
//! (`0x054C:0x0CE6`), DualSense Edge (`0x054C:0x0DF2`), and DualShock 4 (`0x054C:0x05C4`, `0x054C:0x09CC`).
//! Directly ported from `DS4Windows/DS4Library/InputDevices/DualSenseDevice.cs` and `HidLibrary/HidDevice.cs`.

use super::crc32::compute_bt_output_report_crc32;
use super::hidhide::device_path_to_instance_id;
use super::models::{DualSenseProfileConfig, DualSenseRawInput};

pub const SONY_VID: u16 = 0x054C;
pub const DUALSENSE_PID: u16 = 0x0CE6;
pub const DUALSENSE_EDGE_PID: u16 = 0x0DF2;
pub const DS4_V1_PID: u16 = 0x05C4;
pub const DS4_V2_PID: u16 = 0x09CC;
pub const SONY_WA_PID: u16 = 0x0BA0;

#[derive(Debug, Clone)]
pub struct DiscoveredSonyController {
    pub device_path: String,
    pub instance_id: String,
    pub product_name: String,
    pub serial_mac: String,
    pub vendor_id: u16,
    pub product_id: u16,
    pub input_report_len: u16,
    pub output_report_len: u16,
    pub is_bluetooth: bool,
}

/// Parses a raw 64-byte (USB) or 78-byte (Bluetooth) DualSense HID input report into `DualSenseRawInput`,
/// matching the exact byte and bit offsets in `DS4Windows/DS4Library/InputDevices/DualSenseDevice.cs`.
pub fn parse_dualsense_input_report(
    buf: &[u8],
    is_bluetooth: bool,
    out: &mut DualSenseRawInput,
) -> bool {
    if buf.len() < 64 {
        return false;
    }

    // In DualSenseDevice.cs:
    // USB: inputReport[0] == 0x01, reportOffset = 0
    // Bluetooth: inputReport[0] == 0x31, reportOffset = 1 (when full report mode is unlocked via feature 0x05)
    //            or inputReport[0] == 0x01, reportOffset = 0 (compact BT mode before feature 0x05)
    let offset: usize = if is_bluetooth && buf[0] == 0x31 && buf.len() >= 78 {
        1
    } else if buf[0] == 0x01 {
        0
    } else {
        return false;
    };

    if buf.len() < offset + 56 {
        return false;
    }

    out.lx = buf[offset + 1];
    out.ly = buf[offset + 2];
    out.rx = buf[offset + 3];
    out.ry = buf[offset + 4];
    out.l2 = buf[offset + 5];
    out.r2 = buf[offset + 6];
    out.frame_counter = buf[offset + 7];

    // Byte 8: lower nibble = D-Pad hat switch (0..7, 8 = released), upper nibble = Square/Cross/Circle/Triangle
    let b8 = buf[offset + 8];
    out.triangle = (b8 & (1 << 7)) != 0;
    out.circle = (b8 & (1 << 6)) != 0;
    out.cross = (b8 & (1 << 5)) != 0;
    out.square = (b8 & (1 << 4)) != 0;

    let dpad_state = b8 & 0x0F;
    out.dpad_up = matches!(dpad_state, 0 | 1 | 7);
    out.dpad_right = matches!(dpad_state, 1 | 2 | 3);
    out.dpad_down = matches!(dpad_state, 3 | 4 | 5);
    out.dpad_left = matches!(dpad_state, 5 | 6 | 7);

    // Byte 9: L1, R1, L2Btn, R2Btn, Create(Share), Options, L3, R3
    let b9 = buf[offset + 9];
    out.l1 = (b9 & (1 << 0)) != 0;
    out.r1 = (b9 & (1 << 1)) != 0;
    out.l2_button = (b9 & (1 << 2)) != 0 || out.l2 > 0;
    out.r2_button = (b9 & (1 << 3)) != 0 || out.r2 > 0;
    out.create = (b9 & (1 << 4)) != 0;
    out.options = (b9 & (1 << 5)) != 0;
    out.l3 = (b9 & (1 << 6)) != 0;
    out.r3 = (b9 & (1 << 7)) != 0;

    // Byte 10: PS, TouchpadClick, Mute, FnL, FnR, BLP, BRP (DualSense Edge paddles)
    let b10 = buf[offset + 10];
    out.ps = (b10 & (1 << 0)) != 0;
    out.touchpad_click = (b10 & (1 << 1)) != 0;
    out.mute = (b10 & (1 << 2)) != 0;
    out.fn_l = (b10 & (1 << 4)) != 0;
    out.fn_r = (b10 & (1 << 5)) != 0;
    out.blp = (b10 & (1 << 6)) != 0;
    out.brp = (b10 & (1 << 7)) != 0;

    // 6-Axis IMU: Gyro Pitch/Yaw/Roll (bytes 16..22), Accel X/Y/Z (bytes 22..28)
    out.gyro_pitch = i16::from_le_bytes([buf[offset + 16], buf[offset + 17]]);
    out.gyro_yaw = i16::from_le_bytes([buf[offset + 18], buf[offset + 19]]);
    out.gyro_roll = i16::from_le_bytes([buf[offset + 20], buf[offset + 21]]);
    out.accel_x = i16::from_le_bytes([buf[offset + 22], buf[offset + 23]]);
    out.accel_y = i16::from_le_bytes([buf[offset + 24], buf[offset + 25]]);
    out.accel_z = i16::from_le_bytes([buf[offset + 26], buf[offset + 27]]);

    // 2-Finger Capacitive Touchpad (bytes 33..41, 12-bit packed X/Y coordinates 1920x1080)
    let t1_header = buf[offset + 33];
    out.touch1_active = (t1_header & 0x80) == 0;
    out.touch1_id = t1_header & 0x7F;
    out.touch1_x = (buf[offset + 34] as u16) | (((buf[offset + 35] & 0x0F) as u16) << 8);
    out.touch1_y = ((buf[offset + 35] >> 4) as u16) | ((buf[offset + 36] as u16) << 4);

    let t2_header = buf[offset + 37];
    out.touch2_active = (t2_header & 0x80) == 0;
    out.touch2_id = t2_header & 0x7F;
    out.touch2_x = (buf[offset + 38] as u16) | (((buf[offset + 39] & 0x0F) as u16) << 8);
    out.touch2_y = ((buf[offset + 39] >> 4) as u16) | ((buf[offset + 40] as u16) << 4);

    // Battery & Charging state (bytes 53..55)
    let temp_byte = buf[offset + 53];
    let temp_full = (temp_byte & 0x20) != 0;
    let battery_percent = if temp_full {
        100
    } else {
        (((temp_byte & 0x0F) as u16 * 100) / 8).min(100) as u8
    };
    out.battery_percent = battery_percent;
    out.battery_charging = (buf[offset + 54] & 0x08) != 0;

    true
}

/// Populates the 10-byte Adaptive Trigger effect block (`dst[0..10]`) matching `DualSenseDevice.SetTriggerEffect`
/// in `DS4Windows/DS4Library/InputDevices/DualSenseDevice.cs`.
fn write_adaptive_trigger_effect(dst: &mut [u8], effect_name: &str, start_pos: u8, max_force: u8) {
    if dst.len() < 10 {
        return;
    }
    dst.fill(0);
    match effect_name {
        "Rigid" => {
            // TriggerEffects.Rigid (Continuous Resistance)
            dst[0] = 0x01;
            dst[1] = start_pos;
            dst[2] = max_force;
        }
        "Pulse" => {
            // TriggerEffects.Pulse (Section / Vibrating Pulse Resistance)
            dst[0] = 0x02;
            dst[1] = start_pos;
            dst[2] = max_force;
        }
        "FullClick" => {
            // Exact FullClick bytes from DualSenseDevice.cs lines 1551..1561:
            dst[0] = 0x25;
            dst[1] = 0x08;
            dst[2] = 0x01;
            dst[3] = 0xB4;
            dst[4] = 0xFF;
            dst[5] = max_force.max(0xFC);
            dst[6] = 0xFF;
            dst[7] = 0xFF;
            dst[8] = 0x03;
        }
        _ => {
            // TriggerEffects.None (Linear / Off)
            dst[0] = 0x00;
        }
    }
}

/// Builds a 64-byte (USB) or 78-byte (Bluetooth) DualSense Output Report from `DualSenseProfileConfig`
/// and active rumble values, matching `DualSenseDevice.prepareOutputReportInner` in `DS4Windows`.
pub fn build_dualsense_output_report(
    cfg: &DualSenseProfileConfig,
    game_large_rumble: u8,
    game_small_rumble: u8,
    is_bluetooth: bool,
    output_byte_len: usize,
) -> Vec<u8> {
    let report_len = if is_bluetooth {
        78
    } else {
        output_byte_len.max(48)
    };
    let mut out = vec![0u8; report_len];

    let offset: usize = if is_bluetooth {
        out[0] = 0x31; // Bluetooth HID Report ID
        out[1] = 0x02; // DualSense BT Output Tag
        1
    } else {
        out[0] = 0x02; // DualSense USB Output Report ID
        0
    };

    // Feature flags (Rumble + Trigger effects + Mic LED + Player LED + Lightbar RGB)
    out[offset + 1] = 0x0F; // 0x01 (Rumble) | 0x02 (Triggers) | 0x04 (R2) | 0x08 (L2)
    out[offset + 2] = 0x57; // 0x01 (Mic LED) | 0x02 (Audio) | 0x04 (Lightbar) | 0x10 (Player LEDs) | 0x40 (Motor power)

    // Combine game XInput rumble feedback and manual UI test rumble, scaled by rumble_strength
    let scale = (cfg.rumble_strength.min(100) as u16) as f32 / 100.0;
    let right_fast = ((game_small_rumble.max(cfg.test_light_rumble) as f32) * scale)
        .round()
        .clamp(0.0, 255.0) as u8;
    let left_heavy = ((game_large_rumble.max(cfg.test_heavy_rumble) as f32) * scale)
        .round()
        .clamp(0.0, 255.0) as u8;

    out[offset + 3] = right_fast; // Fast / Right motor
    out[offset + 4] = left_heavy; // Heavy / Left motor

    // Mute button orange LED (0 = Off, 1 = Solid, 2 = Pulse)
    out[offset + 9] = cfg.mute_led_mode.min(2);

    // Right Trigger (R2) Adaptive Effect: bytes 11..=20
    write_adaptive_trigger_effect(
        &mut out[offset + 11..offset + 21],
        &cfg.right_trigger_effect,
        cfg.right_trigger_start,
        cfg.right_trigger_force,
    );

    // Left Trigger (L2) Adaptive Effect: bytes 22..=31
    write_adaptive_trigger_effect(
        &mut out[offset + 22..offset + 32],
        &cfg.left_trigger_effect,
        cfg.left_trigger_start,
        cfg.left_trigger_force,
    );

    // LED Brightness & Lightbar setup (matching DualSenseDevice.cs lines 1409..1422)
    out[offset + 39] = 0x06;
    out[offset + 42] = 0x02;
    out[offset + 43] = 0x02;
    out[offset + 44] = cfg.player_led_mask & 0x1F;
    out[offset + 45] = cfg.lightbar_r;
    out[offset + 46] = cfg.lightbar_g;
    out[offset + 47] = cfg.lightbar_b;

    if is_bluetooth && out.len() >= 78 {
        let crc = compute_bt_output_report_crc32(&out[0..74]);
        out[74..78].copy_from_slice(&crc.to_le_bytes());
    }

    out
}

#[cfg(target_os = "windows")]
pub mod win32_hid {
    use super::*;
    use crate::commands::dualsense::vigem_xbox::win32_vigem::{
        CloseHandle, CreateEventW, CreateFileW, GetLastError, GetOverlappedResult, Guid, Overlapped,
         SetupDiDestroyDeviceInfoList, SetupDiEnumDeviceInterfaces, SetupDiGetClassDevsW,
        SetupDiGetDeviceInterfaceDetailW, SpDeviceInterfaceData, DIGCF_DEVICEINTERFACE,
        DIGCF_PRESENT, INVALID_HANDLE_VALUE,
    };

    #[repr(C)]
    #[derive(Default)]
    pub struct HiddAttributes {
        pub size: u32,
        pub vendor_id: u16,
        pub product_id: u16,
        pub version_number: u16,
    }

    #[repr(C)]
    #[derive(Default)]
    pub struct HidpCaps {
        pub usage: u16,
        pub usage_page: u16,
        pub input_report_byte_length: u16,
        pub output_report_byte_length: u16,
        pub feature_report_byte_length: u16,
        pub reserved: [u16; 17],
        pub number_link_collection_nodes: u16,
        pub number_input_button_caps: u16,
        pub number_input_value_caps: u16,
        pub number_input_data_indices: u16,
        pub number_output_button_caps: u16,
        pub number_output_value_caps: u16,
        pub number_output_data_indices: u16,
        pub number_feature_button_caps: u16,
        pub number_feature_value_caps: u16,
        pub number_feature_data_indices: u16,
    }

    #[link(name = "hid")]
    extern "system" {
        pub fn HidD_GetHidGuid(hid_guid: *mut Guid);
        pub fn HidD_GetAttributes(
            hid_device_object: isize,
            attributes: *mut HiddAttributes,
        ) -> u8;
        pub fn HidD_GetPreparsedData(
            hid_device_object: isize,
            preparsed_data: *mut isize,
        ) -> u8;
        pub fn HidD_FreePreparsedData(preparsed_data: isize) -> u8;
        pub fn HidP_GetCaps(preparsed_data: isize, capabilities: *mut HidpCaps) -> i32;
        pub fn HidD_GetFeature(
            hid_device_object: isize,
            report_buffer: *mut u8,
            report_buffer_length: u32,
        ) -> u8;
        pub fn HidD_GetSerialNumberString(
            hid_device_object: isize,
            buffer: *mut u8,
            buffer_length: u32,
        ) -> u8;
        pub fn HidD_SetOutputReport(
            hid_device_object: isize,
            report_buffer: *const u8,
            report_buffer_length: u32,
        ) -> u8;
    }

    #[link(name = "kernel32")]
    extern "system" {
        pub fn ReadFile(
            h_file: isize,
            lp_buffer: *mut u8,
            n_number_of_bytes_to_read: u32,
            lp_number_of_bytes_read: *mut u32,
            lp_overlapped: *mut Overlapped,
        ) -> i32;
        pub fn WriteFile(
            h_file: isize,
            lp_buffer: *const u8,
            n_number_of_bytes_to_write: u32,
            lp_number_of_bytes_written: *mut u32,
            lp_overlapped: *mut Overlapped,
        ) -> i32;
        pub fn WaitForSingleObject(h_handle: isize, dw_milliseconds: u32) -> u32;
        pub fn CancelIoEx(h_file: isize, lp_overlapped: *const Overlapped) -> i32;
    }

    /// Enumerates all connected Sony DualSense / DualSense Edge / DualShock 4 controllers on Windows.
    pub fn enumerate_sony_controllers() -> Vec<DiscoveredSonyController> {
        let mut results = Vec::new();
        unsafe {
            let mut hid_guid = Guid {
                data1: 0,
                data2: 0,
                data3: 0,
                data4: [0; 8],
            };
            HidD_GetHidGuid(&mut hid_guid);

            let dev_info = SetupDiGetClassDevsW(
                &hid_guid,
                std::ptr::null(),
                0,
                DIGCF_PRESENT | DIGCF_DEVICEINTERFACE,
            );
            if dev_info == INVALID_HANDLE_VALUE || dev_info == 0 {
                return results;
            }

            let mut member_index = 0u32;
            loop {
                let mut if_data = SpDeviceInterfaceData {
                    cb_size: std::mem::size_of::<SpDeviceInterfaceData>() as u32,
                    interface_class_guid: hid_guid,
                    flags: 0,
                    reserved: 0,
                };
                if SetupDiEnumDeviceInterfaces(
                    dev_info,
                    std::ptr::null(),
                    &hid_guid,
                    member_index,
                    &mut if_data,
                ) == 0
                {
                    break;
                }
                member_index += 1;

                let mut required_size = 0u32;
                let _ = SetupDiGetDeviceInterfaceDetailW(
                    dev_info,
                    &mut if_data,
                    std::ptr::null_mut(),
                    0,
                    &mut required_size,
                    std::ptr::null_mut(),
                );
                if required_size < 8 {
                    continue;
                }

                let mut detail_buf = vec![0u8; required_size as usize];
                let cb_size: u32 = if std::mem::size_of::<usize>() == 8 { 8 } else { 6 };
                detail_buf[0..4].copy_from_slice(&cb_size.to_le_bytes());
                if SetupDiGetDeviceInterfaceDetailW(
                    dev_info,
                    &mut if_data,
                    detail_buf.as_mut_ptr(),
                    required_size,
                    &mut required_size,
                    std::ptr::null_mut(),
                ) == 0
                {
                    continue;
                }

                let wchar_count = (required_size as usize).saturating_sub(4) / 2;
                let mut wide = Vec::with_capacity(wchar_count);
                for i in 0..wchar_count {
                    let lo = detail_buf[4 + i * 2] as u16;
                    let hi = detail_buf[4 + i * 2 + 1] as u16;
                    let ch = lo | (hi << 8);
                    if ch == 0 {
                        break;
                    }
                    wide.push(ch);
                }
                let device_path = String::from_utf16_lossy(&wide);
                let mut wide_null = wide.clone();
                wide_null.push(0);

                // Open metadata handle (`dwDesiredAccess = 0` or `FILE_GENERIC_READ`, shared)
                let h = CreateFileW(
                    wide_null.as_ptr(),
                    0x8000_0000, // GENERIC_READ
                    0x0000_0003, // FILE_SHARE_READ | FILE_SHARE_WRITE
                    std::ptr::null(),
                    3, // OPEN_EXISTING
                    0,
                    0,
                );
                if h == INVALID_HANDLE_VALUE || h == 0 {
                    continue;
                }

                let mut attrs = HiddAttributes {
                    size: std::mem::size_of::<HiddAttributes>() as u32,
                    ..Default::default()
                };
                let ok_attr = HidD_GetAttributes(h, &mut attrs) != 0;
                if !ok_attr || attrs.vendor_id != SONY_VID {
                    let _ = CloseHandle(h);
                    continue;
                }

                let is_supported_pid = matches!(
                    attrs.product_id,
                    DUALSENSE_PID | DUALSENSE_EDGE_PID | DS4_V1_PID | DS4_V2_PID | SONY_WA_PID
                );
                if !is_supported_pid {
                    let _ = CloseHandle(h);
                    continue;
                }

                let mut preparsed: isize = 0;
                let mut caps = HidpCaps::default();
                if HidD_GetPreparsedData(h, &mut preparsed) != 0 && preparsed != 0 {
                    let _ = HidP_GetCaps(preparsed, &mut caps);
                    let _ = HidD_FreePreparsedData(preparsed);
                }

                // Filter to Gamepad (0x05) or Joystick (0x04) HID usage
                if caps.usage != 0x05 && caps.usage != 0x04 && caps.input_report_byte_length < 64 {
                    let _ = CloseHandle(h);
                    continue;
                }

                // Read MAC / Serial (`SERIAL_FEATURE_ID = 9` for DualSense, `18` for DS4)
                let mut mac = String::from("00:00:00:00:00:00");
                let mut feat_buf = [0u8; 64];
                feat_buf[0] = if attrs.product_id == DUALSENSE_PID || attrs.product_id == DUALSENSE_EDGE_PID {
                    0x09
                } else {
                    0x12
                };
                if HidD_GetFeature(h, feat_buf.as_mut_ptr(), 64) != 0 {
                    mac = format!(
                        "{:02X}:{:02X}:{:02X}:{:02X}:{:02X}:{:02X}",
                        feat_buf[6], feat_buf[5], feat_buf[4], feat_buf[3], feat_buf[2], feat_buf[1]
                    );
                } else {
                    let mut ser_buf = [0u8; 126];
                    if HidD_GetSerialNumberString(h, ser_buf.as_mut_ptr(), 126) != 0 {
                        let u16s: Vec<u16> = ser_buf
                            .chunks_exact(2)
                            .map(|c| u16::from_le_bytes([c[0], c[1]]))
                            .take_while(|&c| c != 0)
                            .collect();
                        let s = String::from_utf16_lossy(&u16s).to_uppercase();
                        if s.len() == 12 {
                            mac = format!(
                                "{}:{}:{}:{}:{}:{}",
                                &s[0..2],
                                &s[2..4],
                                &s[4..6],
                                &s[6..8],
                                &s[8..10],
                                &s[10..12]
                            );
                        }
                    }
                }

                let is_bluetooth = caps.input_report_byte_length == 78;
                // If Bluetooth DualSense, request Feature Report 0x05 (41 bytes) to switch the controller
                // into full 78-byte extended input report mode (gyro, touchpad, battery, adaptive triggers)!
                if is_bluetooth {
                    let mut cal_buf = [0u8; 41];
                    cal_buf[0] = 0x05;
                    let _ = HidD_GetFeature(h, cal_buf.as_mut_ptr(), 41);
                }

                let _ = CloseHandle(h);

                let product_name = match attrs.product_id {
                    DUALSENSE_EDGE_PID => "Sony DualSense Edge Wireless Controller".to_string(),
                    DUALSENSE_PID => "Sony DualSense Wireless Controller (PS5)".to_string(),
                    _ => "Sony DualShock 4 Wireless Controller".to_string(),
                };

                results.push(DiscoveredSonyController {
                    instance_id: device_path_to_instance_id(&device_path),
                    device_path,
                    product_name,
                    serial_mac: mac,
                    vendor_id: attrs.vendor_id,
                    product_id: attrs.product_id,
                    input_report_len: caps.input_report_byte_length.max(64),
                    output_report_len: caps.output_report_byte_length.max(48),
                    is_bluetooth,
                });
            }

            let _ = SetupDiDestroyDeviceInfoList(dev_info);
        }
        results
    }

    /// Opens a Sony controller HID device in either:
    /// - `exclusive = false` (`FILE_SHARE_READ | FILE_SHARE_WRITE`) -> Native PS5 Mode (Games see PS5 DualSense), OR
    /// - `exclusive = true` (`dwShareMode = 0`) -> Xbox 360 Emulation Mode (PS5 DualSense hidden from games!).
    pub fn open_controller_handle(device_path: &str, exclusive: bool) -> Result<(isize, bool), String> {
        let mut wide: Vec<u16> = device_path.encode_utf16().collect();
        wide.push(0);
        unsafe {
            let desired_access = 0x8000_0000u32 | 0x4000_0000u32; // GENERIC_READ | GENERIC_WRITE
            let flags = 0x4000_0000u32; // FILE_FLAG_OVERLAPPED

            if exclusive {
                let h_excl = CreateFileW(
                    wide.as_ptr(),
                    desired_access,
                    0, // dwShareMode = 0 -> EXCLUSIVE LOCK (hides PS5 controller from games!)
                    std::ptr::null(),
                    3, // OPEN_EXISTING
                    flags,
                    0,
                );
                if h_excl != INVALID_HANDLE_VALUE && h_excl != 0 {
                    return Ok((h_excl, true));
                }
            }

            let h_shared = CreateFileW(
                wide.as_ptr(),
                desired_access,
                0x0000_0003, // FILE_SHARE_READ | FILE_SHARE_WRITE
                std::ptr::null(),
                3,
                flags,
                0,
            );
            if h_shared == INVALID_HANDLE_VALUE || h_shared == 0 {
                Err(format!(
                    "Failed to open DualSense HID handle (Win32 error {})",
                    GetLastError()
                ))
            } else {
                Ok((h_shared, false))
            }
        }
    }

    pub fn read_hid_report_overlapped(handle: isize, buf: &mut [u8], timeout_ms: u32) -> Result<usize, String> {
        unsafe {
            let event = CreateEventW(std::ptr::null(), 1, 0, std::ptr::null());
            let mut ov = Overlapped {
                internal: 0,
                internal_high: 0,
                offset: 0,
                offset_high: 0,
                h_event: event,
            };
            let mut bytes_read = 0u32;
            let ok = ReadFile(
                handle,
                buf.as_mut_ptr(),
                buf.len() as u32,
                &mut bytes_read,
                &mut ov,
            );
            if ok == 0 {
                let err = GetLastError();
                if err != 997 {
                    // Not ERROR_IO_PENDING
                    if event != 0 {
                        let _ = CloseHandle(event);
                    }
                    return Err(format!("ReadFile failed with Win32 error {}", err));
                }
                let wait_res = WaitForSingleObject(event, timeout_ms);
                if wait_res != 0 {
                    // WAIT_TIMEOUT (258) or error
                    let _ = CancelIoEx(handle, &ov);
                    if event != 0 {
                        let _ = CloseHandle(event);
                    }
                    return Ok(0);
                }
                if GetOverlappedResult(handle, &ov, &mut bytes_read, 0) == 0 {
                    if event != 0 {
                        let _ = CloseHandle(event);
                    }
                    return Err("GetOverlappedResult failed on HID read".to_string());
                }
            }
            if event != 0 {
                let _ = CloseHandle(event);
            }
            Ok(bytes_read as usize)
        }
    }

    pub fn write_hid_report_overlapped(handle: isize, report: &[u8], timeout_ms: u32) -> bool {
        unsafe {
            let event = CreateEventW(std::ptr::null(), 1, 0, std::ptr::null());
            let mut ov = Overlapped {
                internal: 0,
                internal_high: 0,
                offset: 0,
                offset_high: 0,
                h_event: event,
            };
            let mut written = 0u32;
            let ok = WriteFile(
                handle,
                report.as_ptr(),
                report.len() as u32,
                &mut written,
                &mut ov,
            );
            if ok == 0 {
                let err = GetLastError();
                if err != 997 {
                    if event != 0 {
                        let _ = CloseHandle(event);
                    }
                    // Fallback to HidD_SetOutputReport control transfer
                    return HidD_SetOutputReport(handle, report.as_ptr(), report.len() as u32) != 0;
                }
                if WaitForSingleObject(event, timeout_ms) != 0 {
                    let _ = CancelIoEx(handle, &ov);
                    if event != 0 {
                        let _ = CloseHandle(event);
                    }
                    return false;
                }
                let res = GetOverlappedResult(handle, &ov, &mut written, 0) != 0;
                if event != 0 {
                    let _ = CloseHandle(event);
                }
                return res;
            }
            if event != 0 {
                let _ = CloseHandle(event);
            }
            true
        }
    }
}
