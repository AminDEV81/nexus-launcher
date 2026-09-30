pub struct BatteryMetrics {
    pub percent: Option<f32>,
    pub charging: Option<bool>,
}

pub struct BatteryTelemetryProvider;

impl BatteryTelemetryProvider {
    pub fn new() -> Self {
        Self
    }

    #[cfg(target_os = "windows")]
    pub fn poll(&mut self) -> BatteryMetrics {
        unsafe {
            use windows_sys::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};
            let mut status: SYSTEM_POWER_STATUS = std::mem::zeroed();
            if GetSystemPowerStatus(&mut status) != 0 {
                // 255 = unknown/no system battery
                if status.BatteryLifePercent != 255 {
                    let percent = status.BatteryLifePercent as f32;
                    let charging = (status.BatteryFlag & 8) != 0 || status.ACLineStatus == 1;
                    return BatteryMetrics {
                        percent: Some(percent),
                        charging: Some(charging),
                    };
                }
            }
        }
        BatteryMetrics {
            percent: None,
            charging: None,
        }
    }

    #[cfg(not(target_os = "windows"))]
    pub fn poll(&mut self) -> BatteryMetrics {
        BatteryMetrics {
            percent: None,
            charging: None,
        }
    }
}

impl Default for BatteryTelemetryProvider {
    fn default() -> Self {
        Self::new()
    }
}
