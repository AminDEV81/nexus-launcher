import React, { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useAnimationSpeed } from '@/hooks/use-animation-speed'
import { consoleSoundEngine } from '../audio/ui-sounds'
import {
  Volume2,
  VolumeX,
  Gamepad2,
  Zap,
  Music,
  SkipForward,
  Play,
  Pause,
  Monitor,
  Power,
  X,
  BatteryCharging,
  Shield,
  Palette,
  Sun,
  Moon,
} from 'lucide-react'
import { FocusScope, useFocusable } from '../nav/FocusScope'
import {
  consoleGetMasterVolume,
  consoleSetMasterVolume,
  consoleGetSystemStatus,
  type ConsoleSystemStatus,
} from '@/services/console'
import { useSoundtrackStore } from '@/features/soundtrack/store/soundtrack-store'
import { computeRecommendedMonitorScale, useConsoleStore } from '../store/console-store'
import {
  CONSOLE_DARK_THEME_ORDER,
  CONSOLE_LIGHT_THEME_ORDER,
  CONSOLE_THEMES,
  type ConsoleThemeId,
} from '../theme/tokens'

export interface QuickSettingsPanelProps {
  open: boolean
  onClose: () => void
  onOpenPowerMenu: () => void
  onExitConsoleMode: () => void
  onOpenBooster: () => void
}

