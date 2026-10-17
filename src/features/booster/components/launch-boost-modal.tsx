import { useEffect, useRef, useMemo, useId } from 'react'
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
  Wifi,
  Cpu,
  Gauge,
} from 'lucide-react'
import { useLaunchBoostStore } from '../store/launch-boost-store'
import { useAnimationSpeed } from '@/hooks/use-animation-speed'
import { assetUrl } from '@/lib/asset-url'
import { CoverMedia } from '@/components/ui/cover-media'
import { playBoostCharge, playBoostComplete, playButtonClick } from '@/lib/sound-engine'
import { cn } from '@/lib/utils'

const DIAL_SIZE = 200
const CENTER = DIAL_SIZE / 2
const OUTER_R = 88
const PROGRESS_R = 74
const INNER_R = 60
const CIRC = 2 * Math.PI * PROGRESS_R
const TICK_COUNT = 40

export function LaunchBoostModal() {
  const uid = useId().replace(/:/g, '')
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
      autoCloseTimerRef.current = setTimeout(
        () => {
          close()
        },
        Math.max(1350, 1550 * speed),
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

  // Leading comet position on circular dial
  const cometRad = ((pct / 100) * 360 - 90) * (Math.PI / 180)
  const cometX = CENTER + Math.cos(cometRad) * PROGRESS_R
  const cometY = CENTER + Math.sin(cometRad) * PROGRESS_R

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

    return [
      {
        id: 'ram',
        title: 'Physical & Standby RAM',
        value: ramStep?.metric || (pct >= 40 ? 'Purged' : 'Flushing...'),
        applied: Boolean(ramStep?.applied || pct >= 40),
        detail: 'Zero-Stutter Working Set',
        icon: Layers,
      },
      {
        id: 'timer',
        title: 'Kernel Frame Clock',
        value: timerStep?.metric || (pct >= 75 ? '1.0 ms Lock' : 'Locking...'),
        applied: Boolean(timerStep?.applied || pct >= 75),
        detail: 'High-Precision 1000Hz',
        icon: Clock,
      },
      {
        id: 'priority',
        title: 'CPU & GPU Quantum',
        value: priorityStep?.metric || (pct >= 55 ? 'High Priority' : 'Elevating...'),
        applied: Boolean(priorityStep?.applied || pct >= 55),
        detail: 'Foreground Thread Lock',
        icon: Cpu,
      },
      {
        id: 'power',
        title: 'Power & Full Bandwidth',
        value: powerStep?.metric
          ? `${powerStep.metric} • 100% Net`
          : pct >= 50
            ? 'Ultimate • 100%'
            : 'Engaging...',
        applied: Boolean(powerStep?.applied || pct >= 50),
        detail: 'Uncapped Pipe (No Limit)',
        icon: Gauge,
      },
    ]
  }, [steps, pct])

  if (typeof document === 'undefined') return null
  const modalHost = document.getElementById('modal-host') || document.body

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[170] flex items-center justify-center p-4 pointer-events-auto">
          {/* Deep Cinematic Backdrop Blur */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.24 * speed }}
            onClick={close}
            className="absolute inset-0 bg-black/75 backdrop-blur-xl"
          />

          {/* Outer Ambient Energy Bloom */}
          <motion.div
            animate={
              isReady
                ? { scale: [1, 1.08, 1], opacity: [0.35, 0.55, 0.35] }
                : { scale: [0.95, 1.06, 0.95], opacity: [0.28, 0.48, 0.28] }
            }
            transition={{ duration: 2.2 * speed, repeat: Infinity, ease: 'easeInOut' }}
            className={cn(
              'pointer-events-none absolute size-[460px] rounded-full blur-[90px] transition-colors duration-700',
              isReady ? 'bg-emerald-500/30' : 'bg-accent/30',
            )}
          />

          {/* Main HUD Launch Modal Container */}
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, scale: 0.9, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 16 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28, mass: 0.85 }}
            className={cn(
              'relative w-full max-w-[720px] overflow-hidden rounded-[28px] border bg-surface/95 shadow-2xl select-none text-text backdrop-blur-2xl transition-colors duration-500',
              isReady
                ? 'border-emerald-400/55 shadow-[0_24px_90px_rgba(16,185,129,0.32)]'
                : 'border-accent/45 shadow-[0_24px_90px_rgba(6,182,212,0.26)]',
            )}
          >
            {/* Top Laser Specular Highlight Bar */}
            <div
              className={cn(
                'pointer-events-none absolute inset-x-0 top-0 z-20 h-1 transition-all duration-500',
                isReady
                  ? 'bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_20px_rgba(52,211,153,0.9)]'
                  : 'bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_20px_var(--nx-accent)]',
              )}
            />

            {/* Corner HUD Brackets */}
            <span className="pointer-events-none absolute left-3.5 top-3.5 z-20 size-4 rounded-tl border-l-2 border-t-2 border-accent/60" />
            <span className="pointer-events-none absolute right-3.5 top-3.5 z-20 size-4 rounded-tr border-r-2 border-t-2 border-accent/60" />
            <span className="pointer-events-none absolute bottom-3.5 left-3.5 z-20 size-4 rounded-bl border-b-2 border-l-2 border-accent/60" />
            <span className="pointer-events-none absolute bottom-3.5 right-3.5 z-20 size-4 rounded-br border-b-2 border-r-2 border-accent/60" />

            {/* ── 1. HERO GAME BANNER HEADER ─────────────────────────────────── */}
            <div className="relative overflow-hidden border-b border-border/70 px-6 pb-5 pt-6">
              {/* Game Backdrop Artwork */}
              {backdropUrl && (
                <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
                  <CoverMedia
                    src={backdropUrl}
                    className="size-full object-cover opacity-25 scale-105 blur-[1px]"
                  />
                  <div className="absolute inset-0 bg-gradient-to-r from-surface via-surface/85 to-surface/65" />
                  <div className="absolute inset-0 bg-gradient-to-t from-surface via-transparent to-surface/40" />
                </div>
              )}

              {/* Subtle Cyber Grid Overlay */}
              <div className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(#ffffff12_1px,transparent_1px)] [background-size:16px_16px] opacity-35" />

              <div className="relative z-10 flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-4">
                  {/* Floating 3D Cover Thumbnail with Status Halo */}
                  <div className="relative shrink-0">
                    <motion.div
                      animate={isReady ? { scale: [1, 1.04, 1] } : { scale: [1, 1.02, 1] }}
                      transition={{ duration: 2 * speed, repeat: Infinity }}
                      className={cn(
                        'relative h-20 w-15 overflow-hidden rounded-2xl border-2 bg-surface-raised shadow-xl transition-colors duration-300',
                        isReady
                          ? 'border-emerald-400 shadow-[0_0_24px_rgba(52,211,153,0.45)]'
                          : 'border-accent/60 shadow-[0_0_20px_var(--nx-accent)]',
                      )}
                    >
                      {coverUrl ? (
                        <CoverMedia src={coverUrl} className="size-full object-cover" />
                      ) : (
                        <div className="flex size-full items-center justify-center bg-surface-raised text-accent">
                          <Rocket className="size-6" />
                        </div>
                      )}
                      {isReady && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="absolute inset-0 flex items-center justify-center bg-emerald-500/25 backdrop-blur-[1px]"
                        >
                          <div className="flex size-7 items-center justify-center rounded-full bg-emerald-500 text-black shadow-lg">
                            <Check className="size-4 stroke-[3]" />
                          </div>
                        </motion.div>
                      )}
                    </motion.div>
                  </div>

                  {/* Game Title & Live Telemetry Pills */}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/35 bg-accent/15 px-2.5 py-0.5 font-mono text-[9px] font-black uppercase tracking-[0.18em] text-accent">
                        <Zap className="size-2.5 fill-current" />
                        <span>OVERDRIVE LAUNCH SEQUENCE</span>
                      </span>

                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[9px] font-black uppercase tracking-wider',
                          isReady
                            ? 'border-emerald-500/45 bg-emerald-500/15 text-emerald-400'
                            : isLaunching
                              ? 'border-cyan-500/45 bg-cyan-500/15 text-cyan-300'
                              : 'border-amber-500/45 bg-amber-500/15 text-amber-300',
                        )}
                      >
                        <span
                          className={cn(
                            'size-1.5 rounded-full',
                            isReady
                              ? 'bg-emerald-400'
                              : isLaunching
                                ? 'bg-cyan-400 animate-ping'
                                : 'bg-amber-400 animate-pulse',
                          )}
                        />
                        {isReady
                          ? 'SYSTEM ARMED • RUNNING'
                          : isLaunching
                            ? 'SPAWNING EXECUTABLE'
                            : 'TUNING HARDWARE'}
                      </span>

                      {/* Explicit Uncapped Internet Badge */}
                      <span className="hidden sm:inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[9px] font-bold text-emerald-400">
                        <Wifi className="size-2.5" />
                        <span>100% Uncapped Net</span>
                      </span>
                    </div>

                    {logoUrl ? (
                      <div className="mt-1.5 h-8 max-w-[280px]">
                        <CoverMedia
                          src={logoUrl}
                          className="h-full w-auto object-contain object-left"
                        />
                      </div>
                    ) : (
                      <h2 className="mt-1 truncate text-xl font-black tracking-tight text-text sm:text-2xl">
                        {game?.name || 'Launching Game'}
                      </h2>
                    )}

                    <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                      {game?.developer && (
                        <span className="font-medium truncate">{game.developer}</span>
                      )}
                      {game?.genres && game.genres.length > 0 && (
                        <>
                          <span className="size-1 rounded-full bg-muted/40" />
                          <span className="truncate">{game.genres.slice(0, 2).join(' • ')}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Dismiss Button */}
                <div className="flex shrink-0 items-center gap-2">
                  <kbd className="hidden sm:inline-block rounded-lg border border-border bg-surface-raised/90 px-2 py-1 font-mono text-[9px] font-bold text-muted">
                    ESC
                  </kbd>
                  <button
                    type="button"
                    onClick={() => {
                      playButtonClick()
                      close()
                    }}
                    title="Dismiss launch overlay"
                    className="flex size-9 items-center justify-center rounded-xl border border-border/80 bg-surface-raised/90 text-muted transition-all hover:border-accent/40 hover:bg-surface hover:text-text active:scale-95"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* ── 2. REACTOR DIAL + 4 HARDWARE TELEMETRY CARDS ───────────────── */}
            <div className="relative z-10 px-6 py-5">
              <div className="grid grid-cols-1 items-center gap-6 md:grid-cols-12">
                {/* Left Column: Multi-Layer Plasma Reactor Dial */}
                <div className="flex flex-col items-center justify-center md:col-span-5">
                  <div className="relative flex size-[200px] items-center justify-center">
                    {/* Expanding Shockwave on Ready */}
                    <AnimatePresence>
                      {isReady && (
                        <motion.div
                          initial={{ scale: 0.7, opacity: 0.85 }}
                          animate={{ scale: 1.35, opacity: 0 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.85 * speed, ease: 'easeOut' }}
                          className="pointer-events-none absolute inset-2 rounded-full border-2 border-emerald-400 shadow-[0_0_30px_rgba(52,211,153,0.8)]"
                        />
                      )}
                    </AnimatePresence>

                    {/* Ambient Core Glow */}
                    <div
                      className={cn(
                        'pointer-events-none absolute inset-0 rounded-full blur-2xl transition-all duration-500',
                        isReady ? 'bg-emerald-500/25' : 'bg-accent/25 animate-pulse',
                      )}
                    />

                    <svg
                      viewBox={`0 0 ${DIAL_SIZE} ${DIAL_SIZE}`}
                      className="size-full overflow-visible"
                    >
                      <defs>
                        <linearGradient
                          id={`modal-grad-${uid}`}
                          x1="0%"
                          y1="0%"
                          x2="100%"
                          y2="100%"
                        >
                          <stop offset="0%" stopColor="var(--color-accent)" />
                          <stop offset="55%" stopColor="#06b6d4" />
                          <stop offset="100%" stopColor="#a855f7" />
                        </linearGradient>
                        <linearGradient
                          id={`modal-ready-${uid}`}
                          x1="0%"
                          y1="0%"
                          x2="100%"
                          y2="100%"
                        >
                          <stop offset="0%" stopColor="#34d399" />
                          <stop offset="100%" stopColor="#06b6d4" />
                        </linearGradient>
                      </defs>

                      {/* Outer Rotating Gyro Ring */}
                      <g
                        style={{
                          transformOrigin: `${CENTER}px ${CENTER}px`,
                          animation: `spin ${isReady ? '20s' : '3.2s'} linear infinite`,
                        }}
                      >
                        <circle
                          cx={CENTER}
                          cy={CENTER}
                          r={OUTER_R}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.25"
                          strokeDasharray="8 10 22 10"
                          className={isReady ? 'text-emerald-400/50' : 'text-cyan-400/60'}
                        />
                      </g>

                      {/* 40 Calibrated Degree Ticks */}
                      {Array.from({ length: TICK_COUNT }).map((_, i) => {
                        const angle = (i / TICK_COUNT) * 360 - 90
                        const isMajor = i % 5 === 0
                        const rad = (angle * Math.PI) / 180
                        const r1 = PROGRESS_R + (isMajor ? 6 : 8)
                        const r2 = PROGRESS_R + 12
                        const isLit = (i / TICK_COUNT) * 100 <= pct

                        return (
                          <line
                            key={i}
                            x1={CENTER + Math.cos(rad) * r1}
                            y1={CENTER + Math.sin(rad) * r1}
                            x2={CENTER + Math.cos(rad) * r2}
                            y2={CENTER + Math.sin(rad) * r2}
                            strokeWidth={isMajor ? 2.2 : 1.2}
                            strokeLinecap="round"
                            className={cn(
                              'transition-colors duration-200',
                              isLit
                                ? isReady
                                  ? 'stroke-emerald-400'
                                  : 'stroke-cyan-400'
                                : 'stroke-border/60',
                            )}
                          />
                        )
                      })}

                      {/* Base Progress Track */}
                      <circle
                        cx={CENTER}
                        cy={CENTER}
                        r={PROGRESS_R}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="6.5"
                        className="text-surface-raised"
                      />

                      {/* Glowing Progress Arc */}
                      <circle
                        cx={CENTER}
                        cy={CENTER}
                        r={PROGRESS_R}
                        fill="none"
                        stroke={isReady ? `url(#modal-ready-${uid})` : `url(#modal-grad-${uid})`}
                        strokeWidth="6.5"
                        strokeLinecap="round"
                        strokeDasharray={CIRC}
                        strokeDashoffset={strokeOffset}
                        transform={`rotate(-90 ${CENTER} ${CENTER})`}
                        className="transition-[stroke-dashoffset] duration-300 ease-out"
                        style={{
                          filter: `drop-shadow(0 0 10px ${
                            isReady ? 'rgba(52,211,153,0.85)' : 'rgba(6,182,212,0.75)'
                          })`,
                        }}
                      />

                      {/* Leading Comet Head */}
                      <circle
                        cx={cometX}
                        cy={cometY}
                        r="4.5"
                        fill={isReady ? '#34d399' : '#22d3ee'}
                        style={{
                          filter: 'drop-shadow(0 0 8px rgba(34,211,238,0.95))',
                        }}
                      />

                      {/* Inner Counter-Rotating Rotor */}
                      <g
                        style={{
                          transformOrigin: `${CENTER}px ${CENTER}px`,
                          animation: `spin ${isReady ? '14s' : '2s'} linear infinite reverse`,
                        }}
                      >
                        <circle
                          cx={CENTER}
                          cy={CENTER}
                          r={INNER_R}
                          fill="none"
                          stroke={isReady ? '#10b981' : 'var(--color-accent)'}
                          strokeWidth="1.75"
                          strokeDasharray="14 10 4 10"
                          strokeOpacity="0.55"
                        />
                      </g>
                    </svg>

                    {/* Inner Core Readout */}
                    <div
                      className={cn(
                        'absolute flex size-[108px] flex-col items-center justify-center rounded-full border-2 backdrop-blur-md transition-all duration-300',
                        isReady
                          ? 'border-emerald-400/60 bg-emerald-500/15 shadow-[0_0_28px_rgba(52,211,153,0.35)]'
                          : 'border-accent/45 bg-surface-raised/95 shadow-[0_0_24px_rgba(6,182,212,0.25)]',
                      )}
                    >
                      <AnimatePresence mode="wait">
                        {isReady ? (
                          <motion.div
                            key="ready-core"
                            initial={{ scale: 0.6, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                            className="flex flex-col items-center text-center"
                          >
                            <div className="flex size-10 items-center justify-center rounded-2xl bg-emerald-500/25 text-emerald-400 ring-1 ring-emerald-400/50">
                              <Rocket className="size-5" />
                            </div>
                            <span className="mt-1 font-mono text-[11px] font-black tracking-[0.2em] text-emerald-400">
                              LAUNCHED
                            </span>
                          </motion.div>
                        ) : (
                          <motion.div
                            key="progress-core"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="flex flex-col items-center"
                          >
                            <div className="flex items-baseline font-mono text-3xl font-black tabular-nums tracking-tight text-text">
                              <span>{Math.round(pct)}</span>
                              <span className="ml-0.5 text-xs font-bold text-cyan-400">%</span>
                            </div>
                            <span className="mt-0.5 flex items-center gap-1 font-mono text-[8px] font-black uppercase tracking-[0.18em] text-accent">
                              <Flame className="size-2.5 animate-bounce text-cyan-400" />
                              {isLaunching ? 'SPAWNING' : 'BOOSTING'}
                            </span>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  {/* Active Step Status Pill Under Dial */}
                  <div className="mt-2.5 flex items-center justify-center">
                    {isReady ? (
                      <motion.span
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/50 bg-emerald-500/15 px-3.5 py-1 font-mono text-[10px] font-black tracking-wider text-emerald-300 shadow-sm"
                      >
                        <Sparkles className="size-3.5 text-emerald-400" />
                        <span>PEAK PERFORMANCE LOCKED</span>
                      </motion.span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-3.5 py-1 font-mono text-[10px] font-bold text-accent">
                        <Loader2 className="size-3.5 animate-spin" />
                        <span className="max-w-[210px] truncate">{activeStepLabel}</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Right Column: 4 Hardware Headroom Cards */}
                <div className="grid grid-cols-2 gap-3 md:col-span-7">
                  {telemetry.map((item) => {
                    const Icon = item.icon
                    return (
                      <motion.div
                        key={item.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={cn(
                          'relative overflow-hidden rounded-2xl border p-3.5 transition-all duration-300',
                          item.applied
                            ? 'border-emerald-500/40 bg-gradient-to-br from-emerald-500/12 via-surface-raised/90 to-surface shadow-sm'
                            : 'border-border/80 bg-surface-raised/70',
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={cn(
                              'flex size-8 items-center justify-center rounded-xl border transition-colors',
                              item.applied
                                ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-400'
                                : 'border-accent/30 bg-accent/10 text-accent',
                            )}
                          >
                            <Icon className="size-4" />
                          </span>

                          <span
                            className={cn(
                              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[9px] font-black uppercase',
                              item.applied
                                ? 'bg-emerald-500/20 text-emerald-400'
                                : 'bg-surface text-subtle',
                            )}
                          >
                            {item.applied ? (
                              <>
                                <Check className="size-2.5 stroke-[3]" />
                                <span>LOCKED</span>
                              </>
                            ) : (
                              <>
                                <Activity className="size-2.5 animate-pulse text-accent" />
                                <span>SYNC</span>
                              </>
                            )}
                          </span>
                        </div>

                        <div className="mt-2.5 font-mono text-[10px] font-bold uppercase tracking-wider text-subtle">
                          {item.title}
                        </div>
                        <div className="mt-0.5 truncate font-mono text-sm font-black text-text">
                          {item.value}
                        </div>
                        <div className="mt-0.5 truncate text-[10px] text-muted">{item.detail}</div>
                      </motion.div>
                    )
                  })}
                </div>
              </div>

              {/* ── 3. LIVE PIPELINE TELEMETRY STREAM ────────────────────────── */}
              <div className="mt-5 rounded-2xl border border-border/80 bg-surface-raised/60 dark:bg-black/45 p-3.5 shadow-inner">
                <div className="mb-2.5 flex items-center justify-between font-mono text-[10px] font-bold uppercase tracking-wider text-muted">
                  <span className="flex items-center gap-1.5 text-accent">
                    <Terminal className="size-3.5" />
                    <span>Kernel &amp; Memory Pipeline Feed</span>
                  </span>
                  <span className="rounded-md bg-surface px-2 py-0.5 text-text">
                    {steps.length} {steps.length === 1 ? 'Module' : 'Modules'} Executed
                  </span>
                </div>

                <div className="grid max-h-32 grid-cols-1 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
                  {steps.map((s, idx) => (
                    <motion.div
                      key={s.id || idx}
                      initial={{ opacity: 0, scale: 0.96, y: 4 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      transition={{ duration: 0.18 * speed }}
                      className="flex items-center justify-between gap-2 rounded-xl border border-border/60 bg-surface/85 px-3 py-2 text-xs"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="flex size-4.5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/40">
                          <Check className="size-2.5 stroke-[3]" />
                        </span>
                        <span className="truncate text-[11px] font-semibold text-text">
                          {s.label}
                        </span>
                      </div>

                      {s.metric && (
                        <span className="shrink-0 rounded-md border border-accent/35 bg-accent/15 px-1.5 py-0.5 font-mono text-[9px] font-bold text-accent">
                          {s.metric}
                        </span>
                      )}
                    </motion.div>
                  ))}
                </div>

                {closedApps.length > 0 && (
                  <div className="mt-2 flex items-center gap-2 rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-1.5 font-mono text-[10px] text-amber-300">
                    <ShieldCheck className="size-3.5 shrink-0 text-amber-400" />
                    <span className="shrink-0 font-bold">Closed Background Bloat:</span>
                    <span className="truncate text-amber-200">{closedApps.join(', ')}</span>
                  </div>
                )}
              </div>

              {/* ── 4. BOTTOM PLASMA PROGRESS CONDUIT & ACTION BUTTON ────────── */}
              <div className="mt-4 flex items-center gap-4">
                <div className="flex-1">
                  <div className="mb-1 flex items-center justify-between font-mono text-[10px] font-bold uppercase tracking-wider text-subtle">
                    <span>
                      {isReady
                        ? 'Game Process Active — Enjoy Peak FPS!'
                        : 'Allocating System Resources...'}
                    </span>
                    <span className={isReady ? 'text-emerald-400' : 'text-accent'}>
                      {Math.round(pct)}%
                    </span>
                  </div>
                  <div className="relative h-2.5 w-full overflow-hidden rounded-full border border-border/80 bg-surface-raised">
                    <motion.div
                      animate={{ width: `${Math.max(4, pct)}%` }}
                      transition={{ duration: 0.25, ease: 'easeOut' }}
                      className={cn(
                        'h-full rounded-full',
                        isReady
                          ? 'bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-300 shadow-[0_0_16px_rgba(52,211,153,0.9)]'
                          : 'bg-gradient-to-r from-accent via-cyan-400 to-purple-500 shadow-[0_0_16px_var(--nx-accent)]',
                      )}
                    />
                  </div>
                </div>

                {isReady && (
                  <motion.button
                    initial={{ scale: 0.85, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    type="button"
                    onClick={() => {
                      playButtonClick()
                      close()
                    }}
                    className="flex shrink-0 items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2.5 font-mono text-xs font-black text-black shadow-[0_0_24px_rgba(16,185,129,0.5)] transition-all hover:bg-emerald-400 active:scale-95"
                  >
                    <span>PLAY NOW</span>
                    <ChevronRight className="size-4 stroke-[3]" />
                  </motion.button>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    modalHost,
  )
}
