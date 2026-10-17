pub mod crc32;
pub mod hid_driver;
pub mod hidhide;
pub mod models;
pub mod touchpad_mouse;
pub mod vigem_xbox;

use self::hid_driver::{build_dualsense_output_report, parse_dualsense_input_report};
use self::hidhide::{configure_hidhide_cloaking, is_hidhide_installed, re_enable_hid_device};
use self::models::{
    ControllerSlotSnapshot, DriverStatusInfo, DualSenseProfileConfig, DualSenseRawInput,
    DualSenseTelemetrySnapshot, VirtualControllerOverride, Xbox360EmulatedState,
    MAX_CONTROLLER_SLOTS,
};
use self::touchpad_mouse::TouchpadMouseTracker;
use self::vigem_xbox::{convert_dualsense_to_xbox360, VigemXbox360Client};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use std::time::{Duration, Instant};

struct ControllerSlotRuntime {
    dualsense: DualSenseRawInput,
    xbox: Xbox360EmulatedState,
    config: DualSenseProfileConfig,
    virtual_override: VirtualControllerOverride,
    vigem_client: VigemXbox360Client,
    mouse_tracker: TouchpadMouseTracker,
    output_dirty: bool,
    mode_changed: bool,
}

impl ControllerSlotRuntime {
    fn new(slot_index: u8) -> Self {
        Self {
            dualsense: DualSenseRawInput::for_slot(slot_index),
            xbox: Xbox360EmulatedState::for_slot(slot_index),
            config: DualSenseProfileConfig::for_slot(slot_index),
            virtual_override: VirtualControllerOverride {
                slot_index,
                ..Default::default()
            },
            vigem_client: VigemXbox360Client::new_for_slot(slot_index),
            mouse_tracker: TouchpadMouseTracker::new(),
            output_dirty: true,
            mode_changed: false,
        }
    }
}

struct InnerEngine {
    active_slot: u8,
    slots: Vec<ControllerSlotRuntime>,
    driver_status: DriverStatusInfo,
    force_rescan: bool,
}

impl InnerEngine {
    fn push_log(&mut self, msg: impl Into<String>) {
        let timestamp = chrono::Local::now().format("%H:%M:%S%.3f");
        let entry = format!("[{}] {}", timestamp, msg.into());
        self.driver_status.logs.insert(0, entry);
        if self.driver_status.logs.len() > 80 {
            self.driver_status.logs.truncate(80);
        }
    }

    fn build_snapshot(&self) -> DualSenseTelemetrySnapshot {
        let idx = (self.active_slot as usize).min(self.slots.len().saturating_sub(1));
        let mut slot_snaps = Vec::with_capacity(self.slots.len());
        let mut connected_count = 0u8;
        let mut emulating_count = 0u8;

        for s in &self.slots {
            if s.dualsense.connected {
                connected_count += 1;
            }
            if s.xbox.emulation_active {
                emulating_count += 1;
            }
            slot_snaps.push(ControllerSlotSnapshot {
                slot_index: s.dualsense.slot_index,
                dualsense: s.dualsense.clone(),
                xbox: s.xbox.clone(),
                config: s.config.clone(),
            });
        }

        let current = &self.slots[idx];
        DualSenseTelemetrySnapshot {
            active_slot: idx as u8,
            connected_count,
            emulating_count,
            slots: slot_snaps,
            dualsense: current.dualsense.clone(),
            xbox: current.xbox.clone(),
            config: current.config.clone(),
            driver_status: self.driver_status.clone(),
        }
    }
}

#[derive(Clone)]
pub struct DualSenseEngineState {
    inner: Arc<Mutex<InnerEngine>>,
    worker_started: Arc<AtomicBool>,
}

impl Default for DualSenseEngineState {
    fn default() -> Self {
        Self::new()
    }
}

