//! DS4Windows Touchpad-as-Mouse Engine (`DS4Control/Mouse.cs` & `MouseCursor.cs`).
//! When Xbox 360 Emulation is active (`emulation_active == true`) and `touchpad_mouse_enabled` is true:
//! - Sliding 1 finger across the DualSense touchpad (`1920x1080`) moves the Windows cursor via `SendInput(MOUSEEVENTF_MOVE)`.
//! - Sliding 2 fingers vertically scrolls via `SendInput(MOUSEEVENTF_WHEEL)`.
//! - Pressing/clicking the LEFT half of the touchpad (`touch1_x < 960`) triggers Left Mouse Button (`MOUSEEVENTF_LEFTDOWN` / `MOUSEEVENTF_LEFTUP`).
//! - Pressing/clicking the RIGHT half of the touchpad (`touch1_x >= 960`) triggers Right Mouse Button (`MOUSEEVENTF_RIGHTDOWN` / `MOUSEEVENTF_RIGHTUP`).

use super::models::{DualSenseProfileConfig, DualSenseRawInput};

#[allow(dead_code)] // Documents the DualSense touchpad resolution.
pub const TOUCHPAD_WIDTH: u16 = 1920;
#[allow(dead_code)]
pub const TOUCHPAD_HEIGHT: u16 = 1080;
pub const TOUCHPAD_MID_X: u16 = 960;

#[derive(Debug, Clone, Default)]
pub struct TouchpadMouseTracker {
    prev_touch1_active: bool,
    prev_touch1_id: u8,
    prev_touch1_x: u16,
    prev_touch1_y: u16,
    prev_touch2_active: bool,
    prev_touch2_y: u16,
    rem_x: f32,
    rem_y: f32,
    rem_wheel: f32,
    pub left_mouse_down: bool,
    pub right_mouse_down: bool,
    pub virtual_cursor_x: f32,
    pub virtual_cursor_y: f32,
    initialized: bool,
}

impl TouchpadMouseTracker {
    pub fn new() -> Self {
        Self {
            virtual_cursor_x: 960.0,
            virtual_cursor_y: 540.0,
            initialized: true,
            ..Default::default()
        }
    }

    /// Processes a single DualSense input frame and synthesizes real Windows mouse movements
    /// and Left/Right clicks when `emulation_active && cfg.touchpad_mouse_enabled`.
    pub fn process_frame(
        &mut self,
        ds: &DualSenseRawInput,
        cfg: &DualSenseProfileConfig,
        emulation_active: bool,
    ) -> (bool, bool) {
        if !self.initialized {
            self.virtual_cursor_x = 960.0;
            self.virtual_cursor_y = 540.0;
            self.initialized = true;
        }

        // If Xbox emulation is stopped or touchpad-as-mouse is disabled, release any held mouse buttons
        if !emulation_active || !cfg.touchpad_mouse_enabled {
            if self.left_mouse_down {
                send_mouse_button(false, false);
                self.left_mouse_down = false;
            }
            if self.right_mouse_down {
                send_mouse_button(true, false);
                self.right_mouse_down = false;
            }
            self.prev_touch1_active = ds.touch1_active;
            self.prev_touch1_id = ds.touch1_id;
            self.prev_touch1_x = ds.touch1_x;
            self.prev_touch1_y = ds.touch1_y;
            self.prev_touch2_active = ds.touch2_active;
            self.prev_touch2_y = ds.touch2_y;
            return (false, false);
        }

        let sens = (cfg.touchpad_mouse_sensitivity.clamp(10, 300) as f32) / 100.0;

        // 1. Handle 2-finger vertical scroll wheel or 1-finger relative cursor movement
        if ds.touch1_active && ds.touch2_active {
            if self.prev_touch2_active {
                let dy = (ds.touch2_y as i32) - (self.prev_touch2_y as i32);
                if dy.abs() > 0 && dy.abs() < 250 {
                    let wheel_f = (-dy as f32) * 1.5 * sens + self.rem_wheel;
                    let wheel_int = wheel_f.trunc() as i32;
                    self.rem_wheel = wheel_f - (wheel_int as f32);
                    if wheel_int != 0 {
                        send_mouse_wheel(wheel_int);
                    }
                }
            }
        } else if ds.touch1_active {
            if self.prev_touch1_active && self.prev_touch1_id == ds.touch1_id {
                let raw_dx = (ds.touch1_x as i32) - (self.prev_touch1_x as i32);
                let raw_dy = (ds.touch1_y as i32) - (self.prev_touch1_y as i32);

                // Guard against capacitive wrap/jump on initial touch contact
                if raw_dx.abs() < 320 && raw_dy.abs() < 320 && (raw_dx != 0 || raw_dy != 0) {
                    let scaled_x = (raw_dx as f32) * 1.15 * sens + self.rem_x;
                    let scaled_y = (raw_dy as f32) * 1.15 * sens + self.rem_y;
                    let move_x = scaled_x.trunc() as i32;
                    let move_y = scaled_y.trunc() as i32;
                    self.rem_x = scaled_x - (move_x as f32);
                    self.rem_y = scaled_y - (move_y as f32);

                    if move_x != 0 || move_y != 0 {
                        send_mouse_move(move_x, move_y);
                        self.virtual_cursor_x =
                            (self.virtual_cursor_x + move_x as f32).clamp(0.0, 1920.0);
                        self.virtual_cursor_y =
                            (self.virtual_cursor_y + move_y as f32).clamp(0.0, 1080.0);
                    }
                }
            } else {
                self.rem_x = 0.0;
                self.rem_y = 0.0;
            }
        } else {
            self.rem_x = 0.0;
            self.rem_y = 0.0;
            self.rem_wheel = 0.0;
        }

        // 2. Handle Left Click vs. Right Click when the physical Touchpad button is pressed
        //    - Right side of touchpad (`touch1_x >= 960`) -> Right Mouse Click
        //    - Left side of touchpad (`touch1_x < 960`)  -> Left Mouse Click
        if ds.touchpad_click {
            let is_right_side = ds.touch1_x >= TOUCHPAD_MID_X;
            if !self.left_mouse_down && !self.right_mouse_down {
                if is_right_side {
                    self.right_mouse_down = true;
                    send_mouse_button(true, true);
                } else {
                    self.left_mouse_down = true;
                    send_mouse_button(false, true);
                }
            }
        } else {
            if self.left_mouse_down {
                self.left_mouse_down = false;
                send_mouse_button(false, false);
            }
            if self.right_mouse_down {
                self.right_mouse_down = false;
                send_mouse_button(true, false);
            }
        }

        self.prev_touch1_active = ds.touch1_active;
        self.prev_touch1_id = ds.touch1_id;
        self.prev_touch1_x = ds.touch1_x;
        self.prev_touch1_y = ds.touch1_y;
        self.prev_touch2_active = ds.touch2_active;
        self.prev_touch2_y = ds.touch2_y;

        (self.left_mouse_down, self.right_mouse_down)
    }
}

