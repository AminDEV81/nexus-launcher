use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

fn default_true() -> bool {
    true
}

fn default_false() -> bool {
    false
}

fn default_theme_id() -> String {
    "cyberpunk".to_string()
}

fn default_position() -> String {
    "top-left".to_string()
}

fn default_opacity() -> f32 {
    0.95
}

fn default_scale() -> f32 {
    1.0
}

fn default_hotkey() -> String {
    "Ctrl+Shift+O".to_string()
}

fn default_refresh_interval() -> u64 {
    500
}

const VALID_POSITIONS: [&str; 6] = [
    "top-left",
    "top-right",
    "bottom-left",
    "bottom-right",
    "top-center",
    "bottom-center",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetricToggles {
    #[serde(default = "default_true")]
    pub fps: bool,
    #[serde(default = "default_true")]
    pub frametime: bool,
    #[serde(default = "default_true")]
    pub frametime_graph: bool,
    #[serde(default = "default_true")]
    pub fps_one_percent_low: bool,
    #[serde(default = "default_true")]
    pub fps_point_one_percent_low: bool,

    #[serde(default = "default_true")]
    pub cpu_usage: bool,
    #[serde(default = "default_true")]
    pub cpu_temp: bool,
    #[serde(default = "default_true")]
    pub cpu_clock: bool,
    #[serde(default = "default_false")]
    pub cpu_power: bool,
    #[serde(default = "default_false")]
    pub cpu_cores: bool,

    #[serde(default = "default_true")]
    pub gpu_usage: bool,
    #[serde(default = "default_true")]
    pub gpu_vram: bool,
    #[serde(default = "default_true")]
    pub gpu_temp: bool,
    /// GPU hotspot / junction temperature.
    #[serde(default = "default_true")]
    pub gpu_hotspot: bool,
    /// VRAM (memory junction) temperature.
    #[serde(default = "default_false")]
    pub gpu_memory_temp: bool,
    #[serde(default = "default_true")]
    pub gpu_clock: bool,
    #[serde(default = "default_false")]
    pub gpu_fan: bool,
    #[serde(default = "default_false")]
    pub gpu_power: bool,

    #[serde(default = "default_true")]
    pub ram_used: bool,
    #[serde(default = "default_false")]
    pub ram_available: bool,
    #[serde(default = "default_true")]
    pub ram_percentage: bool,

    #[serde(default = "default_false")]
    pub disk_read: bool,
    #[serde(default = "default_false")]
    pub disk_write: bool,

    #[serde(default = "default_false")]
    pub network_download: bool,
    #[serde(default = "default_false")]
    pub network_upload: bool,
    #[serde(default = "default_true")]
    pub ping: bool,

    #[serde(default = "default_true")]
    pub battery: bool,
    #[serde(default = "default_true")]
    pub clock: bool,
    #[serde(default = "default_true")]
    pub game_session: bool,
}

impl Default for MetricToggles {
    fn default() -> Self {
        Self {
            fps: true,
            frametime: true,
            frametime_graph: true,
            fps_one_percent_low: true,
            fps_point_one_percent_low: true,

            cpu_usage: true,
            cpu_temp: true,
            cpu_clock: true,
            cpu_power: false,
            cpu_cores: false,

            gpu_usage: true,
            gpu_vram: true,
            gpu_temp: true,
            gpu_hotspot: true,
            gpu_memory_temp: false,
            gpu_clock: true,
            gpu_fan: false,
            gpu_power: false,

            ram_used: true,
            ram_available: false,
            ram_percentage: true,

            disk_read: false,
            disk_write: false,

            network_download: false,
            network_upload: false,
            ping: true,

            battery: true,
            clock: true,
            game_session: true,
        }
    }
}

/// In-game notification + hardware alert settings.
///
/// `#[serde(default)]` at container level: every missing field falls back
/// to `Default::default()`, so configs saved by older builds still load.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct NotificationSettings {
    pub enabled: bool,
    pub position: String,
    pub duration_ms: u64,
    pub max_visible: usize,
    /// Mirror the launcher's own toasts (downloads, gaming mode, errors…)
    /// into the overlay while a game is running.
    pub mirror_app_toasts: bool,
    /// Hardware alerts (temperature, VRAM, battery).
    pub alerts_enabled: bool,
    pub gpu_temp_warn_c: f32,
    pub gpu_hotspot_warn_c: f32,
    pub cpu_temp_warn_c: f32,
    pub vram_warn_percent: f32,
    pub low_battery_percent: f32,
}

impl Default for NotificationSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            position: "top-right".to_string(),
            duration_ms: 5000,
            max_visible: 4,
            mirror_app_toasts: true,
            alerts_enabled: true,
            gpu_temp_warn_c: 85.0,
            gpu_hotspot_warn_c: 100.0,
            cpu_temp_warn_c: 90.0,
            vram_warn_percent: 95.0,
            low_battery_percent: 15.0,
        }
    }
}

impl NotificationSettings {
    fn sanitize(&mut self) {
        if !VALID_POSITIONS.contains(&self.position.as_str()) {
            self.position = "top-right".to_string();
        }
        self.duration_ms = self.duration_ms.clamp(1500, 15000);
        self.max_visible = self.max_visible.clamp(1, 6);
        self.gpu_temp_warn_c = clamp_f32(self.gpu_temp_warn_c, 50.0, 120.0, 85.0);
        self.gpu_hotspot_warn_c = clamp_f32(self.gpu_hotspot_warn_c, 60.0, 130.0, 100.0);
        self.cpu_temp_warn_c = clamp_f32(self.cpu_temp_warn_c, 50.0, 120.0, 90.0);
        self.vram_warn_percent = clamp_f32(self.vram_warn_percent, 50.0, 100.0, 95.0);
        self.low_battery_percent = clamp_f32(self.low_battery_percent, 5.0, 50.0, 15.0);
    }
}

