import { create } from 'zustand'
import { setSetting } from '@/services/settings'
import type { HubGame } from '@/types/models'
import {
  CONSOLE_THEMES,
  type ConsoleGlyphFamily,
  type ConsoleGlyphOverride,
  type ConsoleLanguage,
  type ConsoleThemeId,
} from '../theme/tokens'

export type ConsoleTabId =
  | 'home'
  | 'library'
  | 'store'
  | 'wishlist'
  | 'memory'
  | 'downloads'
  | 'music'
  | 'dualsense'
  | 'passport'
  | 'booster'
  | 'settings'
  | 'power'

export interface ConsoleSettingsState {
  consoleEnabled: boolean
  startInConsole: boolean
  monitorIndex: number
  uiScale: number // 80..150
  safeMargin: number // 0..10 (%)
  theme: ConsoleThemeId
  soundsEnabled: boolean
  soundVolume: number // 0..100
  hapticsEnabled: boolean
  confirmSwap: boolean
  glyphOverride: ConsoleGlyphOverride
  idleMinutes: number // 1..120
  screensaverEnabled: boolean
  ostPreviewEnabled: boolean
  guideEnabled: boolean
  guideCombo: 'both' | 'guide_only' | 'back_start'
  reduceMotion: boolean
  minimalHome: boolean
  language: ConsoleLanguage
}

export function clampUiScale(val: number): number {
  if (!Number.isFinite(val)) return 100
  return Math.max(80, Math.min(150, Math.round(val)))
}

export function computeRecommendedMonitorScale(
  widthPx?: number,
  heightPx?: number,
): { scale: number; profileLabel: string } {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  const rawW =
    widthPx && widthPx > 0
      ? widthPx
      : typeof window !== 'undefined' && window.screen?.width
        ? Math.round(window.screen.width * dpr)
        : 1920
  const rawH =
    heightPx && heightPx > 0
      ? heightPx
      : typeof window !== 'undefined' && window.screen?.height
        ? Math.round(window.screen.height * dpr)
        : 1080

  if (rawW >= 3200 || rawH >= 1800) {
    return { scale: 130, profileLabel: '4K UHD / Large Display (130%)' }
  }
  if (rawW >= 2400 || rawH >= 1350) {
    return { scale: 115, profileLabel: '27"–32" QHD / Ultrawide (115%)' }
  }
  if (rawW < 1800 || rawH < 1000) {
    return { scale: 92, profileLabel: 'Compact / Laptop Display (92%)' }
  }
  return { scale: 100, profileLabel: '24"–25" 1080p Standard (100%)' }
}

export function clampSafeMargin(val: number): number {
  if (!Number.isFinite(val)) return 2
  return Math.max(0, Math.min(10, Math.round(val)))
}

export function clampSoundVolume(val: number): number {
  if (!Number.isFinite(val)) return 80
  return Math.max(0, Math.min(100, Math.round(val)))
}

export function parseConsoleSettingsFromMap(
  raw: Record<string, string> | undefined,
): ConsoleSettingsState {
  const g = (k: string, def: string) => (raw && raw[k] !== undefined ? raw[k] : def)
  const b = (k: string, def: boolean) => {
    const v = g(k, def ? '1' : '0')
    return v === '1' || v === 'true'
  }
  const themeRaw = g('console_theme', 'cyberpunk') as ConsoleThemeId
  const theme: ConsoleThemeId = CONSOLE_THEMES[themeRaw] ? themeRaw : 'cyberpunk'

  const glyphRaw = g('console_glyph_override', 'auto')
  const glyphOverride: ConsoleGlyphOverride =
    glyphRaw === 'playstation' ||
    glyphRaw === 'xbox' ||
    glyphRaw === 'switch' ||
    glyphRaw === 'keyboard'
      ? glyphRaw
      : 'auto'

  const comboRaw = g('console_guide_combo', 'both')
  const guideCombo =
    comboRaw === 'guide_only' || comboRaw === 'back_start' ? comboRaw : 'both'

  return {
    consoleEnabled: b('console_enabled', true),
    startInConsole: b('console_start_in_console', false),
    monitorIndex: Math.max(0, Math.min(16, Number.parseInt(g('console_monitor', '0'), 10) || 0)),
    uiScale:
      raw && raw['console_ui_scale'] !== undefined
        ? clampUiScale(Number.parseInt(raw['console_ui_scale'], 10))
        : computeRecommendedMonitorScale().scale,
    safeMargin: clampSafeMargin(Number.parseInt(g('console_safe_margin', '2'), 10)),
    theme,
    soundsEnabled: b('console_sounds', true),
    soundVolume: clampSoundVolume(Number.parseInt(g('console_sound_volume', '80'), 10)),
    hapticsEnabled: b('console_haptics', true),
    confirmSwap: b('console_confirm_swap', false),
    glyphOverride,
    idleMinutes: Math.max(1, Math.min(120, Number.parseInt(g('console_idle_minutes', '5'), 10) || 5)),
    screensaverEnabled: b('console_screensaver', true),
    ostPreviewEnabled: b('console_ost_preview', false),
    guideEnabled: b('console_guide_enabled', false),
    guideCombo,
    reduceMotion: b('console_reduce_motion', false),
    minimalHome: b('console_minimal_home', false),
    language: 'en',
  }
}

