import React, { useEffect, useState } from 'react'
import { getStatsSummary, getPlaytimeByGenre } from '@/services/stats'
import type { StatsSummary, GenrePlaytime } from '@/types/models'
import { formatPlaytime } from '@/features/library/utils/format'

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <p className="text-[0.95rem] text-white/45">{label}</p>
    <p className="mt-1 text-[3.4rem] font-semibold leading-none tracking-tight text-white">
      {value}
    </p>
  </div>
)

export const PassportView: React.FC = () => {
  const [summary, setSummary] = useState<StatsSummary | null>(null)
  const [genres, setGenres] = useState<GenrePlaytime[]>([])

  useEffect(() => {
    getStatsSummary()
      .then(setSummary)
      .catch(() => {})
    getPlaytimeByGenre()
      .then((list) => setGenres(Array.isArray(list) ? list : []))
      .catch(() => {})
  }, [])

  const topGenres = genres.slice(0, 6)
  const maxSeconds = Math.max(1, ...topGenres.map((g) => g.total_playtime_seconds))

  return (
    <div className="flex flex-col gap-12 pb-16">
      <h1 className="px-6 pt-2 text-[2.6rem] font-semibold tracking-tight text-white">Passport</h1>

      <div className="flex flex-wrap gap-x-20 gap-y-8 px-6">
        <Stat label="Time played" value={formatPlaytime(summary?.total_playtime_seconds ?? 0)} />
        <Stat label="Games" value={String(summary?.total_games ?? 0)} />
        <Stat label="Installed" value={String(summary?.installed_games ?? 0)} />
      </div>

      {summary?.most_played_game && (
        <div className="px-6">
          <p className="text-[0.95rem] text-white/45">Most played</p>
          <p className="mt-1 text-[2rem] font-semibold text-white">
            {summary.most_played_game.name}
          </p>
          <p className="text-[1.05rem] text-white/50">
            {formatPlaytime(summary.most_played_game.total_playtime_seconds)}
          </p>
        </div>
      )}

      {topGenres.length > 0 && (
        <div className="flex max-w-[44rem] flex-col gap-5 px-6">
          <p className="text-[0.95rem] text-white/45">Top genres</p>
          {topGenres.map((g) => (
            <div key={g.genre} className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between text-[1.05rem]">
                <span className="font-medium text-white">{g.genre}</span>
                <span className="text-white/50">{formatPlaytime(g.total_playtime_seconds)}</span>
              </div>
              <div className="h-[0.3rem] overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-white/80"
                  style={{
                    width: `${Math.max(4, (g.total_playtime_seconds / maxSeconds) * 100)}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
