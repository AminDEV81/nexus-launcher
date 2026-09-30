import React, { useEffect, useState } from 'react'
import type { ThemeVisualTokens } from '../../themes/theme-tokens'

interface ClockMetricProps {
  tokens: ThemeVisualTokens
}

const format = () =>
  new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })

export const ClockMetric: React.FC<ClockMetricProps> = ({ tokens }) => {
  const [time, setTime] = useState(format)

  // Minute resolution: no need to re-render the HUD every second.
  useEffect(() => {
    const timer = setInterval(() => setTime(format()), 5000)
    return () => clearInterval(timer)
  }, [])

  return (
    <span className={`font-mono text-[11px] tabular-nums opacity-80 ${tokens.secondaryTextColor}`}>
      {time}
    </span>
  )
}
