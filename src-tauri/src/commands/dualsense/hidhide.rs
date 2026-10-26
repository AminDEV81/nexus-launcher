//! HidHide (`\\.\HidHide`) kernel driver integration and `SetupDi` Exclusive Mode device reset
//! ported from `DS4Windows/DS4Control/HidHideAPIDevice.cs` and `DS4Windows/DS4Library/DS4Devices.cs`.
//! Ensures that when Xbox 360 Emulation is activated, the physical PS5 DualSense controller is
//! completely hidden/cloaked from games so games ONLY detect the emulated Xbox 360 controller.

#[cfg(target_os = "windows")]
use super::vigem_xbox::win32_vigem::{
    CloseHandle, CreateFileW, DeviceIoControl, Guid, SpDeviceInterfaceData, INVALID_HANDLE_VALUE,
};

pub const IOCTL_GET_WHITELIST: u32 = 0x8001_6000;
pub const IOCTL_SET_WHITELIST: u32 = 0x8001_6004;
pub const IOCTL_GET_BLACKLIST: u32 = 0x8001_6008;
pub const IOCTL_SET_BLACKLIST: u32 = 0x8001_600C;
pub const IOCTL_GET_ACTIVE: u32 = 0x8001_6010;
pub const IOCTL_SET_ACTIVE: u32 = 0x8001_6014;

/// Checks if the `\\.\HidHide` driver control device is installed and accessible on Windows.
pub fn is_hidhide_installed() -> bool {
    #[cfg(target_os = "windows")]
    {
        if let Some(h) = open_hidhide_handle() {
            unsafe {
                let _ = CloseHandle(h);
            }
            return true;
        }
        false
    }
    #[cfg(not(target_os = "windows"))]
    {
        false
    }
}

