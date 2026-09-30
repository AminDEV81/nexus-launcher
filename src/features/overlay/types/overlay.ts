export type OverlayPosition =
  'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top-center' | 'bottom-center'

export type OverlayThemeId =
  // Iconic Gaming
  | 'cyberpunk'
  | 'afterburner'
  | 'adrenalin'
  | 'geforce'
  | 'mangohud'
  | 'steam_deck'
  // Clean & Modern
  | 'frosted_glass'
  | 'minimal_horizon'
  | 'oled_stealth'
  | 'monolith'
  | 'carbon_titanium'
  // Sci-Fi & Futuristic
  | 'spaceship_cockpit'
  | 'arc_reactor'
  | 'quantum_core'
  | 'holo_circular'
  | 'solar_flare'
  // Retro & Synth
  | 'retro_synthwave'
  | 'arcade_crt'
  | 'vaporwave'
  | 'matrix'
  | 'terminal_cli'
  // Esports & Compact
  | 'apex_tactical'
  | 'forza_telemetry'
  | 'esports_pro'
  | 'corner_mini'
  | 'docked_strip'
  // Thematic & Expressive
  | 'cyber_samurai'
  | 'nordic_frost'
  | 'blueprint'
  | 'steampunk'

export type ThemeCategory = 'all' | 'iconic' | 'modern' | 'scifi' | 'retro' | 'esports' | 'thematic'

export type LayoutKind =
  | 'horizontal-bar'
  | 'vertical-strip'
  | 'modular-cards'
  | 'bracket-hud'
  | 'compact-badge'
  | 'radial-gauges'

export interface MetricToggles {
  fps: boolean
  frametime: boolean
  frametime_graph: boolean
  fps_one_percent_low: boolean
  fps_point_one_percent_low: boolean

  cpu_usage: boolean
  cpu_temp: boolean
  cpu_clock: boolean
  cpu_power: boolean
  cpu_cores: boolean

  gpu_usage: boolean
  gpu_vram: boolean
  gpu_temp: boolean
  gpu_hotspot: boolean
  gpu_memory_temp: boolean
  gpu_clock: boolean
  gpu_fan: boolean
  gpu_power: boolean

  ram_used: boolean
  ram_available: boolean
  ram_percentage: boolean

  disk_read: boolean
  disk_write: boolean

  network_download: boolean
  network_upload: boolean
  ping: boolean

  battery: boolean
  clock: boolean
  game_session: boolean
}

export type NotificationKind = 'info' | 'success' | 'warning' | 'error'

export interface NotificationSettings {
  enabled: boolean
  position: OverlayPosition
  duration_ms: number
  max_visible: number
  mirror_app_toasts: boolean
  alerts_enabled: boolean
  gpu_temp_warn_c: number
  gpu_hotspot_warn_c: number
  cpu_temp_warn_c: number
  vram_warn_percent: number
  low_battery_percent: number
}

export interface OverlayNotification {
  id?: string | null
  kind: NotificationKind
  title: string
  body?: string | null
  duration_ms?: number | null
  /** 'app' = mirrored launcher toast (gated by the mirror setting). */
  source?: 'app' | null
}

export interface HotkeyStatus {
  hotkey: string
  registered: boolean
  error: string | null
}

export interface OverlayConfig {
  enabled: boolean
  theme_id: OverlayThemeId
  position: OverlayPosition
  opacity: number
  scale: number
  monitor_index: number
  hotkey: string
  click_through: boolean
  refresh_interval_ms: number
  metrics: MetricToggles
  notifications: NotificationSettings
}

export interface OverlayMetrics {
  timestamp: number
  fps: number | null
  frametime_ms: number | null
  fps_one_percent_low: number | null
  fps_point_one_percent_low: number | null
  frametime_history: number[]

  cpu_usage: number | null
  cpu_temp: number | null
  cpu_clock_ghz: number | null
  cpu_power_w: number | null
  cpu_cores: number | null

  gpu_name: string | null
  gpu_usage: number | null
  gpu_vram_used_bytes: number | null
  gpu_vram_total_bytes: number | null
  gpu_temp: number | null
  gpu_hotspot_temp: number | null
  gpu_memory_temp: number | null
  gpu_clock_mhz: number | null
  gpu_fan_percent: number | null
  gpu_power_w: number | null

  ram_used_bytes: number | null
  ram_total_bytes: number | null
  ram_available_bytes: number | null

  disk_read_bps: number | null
  disk_write_bps: number | null

  network_download_bps: number | null
  network_upload_bps: number | null
  ping_ms: number | null

  battery_percent: number | null
  battery_charging: boolean | null

  game_title: string | null
  session_seconds: number | null
}

export interface MonitorDto {
  index: number
  name: string
  width: number
  height: number
  is_primary: boolean
}

export interface TelemetryProviderStatus {
  cpu: boolean
  gpu: boolean
  memory: boolean
  frame_timing: boolean
  storage: boolean
  network: boolean
  battery: boolean
  active_game: boolean
  /** Why FPS is unavailable (e.g. missing administrator rights). */
  frame_timing_error: string | null
  /** Where the CPU temperature comes from; `null` when unavailable. */
  cpu_temp_source: string | null
}

export interface ThemeDefinition {
  id: OverlayThemeId
  name: string
  category: ThemeCategory
  description: string
  layout: LayoutKind
  previewGradient: string
  accentColor: string
  tags: string[]
}
