import { memo } from 'react'
import { motion } from 'framer-motion'
import { Rocket, Check, Zap, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

type BoosterPhase = 'idle' | 'boosting' | 'done'

interface BoosterScanDialProps {
  phase: BoosterPhase
  progress: number
  onClick: () => void
  reduceMotion: boolean
}

const R = 90
const CIRC = 2 * Math.PI * R
const C = 110 // Center for 220x220 viewBox

export const BoosterScanDial = memo(function BoosterScanDial({
  phase,
  progress,
  onClick,
  reduceMotion,
}: BoosterScanDialProps) {
  const boosting = phase === 'boosting'
  const done = phase === 'done'
  const idle = phase === 'idle'

  const pct = Math.min(100, Math.max(0, progress))
  const strokeOffset = CIRC * (1 - pct / 100)

  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={boosting}
      whileHover={idle && !reduceMotion ? { scale: 1.03 } : undefined}
      whileTap={idle && !reduceMotion ? { scale: 0.97 } : undefined}
      aria-label={idle ? 'Boost system performance' : undefined}
      className={cn(
        'group relative size-[220px] shrink-0 select-none rounded-full outline-none transition-transform duration-200',
        'focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        boosting && 'cursor-not-allowed',
      )}
    >
      {/* Ambient Radial Aura (Hardware accelerated opacity/transform only) */}
      <div
        className={cn(
          'pointer-events-none absolute inset-[-8px] rounded-full transition-opacity duration-500',
          done
            ? 'bg-emerald-500/15 opacity-100'
            : boosting
              ? 'bg-accent/25 opacity-100 animate-pulse'
              : 'bg-accent/10 opacity-60 group-hover:opacity-100',
        )}
      />

      {/* SVG Radial Instrument Dial */}
      <svg
        viewBox="0 0 220 220"
        className="pointer-events-none absolute inset-0 size-full"
        style={{ willChange: 'transform' }}
      >
        <defs>
          <linearGradient id="booster-accent-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--color-accent)" />
            <stop offset="100%" stopColor="color-mix(in srgb, var(--color-accent) 70%, #6366f1)" />
          </linearGradient>

          <linearGradient id="booster-done-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#34d399" />
            <stop offset="100%" stopColor="#10b981" />
          </linearGradient>
        </defs>

        {/* Background Track Ring */}
        <circle
          cx={C}
          cy={C}
          r={R}
          fill="none"
          stroke="var(--nx-border)"
          strokeWidth="6"
          strokeOpacity="0.6"
          className="transition-colors duration-300 group-hover:stroke-accent/25"
        />

        {/* Inner Subtle Guide Ring */}
        <circle
          cx={C}
          cy={C}
          r={R - 7}
          fill="none"
          stroke="var(--nx-border)"
          strokeWidth="1"
          strokeDasharray="4 6"
          strokeOpacity="0.4"
        />

        {/* 36 Calibrated Tick Marks */}
        {Array.from({ length: 36 }).map((_, i) => {
          const angle = (i / 36) * 360
          const isMajor = i % 9 === 0
          const isMid = i % 3 === 0
          const rad = (angle * Math.PI) / 180
          const inner = R + (isMajor ? 4 : isMid ? 6 : 7)
          const outer = R + 10
          return (
            <line
              key={i}
              x1={C + Math.cos(rad) * inner}
              y1={C + Math.sin(rad) * inner}
              x2={C + Math.cos(rad) * outer}
              y2={C + Math.sin(rad) * outer}
              strokeWidth={isMajor ? 1.75 : 1}
              className={cn(
                'transition-colors duration-200',
                isMajor
                  ? 'stroke-accent/80'
                  : isMid
                    ? 'stroke-accent/40 group-hover:stroke-accent/60'
                    : 'stroke-border/80 group-hover:stroke-border',
              )}
            />
          )
        })}

        {/* Active Progress Arc */}
        <circle
          cx={C}
          cy={C}
          r={R}
          fill="none"
          stroke={done ? 'url(#booster-done-grad)' : 'url(#booster-accent-grad)'}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={strokeOffset}
          transform={`rotate(-90 ${C} ${C})`}
          className="transition-[stroke-dashoffset] duration-300 ease-out"
          style={{
            filter: `drop-shadow(0 0 6px ${done ? 'rgba(52,211,153,0.7)' : 'color-mix(in srgb, var(--color-accent) 75%, transparent)'})`,
          }}
        />
      </svg>

      {/* Central Core Chamber */}
      <div
        className={cn(
          'absolute left-1/2 top-1/2 z-10 flex size-36 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border shadow-xl transition-all duration-300',
          done
            ? 'border-emerald-400/40 bg-surface/95 text-emerald-400 shadow-[0_0_24px_rgba(52,211,153,0.25)]'
            : boosting
              ? 'border-accent/60 bg-surface/95 text-text shadow-[0_0_24px_color-mix(in_srgb,var(--color-accent)_35%,transparent)]'
              : 'border-border/90 bg-surface text-text hover:border-accent/40 hover:bg-surface-raised hover:shadow-[0_0_20px_color-mix(in_srgb,var(--color-accent)_25%,transparent)]',
        )}
      >
        {idle && (
          <div className="flex flex-col items-center gap-1.5 px-2 text-center">
            <div className="relative flex size-11 items-center justify-center rounded-2xl bg-accent/15 text-accent ring-1 ring-accent/30 transition-all duration-300 group-hover:scale-110 group-hover:bg-accent group-hover:text-white group-hover:shadow-[0_0_16px_var(--nx-accent)]">
              <Rocket className="size-5.5 transition-transform group-hover:-translate-y-0.5" />
              <Zap className="absolute -right-1 -top-1 size-3.5 fill-accent text-accent transition-colors group-hover:fill-white group-hover:text-white" />
            </div>
            <div>
              <span className="block font-mono text-xs font-black tracking-[0.2em] text-text transition-colors group-hover:text-accent">
                BOOST
              </span>
              <span className="block font-mono text-[8px] font-bold tracking-widest text-subtle">
                READY
              </span>
            </div>
          </div>
        )}

        {boosting && (
          <div className="flex flex-col items-center gap-1">
            <div className="flex items-baseline font-mono text-3xl font-black tabular-nums tracking-tight text-text">
              <span>{Math.round(pct)}</span>
              <span className="text-xs font-bold text-accent">%</span>
            </div>
            <span className="flex items-center gap-1 font-mono text-[9px] font-bold tracking-[0.2em] text-accent animate-pulse">
              <Zap className="size-2.5 fill-current" />
              OPTIMIZING
            </span>
            <div className="mt-1 flex items-center gap-1">
              {[0, 1, 2, 3].map((bar) => (
                <span
                  key={bar}
                  className="size-1.5 rounded-full bg-accent animate-pulse"
                  style={{ animationDelay: `${bar * 120}ms` }}
                />
              ))}
            </div>
          </div>
        )}

        {done && (
          <div className="flex flex-col items-center gap-1 text-center">
            <div className="flex size-10 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/40 shadow-[0_0_14px_rgba(52,211,153,0.35)]">
              <Check className="size-5.5" strokeWidth={2.75} />
            </div>
            <div>
              <span className="block font-mono text-[11px] font-black tracking-[0.22em] text-emerald-400">
                HOT & READY
              </span>
              <span className="flex items-center justify-center gap-0.5 font-mono text-[8px] font-bold tracking-widest text-emerald-400/80">
                <Sparkles className="size-2.5" />
                PEAK FPS
              </span>
            </div>
          </div>
        )}
      </div>
    </motion.button>
  )
})

export function HudCorners() {
  const base = 'pointer-events-none absolute size-4 border-accent/30'
  return (
    <>
      <span className={cn(base, 'left-2.5 top-2.5 rounded-tl border-l-2 border-t-2')} />
      <span className={cn(base, 'right-2.5 top-2.5 rounded-tr border-r-2 border-t-2')} />
      <span className={cn(base, 'bottom-2.5 left-2.5 rounded-bl border-b-2 border-l-2')} />
      <span className={cn(base, 'bottom-2.5 right-2.5 rounded-br border-b-2 border-r-2')} />
    </>
  )
}
