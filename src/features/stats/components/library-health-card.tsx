import { Bookmark } from 'lucide-react'
import type { StatsSummary, RecentSession } from '@/types/models'
import { formatPlaytime } from '@/features/library/utils/format'

interface LibraryHealthCardProps {
  summary: StatsSummary | undefined
  sessions: RecentSession[] | undefined
  playedCount: number
}

export function LibraryHealthCard({ summary, sessions, playedCount }: LibraryHealthCardProps) {
  const total = summary?.total_games ?? 0
  const installed = summary?.installed_games ?? 0
  const unplayed = Math.max(0, total - playedCount)
  const engagementRate = total > 0 ? Math.round((playedCount / total) * 100) : 0

  // Calculate average session length
  const validSessions = (sessions ?? []).filter((s) => s.duration_seconds && s.duration_seconds > 0)
  const totalSessionSeconds = validSessions.reduce((sum, s) => sum + (s.duration_seconds ?? 0), 0)
  const avgSessionSeconds =
    validSessions.length > 0 ? Math.round(totalSessionSeconds / validSessions.length) : 0

  return (
    <div className="flex flex-col justify-between rounded-3xl border border-border/80 bg-surface/70 p-6 shadow-card">
      <div>
        <div className="flex items-center justify-between border-b border-border/60 pb-3.5">
          <div className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-widest text-accent">
            <Bookmark className="size-3.5" />
            <span>LIBRARY ENGAGEMENT METRICS</span>
          </div>
          <span className="rounded-full border border-accent/40 bg-accent/10 px-2.5 py-0.5 font-mono text-[10px] font-bold text-accent">
            {engagementRate}% Engaged
          </span>
        </div>

        {/* Progress Bar of Played vs Unplayed Backlog */}
        <div className="mt-4">
          <div className="flex items-center justify-between font-mono text-xs font-bold">
            <span className="text-text">Backlog Completion Rate</span>
            <span className="text-accent">
              {playedCount} / {total} Games Played
            </span>
          </div>

          <div className="mt-2 flex h-2.5 w-full overflow-hidden rounded-full bg-surface-raised ring-1 ring-inset ring-black/10">
            <div
              className="h-full bg-accent shadow-[0_0_8px_var(--nx-accent)] transition-all duration-500"
              style={{ width: `${engagementRate}%` }}
              title={`Played: ${playedCount} games`}
            />
          </div>

          <div className="mt-2 flex items-center justify-between text-[10px] font-mono text-subtle">
            <div className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-accent" />
              <span>Explored ({playedCount})</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-surface-raised" />
              <span>Unplayed Backlog ({unplayed})</span>
            </div>
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="mt-5 grid grid-cols-3 gap-2.5 border-t border-border/40 pt-4">
        <div className="rounded-2xl border border-border/60 bg-surface/60 p-2.5 text-center">
          <span className="block font-mono text-[9px] font-bold uppercase text-subtle">
            Installed
          </span>
          <span className="mt-0.5 block font-mono text-base font-black text-text">{installed}</span>
          <span className="text-[9px] text-muted">Ready to play</span>
        </div>

        <div className="rounded-2xl border border-border/60 bg-surface/60 p-2.5 text-center">
          <span className="block font-mono text-[9px] font-bold uppercase text-subtle">
            Avg Session
          </span>
          <span className="mt-0.5 block font-mono text-base font-black text-accent">
            {avgSessionSeconds > 0 ? formatPlaytime(avgSessionSeconds) : '—'}
          </span>
          <span className="text-[9px] text-muted">Typical duration</span>
        </div>

        <div className="rounded-2xl border border-border/60 bg-surface/60 p-2.5 text-center">
          <span className="block font-mono text-[9px] font-bold uppercase text-subtle">
            Backlog
          </span>
          <span className="mt-0.5 block font-mono text-base font-black text-amber-400">
            {unplayed}
          </span>
          <span className="text-[9px] text-muted">Awaiting start</span>
        </div>
      </div>
    </div>
  )
}
