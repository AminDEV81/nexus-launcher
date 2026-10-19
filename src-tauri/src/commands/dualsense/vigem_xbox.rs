//! Direct Windows Kernel Driver client for `ViGEmBus` (`{96E42B22-F5E9-42F8-B043-ED0F932F014F}`)
//! and exact Xbox 360 (`XUSB_REPORT`) converter ported from `DS4Windows/DS4Control/Xbox360OutDevice.cs`
//! and `ViGEmClient.dll`.

use super::models::{DualSenseProfileConfig, DualSenseRawInput, Xbox360EmulatedState};
use std::sync::{
    atomic::{AtomicBool, AtomicU32, AtomicU64, AtomicU8, Ordering},
    Arc,
};

/// Global bitmask tracking which ViGEmBus target serial numbers (`1..=16`) are currently claimed
/// by our 4 controller slots so two slots never claim the same `serial_no` on separate bus handles.
static CLAIMED_VIGEM_SERIALS: AtomicU32 = AtomicU32::new(0);

// XUSB_BUTTON bitmask constants (matching XInput / ViGEmBus XUSB_REPORT.wButtons)
pub const XUSB_GAMEPAD_DPAD_UP: u16 = 0x0001;
pub const XUSB_GAMEPAD_DPAD_DOWN: u16 = 0x0002;
pub const XUSB_GAMEPAD_DPAD_LEFT: u16 = 0x0004;
pub const XUSB_GAMEPAD_DPAD_RIGHT: u16 = 0x0008;
pub const XUSB_GAMEPAD_START: u16 = 0x0010;
pub const XUSB_GAMEPAD_BACK: u16 = 0x0020;
pub const XUSB_GAMEPAD_LEFT_THUMB: u16 = 0x0040;
pub const XUSB_GAMEPAD_RIGHT_THUMB: u16 = 0x0080;
pub const XUSB_GAMEPAD_LEFT_SHOULDER: u16 = 0x0100;
pub const XUSB_GAMEPAD_RIGHT_SHOULDER: u16 = 0x0200;
pub const XUSB_GAMEPAD_GUIDE: u16 = 0x0400;
pub const XUSB_GAMEPAD_A: u16 = 0x1000;
pub const XUSB_GAMEPAD_B: u16 = 0x2000;
pub const XUSB_GAMEPAD_X: u16 = 0x4000;
pub const XUSB_GAMEPAD_Y: u16 = 0x8000;

/// Exact 12-byte `XUSB_REPORT` struct passed inside `IOCTL_XUSB_SUBMIT_REPORT`.
#[repr(C, packed)]
#[derive(Debug, Clone, Copy, Default)]
pub struct XusbReport {
    pub w_buttons: u16,
    pub b_left_trigger: u8,
    pub b_right_trigger: u8,
    pub s_thumb_lx: i16,
    pub s_thumb_ly: i16,
    pub s_thumb_rx: i16,
    pub s_thumb_ry: i16,
}

/// Exact port of `Xbox360OutDevice.AxisScale(int Value, bool Flip)` from `DS4Windows/DS4Control/Xbox360OutDevice.cs`
/// combined with configurable deadzone scaling.
pub fn axis_scale_with_deadzone(value: u8, flip: bool, deadzone: u8) -> i16 {
    let centered = (value as i32) - 128;
    if centered.abs() <= (deadzone as i32) {
        return 0;
    }

    let dz = deadzone as f32;
    let adjusted = if centered > 0 {
        let span = (127.0 - dz).max(1.0);
        let norm = ((centered as f32) - dz) / span;
        128.0 + (norm.clamp(0.0, 1.0) * 127.0)
    } else {
        let span = (128.0 - dz).max(1.0);
        let norm = ((-centered as f32) - dz) / span;
        128.0 - (norm.clamp(0.0, 1.0) * 128.0)
    };

    let temp = adjusted * (1.0 / 255.0);
    let temp = if flip {
        (temp - 0.5f32) * -1.0f32 + 0.5f32
    } else {
        temp
    };
    ((temp * 65535.0f32) - 32768.0f32).round().clamp(-32768.0, 32767.0) as i16
}

