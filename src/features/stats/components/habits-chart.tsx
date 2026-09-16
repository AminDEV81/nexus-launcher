import { Sunrise, Sun, Sunset, Moon, Flame, Compass, Sparkles } from 'lucide-react'
import type { CircadianHabits } from '../utils/gamer-level'
import { cn } from '@/lib/utils'

interface HabitsChartProps {
  habits: CircadianHabits
  totalSessions: number
}

const BUCKET_ICONS = {
  morning: Sunrise,
  afternoon: Sun,
  evening: Sunset,
  night: Moon,
}

const PERSONA_ICONS = {
  Moon,
  Flame,
  Sun,
  Sunrise,
  Compass,
}

export function HabitsChart({ habits, totalSessions }: HabitsChartProps) {
  const { buckets, dominantPersona } = habits
  const PersonaIcon = PERSONA_ICONS[dominantPersona.icon] ?? Compass
  const peakBucket = [...buckets].sort((a, b) => b.hours - a.hours)[0]

  return (
    <div className="flex flex-col gap-6">
      {/* Persona Hero Badge */}
      <div className="relative overflow-hidden rounded-3xl border border-accent/40 bg-gradient-to-br from-surface/90 to-surface-raised/90 p-6 shadow-card">
        <div className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-accent/15 blur-2xl" />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-accent/20 text-accent shadow-md shadow-accent/20 ring-1 ring-accent/40">
              <PersonaIcon className="size-7" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-accent">
                  CIRCADIAN PERSONA
                </span>
                <span className="rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 font-mono text-[9px] font-extrabold text-accent">
                  {dominantPersona.tag}
                </span>
              </div>
              <h3 className="mt-0.5 text-xl font-black tracking-tight text-text">
                {dominantPersona.title}
              </h3>
              <p className="mt-1 max-w-xl text-xs text-muted leading-relaxed">
                {dominantPersona.description}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-3 rounded-2xl border border-border/80 bg-surface/70 px-4 py-3 shadow-xs">
            <div>
              <span className="block font-mono text-[9px] font-bold uppercase text-subtle">
                Analyzed Telemetry
              </span>
              <span className="font-mono text-sm font-black text-text">
                {totalSessions} Play Sessions
              </span>
            </div>
            <Sparkles className="size-4 text-accent" />
          </div>
        </div>
      </div>

      {/* 4 Quadrants Grid */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {buckets.map((bucket) => {
          const Icon = BUCKET_ICONS[bucket.id]
          const isPeak = peakBucket?.id === bucket.id && bucket.hours > 0

          return (
            <div
              key={bucket.id}
              className={cn(
                'relative flex flex-col justify-between overflow-hidden rounded-3xl border p-5 shadow-sm transition-all duration-200 hover:bg-surface-raised',
                isPeak
                  ? 'border-accent bg-surface/90 shadow-md shadow-accent/10 ring-1 ring-accent/30'
                  : 'border-border/80 bg-surface/70',
              )}
            >
              {isPeak && (
                <div className="absolute right-3.5 top-3.5 flex items-center gap-1 rounded-full border border-accent/40 bg-accent/15 px-2 py-0.5 font-mono text-[9px] font-black text-accent">
                  <Flame className="size-3 fill-current" />
                  <span>PEAK HABIT</span>
                </div>
              )}

              <div>
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      'flex size-10 items-center justify-center rounded-xl shadow-xs',
                      isPeak ? 'bg-accent text-white' : 'bg-surface-raised text-muted',
                    )}
                  >
                    <Icon className="size-5" />
                  </span>
                  <div>
                    <h4 className="text-sm font-bold text-text">{bucket.label}</h4>
                    <span className="font-mono text-[10px] text-subtle">{bucket.timeRange}</span>
                  </div>
                </div>

                <div className="mt-4 flex items-baseline justify-between">
                  <span className="font-mono text-2xl font-black text-text">{bucket.hours}h</span>
                  <span
                    className={cn(
                      'font-mono text-xs font-extrabold',
                      isPeak ? 'text-accent' : 'text-muted',
                    )}
                  >
                    {bucket.percentage}%
                  </span>
                </div>

                {/* Progress Bar */}
                <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-surface-raised">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-500',
                      isPeak ? 'bg-accent shadow-[0_0_8px_var(--nx-accent)]' : 'bg-muted/40',
                    )}
                    style={{ width: `${Math.min(100, Math.max(4, bucket.percentage))}%` }}
                  />
                </div>
              </div>

              <div className="mt-4 border-t border-border/40 pt-2.5 text-[11px] text-muted">
                {bucket.description}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