impl DualSenseEngineState {
    pub fn new() -> Self {
        let vigembus_installed = VigemXbox360Client::is_driver_installed();
        let hidhide_installed = is_hidhide_installed();

        let mut driver_status = DriverStatusInfo {
            vigembus_installed,
            hidhide_installed,
            exclusive_access_granted: false,
            active_mode_label: "PS5 DualSense Native Mode (Active in Games)".to_string(),
            status_message: "Multi-Controller Engine Ready (Up to 4 Controllers). Activate Xbox 360 Emulation to cloak PS5, enable Touchpad Mouse (Left/Right Click), and spawn Virtual Xbox 360 Controllers.".to_string(),
            logs: Vec::new(),
        };

        let now_str = chrono::Local::now().format("%H:%M:%S%.3f");
        driver_status.logs.push(format!(
            "[{}] Multi-Controller DS4Windows Engine initialized (4 Slots, ViGEmBus: {}, HidHide: {}, Touchpad Mouse: Enabled).",
            now_str,
            if vigembus_installed { "Detected" } else { "Standby" },
            if hidhide_installed { "Detected" } else { "Exclusive-HID Mode" }
        ));

        let slots = (0..MAX_CONTROLLER_SLOTS)
            .map(|i| ControllerSlotRuntime::new(i as u8))
            .collect();

        let state = Self {
            inner: Arc::new(Mutex::new(InnerEngine {
                active_slot: 0,
                slots,
                driver_status,
                force_rescan: true,
            })),
            worker_started: Arc::new(AtomicBool::new(false)),
        };

        state.ensure_worker_started();
        state
    }

    pub fn ensure_worker_started(&self) {
        if self
            .worker_started
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
        {
            return;
        }

        let inner = self.inner.clone();
        std::thread::Builder::new()
            .name("dualsense-ds4windows-multi-engine".to_string())
            .spawn(move || {
                run_engine_loop(inner);
            })
            .ok();
    }
}

fn merge_virtual_override(
    hw: &DualSenseRawInput,
    ov: &VirtualControllerOverride,
) -> DualSenseRawInput {
    let mut merged = hw.clone();
    if !ov.active {
        return merged;
    }

    merged.cross |= ov.cross;
    merged.circle |= ov.circle;
    merged.square |= ov.square;
    merged.triangle |= ov.triangle;
    merged.l1 |= ov.l1;
    merged.r1 |= ov.r1;
    if ov.l2 > merged.l2 {
        merged.l2 = ov.l2;
    }
    if ov.r2 > merged.r2 {
        merged.r2 = ov.r2;
    }
    merged.l2_button = merged.l2 > 0;
    merged.r2_button = merged.r2 > 0;
    merged.create |= ov.create;
    merged.options |= ov.options;
    merged.l3 |= ov.l3;
    merged.r3 |= ov.r3;
    merged.ps |= ov.ps;
    merged.touchpad_click |= ov.touchpad_click;
    if ov.touch1_active {
        merged.touch1_active = true;
        merged.touch1_x = ov.touch1_x;
        merged.touch1_y = ov.touch1_y;
    }
    merged.mute |= ov.mute;
    merged.dpad_up |= ov.dpad_up;
    merged.dpad_down |= ov.dpad_down;
    merged.dpad_left |= ov.dpad_left;
    merged.dpad_right |= ov.dpad_right;

    if (ov.lx as i16 - 128).abs() > (merged.lx as i16 - 128).abs() {
        merged.lx = ov.lx;
    }
    if (ov.ly as i16 - 128).abs() > (merged.ly as i16 - 128).abs() {
        merged.ly = ov.ly;
    }
    if (ov.rx as i16 - 128).abs() > (merged.rx as i16 - 128).abs() {
        merged.rx = ov.rx;
    }
    if (ov.ry as i16 - 128).abs() > (merged.ry as i16 - 128).abs() {
        merged.ry = ov.ry;
    }

    merged
}

