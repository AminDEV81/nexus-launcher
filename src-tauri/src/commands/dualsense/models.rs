use serde::{Deserialize, Serialize};

pub const MAX_CONTROLLER_SLOTS: usize = 4;

/// Complete real-time state of a physical Sony DualSense (PS5) / DualShock 4 controller slot.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DualSenseRawInput {
    pub slot_index: u8,
    pub connected: bool,
    pub connection_type: String, // "USB" | "Bluetooth" | "Gamepad" | "Disconnected"
    pub device_name: String,
    pub device_path: String,
    pub instance_id: String,
    pub mac_address: String,
    pub vendor_id: u16,
    pub product_id: u16,
    pub battery_percent: u8,
    pub battery_charging: bool,

    // Face buttons
    pub cross: bool,
    pub circle: bool,
    pub square: bool,
    pub triangle: bool,

    // Shoulder & Trigger buttons
    pub l1: bool,
    pub r1: bool,
    pub l2_button: bool,
    pub r2_button: bool,

    // System & Stick buttons
    pub create: bool,
    pub options: bool,
    pub l3: bool,
    pub r3: bool,
    pub ps: bool,
    pub touchpad_click: bool,
    pub mute: bool,
    pub fn_l: bool,
    pub fn_r: bool,
    pub blp: bool,
    pub brp: bool,

    // D-Pad
    pub dpad_up: bool,
    pub dpad_down: bool,
    pub dpad_left: bool,
    pub dpad_right: bool,

    // Analog axes (0..=255, center = 128) & triggers (0..=255)
    pub lx: u8,
    pub ly: u8,
    pub rx: u8,
    pub ry: u8,
    pub l2: u8,
    pub r2: u8,

    // 6-Axis IMU (Gyroscope + Accelerometer)
    pub gyro_pitch: i16,
    pub gyro_yaw: i16,
    pub gyro_roll: i16,
    pub accel_x: i16,
    pub accel_y: i16,
    pub accel_z: i16,

    // 2-point Capacitive Touchpad (1920 x 1080)
    pub touch1_active: bool,
    pub touch1_id: u8,
    pub touch1_x: u16,
    pub touch1_y: u16,
    pub touch2_active: bool,
    pub touch2_id: u8,
    pub touch2_x: u16,
    pub touch2_y: u16,

    // Touchpad Mouse state (when Xbox Emulation is active)
    pub mouse_left_click: bool,
    pub mouse_right_click: bool,

    pub frame_counter: u8,
    pub input_latency_us: u64,
}

impl Default for DualSenseRawInput {
    fn default() -> Self {
        Self::for_slot(0)
    }
}

impl DualSenseRawInput {
    pub fn for_slot(slot_index: u8) -> Self {
        Self {
            slot_index,
            connected: false,
            connection_type: "Disconnected".to_string(),
            device_name: format!("DualSense Wireless Controller #{}", slot_index + 1),
            device_path: String::new(),
            instance_id: String::new(),
            mac_address: format!("00:00:00:00:00:0{}", slot_index + 1),
            vendor_id: 0x054C,
            product_id: 0x0CE6,
            battery_percent: 0,
            battery_charging: false,
            cross: false,
            circle: false,
            square: false,
            triangle: false,
            l1: false,
            r1: false,
            l2_button: false,
            r2_button: false,
            create: false,
            options: false,
            l3: false,
            r3: false,
            ps: false,
            touchpad_click: false,
            mute: false,
            fn_l: false,
            fn_r: false,
            blp: false,
            brp: false,
            dpad_up: false,
            dpad_down: false,
            dpad_left: false,
            dpad_right: false,
            lx: 128,
            ly: 128,
            rx: 128,
            ry: 128,
            l2: 0,
            r2: 0,
            gyro_pitch: 0,
            gyro_yaw: 0,
            gyro_roll: 0,
            accel_x: 0,
            accel_y: 0,
            accel_z: 0,
            touch1_active: false,
            touch1_id: 0,
            touch1_x: 960,
            touch1_y: 540,
            touch2_active: false,
            touch2_id: 0,
            touch2_x: 960,
            touch2_y: 540,
            mouse_left_click: false,
            mouse_right_click: false,
            frame_counter: 0,
            input_latency_us: 0,
        }
    }
}

