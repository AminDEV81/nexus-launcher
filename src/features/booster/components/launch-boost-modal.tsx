import { useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Zap,
  Check,
  Rocket,
  X,
  Sparkles,
  Loader2,
  Activity,
  Clock,
  Flame,
  Layers,
  Terminal,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react'
import { useLaunchBoostStore } from '../store/launch-boost-store'
import { useAnimationSpeed } from '@/hooks/use-animation-speed'
import { assetUrl } from '@/lib/asset-url'
import { CoverMedia } from '@/components/ui/cover-media'
import { playBoostCharge, playBoostComplete, playButtonClick } from '@/lib/sound-engine'
import { cn } from '@/lib/utils'

const R = 72
const CIRC = 2 * Math.PI * R
const C = 90 // Center for 180x180 viewBox

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
      // Auto-close after showing completed armed state
      autoCloseTimerRef.current = setTimeout(
        () => {
          close()
        },
        Math.max(1200, 1400 * speed),
      )
    }
    return () => {
      if (autoCloseTimerRef.current) {
        clearTimeout(autoCloseTimerRef.current)
      }
    }
  }, [phase, speed, close])

  // Keyboard shortcut listener (ESC, Space, Enter)
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || ((e.key === 'Enter' || e.key === ' ') && phase === 'ready')) {
        e.preventDefault()
        close()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, phase, close])

  const pct = Math.min(100, Math.max(0, progress))
  const strokeOffset = CIRC * (1 - pct / 100)
  const isReady = phase === 'ready'
  const isLaunching = phase === 'launching'

  // Artwork resolution
  const coverUrl = useMemo(
    () => (game?.cover_path ? assetUrl(game.cover_path) : null),
    [game?.cover_path],
  )
  const backdropPath = game?.background_path || game?.banner_path || game?.cover_path
  const backdropUrl = useMemo(() => (backdropPath ? assetUrl(backdropPath) : null), [backdropPath])
  const logoUrl = useMemo(
    () => (game?.logo_path ? assetUrl(game.logo_path) : null),
    [game?.logo_path],
  )

  // Subsystem metrics extraction
  const telemetry = useMemo(() => {
    const ramStep = steps.find((s) => s.id === 'ram' || s.id === 'clean_ram')
    const timerStep = steps.find((s) => s.id === 'timer_res')
    const powerStep = steps.find((s) => s.id === 'power_plan')
    const priorityStep = steps.find((s) => s.id === 'gaming_priority' || s.id === 'cpu')

    return {
      ram: {
        value: ramStep?.metric || (pct >= 40 ? 'Cleaned' : 'Flushing'),
        applied: Boolean(ramStep?.applied || pct >= 40),
        detail: 'Standby List & Cache',
      },
      timer: {
        value: timerStep?.metric || (pct >= 80 ? '1.0 ms' : 'Locking'),
        applied: Boolean(timerStep?.applied || pct >= 80),
        detail: '10,000 Hz Scheduler',
      },
      priority: {
        value: priorityStep?.metric || (pct >= 60 ? 'Realtime' : 'Optimizing'),
        applied: Boolean(priorityStep?.applied || pct >= 60),
        detail: 'MMCSS Audio/Game',
      },
      power: {
        value: powerStep?.metric || (pct >= 50 ? 'Ultimate' : 'Engaging'),
        applied: Boolean(powerStep?.applied || pct >= 50),
        detail: 'Zero Throttle Mode',
      },
    }
  }, [steps, pct])

  if (typeof document === 'undefined') return null
  const modalHost = document.getElementById('modal-host') || document.body

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
            className="absolute inset-0 bg-black/60 dark:bg-black/85 backdrop-blur-md"
          />

          {/* Ambient Cyber Atmosphere Glows */}
          <div
            className={cn(
              'pointer-events-none absolute size-80 rounded-full blur-3xl transition-opacity duration-700',
              isReady ? 'bg-emerald-500/20' : 'bg-accent/20',
            )}
          />

          {/* Modal Card */}
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, scale: 0.94, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            className={cn(
              'relative w-full max-w-2xl overflow-hidden rounded-3xl border bg-surface/95 p-6 shadow-2xl select-none text-text backdrop-blur-xl',
              isReady
                ? 'border-emerald-500/50 shadow-[0_0_60px_rgba(16,185,129,0.25)]'
                : 'border-accent/40 shadow-[0_0_60px_var(--nx-accent)]',
            )}
          >
            {/* Cinematic Background Artwork */}
            {backdropUrl && (
              <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
                <CoverMedia
                  src={backdropUrl}
                  className="size-full object-cover opacity-15 scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/90 to-surface/70" />
              </div>
            )}

            {/* Futuristic Dot-Matrix / Circuit Texture */}
            <div className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(#0000000d_1px,transparent_1px)] dark:bg-[radial-gradient(#ffffff0a_1px,transparent_1px)] [background-size:16px_16px]" />

            {/* Specular Rim */}
            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-px bg-gradient-to-r from-transparent via-accent/30 dark:via-white/30 to-transparent" />

            {/* Corner Cyber Brackets */}
            <div className="pointer-events-none absolute left-3 top-3 size-3.5 border-l-2 border-t-2 border-accent/50 rounded-tl" />
            <div className="pointer-events-none absolute right-3 top-3 size-3.5 border-r-2 border-t-2 border-accent/50 rounded-tr" />
            <div className="pointer-events-none absolute bottom-3 left-3 size-3.5 border-b-2 border-l-2 border-accent/50 rounded-bl" />
            <div className="pointer-events-none absolute bottom-3 right-3 size-3.5 border-b-2 border-r-2 border-accent/50 rounded-br" />

            {/* Top Header Bar */}
            <div className="relative z-10 mb-5 flex items-center justify-between border-b border-border pb-4">
              <div className="flex items-center gap-3.5 min-w-0">
                {/* Poster Artwork or Game Icon */}
                <div className="relative size-14 shrink-0 overflow-hidden rounded-2xl border border-border bg-surface-raised shadow-lg ring-1 ring-border">
                  {coverUrl ? (
                    <CoverMedia src={coverUrl} className="size-full object-cover" />
                  ) : (
                    <div className="flex size-full items-center justify-center bg-surface-raised text-accent">
                      <Rocket className="size-6" />
                    </div>
                  )}
                  {isReady && (
                    <div className="absolute inset-0 bg-emerald-500/20 backdrop-blur-[1px] flex items-center justify-center">
                      <Check className="size-5 text-emerald-500 dark:text-emerald-400 stroke-[3]" />
                    </div>
                  )}
                </div>

                {/* Identity & Status */}
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 font-mono text-[9px] font-black uppercase tracking-[0.2em] text-accent">
                      <Zap className="size-3 fill-current" />
                      Nexus Turbo Matrix 2.0
                    </span>
                    <span className="size-1 rounded-full bg-muted/40" />
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider',
                        isReady
                          ? 'border border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                          : isLaunching
                            ? 'border border-cyan-500/40 bg-cyan-500/15 text-cyan-600 dark:text-cyan-400'
                            : 'border border-accent/40 bg-accent/15 text-accent',
                      )}
                    >
                      {isReady ? 'Armed & Running' : isLaunching ? 'Launching' : 'Optimizing'}
                    </span>
                  </div>

                  {logoUrl ? (
                    <div className="mt-1 h-7 max-w-[240px]">
                      <CoverMedia
                        src={logoUrl}
                        className="h-full w-auto object-contain object-left"
                      />
                    </div>
                  ) : (
                    <h2 className="mt-0.5 truncate text-lg font-black tracking-tight text-text drop-shadow-sm">
                      {game?.name || 'Launching Game'}
                    </h2>
                  )}

                  <div className="flex items-center gap-2 text-[11px] text-muted">
                    {game?.developer && <span className="truncate">{game.developer}</span>}
                    {game?.genres && game.genres.length > 0 && (
                      <>
                        <span className="size-1 rounded-full bg-muted/40" />
                        <span className="truncate">{game.genres.slice(0, 2).join(' • ')}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Close / Skip button */}
              <div className="flex items-center gap-2">
                <kbd className="hidden sm:inline-block rounded border border-border bg-surface-raised px-1.5 py-0.5 font-mono text-[9px] text-muted">
                  ESC
                </kbd>
                <button
                  type="button"
                  onClick={() => {
                    playButtonClick()
                    close()
                  }}
                  title="Dismiss booster popup"
                  className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-raised text-muted transition-all hover:border-border hover:bg-surface hover:text-text active:scale-95"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>

            {/* Center HUD Core */}
            <div className="relative z-10 grid grid-cols-1 md:grid-cols-12 gap-5 items-center py-2">
              {/* Left/Center: Tachometer Dial */}
              <div className="md:col-span-5 flex flex-col items-center justify-center">
                <div className="relative size-[180px] shrink-0">
                  {/* Ambient Dial Glow */}
                  <div
                    className={cn(
                      'pointer-events-none absolute inset-[-8px] rounded-full transition-all duration-500',
                      isReady
                        ? 'bg-emerald-500/20 shadow-[0_0_35px_rgba(52,211,153,0.4)]'
                        : 'bg-accent/20 animate-pulse',
                    )}
                  />

                  {/* SVG Tech Tachometer */}
                  <svg viewBox="0 0 180 180" className="size-full">
                    <defs>
                      <linearGradient id="turbo-grad-accent" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="var(--color-accent)" />
                        <stop offset="60%" stopColor="#06b6d4" />
                        <stop offset="100%" stopColor="#8b5cf6" />
                      </linearGradient>
                      <linearGradient id="turbo-grad-ready" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#34d399" />
                        <stop offset="100%" stopColor="#10b981" />
                      </linearGradient>
                    </defs>

                    {/* Outer Gauge Track */}
                    <circle
                      cx={C}
                      cy={C}
                      r={R}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="5"
                      className="text-border/60"
                    />

                    {/* Calibrated Radial Ticks */}
                    {Array.from({ length: 36 }).map((_, i) => {
                      const angle = (i / 36) * 360
                      const isMajor = i % 9 === 0
                      const rad = (angle * Math.PI) / 180
                      const inner = R + (isMajor ? 4 : 6)
                      const outer = R + 8
                      const isTickLit = (i / 36) * 100 <= pct

                      return (
                        <line
                          key={i}
                          x1={C + Math.cos(rad) * inner}
                          y1={C + Math.sin(rad) * inner}
                          x2={C + Math.cos(rad) * outer}
                          y2={C + Math.sin(rad) * outer}
                          strokeWidth={isMajor ? 2 : 1}
                          className={cn(
                            'transition-colors duration-300',
                            isTickLit
                              ? isReady
                                ? 'stroke-emerald-500 dark:stroke-emerald-400'
                                : 'stroke-accent'
                              : 'stroke-border dark:stroke-white/15',
                          )}
                        />
                      )
                    })}

                    {/* Dynamic Arc */}
                    <circle
                      cx={C}
                      cy={C}
                      r={R}
                      fill="none"
                      stroke={isReady ? 'url(#turbo-grad-ready)' : 'url(#turbo-grad-accent)'}
                      strokeWidth="6"
                      strokeLinecap="round"
                      strokeDasharray={CIRC}
                      strokeDashoffset={strokeOffset}
                      transform={`rotate(-90 ${C} ${C})`}
                      className="transition-[stroke-dashoffset] duration-300 ease-out"
                      style={{
                        filter: `drop-shadow(0 0 10px ${
                          isReady ? 'rgba(52,211,153,0.85)' : 'rgba(6,182,212,0.7)'
                        })`,
                      }}
                    />
                  </svg>

                  {/* Inner Reactor Center */}
                  <div
                    className={cn(
                      'absolute left-1/2 top-1/2 z-10 flex size-28 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border shadow-xl backdrop-blur-sm transition-all duration-300',
                      isReady
                        ? 'border-emerald-500/50 bg-emerald-500/10 dark:bg-[#0d1613]/95 text-emerald-600 dark:text-emerald-400 shadow-[0_0_24px_rgba(52,211,153,0.35)]'
                        : 'border-accent/40 bg-surface-raised/95 text-text shadow-[0_0_24px_rgba(6,182,212,0.25)]',
                    )}
                  >
                    {isReady ? (
                      <motion.div
                        initial={{ scale: 0.6, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: 'spring', stiffness: 380, damping: 20 }}
                        className="flex flex-col items-center text-center"
                      >
                        <div className="flex size-9 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/50">
                          <Check className="size-5" strokeWidth={3} />
                        </div>
                        <span className="mt-1 font-mono text-[10px] font-black tracking-widest text-emerald-600 dark:text-emerald-400">
                          ARMED
                        </span>
                      </motion.div>
                    ) : (
                      <div className="flex flex-col items-center">
                        <div className="flex items-baseline font-mono text-3xl font-black tabular-nums tracking-tight text-text drop-shadow-sm">
                          <span>{Math.round(pct)}</span>
                          <span className="text-xs font-bold text-accent">%</span>
                        </div>
                        <span className="mt-0.5 flex items-center gap-1 font-mono text-[8px] font-black tracking-widest text-accent uppercase animate-pulse">
                          <Zap className="size-2.5 fill-current" />
                          {isLaunching ? 'Spawning' : 'Optimizing'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Subsystem State Ribbon */}
                <div className="mt-3 flex items-center justify-center">
                  {isReady ? (
                    <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/50 bg-emerald-500/15 px-3 py-1 font-mono text-[11px] font-bold text-emerald-700 dark:text-emerald-300 shadow-sm">
                      <Sparkles className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>SYSTEM ARMED • RUNTIME ACTIVE</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 font-mono text-[11px] font-bold text-accent shadow-sm">
                      <Loader2 className="size-3.5 animate-spin" />
                      <span className="truncate max-w-[200px]">{activeStepLabel}</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Right: Telemetry Matrix Grid (4 Cyber HUD Tiles) */}
              <div className="md:col-span-7 grid grid-cols-2 gap-2.5">
                {/* Tile 1: Memory */}
                <div
                  className={cn(
                    'relative overflow-hidden rounded-2xl border p-3 transition-all duration-300',
                    telemetry.ram.applied
                      ? 'border-emerald-500/40 bg-emerald-500/10 dark:bg-emerald-950/20 shadow-sm'
                      : 'border-border bg-surface-raised/70',
                  )}
                >
                  <div className="flex items-center justify-between text-muted">
                    <span className="font-mono text-[9px] font-black uppercase tracking-wider">
                      Memory Matrix
                    </span>
                    <Layers
                      className={cn(
                        'size-3.5',
                        telemetry.ram.applied
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-accent',
                      )}
                    />
                  </div>
                  <div className="mt-1 font-mono text-sm font-black text-text truncate">
                    {telemetry.ram.value}
                  </div>
                  <div className="text-[10px] text-muted truncate">{telemetry.ram.detail}</div>
                </div>

                {/* Tile 2: Kernel Timer */}
                <div
                  className={cn(
                    'relative overflow-hidden rounded-2xl border p-3 transition-all duration-300',
                    telemetry.timer.applied
                      ? 'border-emerald-500/40 bg-emerald-500/10 dark:bg-emerald-950/20 shadow-sm'
                      : 'border-border bg-surface-raised/70',
                  )}
                >
                  <div className="flex items-center justify-between text-muted">
                    <span className="font-mono text-[9px] font-black uppercase tracking-wider">
                      Kernel Clock
                    </span>
                    <Clock
                      className={cn(
                        'size-3.5',
                        telemetry.timer.applied
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-accent',
                      )}
                    />
                  </div>
                  <div className="mt-1 font-mono text-sm font-black text-text truncate">
                    {telemetry.timer.value}
                  </div>
                  <div className="text-[10px] text-muted truncate">{telemetry.timer.detail}</div>
                </div>

                {/* Tile 3: CPU Priority */}
                <div
                  className={cn(
                    'relative overflow-hidden rounded-2xl border p-3 transition-all duration-300',
                    telemetry.priority.applied
                      ? 'border-emerald-500/40 bg-emerald-500/10 dark:bg-emerald-950/20 shadow-sm'
                      : 'border-border bg-surface-raised/70',
                  )}
                >
                  <div className="flex items-center justify-between text-muted">
                    <span className="font-mono text-[9px] font-black uppercase tracking-wider">
                      Process Quantum
                    </span>
                    <Activity
                      className={cn(
                        'size-3.5',
                        telemetry.priority.applied
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-accent',
                      )}
                    />
                  </div>
                  <div className="mt-1 font-mono text-sm font-black text-text truncate">
                    {telemetry.priority.value}
                  </div>
                  <div className="text-[10px] text-muted truncate">{telemetry.priority.detail}</div>
                </div>

                {/* Tile 4: Power Plan */}
                <div
                  className={cn(
                    'relative overflow-hidden rounded-2xl border p-3 transition-all duration-300',
                    telemetry.power.applied
                      ? 'border-emerald-500/40 bg-emerald-500/10 dark:bg-emerald-950/20 shadow-sm'
                      : 'border-border bg-surface-raised/70',
                  )}
                >
                  <div className="flex items-center justify-between text-muted">
                    <span className="font-mono text-[9px] font-black uppercase tracking-wider">
                      Power Scheme
                    </span>
                    <Flame
                      className={cn(
                        'size-3.5',
                        telemetry.power.applied
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-accent',
                      )}
                    />
                  </div>
                  <div className="mt-1 font-mono text-sm font-black text-text truncate">
                    {telemetry.power.value}
                  </div>
                  <div className="text-[10px] text-muted truncate">{telemetry.power.detail}</div>
                </div>
              </div>
            </div>

            {/* Diagnostic Step Terminal Feed */}
            <div className="relative z-10 mt-4 rounded-2xl border border-border bg-surface-raised/60 dark:bg-black/50 p-3 shadow-inner">
              <div className="mb-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted font-mono">
                <span className="flex items-center gap-1.5 text-accent">
                  <Terminal className="size-3" />
                  Subsystem Pipeline Logs
                </span>
                <span className="text-muted">
                  {steps.length} {steps.length === 1 ? 'Action' : 'Actions'} Executed
                </span>
              </div>

              <div className="flex flex-col gap-1.5 max-h-32 overflow-y-auto pr-1">
                {steps.map((s, idx) => (
                  <motion.div
                    key={s.id || idx}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2 * speed }}
                    className="flex items-center justify-between rounded-lg border border-border/50 bg-surface/80 dark:bg-white/[0.03] px-2.5 py-1.5 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="flex size-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/40">
                        <Check className="size-2.5" strokeWidth={3} />
                      </div>
                      <span className="truncate text-[11px] font-medium text-text">{s.label}</span>
                    </div>

                    <div className="flex items-center gap-2 ml-2 shrink-0">
                      {s.detail && (
                        <span className="hidden sm:inline-block font-mono text-[9px] text-muted truncate max-w-[140px]">
                          {s.detail}
                        </span>
                      )}
                      {s.metric && (
                        <span className="rounded border border-accent/40 bg-accent/15 px-1.5 py-0.5 font-mono text-[9px] font-bold text-accent">
                          {s.metric}
                        </span>
                      )}
                    </div>
                  </motion.div>
                ))}

                {closedApps.length > 0 && (
                  <div className="mt-1 flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[10px] font-mono text-amber-700 dark:text-amber-300">
                    <ShieldCheck className="size-3 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span className="font-bold shrink-0">Suspended Apps:</span>
                    <span className="truncate text-amber-800 dark:text-amber-200">
                      {closedApps.join(', ')}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Progress Energy Beam & Action Bar */}
            <div className="relative z-10 mt-4 flex items-center justify-between gap-4">
              <div className="relative h-2 w-full overflow-hidden rounded-full bg-surface-raised border border-border">
                <div
                  className={cn(
                    'h-full transition-all duration-300',
                    isReady
                      ? 'bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-400 shadow-[0_0_16px_rgba(52,211,153,0.9)]'
                      : 'bg-gradient-to-r from-accent via-cyan-400 to-purple-500 shadow-[0_0_16px_var(--nx-accent)]',
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>

              {isReady && (
                <button
                  type="button"
                  onClick={() => {
                    playButtonClick()
                    close()
                  }}
                  className="flex shrink-0 items-center gap-1 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black px-3.5 py-1.5 font-mono text-xs font-black shadow-lg transition-all active:scale-95"
                >
                  <span>READY</span>
                  <ChevronRight className="size-3.5 stroke-[3]" />
                </button>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    modalHost,
  )
}