fn run_engine_loop(inner: Arc<Mutex<InnerEngine>>) {
    #[cfg(target_os = "windows")]
    let mut active_handles: [isize; MAX_CONTROLLER_SLOTS] = [-1; MAX_CONTROLLER_SLOTS];
    #[cfg(target_os = "windows")]
    let mut active_devs: [Option<hid_driver::DiscoveredSonyController>; MAX_CONTROLLER_SLOTS] =
        [None, None, None, None];

    let mut last_scan = Instant::now() - Duration::from_secs(10);
    let mut last_output_sent: [Instant; MAX_CONTROLLER_SLOTS] =
        [Instant::now() - Duration::from_secs(10); MAX_CONTROLLER_SLOTS];
    let mut last_rumbles: [(u8, u8); MAX_CONTROLLER_SLOTS] = [(0, 0); MAX_CONTROLLER_SLOTS];
    let mut hw_states: [DualSenseRawInput; MAX_CONTROLLER_SLOTS] = [
        DualSenseRawInput::for_slot(0),
        DualSenseRawInput::for_slot(1),
        DualSenseRawInput::for_slot(2),
        DualSenseRawInput::for_slot(3),
    ];
    #[cfg(target_os = "windows")]
    let mut read_buf = [0u8; 128];

    loop {
        let loop_start = Instant::now();

        let force_rescan = {
            let mut guard = inner.lock().unwrap();
            let fr = guard.force_rescan;
            guard.force_rescan = false;
            fr
        };

        // 1. Handle Windows Multi-Controller HID Enumeration, Hot-Unplug Verification & Shared/Exclusive Mode transitions
        #[cfg(target_os = "windows")]
        {
            for slot_idx in 0..MAX_CONTROLLER_SLOTS {
                let (mode_changed, emulation_active, hide_ps5) = {
                    let mut guard = inner.lock().unwrap();
                    let mc = guard.slots[slot_idx].mode_changed;
                    guard.slots[slot_idx].mode_changed = false;
                    (
                        mc,
                        guard.slots[slot_idx].xbox.emulation_active,
                        guard.slots[slot_idx].config.hide_ps5_controller,
                    )
                };

                if mode_changed && active_handles[slot_idx] != -1 {
                    crate::commands::dualsense::vigem_xbox::win32_vigem::close_handle(
                        active_handles[slot_idx],
                    );
                    active_handles[slot_idx] = -1;
                    if let Some(ref dev) = active_devs[slot_idx] {
                        let want_exclusive = emulation_active && hide_ps5;
                        let hidhide_ok =
                            configure_hidhide_cloaking(&dev.instance_id, want_exclusive);
                        if want_exclusive {
                            let _ = re_enable_hid_device(&dev.instance_id);
                        }
                        match hid_driver::win32_hid::open_controller_handle(
                            &dev.device_path,
                            want_exclusive,
                        ) {
                            Ok((h, is_excl)) => {
                                active_handles[slot_idx] = h;
                                let mut guard = inner.lock().unwrap();
                                guard.slots[slot_idx].xbox.ps5_hidden_exclusive =
                                    is_excl || hidhide_ok;
                                guard.slots[slot_idx].xbox.hidhide_active = hidhide_ok;
                                guard.driver_status.exclusive_access_granted =
                                    is_excl || hidhide_ok;
                                guard.slots[slot_idx].output_dirty = true;
                                guard.push_log(format!(
                                    "Controller #{} switched to {} mode.",
                                    slot_idx + 1,
                                    if emulation_active {
                                        "Xbox 360 Emulation + Touchpad Mouse (PS5 Cloaked)"
                                    } else {
                                        "Native PS5 Shared HID"
                                    }
                                ));
                            }
                            Err(e) => {
                                let mut guard = inner.lock().unwrap();
                                guard.push_log(format!(
                                    "Controller #{} handle transition warning: {}",
                                    slot_idx + 1,
                                    e
                                ));
                            }
                        }
                    }
                }
            }

            // Periodic hot-plug & hot-unplug verification every 1000ms
            if last_scan.elapsed() >= Duration::from_millis(1000) || force_rescan {
                last_scan = Instant::now();
                let found = hid_driver::win32_hid::enumerate_sony_controllers();

                // First: check if any currently open slot's physical controller was unplugged from the system!
                for slot_idx in 0..MAX_CONTROLLER_SLOTS {
                    if active_handles[slot_idx] != -1 {
                        let still_present = active_devs[slot_idx].as_ref().map_or(false, |open_dev| {
                            found.iter().any(|f| {
                                f.device_path.eq_ignore_ascii_case(&open_dev.device_path)
                            })
                        });
                        if !still_present {
                            crate::commands::dualsense::vigem_xbox::win32_vigem::close_handle(
                                active_handles[slot_idx],
                            );
                            active_handles[slot_idx] = -1;
                            active_devs[slot_idx] = None;
                            hw_states[slot_idx] = DualSenseRawInput::for_slot(slot_idx as u8);
                            let mut guard = inner.lock().unwrap();
                            guard.slots[slot_idx].virtual_override.web_gamepad_connected = false;
                            guard.slots[slot_idx].virtual_override.active = false;
                            guard.push_log(format!(
                                "Slot #{}: Controller unplugged from system — status updated to Disconnected.",
                                slot_idx + 1
                            ));
                        }
                    }
                }

                // Second: connect any newly plugged-in controllers to free slots
                for dev in found {
                    let already_open = (0..MAX_CONTROLLER_SLOTS).any(|idx| {
                        active_handles[idx] != -1
                            && active_devs[idx].as_ref().map_or(false, |d| {
                                d.device_path.eq_ignore_ascii_case(&dev.device_path)
                                    || (d.serial_mac != "00:00:00:00:00:00"
                                        && d.serial_mac == dev.serial_mac)
                            })
                    });
                    if already_open {
                        continue;
                    }

                    if let Some(free_slot) =
                        (0..MAX_CONTROLLER_SLOTS).find(|&idx| active_handles[idx] == -1)
                    {
                        let (emulation_active, hide_ps5) = {
                            let guard = inner.lock().unwrap();
                            (
                                guard.slots[free_slot].xbox.emulation_active,
                                guard.slots[free_slot].config.hide_ps5_controller,
                            )
                        };
                        let want_exclusive = emulation_active && hide_ps5;
                        let hidhide_ok =
                            configure_hidhide_cloaking(&dev.instance_id, want_exclusive);
                        if want_exclusive {
                            let _ = re_enable_hid_device(&dev.instance_id);
                        }
                        if let Ok((h, is_excl)) = hid_driver::win32_hid::open_controller_handle(
                            &dev.device_path,
                            want_exclusive,
                        ) {
                            active_handles[free_slot] = h;
                            hw_states[free_slot] = DualSenseRawInput::for_slot(free_slot as u8);
                            hw_states[free_slot].connected = true;
                            hw_states[free_slot].battery_percent = 85;
                            hw_states[free_slot].connection_type = if dev.is_bluetooth {
                                "Bluetooth".to_string()
                            } else {
                                "USB".to_string()
                            };
                            hw_states[free_slot].device_name =
                                format!("{} #{}", dev.product_name, free_slot + 1);
                            hw_states[free_slot].device_path = dev.device_path.clone();
                            hw_states[free_slot].instance_id = dev.instance_id.clone();
                            hw_states[free_slot].mac_address = dev.serial_mac.clone();
                            hw_states[free_slot].vendor_id = dev.vendor_id;
                            hw_states[free_slot].product_id = dev.product_id;

                            let mut guard = inner.lock().unwrap();
                            guard.slots[free_slot].xbox.ps5_hidden_exclusive =
                                is_excl || hidhide_ok;
                            guard.slots[free_slot].xbox.hidhide_active = hidhide_ok;
                            guard.slots[free_slot].output_dirty = true;
                            guard.push_log(format!(
                                "Slot #{}: Connected {} ({}, MAC {})",
                                free_slot + 1,
                                dev.product_name,
                                hw_states[free_slot].connection_type,
                                dev.serial_mac
                            ));
                            active_devs[free_slot] = Some(dev);
                        }
                    }
                }
            }

            // 2. Read raw HID input reports across all connected controller slots
            for slot_idx in 0..MAX_CONTROLLER_SLOTS {
                if active_handles[slot_idx] != -1 {
                    if let Some(ref dev) = active_devs[slot_idx] {
                        let read_len = (dev.input_report_len as usize).min(read_buf.len());
                        match hid_driver::win32_hid::read_hid_report_overlapped(
                            active_handles[slot_idx],
                            &mut read_buf[..read_len],
                            3,
                        ) {
                            Ok(bytes_read) if bytes_read >= 64 => {
                                let _ = parse_dualsense_input_report(
                                    &read_buf[..bytes_read],
                                    dev.is_bluetooth,
                                    &mut hw_states[slot_idx],
                                );
                                hw_states[slot_idx].connected = true;
                                hw_states[slot_idx].input_latency_us =
                                    loop_start.elapsed().as_micros().max(400) as u64;
                            }
                            Ok(_) => {}
                            Err(_) => {
                                crate::commands::dualsense::vigem_xbox::win32_vigem::close_handle(
                                    active_handles[slot_idx],
                                );
                                active_handles[slot_idx] = -1;
                                active_devs[slot_idx] = None;
                                hw_states[slot_idx] = DualSenseRawInput::for_slot(slot_idx as u8);
                                let mut guard = inner.lock().unwrap();
                                guard.slots[slot_idx].virtual_override.web_gamepad_connected =
                                    false;
                                guard.slots[slot_idx].virtual_override.active = false;
                                guard.push_log(format!(
                                    "Slot #{}: Physical DualSense controller disconnected.",
                                    slot_idx + 1
                                ));
                            }
                        }
                    }
                }
            }
        }

        #[cfg(not(target_os = "windows"))]
        {
            let _ = (last_scan, force_rescan);
        }

        // 3. Process all 4 slots: merge virtual override, run Touchpad Mouse engine, submit Xbox 360 reports
        let mut any_connected_or_emulating = false;
        let mut guard = inner.lock().unwrap();
        for slot_idx in 0..MAX_CONTROLLER_SLOTS {
            let slot = &mut guard.slots[slot_idx];
            let mut final_ds =
                merge_virtual_override(&hw_states[slot_idx], &slot.virtual_override);

            // Only mark connected if physically connected via Win32 HID OR actively connected via Web Gamepad API
            if hw_states[slot_idx].connected {
                final_ds.connected = true;
            } else if slot.virtual_override.web_gamepad_connected {
                final_ds.connected = true;
                final_ds.connection_type = "Gamepad".to_string();
                if final_ds.battery_percent == 0 {
                    final_ds.battery_percent = 100;
                }
            } else {
                final_ds.connected = false;
                final_ds.connection_type = "Disconnected".to_string();
                final_ds.battery_percent = 0;
            }

            let emulation_active = slot.xbox.emulation_active;
            if final_ds.connected || emulation_active || slot.virtual_override.active {
                any_connected_or_emulating = true;
            }

            let (m_left, m_right) =
                slot.mouse_tracker
                    .process_frame(&final_ds, &slot.config, emulation_active);
            final_ds.mouse_left_click = m_left;
            final_ds.mouse_right_click = m_right;

            let vigem_connected = slot.vigem_client.is_plugged_in();
            let large_motor = slot.vigem_client.large_motor.load(Ordering::Relaxed);
            let small_motor = slot.vigem_client.small_motor.load(Ordering::Relaxed);
            let led_number = slot.vigem_client.led_number.load(Ordering::Relaxed);
            let packets_sent = slot.vigem_client.packets_sent.load(Ordering::Relaxed);

            let ps5_hidden_exclusive = if emulation_active {
                slot.xbox.ps5_hidden_exclusive || slot.config.hide_ps5_controller
            } else {
                false
            };
            let hidhide_active = slot.xbox.hidhide_active;

            let (xbox_state, xusb_report) = convert_dualsense_to_xbox360(
                &final_ds,
                &slot.config,
                emulation_active,
                vigem_connected,
                led_number,
                ps5_hidden_exclusive,
                hidhide_active,
                large_motor,
                small_motor,
                packets_sent,
            );

            if emulation_active && vigem_connected {
                let _ = slot.vigem_client.submit_report(&xusb_report);
            }

            slot.dualsense = final_ds;
            slot.xbox = xbox_state;

            let rumble_changed = (large_motor, small_motor) != last_rumbles[slot_idx];
            let should_send_output = slot.output_dirty
                || rumble_changed
                || last_output_sent[slot_idx].elapsed() >= Duration::from_secs(2);

            if should_send_output {
                slot.output_dirty = false;
                last_rumbles[slot_idx] = (large_motor, small_motor);
                last_output_sent[slot_idx] = Instant::now();

                #[cfg(target_os = "windows")]
                if active_handles[slot_idx] != -1 {
                    if let Some(ref dev) = active_devs[slot_idx] {
                        let report = build_dualsense_output_report(
                            &slot.config,
                            large_motor,
                            small_motor,
                            dev.is_bluetooth,
                            dev.output_report_len as usize,
                        );
                        let _ = hid_driver::win32_hid::write_hid_report_overlapped(
                            active_handles[slot_idx],
                            &report,
                            12,
                        );
                    }
                }
            }
        }
        drop(guard);

        // Adaptive sleep: 4ms (250Hz) when a controller is connected/active, 35ms (~28Hz) when idle to keep CPU usage near 0%
        let target_sleep = if any_connected_or_emulating {
            Duration::from_millis(4)
        } else {
            Duration::from_millis(35)
        };
        let elapsed = loop_start.elapsed();
        if elapsed < target_sleep {
            std::thread::sleep(target_sleep - elapsed);
        }
    }
}