/// Real-time state of a Virtual Xbox 360 Controller (ViGEmBus XUSB_REPORT) for a given slot.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Xbox360EmulatedState {
    pub slot_index: u8,
    pub emulation_active: bool,
    pub vigem_connected: bool,
    pub xinput_user_index: u8,
    pub ps5_hidden_exclusive: bool,
    pub hidhide_active: bool,

    // Raw XUSB_REPORT fields sent via IOCTL_XUSB_SUBMIT_REPORT (0x2AA808)
    pub w_buttons: u16,
    pub a: bool,
    pub b: bool,
    pub x: bool,
    pub y: bool,
    pub lb: bool,
    pub rb: bool,
    pub back: bool,
    pub start: bool,
    pub guide: bool,
    pub share: bool,
    pub ls: bool,
    pub rs: bool,
    pub dpad_up: bool,
    pub dpad_down: bool,
    pub dpad_left: bool,
    pub dpad_right: bool,
    pub lt: u8,
    pub rt: u8,
    pub thumb_lx: i16,
    pub thumb_ly: i16,
    pub thumb_rx: i16,
    pub thumb_ry: i16,

    // Rumble feedback received from games via IOCTL_XUSB_REQUEST_NOTIFICATION (0x2AE804)
    pub large_motor_rumble: u8,
    pub small_motor_rumble: u8,
    pub packets_sent: u64,
}

impl Default for Xbox360EmulatedState {
    fn default() -> Self {
        Self::for_slot(0)
    }
}

impl Xbox360EmulatedState {
    pub fn for_slot(slot_index: u8) -> Self {
        Self {
            slot_index,
            emulation_active: false,
            vigem_connected: false,
            xinput_user_index: slot_index,
            ps5_hidden_exclusive: false,
            hidhide_active: false,
            w_buttons: 0,
            a: false,
            b: false,
            x: false,
            y: false,
            lb: false,
            rb: false,
            back: false,
            start: false,
            guide: false,
            share: false,
            ls: false,
            rs: false,
            dpad_up: false,
            dpad_down: false,
            dpad_left: false,
            dpad_right: false,
            lt: 0,
            rt: 0,
            thumb_lx: 0,
            thumb_ly: 0,
            thumb_rx: 0,
            thumb_ry: 0,
            large_motor_rumble: 0,
            small_motor_rumble: 0,
            packets_sent: 0,
        }
    }
}

/// Configurable DualSense hardware & DS4Windows mapping profile per controller slot.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct DualSenseProfileConfig {
    pub lightbar_r: u8,
    pub lightbar_g: u8,
    pub lightbar_b: u8,
    pub player_led_mask: u8,
    pub mute_led_mode: u8, // 0 = Off, 1 = Solid, 2 = Pulse
    pub left_trigger_effect: String, // "None" | "Rigid" | "Pulse" | "FullClick"
    pub left_trigger_start: u8,
    pub left_trigger_force: u8,
    pub right_trigger_effect: String, // "None" | "Rigid" | "Pulse" | "FullClick"
    pub right_trigger_start: u8,
    pub right_trigger_force: u8,
    pub left_deadzone: u8,
    pub right_deadzone: u8,
    pub l2_deadzone: u8,
    pub r2_deadzone: u8,
    pub rumble_strength: u8,
    pub test_heavy_rumble: u8,
    pub test_light_rumble: u8,
    pub touchpad_mouse_enabled: bool,
    pub touchpad_mouse_sensitivity: u16,
    pub touchpad_as_xbox_back: bool,
    pub hide_ps5_controller: bool,
}

impl Default for DualSenseProfileConfig {
    fn default() -> Self {
        Self::for_slot(0)
    }
}