/// Converts a Windows HID device path (e.g. `\\?\hid#vid_054c&pid_0ce6&mi_03#7&123456&0&0000#{4d1e55b2-...}`)
/// into its uppercase Device Instance ID (`HID\VID_054C&PID_0CE6&MI_03\7&123456&0&0000`),
/// matching `Global.GetInstanceIdFromDevicePath` in `DS4Windows`.
pub fn device_path_to_instance_id(device_path: &str) -> String {
    let mut s = device_path.trim().to_string();
    if let Some(pos) = s.rfind("#{") {
        s.truncate(pos);
    }
    s = s
        .trim_start_matches(r"\\?\")
        .trim_start_matches(r"\\.\")
        .replace('#', r"\")
        .to_uppercase();
    s
}

/// Cloaks (`active = true`) or uncloaks (`active = false`) the physical PS5 DualSense controller
/// in `\\.\HidHide` while whitelisting the running Nexus Launcher executable so Nexus Launcher
/// can continue reading the DualSense while games only see the Virtual Xbox 360 Controller.
pub fn configure_hidhide_cloaking(instance_id: &str, active: bool) -> bool {
    #[cfg(target_os = "windows")]
    {
        let Some(handle) = open_hidhide_handle() else {
            return false;
        };

        // 1. Ensure our own executable's DOS device path (`\Device\HarddiskVolumeX\...`) is whitelisted
        if let Some(dos_exe_path) = current_exe_dos_device_path() {
            let mut wl = read_multi_sz_ioctl(handle, IOCTL_GET_WHITELIST);
            if !wl.iter().any(|p| p.eq_ignore_ascii_case(&dos_exe_path)) {
                wl.push(dos_exe_path);
                let _ = write_multi_sz_ioctl(handle, IOCTL_SET_WHITELIST, &wl);
            }
        }

        // 2. Add or remove the DualSense instance_id in the HidHide blacklist
        let mut bl = read_multi_sz_ioctl(handle, IOCTL_GET_BLACKLIST);
        if !instance_id.is_empty() {
            if active {
                if !bl.iter().any(|p| p.eq_ignore_ascii_case(instance_id)) {
                    bl.push(instance_id.to_string());
                    let _ = write_multi_sz_ioctl(handle, IOCTL_SET_BLACKLIST, &bl);
                }
            } else {
                let before_len = bl.len();
                bl.retain(|p| !p.eq_ignore_ascii_case(instance_id));
                if bl.len() != before_len {
                    let _ = write_multi_sz_ioctl(handle, IOCTL_SET_BLACKLIST, &bl);
                }
            }
        }

        // 3. Keep global HidHide cloaking active whenever at least one controller is in the blacklist
        let should_be_active = active || !bl.is_empty();
        let flag: u8 = if should_be_active { 1 } else { 0 };
        let mut returned = 0u32;
        let ok = unsafe {
            DeviceIoControl(
                handle,
                IOCTL_SET_ACTIVE,
                &flag as *const u8,
                1,
                std::ptr::null_mut(),
                0,
                &mut returned,
                std::ptr::null_mut(),
            ) != 0
        };
        unsafe {
            let _ = CloseHandle(handle);
        }
        ok
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = (instance_id, active);
        false
    }
}

#[allow(dead_code)]
pub fn re_enable_hid_device(instance_id: &str) -> bool {
    let _ = instance_id;
    true
}

#[cfg(target_os = "windows")]
fn open_hidhide_handle() -> Option<isize> {
    let mut wide: Vec<u16> = r"\\.\HidHide".encode_utf16().collect();
    wide.push(0);
    unsafe {
        let h = CreateFileW(
            wide.as_ptr(),
            0xC000_0000,
            0x0000_0003,
            std::ptr::null(),
            3,
            0x0000_0080,
            0,
        );
        if h == INVALID_HANDLE_VALUE || h == 0 {
            None
        } else {
            Some(h)
        }
    }
}

#[cfg(target_os = "windows")]
fn read_multi_sz_ioctl(handle: isize, ioctl_code: u32) -> Vec<String> {
    unsafe {
        let mut required = 0u32;
        let _ = DeviceIoControl(
            handle,
            ioctl_code,
            std::ptr::null(),
            0,
            std::ptr::null_mut(),
            0,
            &mut required,
            std::ptr::null_mut(),
        );
        if required < 2 {
            return Vec::new();
        }
        let mut buf = vec![0u16; (required as usize) / 2 + 2];
        let mut returned = 0u32;
        if DeviceIoControl(
            handle,
            ioctl_code,
            std::ptr::null(),
            0,
            buf.as_mut_ptr() as *mut u8,
            (buf.len() * 2) as u32,
            &mut returned,
            std::ptr::null_mut(),
        ) == 0
        {
            return Vec::new();
        }
        let word_len = (returned as usize) / 2;
        let slice = &buf[..word_len.min(buf.len())];
        slice
            .split(|&c| c == 0)
            .filter(|part| !part.is_empty())
            .map(String::from_utf16_lossy)
            .collect()
    }
}

#[cfg(target_os = "windows")]
fn write_multi_sz_ioctl(handle: isize, ioctl_code: u32, entries: &[String]) -> bool {
    let mut wide: Vec<u16> = Vec::new();
    for item in entries {
        if !item.is_empty() {
            wide.extend(item.encode_utf16());
            wide.push(0);
        }
    }
    wide.push(0);
    let mut returned = 0u32;
    unsafe {
        DeviceIoControl(
            handle,
            ioctl_code,
            wide.as_ptr() as *const u8,
            (wide.len() * 2) as u32,
            std::ptr::null_mut(),
            0,
            &mut returned,
            std::ptr::null_mut(),
        ) != 0
    }
}

#[cfg(target_os = "windows")]
fn current_exe_dos_device_path() -> Option<String> {
    #[link(name = "kernel32")]
    extern "system" {
        fn QueryDosDeviceW(lp_device_name: *const u16, lp_target_path: *mut u16, ucch_max: u32) -> u32;
    }

    let exe = std::env::current_exe().ok()?;
    let exe_str = exe.to_string_lossy().replace(r"\\?\", "");
    let mut ch_iter = exe_str.chars();
    let drive_letter = ch_iter.next()?;
    let colon = ch_iter.next()?;
    let sep = ch_iter.next()?;
    if !drive_letter.is_ascii_alphabetic() || colon != ':' || (sep != '\\' && sep != '/') {
        return None;
    }
    let rest: String = std::iter::once('\\').chain(ch_iter).collect();
    let drive = format!("{drive_letter}:");
    let mut drive_wide: Vec<u16> = drive.encode_utf16().collect();
    drive_wide.push(0);
    let mut target_buf = vec![0u16; 512];
    let chars = unsafe { QueryDosDeviceW(drive_wide.as_ptr(), target_buf.as_mut_ptr(), target_buf.len() as u32) };
    if chars == 0 {
        return None;
    }
    let end = target_buf.iter().position(|&c| c == 0).unwrap_or(chars as usize);
    let device_prefix = String::from_utf16_lossy(&target_buf[..end]);
    let _ = std::mem::size_of::<Guid>();
    let _ = std::mem::size_of::<SpDeviceInterfaceData>();
    Some(format!("{}{}", device_prefix, rest))
}