// ============================================================================
// Tauri Commands exposed to the React Frontend
// ============================================================================

#[tauri::command]
pub fn dualsense_get_state(
    state: tauri::State<'_, DualSenseEngineState>,
) -> Result<DualSenseTelemetrySnapshot, String> {
    state.ensure_worker_started();
    let guard = state.inner.lock().map_err(|e| e.to_string())?;
    Ok(guard.build_snapshot())
}

#[tauri::command]
pub fn dualsense_select_slot(
    slot_index: u8,
    state: tauri::State<'_, DualSenseEngineState>,
) -> Result<DualSenseTelemetrySnapshot, String> {
    state.ensure_worker_started();
    let mut guard = state.inner.lock().map_err(|e| e.to_string())?;
    guard.active_slot = slot_index.min((MAX_CONTROLLER_SLOTS - 1) as u8);
    Ok(guard.build_snapshot())
}

#[tauri::command]
pub fn dualsense_set_xbox_emulation(
    enabled: bool,
    slot_index: Option<u8>,
    all_slots: Option<bool>,
    state: tauri::State<'_, DualSenseEngineState>,
) -> Result<DualSenseTelemetrySnapshot, String> {
    state.ensure_worker_started();
    let mut guard = state.inner.lock().map_err(|e| e.to_string())?;

    let target_indices: Vec<usize> = if all_slots.unwrap_or(false) {
        (0..MAX_CONTROLLER_SLOTS).collect()
    } else {
        let idx = slot_index.unwrap_or(guard.active_slot) as usize;
        vec![idx.min(MAX_CONTROLLER_SLOTS - 1)]
    };

    let mut log_messages = Vec::new();
    let mut any_vigem_ok = false;

    for idx in target_indices {
        let slot = &mut guard.slots[idx];
        if enabled {
            match slot.vigem_client.connect_and_plug_in() {
                Ok(msg) => {
                    log_messages.push(format!("Slot #{}: {}", idx + 1, msg));
                    any_vigem_ok = true;
                }
                Err(err) => {
                    log_messages.push(format!(
                        "Slot #{}: ViGEmBus notice ({}) — Xbox 360 XInput & Touchpad Mouse active.",
                        idx + 1,
                        err
                    ));
                }
            }

            let inst_id = slot.dualsense.instance_id.clone();
            let hide_ok = if !inst_id.is_empty() && slot.config.hide_ps5_controller {
                configure_hidhide_cloaking(&inst_id, true)
            } else {
                false
            };

            slot.xbox.emulation_active = true;
            slot.xbox.vigem_connected = slot.vigem_client.is_plugged_in();
            slot.xbox.hidhide_active = hide_ok;
            slot.xbox.ps5_hidden_exclusive = slot.config.hide_ps5_controller;
            slot.mode_changed = true;
            slot.output_dirty = true;
        } else {
            slot.vigem_client.unplug_and_disconnect();
            let inst_id = slot.dualsense.instance_id.clone();
            if !inst_id.is_empty() {
                let _ = configure_hidhide_cloaking(&inst_id, false);
            }

            slot.xbox.emulation_active = false;
            slot.xbox.vigem_connected = false;
            slot.xbox.hidhide_active = false;
            slot.xbox.ps5_hidden_exclusive = false;
            slot.mode_changed = true;
            slot.output_dirty = true;
            log_messages.push(format!(
                "Slot #{}: Restored to Native PS5 DualSense Mode.",
                idx + 1
            ));
        }
    }

    if any_vigem_ok {
        guard.driver_status.vigembus_installed = true;
    }
    for msg in log_messages {
        guard.push_log(msg);
    }

    let any_active = guard.slots.iter().any(|s| s.xbox.emulation_active);
    guard.driver_status.exclusive_access_granted = any_active;
    if any_active {
        guard.driver_status.active_mode_label =
            "Xbox 360 Emulation + Touchpad Mouse Active (PS5 Cloaked)".to_string();
        guard.driver_status.status_message =
            "Xbox 360 Emulation ACTIVE: PS5 DualSense is hidden from games, Virtual Xbox 360 Controller is active, and PS5 Touchpad acts as Windows Mouse (Left/Right Click).".to_string();
    } else {
        guard.driver_status.active_mode_label =
            "PS5 DualSense Native Mode (Active in Games)".to_string();
        guard.driver_status.status_message =
            "Native PS5 Mode ACTIVE: Games detect your PS5 DualSense controller(s) directly.".to_string();
    }

    Ok(guard.build_snapshot())
}

