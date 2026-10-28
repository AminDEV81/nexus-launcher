import React, { useEffect, useState } from 'react'
import { Award, Clock, Gamepad2, HardDrive, Trophy } from 'lucide-react'
import { getStatsSummary, getPlaytimeByGenre } from '@/services/stats'
import type { StatsSummary, GenrePlaytime } from '@/types/models'
import { formatPlaytime } from '@/features/library/utils/format'

export const PassportView: React.FC = () => {
  const [summary, setSummary] = useState<StatsSummary | null>(null)
  const [genres, setGenres] = useState<GenrePlaytime[]>([])

  useEffect(() => {
    getStatsSummary().then(setSummary).catch(() => {})
    getPlaytimeByGenre().then(setGenres).catch(() => {})
  }, [])

  return (
    <div className="space-y-6 pb-16">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-6 rounded-3xl bg-white/5 border border-white/10 flex items-center gap-4">
          <div className="p-4 rounded-2xl bg-cyan-500/20 text-cyan-300">
            <Clock className="w-8 h-8" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Total Playtime
            </p>
            <p className="text-3xl font-black text-white mt-1">
              {formatPlaytime(summary?.total_playtime_seconds ?? 0)}
            </p>
          </div>
        </div>

        <div className="p-6 rounded-3xl bg-white/5 border border-white/10 flex items-center gap-4">
          <div className="p-4 rounded-2xl bg-violet-500/20 text-violet-300">
            <Gamepad2 className="w-8 h-8" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Total Library Titles
            </p>
            <p className="text-3xl font-black text-white mt-1">{summary?.total_games ?? 0}</p>
          </div>
        </div>

        <div className="p-6 rounded-3xl bg-white/5 border border-white/10 flex items-center gap-4">
          <div className="p-4 rounded-2xl bg-emerald-500/20 text-emerald-300">
            <HardDrive className="w-8 h-8" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Installed Ready
            </p>
            <p className="text-3xl font-black text-white mt-1">{summary?.installed_games ?? 0}</p>
          </div>
        </div>
      </div>

      {summary?.most_played_game && (
        <div className="p-6 rounded-3xl bg-gradient-to-r from-amber-500/15 via-slate-900/80 to-slate-950 border border-amber-400/30 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Trophy className="w-10 h-10 text-amber-400" />
            <div>
              <span className="text-xs font-extrabold uppercase tracking-widest text-amber-300">
                Most Played Crown
              </span>
              <h2 className="text-2xl font-black text-white mt-0.5">
                {summary.most_played_game.name}
              </h2>
            </div>
          </div>
          <span className="text-xl font-black text-amber-300">
            {formatPlaytime(summary.most_played_game.total_playtime_seconds)}
          </span>
        </div>
      )}

      <div className="p-6 rounded-3xl bg-white/5 border border-white/10 space-y-4">
        <h2 className="text-xl font-extrabold text-white flex items-center gap-2">
          <Award className="w-5 h-5 text-cyan-400" />
          Top Genres by Playtime
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {genres.slice(0, 8).map((g) => (
            <div
              key={g.genre}
              className="p-4 rounded-2xl bg-slate-900/70 border border-white/10 flex items-center justify-between"
            >
              <span className="font-bold text-white">{g.genre}</span>
              <span className="text-sm font-extrabold text-cyan-300">
                {formatPlaytime(g.total_playtime_seconds)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