pub fn trigger_scale_with_deadzone(value: u8, deadzone: u8) -> u8 {
    if value <= deadzone {
        return 0;
    }
    let span = (255u16.saturating_sub(deadzone as u16)).max(1);
    let num = ((value - deadzone) as u32 * 255) / (span as u32);
    num.min(255) as u8
}

/// Converts a `DualSenseRawInput` frame into an `Xbox360EmulatedState` and `XusbReport`
/// using the exact button and axis mapping from `DS4Windows/DS4Control/Xbox360OutDevice.cs`.
pub fn convert_dualsense_to_xbox360(
    ds: &DualSenseRawInput,
    cfg: &DualSenseProfileConfig,
    emulation_active: bool,
    vigem_connected: bool,
    xinput_user_index: u8,
    ps5_hidden_exclusive: bool,
    hidhide_active: bool,
    large_motor_rumble: u8,
    small_motor_rumble: u8,
    packets_sent: u64,
) -> (Xbox360EmulatedState, XusbReport) {
    let mut w_buttons: u16 = 0;

    if ds.dpad_up {
        w_buttons |= XUSB_GAMEPAD_DPAD_UP;
    }
    if ds.dpad_down {
        w_buttons |= XUSB_GAMEPAD_DPAD_DOWN;
    }
    if ds.dpad_left {
        w_buttons |= XUSB_GAMEPAD_DPAD_LEFT;
    }
    if ds.dpad_right {
        w_buttons |= XUSB_GAMEPAD_DPAD_RIGHT;
    }

    let back = ds.create || (!cfg.touchpad_mouse_enabled && cfg.touchpad_as_xbox_back && ds.touchpad_click);
    let start = ds.options;
    let guide = ds.ps;
    let share = ds.mute;

    if start {
        w_buttons |= XUSB_GAMEPAD_START;
    }
    if back {
        w_buttons |= XUSB_GAMEPAD_BACK;
    }
    if ds.l3 {
        w_buttons |= XUSB_GAMEPAD_LEFT_THUMB;
    }
    if ds.r3 {
        w_buttons |= XUSB_GAMEPAD_RIGHT_THUMB;
    }
    if ds.l1 {
        w_buttons |= XUSB_GAMEPAD_LEFT_SHOULDER;
    }
    if ds.r1 {
        w_buttons |= XUSB_GAMEPAD_RIGHT_SHOULDER;
    }
    if guide {
        w_buttons |= XUSB_GAMEPAD_GUIDE;
    }
    if ds.cross {
        w_buttons |= XUSB_GAMEPAD_A;
    }
    if ds.circle {
        w_buttons |= XUSB_GAMEPAD_B;
    }
    if ds.square {
        w_buttons |= XUSB_GAMEPAD_X;
    }
    if ds.triangle {
        w_buttons |= XUSB_GAMEPAD_Y;
    }

    let lt = trigger_scale_with_deadzone(ds.l2, cfg.l2_deadzone);
    let rt = trigger_scale_with_deadzone(ds.r2, cfg.r2_deadzone);

    let thumb_lx = axis_scale_with_deadzone(ds.lx, false, cfg.left_deadzone);
    let thumb_ly = axis_scale_with_deadzone(ds.ly, true, cfg.left_deadzone);
    let thumb_rx = axis_scale_with_deadzone(ds.rx, false, cfg.right_deadzone);
    let thumb_ry = axis_scale_with_deadzone(ds.ry, true, cfg.right_deadzone);

    let report = XusbReport {
        w_buttons,
        b_left_trigger: lt,
        b_right_trigger: rt,
        s_thumb_lx: thumb_lx,
        s_thumb_ly: thumb_ly,
        s_thumb_rx: thumb_rx,
        s_thumb_ry: thumb_ry,
    };

    let state = Xbox360EmulatedState {
        slot_index: ds.slot_index,
        emulation_active,
        vigem_connected,
        xinput_user_index,
        ps5_hidden_exclusive,
        hidhide_active,
        w_buttons,
        a: ds.cross,
        b: ds.circle,
        x: ds.square,
        y: ds.triangle,
        lb: ds.l1,
        rb: ds.r1,
        back,
        start,
        guide,
        share,
        ls: ds.l3,
        rs: ds.r3,
        dpad_up: ds.dpad_up,
        dpad_down: ds.dpad_down,
        dpad_left: ds.dpad_left,
        dpad_right: ds.dpad_right,
        lt,
        rt,
        thumb_lx,
        thumb_ly,
        thumb_rx,
        thumb_ry,
        large_motor_rumble,
        small_motor_rumble,
        packets_sent,
    };

    (state, report)
}

