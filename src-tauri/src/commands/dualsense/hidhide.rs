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

        // 2. Add or keep the DualSense instance_id in the HidHide blacklist when active
        if !instance_id.is_empty() {
            let mut bl = read_multi_sz_ioctl(handle, IOCTL_GET_BLACKLIST);
            if active {
                if !bl.iter().any(|p| p.eq_ignore_ascii_case(instance_id)) {
                    bl.push(instance_id.to_string());
                    let _ = write_multi_sz_ioctl(handle, IOCTL_SET_BLACKLIST, &bl);
                }
            } else {
                bl.retain(|p| !p.eq_ignore_ascii_case(instance_id));
                let _ = write_multi_sz_ioctl(handle, IOCTL_SET_BLACKLIST, &bl);
            }
        }

        // 3. Toggle global HidHide cloaking state (`IOCTL_SET_ACTIVE = 0x80016014`)
        let flag: u8 = if active { 1 } else { 0 };
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

/// Exact port of `DS4Devices.reEnableDevice(string deviceInstanceId)` from `DS4Windows/DS4Library/DS4Devices.cs`.
/// Briefly cycles the HID device (`DICS_DISABLE` -> `DICS_ENABLE`) via `SetupDiSetClassInstallParamsW`
/// and `SetupDiCallClassInstaller(DIF_PROPERTYCHANGE)` so any game holding a shared handle to the
/// PS5 DualSense controller drops its handle, allowing Nexus Launcher to immediately open the
/// DualSense in Exclusive Mode (`dwShareMode = 0`).
pub fn re_enable_hid_device(instance_id: &str) -> bool {
    #[cfg(target_os = "windows")]
    {
        if instance_id.is_empty() {
            return false;
        }
        win32_setupdi::cycle_hid_device_property_change(instance_id)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = instance_id;
        true
    }
}

#[cfg(target_os = "windows")]
fn open_hidhide_handle() -> Option<isize> {
    let mut wide: Vec<u16> = r"\\.\HidHide".encode_utf16().collect();
    wide.push(0);
    unsafe {
        // GENERIC_READ | GENERIC_WRITE (0xC0000000), FILE_SHARE_READ | FILE_SHARE_WRITE (0x03), OPEN_EXISTING (3)
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
    wide.push(0); // Trailing double-null terminator required by HidHide MULTI_SZ
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
    if exe_str.len() < 3 || &exe_str[1..3] != r":\" {
        return None;
    }
    let drive = &exe_str[0..2]; // e.g. "C:"
    let mut drive_wide: Vec<u16> = drive.encode_utf16().collect();
    drive_wide.push(0);
    let mut target_buf = vec![0u16; 512];
    let chars = unsafe { QueryDosDeviceW(drive_wide.as_ptr(), target_buf.as_mut_ptr(), target_buf.len() as u32) };
    if chars == 0 {
        return None;
    }
    let end = target_buf.iter().position(|&c| c == 0).unwrap_or(chars as usize);
    let device_prefix = String::from_utf16_lossy(&target_buf[..end]);
    Some(format!("{}{}", device_prefix, &exe_str[2..]))
}

#[cfg(target_os = "windows")]
mod win32_setupdi {
    use super::*;

    #[repr(C)]
    #[derive(Clone, Copy)]
    pub struct SpDevInfoData {
        pub cb_size: u32,
        pub class_guid: Guid,
        pub dev_inst: u32,
        pub reserved: usize,
    }

    #[repr(C)]
    #[derive(Clone, Copy)]
    pub struct SpClassInstallHeader {
        pub cb_size: u32,
        pub install_function: u32,
    }

    #[repr(C)]
    #[derive(Clone, Copy)]
    pub struct SpPropChangeParams {
        pub class_install_header: SpClassInstallHeader,
        pub state_change: u32,
        pub scope: u32,
        pub hw_profile: u32,
    }

    #[link(name = "hid")]
    extern "system" {
        fn HidD_GetHidGuid(hid_guid: *mut Guid);
    }

