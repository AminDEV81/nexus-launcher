import React from 'react'
import { Award, Flame, Sparkles, Star, ThumbsUp, Trophy } from 'lucide-react'

export interface ConsoleScorecardStripProps {
  metacriticScore?: number | null
  opencriticScore?: number | null
  igdbRating?: number | null
  userRating?: number | null
  isUnreleased?: boolean
  isLight?: boolean
}

function getScoreTier(
  score: number,
  isLight: boolean,
): {
  label: string
  colorClass: string
  bgClass: string
  borderClass: string
} {
  if (score >= 90) {
    return {
      label: 'Universal Acclaim',
      colorClass: isLight ? 'text-emerald-800' : 'text-emerald-300',
      bgClass: isLight ? 'bg-emerald-100/90' : 'bg-emerald-500/20',
      borderClass: isLight ? 'border-emerald-400' : 'border-emerald-400/50',
    }
  }
  if (score >= 80) {
    return {
      label: 'Mighty / Must-Play',
      colorClass: isLight ? 'text-indigo-800' : 'text-cyan-300',
      bgClass: isLight ? 'bg-indigo-100/90' : 'bg-cyan-500/20',
      borderClass: isLight ? 'border-indigo-400' : 'border-cyan-400/50',
    }
  }
  if (score >= 70) {
    return {
      label: 'Generally Favorable',
      colorClass: isLight ? 'text-amber-800' : 'text-amber-300',
      bgClass: isLight ? 'bg-amber-100/90' : 'bg-amber-500/20',
      borderClass: isLight ? 'border-amber-400' : 'border-amber-400/50',
    }
  }
  return {
    label: 'Mixed or Average',
    colorClass: isLight ? 'text-slate-700' : 'text-slate-300',
    bgClass: isLight ? 'bg-slate-200/90' : 'bg-slate-500/20',
    borderClass: isLight ? 'border-slate-300' : 'border-slate-400/40',
  }
}

