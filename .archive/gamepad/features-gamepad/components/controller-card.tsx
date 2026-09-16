import { useState } from 'react'
import {
  Gamepad2,
  CheckCircle2,
  Battery,
  BatteryCharging,
  Vibrate,
  Star,
  Activity,
} from 'lucide-react'
import type { GamepadInfo } from '../types/gamepad'
import { cn } from '@/lib/utils'
import { useGamepad } from '../hooks/use-gamepad'

interface ControllerCardProps {
  controller: GamepadInfo
  isPrimary: boolean
  isLastActive: boolean
}

export function ControllerCard({ controller, isPrimary, isLastActive }: ControllerCardProps) {
  const { setPrimary, rumble, settings } = useGamepad()
  const [isRumbling, setIsRumbling] = useState(false)

  const handleTestRumble = async () => {
    if (!controller.hasRumble || !settings.rumbleEnabled || isRumbling) return
    setIsRumbling(true)
    try {
      await rumble({ duration: 300, strongMagnitude: 0.7, weakMagnitude: 0.7 }, controller.index)
    } finally {
      setTimeout(() => setIsRumbling(false), 320)
    }
  }

  const typeBadgeColors: Record<string, string> = {
    dualsense: 'border-sky-500/30 bg-sky-500/10 text-sky-400',
    dualshock4: 'border-indigo-500/30 bg-indigo-500/10 text-indigo-400',
    xbox: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
    generic: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
    unknown: 'border-zinc-500/30 bg-zinc-500/10 text-zinc-400',
  }

  return (
    <div
      className={cn(
        'relative flex flex-col justify-between rounded-2xl border p-5 transition-all duration-200',
        isPrimary
          ? 'border-accent/40 bg-accent/5 shadow-[0_4px_24px_color-mix(in_srgb,var(--color-accent)_10%,transparent)]'
          : 'border-border/80 bg-surface/60 hover:border-border hover:bg-surface-raised/80',
      )}
    >
      {/* Header Info */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={cn(
              'flex size-11 shrink-0 items-center justify-center rounded-xl transition-colors',
              isPrimary ? 'bg-accent text-white' : 'bg-surface-raised text-subtle',
            )}
          >
            <Gamepad2 className="size-5.5" />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-sm font-semibold text-text">{controller.displayName}</h3>
              {isPrimary && (
                <span className="flex items-center gap-1 rounded-md bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold text-accent">
                  <Star className="size-2.5 fill-accent" /> PRIMARY
                </span>
              )}
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-subtle">
              <span
                className={cn(
                  'rounded-md border px-1.5 py-0.5 text-[11px] font-medium capitalize',
                  typeBadgeColors[controller.type] ?? typeBadgeColors.unknown,
                )}
              >
                {controller.type === 'dualsense'
                  ? 'DualSense (PS5)'
                  : controller.type === 'dualshock4'
                    ? 'DualShock 4 (PS4)'
                    : controller.type === 'xbox'
                      ? 'Xbox'
                      : controller.type}
              </span>

              <span>Port #{controller.index}</span>

              {controller.vendorId && controller.productId && (
                <span className="font-mono text-[10px] text-muted">
                  VID:{controller.vendorId} PID:{controller.productId}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Live Status Indicators */}
        <div className="flex shrink-0 items-center gap-2">
          {isLastActive && (
            <span
              className="flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-400"
              title="Currently receiving input"
            >
              <Activity className="size-3 animate-pulse" /> Active
            </span>
          )}

          {controller.battery && (
            <div className="flex items-center gap-1.5 rounded-md border border-border bg-surface-raised px-2.5 py-1 text-xs text-subtle">
              {controller.battery.isWired || controller.battery.status === 'wired' ? (
                <>
                  <BatteryCharging className="size-3 text-emerald-400" />
                  <span className="font-medium text-emerald-400">Wired</span>
                </>
              ) : controller.battery.charging || controller.battery.status === 'charging' ? (
                <>
                  <BatteryCharging className="size-3 text-emerald-400" />
                  <span className="font-mono">
                    {typeof controller.battery.level === 'number'
                      ? `${Math.round(controller.battery.level * 100)}%`
                      : 'Charging'}
                  </span>
                </>
              ) : typeof controller.battery.level === 'number' ? (
                <>
                  <Battery
                    className={cn(
                      'size-3',
                      controller.battery.level <= 0.2
                        ? 'text-rose-400'
                        : controller.battery.level <= 0.4
                          ? 'text-amber-400'
                          : 'text-emerald-400',
                    )}
                  />
                  <span className="font-mono">{Math.round(controller.battery.level * 100)}%</span>
                </>
              ) : (
                <>
                  <Battery className="size-3 text-muted" />
                  <span className="text-muted">—</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Action Footer */}
      <div className="mt-5 flex items-center justify-between border-t border-border/50 pt-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!controller.hasRumble || !settings.rumbleEnabled || isRumbling}
            onClick={handleTestRumble}
            className={cn(
              'flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-all',
              controller.hasRumble && settings.rumbleEnabled
                ? 'border-border bg-surface-raised text-text hover:border-accent/40 hover:bg-accent/10'
                : 'cursor-not-allowed border-transparent bg-surface text-muted/50',
            )}
            title={
              !controller.hasRumble
                ? 'Rumble unsupported by this device/driver'
                : !settings.rumbleEnabled
                  ? 'Vibration is disabled in settings'
                  : 'Test vibration motor'
            }
          >
            <Vibrate className={cn('size-3.5', isRumbling && 'animate-bounce text-accent')} />
            {isRumbling ? 'Vibrating...' : 'Test Rumble'}
          </button>
        </div>

        {!isPrimary && (
          <button
            type="button"
            onClick={() => setPrimary(controller.id)}
            className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-accent/40 hover:bg-accent/10 hover:text-text"
          >
            <CheckCircle2 className="size-3.5" /> Make Primary
          </button>
        )}
      </div>
    </div>
  )
}
