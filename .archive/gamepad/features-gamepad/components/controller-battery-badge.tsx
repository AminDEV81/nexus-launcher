import {
  Gamepad2,
  Battery,
  BatteryCharging,
  BatteryLow,
  BatteryMedium,
  BatteryWarning,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useGamepad } from '../hooks/use-gamepad'
import { cn } from '@/lib/utils'

export function ControllerBatteryBadge() {
  const navigate = useNavigate()
  const { controllers, primaryController } = useGamepad()

  if (controllers.length === 0 || !primaryController) {
    return null
  }

  const battery = primaryController.battery
  const level = battery?.level ?? null
  const percent = typeof level === 'number' ? Math.round(level * 100) : null

  const getBatteryIcon = () => {
    if (battery?.charging || battery?.status === 'charging' || battery?.isWired) {
      return <BatteryCharging className="size-3 text-emerald-400" />
    }
    if (percent === null) {
      return <Battery className="size-3 text-subtle" />
    }
    if (percent <= 15) {
      return <BatteryWarning className="size-3 text-rose-400 animate-pulse" />
    }
    if (percent <= 35) {
      return <BatteryLow className="size-3 text-amber-400" />
    }
    if (percent <= 75) {
      return <BatteryMedium className="size-3 text-subtle" />
    }
    return <Battery className="size-3 text-emerald-400" />
  }

  const getBatteryLabel = () => {
    if (battery?.isWired || battery?.status === 'wired') {
      return 'Wired'
    }
    if (percent !== null) {
      return `${percent}%`
    }
    return '—'
  }

  return (
    <button
      type="button"
      onClick={() => navigate('/settings')}
      className={cn(
        'group flex h-6 select-none items-center gap-1.5 rounded-full border border-border/80 bg-surface/70 px-2 py-0.5 text-[11px] font-medium text-subtle shadow-xs transition-colors hover:border-accent/40 hover:bg-surface-raised hover:text-text focus:outline-none',
      )}
      title={`${primaryController.displayName} (Click for Gamepad Settings)`}
    >
      <Gamepad2 className="size-3 text-accent transition-transform group-hover:scale-110" />
      <div className="flex items-center gap-1">
        {getBatteryIcon()}
        <span className="font-mono text-[10px]">{getBatteryLabel()}</span>
      </div>
    </button>
  )
}
