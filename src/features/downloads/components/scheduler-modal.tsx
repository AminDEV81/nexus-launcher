import { useState, useEffect } from 'react'
import { Modal } from '@/components/ui/modal'
import { Clock, Calendar, Power, Moon, Check } from 'lucide-react'
import { useSettings, useSetSetting } from '@/features/settings/hooks/use-settings'
import { cn } from '@/lib/utils'

interface SchedulerModalProps {
  open: boolean
  onClose: () => void
}

const DAYS = [
  { id: 0, label: 'Sun' },
  { id: 1, label: 'Mon' },
  { id: 2, label: 'Tue' },
  { id: 3, label: 'Wed' },
  { id: 4, label: 'Thu' },
  { id: 5, label: 'Fri' },
  { id: 6, label: 'Sat' },
]

export function SchedulerModal({ open, onClose }: SchedulerModalProps) {
  const { data: settings } = useSettings()
  const setSetting = useSetSetting()

  const [enabled, setEnabled] = useState(false)
  const [startTime, setStartTime] = useState('02:00')
  const [endTime, setEndTime] = useState('07:00')
  const [selectedDays, setSelectedDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6])
  const [autoShutdown, setAutoShutdown] = useState(false)
  const [action, setAction] = useState<'shutdown' | 'sleep'>('shutdown')

  useEffect(() => {
    if (settings) {
      setEnabled(settings.download_scheduler_enabled === 'true')
      setStartTime(settings.download_scheduler_start_time || '02:00')
      setEndTime(settings.download_scheduler_end_time || '07:00')
      setAutoShutdown(settings.download_scheduler_auto_shutdown === 'true')
      setAction((settings.download_scheduler_action as 'shutdown' | 'sleep') || 'shutdown')
      try {
        if (settings.download_scheduler_days) {
          setSelectedDays(JSON.parse(settings.download_scheduler_days))
        }
      } catch {
        setSelectedDays([0, 1, 2, 3, 4, 5, 6])
      }
    }
  }, [settings])

  function handleSave() {
    setSetting.mutate({ key: 'download_scheduler_enabled', value: String(enabled) })
    setSetting.mutate({ key: 'download_scheduler_start_time', value: startTime })
    setSetting.mutate({ key: 'download_scheduler_end_time', value: endTime })
    setSetting.mutate({ key: 'download_scheduler_days', value: JSON.stringify(selectedDays) })
    setSetting.mutate({ key: 'download_scheduler_auto_shutdown', value: String(autoShutdown) })
    setSetting.mutate({ key: 'download_scheduler_action', value: action })
    onClose()
  }

  function toggleDay(day: number) {
    if (selectedDays.includes(day)) {
      if (selectedDays.length > 1) {
        setSelectedDays(selectedDays.filter((d) => d !== day))
      }
    } else {
      setSelectedDays([...selectedDays, day])
    }
  }

  return (
    <Modal open={open} onClose={onClose} widthClassName="max-w-lg">
      <div className="p-6">
        {/* Header Hero Card with Sleek Toggle Switch */}
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-border/80 bg-surface/70 p-4 shadow-sm">
          <div className="flex items-center gap-3.5">
            <div
              className={cn(
                'flex size-12 shrink-0 items-center justify-center rounded-2xl transition-all shadow-inner',
                enabled
                  ? 'bg-accent text-white shadow-accent/25 ring-2 ring-accent/40'
                  : 'bg-surface-raised text-subtle ring-1 ring-border',
              )}
            >
              <Clock className="size-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-text">Smart Scheduler</h3>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide transition-all',
                    enabled
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                      : 'bg-subtle/15 text-subtle border border-border',
                  )}
                >
                  {enabled ? 'Active' : 'Disabled'}
                </span>
              </div>
              <p className="text-xs text-subtle">Automate night downloads & power actions</p>
            </div>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={() => setEnabled(!enabled)}
            className={cn(
              'relative inline-flex h-7 w-13 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-300 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-accent self-end sm:self-center',
              enabled ? 'bg-accent shadow-md shadow-accent/30' : 'bg-surface-raised border-border',
            )}
          >
            <span
              className={cn(
                'pointer-events-none inline-block size-6 transform rounded-full bg-white shadow-md ring-0 transition duration-300 ease-in-out',
                enabled ? 'translate-x-6' : 'translate-x-0',
              )}
            />
          </button>
        </div>

        <div className={cn('flex flex-col gap-4 transition-opacity', !enabled && 'opacity-60')}>
          {/* Active Hours Range */}
          <div className="rounded-2xl border border-border/80 bg-surface/60 p-4">
            <div className="mb-3 flex items-center gap-2 text-xs font-bold text-text">
              <Clock className="size-4 text-accent" />
              <span>Active Download Time Window</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-subtle">
                  Start Time (From)
                </label>
                <input
                  type="time"
                  disabled={!enabled}
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full rounded-xl border border-border bg-bg/80 px-3 py-2 text-sm font-mono font-bold text-text focus:border-accent focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold text-subtle">
                  End Time (Until)
                </label>
                <input
                  type="time"
                  disabled={!enabled}
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full rounded-xl border border-border bg-bg/80 px-3 py-2 text-sm font-mono font-bold text-text focus:border-accent focus:outline-none"
                />
              </div>
            </div>
            <p className="mt-2 text-[11px] text-muted">
              Downloads will automatically resume at{' '}
              <strong className="text-accent">{startTime}</strong> and pause at{' '}
              <strong className="text-accent">{endTime}</strong>.
            </p>
          </div>

          {/* Active Days */}
          <div className="rounded-2xl border border-border/80 bg-surface/60 p-4">
            <div className="mb-2.5 flex items-center gap-2 text-xs font-bold text-text">
              <Calendar className="size-4 text-accent" />
              <span>Schedule Days</span>
            </div>

            <div className="flex items-center gap-1.5">
              {DAYS.map((d) => {
                const active = selectedDays.includes(d.id)
                return (
                  <button
                    key={d.id}
                    type="button"
                    disabled={!enabled}
                    onClick={() => toggleDay(d.id)}
                    className={cn(
                      'flex-1 rounded-xl py-2 text-xs font-bold transition-all',
                      active
                        ? 'bg-accent text-white shadow-sm shadow-accent/25'
                        : 'border border-border bg-surface text-subtle hover:text-text',
                    )}
                  >
                    {d.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Post-Schedule Action */}
          <div className="rounded-2xl border border-border/80 bg-surface/60 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-text">
                <Power className="size-4 text-accent" />
                <span>Auto Power Action upon Queue Completion</span>
              </div>

              <input
                type="checkbox"
                disabled={!enabled}
                checked={autoShutdown}
                onChange={(e) => setAutoShutdown(e.target.checked)}
                className="size-4 rounded border-border accent-accent cursor-pointer"
              />
            </div>

            {autoShutdown && (
              <div className="mt-3 flex items-center gap-2 pt-2 border-t border-border/50">
                <button
                  type="button"
                  onClick={() => setAction('shutdown')}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-2 rounded-xl py-2 text-xs font-bold transition-all',
                    action === 'shutdown'
                      ? 'bg-red-500/20 text-red-400 border border-red-500/40 shadow-sm'
                      : 'border border-border bg-surface text-subtle hover:text-text',
                  )}
                >
                  <Power className="size-3.5" />
                  <span>Shutdown PC</span>
                </button>

                <button
                  type="button"
                  onClick={() => setAction('sleep')}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-2 rounded-xl py-2 text-xs font-bold transition-all',
                    action === 'sleep'
                      ? 'bg-accent/20 text-accent border border-accent/40 shadow-sm'
                      : 'border border-border bg-surface text-subtle hover:text-text',
                  )}
                >
                  <Moon className="size-3.5" />
                  <span>Sleep Mode</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Action Footer */}
        <div className="mt-6 flex items-center justify-end gap-2.5 border-t border-border/70 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border bg-surface px-4 py-2 text-xs font-semibold text-subtle transition-colors hover:bg-surface-raised hover:text-text"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex items-center gap-1.5 rounded-xl bg-accent px-5 py-2 text-xs font-bold text-white shadow-lg shadow-accent/20 transition-all hover:bg-accent-hover active:scale-95"
          >
            <Check className="size-4" />
            <span>Save Scheduler</span>
          </button>
        </div>
      </div>
    </Modal>
  )
}