#[repr(C)]
#[derive(Clone, Copy)]
struct VigemCheckVersion {
    size: u32,
    version: u32,
}

#[repr(C)]
#[derive(Clone, Copy)]
struct VigemPluginTarget {
    size: u32,
    serial_no: u32,
    target_type: u32, // 0 = Xbox360Wired, 2 = DualShock4Wired
    vendor_id: u16,   // 0x045E (Microsoft)
    product_id: u16,  // 0x028E (Xbox 360 Controller for Windows)
}

#[repr(C)]
#[derive(Clone, Copy)]
struct VigemUnplugTarget {
    size: u32,
    serial_no: u32,
}

#[repr(C)]
#[derive(Clone, Copy)]
struct VigemWaitDeviceReady {
    size: u32,
    serial_no: u32,
}

#[repr(C, packed)]
#[derive(Clone, Copy)]
struct XusbSubmitReport {
    size: u32,
    serial_no: u32,
    report: XusbReport,
}

#[repr(C)]
#[derive(Clone, Copy, Default)]
struct XusbRequestNotification {
    size: u32,
    serial_no: u32,
    large_motor: u8,
    small_motor: u8,
    led_number: u8,
    _pad: u8,
}

pub struct VigemXbox360Client {
    #[cfg(target_os = "windows")]
    bus_handle: isize,
    slot_index: u8,
    serial_no: u32,
    plugged_in: AtomicBool,
    pub large_motor: Arc<AtomicU8>,
    pub small_motor: Arc<AtomicU8>,
    pub led_number: Arc<AtomicU8>,
    pub packets_sent: Arc<AtomicU64>,
    notify_stop: Arc<AtomicBool>,
}

unsafe impl Send for VigemXbox360Client {}
unsafe impl Sync for VigemXbox360Client {}

impl Default for VigemXbox360Client {
    fn default() -> Self {
        Self::new_for_slot(0)
    }
}

impl VigemXbox360Client {
    pub fn new() -> Self {
        Self::new_for_slot(0)
    }

