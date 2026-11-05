import { useId } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Cpu, Flame, Rocket, ShieldCheck, Sparkles, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAnimationSpeed } from '@/hooks/use-animation-speed'

const VIEW_SIZE = 280
const CENTER = VIEW_SIZE / 2
const OUTER_RING_R = 126
const TICK_INNER_R = 108
const TICK_OUTER_R = 117
const PROGRESS_R = 96
const INNER_ROTOR_R = 82
const CIRC = 2 * Math.PI * PROGRESS_R
const TICK_COUNT = 48

interface BoosterScanDialProps {
  phase: 'idle' | 'boosting' | 'done'
  progress: number
  onClick: () => void
  reduceMotion: boolean
  reclaimableLabel?: string
  activeModulesCount?: number
}

const ORBIT_PARTICLES = [
  { angle: 15, delay: 0, distance: 112, size: 5 },
  { angle: 75, delay: 0.35, distance: 118, size: 4 },
  { angle: 135, delay: 0.7, distance: 110, size: 6 },
  { angle: 195, delay: 1.05, distance: 116, size: 4 },
  { angle: 255, delay: 0.5, distance: 114, size: 5 },
  { angle: 315, delay: 0.9, distance: 120, size: 4 },
]

export function BoosterScanDial({
  phase,
  progress,
  onClick,
  reduceMotion,
  reclaimableLabel,
  activeModulesCount = 10,
}: BoosterScanDialProps) {
  const uid = useId().replace(/:/g, '')
  const speed = useAnimationSpeed()
  const pct = phase === 'done' ? 100 : Math.max(0, Math.min(100, progress))
  const strokeOffset = CIRC * (1 - pct / 100)

  const isBoosting = phase === 'boosting'
  const isDone = phase === 'done'

  // Calculate leading comet position along the progress arc
  const cometAngleRad = ((pct / 100) * 360 - 90) * (Math.PI / 180)
  const cometX = CENTER + Math.cos(cometAngleRad) * PROGRESS_R
  const cometY = CENTER + Math.sin(cometAngleRad) * PROGRESS_R

  return (
    <div className="relative flex items-center justify-center py-2 select-none">
      {/* Deep Ambient Reactor Halo */}
      <motion.div
        animate={
          reduceMotion
            ? undefined
            : isBoosting
              ? { scale: [1, 1.18, 1.05], opacity: [0.55, 0.95, 0.65] }
              : isDone
                ? { scale: [1, 1.08, 1], opacity: [0.5, 0.75, 0.5] }
                : { scale: [1, 1.06, 1], opacity: [0.35, 0.6, 0.35] }
        }
        transition={{
          duration: isBoosting ? 1.1 * speed : 3.2 * speed,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="pointer-events-none absolute -inset-6 rounded-full blur-3xl"
        style={{
          background: isDone
            ? 'radial-gradient(circle, rgba(16, 185, 129, 0.42) 0%, rgba(6, 182, 212, 0.18) 45%, transparent 72%)'
            : isBoosting
              ? 'radial-gradient(circle, color-mix(in srgb, var(--color-accent) 58%, transparent) 0%, rgba(6, 182, 212, 0.32) 48%, transparent 74%)'
              : 'radial-gradient(circle, color-mix(in srgb, var(--color-accent) 34%, transparent) 0%, rgba(6, 182, 212, 0.14) 50%, transparent 72%)',
        }}
      />

      {/* Expanding Shockwave Ripples during Boosting / Ignition */}
      <AnimatePresence>
        {isBoosting && !reduceMotion && (
          <>
            {[0, 0.45, 0.9].map((delay, idx) => (
              <motion.div
                key={`shockwave-${idx}`}
                initial={{ scale: 0.68, opacity: 0.75 }}
                animate={{ scale: 1.36, opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{
                  duration: 1.55 * speed,
                  repeat: Infinity,
                  delay,
                  ease: 'easeOut',
                }}
                className="pointer-events-none absolute size-[230px] rounded-full border-2 border-accent/50 shadow-[0_0_24px_var(--nx-accent)]"
              />
            ))}
          </>
        )}
      </AnimatePresence>

      {/* Completion Emerald Burst Wave */}
      <AnimatePresence>
        {isDone && !reduceMotion && (
          <motion.div
            key="done-burst"
            initial={{ scale: 0.75, opacity: 0.85 }}
            animate={{ scale: 1.32, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.9 * speed, ease: 'easeOut' }}
            className="pointer-events-none absolute size-[240px] rounded-full border-2 border-emerald-400/70 shadow-[0_0_35px_rgba(52,211,153,0.7)]"
          />
        )}
      </AnimatePresence>

      {/* Main Interactive Reactor Button */}
      <motion.button
        type="button"
        onClick={onClick}
        disabled={isBoosting}
        whileHover={isBoosting ? undefined : { scale: 1.03 }}
        whileTap={isBoosting ? undefined : { scale: 0.94 }}
        transition={{ type: 'spring', stiffness: 420, damping: 24 }}
        aria-label={
          isBoosting
            ? `Boosting system ${Math.round(pct)}%`
            : isDone
              ? 'System boosted. Click to re-boost'
              : 'Engage Game Boost Overdrive'
        }
        className={cn(
          'group relative flex size-[276px] items-center justify-center rounded-full focus:outline-none',
          isBoosting ? 'cursor-wait' : 'cursor-pointer',
        )}
      >
        {/* Orbiting Energy Particles */}
        {!reduceMotion && (isBoosting || isDone) && (
          <div className="pointer-events-none absolute inset-0">
            {ORBIT_PARTICLES.map((p, i) => {
              const rad = (p.angle * Math.PI) / 180
              const x = Math.cos(rad) * p.distance
              const y = Math.sin(rad) * p.distance
              return (
                <motion.span
                  key={i}
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{
                    opacity: [0, 0.95, 0],
                    scale: [0.4, 1.25, 0.5],
                    x: [x * 0.78, x * 1.06, x * 0.9],
                    y: [y * 0.78, y * 1.06, y * 0.9],
                  }}
                  transition={{
                    duration: (isBoosting ? 1.1 : 2.4) * speed,
                    repeat: Infinity,
                    delay: p.delay,
                    ease: 'easeInOut',
                  }}
                  style={{ width: p.size, height: p.size }}
                  className={cn(
                    'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full',
                    isDone
                      ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.95)]'
                      : 'bg-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.95)]',
                  )}
                />
              )
            })}
          </div>
        )}

        {/* Precision Multi-Layer SVG Telemetry Rings */}
        <svg viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`} className="size-full overflow-visible">
          <defs>
            <linearGradient id={`grad-boost-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="var(--color-accent)" />
              <stop offset="50%" stopColor="#06b6d4" />
              <stop offset="100%" stopColor="#a855f7" />
            </linearGradient>

            <linearGradient id={`grad-done-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#34d399" />
              <stop offset="50%" stopColor="#10b981" />
              <stop offset="100%" stopColor="#06b6d4" />
            </linearGradient>

            <filter id={`glow-${uid}`} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Layer 1: Outer Tactical Compass Ring (Slow Clockwise / Fast Turbo on Boost) */}
          <g
            style={{
              transformOrigin: `${CENTER}px ${CENTER}px`,
              animation: reduceMotion
                ? 'none'
                : `spin ${isBoosting ? '3.2s' : isDone ? '28s' : '22s'} linear infinite`,
            }}
          >
            <circle
              cx={CENTER}
              cy={CENTER}
              r={OUTER_RING_R}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.25"
              strokeDasharray="6 10 24 10"
              className={cn(
                'transition-colors duration-500',
                isDone
                  ? 'text-emerald-400/45'
                  : isBoosting
                    ? 'text-cyan-400/70'
                    : 'text-accent/35 group-hover:text-accent/65',
              )}
            />
            {/* 4 Outer Orbital Nodes */}
            {[0, 90, 180, 270].map((deg) => {
              const rad = (deg * Math.PI) / 180
              const nx = CENTER + Math.cos(rad) * OUTER_RING_R
              const ny = CENTER + Math.sin(rad) * OUTER_RING_R
              return (
                <circle
                  key={deg}
                  cx={nx}
                  cy={ny}
                  r="3"
                  className={cn(
                    'transition-colors duration-300',
                    isDone
                      ? 'fill-emerald-400'
                      : isBoosting
                        ? 'fill-cyan-300'
                        : 'fill-accent/70 group-hover:fill-accent',
                  )}
                />
              )
            })}
          </g>

          {/* Layer 2: 48 Laser-Etched Tachometer Degree Ticks */}
          <g>
            {Array.from({ length: TICK_COUNT }).map((_, i) => {
              const deg = (i / TICK_COUNT) * 360 - 90
              const rad = (deg * Math.PI) / 180
              const isMajor = i % 4 === 0
              const isCardinal = i % 12 === 0
              const r1 = isCardinal ? TICK_INNER_R - 3 : isMajor ? TICK_INNER_R : TICK_INNER_R + 2
              const r2 = isCardinal ? TICK_OUTER_R + 2 : TICK_OUTER_R
              const x1 = CENTER + Math.cos(rad) * r1
              const y1 = CENTER + Math.sin(rad) * r1
              const x2 = CENTER + Math.cos(rad) * r2
              const y2 = CENTER + Math.sin(rad) * r2
              const threshold = (i / TICK_COUNT) * 100
              const lit =
                isDone ||
                (isBoosting && threshold <= Math.max(12, pct)) ||
                (!isBoosting && threshold <= pct)

              return (
                <line
                  key={i}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={lit ? (isDone ? '#34d399' : 'var(--color-accent)') : 'currentColor'}
                  strokeWidth={isCardinal ? 2.6 : isMajor ? 1.8 : 1.1}
                  strokeLinecap="round"
                  className={cn(
                    'transition-all duration-200',
                    lit ? 'opacity-100' : 'text-border/70 opacity-45 group-hover:opacity-70',
                  )}
                />
              )
            })}
          </g>

          {/* Layer 3: Main Progress Track Background */}
          <circle
            cx={CENTER}
            cy={CENTER}
            r={PROGRESS_R}
            fill="none"
            stroke="currentColor"
            strokeWidth="7"
            className="text-surface-raised/90"
          />
          <circle
            cx={CENTER}
            cy={CENTER}
            r={PROGRESS_R}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray="3 6"
            className="text-border/60"
          />

          {/* Layer 4: Glowing Active Progress Arc */}
          <circle
            cx={CENTER}
            cy={CENTER}
            r={PROGRESS_R}
            fill="none"
            stroke={isDone ? `url(#grad-done-${uid})` : `url(#grad-boost-${uid})`}
            strokeWidth="7.5"
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={phase === 'idle' && pct === 0 ? CIRC * 0.72 : strokeOffset}
            transform={`rotate(-90 ${CENTER} ${CENTER})`}
            filter={`url(#glow-${uid})`}
            className={cn(
              'transition-[stroke-dashoffset] duration-300 ease-out',
              phase === 'idle' &&
                pct === 0 &&
                'opacity-45 group-hover:opacity-90 transition-opacity',
            )}
          />

          {/* Leading Plasma Comet Dot */}
          {(isBoosting || isDone || pct > 0) && (
            <circle
              cx={cometX}
              cy={cometY}
              r={isBoosting ? 5.5 : 4.5}
              fill={isDone ? '#34d399' : '#22d3ee'}
              filter={`url(#glow-${uid})`}
              className="transition-all duration-300"
            />
          )}

          {/* Layer 5: Counter-Rotating Inner Turbine Rotor */}
          <g
            style={{
              transformOrigin: `${CENTER}px ${CENTER}px`,
              animation: reduceMotion
                ? 'none'
                : `spin ${isBoosting ? '1.8s' : '16s'} linear infinite reverse`,
            }}
          >
            <circle
              cx={CENTER}
              cy={CENTER}
              r={INNER_ROTOR_R}
              fill="none"
              stroke={isDone ? '#10b981' : 'var(--color-accent)'}
              strokeWidth="2"
              strokeDasharray="18 14 6 14"
              strokeOpacity={isBoosting ? 0.75 : 0.35}
            />
          </g>
        </svg>

        {/* Layer 6: 3D Tactile Inner Reactor Core Button */}
        <div
          className={cn(
            'absolute flex size-[148px] flex-col items-center justify-center overflow-hidden rounded-full border-2 transition-all duration-500',
            isDone
              ? 'border-emerald-400/65 bg-gradient-to-b from-emerald-500/25 via-surface-raised/95 to-bg shadow-[0_0_40px_rgba(16,185,129,0.35),inset_0_2px_16px_rgba(52,211,153,0.3)]'
              : isBoosting
                ? 'border-cyan-400/75 bg-gradient-to-b from-accent/35 via-surface-raised/95 to-bg shadow-[0_0_48px_var(--nx-accent),inset_0_2px_20px_rgba(6,182,212,0.35)]'
                : 'border-accent/45 bg-gradient-to-b from-surface-raised via-surface to-bg shadow-[0_14px_36px_rgba(0,0,0,0.45),inset_0_1px_12px_rgba(255,255,255,0.08)] group-hover:border-accent group-hover:shadow-[0_0_42px_var(--nx-accent),inset_0_2px_18px_rgba(6,182,212,0.25)]',
          )}
        >
          {/* Top Specular Glass Arc */}
          <div className="pointer-events-none absolute inset-x-5 top-1.5 h-8 rounded-full bg-gradient-to-b from-white/15 to-transparent blur-[1px]" />

          {/* Conic Radar Sweep During Boosting */}
          {isBoosting && !reduceMotion && (
            <div
              className="pointer-events-none absolute inset-0 animate-spin rounded-full opacity-40"
              style={{
                animationDuration: '1.35s',
                background:
                  'conic-gradient(from 0deg, transparent 0deg, var(--color-accent) 95deg, #22d3ee 120deg, transparent 150deg)',
              }}
            />
          )}

          {/* Subtle Hexagonal Dot Grid Inside Core */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(#ffffff12_1px,transparent_1px)] [background-size:10px_10px] opacity-40" />

          {/* STATE CONTENT SWITCHER */}
          <AnimatePresence mode="wait">
            {phase === 'idle' && (
              <motion.div
                key="core-idle"
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.82 }}
                transition={{ duration: 0.2 * speed }}
                className="relative z-10 flex flex-col items-center px-2 text-center"
              >
                {/* Center Igniter Icon Badge */}
                <div className="relative mb-2 flex size-13 items-center justify-center rounded-2xl border border-accent/45 bg-gradient-to-br from-accent/25 via-accent/10 to-cyan-500/20 text-accent shadow-[0_0_22px_var(--nx-accent)] transition-all duration-300 group-hover:scale-110 group-hover:border-accent group-hover:bg-accent group-hover:text-white">
                  <Rocket className="size-6 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  <Sparkles className="absolute -right-1 -top-1 size-3.5 text-cyan-400 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                </div>

                <span className="font-mono text-sm font-black tracking-[0.2em] text-text transition-colors group-hover:text-accent">
                  BOOST NOW
                </span>

                <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-0.5 font-mono text-[9px] font-bold text-accent">
                  <Zap className="size-2.5 fill-current" />
                  {reclaimableLabel ? `+${reclaimableLabel} RAM` : `${activeModulesCount} MODULES`}
                </span>

                <span className="mt-1.5 font-mono text-[8px] font-bold uppercase tracking-[0.22em] text-subtle group-hover:text-text">
                  TAP TO OVERDRIVE
                </span>
              </motion.div>
            )}

            {phase === 'boosting' && (
              <motion.div
                key="core-boosting"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.08 }}
                transition={{ duration: 0.2 * speed }}
                className="relative z-10 flex flex-col items-center px-2 text-center"
              >
                <div className="mb-1 flex items-center gap-1 rounded-full border border-cyan-400/40 bg-cyan-500/15 px-2 py-0.5 font-mono text-[8px] font-black uppercase tracking-[0.2em] text-cyan-300">
                  <Flame className="size-2.5 animate-bounce text-cyan-300" />
                  <span>OVERDRIVE</span>
                </div>

                <div className="flex items-baseline font-mono text-4xl font-black tabular-nums tracking-tight text-text drop-shadow-[0_0_14px_var(--nx-accent)]">
                  <span>{Math.round(pct)}</span>
                  <span className="ml-0.5 text-base font-bold text-cyan-400">%</span>
                </div>

                {/* Animated Telemetry Wave Bars */}
                <div className="mt-1.5 flex h-3.5 items-end gap-1">
                  {[0, 1, 2, 3, 4].map((bar) => (
                    <motion.span
                      key={bar}
                      animate={{ height: ['4px', '13px', '6px', '14px', '5px'] }}
                      transition={{
                        duration: 0.65 * speed,
                        repeat: Infinity,
                        delay: bar * 0.1,
                        ease: 'easeInOut',
                      }}
                      className="w-1 rounded-full bg-gradient-to-t from-accent to-cyan-300"
                    />
                  ))}
                </div>

                <span className="mt-1 font-mono text-[8px] font-bold uppercase tracking-[0.18em] text-cyan-300">
                  PURGING &amp; LOCKING
                </span>
              </motion.div>
            )}

            {phase === 'done' && (
              <motion.div
                key="core-done"
                initial={{ opacity: 0, scale: 0.75 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                transition={{ type: 'spring', stiffness: 380, damping: 20 }}
                className="relative z-10 flex flex-col items-center px-2 text-center"
              >
                <div className="mb-1.5 flex size-12 items-center justify-center rounded-2xl border border-emerald-400/50 bg-emerald-500/20 text-emerald-400 shadow-[0_0_24px_rgba(52,211,153,0.45)] transition-transform duration-300 group-hover:scale-110">
                  <ShieldCheck className="size-6 stroke-[2.4]" />
                </div>

                <span className="font-mono text-xs font-black tracking-[0.18em] text-emerald-400">
                  PEAK STATE
                </span>

                <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-emerald-500/35 bg-emerald-500/15 px-2.5 py-0.5 font-mono text-[9px] font-bold text-emerald-300">
                  <Check className="size-2.5 stroke-[3]" />
                  <span>1.0ms • FULL NET</span>
                </span>

                <span className="mt-1.5 font-mono text-[8px] font-bold uppercase tracking-[0.18em] text-subtle group-hover:text-emerald-300">
                  CLICK TO RE-BOOST
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.button>
    </div>
  )
}

export function HudCorners() {
  return (
    <>
      <span className="pointer-events-none absolute left-3 top-3 size-3.5 rounded-tl border-l-2 border-t-2 border-accent/60" />
      <span className="pointer-events-none absolute right-3 top-3 size-3.5 rounded-tr border-r-2 border-t-2 border-accent/60" />
      <span className="pointer-events-none absolute bottom-3 left-3 size-3.5 rounded-bl border-b-2 border-l-2 border-accent/60" />
      <span className="pointer-events-none absolute bottom-3 right-3 size-3.5 rounded-br border-b-2 border-r-2 border-accent/60" />
    </>
  )
}

export function ReactorTelemetryPills({
  phase,
  moduleCount,
}: {
  phase: 'idle' | 'boosting' | 'done'
  moduleCount: number
}) {
  return (
    <div className="mt-2 grid w-full grid-cols-3 gap-2">
      <div className="flex flex-col items-center rounded-xl border border-border/70 bg-surface/80 px-2 py-1.5">
        <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-subtle">
          Timer Lock
        </span>
        <span
          className={cn(
            'mt-0.5 font-mono text-xs font-black',
            phase === 'done' ? 'text-emerald-400' : 'text-text',
          )}
        >
          1.0 ms
        </span>
      </div>

      <div className="flex flex-col items-center rounded-xl border border-border/70 bg-surface/80 px-2 py-1.5">
        <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-subtle">
          Net Pipe
        </span>
        <span className="mt-0.5 flex items-center gap-1 font-mono text-xs font-black text-emerald-400">
          <Cpu className="size-3" />
          <span>100% Free</span>
        </span>
      </div>

      <div className="flex flex-col items-center rounded-xl border border-border/70 bg-surface/80 px-2 py-1.5">
        <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-subtle">
          Modules
        </span>
        <span className="mt-0.5 font-mono text-xs font-black text-accent">{moduleCount} Armed</span>
      </div>
    </div>
  )
}
