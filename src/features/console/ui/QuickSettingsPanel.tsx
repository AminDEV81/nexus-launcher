import React, { useEffect, useState } from 'react'
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

  useEffect(() => {
    if (!open) return
    consoleGetMasterVolume().then(setVolume).catch(() => {})
    consoleGetSystemStatus().then(setStatus).catch(() => {})
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

  if (!open) return null

  const firstPad = status?.controllers?.[0]

  return (
    <div className="fixed inset-0 z-[220] bg-black/75 backdrop-blur-md flex justify-end select-none">
      <FocusScope
        id="console_quick_settings"
        trapFocus
        orientation="vertical"
        className="w-[420px] h-full bg-slate-950/95 border-l border-white/15 p-6 flex flex-col justify-between shadow-2xl"
      >
        <div className="space-y-6">
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <div>
              <h2 className="text-xl font-black text-white tracking-tight">Quick Settings</h2>
              <p className="text-xs text-slate-400">System & Controller Telemetry</p>
            </div>
            <button
              type="button"
              {...closeFocus.focusProps}
              className={`p-2 rounded-xl border transition-all ${
                closeFocus.isFocused
                  ? 'bg-cyan-400 text-slate-950 border-cyan-300 scale-105'
                  : 'bg-white/5 text-slate-300 border-white/10'
              }`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Master Volume */}
          <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-slate-200 flex items-center gap-2">
                {volume === 0 ? (
                  <VolumeX className="w-4 h-4 text-rose-400" />
                ) : (
                  <Volume2 className="w-4 h-4 text-cyan-400" />
                )}
                Master Volume
              </span>
              <span className="text-sm font-extrabold text-cyan-300">{volume}%</span>
            </div>
            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-400 to-violet-500 transition-all"
                style={{ width: `${volume}%` }}
              />
            </div>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                {...volDownFocus.focusProps}
                className={`py-2 rounded-xl font-bold text-xs border transition-all ${
                  volDownFocus.isFocused
                    ? 'bg-cyan-400 text-slate-950 border-cyan-300'
                    : 'bg-slate-900 text-slate-200 border-white/10'
                }`}
              >
                -10% Volume
              </button>
              <button
                type="button"
                {...volUpFocus.focusProps}
                className={`py-2 rounded-xl font-bold text-xs border transition-all ${
                  volUpFocus.isFocused
                    ? 'bg-cyan-400 text-slate-950 border-cyan-300'
                    : 'bg-slate-900 text-slate-200 border-white/10'
                }`}
              >
                +10% Volume
              </button>
            </div>
          </div>

          {/* Controller & Battery Telemetry */}
          <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <Gamepad2 className="w-4 h-4 text-cyan-400" />
                Controller Status
              </span>
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">
                {firstPad ? firstPad.name : 'Keyboard / XInput'}
              </span>
            </div>
            {firstPad && (
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span className="flex items-center gap-1.5">
                  <BatteryCharging className="w-3.5 h-3.5 text-amber-400" />
                  Battery
                </span>
                <span className="font-bold">
                  {firstPad.battery_percent}% {firstPad.charging ? '(Charging)' : ''}
                </span>
              </div>
            )}
            {firstPad?.emulation_active && (
              <div className="flex items-center justify-between text-xs text-cyan-300">
                <span className="flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5" />
                  ViGEm Emulation
                </span>
                <span className="font-bold uppercase">Active (Deduped)</span>
              </div>
            )}
          </div>

          {/* Mini Music Player */}
          <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <Music className="w-4 h-4 text-violet-400" />
                Soundtrack Player
              </span>
              <span className="text-xs text-slate-400 truncate max-w-[160px]">
                {currentTrack ? currentTrack.title : 'No Track Active'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                {...musicToggleFocus.focusProps}
                className={`py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 border transition-all ${
                  musicToggleFocus.isFocused
                    ? 'bg-cyan-400 text-slate-950 border-cyan-300'
                    : 'bg-slate-900 text-slate-200 border-white/10'
                }`}
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                {isPlaying ? 'Pause' : 'Play'}
              </button>
              <button
                type="button"
                {...musicNextFocus.focusProps}
                className={`py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 border transition-all ${
                  musicNextFocus.isFocused
                    ? 'bg-cyan-400 text-slate-950 border-cyan-300'
                    : 'bg-slate-900 text-slate-200 border-white/10'
                }`}
              >
                <SkipForward className="w-3.5 h-3.5" />
                Next Track
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
                  ? 'bg-cyan-400 text-slate-950 border-cyan-300 scale-[1.02]'
                  : 'bg-white/5 text-slate-200 border-white/10'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Zap className="w-4 h-4 text-amber-400" />
                System Booster & RAM Purge
              </span>
            </button>

            <button
              type="button"
              {...desktopFocus.focusProps}
              className={`w-full p-3.5 rounded-2xl font-bold text-sm flex items-center justify-between border transition-all ${
                desktopFocus.isFocused
                  ? 'bg-cyan-400 text-slate-950 border-cyan-300 scale-[1.02]'
                  : 'bg-white/5 text-slate-200 border-white/10'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Monitor className="w-4 h-4 text-cyan-400" />
                Return to Desktop Mode
              </span>
            </button>
          </div>
        </div>

        <button
          type="button"
          {...powerFocus.focusProps}
          className={`w-full p-4 rounded-2xl font-extrabold text-sm flex items-center justify-center gap-2.5 border transition-all ${
            powerFocus.isFocused
              ? 'bg-rose-500 text-white border-rose-300 scale-[1.02] shadow-lg'
              : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
          }`}
        >
          <Power className="w-4 h-4" />
          Power & Sleep Options
        </button>
      </FocusScope>
    </div>
  )
}