    pub fn new_for_slot(slot_index: u8) -> Self {
        Self {
            #[cfg(target_os = "windows")]
            bus_handle: -1,
            slot_index,
            serial_no: (slot_index as u32) + 1,
            plugged_in: AtomicBool::new(false),
            large_motor: Arc::new(AtomicU8::new(0)),
            small_motor: Arc::new(AtomicU8::new(0)),
            led_number: Arc::new(AtomicU8::new(slot_index)),
            packets_sent: Arc::new(AtomicU64::new(0)),
            notify_stop: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn is_plugged_in(&self) -> bool {
        self.plugged_in.load(Ordering::Relaxed)
    }

    /// Checks if the ViGEmBus kernel driver device interface `{96E42B22-F5E9-42F8-B043-ED0F932F014F}` is present on Windows.
    pub fn is_driver_installed() -> bool {
        #[cfg(target_os = "windows")]
        {
            win32_vigem::find_vigembus_device_path().is_some()
        }
        #[cfg(not(target_os = "windows"))]
        {
            true
        }
    }

    /// Connects to `\\.\ViGEmBus` and plugs in a virtual Xbox 360 Controller (`VID_045E&PID_028E`).
    pub fn connect_and_plug_in(&mut self) -> Result<String, String> {
        if self.is_plugged_in() {
            return Ok(format!(
                "Virtual Xbox 360 Controller #{} (XInput) is already connected via ViGEmBus.",
                self.serial_no
            ));
        }

        #[cfg(target_os = "windows")]
        {
            let path = win32_vigem::find_vigembus_device_path().ok_or_else(|| {
                "ViGEmBus driver ({96E42B22-F5E9-42F8-B043-ED0F932F014F}) not found on system.".to_string()
            })?;

            let handle = win32_vigem::open_vigembus(&path)?;
            let check = VigemCheckVersion {
                size: std::mem::size_of::<VigemCheckVersion>() as u32,
                version: 0x0001,
            };
            win32_vigem::ioctl_timeout(
                handle,
                0x002AA00C,
                &check as *const _ as *const u8,
                check.size,
                std::ptr::null_mut(),
                0,
                250,
            )
            .map_err(|e| {
                win32_vigem::close_handle(handle);
                format!("ViGEmBus version check failed: {}", e)
            })?;

            let preferred_serial = (self.slot_index as u32) + 1;
            let mut chosen_serial = 0u32;
            for offset in 0..16u32 {
                let serial = ((preferred_serial - 1 + offset) % 16) + 1;
                let bit = 1u32 << (serial - 1);

                // Ensure no other slot in this process has already claimed `serial`
                let prev_mask = CLAIMED_VIGEM_SERIALS.fetch_or(bit, Ordering::SeqCst);
                if (prev_mask & bit) != 0 {
                    continue;
                }

                let plugin = VigemPluginTarget {
                    size: std::mem::size_of::<VigemPluginTarget>() as u32,
                    serial_no: serial,
                    target_type: 0, // Xbox360Wired
                    vendor_id: 0x045E,
                    product_id: 0x028E,
                };
                if win32_vigem::ioctl_timeout(
                    handle,
                    0x002AA004,
                    &plugin as *const _ as *const u8,
                    plugin.size,
                    std::ptr::null_mut(),
                    0,
                    300,
                )
                .is_ok()
                {
                    // Bounded wait (180ms max) so plugging in multiple controllers never freezes PnP
                    let wait_ready = VigemWaitDeviceReady {
                        size: std::mem::size_of::<VigemWaitDeviceReady>() as u32,
                        serial_no: serial,
                    };
                    let _ = win32_vigem::ioctl_timeout(
                        handle,
                        0x002AA010,
                        &wait_ready as *const _ as *const u8,
                        wait_ready.size,
                        std::ptr::null_mut(),
                        0,
                        180,
                    );
                    chosen_serial = serial;
                    break;
                } else {
                    CLAIMED_VIGEM_SERIALS.fetch_and(!bit, Ordering::SeqCst);
                }
            }

            if chosen_serial == 0 {
                win32_vigem::close_handle(handle);
                return Err("ViGEmBus has no free target slots available.".to_string());
            }

            self.bus_handle = handle;
            self.serial_no = chosen_serial;
            self.led_number.store(self.slot_index, Ordering::Relaxed);
            self.plugged_in.store(true, Ordering::SeqCst);
            self.notify_stop.store(false, Ordering::SeqCst);

            // Submit an initial neutral XUSB report immediately so Windows XInput registers the pad
            let _ = self.submit_report(&XusbReport::default());

            let bus_handle = self.bus_handle;
            let serial_no = self.serial_no;
            let slot_idx = self.slot_index;
            let large = self.large_motor.clone();
            let small = self.small_motor.clone();
            let led = self.led_number.clone();
            let stop_flag = self.notify_stop.clone();

            std::thread::spawn(move || {
                while !stop_flag.load(Ordering::Relaxed) {
                    let mut req = XusbRequestNotification {
                        size: std::mem::size_of::<XusbRequestNotification>() as u32,
                        serial_no,
                        large_motor: 0,
                        small_motor: 0,
                        led_number: slot_idx,
                        _pad: 0,
                    };
                    if win32_vigem::ioctl_timeout(
                        bus_handle,
                        0x002AE804,
                        &req as *const _ as *const u8,
                        req.size,
                        &mut req as *mut _ as *mut u8,
                        req.size,
                        120,
                    )
                    .is_ok()
                    {
                        large.store(req.large_motor, Ordering::Relaxed);
                        small.store(req.small_motor, Ordering::Relaxed);
                        led.store(req.led_number.min(3), Ordering::Relaxed);
                    } else {
                        std::thread::sleep(std::time::Duration::from_millis(25));
                    }
                }
            });

            Ok(format!(
                "Virtual Xbox 360 Controller (VID_045E&PID_028E, Slot #{}, XInput #{}) plugged into ViGEmBus.",
                self.slot_index + 1,
                chosen_serial
            ))
        }

        #[cfg(not(target_os = "windows"))]
        {
            self.plugged_in.store(true, Ordering::SeqCst);
            Ok(format!(
                "Virtual Xbox 360 Controller (VID_045E&PID_028E, Slot #{}) active.",
                self.serial_no
            ))
        }
    }

    /// Submits a 12-byte `XUSB_REPORT` to the virtual Xbox 360 controller via `IOCTL_XUSB_SUBMIT_REPORT (0x002AA808)`.
    pub fn submit_report(&self, report: &XusbReport) -> bool {
        if !self.is_plugged_in() {
            return false;
        }

        #[cfg(target_os = "windows")]
        {
            if self.bus_handle == -1 {
                return false;
            }
            let payload = XusbSubmitReport {
                size: std::mem::size_of::<XusbSubmitReport>() as u32,
                serial_no: self.serial_no,
                report: *report,
            };
            let ok = win32_vigem::ioctl_timeout(
                self.bus_handle,
                0x002AA808,
                &payload as *const _ as *const u8,
                std::mem::size_of::<XusbSubmitReport>() as u32,
                std::ptr::null_mut(),
                0,
                10,
            )
            .is_ok();
            if ok {
                self.packets_sent.fetch_add(1, Ordering::Relaxed);
            }
            ok
        }

        #[cfg(not(target_os = "windows"))]
        {
            let _ = report;
            self.packets_sent.fetch_add(1, Ordering::Relaxed);
            true
        }
    }

    /// Unplugs the virtual Xbox 360 controller (`IOCTL_VIGEM_UNPLUG_TARGET = 0x002AA008`) and closes the bus handle.
    pub fn unplug_and_disconnect(&mut self) {
        if !self.is_plugged_in() {
            return;
        }
        self.notify_stop.store(true, Ordering::SeqCst);
        self.plugged_in.store(false, Ordering::SeqCst);

        if self.serial_no >= 1 && self.serial_no <= 16 {
            let bit = 1u32 << (self.serial_no - 1);
            CLAIMED_VIGEM_SERIALS.fetch_and(!bit, Ordering::SeqCst);
        }

        #[cfg(target_os = "windows")]
        {
            if self.bus_handle != -1 {
                // Cancel any pending notification IRP before unplugging or closing the handle so it never hangs!
                win32_vigem::cancel_io(self.bus_handle);
                let unplug = VigemUnplugTarget {
                    size: std::mem::size_of::<VigemUnplugTarget>() as u32,
                    serial_no: self.serial_no,
                };
                let _ = win32_vigem::ioctl_timeout(
                    self.bus_handle,
                    0x002AA008,
                    &unplug as *const _ as *const u8,
                    unplug.size,
                    std::ptr::null_mut(),
                    0,
                    150,
                );
                win32_vigem::close_handle(self.bus_handle);
                self.bus_handle = -1;
            }
        }
        self.large_motor.store(0, Ordering::Relaxed);
        self.small_motor.store(0, Ordering::Relaxed);
    }
}

impl Drop for VigemXbox360Client {
    fn drop(&mut self) {
        self.unplug_and_disconnect();
    }
}

#[cfg(target_os = "windows")]
pub mod win32_vigem {
    use std::ffi::OsString;
    use std::os::windows::ffi::OsStringExt;

    #[repr(C)]
    #[derive(Clone, Copy)]
    pub struct Guid {
        pub data1: u32,
        pub data2: u16,
        pub data3: u16,
        pub data4: [u8; 8],
    }

    // {96E42B22-F5E9-42F8-B043-ED0F932F014F}
    pub const GUID_DEVINTERFACE_BUSENUM_VIGEM: Guid = Guid {
        data1: 0x96E42B22,
        data2: 0xF5E9,
        data3: 0x42F8,
        data4: [0xB0, 0x43, 0xED, 0x0F, 0x93, 0x2F, 0x01, 0x4F],
    };

    #[repr(C)]
    pub struct SpDeviceInterfaceData {
        pub cb_size: u32,
        pub interface_class_guid: Guid,
        pub flags: u32,
        pub reserved: usize,
    }

    #[repr(C)]
    pub struct Overlapped {
        pub internal: usize,
        pub internal_high: usize,
        pub offset: u32,
        pub offset_high: u32,
        pub h_event: isize,
    }

    #[link(name = "setupapi")]
    extern "system" {
        pub fn SetupDiGetClassDevsW(
            class_guid: *const Guid,
            enumerator: *const u16,
            hwnd_parent: isize,
            flags: u32,
        ) -> isize;
        pub fn SetupDiEnumDeviceInterfaces(
            device_info_set: isize,
            device_info_data: *const u8,
            interface_class_guid: *const Guid,
            member_index: u32,
            device_interface_data: *mut SpDeviceInterfaceData,
        ) -> i32;
        pub fn SetupDiGetDeviceInterfaceDetailW(
            device_info_set: isize,
            device_interface_data: *mut SpDeviceInterfaceData,
            device_interface_detail_data: *mut u8,
            device_interface_detail_data_size: u32,
            required_size: *mut u32,
            device_info_data: *mut u8,
        ) -> i32;
        pub fn SetupDiDestroyDeviceInfoList(device_info_set: isize) -> i32;
    }

    #[link(name = "kernel32")]
    extern "system" {
        pub fn CreateFileW(
            lp_file_name: *const u16,
            dw_desired_access: u32,
            dw_share_mode: u32,
            lp_security_attributes: *const u8,
            dw_creation_disposition: u32,
            dw_flags_and_attributes: u32,
            h_template_file: isize,
        ) -> isize;
        pub fn CreateEventW(
            lp_event_attributes: *const u8,
            b_manual_reset: i32,
            b_initial_state: i32,
            lp_name: *const u16,
        ) -> isize;
        pub fn DeviceIoControl(
            h_device: isize,
            dw_io_control_code: u32,
            lp_in_buffer: *const u8,
            n_in_buffer_size: u32,
            lp_out_buffer: *mut u8,
            n_out_buffer_size: u32,
            lp_bytes_returned: *mut u32,
            lp_overlapped: *mut Overlapped,
        ) -> i32;
        pub fn GetOverlappedResult(
            h_file: isize,
            lp_overlapped: *const Overlapped,
            lp_number_of_bytes_transferred: *mut u32,
            b_wait: i32,
        ) -> i32;
        pub fn WaitForSingleObject(h_handle: isize, dw_milliseconds: u32) -> u32;
        pub fn CancelIoEx(h_file: isize, lp_overlapped: *const Overlapped) -> i32;
        pub fn GetLastError() -> u32;
        pub fn CloseHandle(h_object: isize) -> i32;
    }

    pub const DIGCF_PRESENT: u32 = 0x0000_0002;
    pub const DIGCF_DEVICEINTERFACE: u32 = 0x0000_0010;
    pub const INVALID_HANDLE_VALUE: isize = -1;

    pub fn find_vigembus_device_path() -> Option<Vec<u16>> {
        unsafe {
            let guid = GUID_DEVINTERFACE_BUSENUM_VIGEM;
            let dev_info = SetupDiGetClassDevsW(
                &guid,
                std::ptr::null(),
                0,
                DIGCF_PRESENT | DIGCF_DEVICEINTERFACE,
            );
            if dev_info == INVALID_HANDLE_VALUE || dev_info == 0 {
                return None;
            }

            let mut if_data = SpDeviceInterfaceData {
                cb_size: std::mem::size_of::<SpDeviceInterfaceData>() as u32,
                interface_class_guid: guid,
                flags: 0,
                reserved: 0,
            };

            let mut found_path: Option<Vec<u16>> = None;
            if SetupDiEnumDeviceInterfaces(dev_info, std::ptr::null(), &guid, 0, &mut if_data) != 0 {
                let mut required_size = 0u32;
                let _ = SetupDiGetDeviceInterfaceDetailW(
                    dev_info,
                    &mut if_data,
                    std::ptr::null_mut(),
                    0,
                    &mut required_size,
                    std::ptr::null_mut(),
                );
                if required_size >= 8 {
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
                    ) != 0
                    {
                        let wchar_count = (required_size as usize).saturating_sub(4) / 2;
                        let mut wide = Vec::with_capacity(wchar_count);
                        for i in 0..wchar_count {
                            let lo = detail_buf[4 + i * 2] as u16;
                            let hi = detail_buf[4 + i * 2 + 1] as u16;
                            let ch = lo | (hi << 8);
                            wide.push(ch);
                            if ch == 0 {
                                break;
                            }
                        }
                        if !wide.ends_with(&[0]) {
                            wide.push(0);
                        }
                        found_path = Some(wide);
                    }
                }
            }

            let _ = SetupDiDestroyDeviceInfoList(dev_info);
            let _ = OsString::from_wide(&[]);
            found_path
        }
    }

    pub fn open_vigembus(path_wide: &[u16]) -> Result<isize, String> {
        unsafe {
            let h = CreateFileW(
                path_wide.as_ptr(),
                0xC000_0000,
                0x0000_0003,
                std::ptr::null(),
                3,
                0xE000_0080,
                0,
            );
            if h == INVALID_HANDLE_VALUE || h == 0 {
                Err(format!("Failed to open ViGEmBus handle (Win32 error {})", GetLastError()))
            } else {
                Ok(h)
            }
        }
    }

    pub fn ioctl_timeout(
        handle: isize,
        ioctl_code: u32,
        in_buf: *const u8,
        in_len: u32,
        out_buf: *mut u8,
        out_len: u32,
        timeout_ms: u32,
    ) -> Result<u32, String> {
        unsafe {
            let event = CreateEventW(std::ptr::null(), 1, 0, std::ptr::null());
            let mut ov = Overlapped {
                internal: 0,
                internal_high: 0,
                offset: 0,
                offset_high: 0,
                h_event: event,
            };
            let mut transferred = 0u32;
            let res = DeviceIoControl(
                handle,
                ioctl_code,
                in_buf,
                in_len,
                out_buf,
                out_len,
                &mut transferred,
                &mut ov,
            );
            if res == 0 {
                let err = GetLastError();
                if err != 997 {
                    if event != 0 {
                        let _ = CloseHandle(event);
                    }
                    return Err(format!(
                        "DeviceIoControl(0x{:08X}) failed with Win32 error {}",
                        ioctl_code, err
                    ));
                }
                if WaitForSingleObject(event, timeout_ms) != 0 {
                    let _ = CancelIoEx(handle, &ov);
                    let _ = GetOverlappedResult(handle, &ov, &mut transferred, 1);
                    if event != 0 {
                        let _ = CloseHandle(event);
                    }
                    return Err(format!(
                        "DeviceIoControl(0x{:08X}) timed out after {}ms",
                        ioctl_code, timeout_ms
                    ));
                }
            }
            let ok = GetOverlappedResult(handle, &ov, &mut transferred, 1);
            let err = GetLastError();
            if event != 0 {
                let _ = CloseHandle(event);
            }
            if ok == 0 {
                return Err(format!(
                    "GetOverlappedResult(0x{:08X}) failed with Win32 error {}",
                    ioctl_code, err
                ));
            }
            Ok(transferred)
        }
    }

    #[allow(dead_code)]
    pub fn ioctl_sync(
        handle: isize,
        ioctl_code: u32,
        in_buf: *const u8,
        in_len: u32,
        out_buf: *mut u8,
        out_len: u32,
    ) -> Result<u32, String> {
        ioctl_timeout(handle, ioctl_code, in_buf, in_len, out_buf, out_len, 250)
    }

    pub fn cancel_io(handle: isize) {
        if handle != INVALID_HANDLE_VALUE && handle != 0 {
            unsafe {
                let _ = CancelIoEx(handle, std::ptr::null());
            }
        }
    }

    pub fn close_handle(handle: isize) {
        if handle != INVALID_HANDLE_VALUE && handle != 0 {
            unsafe {
                let _ = CloseHandle(handle);
            }
        }
    }
}
