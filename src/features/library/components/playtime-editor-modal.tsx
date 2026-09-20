import { useEffect, useState } from 'react'
import { Clock, RotateCcw, Plus, Calendar, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { useSetGamePlaytime } from '../hooks/use-games'
import { formatPlaytime } from '../utils/format'
import { cn } from '@/lib/utils'
import type { Game } from '@/types/models'

interface PlaytimeEditorModalProps {
  game: Game | null
  open: boolean
  onClose: () => void
}

export function PlaytimeEditorModal({ game, open, onClose }: PlaytimeEditorModalProps) {
  const [hours, setHours] = useState<number>(0)
  const [minutes, setMinutes] = useState<number>(0)
  const [daysSpan, setDaysSpan] = useState<number>(30)
  const setPlaytime = useSetGamePlaytime()

  const currentTotal = game?.total_playtime_seconds || 0

  useEffect(() => {
    if (game && open) {
      const totalSec = game.total_playtime_seconds || 0
      const h = Math.floor(totalSec / 3600)
      const m = Math.floor((totalSec % 3600) / 60)
      setHours(h)
      setMinutes(m)
      const initialMin = totalSec > 0 ? Math.max(1, Math.ceil(totalSec / (12 * 3600))) : 1
      setDaysSpan(Math.max(30, initialMin))
    }
  }, [game, open])

  if (!game) return null

  const computedSeconds = Math.max(0, hours * 3600 + minutes * 60)
  const diffSeconds = computedSeconds - currentTotal
  const activeSeconds = diffSeconds > 0 ? diffSeconds : computedSeconds
  const activeHours = activeSeconds / 3600

  // Max 12 hours allowed per day in stats
  const minDays = activeSeconds > 0 ? Math.max(1, Math.ceil(activeSeconds / (12 * 3600))) : 1
  const isInvalidDays = activeSeconds > 0 && daysSpan < minDays
  const avgHoursPerDay = daysSpan > 0 && activeSeconds > 0 ? activeHours / daysSpan : 0

  const handleHoursChange = (newHours: number) => {
    setHours(newHours)
    const newComputed = Math.max(0, newHours * 3600 + minutes * 60)
    const neededSec = newComputed - currentTotal > 0 ? newComputed - currentTotal : newComputed
    if (neededSec > 0) {
      const neededMin = Math.max(1, Math.ceil(neededSec / (12 * 3600)))
      setDaysSpan((prev) => Math.max(neededMin, prev))
    }
  }

  const handleMinutesChange = (newMinutes: number) => {
    setMinutes(newMinutes)
    const newComputed = Math.max(0, hours * 3600 + newMinutes * 60)
    const neededSec = newComputed - currentTotal > 0 ? newComputed - currentTotal : newComputed
    if (neededSec > 0) {
      const neededMin = Math.max(1, Math.ceil(neededSec / (12 * 3600)))
      setDaysSpan((prev) => Math.max(neededMin, prev))
    }
  }

  async function handleSave() {
    if (!game || isInvalidDays) return
    await setPlaytime.mutateAsync({
      id: game.id,
      totalSeconds: computedSeconds,
      daysSpan: daysSpan > 0 ? daysSpan : undefined,
    })
    onClose()
  }

  function addHours(amount: number) {
    handleHoursChange(Math.max(0, hours + amount))
  }

  return (
    <Modal open={open} onClose={onClose} widthClassName="max-w-md">
      <div className="p-6">
        {/* Header */}
        <div className="mb-5 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-500/10 text-cyan-400">
            <Clock className="size-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-black tracking-tight text-text">Edit Playtime</h2>
            <p className="truncate text-xs font-medium text-subtle">{game.name}</p>
          </div>
        </div>

        {/* Inputs */}
        <div className="mb-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="playtime-hours" className="mb-1.5 block text-xs font-bold text-muted">
                Hours
              </label>
              <input
                id="playtime-hours"
                type="number"
                min="0"
                value={hours}
                onChange={(e) => handleHoursChange(Math.max(0, parseInt(e.target.value, 10) || 0))}
                className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 font-mono text-sm font-bold text-text transition-colors focus:border-accent focus:outline-hidden"
              />
            </div>
            <div>
              <label
                htmlFor="playtime-minutes"
                className="mb-1.5 block text-xs font-bold text-muted"
              >
                Minutes
              </label>
              <input
                id="playtime-minutes"
                type="number"
                min="0"
                max="59"
                value={minutes}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10) || 0
                  handleMinutesChange(Math.max(0, Math.min(59, val)))
                }}
                className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 font-mono text-sm font-bold text-text transition-colors focus:border-accent focus:outline-hidden"
              />
            </div>
          </div>

          {/* Quick Add Presets */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => addHours(1)}
              className="flex items-center gap-1 rounded-lg border border-border/80 bg-surface/60 px-2.5 py-1 text-xs font-bold text-muted transition-colors hover:border-border hover:bg-surface-raised hover:text-text cursor-pointer"
            >
              <Plus className="size-3" />
              1h
            </button>
            <button
              type="button"
              onClick={() => addHours(5)}
              className="flex items-center gap-1 rounded-lg border border-border/80 bg-surface/60 px-2.5 py-1 text-xs font-bold text-muted transition-colors hover:border-border hover:bg-surface-raised hover:text-text cursor-pointer"
            >
              <Plus className="size-3" />
              5h
            </button>
            <button
              type="button"
              onClick={() => addHours(10)}
              className="flex items-center gap-1 rounded-lg border border-border/80 bg-surface/60 px-2.5 py-1 text-xs font-bold text-muted transition-colors hover:border-border hover:bg-surface-raised hover:text-text cursor-pointer"
            >
              <Plus className="size-3" />
              10h
            </button>
            <button
              type="button"
              onClick={() => {
                setHours(0)
                setMinutes(0)
              }}
              className="ml-auto flex items-center gap-1 rounded-lg border border-red-500/20 bg-red-500/10 px-2.5 py-1 text-xs font-bold text-red-400 transition-colors hover:bg-red-500/20 cursor-pointer"
            >
              <RotateCcw className="size-3" />
              Reset to 0
            </button>
          </div>

          {/* Timeframe Distribution (Visible by default) */}
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5 text-xs">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-bold text-amber-300">
                <Calendar className="size-3.5 text-amber-400" />
                <span>Timeframe Distribution</span>
              </div>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[10px] font-bold',
                  isInvalidDays
                    ? 'border border-red-500/40 bg-red-500/10 text-red-300'
                    : 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
                )}
              >
                {isInvalidDays ? (
                  <span>Exceeds 12h/day</span>
                ) : (
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="size-2.5" />~{avgHoursPerDay.toFixed(1)}h / day avg
                  </span>
                )}
              </span>
            </div>

            <p className="mb-2.5 text-[11px] leading-relaxed text-subtle">
              Spread over past days with a natural fluctuating curve (≥20% day-to-day variance). No
              single day can exceed <strong>12 hours</strong> in your Stats chart.
            </p>

            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <label
                    htmlFor="playtime-days-span"
                    className="mb-1 block text-[10px] font-bold text-muted"
                  >
                    Spread over past days (Min: {minDays} {minDays === 1 ? 'day' : 'days'})
                  </label>
                  <input
                    id="playtime-days-span"
                    type="number"
                    min="1"
                    value={daysSpan}
                    onChange={(e) => setDaysSpan(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className={cn(
                      'w-full rounded-xl border bg-surface px-3 py-1.5 font-mono text-xs font-bold text-text transition-colors focus:outline-hidden',
                      isInvalidDays
                        ? 'border-red-500/80 focus:border-red-500'
                        : 'border-border focus:border-amber-400',
                    )}
                  />
                </div>
              </div>

              {/* Quick Presets */}
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setDaysSpan(minDays)}
                  className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] font-bold text-amber-300 hover:bg-amber-500/20 cursor-pointer"
                  title={`Fastest distribution (${minDays} days)`}
                >
                  {minDays}d (Max 12h/d)
                </button>
                {minDays <= 7 && (
                  <button
                    type="button"
                    onClick={() => setDaysSpan(7)}
                    className={cn(
                      'rounded-lg border px-2 py-1 text-[10px] font-bold cursor-pointer transition-colors',
                      daysSpan === 7
                        ? 'border-amber-400 bg-amber-500/20 text-amber-300'
                        : 'border-border bg-surface text-muted hover:text-text',
                    )}
                  >
                    7d
                  </button>
                )}
                {minDays <= 30 && (
                  <button
                    type="button"
                    onClick={() => setDaysSpan(30)}
                    className={cn(
                      'rounded-lg border px-2 py-1 text-[10px] font-bold cursor-pointer transition-colors',
                      daysSpan === 30
                        ? 'border-amber-400 bg-amber-500/20 text-amber-300'
                        : 'border-border bg-surface text-muted hover:text-text',
                    )}
                  >
                    30d
                  </button>
                )}
                {minDays <= 60 && (
                  <button
                    type="button"
                    onClick={() => setDaysSpan(60)}
                    className={cn(
                      'rounded-lg border px-2 py-1 text-[10px] font-bold cursor-pointer transition-colors',
                      daysSpan === 60
                        ? 'border-amber-400 bg-amber-500/20 text-amber-300'
                        : 'border-border bg-surface text-muted hover:text-text',
                    )}
                  >
                    60d
                  </button>
                )}
                {minDays <= 100 && (
                  <button
                    type="button"
                    onClick={() => setDaysSpan(100)}
                    className={cn(
                      'rounded-lg border px-2 py-1 text-[10px] font-bold cursor-pointer transition-colors',
                      daysSpan === 100
                        ? 'border-amber-400 bg-amber-500/20 text-amber-300'
                        : 'border-border bg-surface text-muted hover:text-text',
                    )}
                  >
                    100d
                  </button>
                )}
              </div>

              {/* Validation Warning */}
              {isInvalidDays && (
                <div className="mt-1 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-[11px] text-red-300">
                  <AlertTriangle className="size-3.5 shrink-0 text-red-400" />
                  <span>
                    Cannot allocate {activeHours.toFixed(1)}h over {daysSpan} day
                    {daysSpan === 1 ? '' : 's'} (avg {avgHoursPerDay.toFixed(1)}h/day). Daily cap is
                    12 hours. Please specify at least <strong>{minDays} days</strong>.
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Preview banner */}
          <div className="rounded-xl border border-border/70 bg-surface-raised/60 p-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-subtle">Recorded Playtime:</span>
              <span className="font-mono font-bold text-cyan-400">
                {formatPlaytime(computedSeconds)}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between text-[11px] text-subtle">
              <span>Change from current:</span>
              <span
                className={cn(
                  'font-mono font-bold',
                  diffSeconds > 0
                    ? 'text-emerald-400'
                    : diffSeconds < 0
                      ? 'text-red-400'
                      : 'text-subtle',
                )}
              >
                {diffSeconds > 0
                  ? `+${formatPlaytime(diffSeconds)}`
                  : diffSeconds < 0
                    ? `-${formatPlaytime(-diffSeconds)}`
                    : 'No change'}
              </span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border px-4 py-2 text-xs font-bold text-muted transition-colors hover:bg-surface-raised hover:text-text cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={setPlaytime.isPending || isInvalidDays}
            className="rounded-xl bg-accent px-4 py-2 text-xs font-bold text-white shadow-md shadow-accent/20 transition-all hover:brightness-110 active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            {setPlaytime.isPending ? 'Saving...' : 'Save Playtime'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