#[cfg(target_os = "windows")]
mod win32_mouse {
    #[repr(C)]
    #[derive(Clone, Copy)]
    pub struct MouseInput {
        pub dx: i32,
        pub dy: i32,
        pub mouse_data: u32,
        pub dw_flags: u32,
        pub time: u32,
        pub dw_extra_info: usize,
    }

    /// Exact Win32 `INPUT` layout (`sizeof(InputMouse) == 40` on x64 Windows, `28` on x86 Windows).
    #[repr(C)]
    #[derive(Clone, Copy)]
    pub struct InputMouse {
        pub r#type: u32, // INPUT_MOUSE = 0
        pub mi: MouseInput,
    }

    #[link(name = "user32")]
    extern "system" {
        pub fn SendInput(c_inputs: u32, p_inputs: *const InputMouse, cb_size: i32) -> u32;
    }

    pub const INPUT_MOUSE: u32 = 0;
    pub const MOUSEEVENTF_MOVE: u32 = 0x0001;
    pub const MOUSEEVENTF_LEFTDOWN: u32 = 0x0002;
    pub const MOUSEEVENTF_LEFTUP: u32 = 0x0004;
    pub const MOUSEEVENTF_RIGHTDOWN: u32 = 0x0008;
    pub const MOUSEEVENTF_RIGHTUP: u32 = 0x0010;
    pub const MOUSEEVENTF_WHEEL: u32 = 0x0800;

    pub fn send_input_flags(dx: i32, dy: i32, mouse_data: u32, dw_flags: u32) {
        let input = InputMouse {
            r#type: INPUT_MOUSE,
            mi: MouseInput {
                dx,
                dy,
                mouse_data,
                dw_flags,
                time: 0,
                dw_extra_info: 0,
            },
        };
        unsafe {
            let _ = SendInput(
                1,
                &input,
                std::mem::size_of::<InputMouse>() as i32,
            );
        }
    }
}

pub fn send_mouse_move(dx: i32, dy: i32) {
    #[cfg(target_os = "windows")]
    {
        win32_mouse::send_input_flags(dx, dy, 0, win32_mouse::MOUSEEVENTF_MOVE);
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (dx, dy);
    }
}

pub fn send_mouse_button(is_right: bool, down: bool) {
    #[cfg(target_os = "windows")]
    {
        let flag = match (is_right, down) {
            (false, true) => win32_mouse::MOUSEEVENTF_LEFTDOWN,
            (false, false) => win32_mouse::MOUSEEVENTF_LEFTUP,
            (true, true) => win32_mouse::MOUSEEVENTF_RIGHTDOWN,
            (true, false) => win32_mouse::MOUSEEVENTF_RIGHTUP,
        };
        win32_mouse::send_input_flags(0, 0, 0, flag);
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (is_right, down);
    }
}

pub fn send_mouse_wheel(delta: i32) {
    #[cfg(target_os = "windows")]
    {
        win32_mouse::send_input_flags(0, 0, delta as u32, win32_mouse::MOUSEEVENTF_WHEEL);
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = delta;
    }
}
