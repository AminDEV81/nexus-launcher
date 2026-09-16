import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getMetacriticTone, getIgdbTone } from '../utils/score'

interface HubScoreBadgeProps {
  metacriticScore?: number | null
  igdbRating?: number | null
  igdbRatingCount?: number | null
  variant?: 'card' | 'hero' | 'details' | 'compact'
  className?: string
}

export function HubScoreBadge({
  metacriticScore,
  igdbRating,
  igdbRatingCount,
  variant = 'card',
  className,
}: HubScoreBadgeProps) {
  const mcTone = getMetacriticTone(metacriticScore)
  const igdbTone = getIgdbTone(igdbRating)

  // ── 1. Card Variant (Compact on-card badge) ──────────────────────────
  if (variant === 'card') {
    // If Metacritic score is available, prioritize showing real Metacritic score
    if (metacriticScore !== null && metacriticScore !== undefined) {
      return (
        <span
          title={`Metacritic: ${Math.round(metacriticScore)}/100 (${mcTone.label})`}
          className={cn(
            'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-black tracking-tight text-white shadow-sm ring-1 ring-white/15',
            mcTone.bg,
            className,
          )}
        >
          <span className="text-[8px] font-extrabold uppercase opacity-80">MC</span>
          <span>{Math.round(metacriticScore)}</span>
        </span>
      )
    }

    // If Metacritic score is unavailable, do not show anything on the card cover
    return null
  }

  // ── 2. Hero Variant (Cinematic circular progress ring / acclaim badge) ─
  if (variant === 'hero') {
    const hasMetacritic = metacriticScore !== null && metacriticScore !== undefined
    const hasIgdb = igdbRating !== null && igdbRating !== undefined

    if (!hasMetacritic && !hasIgdb) {
      return (
        <div
          className={cn(
            'flex items-center gap-2 rounded-2xl border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-subtle backdrop-blur-md',
            className,
          )}
        >
          <span className="size-2 rounded-full bg-amber-400/70 animate-pulse" />
          <span className="font-medium text-[11px] text-white/70">Reviews Pending</span>
        </div>
      )
    }

    return (
      <div className={cn('flex flex-wrap items-center gap-3', className)}>
        {/* Real Metacritic Score with SVG Progress Gauge */}
        {hasMetacritic && (
          <div className="flex items-center gap-2.5 rounded-2xl border border-white/15 bg-black/60 px-3.5 py-2 backdrop-blur-md shadow-lg">
            <div className="relative inline-flex size-10 items-center justify-center shrink-0">
              <svg viewBox="0 0 36 36" className="size-full -rotate-90">
                <circle
                  cx="18"
                  cy="18"
                  r="15.5"
                  fill="none"
                  stroke="rgba(255,255,255,0.18)"
                  strokeWidth="3"
                />
                <circle
                  cx="18"
                  cy="18"
                  r="15.5"
                  fill="none"
                  stroke={mcTone.color}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={`${(metacriticScore / 100) * 97.4} 97.4`}
                />
              </svg>
              <span className="absolute font-mono text-xs font-black tabular-nums text-white">
                {Math.round(metacriticScore)}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-black uppercase tracking-wider text-white/90">
                Metacritic
              </span>
              <span className={cn('text-[11px] font-bold leading-none', mcTone.text)}>
                {mcTone.label}
              </span>
            </div>
          </div>
        )}

        {/* IGDB Critic Score Badge */}
        {hasIgdb && (
          <div className="flex items-center gap-2 rounded-2xl border border-white/15 bg-black/60 px-3.5 py-2 backdrop-blur-md shadow-lg">
            <div className="flex size-7 items-center justify-center rounded-lg bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40 shrink-0">
              <Star className="size-4 fill-current text-amber-400" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-baseline gap-1">
                <span className="font-mono text-xs font-black tabular-nums text-white">
                  {Math.round(igdbRating)}%
                </span>
                <span className="text-[10px] font-extrabold text-white/70 uppercase">
                  IGDB Critics
                </span>
              </div>
              <span className="text-[10px] font-medium text-amber-200/80">{igdbTone.label}</span>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── 3. Details Variant (Dual-critic showcase panel) ──────────────────
  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-2xl border border-border bg-surface-raised/80 p-4 shadow-sm',
        className,
      )}
    >
      <span className="text-[10px] font-extrabold uppercase tracking-widest text-subtle">
        Critic Reviews & Scores
      </span>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Metacritic Score Card */}
        <div className="flex items-center gap-3.5 rounded-xl border border-border/80 bg-surface/90 p-3 shadow-xs">
          <div
            className={cn(
              'flex size-12 shrink-0 items-center justify-center rounded-xl font-mono shadow-md ring-1 ring-white/10',
              metacriticScore !== null && metacriticScore !== undefined
                ? cn(mcTone.bg, 'text-base font-black text-white')
                : 'bg-surface-sunken text-xs font-extrabold text-subtle border border-border/60',
            )}
          >
            {metacriticScore !== null && metacriticScore !== undefined
              ? Math.round(metacriticScore)
              : 'TBD'}
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-xs font-bold uppercase tracking-wider text-text block">
              Metacritic
            </span>
            <span
              className={cn(
                'text-xs font-semibold truncate block',
                metacriticScore !== null && metacriticScore !== undefined
                  ? mcTone.text
                  : 'text-subtle font-normal text-[11px]',
              )}
            >
              {metacriticScore !== null && metacriticScore !== undefined
                ? mcTone.label
                : 'Awaiting Metacritic Data'}
            </span>
          </div>
        </div>

        {/* IGDB Critics Card */}
        <div className="flex items-center gap-3.5 rounded-xl border border-border/80 bg-surface/90 p-3 shadow-xs">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 shadow-md">
            <Star className="size-6 fill-current" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-text">
                IGDB Critics
              </span>
              {igdbRating !== null && igdbRating !== undefined && (
                <span className="font-mono text-sm font-black text-amber-300">
                  {Math.round(igdbRating)}%
                </span>
              )}
            </div>
            <span className="text-xs font-medium text-subtle truncate block">
              {igdbRatingCount ? `${igdbRatingCount} Critic Reviews` : igdbTone.label}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