    #[link(name = "setupapi")]
    extern "system" {
        fn SetupDiGetClassDevsW(
            class_guid: *const Guid,
            enumerator: *const u16,
            hwnd_parent: isize,
            flags: u32,
        ) -> isize;
        fn SetupDiEnumDeviceInfo(
            device_info_set: isize,
            member_index: u32,
            device_info_data: *mut SpDevInfoData,
        ) -> i32;
        fn SetupDiSetClassInstallParamsW(
            device_info_set: isize,
            device_info_data: *mut SpDevInfoData,
            class_install_params: *const SpPropChangeParams,
            class_install_params_size: u32,
        ) -> i32;
        fn SetupDiCallClassInstaller(
            install_function: u32,
            device_info_set: isize,
            device_info_data: *mut SpDevInfoData,
        ) -> i32;
        fn SetupDiDestroyDeviceInfoList(device_info_set: isize) -> i32;
    }

    const DIGCF_PRESENT: u32 = 0x0000_0002;
    const DIGCF_DEVICEINTERFACE: u32 = 0x0000_0010;
    const DIF_PROPERTYCHANGE: u32 = 0x0000_0012;
    const DICS_ENABLE: u32 = 0x0000_0001;
    const DICS_DISABLE: u32 = 0x0000_0002;
    const DICS_FLAG_GLOBAL: u32 = 0x0000_0001;

    pub fn cycle_hid_device_property_change(instance_id: &str) -> bool {
        let _ = std::mem::size_of::<SpDeviceInterfaceData>();
        unsafe {
            let mut hid_guid = Guid {
                data1: 0,
                data2: 0,
                data3: 0,
                data4: [0; 8],
            };
            HidD_GetHidGuid(&mut hid_guid);

            let mut inst_wide: Vec<u16> = instance_id.encode_utf16().collect();
            inst_wide.push(0);

            let dev_info = SetupDiGetClassDevsW(
                &hid_guid,
                inst_wide.as_ptr(),
                0,
                DIGCF_PRESENT | DIGCF_DEVICEINTERFACE,
            );
            if dev_info == INVALID_HANDLE_VALUE || dev_info == 0 {
                return false;
            }

            let mut dev_data = SpDevInfoData {
                cb_size: std::mem::size_of::<SpDevInfoData>() as u32,
                class_guid: hid_guid,
                dev_inst: 0,
                reserved: 0,
            };

            if SetupDiEnumDeviceInfo(dev_info, 0, &mut dev_data) == 0 {
                let _ = SetupDiDestroyDeviceInfoList(dev_info);
                return false;
            }

            let mut params = SpPropChangeParams {
                class_install_header: SpClassInstallHeader {
                    cb_size: std::mem::size_of::<SpClassInstallHeader>() as u32,
                    install_function: DIF_PROPERTYCHANGE,
                },
                state_change: DICS_DISABLE,
                scope: DICS_FLAG_GLOBAL,
                hw_profile: 0,
            };

            let _ = SetupDiSetClassInstallParamsW(
                dev_info,
                &mut dev_data,
                &params,
                std::mem::size_of::<SpPropChangeParams>() as u32,
            );
            let _ = SetupDiCallClassInstaller(DIF_PROPERTYCHANGE, dev_info, &mut dev_data);

            std::thread::sleep(std::time::Duration::from_millis(80));

            params.state_change = DICS_ENABLE;
            let _ = SetupDiSetClassInstallParamsW(
                dev_info,
                &mut dev_data,
                &params,
                std::mem::size_of::<SpPropChangeParams>() as u32,
            );
            let ok = SetupDiCallClassInstaller(DIF_PROPERTYCHANGE, dev_info, &mut dev_data) != 0;

            std::thread::sleep(std::time::Duration::from_millis(80));
            let _ = SetupDiDestroyDeviceInfoList(dev_info);
            ok
        }
    }
}