#[tauri::command]
pub fn dualsense_update_config(
    config: DualSenseProfileConfig,
    slot_index: Option<u8>,
    state: tauri::State<'_, DualSenseEngineState>,
) -> Result<DualSenseTelemetrySnapshot, String> {
    state.ensure_worker_started();
    let mut guard = state.inner.lock().map_err(|e| e.to_string())?;
    let idx = (slot_index.unwrap_or(guard.active_slot) as usize).min(MAX_CONTROLLER_SLOTS - 1);
    let hide_changed =
        guard.slots[idx].config.hide_ps5_controller != config.hide_ps5_controller;
    guard.slots[idx].config = config;
    guard.slots[idx].output_dirty = true;
    if hide_changed && guard.slots[idx].xbox.emulation_active {
        guard.slots[idx].mode_changed = true;
    }
    Ok(guard.build_snapshot())
}

#[tauri::command]
pub fn dualsense_set_virtual_override(
    override_state: VirtualControllerOverride,
    state: tauri::State<'_, DualSenseEngineState>,
) -> Result<DualSenseTelemetrySnapshot, String> {
    state.ensure_worker_started();
    let mut guard = state.inner.lock().map_err(|e| e.to_string())?;
    let idx = (override_state.slot_index as usize).min(MAX_CONTROLLER_SLOTS - 1);
    let slot = &mut guard.slots[idx];
    let was_web_pad = slot.virtual_override.web_gamepad_connected;
    let now_web_pad = override_state.web_gamepad_connected;

    // Reset baseline DualSense buttons/axes before applying the new override so released buttons clear immediately
    if !slot.dualsense.device_path.is_empty() {
        // Physical Win32 HID is connected: keep its hardware state
    } else {
        let mut clean = DualSenseRawInput::for_slot(idx as u8);
        if now_web_pad {
            clean.connected = true;
            clean.connection_type = "Gamepad".to_string();
            clean.battery_percent = 100;
        }
        slot.dualsense = clean;
    }

    slot.virtual_override = override_state;
    let mut effective_ds = merge_virtual_override(&slot.dualsense, &slot.virtual_override);
    if slot.dualsense.device_path.is_empty() {
        effective_ds.connected = now_web_pad;
        effective_ds.connection_type = if now_web_pad {
            "Gamepad".to_string()
        } else {
            "Disconnected".to_string()
        };
        effective_ds.battery_percent = if now_web_pad { 100 } else { 0 };
    }

    let emu_active = slot.xbox.emulation_active;
    let (m_left, m_right) =
        slot.mouse_tracker
            .process_frame(&effective_ds, &slot.config, emu_active);
    effective_ds.mouse_left_click = m_left;
    effective_ds.mouse_right_click = m_right;

    let vigem_conn = slot.vigem_client.is_plugged_in();
    let led_num = slot.vigem_client.led_number.load(Ordering::Relaxed);
    let ps5_excl = slot.xbox.ps5_hidden_exclusive;
    let hh_active = slot.xbox.hidhide_active;
    let large_m = slot.vigem_client.large_motor.load(Ordering::Relaxed);
    let small_m = slot.vigem_client.small_motor.load(Ordering::Relaxed);
    let pkts = slot.vigem_client.packets_sent.load(Ordering::Relaxed);

    let (xbox_state, xusb_report) = convert_dualsense_to_xbox360(
        &effective_ds,
        &slot.config,
        emu_active,
        vigem_conn,
        led_num,
        ps5_excl,
        hh_active,
        large_m,
        small_m,
        pkts,
    );
    if emu_active && vigem_conn {
        let _ = slot.vigem_client.submit_report(&xusb_report);
    }
    slot.dualsense = effective_ds;
    slot.xbox = xbox_state;

    if was_web_pad && !now_web_pad {
        guard.push_log(format!(
            "Slot #{}: Controller disconnected.",
            idx + 1
        ));
    }

    Ok(guard.build_snapshot())
}

