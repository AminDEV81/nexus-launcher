import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  getMetacriticTone,
  getOpenCriticTone,
  getIgdbTone,
  resolveClientCriticScores,
} from '../utils/score'

interface HubScoreBadgeProps {
  metacriticScore?: number | null
  opencriticScore?: number | null
  igdbRating?: number | null
  igdbRatingCount?: number | null
  gameName?: string | null
  releaseDate?: string | null
  variant?: 'card' | 'hero' | 'details' | 'compact'
  className?: string
}

export function HubScoreBadge({
  metacriticScore,
  opencriticScore,
  igdbRating,
  igdbRatingCount,
  gameName,
  releaseDate,
  variant = 'card',
  className,
}: HubScoreBadgeProps) {
  const resolved = resolveClientCriticScores(
    gameName,
    releaseDate,
    metacriticScore,
    opencriticScore,
    igdbRating,
  )

  const mcScore = resolved.metacritic
  const ocScore = resolved.opencritic

  const mcTone = getMetacriticTone(mcScore)
  const ocTone = getOpenCriticTone(ocScore)
  const igdbTone = getIgdbTone(igdbRating)

  // ── 1. Card Variant (Compact dual MC + OC badge on game cards) ────────
  if (variant === 'card' || variant === 'compact') {
    const hasMc = mcScore !== null && mcScore > 0
    const hasOc = ocScore !== null && ocScore > 0

    if (hasMc || hasOc) {
      return (
        <div
          className={cn(
            'inline-flex items-center gap-1 rounded-lg bg-black/75 p-0.5 shadow-md ring-1 ring-white/20 backdrop-blur-md',
            className,
          )}
        >
          {hasMc && (
            <span
              title={`Metacritic: ${mcScore}/100 (${mcTone.label})`}
              className={cn(
                'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-black tracking-tight text-white shadow-xs',
                mcTone.bg,
              )}
            >
              <span className="text-[8px] font-extrabold uppercase opacity-90">MC</span>
              <span>{mcScore}</span>
            </span>
          )}
          {hasOc && (
            <span
              title={`OpenCritic: ${ocScore}/100 (${ocTone.label})`}
              className={cn(
                'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-black tracking-tight text-white shadow-xs',
                ocTone.bg,
              )}
            >
              <span className="text-[8px] font-extrabold uppercase opacity-90">OC</span>
              <span>{ocScore}</span>
            </span>
          )}
        </div>
      )
    }

    if (igdbRating !== null && igdbRating !== undefined && igdbRating > 0) {
      const score = Math.round(igdbRating)
      const badgeColor =
        score >= 85
          ? 'bg-emerald-600/90 text-white ring-emerald-400/40'
          : score >= 75
            ? 'bg-sky-600/90 text-white ring-sky-400/40'
            : score >= 60
              ? 'bg-amber-600/90 text-white ring-amber-400/40'
              : 'bg-rose-600/90 text-white ring-rose-400/40'
      return (
        <span
          title={`Critic & Community Score: ${score}% (${igdbTone.label})`}
          className={cn(
            'inline-flex items-center gap-0.5 rounded-lg px-1.5 py-0.5 font-mono text-[10px] font-black tracking-tight shadow-sm ring-1 backdrop-blur-md',
            badgeColor,
            className,
          )}
        >
          <Star className="size-2.5 fill-current text-amber-300" />
          <span>{score}</span>
        </span>
      )
    }

    return null
  }

  // ── 2. Hero Variant (Flagship Metacritic & OpenCritic Telemetry HUD) ───
  if (variant === 'hero') {
    const hasMetacritic = mcScore !== null && mcScore > 0
    const hasOpenCritic = ocScore !== null && ocScore > 0
    const hasIgdb = igdbRating !== null && igdbRating !== undefined && igdbRating > 0

    if (!hasMetacritic && !hasOpenCritic && !hasIgdb) {
      return (
        <div
          className={cn(
            'inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-black/55 px-3.5 py-2 text-xs text-subtle backdrop-blur-md shadow-lg',
            className,
          )}
        >
          <span className="size-2 rounded-full bg-amber-400 animate-pulse" />
          <span className="font-bold text-[11px] uppercase tracking-wider text-white/80">
            Critic Reviews Pending
          </span>
        </div>
      )
    }

    const isMustPlay = (mcScore ?? 0) >= 90
    const isMighty = (ocScore ?? 0) >= 84

    return (
      <div className={cn('flex flex-wrap items-stretch gap-2.5', className)}>
        {/* Flagship Metacritic Telemetry Card */}
        {hasMetacritic && (
          <div
            title={`Metacritic Metascore: ${mcScore}/100 • ${mcTone.label}`}
            className="group/mc relative flex items-center gap-3 overflow-hidden rounded-2xl border border-emerald-400/35 bg-gradient-to-br from-black/85 via-zinc-950/90 to-emerald-950/50 px-3.5 py-2 shadow-[0_10px_28px_rgba(0,0,0,0.55)] backdrop-blur-xl transition-all hover:border-emerald-400/60"
          >
            <div className="pointer-events-none absolute -right-6 -top-6 size-20 rounded-full bg-emerald-500/15 blur-xl" />

            {/* Radial Progress Gauge + Official MC Shield */}
            <div className="relative flex size-11 shrink-0 items-center justify-center">
              <svg viewBox="0 0 44 44" className="size-full -rotate-90 drop-shadow-[0_0_6px_rgba(16,185,129,0.35)]">
                <circle
                  cx="22"
                  cy="22"
                  r="18.5"
                  fill="none"
                  stroke="rgba(255,255,255,0.12)"
                  strokeWidth="3.5"
                />
                <circle
                  cx="22"
                  cy="22"
                  r="18.5"
                  fill="none"
                  stroke={mcTone.color}
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeDasharray={`${(mcScore / 100) * 116.2} 116.2`}
                />
              </svg>
              <div className="absolute flex flex-col items-center justify-center leading-none">
                <span className="font-mono text-sm font-black tabular-nums text-white">
                  {mcScore}
                </span>
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-[#ffcc33] font-serif text-[9px] font-black text-black shadow-xs ring-1 ring-black">
                m
              </span>
            </div>

            {/* Metacritic Label, Tier Pill & Mini Bar */}
            <div className="flex min-w-[108px] flex-col justify-center gap-1">
              <div className="flex items-center justify-between gap-1.5">
                <span className="font-mono text-[10px] font-black uppercase tracking-widest text-white">
                  METACRITIC
                </span>
                {isMustPlay ? (
                  <span className="rounded bg-amber-400 px-1.5 py-0.2 font-mono text-[8px] font-black uppercase tracking-wider text-black shadow-2xs">
                    MUST-PLAY
                  </span>
                ) : (
                  <span className="rounded bg-emerald-500/25 px-1.5 py-0.2 font-mono text-[8px] font-bold uppercase text-emerald-300 ring-1 ring-emerald-400/30">
                    METASCORE
                  </span>
                )}
              </div>

              <span className={cn('text-[10.5px] font-extrabold leading-none', mcTone.text)}>
                {mcTone.label}
              </span>

              <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-white/12">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${mcScore}%`, backgroundColor: mcTone.color }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Flagship OpenCritic Telemetry Card */}
        {hasOpenCritic && (
          <div
            title={`OpenCritic Top Critic Average: ${ocScore}/100 • ${ocTone.label}`}
            className="group/oc relative flex items-center gap-3 overflow-hidden rounded-2xl border border-orange-400/35 bg-gradient-to-br from-black/85 via-zinc-950/90 to-orange-950/45 px-3.5 py-2 shadow-[0_10px_28px_rgba(0,0,0,0.55)] backdrop-blur-xl transition-all hover:border-orange-400/60"
          >
            <div className="pointer-events-none absolute -right-6 -top-6 size-20 rounded-full bg-orange-500/15 blur-xl" />

            {/* Radial Progress Gauge + Official OC Emblem */}
            <div className="relative flex size-11 shrink-0 items-center justify-center">
              <svg viewBox="0 0 44 44" className="size-full -rotate-90 drop-shadow-[0_0_6px_rgba(249,115,22,0.35)]">
                <circle
                  cx="22"
                  cy="22"
                  r="18.5"
                  fill="none"
                  stroke="rgba(255,255,255,0.12)"
                  strokeWidth="3.5"
                />
                <circle
                  cx="22"
                  cy="22"
                  r="18.5"
                  fill="none"
                  stroke={ocTone.color}
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeDasharray={`${(ocScore / 100) * 116.2} 116.2`}
                />
              </svg>
              <div className="absolute flex flex-col items-center justify-center leading-none">
                <span className="font-mono text-sm font-black tabular-nums text-white">
                  {ocScore}
                </span>
              </div>
              <span
                className={cn(
                  'absolute -bottom-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full font-mono text-[7.5px] font-black text-white shadow-xs ring-1 ring-black',
                  ocTone.bg,
                )}
              >
                OC
              </span>
            </div>

            {/* OpenCritic Label, Tier Pill & Mini Bar */}
            <div className="flex min-w-[108px] flex-col justify-center gap-1">
              <div className="flex items-center justify-between gap-1.5">
                <span className="font-mono text-[10px] font-black uppercase tracking-widest text-white">
                  OPENCRITIC
                </span>
                {isMighty ? (
                  <span className="rounded bg-gradient-to-r from-orange-500 to-amber-400 px-1.5 py-0.2 font-mono text-[8px] font-black uppercase tracking-wider text-black shadow-2xs">
                    MIGHTY
                  </span>
                ) : (
                  <span className="rounded bg-orange-500/25 px-1.5 py-0.2 font-mono text-[8px] font-bold uppercase text-orange-300 ring-1 ring-orange-400/30">
                    TOP CRITIC
                  </span>
                )}
              </div>

              <span className={cn('text-[10.5px] font-extrabold leading-none', ocTone.text)}>
                {ocTone.label}
              </span>

              <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-white/12">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${ocScore}%`, backgroundColor: ocTone.color }}
                />
              </div>
            </div>
          </div>
        )}

        {/* IGDB Community & Critic Rating Card */}
        {hasIgdb && (
          <div className="flex items-center gap-2.5 rounded-2xl border border-amber-400/30 bg-black/75 px-3.5 py-2 backdrop-blur-xl shadow-lg">
            <div className="flex size-9 items-center justify-center rounded-xl bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40 shrink-0">
              <Star className="size-4.5 fill-current text-amber-400" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-baseline gap-1.5">
                <span className="font-mono text-sm font-black tabular-nums text-white">
                  {Math.round(igdbRating)}%
                </span>
                <span className="font-mono text-[9.5px] font-black text-amber-300 uppercase tracking-wider">
                  IGDB SCORE
                </span>
              </div>
              <span className="text-[10px] font-semibold text-white/75">
                {igdbRatingCount && igdbRatingCount > 0
                  ? `${igdbRatingCount.toLocaleString()} Ratings`
                  : igdbTone.label}
              </span>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── 3. Details Variant (Comprehensive Metacritic + OpenCritic + IGDB Panel) ──
  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-2xl border border-border bg-surface-raised/80 p-4 shadow-sm',
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-extrabold uppercase tracking-widest text-subtle">
          Critic Reception & Aggregated Scores
        </span>
        {(mcScore || ocScore) && (
          <span className="rounded-md bg-accent/10 px-2 py-0.5 font-mono text-[10px] font-bold text-accent">
            Verified Critics
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2.5">
        {/* Metacritic Score Card */}
        <div className="flex items-center gap-3.5 rounded-xl border border-border/80 bg-surface/90 p-3 shadow-xs">
          <div
            className={cn(
              'flex size-12 shrink-0 flex-col items-center justify-center rounded-xl font-mono shadow-md ring-1 ring-white/15',
              mcScore !== null
                ? cn(mcTone.bg, 'text-white')
                : 'bg-surface-sunken text-subtle border border-border/60',
            )}
          >
            <span className="text-[8px] font-black uppercase tracking-wider opacity-85">MC</span>
            <span className="text-base font-black leading-none">
              {mcScore !== null ? mcScore : 'TBD'}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-extrabold uppercase tracking-wider text-text">
                Metacritic
              </span>
              {mcScore !== null && (
                <span className="font-mono text-xs font-black text-text">{mcScore} / 100</span>
              )}
            </div>
            <span
              className={cn(
                'text-xs font-semibold truncate block mt-0.5',
                mcScore !== null ? mcTone.text : 'text-subtle font-normal text-[11px]',
              )}
            >
              {mcScore !== null ? mcTone.label : 'Awaiting Metacritic Reviews'}
            </span>
            {mcScore !== null && (
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-raised">
                <div
                  className={cn('h-full rounded-full transition-all duration-500', mcTone.bg)}
                  style={{ width: `${Math.min(100, Math.max(0, mcScore))}%` }}
                />
              </div>
            )}
          </div>
        </div>

        {/* OpenCritic Score Card */}
        <div className="flex items-center gap-3.5 rounded-xl border border-border/80 bg-surface/90 p-3 shadow-xs">
          <div
            className={cn(
              'flex size-12 shrink-0 flex-col items-center justify-center rounded-xl font-mono shadow-md ring-1 ring-white/15',
              ocScore !== null
                ? cn(ocTone.bg, 'text-white')
                : 'bg-surface-sunken text-subtle border border-border/60',
            )}
          >
            <span className="text-[8px] font-black uppercase tracking-wider opacity-85">OC</span>
            <span className="text-base font-black leading-none">
              {ocScore !== null ? ocScore : 'TBD'}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-extrabold uppercase tracking-wider text-text">
                  OpenCritic
                </span>
                {ocScore !== null && (
                  <span
                    className={cn(
                      'rounded px-1.5 py-0.2 text-[9px] font-black uppercase text-white',
                      ocTone.bg,
                    )}
                  >
                    {ocTone.tier}
                  </span>
                )}
              </div>
              {ocScore !== null && (
                <span className="font-mono text-xs font-black text-text">{ocScore} / 100</span>
              )}
            </div>
            <span
              className={cn(
                'text-xs font-semibold truncate block mt-0.5',
                ocScore !== null ? ocTone.text : 'text-subtle font-normal text-[11px]',
              )}
            >
              {ocScore !== null ? ocTone.label : 'Awaiting OpenCritic Reviews'}
            </span>
            {ocScore !== null && (
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-raised">
                <div
                  className={cn('h-full rounded-full transition-all duration-500', ocTone.bg)}
                  style={{ width: `${Math.min(100, Math.max(0, ocScore))}%` }}
                />
              </div>
            )}
          </div>
        </div>

        {/* IGDB Critics Card */}
        {igdbRating !== null && igdbRating !== undefined && igdbRating > 0 && (
          <div className="flex items-center gap-3.5 rounded-xl border border-border/80 bg-surface/90 p-3 shadow-xs">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 shadow-md">
              <Star className="size-6 fill-current" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-extrabold uppercase tracking-wider text-text">
                  IGDB Community & Critics
                </span>
                <span className="font-mono text-xs font-black text-amber-300">
                  {Math.round(igdbRating)}%
                </span>
              </div>
              <span className="text-xs font-medium text-subtle truncate block mt-0.5">
                {igdbRatingCount ? `${igdbRatingCount} Combined Ratings` : igdbTone.label}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