const QuickThemeDot: React.FC<{
  themeId: ConsoleThemeId
  active: boolean
  isLight: boolean
  onSelect: () => void
}> = ({ themeId, active, isLight, onSelect }) => {
  const tokens = CONSOLE_THEMES[themeId]
  const { focusProps, isFocused } = useFocusable<HTMLButtonElement>({
    id: `qs_theme_${themeId}`,
    scopeId: 'console_quick_settings',
    onConfirm: onSelect,
  })
  return (
    <button
      type="button"
      {...focusProps}
      title={tokens.name}
      className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] font-extrabold transition-all cursor-pointer outline-none ${
        isFocused
          ? 'scale-105 border-cyan-300 bg-cyan-400 text-slate-950 shadow-md'
          : active
            ? isLight
              ? 'border-indigo-600 bg-indigo-600 text-white shadow-xs'
              : 'border-cyan-400 bg-cyan-500/25 text-white'
            : isLight
              ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
              : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
      }`}
    >
      <span
        className="size-3 rounded-full border border-black/20 shrink-0"
        style={{ backgroundColor: tokens.defaultAccent }}
      />
      <span className="truncate">{tokens.name.split(' ')[0]}</span>
    </button>
  )
}

export const QuickSettingsPanel: React.FC<QuickSettingsPanelProps> = ({
  open,
  onClose,
  onOpenPowerMenu,
  onExitConsoleMode,
  onOpenBooster,
}) => {
  const [volume, setVolume] = useState<number>(80)
  const uiScale = useConsoleStore((s) => s.uiScale)
  const themeId = useConsoleStore((s) => s.theme)
  const updateConsoleSetting = useConsoleStore((s) => s.updateConsoleSetting)
  const [status, setStatus] = useState<ConsoleSystemStatus | null>(null)
  const playbackState = useSoundtrackStore((s) => s.playbackState)
  const currentTrack = useSoundtrackStore((s) => s.currentTrack)
  const togglePlay = useSoundtrackStore((s) => s.togglePlay)
  const next = useSoundtrackStore((s) => s.next)
  const isPlaying = playbackState === 'playing'
  const speed = useAnimationSpeed()
  const wasOpenRef = useRef(open)

  const themeTokens = CONSOLE_THEMES[themeId] ?? CONSOLE_THEMES.cyberpunk
  const isLight = Boolean(themeTokens.isLight)

  useEffect(() => {
    if (wasOpenRef.current === open) return
    wasOpenRef.current = open
    consoleSoundEngine.play(open ? 'open' : 'close')
  }, [open])

  useEffect(() => {
    if (!open) return
    consoleGetMasterVolume()
      .then(setVolume)
      .catch(() => {})
    consoleGetSystemStatus()
      .then(setStatus)
      .catch(() => {})
  }, [open])

  const handleVolumeDelta = async (delta: number) => {
    const nextVal = Math.max(0, Math.min(100, volume + delta))
    setVolume(nextVal)
    const committed = await consoleSetMasterVolume(nextVal)
    setVolume(committed)
  }

  const volDownFocus = useFocusable<HTMLButtonElement>({
    id: 'qs_vol_down',
    scopeId: 'console_quick_settings',
    onConfirm: () => {
      void handleVolumeDelta(-10)
    },
  })

  const volUpFocus = useFocusable<HTMLButtonElement>({
    id: 'qs_vol_up',
    scopeId: 'console_quick_settings',
    onConfirm: () => {
      void handleVolumeDelta(10)
    },
  })

  const scaleDownQuickFocus = useFocusable<HTMLButtonElement>({
    id: 'qs_scale_down',
    scopeId: 'console_quick_settings',
    onConfirm: () => {
      void updateConsoleSetting('uiScale', Math.max(80, uiScale - 5))
    },
  })

  const scaleAutoQuickFocus = useFocusable<HTMLButtonElement>({
    id: 'qs_scale_auto',
    scopeId: 'console_quick_settings',
    onConfirm: () => {
      const rec = computeRecommendedMonitorScale()
      void updateConsoleSetting('uiScale', rec.scale)
    },
  })

  const scaleUpQuickFocus = useFocusable<HTMLButtonElement>({
    id: 'qs_scale_up',
    scopeId: 'console_quick_settings',
    onConfirm: () => {
      void updateConsoleSetting('uiScale', Math.min(150, uiScale + 5))
    },
  })

  const toggleModeFocus = useFocusable<HTMLButtonElement>({
    id: 'qs_toggle_light_dark',
    scopeId: 'console_quick_settings',
    onConfirm: () => {
      const nextTheme: ConsoleThemeId = isLight ? 'cyberpunk' : 'light'
      void updateConsoleSetting('theme', nextTheme)
    },
  })

  const musicToggleFocus = useFocusable<HTMLButtonElement>({
    id: 'qs_music_toggle',
    scopeId: 'console_quick_settings',
    onConfirm: () => togglePlay(),
  })

  const musicNextFocus = useFocusable<HTMLButtonElement>({
    id: 'qs_music_next',
    scopeId: 'console_quick_settings',
    onConfirm: () => {
      void next()
    },
  })

  const boosterFocus = useFocusable<HTMLButtonElement>({
    id: 'qs_booster',
    scopeId: 'console_quick_settings',
    onConfirm: () => {
      onClose()
      onOpenBooster()
    },
  })

  const desktopFocus = useFocusable<HTMLButtonElement>({
    id: 'qs_exit_desktop',
    scopeId: 'console_quick_settings',
    onConfirm: () => {
      onClose()
      onExitConsoleMode()
    },
  })

  const powerFocus = useFocusable<HTMLButtonElement>({
    id: 'qs_power',
    scopeId: 'console_quick_settings',
    onConfirm: () => {
      onClose()
      onOpenPowerMenu()
    },
  })

  const closeFocus = useFocusable<HTMLButtonElement>({
    id: 'qs_close',
    scopeId: 'console_quick_settings',
    onConfirm: onClose,
  })

  const firstPad = status?.controllers?.[0]
  const paletteOrder = isLight ? CONSOLE_LIGHT_THEME_ORDER : CONSOLE_DARK_THEME_ORDER

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="console_quick_settings_backdrop"
          className="fixed inset-0 z-[220] bg-black/55 flex justify-end select-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 * speed }}
        >
          <motion.div
            className="h-full"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={
              speed === 0
                ? { duration: 0 }
                : { type: 'spring', stiffness: 380, damping: 36, mass: 0.9 }
            }
          >
            <FocusScope
              id="console_quick_settings"
              trapFocus
              orientation="vertical"
              className={`w-[27.5rem] h-full p-6 flex flex-col justify-between overflow-y-auto no-scrollbar shadow-[-30px_0_80px_-20px_rgba(0,0,0,0.8)] border-l ${
                isLight
                  ? 'bg-white/97 border-slate-300 text-slate-900'
                  : 'bg-[#090b11]/97 border-white/10 text-white'
              }`}
            >
              <div className="space-y-4">
                <div
                  className={`flex items-center justify-between border-b pb-3 ${
                    isLight ? 'border-slate-200' : 'border-white/10'
                  }`}
                >
                  <div>
                    <h2
                      className={`text-xl font-extrabold tracking-tight ${
                        isLight ? 'text-slate-900' : 'text-white'
                      }`}
                    >
                      Quick Settings
                    </h2>
                    <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                      {themeTokens.name}
                    </p>
                  </div>
                  <button
                    type="button"
                    {...closeFocus.focusProps}
                    className={`p-2 rounded-xl border transition-all cursor-pointer ${
                      closeFocus.isFocused
                        ? 'bg-cyan-400 text-slate-950 border-transparent scale-105'
                        : isLight
                          ? 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
                          : 'bg-white/8 text-white/70 border-transparent'
                    }`}
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Quick Theme & Daylight Palette Switcher */}
                <div
                  className={`p-4 rounded-2xl border space-y-2.5 ${
                    isLight
                      ? 'bg-slate-50 border-slate-200'
                      : 'bg-white/[0.06] border-transparent'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-sm font-bold flex items-center gap-2 ${
                        isLight ? 'text-slate-800' : 'text-slate-200'
                      }`}
                    >
                      <Palette
                        className={`w-4 h-4 ${isLight ? 'text-indigo-600' : 'text-cyan-400'}`}
                      />
                      {isLight ? 'Daylight Palettes' : 'Dark Palettes'}
                    </span>

                    <button
                      type="button"
                      {...toggleModeFocus.focusProps}
                      className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-black transition-all cursor-pointer ${
                        toggleModeFocus.isFocused
                          ? 'bg-cyan-400 text-slate-950 border-white scale-105'
                          : isLight
                            ? 'bg-slate-900 text-white border-slate-800'
                            : 'bg-amber-400/20 text-amber-200 border-amber-300/40'
                      }`}
                    >
                      {isLight ? <Moon className="size-3" /> : <Sun className="size-3" />}
                      <span>{isLight ? 'Dark Mode' : 'Light Mode'}</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5 pt-0.5">
                    {paletteOrder.map((tId) => (
                      <QuickThemeDot
                        key={tId}
                        themeId={tId}
                        active={themeId === tId}
                        isLight={isLight}
                        onSelect={() => {
                          void updateConsoleSetting('theme', tId)
                        }}
                      />
                    ))}
                  </div>
                </div>

                {/* Volume */}
                <div
                  className={`p-4 rounded-2xl border space-y-2.5 ${
                    isLight
                      ? 'bg-slate-50 border-slate-200'
                      : 'bg-white/[0.06] border-transparent'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-sm font-bold flex items-center gap-2 ${
                        isLight ? 'text-slate-800' : 'text-slate-200'
                      }`}
                    >
                      {volume === 0 ? (
                        <VolumeX className="w-4 h-4 text-rose-500" />
                      ) : (
                        <Volume2
                          className={`w-4 h-4 ${isLight ? 'text-slate-600' : 'text-white/70'}`}
                        />
                      )}
                      Volume
                    </span>
                    <span
                      className={`text-sm font-bold ${
                        isLight ? 'text-slate-700' : 'text-white/70'
                      }`}
                    >
                      {volume}%
                    </span>
                  </div>
                  <div
                    className={`w-full h-2 rounded-full overflow-hidden ${
                      isLight ? 'bg-slate-200' : 'bg-slate-800'
                    }`}
                  >
                    <div
                      className={`h-full transition-all ${
                        isLight ? 'bg-indigo-600' : 'bg-white'
                      }`}
                      style={{ width: `${volume}%` }}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <button
                      type="button"
                      {...volDownFocus.focusProps}
                      className={`py-2 rounded-xl font-bold text-xs border transition-all cursor-pointer ${
                        volDownFocus.isFocused
                          ? 'bg-cyan-400 text-slate-950 border-transparent'
                          : isLight
                            ? 'bg-white border-slate-300 text-slate-800 hover:bg-slate-100'
                            : 'bg-white/10 border-transparent text-white/85'
                      }`}
                    >
                      Volume −
                    </button>
                    <button
                      type="button"
                      {...volUpFocus.focusProps}
                      className={`py-2 rounded-xl font-bold text-xs border transition-all cursor-pointer ${
                        volUpFocus.isFocused
                          ? 'bg-cyan-400 text-slate-950 border-transparent'
                          : isLight
                            ? 'bg-white border-slate-300 text-slate-800 hover:bg-slate-100'
                            : 'bg-white/10 border-transparent text-white/85'
                      }`}
                    >
                      Volume +
                    </button>
                  </div>
                </div>

                {/* Display, Cover & Text Scale Quick Control */}
                <div
                  className={`p-4 rounded-2xl border space-y-2.5 ${
                    isLight
                      ? 'bg-slate-50 border-slate-200'
                      : 'bg-white/[0.06] border-transparent'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-sm font-bold flex items-center gap-2 ${
                        isLight ? 'text-slate-800' : 'text-slate-200'
                      }`}
                    >
                      <Monitor
                        className={`w-4 h-4 ${isLight ? 'text-indigo-600' : 'text-cyan-400'}`}
                      />
                      Cover &amp; Text Size
                    </span>
                    <span
                      className={`text-xs font-black px-2.5 py-0.5 rounded-full tabular-nums ${
                        isLight
                          ? 'bg-indigo-100 text-indigo-800'
                          : 'bg-cyan-500/20 text-cyan-300'
                      }`}
                    >
                      {uiScale}%
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-0.5">
                    <button
                      type="button"
                      {...scaleDownQuickFocus.focusProps}
                      className={`py-2 rounded-xl font-bold text-xs border transition-all cursor-pointer ${
                        scaleDownQuickFocus.isFocused
                          ? 'bg-cyan-400 text-slate-950 border-white'
                          : isLight
                            ? 'bg-white border-slate-300 text-slate-800 hover:bg-slate-100'
                            : 'bg-white/10 text-white/85 border-transparent hover:bg-white/15'
                      }`}
                    >
                      Smaller −
                    </button>
                    <button
                      type="button"
                      {...scaleAutoQuickFocus.focusProps}
                      className={`py-2 rounded-xl font-bold text-xs border transition-all cursor-pointer ${
                        scaleAutoQuickFocus.isFocused
                          ? 'bg-emerald-400 text-slate-950 border-white'
                          : isLight
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                            : 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30 hover:bg-emerald-500/25'
                      }`}
                    >
                      Auto Fit
                    </button>
                    <button
                      type="button"
                      {...scaleUpQuickFocus.focusProps}
                      className={`py-2 rounded-xl font-bold text-xs border transition-all cursor-pointer ${
                        scaleUpQuickFocus.isFocused
                          ? 'bg-cyan-400 text-slate-950 border-white'
                          : isLight
                            ? 'bg-white border-slate-300 text-slate-800 hover:bg-slate-100'
                            : 'bg-white/10 text-white/85 border-transparent hover:bg-white/15'
                      }`}
                    >
                      Larger +
                    </button>
                  </div>
                </div>

                {/* Controller & Battery Telemetry */}
                <div
                  className={`p-4 rounded-2xl border space-y-2 ${
                    isLight
                      ? 'bg-slate-50 border-slate-200'
                      : 'bg-white/[0.06] border-transparent'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-sm font-bold flex items-center gap-2 ${
                        isLight ? 'text-slate-800' : 'text-slate-200'
                      }`}
                    >
                      <Gamepad2
                        className={`w-4 h-4 ${isLight ? 'text-slate-600' : 'text-white/70'}`}
                      />
                      Controller
                    </span>
                    <span
                      className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                        isLight
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-emerald-500/20 text-emerald-300'
                      }`}
                    >
                      {firstPad ? firstPad.name : 'Keyboard'}
                    </span>
                  </div>
                  {firstPad && (
                    <div
                      className={`flex items-center justify-between text-xs ${
                        isLight ? 'text-slate-600' : 'text-slate-300'
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        <BatteryCharging className="w-3.5 h-3.5" />
                        Battery
                      </span>
                      <span className="font-bold">
                        {firstPad.battery_percent}% {firstPad.charging ? '(Charging)' : ''}
                      </span>
                    </div>
                  )}
                  {firstPad?.emulation_active && (
                    <div
                      className={`flex items-center justify-between text-xs ${
                        isLight ? 'text-slate-600' : 'text-white/70'
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5" />
                        Xbox emulation
                      </span>
                      <span className="font-bold uppercase">On</span>
                    </div>
                  )}
                </div>

                {/* Mini Music Player */}
                <div
                  className={`p-4 rounded-2xl border space-y-2.5 ${
                    isLight
                      ? 'bg-slate-50 border-slate-200'
                      : 'bg-white/[0.06] border-transparent'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-sm font-bold flex items-center gap-2 ${
                        isLight ? 'text-slate-800' : 'text-slate-200'
                      }`}
                    >
                      <Music
                        className={`w-4 h-4 ${isLight ? 'text-slate-600' : 'text-white/70'}`}
                      />
                      Music
                    </span>
                    <span
                      className={`text-xs truncate max-w-[10rem] ${
                        isLight ? 'text-slate-500' : 'text-slate-400'
                      }`}
                    >
                      {currentTrack ? currentTrack.title : 'Nothing playing'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      {...musicToggleFocus.focusProps}
                      className={`py-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
                        musicToggleFocus.isFocused
                          ? 'bg-cyan-400 text-slate-950 border-transparent'
                          : isLight
                            ? 'bg-white border-slate-300 text-slate-800 hover:bg-slate-100'
                            : 'bg-white/10 border-transparent text-white/85'
                      }`}
                    >
                      {isPlaying ? (
                        <Pause className="w-3.5 h-3.5" />
                      ) : (
                        <Play className="w-3.5 h-3.5" />
                      )}
                      {isPlaying ? 'Pause' : 'Play'}
                    </button>
                    <button
                      type="button"
                      {...musicNextFocus.focusProps}
                      className={`py-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
                        musicNextFocus.isFocused
                          ? 'bg-cyan-400 text-slate-950 border-transparent'
                          : isLight
                            ? 'bg-white border-slate-300 text-slate-800 hover:bg-slate-100'
                            : 'bg-white/10 border-transparent text-white/85'
                      }`}
                    >
                      <SkipForward className="w-3.5 h-3.5" />
                      Next
                    </button>
                  </div>
                </div>

                {/* Quick Shortcuts */}
                <div className="space-y-2">
                  <button
                    type="button"
                    {...boosterFocus.focusProps}
                    className={`w-full p-3.5 rounded-2xl font-bold text-sm flex items-center justify-between border transition-all cursor-pointer ${
                      boosterFocus.isFocused
                        ? 'bg-cyan-400 text-slate-950 border-transparent scale-[1.02]'
                        : isLight
                          ? 'bg-slate-50 border-slate-200 text-slate-800 hover:bg-slate-100'
                          : 'bg-white/[0.06] border-transparent text-white/85'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <Zap className="w-4 h-4 text-amber-500" />
                      Booster
                    </span>
                  </button>

                  <button
                    type="button"
                    {...desktopFocus.focusProps}
                    className={`w-full p-3.5 rounded-2xl font-bold text-sm flex items-center justify-between border transition-all cursor-pointer ${
                      desktopFocus.isFocused
                        ? 'bg-cyan-400 text-slate-950 border-transparent scale-[1.02]'
                        : isLight
                          ? 'bg-slate-50 border-slate-200 text-slate-800 hover:bg-slate-100'
                          : 'bg-white/[0.06] border-transparent text-white/85'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <Monitor className="w-4 h-4 text-indigo-500" />
                      Return to Desktop Mode
                    </span>
                  </button>
                </div>
              </div>

              <button
                type="button"
                {...powerFocus.focusProps}
                className={`mt-4 w-full rounded-full p-3.5 text-[0.95rem] font-extrabold flex items-center justify-center gap-2.5 outline-none transition-all cursor-pointer ${
                  powerFocus.isFocused
                    ? 'bg-rose-500 text-white scale-[1.02]'
                    : isLight
                      ? 'bg-slate-900 text-white hover:bg-slate-800'
                      : 'bg-white/10 text-white/80'
                }`}
              >
                <Power className="w-4 h-4" />
                Power
              </button>
            </FocusScope>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