interface OskRequest {
  open: boolean
  title: string
  initialValue: string
  onSubmit?: (value: string) => void
}

export interface ConsoleSoundtrackTarget {
  id: string
  name: string
  coverUrl?: string | null
  steamAppId?: string | null
  igdbId?: number | null
}

// Non-reactive focus memory map so hovering/moving focus never triggers Zustand store broadcasts!
const nonReactiveFocusMemory: Record<string, string> = {}

interface ConsoleStoreState extends ConsoleSettingsState {
  activeTab: ConsoleTabId
  selectedGameId: string | null
  selectedStoreHubGame: HubGame | null
  selectedSoundtrackGame: ConsoleSoundtrackTarget | null
  focusedGameId: string | null
  focusedBackdropUrl: string | null
  ambientColor: string
  detectedGlyphFamily: ConsoleGlyphFamily
  activeControllerCount: number
  controllerDisconnectedModal: boolean
  controllerTestMode: boolean
  profileGateCompleted: boolean
  screensaverActive: boolean
  quickSettingsOpen: boolean
  safeAreaCalibrationOpen: boolean
  lastDesktopRoute: string
  focusMemory: Record<string, string>
  osk: OskRequest

  hydrateFromSettings: (raw: Record<string, string> | undefined) => void
  updateConsoleSetting: <K extends keyof ConsoleSettingsState>(
    key: K,
    value: ConsoleSettingsState[K],
  ) => Promise<void>
  setActiveTab: (tab: ConsoleTabId) => void
  setSelectedGameId: (gameId: string | null) => void
  setSelectedStoreHubGame: (hubGame: HubGame | null) => void
  setSelectedSoundtrackGame: (target: ConsoleSoundtrackTarget | null) => void
  openGameSoundtrackInConsole: (target: ConsoleSoundtrackTarget) => void
  setFocusedGameId: (gameId: string | null, accentColor?: string) => void
  setFocusedBackdropUrl: (url: string | null) => void
  setAmbientColor: (hex: string) => void
  setDetectedDevice: (family: ConsoleGlyphFamily, count?: number) => void
  setControllerDisconnectedModal: (open: boolean) => void
  setControllerTestMode: (active: boolean) => void
  setProfileGateCompleted: (done: boolean) => void
  setScreensaverActive: (active: boolean) => void
  setQuickSettingsOpen: (open: boolean) => void
  setSafeAreaCalibrationOpen: (open: boolean) => void
  setLastDesktopRoute: (route: string) => void
  rememberFocus: (scopeKey: string, focusId: string) => void
  getRememberedFocus: (scopeKey: string) => string | undefined
  openOsk: (title: string, initialValue: string, onSubmit: (val: string) => void) => void
  closeOsk: () => void
  effectiveGlyphs: () => ConsoleGlyphFamily
}

const SETTING_KEY_MAP: Record<keyof ConsoleSettingsState, string> = {
  consoleEnabled: 'console_enabled',
  startInConsole: 'console_start_in_console',
  monitorIndex: 'console_monitor',
  uiScale: 'console_ui_scale',
  safeMargin: 'console_safe_margin',
  theme: 'console_theme',
  soundsEnabled: 'console_sounds',
  soundVolume: 'console_sound_volume',
  hapticsEnabled: 'console_haptics',
  confirmSwap: 'console_confirm_swap',
  glyphOverride: 'console_glyph_override',
  idleMinutes: 'console_idle_minutes',
  screensaverEnabled: 'console_screensaver',
  ostPreviewEnabled: 'console_ost_preview',
  guideEnabled: 'console_guide_enabled',
  guideCombo: 'console_guide_combo',
  reduceMotion: 'console_reduce_motion',
  minimalHome: 'console_minimal_home',
  language: 'console_language',
}