fn clamp_f32(value: f32, min: f32, max: f32, fallback: f32) -> f32 {
    if value.is_finite() {
        value.clamp(min, max)
    } else {
        fallback
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OverlayConfig {
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default = "default_theme_id")]
    pub theme_id: String,
    #[serde(default)]
    pub monitor_index: usize,
    #[serde(default = "default_position")]
    pub position: String,
    #[serde(default = "default_scale")]
    pub scale: f32,
    #[serde(default = "default_opacity")]
    pub opacity: f32,
    #[serde(default = "default_true")]
    pub click_through: bool,
    #[serde(default = "default_refresh_interval")]
    pub refresh_interval_ms: u64,
    #[serde(default = "default_hotkey")]
    pub hotkey: String,
    #[serde(default)]
    pub metrics: MetricToggles,
    #[serde(default)]
    pub notifications: NotificationSettings,
}

impl Default for OverlayConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            theme_id: "cyberpunk".to_string(),
            monitor_index: 0,
            position: "top-left".to_string(),
            scale: 1.0,
            opacity: 0.95,
            click_through: true,
            refresh_interval_ms: 500,
            hotkey: "Ctrl+Shift+O".to_string(),
            metrics: MetricToggles::default(),
            notifications: NotificationSettings::default(),
        }
    }
}

impl OverlayConfig {
    /// Clamps every user-controlled value into a safe range. Called on
    /// every save so a bad value can never reach the window/hotkey layer.
    pub fn sanitize(&mut self) {
        if self.theme_id.trim().is_empty() {
            self.theme_id = default_theme_id();
        }
        if !VALID_POSITIONS.contains(&self.position.as_str()) {
            self.position = default_position();
        }
        self.scale = clamp_f32(self.scale, 0.5, 2.0, 1.0);
        self.opacity = clamp_f32(self.opacity, 0.2, 1.0, 0.95);
        self.refresh_interval_ms = self.refresh_interval_ms.clamp(100, 5000);
        if super::hotkey::parse_hotkey(&self.hotkey).is_err() {
            self.hotkey = default_hotkey();
        }
        self.notifications.sanitize();
    }
}

pub struct ConfigStore;

impl ConfigStore {
    pub fn get(conn: &Connection) -> OverlayConfig {
        let res: Result<String, _> = conn.query_row(
            "SELECT config_json FROM overlay_config WHERE id = 'default'",
            [],
            |r| r.get(0),
        );

        match res {
            Ok(json_str) => {
                let mut cfg: OverlayConfig = serde_json::from_str(&json_str).unwrap_or_default();
                cfg.sanitize();
                cfg
            }
            Err(_) => {
                let default_cfg = OverlayConfig::default();
                let _ = Self::save(conn, &default_cfg);
                default_cfg
            }
        }
    }

    pub fn save(conn: &Connection, config: &OverlayConfig) -> Result<(), String> {
        let json_str = serde_json::to_string(config).map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO overlay_config (id, schema_version, config_json, updated_at)
             VALUES ('default', 1, ?1, datetime('now'))
             ON CONFLICT(id) DO UPDATE SET
                schema_version = 1,
                config_json = excluded.config_json,
                updated_at = excluded.updated_at",
            params![json_str],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }
}

/// Reads the persisted config using the app's managed database.
/// Falls back to defaults if the DB lock is unavailable.
pub fn current_config(app: &AppHandle) -> OverlayConfig {
    let db = app.state::<crate::db::Database>();
    let guard = db.connection.lock();
    match guard {
        Ok(conn) => ConfigStore::get(&conn),
        Err(_) => OverlayConfig::default(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_defaults() {
        let cfg = OverlayConfig::default();
        assert!(cfg.enabled);
        assert_eq!(cfg.theme_id, "cyberpunk");
        assert!(cfg.metrics.fps);
        assert!(cfg.metrics.cpu_usage);
        assert!(cfg.metrics.gpu_usage);
        assert!(cfg.metrics.gpu_hotspot);
        assert!(cfg.notifications.enabled);
    }

    #[test]
    fn test_old_config_without_new_fields_loads() {
        let json = r#"{"enabled":true,"theme_id":"matrix","metrics":{"fps":false}}"#;
        let cfg: OverlayConfig = serde_json::from_str(json).unwrap();
        assert_eq!(cfg.theme_id, "matrix");
        assert!(!cfg.metrics.fps);
        assert!(cfg.metrics.gpu_hotspot);
        assert_eq!(cfg.notifications.duration_ms, 5000);
    }

    #[test]
    fn test_sanitize_clamps_values() {
        let mut cfg = OverlayConfig {
            scale: 99.0,
            opacity: f32::NAN,
            refresh_interval_ms: 1,
            position: "nowhere".into(),
            hotkey: "garbage".into(),
            ..OverlayConfig::default()
        };
        cfg.notifications.duration_ms = 10;
        cfg.sanitize();
        assert_eq!(cfg.scale, 2.0);
        assert_eq!(cfg.opacity, 0.95);
        assert_eq!(cfg.refresh_interval_ms, 100);
        assert_eq!(cfg.position, "top-left");
        assert_eq!(cfg.hotkey, "Ctrl+Shift+O");
        assert_eq!(cfg.notifications.duration_ms, 1500);
    }
}
