import { formatDateKey, formatPlaytime } from '@/features/library/utils/format'
import type { DailyActivity } from '@/types/models'
import { cn } from '@/lib/utils'

const CELL = 13
const GAP = 3.5
const WEEKDAY_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', ''] as const

function mondayFirstWeekday(dateKey: string): number {
  const [year, month, day] = dateKey.split('-').map(Number)
  return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7
}

interface HeatCell {
  date: string
  seconds: number
  blank?: boolean
}

function intensityStyle(seconds: number, maxSeconds: number) {
  if (seconds <= 0) {
    return 'bg-surface-raised/80 hover:bg-surface-raised border border-transparent'
  }
  const ratio = seconds / maxSeconds
  if (ratio <= 0.25) {
    return 'bg-accent/25 hover:bg-accent/40 border border-accent/20'
  }
  if (ratio <= 0.5) {
    return 'bg-accent/50 hover:bg-accent/65 border border-accent/40'
  }
  if (ratio <= 0.75) {
    return 'bg-accent/80 hover:bg-accent border border-accent/60 shadow-xs'
  }
  return 'bg-accent hover:brightness-110 border border-white/20 shadow-[0_0_8px_var(--nx-accent)]'
}

export function ActivityHeatmap({ data }: { data: DailyActivity[] }) {
  const maxSeconds = Math.max(...data.map((day) => day.total_playtime_seconds), 0)
  const activeDays = data.filter((day) => day.total_playtime_seconds > 0).length

  const weeks: HeatCell[][] = []
  for (const day of data) {
    const weekday = mondayFirstWeekday(day.date)
    const lastWeek = weeks[weeks.length - 1]
    if (!lastWeek || (weekday === 0 && lastWeek.length >= 7)) {
      weeks.push([])
    }
    const target = weeks[weeks.length - 1]
    if (target.length === 0 && weekday > 0) {
      for (let i = 0; i < weekday; i += 1) target.push({ date: '', seconds: 0, blank: true })
    }
    target.push({
      date: day.date,
      seconds: day.total_playtime_seconds,
    })
  }

  while (weeks.length > 0 && weeks[weeks.length - 1].length < 7) {
    weeks[weeks.length - 1].push({ date: '', seconds: 0, blank: true })
  }

  const monthLabels = weeks.map((week, index) => {
    const firstOfMonth = week.find((cell) => !cell.blank && cell.date.endsWith('-01'))
    if (!firstOfMonth) return null
    return (
      <span
        key={index}
        className="font-mono text-[10px] font-bold text-subtle"
        style={{ gridColumn: `${index + 1} / span 3` }}
      >
        {formatDateKey(firstOfMonth.date, { month: 'short' })}
      </span>
    )
  })

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2.5 overflow-x-auto pb-1">
        {/* Weekday labels */}
        <div
          className="grid shrink-0 pt-4"
          style={{ gridTemplateRows: `repeat(7, ${CELL}px)`, rowGap: `${GAP}px` }}
        >
          {WEEKDAY_LABELS.map((label, index) => (
            <span
              key={index}
              className="flex items-center font-mono text-[9px] font-semibold leading-none text-subtle"
            >
              {label}
            </span>
          ))}
        </div>

        {/* Heatmap Grid */}
        <div className="min-w-0 flex-1">
          <div
            className="mb-1.5 grid"
            style={{
              gridAutoFlow: 'column',
              gridAutoColumns: `${CELL}px`,
              columnGap: `${GAP}px`,
              gridTemplateRows: '14px',
              height: '14px',
            }}
          >
            {monthLabels}
          </div>

          <div
            className="grid"
            style={{
              gridAutoFlow: 'column',
              gridTemplateRows: `repeat(7, ${CELL}px)`,
              gridAutoColumns: `${CELL}px`,
              columnGap: `${GAP}px`,
              rowGap: `${GAP}px`,
            }}
          >
            {weeks.flatMap((week, weekIndex) =>
              week.map((cell, dayIndex) => {
                const key = `${weekIndex}-${dayIndex}`
                if (cell.blank) return <span key={key} />

                const formattedTitle = `${formatDateKey(cell.date, {
                  weekday: 'short',
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })} • ${formatPlaytime(cell.seconds)}`

                return (
                  <span
                    key={key}
                    title={formattedTitle}
                    className={cn(
                      'block cursor-pointer rounded-[4px] transition-all duration-150 hover:scale-125 hover:z-10',
                      intensityStyle(cell.seconds, maxSeconds),
                    )}
                    style={{ width: CELL, height: CELL }}
                  />
                )
              }),
            )}
          </div>
        </div>
      </div>

      {/* Legend & Summary Footer */}
      <div className="flex items-center justify-between border-t border-border/40 pt-2.5 font-mono text-[10px] text-subtle">
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-text">{activeDays}</span>
          <span>active gaming days in last 13 weeks</span>
        </div>

        <div className="flex items-center gap-1.5">
          <span>Less</span>
          <span className="size-2.5 rounded-[3px] bg-surface-raised" />
          <span className="size-2.5 rounded-[3px] bg-accent/25" />
          <span className="size-2.5 rounded-[3px] bg-accent/50" />
          <span className="size-2.5 rounded-[3px] bg-accent/80" />
          <span className="size-2.5 rounded-[3px] bg-accent shadow-[0_0_6px_var(--nx-accent)]" />
          <span>More</span>
        </div>
      </div>
    </div>
  )
}
