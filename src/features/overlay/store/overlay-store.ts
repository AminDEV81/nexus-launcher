import { create } from 'zustand'
import { listen } from '@tauri-apps/api/event'
import {
  getOverlayHotkeyStatus,
  isOverlayVisible,
  pushOverlayNotification,
} from '../services/overlay'
import {
  getOverlayConfig,
  getOverlayMetrics,
  getOverlayMonitors,
  getTelemetryStatus,
  saveOverlayConfig,
  setOverlayClickThrough,
  startOverlayTelemetry,
  stopOverlayTelemetry,
  toggleOverlayWindow,
} from '../services/overlay'
import type {
  HotkeyStatus,
  MetricToggles,
  NotificationSettings,
  OverlayNotification,
  MonitorDto,
  OverlayConfig,
  OverlayMetrics,
  OverlayPosition,
  OverlayThemeId,
  TelemetryProviderStatus,
  ThemeCategory,
} from '../types/overlay'

export const DEFAULT_CONFIG: OverlayConfig = {
  enabled: true,
  theme_id: 'cyberpunk',
  position: 'top-left',
  opacity: 0.95,
  scale: 1.0,
  monitor_index: 0,
  hotkey: 'Ctrl+Shift+O',
  click_through: true,
  refresh_interval_ms: 500,
  metrics: {
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
  },
  notifications: {
    enabled: true,
    position: 'top-right',
    duration_ms: 5000,
    max_visible: 4,
    mirror_app_toasts: true,
    alerts_enabled: true,
    gpu_temp_warn_c: 85,
    gpu_hotspot_warn_c: 100,
    cpu_temp_warn_c: 90,
    vram_warn_percent: 95,
    low_battery_percent: 15,
  },
}

/**
 * Merges a (possibly older / partial) config over the defaults so a config
 * saved before a field existed can never crash the overlay renderer.
 */
export function normalizeConfig(raw: Partial<OverlayConfig> | null | undefined): OverlayConfig {
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    metrics: { ...DEFAULT_CONFIG.metrics, ...raw?.metrics },
    notifications: { ...DEFAULT_CONFIG.notifications, ...raw?.notifications },
  }
}

/** All-empty metrics: what the real overlay shows before the first poll. */
export const EMPTY_METRICS: OverlayMetrics = {
  timestamp: 0,
  fps: null,
  frametime_ms: null,
  fps_one_percent_low: null,
  fps_point_one_percent_low: null,
  frametime_history: [],
  cpu_usage: null,
  cpu_temp: null,
  cpu_clock_ghz: null,
  cpu_power_w: null,
  cpu_cores: null,
  gpu_name: null,
  gpu_usage: null,
  gpu_vram_used_bytes: null,
  gpu_vram_total_bytes: null,
  gpu_temp: null,
  gpu_hotspot_temp: null,
  gpu_memory_temp: null,
  gpu_clock_mhz: null,
  gpu_fan_percent: null,
  gpu_power_w: null,
  ram_used_bytes: null,
  ram_total_bytes: null,
  ram_available_bytes: null,
  disk_read_bps: null,
  disk_write_bps: null,
  network_download_bps: null,
  network_upload_bps: null,
  ping_ms: null,
  battery_percent: null,
  battery_charging: null,
  game_title: null,
  session_seconds: null,
}

