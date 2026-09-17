import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Zap, Check, Rocket, X, Sparkles, Loader2, Activity } from 'lucide-react'
import { useLaunchBoostStore } from '../store/launch-boost-store'
import { useAnimationSpeed } from '@/hooks/use-animation-speed'
import { assetUrl } from '@/lib/asset-url'
import { CoverMedia } from '@/components/ui/cover-media'
import { playBoostCharge, playBoostComplete, playButtonClick } from '@/lib/sound-engine'
import { cn } from '@/lib/utils'

const R = 72
const CIRC = 2 * Math.PI * R
const C = 88 // Center for 176x176 viewBox

export function LaunchBoostModal() {
  const isOpen = useLaunchBoostStore((s) => s.isOpen)
  const game = useLaunchBoostStore((s) => s.game)
  const progress = useLaunchBoostStore((s) => s.progress)
  const phase = useLaunchBoostStore((s) => s.phase)
  const activeStepLabel = useLaunchBoostStore((s) => s.activeStepLabel)
  const steps = useLaunchBoostStore((s) => s.steps)
  const closedApps = useLaunchBoostStore((s) => s.closedApps)
  const close = useLaunchBoostStore((s) => s.close)

  const speed = useAnimationSpeed()
  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sound triggers
  useEffect(() => {
    if (isOpen) {
      playBoostCharge()
    }
  }, [isOpen])

  useEffect(() => {
    if (phase === 'ready') {
      playBoostComplete()
      // Auto-close after user sees the completed state
      autoCloseTimerRef.current = setTimeout(
        () => {
          close()
        },
        Math.max(700, 750 * speed),
      )
    }
    return () => {
      if (autoCloseTimerRef.current) {
        clearTimeout(autoCloseTimerRef.current)
      }
    }
  }, [phase, speed, close])

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, close])

  if (typeof document === 'undefined') return null
  const modalHost = document.getElementById('modal-host') || document.body

  const pct = Math.min(100, Math.max(0, progress))
  const strokeOffset = CIRC * (1 - pct / 100)
  const isReady = phase === 'ready'
  const cover = game?.cover_path ? assetUrl(game.cover_path) : null

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[170] flex items-center justify-center p-4 pointer-events-auto">
          {/* Ambient Backdrop Blur */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 * speed }}
            onClick={close}
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
          />

          {/* Glowing Cyber Atmosphere */}
          <div className="pointer-events-none absolute size-60 rounded-full bg-accent/20 blur-2xl" />
          {isReady && (
            <div className="pointer-events-none absolute size-60 rounded-full bg-emerald-500/25 blur-2xl transition-opacity duration-500" />
          )}

          {/* Modal Container */}
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, scale: 0.92, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 8 }}
            transition={{ type: 'spring', stiffness: 360, damping: 28 }}
            className={cn(
              'relative w-full max-w-lg overflow-hidden rounded-3xl border bg-surface/95 p-6 shadow-2xl select-none',
              isReady
                ? 'border-emerald-500/60 shadow-[0_0_50px_rgba(16,185,129,0.35)]'
                : 'border-accent/40 shadow-[0_0_50px_var(--nx-accent)]',
            )}
          >
            {/* Top Specular Rim */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />

            {/* Futuristic Corner Brackets */}
            <div className="pointer-events-none absolute left-3 top-3 size-3 border-l-2 border-t-2 border-accent/40 rounded-tl" />
            <div className="pointer-events-none absolute right-3 top-3 size-3 border-r-2 border-t-2 border-accent/40 rounded-tr" />
            <div className="pointer-events-none absolute bottom-3 left-3 size-3 border-b-2 border-l-2 border-accent/40 rounded-bl" />
            <div className="pointer-events-none absolute bottom-3 right-3 size-3 border-b-2 border-r-2 border-accent/40 rounded-br" />

            {/* Header: Game Identity & Close Button */}
            <div className="relative mb-5 flex items-center justify-between border-b border-border/50 pb-4">
              <div className="flex items-center gap-3.5 min-w-0">
                {/* Mini Cover Poster */}
                <div className="relative size-12 shrink-0 overflow-hidden rounded-xl border border-white/20 bg-bg shadow-md ring-1 ring-white/10">
                  {cover ? (
                    <CoverMedia src={cover} className="size-full object-cover" />
                  ) : (
                    <div className="flex size-full items-center justify-center bg-surface-raised text-accent">
                      <Rocket className="size-5" />
                    </div>
                  )}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 font-mono text-[9px] font-black uppercase tracking-[0.2em] text-accent">
                      <Zap className="size-2.5 fill-current" />
                      Nexus Turbo Matrix
                    </span>
                    <span className="size-1 rounded-full bg-border" />
                    <span className="font-mono text-[9px] text-muted">
                      {isReady ? 'Ready' : 'Optimizing'}
                    </span>
                  </div>
                  <h2 className="truncate text-base font-black tracking-tight text-text">
                    {game?.name || 'Launching Game'}
                  </h2>
                </div>
              </div>

              {/* Close / Skip button */}
              <button
                type="button"
                onClick={() => {
                  playButtonClick()
                  close()
                }}
                title="Dismiss booster popup"
                className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-surface text-muted transition-all hover:border-white/25 hover:bg-surface-raised hover:text-text active:scale-90"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Centerpiece: Dial + Status */}
            <div className="flex flex-col items-center justify-center py-2">
              <div className="relative size-[176px] shrink-0">
                {/* Ambient Radial Glow */}
                <div
                  className={cn(
                    'pointer-events-none absolute inset-[-6px] rounded-full transition-all duration-500',
                    isReady
                      ? 'bg-emerald-500/20 shadow-[0_0_30px_rgba(52,211,153,0.4)]'
                      : 'bg-accent/20 animate-pulse',
                  )}
                />

                {/* SVG Dial */}
                <svg viewBox="0 0 176 176" className="size-full">
                  <defs>
                    <linearGradient id="boost-grad-accent" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="var(--color-accent)" />
                      <stop
                        offset="100%"
                        stopColor="color-mix(in srgb, var(--color-accent) 70%, #6366f1)"
                      />
                    </linearGradient>
                    <linearGradient id="boost-grad-done" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#34d399" />
                      <stop offset="100%" stopColor="#10b981" />
                    </linearGradient>
                  </defs>

                  {/* Background Track */}
                  <circle
                    cx={C}
                    cy={C}
                    r={R}
                    fill="none"
                    stroke="var(--nx-border)"
                    strokeWidth="5"
                    strokeOpacity="0.45"
                  />

                  {/* Ticks */}
                  {Array.from({ length: 28 }).map((_, i) => {
                    const angle = (i / 28) * 360
                    const isMajor = i % 7 === 0
                    const rad = (angle * Math.PI) / 180
                    const inner = R + (isMajor ? 4 : 6)
                    const outer = R + 8
                    return (
                      <line
                        key={i}
                        x1={C + Math.cos(rad) * inner}
                        y1={C + Math.sin(rad) * inner}
                        x2={C + Math.cos(rad) * outer}
                        y2={C + Math.sin(rad) * outer}
                        strokeWidth={isMajor ? 1.5 : 1}
                        className={isMajor ? 'stroke-accent/70' : 'stroke-border/70'}
                      />
                    )
                  })}

                  {/* Progress Arc */}
                  <circle
                    cx={C}
                    cy={C}
                    r={R}
                    fill="none"
                    stroke={isReady ? 'url(#boost-grad-done)' : 'url(#boost-grad-accent)'}
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeDasharray={CIRC}
                    strokeDashoffset={strokeOffset}
                    transform={`rotate(-90 ${C} ${C})`}
                    className="transition-[stroke-dashoffset] duration-300 ease-out"
                    style={{
                      filter: `drop-shadow(0 0 8px ${
                        isReady
                          ? 'rgba(52,211,153,0.8)'
                          : 'color-mix(in srgb, var(--color-accent) 75%, transparent)'
                      })`,
                    }}
                  />
                </svg>

                {/* Center Core */}
                <div
                  className={cn(
                    'absolute left-1/2 top-1/2 z-10 flex size-28 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border shadow-lg transition-all duration-300',
                    isReady
                      ? 'border-emerald-400/50 bg-surface/95 text-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.3)]'
                      : 'border-accent/50 bg-surface/95 text-text shadow-[0_0_20px_color-mix(in_srgb,var(--color-accent)_30%,transparent)]',
                  )}
                >
                  {isReady ? (
                    <motion.div
                      initial={{ scale: 0.6, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: 'spring', stiffness: 380, damping: 20 }}
                      className="flex flex-col items-center text-center"
                    >
                      <div className="flex size-8 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/40">
                        <Check className="size-4.5" strokeWidth={3} />
                      </div>
                      <span className="mt-1 font-mono text-[10px] font-black tracking-widest text-emerald-400">
                        100%
                      </span>
                    </motion.div>
                  ) : (
                    <div className="flex flex-col items-center">
                      <div className="flex items-baseline font-mono text-2xl font-black tabular-nums tracking-tight text-text">
                        <span>{Math.round(pct)}</span>
                        <span className="text-xs font-bold text-accent">%</span>
                      </div>
                      <span className="mt-0.5 flex items-center gap-1 font-mono text-[8px] font-black tracking-widest text-accent uppercase animate-pulse">
                        <Zap className="size-2.5 fill-current" />
                        Boost
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Status Banner */}
              <div className="mt-3 flex items-center gap-2">
                {isReady ? (
                  <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 font-mono text-[11px] font-bold text-emerald-400 shadow-sm">
                    <Sparkles className="size-3.5" />
                    <span>SYSTEM OPTIMIZED • GAME RUNNING</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 font-mono text-[11px] font-bold text-accent shadow-sm">
                    <Loader2 className="size-3.5 animate-spin" />
                    <span>{activeStepLabel}</span>
                  </span>
                )}
              </div>
            </div>

            {/* Telemetry Console / Completed Steps */}
            <div className="mt-4 rounded-2xl border border-border/70 bg-bg/80 p-3 shadow-inner">
              <div className="mb-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted font-mono">
                <span className="flex items-center gap-1.5">
                  <Activity className="size-3 text-accent" />
                  Live Optimization Steps
                </span>
                <span>{steps.length} Actions</span>
              </div>

              <div className="flex flex-col gap-1.5 max-h-36 overflow-y-auto pr-1">
                {steps.map((s, idx) => (
                  <motion.div
                    key={s.id || idx}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2 * speed }}
                    className="flex items-center justify-between rounded-lg border border-white/5 bg-surface/60 px-2.5 py-1.5 text-xs backdrop-blur-sm"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="flex size-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30">
                        <Check className="size-2.5" strokeWidth={3} />
                      </div>
                      <span className="truncate text-[11px] font-medium text-text">{s.label}</span>
                    </div>

                    {s.metric && (
                      <span className="ml-2 shrink-0 rounded border border-accent/30 bg-accent/10 px-1.5 py-0.5 font-mono text-[9px] font-bold text-accent">
                        {s.metric}
                      </span>
                    )}
                  </motion.div>
                ))}

                {closedApps.length > 0 && (
                  <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted font-mono truncate px-1">
                    <span className="text-accent font-bold">Quiet Apps:</span>
                    <span className="truncate">{closedApps.join(', ')}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Neon Progress Beam */}
            <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-black/60">
              <div
                className={cn(
                  'h-full transition-all duration-300',
                  isReady
                    ? 'bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]'
                    : 'bg-gradient-to-r from-accent via-cyan-400 to-accent shadow-[0_0_12px_var(--nx-accent)]',
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    modalHost,
  )
}
