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
} from 'lucide-react'
import { FocusScope, useFocusable } from '../nav/FocusScope'
import {
  consoleGetMasterVolume,
  consoleSetMasterVolume,
  consoleGetSystemStatus,
  type ConsoleSystemStatus,
} from '@/services/console'
import { useSoundtrackStore } from '@/features/soundtrack/store/soundtrack-store'

export interface QuickSettingsPanelProps {
  open: boolean
  onClose: () => void
  onOpenPowerMenu: () => void
  onExitConsoleMode: () => void
  onOpenBooster: () => void
}

export const QuickSettingsPanel: React.FC<QuickSettingsPanelProps> = ({
  open,
  onClose,
  onOpenPowerMenu,
  onExitConsoleMode,
  onOpenBooster,
}) => {
  const [volume, setVolume] = useState<number>(80)
  const [status, setStatus] = useState<ConsoleSystemStatus | null>(null)
  const playbackState = useSoundtrackStore((s) => s.playbackState)
  const currentTrack = useSoundtrackStore((s) => s.currentTrack)
  const togglePlay = useSoundtrackStore((s) => s.togglePlay)
  const next = useSoundtrackStore((s) => s.next)
  const isPlaying = playbackState === 'playing'
  const speed = useAnimationSpeed()
  const wasOpenRef = useRef(open)

  // Panel sounds: a soft rise when it slides in, a soft fall when it leaves.
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
              className="w-[26.25rem] h-full bg-[#090b11]/97 p-6 flex flex-col justify-between shadow-[-30px_0_80px_-20px_rgba(0,0,0,0.8)]"
            >
              <div className="space-y-6">
                <div className="flex items-center justify-between border-b border-transparent pb-4">
                  <div>
                    <h2 className="text-xl font-semibold text-white tracking-tight">
                      Quick Settings
                    </h2>
                  </div>
                  <button
                    type="button"
                    {...closeFocus.focusProps}
                    className={`p-2 rounded-xl border transition-all ${
                      closeFocus.isFocused
                        ? 'bg-white text-black border-transparent scale-105'
                        : 'bg-white/8 text-white/70 border-transparent'
                    }`}
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Volume */}
                <div className="p-4 rounded-2xl bg-white/[0.06] border border-transparent space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-200 flex items-center gap-2">
                      {volume === 0 ? (
                        <VolumeX className="w-4 h-4 text-rose-400" />
                      ) : (
                        <Volume2 className="w-4 h-4 text-white/70" />
                      )}
                      Volume
                    </span>
                    <span className="text-sm font-semibold text-white/70">{volume}%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-white transition-all"
                      style={{ width: `${volume}%` }}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <button
                      type="button"
                      {...volDownFocus.focusProps}
                      className={`py-2 rounded-xl font-bold text-xs border transition-all ${
                        volDownFocus.isFocused ? 'bg-white text-black' : 'bg-white/10 text-white/85'
                      }`}
                    >
                      Volume −
                    </button>
                    <button
                      type="button"
                      {...volUpFocus.focusProps}
                      className={`py-2 rounded-xl font-bold text-xs border transition-all ${
                        volUpFocus.isFocused ? 'bg-white text-black' : 'bg-white/10 text-white/85'
                      }`}
                    >
                      Volume +
                    </button>
                  </div>
                </div>

                {/* Controller & Battery Telemetry */}
                <div className="p-4 rounded-2xl bg-white/[0.06] border border-transparent space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-200 flex items-center gap-2">
                      <Gamepad2 className="w-4 h-4 text-white/70" />
                      Controller
                    </span>
                    <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">
                      {firstPad ? firstPad.name : 'Keyboard'}
                    </span>
                  </div>
                  {firstPad && (
                    <div className="flex items-center justify-between text-xs text-slate-300">
                      <span className="flex items-center gap-1.5">
                        <BatteryCharging className="w-3.5 h-3.5 text-white/70" />
                        Battery
                      </span>
                      <span className="font-bold">
                        {firstPad.battery_percent}% {firstPad.charging ? '(Charging)' : ''}
                      </span>
                    </div>
                  )}
                  {firstPad?.emulation_active && (
                    <div className="flex items-center justify-between text-xs text-white/70">
                      <span className="flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5" />
                        Xbox emulation
                      </span>
                      <span className="font-bold uppercase">On</span>
                    </div>
                  )}
                </div>

                {/* Mini Music Player */}
                <div className="p-4 rounded-2xl bg-white/[0.06] border border-transparent space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-200 flex items-center gap-2">
                      <Music className="w-4 h-4 text-white/70" />
                      Music
                    </span>
                    <span className="text-xs text-slate-400 truncate max-w-[10rem]">
                      {currentTrack ? currentTrack.title : 'Nothing playing'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      {...musicToggleFocus.focusProps}
                      className={`py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 border transition-all ${
                        musicToggleFocus.isFocused
                          ? 'bg-white text-black'
                          : 'bg-white/10 text-white/85'
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
                      className={`py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 border transition-all ${
                        musicNextFocus.isFocused
                          ? 'bg-white text-black'
                          : 'bg-white/10 text-white/85'
                      }`}
                    >
                      <SkipForward className="w-3.5 h-3.5" />
                      Next
                    </button>
                  </div>
                </div>

                {/* Quick Shortcuts */}
                <div className="space-y-2.5">
                  <button
                    type="button"
                    {...boosterFocus.focusProps}
                    className={`w-full p-3.5 rounded-2xl font-bold text-sm flex items-center justify-between border transition-all ${
                      boosterFocus.isFocused
                        ? 'bg-white text-black border-transparent scale-[1.02]'
                        : 'bg-white/[0.06] text-white/85'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <Zap className="w-4 h-4 text-white/70" />
                      Booster
                    </span>
                  </button>

                  <button
                    type="button"
                    {...desktopFocus.focusProps}
                    className={`w-full p-3.5 rounded-2xl font-bold text-sm flex items-center justify-between border transition-all ${
                      desktopFocus.isFocused
                        ? 'bg-white text-black border-transparent scale-[1.02]'
                        : 'bg-white/[0.06] text-white/85'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <Monitor className="w-4 h-4 text-white/70" />
                      Return to Desktop Mode
                    </span>
                  </button>
                </div>
              </div>

              <button
                type="button"
                {...powerFocus.focusProps}
                className={`w-full rounded-full p-4 text-[1rem] font-semibold flex items-center justify-center gap-2.5 outline-none transition-all ${
                  powerFocus.isFocused
                    ? 'bg-white text-black scale-[1.02]'
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
