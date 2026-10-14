import { memo } from 'react'
import { motion } from 'framer-motion'
import { Rocket, Check, Zap, Sparkles, Flame } from 'lucide-react'
import { cn } from '@/lib/utils'

type BoosterPhase = 'idle' | 'boosting' | 'done'

interface BoosterScanDialProps {
  phase: BoosterPhase
  progress: number
  onClick: () => void
  reduceMotion: boolean
  reclaimableLabel?: string
  activeModulesCount?: number
}

const OUTER_R = 98
const R = 86
const INNER_R = 72
const CIRC = 2 * Math.PI * R
const C = 116 // Center for 232x232 viewBox

export const BoosterScanDial = memo(function BoosterScanDial({
  phase,
  progress,
  onClick,
  reduceMotion,
  reclaimableLabel,
  activeModulesCount = 10,
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
      whileHover={idle && !reduceMotion ? { scale: 1.035 } : undefined}
      whileTap={idle && !reduceMotion ? { scale: 0.965 } : undefined}
      aria-label={idle ? 'Engage Game Booster' : undefined}
      className={cn(
        'group relative size-[232px] shrink-0 select-none rounded-full outline-none transition-transform duration-200 cursor-pointer',
        'focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        boosting && 'cursor-not-allowed',
      )}
    >
      {/* Multi-layered Ambient Radial Aura */}
      <div
        className={cn(
          'pointer-events-none absolute inset-[-14px] rounded-full transition-opacity duration-500 blur-xl',
          done
            ? 'bg-emerald-500/20 opacity-100'
            : boosting
              ? 'bg-accent/30 opacity-100 animate-pulse'
              : 'bg-accent/15 opacity-60 group-hover:opacity-100',
        )}
      />

      {/* SVG Radial Instrument Dial */}
      <svg
        viewBox="0 0 232 232"
        className="pointer-events-none absolute inset-0 size-full"
        style={{ willChange: 'transform' }}
      >
        <defs>
          <linearGradient id="booster-accent-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--color-accent)" />
            <stop offset="50%" stopColor="color-mix(in srgb, var(--color-accent) 80%, #22d3ee)" />
            <stop offset="100%" stopColor="color-mix(in srgb, var(--color-accent) 70%, #6366f1)" />
          </linearGradient>

          <linearGradient id="booster-done-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#34d399" />
            <stop offset="100%" stopColor="#10b981" />
          </linearGradient>
        </defs>

        {/* Outer Segmented Telemetry Ring */}
        <circle
          cx={C}
          cy={C}
          r={OUTER_R}
          fill="none"
          stroke="var(--nx-border)"
          strokeWidth="1.5"
          strokeDasharray="12 8 4 8"
          strokeOpacity="0.55"
          className={cn(
            'origin-center transition-colors duration-300',
            done
              ? 'stroke-emerald-400/50'
              : boosting
                ? 'stroke-accent/70 animate-spin'
                : 'group-hover:stroke-accent/45',
          )}
          style={boosting ? { animationDuration: '8s' } : undefined}
        />

        {/* Primary Track Ring */}
        <circle
          cx={C}
          cy={C}
          r={R}
          fill="none"
          stroke="var(--nx-border)"
          strokeWidth="7"
          strokeOpacity="0.5"
          className="transition-colors duration-300 group-hover:stroke-accent/25"
        />

        {/* Inner Calibrated Ring */}
        <circle
          cx={C}
          cy={C}
          r={INNER_R}
          fill="none"
          stroke="var(--nx-border)"
          strokeWidth="1.2"
          strokeDasharray="3 5"
          strokeOpacity="0.45"
        />

        {/* 48 Precision Radar Tick Marks */}
        {Array.from({ length: 48 }).map((_, i) => {
          const angle = (i / 48) * 360
          const isMajor = i % 12 === 0
          const isMid = i % 4 === 0
          const rad = ((angle - 90) * Math.PI) / 180
          const inner = R + (isMajor ? 5 : isMid ? 6.5 : 7.5)
          const outer = R + (isMajor ? 12 : isMid ? 10.5 : 9.5)
          const isLit = (i / 48) * 100 <= pct

          return (
            <line
              key={i}
              x1={C + Math.cos(rad) * inner}
              y1={C + Math.sin(rad) * inner}
              x2={C + Math.cos(rad) * outer}
              y2={C + Math.sin(rad) * outer}
              strokeWidth={isMajor ? 2 : 1.1}
              className={cn(
                'transition-colors duration-200',
                done && isLit
                  ? 'stroke-emerald-400'
                  : isLit
                    ? 'stroke-accent'
                    : isMajor
                      ? 'stroke-accent/65'
                      : isMid
                        ? 'stroke-accent/35 group-hover:stroke-accent/55'
                        : 'stroke-border/75 group-hover:stroke-border',
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
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={strokeOffset}
          transform={`rotate(-90 ${C} ${C})`}
          className="transition-[stroke-dashoffset] duration-300 ease-out"
          style={{
            filter: `drop-shadow(0 0 8px ${
              done
                ? 'rgba(52,211,153,0.75)'
                : 'color-mix(in srgb, var(--color-accent) 80%, transparent)'
            })`,
          }}
        />
      </svg>

      {/* Central Reactor Core Chamber */}
      <div
        className={cn(
          'absolute left-1/2 top-1/2 z-10 flex size-[138px] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border shadow-2xl transition-all duration-300',
          done
            ? 'border-emerald-400/50 bg-surface/95 text-emerald-400 shadow-[0_0_30px_rgba(52,211,153,0.28)]'
            : boosting
              ? 'border-accent/70 bg-surface/95 text-text shadow-[0_0_30px_color-mix(in_srgb,var(--color-accent)_40%,transparent)]'
              : 'border-border/90 bg-gradient-to-b from-surface-raised/95 to-surface text-text group-hover:border-accent/50 group-hover:shadow-[0_0_26px_color-mix(in_srgb,var(--color-accent)_30%,transparent)]',
        )}
      >
        {idle && (
          <div className="flex flex-col items-center gap-1.5 px-2 text-center">
            <div className="relative flex size-12 items-center justify-center rounded-2xl bg-accent/15 text-accent ring-1 ring-accent/30 transition-all duration-300 group-hover:scale-110 group-hover:bg-accent group-hover:text-white group-hover:shadow-[0_0_18px_var(--nx-accent)]">
              <Rocket className="size-6 transition-transform group-hover:-translate-y-0.5" />
              <Flame className="absolute -right-1 -top-1 size-3.5 fill-amber-400 text-amber-400 transition-transform group-hover:scale-110" />
            </div>
            <div>
              <span className="block font-mono text-xs font-black tracking-[0.22em] text-text transition-colors group-hover:text-accent">
                ENGAGE BOOST
              </span>
              <span className="mt-0.5 block font-mono text-[9px] font-bold tracking-wider text-subtle">
                {reclaimableLabel ? `FREE ${reclaimableLabel}` : `${activeModulesCount} MODULES ARMED`}
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
              OVERCLOCKING
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
            <div className="flex size-11 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/40 shadow-[0_0_16px_rgba(52,211,153,0.4)]">
              <Check className="size-6" strokeWidth={2.75} />
            </div>
            <div>
              <span className="block font-mono text-[11px] font-black tracking-[0.2em] text-emerald-400">
                PEAK STATE
              </span>
              <span className="flex items-center justify-center gap-0.5 font-mono text-[8px] font-bold tracking-widest text-emerald-400/80">
                <Sparkles className="size-2.5" />
                MAX FPS ARMED
              </span>
            </div>
          </div>
        )}
      </div>
    </motion.button>
  )
})

export function HudCorners() {
  const base = 'pointer-events-none absolute size-4 border-accent/35'
  return (
    <>
      <span className={cn(base, 'left-3 top-3 rounded-tl border-l-2 border-t-2')} />
      <span className={cn(base, 'right-3 top-3 rounded-tr border-r-2 border-t-2')} />
      <span className={cn(base, 'bottom-3 left-3 rounded-bl border-b-2 border-l-2')} />
      <span className={cn(base, 'bottom-3 right-3 rounded-br border-b-2 border-r-2')} />
    </>
  )
}