export const DEMO_METRICS: OverlayMetrics = {
  timestamp: Date.now(),
  fps: 142.4,
  frametime_ms: 7.02,
  fps_one_percent_low: 118.5,
  fps_point_one_percent_low: 94.2,
  frametime_history: [
    7.1, 7.0, 6.9, 7.2, 7.0, 7.1, 8.4, 7.0, 6.9, 7.0, 7.1, 7.2, 7.0, 6.9, 7.1, 7.3, 7.0, 6.8, 7.0,
    9.2, 7.0, 6.9, 7.1, 7.0, 6.9, 7.0, 7.2, 7.1, 7.0, 6.9, 7.0, 7.1, 6.8, 7.0, 7.2, 7.0, 6.9, 7.1,
    7.0, 7.0, 8.1, 7.0, 6.9, 7.0, 7.1, 7.0, 6.9, 7.2, 7.0, 6.9, 7.0, 7.1, 7.0, 6.9, 7.0, 7.1, 7.0,
    6.9, 7.0, 7.1,
  ],
  cpu_usage: 46.2,
  cpu_temp: 61.5,
  cpu_clock_ghz: 4.85,
  cpu_power_w: 68.0,
  cpu_cores: 16,

  gpu_name: 'NVIDIA GeForce RTX 4080 Super',
  gpu_usage: 89.4,
  gpu_vram_used_bytes: 11_400_000_000,
  gpu_vram_total_bytes: 16_000_000_000,
  gpu_temp: 63.8,
  gpu_hotspot_temp: 74.2,
  gpu_memory_temp: 68,
  gpu_clock_mhz: 2580,
  gpu_fan_percent: 54,
  gpu_power_w: 245.0,

  ram_used_bytes: 18_200_000_000,
  ram_total_bytes: 32_000_000_000,
  ram_available_bytes: 13_800_000_000,

  disk_read_bps: 25_600_000,
  disk_write_bps: 4_200_000,

  network_download_bps: 12_800_000,
  network_upload_bps: 1_450_000,
  ping_ms: 22,

  battery_percent: 94,
  battery_charging: true,

  game_title: 'Cyberpunk 2077',
  session_seconds: 5240,
}

interface OverlayStoreState {
  config: OverlayConfig
  metrics: OverlayMetrics
  isLoading: boolean
  isLiveWindowOpen: boolean
  isDemoMode: boolean
  monitors: MonitorDto[]
  history: UsageHistory
  providerStatus: TelemetryProviderStatus | null
  hotkeyStatus: HotkeyStatus | null
  activeCategory: ThemeCategory
  searchQuery: string

  loadConfig: () => Promise<void>
  saveCurrentConfig: () => Promise<void>
  updateConfig: (patch: Partial<OverlayConfig>) => void
  setTheme: (themeId: OverlayThemeId) => void
  setPosition: (position: OverlayPosition) => void
  setOpacity: (opacity: number) => void
  setScale: (scale: number) => void
  setMonitor: (index: number) => void
  updateNotifications: (patch: Partial<NotificationSettings>) => void
  toggleMetric: (key: keyof MetricToggles) => void
  syncLiveWindowState: () => Promise<void>
  refreshProviderStatus: () => Promise<void>
  sendTestNotification: (kind?: OverlayNotification['kind']) => Promise<void>
  subscribeToBackend: (opts?: { applyConfig?: boolean }) => Promise<() => void>
  toggleLiveWindow: (show?: boolean) => Promise<boolean>
  setClickThrough: (enabled: boolean) => Promise<void>
  setDemoMode: (enabled: boolean) => void
  setActiveCategory: (category: ThemeCategory) => void
  setSearchQuery: (query: string) => void
  pollMetrics: () => Promise<void>
  startTelemetry: () => Promise<void>
  stopTelemetry: () => Promise<void>
}

export interface UsageHistory {
  fps: number[]
  gpu: number[]
  cpu: number[]
}

const HISTORY_LEN = 48

const pushSample = (list: number[], v: number | null): number[] =>
  v == null || !Number.isFinite(v) ? list : [...list.slice(-(HISTORY_LEN - 1)), v]

function nextHistory(prev: UsageHistory, m: OverlayMetrics): UsageHistory {
  return {
    fps: pushSample(prev.fps, m.fps),
    gpu: pushSample(prev.gpu, m.gpu_usage),
    cpu: pushSample(prev.cpu, m.cpu_usage),
  }
}

let persistTimer: ReturnType<typeof setTimeout> | undefined
let persistVersion = 0

