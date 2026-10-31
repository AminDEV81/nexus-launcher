import React, { useEffect, useMemo, useState } from 'react'
import {
  Award,
  Clock,
  Gamepad2,
  HardDrive,
  Trophy,
  Sparkles,
  Flame,
  Calendar,
  Compass,
  CheckCircle2,
} from 'lucide-react'
import { getStatsSummary, getPlaytimeByGenre, getRecentSessions } from '@/services/stats'
import type { StatsSummary, GenrePlaytime, RecentSession, Game } from '@/types/models'
import { formatPlaytime } from '@/features/library/utils/format'
import { calculateGamerLevel, calculateCircadianHabits } from '@/features/stats/utils/gamer-level'
import { evaluateMilestones } from '@/features/stats/utils/milestones'
import { useProfileStore } from '@/store/profile-store'
import { ProfileAvatarIcon } from '@/features/profiles/components/profile-avatar-icon'
import { useConsoleStore } from '../store/console-store'
import { CONSOLE_THEMES } from '../theme/tokens'
import { resolveConsoleHighResUrl } from '../ui/Tile'

export interface PassportViewProps {
  games?: Game[]
}

const TIER_STYLES: Record<string, { badge: string; border: string }> = {
  platinum: {
    badge: 'bg-cyan-400 text-slate-950',
    border: 'border-cyan-400/50 bg-cyan-500/15',
  },
  gold: {
    badge: 'bg-amber-400 text-slate-950',
    border: 'border-amber-400/50 bg-amber-500/15',
  },
  silver: {
    badge: 'bg-slate-200 text-slate-950',
    border: 'border-slate-300/40 bg-slate-400/15',
  },
  bronze: {
    badge: 'bg-orange-400 text-slate-950',
    border: 'border-orange-400/40 bg-orange-500/15',
  },
}