impl DualSenseProfileConfig {
    pub fn for_slot(slot_index: u8) -> Self {
        let (r, g, b, mask) = match slot_index {
            0 => (0, 112, 255, 0x04),   // Player 1: PS5 Cobalt Blue, center LED
            1 => (239, 68, 68, 0x0A),   // Player 2: Crimson Red, 2 LEDs
            2 => (16, 185, 129, 0x15),  // Player 3: Emerald Green, 3 LEDs
            _ => (168, 85, 247, 0x1B),  // Player 4: Cyber Purple, 4 LEDs
        };
        Self {
            lightbar_r: r,
            lightbar_g: g,
            lightbar_b: b,
            player_led_mask: mask,
            mute_led_mode: 0,
            left_trigger_effect: "None".to_string(),
            left_trigger_start: 40,
            left_trigger_force: 180,
            right_trigger_effect: "None".to_string(),
            right_trigger_start: 40,
            right_trigger_force: 180,
            left_deadzone: 8,
            right_deadzone: 8,
            l2_deadzone: 0,
            r2_deadzone: 0,
            rumble_strength: 100,
            test_heavy_rumble: 0,
            test_light_rumble: 0,
            touchpad_mouse_enabled: true,
            touchpad_mouse_sensitivity: 100,
            touchpad_as_xbox_back: false,
            hide_ps5_controller: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DriverStatusInfo {
    pub vigembus_installed: bool,
    pub hidhide_installed: bool,
    pub exclusive_access_granted: bool,
    pub active_mode_label: String,
    pub status_message: String,
    pub logs: Vec<String>,
}

impl Default for DriverStatusInfo {
    fn default() -> Self {
        Self {
            vigembus_installed: false,
            hidhide_installed: false,
            exclusive_access_granted: false,
            active_mode_label: "PS5 DualSense Native Mode (Active in Games)".to_string(),
            status_message: "DualSense ready in native mode. Click 'Activate Xbox 360 Emulation' to cloak PS5, enable Touchpad Mouse, and spawn Virtual Xbox 360 controller.".to_string(),
            logs: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ControllerSlotSnapshot {
    pub slot_index: u8,
    pub dualsense: DualSenseRawInput,
    pub xbox: Xbox360EmulatedState,
    pub config: DualSenseProfileConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DualSenseTelemetrySnapshot {
    pub active_slot: u8,
    pub connected_count: u8,
    pub emulating_count: u8,
    pub slots: Vec<ControllerSlotSnapshot>,
    pub dualsense: DualSenseRawInput,
    pub xbox: Xbox360EmulatedState,
    pub config: DualSenseProfileConfig,
    pub driver_status: DriverStatusInfo,
}

/// Virtual / interactive input override per controller slot.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct VirtualControllerOverride {
    pub slot_index: u8,
    pub active: bool,
    /// True ONLY when a real hardware controller is actively present in `navigator.getGamepads()[slot_index]`.
    pub web_gamepad_connected: bool,
    pub cross: bool,
    pub circle: bool,
    pub square: bool,
    pub triangle: bool,
    pub l1: bool,
    pub r1: bool,
    pub l2: u8,
    pub r2: u8,
    pub create: bool,
    pub options: bool,
    pub l3: bool,
    pub r3: bool,
    pub ps: bool,
    pub touchpad_click: bool,
    pub touch1_active: bool,
    pub touch1_x: u16,
    pub touch1_y: u16,
    pub mute: bool,
    pub dpad_up: bool,
    pub dpad_down: bool,
    pub dpad_left: bool,
    pub dpad_right: bool,
    pub lx: u8,
    pub ly: u8,
    pub rx: u8,
    pub ry: u8,
}

impl Default for VirtualControllerOverride {
    fn default() -> Self {
        Self {
            slot_index: 0,
            active: false,
            web_gamepad_connected: false,
            cross: false,
            circle: false,
            square: false,
            triangle: false,
            l1: false,
            r1: false,
            l2: 0,
            r2: 0,
            create: false,
            options: false,
            l3: false,
            r3: false,
            ps: false,
            touchpad_click: false,
            touch1_active: false,
            touch1_x: 960,
            touch1_y: 540,
            mute: false,
            dpad_up: false,
            dpad_down: false,
            dpad_left: false,
            dpad_right: false,
            lx: 128,
            ly: 128,
            rx: 128,
            ry: 128,
        }
    }
}
