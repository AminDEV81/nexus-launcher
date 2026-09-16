import { useNavigate } from 'react-router-dom'
import { Gamepad2, Play, Clock } from 'lucide-react'
import { useUiStore } from '@/store/ui-store'
import { assetUrl } from '@/lib/asset-url'
import { formatPlaytime, parseStoredUtcDate } from '@/features/library/utils/format'
import type { RecentSession } from '@/types/models'

function describeWhen(startedAt: string): string {
  const start = parseStoredUtcDate(startedAt)
  if (!start) return startedAt

  const now = new Date()
  const dayOf = (value: Date) => Date.UTC(value.getFullYear(), value.getMonth(), value.getDate())
  const dayDiff = Math.floor((dayOf(now) - dayOf(start)) / 86_400_000)

  const time = start.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  if (dayDiff <= 0) return `Today at ${time}`
  if (dayDiff === 1) return `Yesterday at ${time}`
  return `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} at ${time}`
}

function describeRange(session: RecentSession): string | null {
  const start = parseStoredUtcDate(session.started_at)
  const end = session.ended_at ? parseStoredUtcDate(session.ended_at) : null
  if (!start || !end) return null
  return `${start.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })} – ${end.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`
}

export function RecentSessions({ sessions }: { sessions: RecentSession[] }) {
  const navigate = useNavigate()
  const selectGame = useUiStore((s) => s.selectGame)

  if (sessions.length === 0) {
    return (
      <div className="mt-4 flex h-44 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/80 bg-surface/40 p-6 text-center">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-accent/10 text-accent shadow-xs">
          <Play className="size-5" />
        </span>
        <div>
          <div className="text-sm font-bold text-text">No Play Sessions Recorded Yet</div>
          <div className="mt-1 max-w-sm text-xs text-muted">
            Launch any game from your library to start logging precise session start times,
            durations, and rhythm telemetry.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      {sessions.map((session) => {
        const cover = assetUrl(session.cover_path)
        const range = describeRange(session)
        const isLive = !session.ended_at

        return (
          <button
            key={session.id}
            type="button"
            onClick={() => {
              selectGame(session.game_id)
              navigate('/')
            }}
            className="group flex items-center gap-3.5 rounded-2xl border border-border/80 bg-surface/60 p-3 text-left shadow-xs transition-all duration-200 hover:border-accent/50 hover:bg-surface-raised hover:shadow-md hover:shadow-accent/5 active:scale-[0.99]"
          >
            {/* Game Cover Poster Thumbnail */}
            <span className="relative flex h-16 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/80 bg-surface shadow-xs transition-transform duration-200 group-hover:scale-105">
              {cover ? (
                <img src={cover} alt="" className="size-full object-cover" />
              ) : (
                <Gamepad2 className="size-5 text-accent" />
              )}
            </span>

            {/* Session Info */}
            <div className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold text-text transition-colors group-hover:text-accent">
                {session.game_name}
              </span>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-subtle">
                <Clock className="size-3 shrink-0 text-accent/70" />
                <span className="truncate">{describeWhen(session.started_at)}</span>
              </div>
              {range && (
                <div className="mt-0.5 truncate font-mono text-[10px] text-subtle/80">{range}</div>
              )}
            </div>

            {/* Duration / Live Badge */}
            {isLive ? (
              <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-mono text-[10px] font-bold text-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.3)]">
                <span className="size-1.5 animate-ping rounded-full bg-emerald-400" />
                <span>LIVE NOW</span>
              </span>
            ) : (
              <span className="shrink-0 rounded-xl border border-border/80 bg-surface px-2.5 py-1 font-mono text-[11px] font-bold text-text shadow-xs">
                {session.duration_seconds && session.duration_seconds > 0
                  ? formatPlaytime(session.duration_seconds)
                  : '< 1 min'}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