export const PassportView: React.FC<PassportViewProps> = ({ games = [] }) => {
  const themeId = useConsoleStore((s) => s.theme)
  const isLight = Boolean(CONSOLE_THEMES[themeId]?.isLight)
  const activeProfile = useProfileStore((s) => s.activeProfile)

  const [summary, setSummary] = useState<StatsSummary | null>(null)
  const [genres, setGenres] = useState<GenrePlaytime[]>([])
  const [sessions, setSessions] = useState<RecentSession[]>([])

  useEffect(() => {
    getStatsSummary().then(setSummary).catch(() => {})
    getPlaytimeByGenre().then(setGenres).catch(() => {})
    getRecentSessions().then(setSessions).catch(() => {})
  }, [])

  const levelInfo = useMemo(
    () => calculateGamerLevel(summary?.total_playtime_seconds ?? 0),
    [summary],
  )

  const circadian = useMemo(() => calculateCircadianHabits(sessions), [sessions])

  const milestones = useMemo(
    () =>
      evaluateMilestones({
        summary: summary ?? undefined,
        genres,
        sessions,
        streak: Math.min(7, sessions.length),
        games,
      }),
    [summary, genres, sessions, games],
  )

  const unlockedCount = milestones.filter((m) => m.unlocked).length
  const maxGenreSec = Math.max(1, ...(genres.map((g) => g.total_playtime_seconds) || [1]))
  const mostPlayedCover = resolveConsoleHighResUrl(summary?.most_played_game?.cover_path)

  return (
    <div className="space-y-7 pb-20">
      {/* Gamer Identity & XP Progression Hero Banner */}
      <div
        className={`relative overflow-hidden rounded-[2rem] border p-8 shadow-2xl ${
          isLight
            ? 'border-slate-300 bg-white'
            : 'border-white/15 bg-gradient-to-r from-[#111c38] via-[#0e1529] to-[#1a1136]'
        }`}
      >
        <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8">
          <div className="flex items-center gap-6">
            <div
              className="relative flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 bg-slate-950 shadow-2xl"
              style={{ borderColor: activeProfile?.color || '#00e5ff' }}
            >
              <ProfileAvatarIcon
                avatar={activeProfile?.avatar ?? undefined}
                className="size-12 text-white"
              />
              <span className="absolute -bottom-1 right-0 rounded-full bg-cyan-400 px-2.5 py-0.5 text-xs font-black text-slate-950 shadow">
                LVL {levelInfo.level}
              </span>
            </div>

            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-2 rounded-full bg-cyan-400/20 border border-cyan-400/40 px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-cyan-300">
                <Sparkles className="size-3.5" />
                {levelInfo.rankTitle} · Gamer Passport
              </div>
              <h1
                className={`text-3xl md:text-4xl font-black tracking-tight ${
                  isLight ? 'text-slate-900' : 'text-white'
                }`}
              >
                {activeProfile?.name || 'Nexus Player'}
              </h1>
              <p className={`text-xs font-semibold ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>
                {levelInfo.currentXp} / {levelInfo.xpForNextLevel} XP ({levelInfo.hoursToNextLevel}h
                to Level {levelInfo.level + 1})
              </p>

              <div className="mt-2 h-3 w-72 sm:w-96 overflow-hidden rounded-full bg-slate-800/80 p-0.5">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-sky-400 to-violet-500 transition-all duration-500"
                  style={{ width: `${levelInfo.progressPercent}%` }}
                />
              </div>
            </div>
          </div>

          {/* Key Stat Pills */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 w-full lg:w-auto">
            <div
              className={`rounded-2xl border p-4 ${
                isLight ? 'border-slate-200 bg-slate-50' : 'border-white/10 bg-white/[0.05]'
              }`}
            >
              <Clock className="size-5 text-cyan-400 mb-1.5" />
              <p className="text-[11px] font-bold uppercase text-slate-400">Playtime</p>
              <p className={`text-xl font-black ${isLight ? 'text-slate-900' : 'text-white'}`}>
                {formatPlaytime(summary?.total_playtime_seconds ?? 0)}
              </p>
            </div>

            <div
              className={`rounded-2xl border p-4 ${
                isLight ? 'border-slate-200 bg-slate-50' : 'border-white/10 bg-white/[0.05]'
              }`}
            >
              <Gamepad2 className="size-5 text-violet-400 mb-1.5" />
              <p className="text-[11px] font-bold uppercase text-slate-400">Library</p>
              <p className={`text-xl font-black ${isLight ? 'text-slate-900' : 'text-white'}`}>
                {summary?.total_games ?? games.length} Games
              </p>
            </div>

            <div
              className={`rounded-2xl border p-4 ${
                isLight ? 'border-slate-200 bg-slate-50' : 'border-white/10 bg-white/[0.05]'
              }`}
            >
              <HardDrive className="size-5 text-emerald-400 mb-1.5" />
              <p className="text-[11px] font-bold uppercase text-slate-400">Installed</p>
              <p className={`text-xl font-black ${isLight ? 'text-slate-900' : 'text-white'}`}>
                {summary?.installed_games ?? 0} Ready
              </p>
            </div>

            <div
              className={`rounded-2xl border p-4 ${
                isLight ? 'border-slate-200 bg-slate-50' : 'border-white/10 bg-white/[0.05]'
              }`}
            >
              <Trophy className="size-5 text-amber-400 mb-1.5" />
              <p className="text-[11px] font-bold uppercase text-slate-400">Trophies</p>
              <p className={`text-xl font-black ${isLight ? 'text-slate-900' : 'text-white'}`}>
                {unlockedCount} / {milestones.length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Two-Column Middle Row: Most Played Crown + Circadian Habits */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Most Played Crown */}
        <div
          className={`lg:col-span-6 rounded-3xl border p-6 flex items-center justify-between gap-5 ${
            isLight
              ? 'border-amber-300 bg-amber-50/70'
              : 'border-amber-400/35 bg-gradient-to-r from-amber-500/15 via-slate-900/80 to-slate-950'
          }`}
        >
          <div className="flex items-center gap-5 min-w-0">
            {mostPlayedCover ? (
              <img
                src={mostPlayedCover}
                alt=""
                className="h-28 w-20 shrink-0 rounded-2xl border border-amber-400/40 object-cover shadow-lg"
              />
            ) : (
              <div className="flex h-24 w-20 shrink-0 items-center justify-center rounded-2xl bg-amber-500/20 text-amber-400">
                <Trophy className="size-10" />
              </div>
            )}
            <div className="min-w-0">
              <span className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-widest text-amber-400">
                <Flame className="size-4" />
                Most Played Obsession
              </span>
              <h2
                className={`mt-1 truncate text-2xl font-black ${
                  isLight ? 'text-slate-900' : 'text-white'
                }`}
              >
                {summary?.most_played_game?.name || 'Play a game to crown your champion'}
              </h2>
              <p className="mt-1 text-base font-extrabold text-amber-400">
                {formatPlaytime(summary?.most_played_game?.total_playtime_seconds ?? 0)}
              </p>
            </div>
          </div>
        </div>

        {/* Circadian Persona & Time-of-Day Rhythm */}
        <div
          className={`lg:col-span-6 rounded-3xl border p-6 space-y-4 ${
            isLight ? 'border-slate-300 bg-white/90' : 'border-white/15 bg-white/[0.04]'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Compass className="size-5 text-cyan-400" />
              <div>
                <h2 className={`text-lg font-extrabold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  {circadian.dominantPersona.title}
                </h2>
                <p className="text-xs text-slate-400">{circadian.dominantPersona.description}</p>
              </div>
            </div>
            <span className="rounded-full bg-cyan-500/20 border border-cyan-400/30 px-3 py-1 text-xs font-extrabold text-cyan-300">
              {circadian.dominantPersona.tag}
            </span>
          </div>

          <div className="grid grid-cols-4 gap-2.5 pt-1">
            {circadian.buckets.map((b) => (
              <div
                key={b.id}
                className={`rounded-2xl border p-3 text-center ${
                  isLight ? 'border-slate-200 bg-slate-50' : 'border-white/10 bg-slate-950/60'
                }`}
              >
                <p className="text-[11px] font-bold text-slate-400">{b.label}</p>
                <p className={`mt-1 text-base font-black ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  {b.percentage}%
                </p>
                <p className="text-[10px] text-cyan-400 font-semibold">{b.hours}h</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Trophy Cabinet & Milestones */}
      <div
        className={`rounded-3xl border p-6 space-y-4 ${
          isLight ? 'border-slate-300 bg-white/90' : 'border-white/15 bg-white/[0.04]'
        }`}
      >
        <div className="flex items-center justify-between">
          <h2
            className={`flex items-center gap-2.5 text-xl font-extrabold ${
              isLight ? 'text-slate-900' : 'text-white'
            }`}
          >
            <Trophy className="size-5 text-amber-400" />
            Gamer Trophies & Milestones
          </h2>
          <span className="text-xs font-extrabold text-amber-400">
            {unlockedCount} Unlocked
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {milestones.slice(0, 12).map((m) => {
            const tierStyle = TIER_STYLES[m.tier] ?? TIER_STYLES.bronze
            return (
              <div
                key={m.id}
                className={`rounded-2xl border p-4 flex flex-col justify-between gap-3 transition-all ${
                  m.unlocked
                    ? tierStyle.border
                    : isLight
                      ? 'border-slate-200 bg-slate-100/70 opacity-65'
                      : 'border-white/10 bg-slate-950/50 opacity-60'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase ${tierStyle.badge}`}
                    >
                      {m.tier}
                    </span>
                    {m.unlocked && <CheckCircle2 className="size-4 text-emerald-400" />}
                  </div>
                  <h3
                    className={`mt-2.5 text-base font-black ${
                      isLight ? 'text-slate-900' : 'text-white'
                    }`}
                  >
                    {m.title}
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-400 line-clamp-2">{m.description}</p>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-bold">
                    <span className="text-cyan-400">{m.progressLabel}</span>
                    <span className="text-slate-400">{m.progressPercent}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/40">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-amber-400"
                      style={{ width: `${m.progressPercent}%` }}
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Bottom Two Columns: Genre Playtime Bars + Recent Sessions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div
          className={`lg:col-span-6 rounded-3xl border p-6 space-y-4 ${
            isLight ? 'border-slate-300 bg-white/90' : 'border-white/15 bg-white/[0.04]'
          }`}
        >
          <h2
            className={`flex items-center gap-2 text-lg font-extrabold ${
              isLight ? 'text-slate-900' : 'text-white'
            }`}
          >
            <Award className="size-5 text-cyan-400" />
            Genre Mastery Breakdown
          </h2>
          {genres.length === 0 ? (
            <p className="text-sm text-slate-400">Play games across genres to populate your breakdown.</p>
          ) : (
            <div className="space-y-3">
              {genres.slice(0, 6).map((g) => {
                const pct = Math.max(6, Math.round((g.total_playtime_seconds / maxGenreSec) * 100))
                return (
                  <div key={g.genre} className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className={isLight ? 'text-slate-800' : 'text-white'}>{g.genre}</span>
                      <span className="text-cyan-400">
                        {formatPlaytime(g.total_playtime_seconds)}
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div
          className={`lg:col-span-6 rounded-3xl border p-6 space-y-4 ${
            isLight ? 'border-slate-300 bg-white/90' : 'border-white/15 bg-white/[0.04]'
          }`}
        >
          <h2
            className={`flex items-center gap-2 text-lg font-extrabold ${
              isLight ? 'text-slate-900' : 'text-white'
            }`}
          >
            <Calendar className="size-5 text-violet-400" />
            Recent Gaming Sessions
          </h2>
          {sessions.length === 0 ? (
            <p className="text-sm text-slate-400">Your recent play sessions will appear here.</p>
          ) : (
            <div className="space-y-2.5">
              {sessions.slice(0, 5).map((s) => (
                <div
                  key={s.id}
                  className={`flex items-center justify-between rounded-2xl border p-3.5 text-xs ${
                    isLight ? 'border-slate-200 bg-slate-50' : 'border-white/10 bg-slate-950/60'
                  }`}
                >
                  <div className="min-w-0 pr-3">
                    <p className={`truncate font-extrabold text-sm ${isLight ? 'text-slate-900' : 'text-white'}`}>
                      {s.game_name}
                    </p>
                    <p className="text-slate-400 mt-0.5">{s.started_at}</p>
                  </div>
                  <span className="shrink-0 rounded-xl bg-cyan-500/20 px-3 py-1 font-extrabold text-cyan-300">
                    {formatPlaytime(s.duration_seconds ?? 0)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