export const useConsoleStore = create<ConsoleStoreState>((set, get) => ({
  ...parseConsoleSettingsFromMap(undefined),
  activeTab: 'home',
  selectedGameId: null,
  selectedStoreHubGame: null,
  selectedSoundtrackGame: null,
  focusedGameId: null,
  focusedBackdropUrl: null,
  ambientColor: '#00e5ff',
  detectedGlyphFamily: 'playstation',
  activeControllerCount: 0,
  controllerDisconnectedModal: false,
  controllerTestMode: false,
  profileGateCompleted: false,
  screensaverActive: false,
  quickSettingsOpen: false,
  safeAreaCalibrationOpen: false,
  lastDesktopRoute: '/',
  focusMemory: nonReactiveFocusMemory,
  osk: { open: false, title: '', initialValue: '' },

  hydrateFromSettings: (raw) => {
    set(parseConsoleSettingsFromMap(raw))
  },

  updateConsoleSetting: async (key, value) => {
    let normalized: ConsoleSettingsState[typeof key] = value
    if (key === 'uiScale' && typeof value === 'number') {
      normalized = clampUiScale(value) as ConsoleSettingsState[typeof key]
    } else if (key === 'safeMargin' && typeof value === 'number') {
      normalized = clampSafeMargin(value) as ConsoleSettingsState[typeof key]
    } else if (key === 'soundVolume' && typeof value === 'number') {
      normalized = clampSoundVolume(value) as ConsoleSettingsState[typeof key]
    }

    set({ [key]: normalized } as Partial<ConsoleStoreState>)
    const dbKey = SETTING_KEY_MAP[key]
    const dbVal =
      typeof normalized === 'boolean' ? (normalized ? '1' : '0') : String(normalized)
    try {
      await setSetting(dbKey, dbVal)
    } catch {
      // Ignore persistence error in test/offline mode
    }
  },

  setActiveTab: (tab) =>
    set((s) => {
      if (
        s.activeTab === tab &&
        s.selectedGameId === null &&
        s.selectedStoreHubGame === null &&
        !s.controllerTestMode
      ) {
        return s
      }
      return {
        activeTab: tab,
        selectedGameId: null,
        selectedStoreHubGame: null,
        focusedBackdropUrl: null,
        controllerTestMode: false,
      }
    }),
  setSelectedGameId: (gameId) =>
    set((s) => {
      if (s.selectedGameId === gameId && s.selectedStoreHubGame === null) return s
      return {
        selectedGameId: gameId,
        selectedStoreHubGame: null,
      }
    }),
  setSelectedStoreHubGame: (hubGame) =>
    set((s) => {
      if (s.selectedStoreHubGame === hubGame && s.selectedGameId === null) return s
      return {
        selectedStoreHubGame: hubGame,
        selectedGameId: null,
      }
    }),
  setSelectedSoundtrackGame: (target) => set({ selectedSoundtrackGame: target }),
  openGameSoundtrackInConsole: (target) =>
    set({
      selectedSoundtrackGame: target,
      selectedGameId: null,
      selectedStoreHubGame: null,
      activeTab: 'music',
    }),
  setFocusedGameId: (gameId, accentColor) =>
    set((s) => {
      const nextColor = accentColor || s.ambientColor
      if (s.focusedGameId === gameId && s.ambientColor === nextColor && s.focusedBackdropUrl === null) return s
      return {
        focusedGameId: gameId,
        focusedBackdropUrl: null,
        ambientColor: nextColor,
      }
    }),
  setFocusedBackdropUrl: (url) =>
    set((s) => {
      if (s.focusedBackdropUrl === url) return s
      return { focusedBackdropUrl: url }
    }),
  setAmbientColor: (hex) =>
    set((s) => {
      if (s.ambientColor === hex) return s
      return { ambientColor: hex }
    }),
  setDetectedDevice: (family, count) =>
    set((s) => {
      const nextCount = count !== undefined ? count : s.activeControllerCount
      if (s.detectedGlyphFamily === family && s.activeControllerCount === nextCount) {
        return s
      }
      return {
        detectedGlyphFamily: family,
        activeControllerCount: nextCount,
      }
    }),
  setControllerDisconnectedModal: (open) =>
    set((s) => (s.controllerDisconnectedModal === open ? s : { controllerDisconnectedModal: open })),
  setControllerTestMode: (active) =>
    set((s) => (s.controllerTestMode === active ? s : { controllerTestMode: active })),
  setProfileGateCompleted: (done) =>
    set((s) => (s.profileGateCompleted === done ? s : { profileGateCompleted: done })),
  setScreensaverActive: (active) =>
    set((s) => (s.screensaverActive === active ? s : { screensaverActive: active })),
  setQuickSettingsOpen: (open) =>
    set((s) => (s.quickSettingsOpen === open ? s : { quickSettingsOpen: open })),
  setSafeAreaCalibrationOpen: (open) =>
    set((s) => (s.safeAreaCalibrationOpen === open ? s : { safeAreaCalibrationOpen: open })),
  setLastDesktopRoute: (route) =>
    set((s) => (s.lastDesktopRoute === route ? s : { lastDesktopRoute: route })),
  rememberFocus: (scopeKey, focusId) => {
    nonReactiveFocusMemory[scopeKey] = focusId
  },
  getRememberedFocus: (scopeKey) => nonReactiveFocusMemory[scopeKey],
  openOsk: (title, initialValue, onSubmit) =>
    set({ osk: { open: true, title, initialValue, onSubmit } }),
  closeOsk: () => set({ osk: { open: false, title: '', initialValue: '' } }),
  effectiveGlyphs: () => {
    const st = get()
    return st.glyphOverride === 'auto' ? st.detectedGlyphFamily : st.glyphOverride
  },
}))