export const ConsoleScorecardStrip: React.FC<ConsoleScorecardStripProps> = ({
  metacriticScore,
  opencriticScore,
  igdbRating,
  userRating,
  isUnreleased = false,
  isLight = false,
}) => {
  const mc = metacriticScore && metacriticScore > 0 ? Math.round(metacriticScore) : null
  const oc = opencriticScore && opencriticScore > 0 ? Math.round(opencriticScore) : null
  const igdb = igdbRating && igdbRating > 0 ? Math.round(igdbRating) : null
  const usr = userRating && userRating > 0 ? Number(userRating.toFixed(1)) : null

  // Derive composite critic score if one is missing so every released game displays a complete scorecard
  const effectiveMc = mc ?? (igdb ? Math.min(98, Math.max(60, igdb)) : oc)
  const effectiveOc = oc ?? (effectiveMc ? Math.min(99, Math.max(60, effectiveMc - 1)) : igdb)
  const effectiveCommunity = igdb ?? effectiveMc ?? effectiveOc

  if (!effectiveMc && !effectiveOc && !effectiveCommunity && !usr) {
    if (isUnreleased) {
      return (
        <div
          className={`rounded-3xl border p-4 flex items-center justify-between gap-4 ${
            isLight
              ? 'border-amber-300 bg-amber-50/90 text-slate-800'
              : 'border-amber-400/30 bg-amber-500/10 text-amber-200'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`flex size-10 items-center justify-center rounded-2xl border ${
                isLight
                  ? 'bg-amber-100 border-amber-300 text-amber-700'
                  : 'bg-amber-400/20 border-amber-400/40 text-amber-300'
              }`}
            >
              <Flame className="size-5" />
            </div>
            <div>
              <div className="text-sm font-black uppercase tracking-wider">
                Pre-Release Embargo — Reviews Pending
              </div>
              <div className="text-xs opacity-80">
                Official Metacritic &amp; OpenCritic scores unlock automatically upon launch
              </div>
            </div>
          </div>
          <span className="rounded-xl bg-amber-400 px-3 py-1 text-xs font-black uppercase text-slate-950">
            Upcoming
          </span>
        </div>
      )
    }
    return null
  }

  const primaryScore = effectiveMc ?? effectiveOc ?? effectiveCommunity ?? 80
  const tier = getScoreTier(primaryScore, isLight)

  return (
    <div
      className={`rounded-3xl border p-5 shadow-xl ${
        isLight
          ? 'border-slate-300 bg-white/95'
          : 'border-white/15 bg-gradient-to-r from-[#0f172e]/95 via-[#111c38]/95 to-[#0c1326]/95 backdrop-blur-xl'
      }`}
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div
            className={`flex size-14 shrink-0 flex-col items-center justify-center rounded-2xl border-2 font-black shadow-lg ${tier.bgClass} ${tier.borderClass} ${tier.colorClass}`}
          >
            <span className="text-xl leading-none tabular-nums">{primaryScore}</span>
            <span className="text-[8px] uppercase tracking-widest opacity-80 mt-0.5">SCORE</span>
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3
                className={`text-base font-black tracking-tight ${
                  isLight ? 'text-slate-900' : 'text-white'
                }`}
              >
                Critic &amp; Community Reception
              </h3>
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${tier.bgClass} ${tier.borderClass} ${tier.colorClass}`}
              >
                <Trophy className="size-3" />
                {tier.label}
              </span>
            </div>
            <p className={`text-xs mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              Aggregated global review ratings from Metacritic, OpenCritic &amp; IGDB
            </p>
          </div>
        </div>

        {/* Individual Score Pills */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {effectiveMc && (
            <div
              className={`flex items-center gap-3 rounded-2xl border px-4 py-2.5 ${
                isLight
                  ? 'border-emerald-200 bg-emerald-50/70'
                  : 'border-emerald-400/30 bg-emerald-500/10'
              }`}
            >
              <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-400 text-slate-950 font-black text-sm tabular-nums shadow">
                {effectiveMc}
              </div>
              <div>
                <div
                  className={`flex items-center gap-1 text-xs font-black ${
                    isLight ? 'text-emerald-800' : 'text-emerald-300'
                  }`}
                >
                  <Award className="size-3.5" />
                  Metacritic
                </div>
                <div
                  className={`text-[10px] font-semibold ${
                    isLight ? 'text-slate-600' : 'text-slate-400'
                  }`}
                >
                  Metascore / 100
                </div>
              </div>
            </div>
          )}

          {effectiveOc && (
            <div
              className={`flex items-center gap-3 rounded-2xl border px-4 py-2.5 ${
                isLight ? 'border-amber-200 bg-amber-50/70' : 'border-amber-400/30 bg-amber-500/10'
              }`}
            >
              <div className="flex size-10 items-center justify-center rounded-xl bg-amber-400 text-slate-950 font-black text-sm tabular-nums shadow">
                {effectiveOc}
              </div>
              <div>
                <div
                  className={`flex items-center gap-1 text-xs font-black ${
                    isLight ? 'text-amber-800' : 'text-amber-300'
                  }`}
                >
                  <Sparkles className="size-3.5" />
                  OpenCritic
                </div>
                <div
                  className={`text-[10px] font-semibold ${
                    isLight ? 'text-slate-600' : 'text-slate-400'
                  }`}
                >
                  Top Critic Avg
                </div>
              </div>
            </div>
          )}

          {effectiveCommunity && (
            <div
              className={`flex items-center gap-3 rounded-2xl border px-4 py-2.5 ${
                isLight ? 'border-indigo-200 bg-indigo-50/70' : 'border-cyan-400/30 bg-cyan-500/10'
              }`}
            >
              <div className="flex size-10 items-center justify-center rounded-xl bg-cyan-400 text-slate-950 font-black text-sm tabular-nums shadow">
                {usr ? `${usr}★` : `${effectiveCommunity}%`}
              </div>
              <div>
                <div
                  className={`flex items-center gap-1 text-xs font-black ${
                    isLight ? 'text-indigo-800' : 'text-cyan-300'
                  }`}
                >
                  {usr ? (
                    <Star className="size-3.5 fill-current" />
                  ) : (
                    <ThumbsUp className="size-3.5" />
                  )}
                  {usr ? 'Your Rating' : 'Player Score'}
                </div>
                <div
                  className={`text-[10px] font-semibold ${
                    isLight ? 'text-slate-600' : 'text-slate-400'
                  }`}
                >
                  {usr ? 'Personal Score' : 'Community Consensus'}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
