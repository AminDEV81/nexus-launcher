import { useQuery } from '@tanstack/react-query'
import { Award, Flame, ShieldCheck, Star, Trophy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { localDateKey } from '@/features/library/utils/format'
import { resolveHubGameScores } from '@/services/hub'
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
  const isUnreleased = Boolean(releaseDate && releaseDate > localDateKey())

  const initialResolved = resolveClientCriticScores(
    gameName,
    releaseDate,
    metacriticScore,
    opencriticScore,
    igdbRating,
  )

  const normNameKey = (gameName ?? '').trim().toLowerCase()
  const shouldFetchLive =
    !isUnreleased && normNameKey.length >= 2 && !initialResolved.isVerified

  const { data: liveScores } = useQuery({
    queryKey: ['hub', 'critic-scores', normNameKey, releaseDate ?? ''],
    queryFn: () =>
      resolveHubGameScores({
        gameName: gameName!.trim(),
        releaseDate: releaseDate ?? null,
        metacriticScore: metacriticScore ?? null,
        opencriticScore: opencriticScore ?? null,
        igdbRating: igdbRating ?? null,
      }),
    enabled: shouldFetchLive,
    staleTime: 12 * 60 * 60 * 1000,
    gcTime: 12 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: false,
  })

  const mcScore =
    liveScores?.metacritic && liveScores.metacritic > 0
      ? Math.round(liveScores.metacritic)
      : initialResolved.metacritic
  const ocScore =
    liveScores?.opencritic && liveScores.opencritic > 0
      ? Math.round(liveScores.opencritic)
      : initialResolved.opencritic

  const mcTone = getMetacriticTone(mcScore)
  const ocTone = getOpenCriticTone(ocScore)
  const igdbTone = getIgdbTone(igdbRating)

  // ── 1. Compact Variant (Sleek dual pills for Hero Reel & Search Dropdown) ──
  if (variant === 'compact') {
    const hasMc = mcScore !== null && mcScore > 0
    const hasOc = ocScore !== null && ocScore > 0
    if (!hasMc && !hasOc) return null

    return (
      <div className={cn('inline-flex items-center gap-1', className)}>
        {hasMc && (
          <span
            title={`Metacritic Metascore: ${mcScore}/100 (${mcTone.label})`}
            className="inline-flex items-center gap-1 rounded-md border border-emerald-400/35 bg-black/80 px-1.5 py-0.5 font-mono text-[9.5px] font-black tracking-tight text-white shadow-2xs"
          >
            <span className="flex size-3 items-center justify-center rounded-[3px] bg-[#ffcc33] font-serif text-[7.5px] font-black leading-none text-black">
              m
            </span>
            <span className="text-emerald-300">{mcScore}</span>
          </span>
        )}
        {hasOc && (
          <span
            title={`OpenCritic Top Critic Avg: ${ocScore}/100 (${ocTone.label})`}
            className="inline-flex items-center gap-1 rounded-md border border-orange-400/35 bg-black/80 px-1.5 py-0.5 font-mono text-[9.5px] font-black tracking-tight text-white shadow-2xs"
          >
            <span
              className={cn(
                'flex size-3 items-center justify-center rounded-[3px] font-mono text-[6.5px] font-black leading-none text-white',
                ocTone.bg,
              )}
            >
              OC
            </span>
            <span className="text-orange-300">{ocScore}</span>
          </span>
        )}
      </div>
    )
  }

  // ── 2. Card Variant (Dual MC + OC Glass Telemetry Badge on Game Cards) ────
  if (variant === 'card') {
    const hasMc = mcScore !== null && mcScore > 0
    const hasOc = ocScore !== null && ocScore > 0

    if (hasMc || hasOc) {
      return (
        <div
          className={cn(
            'inline-flex items-center gap-1 rounded-xl border border-white/20 bg-black/85 p-1 shadow-[0_6px_16px_rgba(0,0,0,0.65)] backdrop-blur-md',
            className,
          )}
        >
          {hasMc && (
            <span
              title={`Metacritic: ${mcScore}/100 (${mcTone.label})`}
              className={cn(
                'inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 font-mono text-[10px] font-black tracking-tight text-white shadow-xs ring-1 ring-inset ring-white/20',
                mcTone.bg,
              )}
            >
              <span className="flex size-3 items-center justify-center rounded-[3px] bg-[#ffcc33] font-serif text-[8px] font-black leading-none text-black shadow-2xs">
                m
              </span>
              <span>{mcScore}</span>
            </span>
          )}
          {hasOc && (
            <span
              title={`OpenCritic: ${ocScore}/100 (${ocTone.label})`}
              className={cn(
                'inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 font-mono text-[10px] font-black tracking-tight text-white shadow-xs ring-1 ring-inset ring-white/20',
                ocTone.bg,
              )}
            >
              <Flame className="size-2.5 fill-current text-amber-200" />
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

  // ── 3. Hero Variant (Next-Gen Left-Side Game Hub Header Telemetry Deck) ────
  if (variant === 'hero') {
    const hasMetacritic = mcScore !== null && mcScore > 0
    const hasOpenCritic = ocScore !== null && ocScore > 0
    const hasIgdb = igdbRating !== null && igdbRating !== undefined && igdbRating > 0

    if (!hasMetacritic && !hasOpenCritic && !hasIgdb) {
      return (
        <div
          className={cn(
            'inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-black/65 px-3.5 py-2 text-xs text-subtle backdrop-blur-md shadow-lg',
            className,
          )}
        >
          <span className="size-2 rounded-full bg-amber-400 animate-pulse" />
          <span className="font-bold text-[11px] uppercase tracking-wider text-white/85">
            Critic Reviews Pending
          </span>
        </div>
      )
    }

    const isMustPlay = (mcScore ?? 0) >= 90
    const isMighty = (ocScore ?? 0) >= 84
    const consensusAvg =
      hasMetacritic && hasOpenCritic
        ? Math.round(((mcScore ?? 0) + (ocScore ?? 0)) / 2)
        : (mcScore ?? ocScore ?? (hasIgdb ? Math.round(igdbRating!) : null))

    return (
      <div
        className={cn(
          'inline-flex flex-wrap items-stretch gap-2.5 rounded-2xl border border-white/15 bg-black/70 p-2 shadow-[0_18px_42px_rgba(0,0,0,0.75)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl',
          className,
        )}
      >
        {/* 1. Flagship Metacritic Metascore Pod */}
        {hasMetacritic && (
          <div
            title={`Metacritic Metascore: ${mcScore}/100 • ${mcTone.label}`}
            className={cn(
              'group/mc relative flex items-center gap-3 overflow-hidden rounded-xl border px-3.5 py-2 transition-all duration-300',
              isMustPlay
                ? 'border-amber-400/50 bg-gradient-to-br from-emerald-950/85 via-zinc-950/95 to-amber-950/45 shadow-[0_0_24px_-6px_rgba(251,191,36,0.35)]'
                : 'border-emerald-400/40 bg-gradient-to-br from-emerald-950/80 via-zinc-950/95 to-black/90',
            )}
          >
            <div className="pointer-events-none absolute -right-6 -top-6 size-24 rounded-full bg-emerald-500/20 blur-xl" />
            {isMustPlay && (
              <div className="pointer-events-none absolute -left-6 -bottom-6 size-20 rounded-full bg-amber-400/15 blur-xl" />
            )}

            {/* Dual-Ring Radial Progress Gauge + Official Metacritic Shield */}
            <div className="relative flex size-12 shrink-0 items-center justify-center">
              <svg
                viewBox="0 0 48 48"
                className="size-full -rotate-90 drop-shadow-[0_0_8px_rgba(16,185,129,0.45)]"
              >
                <circle
                  cx="24"
                  cy="24"
                  r="20"
                  fill="none"
                  stroke="rgba(255,255,255,0.12)"
                  strokeWidth="4"
                />
                <circle
                  cx="24"
                  cy="24"
                  r="15.5"
                  fill="none"
                  stroke="rgba(255,255,255,0.06)"
                  strokeWidth="1"
                  strokeDasharray="2 3"
                />
                <circle
                  cx="24"
                  cy="24"
                  r="20"
                  fill="none"
                  stroke={isMustPlay ? '#fbbf24' : mcTone.color}
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={`${(mcScore / 100) * 125.66} 125.66`}
                />
              </svg>
              <div className="absolute flex flex-col items-center justify-center leading-none">
                <span className="font-mono text-[15px] font-black tabular-nums text-white drop-shadow-xs">
                  {mcScore}
                </span>
                <span className="font-mono text-[7px] font-bold text-white/55">/100</span>
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 flex size-4.5 items-center justify-center rounded-md bg-[#ffcc33] font-serif text-[10px] font-black leading-none text-black shadow-sm ring-1 ring-black">
                m
              </span>
            </div>

            {/* Metacritic Details & 10-Segment Bar */}
            <div className="flex min-w-[122px] flex-col justify-center gap-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] font-black uppercase tracking-[0.14em] text-white">
                  METACRITIC
                </span>
                {isMustPlay ? (
                  <span className="inline-flex items-center gap-0.5 rounded-md bg-gradient-to-r from-amber-300 via-amber-400 to-yellow-500 px-1.5 py-0.5 font-mono text-[8px] font-black uppercase tracking-wider text-black shadow-xs">
                    <Trophy className="size-2.5 fill-current" />
                    <span>MUST-PLAY</span>
                  </span>
                ) : (
                  <span className="rounded-md bg-emerald-500/25 px-1.5 py-0.5 font-mono text-[8px] font-extrabold uppercase tracking-wider text-emerald-300 ring-1 ring-emerald-400/35">
                    METASCORE
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className={cn('text-[11px] font-extrabold leading-none', mcTone.text)}>
                  {mcTone.label}
                </span>
              </div>

              {/* 10-Segment Illuminated Meter */}
              <div className="mt-1 grid grid-cols-10 gap-0.5">
                {Array.from({ length: 10 }).map((_, segIdx) => {
                  const activeSeg = mcScore >= (segIdx + 1) * 10 - 4
                  return (
                    <span
                      key={segIdx}
                      className={cn(
                        'h-1.5 rounded-[2px] transition-all',
                        activeSeg
                          ? isMustPlay
                            ? 'bg-gradient-to-t from-emerald-400 to-amber-300 shadow-[0_0_4px_rgba(251,191,36,0.5)]'
                            : 'bg-emerald-400'
                          : 'bg-white/12',
                      )}
                    />
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* 2. Flagship OpenCritic Top Critic Pod */}
        {hasOpenCritic && (
          <div
            title={`OpenCritic Top Critic Average: ${ocScore}/100 • ${ocTone.label}`}
            className={cn(
              'group/oc relative flex items-center gap-3 overflow-hidden rounded-xl border px-3.5 py-2 transition-all duration-300',
              isMighty
                ? 'border-orange-400/50 bg-gradient-to-br from-orange-950/85 via-zinc-950/95 to-rose-950/45 shadow-[0_0_24px_-6px_rgba(251,146,60,0.35)]'
                : 'border-orange-400/35 bg-gradient-to-br from-orange-950/75 via-zinc-950/95 to-black/90',
            )}
          >
            <div className="pointer-events-none absolute -right-6 -top-6 size-24 rounded-full bg-orange-500/20 blur-xl" />

            {/* Dual-Ring Radial Progress Gauge + Official OC Emblem */}
            <div className="relative flex size-12 shrink-0 items-center justify-center">
              <svg
                viewBox="0 0 48 48"
                className="size-full -rotate-90 drop-shadow-[0_0_8px_rgba(249,115,22,0.45)]"
              >
                <circle
                  cx="24"
                  cy="24"
                  r="20"
                  fill="none"
                  stroke="rgba(255,255,255,0.12)"
                  strokeWidth="4"
                />
                <circle
                  cx="24"
                  cy="24"
                  r="15.5"
                  fill="none"
                  stroke="rgba(255,255,255,0.06)"
                  strokeWidth="1"
                  strokeDasharray="2 3"
                />
                <circle
                  cx="24"
                  cy="24"
                  r="20"
                  fill="none"
                  stroke={ocTone.color}
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={`${(ocScore / 100) * 125.66} 125.66`}
                />
              </svg>
              <div className="absolute flex flex-col items-center justify-center leading-none">
                <span className="font-mono text-[15px] font-black tabular-nums text-white drop-shadow-xs">
                  {ocScore}
                </span>
                <span className="font-mono text-[7px] font-bold text-white/55">/100</span>
              </div>
              <span
                className={cn(
                  'absolute -bottom-0.5 -right-0.5 flex size-4.5 items-center justify-center rounded-md font-mono text-[8px] font-black leading-none text-white shadow-sm ring-1 ring-black',
                  ocTone.bg,
                )}
              >
                OC
              </span>
            </div>

            {/* OpenCritic Details & 10-Segment Bar */}
            <div className="flex min-w-[122px] flex-col justify-center gap-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] font-black uppercase tracking-[0.14em] text-white">
                  OPENCRITIC
                </span>
                {isMighty ? (
                  <span className="inline-flex items-center gap-0.5 rounded-md bg-gradient-to-r from-orange-500 via-amber-400 to-yellow-300 px-1.5 py-0.5 font-mono text-[8px] font-black uppercase tracking-wider text-black shadow-xs">
                    <Flame className="size-2.5 fill-current" />
                    <span>MIGHTY</span>
                  </span>
                ) : (
                  <span className="rounded-md bg-orange-500/25 px-1.5 py-0.5 font-mono text-[8px] font-extrabold uppercase tracking-wider text-orange-300 ring-1 ring-orange-400/35">
                    {ocTone.tier}
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className={cn('text-[11px] font-extrabold leading-none', ocTone.text)}>
                  {ocTone.label}
                </span>
              </div>

              {/* 10-Segment Illuminated Meter */}
              <div className="mt-1 grid grid-cols-10 gap-0.5">
                {Array.from({ length: 10 }).map((_, segIdx) => {
                  const activeSeg = ocScore >= (segIdx + 1) * 10 - 4
                  return (
                    <span
                      key={segIdx}
                      className={cn(
                        'h-1.5 rounded-[2px] transition-all',
                        activeSeg
                          ? isMighty
                            ? 'bg-gradient-to-t from-orange-500 to-amber-300 shadow-[0_0_4px_rgba(249,115,22,0.5)]'
                            : 'bg-purple-400'
                          : 'bg-white/12',
                      )}
                    />
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* 3. Consensus & IGDB Community Score Pod */}
        {(hasIgdb || consensusAvg !== null) && (
          <div className="flex items-center gap-2.5 rounded-xl border border-white/15 bg-gradient-to-br from-white/10 via-black/75 to-black/90 px-3 py-2">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-amber-400/40 bg-amber-500/15 text-amber-300 shadow-inner">
              {consensusAvg && consensusAvg >= 90 ? (
                <Award className="size-5 text-amber-300" />
              ) : (
                <Star className="size-4.5 fill-current text-amber-400" />
              )}
            </div>
            <div className="flex flex-col justify-center gap-0.5">
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-sm font-black tabular-nums text-white">
                  {hasIgdb ? `${Math.round(igdbRating!)}%` : `${consensusAvg}/100`}
                </span>
                <span className="inline-flex items-center gap-0.5 rounded bg-amber-400/20 px-1.5 py-0.2 font-mono text-[8px] font-black uppercase tracking-wider text-amber-300 ring-1 ring-amber-400/30">
                  <ShieldCheck className="size-2.5" />
                  <span>{hasIgdb ? 'IGDB' : 'CONSENSUS'}</span>
                </span>
              </div>
              <span className="text-[10px] font-semibold text-white/75">
                {igdbRatingCount && igdbRatingCount > 0
                  ? `${igdbRatingCount.toLocaleString()} Critic & Player Votes`
                  : consensusAvg && consensusAvg >= 90
                    ? 'Universal Critical Acclaim'
                    : igdbTone.label}
              </span>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── 4. Details Variant (Comprehensive Metacritic + OpenCritic + IGDB Panel) ──
  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-2xl border border-border bg-surface-raised/80 p-4 shadow-sm',
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-extrabold uppercase tracking-widest text-subtle">
          Critic Reception &amp; Aggregated Scores
        </span>
        {(mcScore || ocScore) && (
          <span className="inline-flex items-center gap-1 rounded-md bg-accent/10 px-2 py-0.5 font-mono text-[10px] font-bold text-accent">
            <ShieldCheck className="size-3" />
            <span>Verified Critics</span>
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2.5">
        {/* Metacritic Score Card */}
        <div className="flex items-center gap-3.5 rounded-xl border border-border/80 bg-surface/90 p-3 shadow-xs">
          <div
            className={cn(
              'relative flex size-12 shrink-0 flex-col items-center justify-center rounded-xl font-mono shadow-md ring-1 ring-white/15',
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
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-extrabold uppercase tracking-wider text-text">
                  Metacritic
                </span>
                {mcScore !== null && mcScore >= 90 && (
                  <span className="rounded bg-amber-400 px-1.5 py-0.2 font-mono text-[8px] font-black uppercase text-black">
                    Must-Play
                  </span>
                )}
              </div>
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
                  IGDB Community &amp; Critics
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
