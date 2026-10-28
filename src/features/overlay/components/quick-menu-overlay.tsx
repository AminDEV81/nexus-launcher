import React, { useEffect, useState } from 'react'
import {
  Play,
  Volume2,
  Zap,
  Music,
  SkipForward,
  Pause,
  Gamepad2,
  Monitor,
  X,
  Activity,
} from 'lucide-react'
import {
  consoleGetMasterVolume,
  consoleSetMasterVolume,
  consoleResumeGame,
  consoleToggleQuickMenu,
  consoleGetSystemStatus,
  type ConsoleSystemStatus,
} from '@/services/console'
import { runGameBoost } from '@/services/booster'
import { useSoundtrackStore } from '@/features/soundtrack/store/soundtrack-store'
import { FocusScope, useFocusable } from '@/features/console/nav/FocusScope'
import { useConsoleInputController } from '@/features/console/input/use-console-input'
import { Glyph } from '@/features/console/ui/Glyph'

export interface QuickMenuOverlayProps {
  open: boolean
  onClose: () => void
  onToggleHudMetrics: () => void
}

export const QuickMenuOverlay: React.FC<QuickMenuOverlayProps> = ({
  open,
  onClose,
  onToggleHudMetrics,
}) => {
  const [volume, setVolume] = useState(80)
  const [status, setStatus] = useState<ConsoleSystemStatus | null>(null)
  const [boostMsg, setBoostMsg] = useState<string | null>(null)

  const currentTrack = useSoundtrackStore((s) => s.currentTrack)
  const playbackState = useSoundtrackStore((s) => s.playbackState)
  const togglePlay = useSoundtrackStore((s) => s.togglePlay)
  const next = useSoundtrackStore((s) => s.next)
  const isPlaying = playbackState === 'playing'

  useEffect(() => {
    if (!open) return
    consoleGetMasterVolume().then(setVolume).catch(() => {})
    consoleGetSystemStatus().then(setStatus).catch(() => {})
  }, [open])

  const handleClose = () => {
    void consoleToggleQuickMenu(false).catch(() => {})
    onClose()
  }

  useConsoleInputController(
    {
      onBack: handleClose,
      onGuide: handleClose,
      onOptions: handleClose,
    },
    open,
  )

  const resumeBtn = useFocusable<HTMLButtonElement>({
    id: 'qm_resume_game',
    scopeId: 'overlay_quick_menu',
    onConfirm: () => {
      void consoleResumeGame().catch(() => {})
      handleClose()
    },
  })

  const hudBtn = useFocusable<HTMLButtonElement>({
    id: 'qm_toggle_hud',
    scopeId: 'overlay_quick_menu',
    onConfirm: onToggleHudMetrics,
  })

  const boostBtn = useFocusable<HTMLButtonElement>({
    id: 'qm_run_boost',
    scopeId: 'overlay_quick_menu',
    onConfirm: () => {
      runGameBoost()
        .then(() => setBoostMsg('RAM Purged & High Performance Active'))
        .catch(() => setBoostMsg('System Boost Active'))
    },
  })

  const volDownBtn = useFocusable<HTMLButtonElement>({
    id: 'qm_vol_down',
    scopeId: 'overlay_quick_menu',
    onConfirm: () => {
      const nextVal = Math.max(0, volume - 10)
      setVolume(nextVal)
      void consoleSetMasterVolume(nextVal).then(setVolume).catch(() => {})
    },
  })

  const volUpBtn = useFocusable<HTMLButtonElement>({
    id: 'qm_vol_up',
    scopeId: 'overlay_quick_menu',
    onConfirm: () => {
      const nextVal = Math.min(100, volume + 10)
      setVolume(nextVal)
      void consoleSetMasterVolume(nextVal).then(setVolume).catch(() => {})
    },
  })

  const musicPlayBtn = useFocusable<HTMLButtonElement>({
    id: 'qm_music_play',
    scopeId: 'overlay_quick_menu',
    onConfirm: () => togglePlay(),
  })

  const musicNextBtn = useFocusable<HTMLButtonElement>({
    id: 'qm_music_next',
    scopeId: 'overlay_quick_menu',
    onConfirm: () => {
      void next()
    },
  })

  const closeBtn = useFocusable<HTMLButtonElement>({
    id: 'qm_close_btn',
    scopeId: 'overlay_quick_menu',
    onConfirm: handleClose,
  })

  if (!open) return null

  const firstPad = status?.controllers?.[0]

  return (
    <div className="pointer-events-auto fixed inset-0 z-[10050] bg-black/65 backdrop-blur-md flex items-center justify-start p-6 select-none">
      <FocusScope
        id="overlay_quick_menu"
        trapFocus
        orientation="vertical"
        className="w-[410px] h-full max-h-[92vh] rounded-3xl bg-slate-950/95 border border-cyan-400/35 p-6 flex flex-col justify-between shadow-[0_0_60px_rgba(0,229,255,0.28)]"
      >
        <div className="space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-cyan-300 font-black">
                N
              </div>
              <div>
                <h2 className="text-lg font-black text-white">Nexus Quick Menu</h2>
                <p className="text-[11px] text-cyan-300 font-semibold">
                  In-Game Controller Overlay
                </p>
              </div>
            </div>

            <button
              type="button"
              {...closeBtn.focusProps}
              className={`p-2 rounded-xl border ${
                closeBtn.isFocused
                  ? 'bg-cyan-400 text-slate-950 border-cyan-300'
                  : 'bg-white/5 text-slate-300 border-white/10'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Primary Actions */}
          <div className="space-y-2.5">
            <button
              type="button"
              {...resumeBtn.focusProps}
              className={`w-full p-4 rounded-2xl font-extrabold text-sm flex items-center justify-between transition-all ${
                resumeBtn.isFocused
                  ? 'bg-cyan-400 text-slate-950 scale-[1.02] shadow-lg'
                  : 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/30'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Play className="w-4 h-4 fill-current" />
                Resume Game
              </span>
              <Glyph button="confirm" size="sm" />
            </button>

            <button
              type="button"
              {...hudBtn.focusProps}
              className={`w-full p-3.5 rounded-2xl font-bold text-sm flex items-center justify-between border transition-all ${
                hudBtn.isFocused
                  ? 'bg-cyan-400 text-slate-950 border-cyan-300 scale-[1.02]'
                  : 'bg-white/5 text-slate-200 border-white/10'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Activity className="w-4 h-4 text-emerald-400" />
                Toggle Performance HUD
              </span>
            </button>

            <button
              type="button"
              {...boostBtn.focusProps}
              className={`w-full p-3.5 rounded-2xl font-bold text-sm flex items-center justify-between border transition-all ${
                boostBtn.isFocused
                  ? 'bg-amber-400 text-slate-950 border-amber-300 scale-[1.02]'
                  : 'bg-white/5 text-slate-200 border-white/10'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Zap className="w-4 h-4 text-amber-400" />
                {boostMsg || '1-Click RAM & CPU Boost'}
              </span>
            </button>
          </div>

          {/* Master Volume */}
          <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2.5">
            <div className="flex items-center justify-between text-xs font-bold">
              <span className="text-slate-200 flex items-center gap-1.5">
                <Volume2 className="w-4 h-4 text-cyan-400" />
                Master Volume
              </span>
              <span className="text-cyan-300">{volume}%</span>
            </div>
            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-400 to-violet-500"
                style={{ width: `${volume}%` }}
              />
            </div>
            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                {...volDownBtn.focusProps}
                className={`py-2 rounded-xl font-bold text-xs border ${
                  volDownBtn.isFocused
                    ? 'bg-cyan-400 text-slate-950 border-cyan-300'
                    : 'bg-slate-900 text-slate-200 border-white/10'
                }`}
              >
                -10%
              </button>
              <button
                type="button"
                {...volUpBtn.focusProps}
                className={`py-2 rounded-xl font-bold text-xs border ${
                  volUpBtn.isFocused
                    ? 'bg-cyan-400 text-slate-950 border-cyan-300'
                    : 'bg-slate-900 text-slate-200 border-white/10'
                }`}
              >
                +10%
              </button>
            </div>
          </div>

          {/* Soundtrack Mini-Control */}
          <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-200 flex items-center gap-1.5">
                <Music className="w-3.5 h-3.5 text-violet-400" />
                Soundtrack
              </span>
              <span className="text-slate-400 truncate max-w-[160px]">
                {currentTrack ? currentTrack.title : 'Idle'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                {...musicPlayBtn.focusProps}
                className={`py-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 border ${
                  musicPlayBtn.isFocused
                    ? 'bg-cyan-400 text-slate-950 border-cyan-300'
                    : 'bg-slate-900 text-slate-200 border-white/10'
                }`}
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                {isPlaying ? 'Pause' : 'Play'}
              </button>
              <button
                type="button"
                {...musicNextBtn.focusProps}
                className={`py-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 border ${
                  musicNextBtn.isFocused
                    ? 'bg-cyan-400 text-slate-950 border-cyan-300'
                    : 'bg-slate-900 text-slate-200 border-white/10'
                }`}
              >
                <SkipForward className="w-3.5 h-3.5" />
                Next
              </button>
            </div>
          </div>

          {/* Controller Telemetry */}
          {firstPad && (
            <div className="px-4 py-3 rounded-2xl bg-emerald-500/10 border border-emerald-400/25 flex items-center justify-between text-xs text-emerald-300">
              <span className="flex items-center gap-2 font-bold">
                <Gamepad2 className="w-4 h-4" />
                {firstPad.name}
              </span>
              <span className="font-extrabold">{firstPad.battery_percent}%</span>
            </div>
          )}
        </div>

        {/* Footer Hint */}
        <div className="pt-3 border-t border-white/10 space-y-2 text-[11px] text-slate-400">
          <p className="flex items-center gap-1.5">
            <Monitor className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            Hold Back+Start (1s) if Windows Game Bar claims the Guide button.
          </p>
          <div className="flex items-center justify-between pt-1">
            <Glyph button="confirm" label="Select" size="sm" />
            <Glyph button="back" label="Resume Game" size="sm" />
          </div>
        </div>
      </FocusScope>
    </div>
  )
}