/**
 * Debounced save: sliders fire dozens of changes per second, and every
 * save re-applies the window + hotkey in the backend. The backend returns
 * the sanitised config (e.g. an invalid hotkey reverted to the default),
 * which we adopt unless the user has already changed something newer.
 */
function persistConfig(
  config: OverlayConfig,
  set: (partial: Partial<OverlayStoreState>) => void,
): void {
  const version = ++persistVersion
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    saveOverlayConfig(config)
      .then(async (saved) => {
        if (version !== persistVersion) return
        set({ config: normalizeConfig(saved) })
        // The hotkey thread applies the new binding asynchronously; give it a beat.
        await new Promise((resolve) => setTimeout(resolve, 150))
        if (version !== persistVersion) return
        set({ hotkeyStatus: await getOverlayHotkeyStatus().catch(() => null) })
      })
      .catch((err) => console.error('[OverlayStore] Failed to save config:', err))
  }, 220)
}

export const useOverlayStore = create<OverlayStoreState>((set, get) => ({
  config: DEFAULT_CONFIG,
  metrics: DEMO_METRICS,
  isLoading: false,
  isLiveWindowOpen: false,
  isDemoMode: false,
  monitors: [],
  history: { fps: [], gpu: [], cpu: [] },
  providerStatus: null,
  hotkeyStatus: null,
  activeCategory: 'all',
  searchQuery: '',

  loadConfig: async () => {
    try {
      set({ isLoading: true })
      const [config, monitors, status, hotkeyStatus] = await Promise.all([
        getOverlayConfig(),
        getOverlayMonitors(),
        getTelemetryStatus().catch(() => null),
        getOverlayHotkeyStatus().catch(() => null),
      ])
      set({
        config: normalizeConfig(config),
        monitors: monitors ?? [],
        providerStatus: status,
        hotkeyStatus,
        isLoading: false,
      })
    } catch (err) {
      console.error('[OverlayStore] Failed to load config:', err)
      set({ isLoading: false })
    }
  },

  saveCurrentConfig: async () => {
    try {
      await saveOverlayConfig(get().config)
    } catch (err) {
      console.error('[OverlayStore] Failed to save config:', err)
    }
  },

  updateConfig: (patch) => {
    const nextConfig = { ...get().config, ...patch }
    set({ config: nextConfig })
    persistConfig(nextConfig, set)
  },

  updateNotifications: (patch) => {
    const current = get().config
    const nextConfig = {
      ...current,
      notifications: { ...current.notifications, ...patch },
    }
    set({ config: nextConfig })
    persistConfig(nextConfig, set)
  },

  setTheme: (theme_id) => {
    get().updateConfig({ theme_id })
  },

  setPosition: (position) => {
    get().updateConfig({ position })
  },

  setOpacity: (opacity) => {
    get().updateConfig({ opacity })
  },

  setScale: (scale) => {
    get().updateConfig({ scale })
  },

  setMonitor: (monitor_index) => {
    get().updateConfig({ monitor_index })
  },

  toggleMetric: (key) => {
    const current = get().config
    get().updateConfig({ metrics: { ...current.metrics, [key]: !current.metrics[key] } })
  },

  toggleLiveWindow: async (show) => {
    try {
      const target = await toggleOverlayWindow(show)
      set({ isLiveWindowOpen: target })
      return target
    } catch (err) {
      console.error('[OverlayStore] Toggle live window failed:', err)
      return get().isLiveWindowOpen
    }
  },

  refreshProviderStatus: async () => {
    try {
      set({ providerStatus: await getTelemetryStatus() })
    } catch {
      // Non-fatal: the status panel keeps its last known state.
    }
  },

  syncLiveWindowState: async () => {
    try {
      set({ isLiveWindowOpen: await isOverlayVisible() })
    } catch {
      // Non-fatal: the button just keeps its last known state.
    }
  },

  setClickThrough: async (enabled) => {
    get().updateConfig({ click_through: enabled })
    try {
      await setOverlayClickThrough(enabled)
    } catch (err) {
      console.error('[OverlayStore] Set click-through failed:', err)
    }
  },

  sendTestNotification: async (kind = 'info') => {
    // Notifications only render while the HUD is up, so bring it up first.
    if (!get().isLiveWindowOpen) {
      const opened = await get().toggleLiveWindow(true)
      if (!opened) return
      await new Promise((resolve) => setTimeout(resolve, 900))
    }
    const samples: Record<OverlayNotification['kind'], OverlayNotification> = {
      info: {
        id: 'test-info',
        kind: 'info',
        title: 'Nexus Overlay',
        body: 'Notifications are working.',
      },
      success: {
        id: 'test-success',
        kind: 'success',
        title: 'Download complete',
        body: 'Your game is ready to play.',
      },
      warning: {
        id: 'test-warning',
        kind: 'warning',
        title: 'GPU hotspot 101°C',
        body: 'Check airflow and fan curve.',
      },
      error: {
        id: 'test-error',
        kind: 'error',
        title: 'Something went wrong',
        body: 'Example error notification.',
      },
    }
    try {
      await pushOverlayNotification(samples[kind])
    } catch (err) {
      console.error('[OverlayStore] Test notification failed:', err)
    }
  },

  subscribeToBackend: async (opts) => {
    const applyConfig = opts?.applyConfig ?? false
    const unlisteners = await Promise.all([
      listen<boolean>('overlay://visibility', (event) => {
        set({ isLiveWindowOpen: Boolean(event.payload) })
      }),
      listen<OverlayConfig>('overlay://config-changed', (event) => {
        if (applyConfig) set({ config: normalizeConfig(event.payload) })
      }),
    ])
    return () => unlisteners.forEach((un) => un())
  },

  setDemoMode: (isDemoMode) => {
    set({ isDemoMode })
  },

  setActiveCategory: (activeCategory) => {
    set({ activeCategory })
  },

  setSearchQuery: (searchQuery) => {
    set({ searchQuery })
  },

  pollMetrics: async () => {
    if (get().isDemoMode) {
      // Demo: a gentle random walk so the preview looks alive.
      set((state) => {
        const m = state.metrics
        const walk = (v: number | null, base: number, step: number, lo: number, hi: number) =>
          Math.max(lo, Math.min(hi, (v ?? base) + (Math.random() - 0.5) * step))
        const fps = walk(m.fps, 142, 9, 96, 165)
        const frametime = 1000 / fps
        const hist = [...(m.frametime_history ?? []).slice(-59), frametime]
        const next: OverlayMetrics = {
          ...m,
          fps: Math.round(fps * 10) / 10,
          frametime_ms: Math.round(frametime * 100) / 100,
          frametime_history: hist,
          gpu_usage: Math.round(walk(m.gpu_usage, 78, 10, 40, 99)),
          cpu_usage: Math.round(walk(m.cpu_usage, 34, 10, 12, 80)),
          gpu_temp: Math.round(walk(m.gpu_temp, 66, 2, 55, 84)),
          gpu_hotspot_temp: Math.round(walk(m.gpu_hotspot_temp, 76, 2, 62, 98)),
          session_seconds: (m.session_seconds ?? 0) + 1,
        }
        return { metrics: next, history: nextHistory(state.history, next) }
      })
      return
    }

    try {
      const metrics = await getOverlayMetrics()
      set((state) => ({ metrics, history: nextHistory(state.history, metrics) }))
    } catch (err) {
      console.error('[OverlayStore] Failed to poll metrics:', err)
    }
  },

  startTelemetry: async () => {
    try {
      await startOverlayTelemetry()
    } catch (err) {
      console.error('[OverlayStore] Start telemetry failed:', err)
    }
  },

  stopTelemetry: async () => {
    try {
      await stopOverlayTelemetry()
    } catch (err) {
      console.error('[OverlayStore] Stop telemetry failed:', err)
    }
  },
}))
