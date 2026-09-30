import React from 'react'
import { Zap } from 'lucide-react'
import type { ThemeVisualTokens } from '../../themes/theme-tokens'

interface BatteryMetricProps {
  percent: number | null
  charging: boolean | null
  tokens: ThemeVisualTokens
}

export const BatteryMetric: React.FC<BatteryMetricProps> = ({ percent, charging, tokens }) => {
  // Desktops report no battery — don't draw an empty "--" placeholder.
  if (percent == null) return null

  const color = charging
    ? '#4ade80'
    : percent <= 15
      ? tokens.dangerColor
      : percent <= 30
        ? '#fbbf24'
        : undefined
  const fill = Math.max(4, Math.min(100, percent))

  return (
    <div className="flex items-center gap-1.5">
      <div
        className="relative h-[10px] w-[20px] rounded-[3px] border border-current p-[1.5px] opacity-90"
        style={{ color }}
      >
        <div className="h-full rounded-[1px] bg-current" style={{ width: `${fill}%` }} />
        <div className="absolute -right-[3px] top-[2px] h-[4px] w-[2px] rounded-r-sm bg-current" />
      </div>
      <span
        className={`font-mono text-[11px] tabular-nums ${tokens.secondaryTextColor}`}
        style={color ? { color } : undefined}
      >
        {percent}%
      </span>
      {charging && <Zap className="h-3 w-3 text-emerald-400" />}
    </div>
  )
}