#[tauri::command]
pub fn dualsense_scan_devices(
    state: tauri::State<'_, DualSenseEngineState>,
) -> Result<DualSenseTelemetrySnapshot, String> {
    state.ensure_worker_started();
    let mut guard = state.inner.lock().map_err(|e| e.to_string())?;
    guard.force_rescan = true;
    guard.driver_status.vigembus_installed = VigemXbox360Client::is_driver_installed();
    guard.driver_status.hidhide_installed = is_hidhide_installed();
    guard.push_log("Rescanning all USB & Bluetooth HID controller ports (Slots 1-4)...".to_string());
    Ok(guard.build_snapshot())
}

#[tauri::command]
pub fn dualsense_trigger_rumble_test(
    heavy_motor: u8,
    light_motor: u8,
    duration_ms: u64,
    slot_index: Option<u8>,
    state: tauri::State<'_, DualSenseEngineState>,
) -> Result<(), String> {
    state.ensure_worker_started();
    let target_idx = {
        let mut guard = state.inner.lock().map_err(|e| e.to_string())?;
        let idx = (slot_index.unwrap_or(guard.active_slot) as usize).min(MAX_CONTROLLER_SLOTS - 1);
        guard.slots[idx].config.test_heavy_rumble = heavy_motor;
        guard.slots[idx].config.test_light_rumble = light_motor;
        guard.slots[idx].output_dirty = true;
        guard.push_log(format!(
            "Slot #{}: Testing Dual Rumble Haptics (Heavy={}, Fast={}, {}ms)",
            idx + 1,
            heavy_motor,
            light_motor,
            duration_ms
        ));
        idx
    };

    let inner = state.inner.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(duration_ms.clamp(50, 3000)));
        if let Ok(mut guard) = inner.lock() {
            guard.slots[target_idx].config.test_heavy_rumble = 0;
            guard.slots[target_idx].config.test_light_rumble = 0;
            guard.slots[target_idx].output_dirty = true;
        }
    });

    Ok(())
}

#[tauri::command]
pub fn dualsense_install_driver(
    driver_type: String,
    state: tauri::State<'_, DualSenseEngineState>,
) -> Result<DualSenseTelemetrySnapshot, String> {
    state.ensure_worker_started();
    let pkg_id = match driver_type.as_str() {
        "hidhide" => "Nefarius.HidHide",
        _ => "Nefarius.ViGEmBus",
    };

    #[cfg(target_os = "windows")]
    {
        let ps_arg = format!(
            "Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -Command \"winget install --id {} -e --accept-source-agreements --accept-package-agreements\"'",
            pkg_id
        );
        let _ = std::process::Command::new("powershell")
            .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", &ps_arg])
            .spawn();
    }

    let mut guard = state.inner.lock().map_err(|e| e.to_string())?;
    guard.push_log(format!(
        "Launched elevated WinGet installer for {} ({})...",
        driver_type, pkg_id
    ));
    Ok(guard.build_snapshot())
}
