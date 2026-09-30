import React, { useId, useMemo } from 'react'
import type { ThemeVisualTokens } from '../../themes/theme-tokens'
import type { HudBar, HudStat } from '../../lib/derive'
import { useOverlayStore } from '../../store/overlay-store'

const RADIUS: Record<NonNullable<ThemeVisualTokens['cornerStyle']>, string> = {
  rounded: 'rounded-2xl',
  sharp: 'rounded-none',
  pill: 'rounded-[28px]',
  chamfered: 'rounded-none',
}

const CHAMFER =
  'polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))'

export function useHistory() {
  return useOverlayStore((s) => s.history)
}

/** Themed container: corner style, accent top-glow, optional CRT scanlines. */
export const HudPanel: React.FC<{
  tokens: ThemeVisualTokens
  className?: string
  children: React.ReactNode
}> = ({ tokens, className = '', children }) => {
  const corner = tokens.cornerStyle ?? 'rounded'
  return (
    <div
      className={`nx-hud-in relative overflow-hidden ${RADIUS[corner]} ${tokens.bgStyle} ${tokens.fontFamily} ${className}`}
      style={corner === 'chamfered' ? { clipPath: CHAMFER } : undefined}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{
          background: `linear-gradient(90deg, transparent, ${tokens.accentColor}, transparent)`,
        }}
      />
      {tokens.scanlines && (
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: 'repeating-linear-gradient(0deg, #fff 0 1px, transparent 1px 3px)',
          }}
        />
      )}
      {corner === 'chamfered' && (
        <>
          <div
            className="pointer-events-none absolute h-px w-[17px] rotate-45"
            style={{ top: 6, right: -2.5, backgroundColor: tokens.accentColor, opacity: 0.8 }}
          />
          <div
            className="pointer-events-none absolute h-px w-[17px] rotate-45"
            style={{ bottom: 6, left: -2.5, backgroundColor: tokens.accentColor, opacity: 0.8 }}
          />
        </>
      )}
      <div className="relative">{children}</div>
    </div>
  )
}

export const Label: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => (
  <span
    className={`text-[9px] font-semibold uppercase leading-none tracking-[0.16em] opacity-60 ${className}`}
  >
    {children}
  </span>
)

/** Value + unit with tabular figures so digits never jitter between polls. */
export const Value: React.FC<{
  tokens: ThemeVisualTokens
  value: string
  unit?: string
  color?: string
  className?: string
  strong?: boolean
}> = ({ tokens, value, unit, color, className = '', strong }) => (
  <span
    className={`font-mono tabular-nums leading-none ${
      strong ? tokens.primaryTextColor : tokens.secondaryTextColor
    } ${className}`}
    style={color ? { color } : undefined}
  >
    {value}
    {unit && <span className="ml-0.5 text-[0.62em] font-normal opacity-60">{unit}</span>}
  </span>
)

export const StatPill: React.FC<{ tokens: ThemeVisualTokens; stat: HudStat }> = ({
  tokens,
  stat,
}) => (
  <span className="inline-flex items-baseline gap-1 rounded-md bg-white/[0.06] px-1.5 py-[3px]">
    <Label className="opacity-50">{stat.label}</Label>
    <Value
      tokens={tokens}
      value={stat.value}
      unit={stat.unit}
      color={stat.color}
      className="text-[11px]"
    />
  </span>
)

/** Thin bar; only `transform` animates so it stays cheap next to a running game. */
export const Bar: React.FC<{ percent: number | null; color: string; className?: string }> = ({
  percent,
  color,
  className = '',
}) => {
  const ratio = percent == null ? 0 : Math.max(0, Math.min(1, percent / 100))
  return (
    <div className={`h-[4px] w-full overflow-hidden rounded-full bg-white/10 ${className}`}>
      <div
        className="h-full w-full origin-left rounded-full transition-transform duration-500 ease-out"
        style={{
          transform: `scaleX(${ratio})`,
          background: `linear-gradient(90deg, ${color}66, ${color})`,
          boxShadow: `0 0 8px ${color}80`,
        }}
      />
    </div>
  )
}

/** Discrete "LED" bar for the tactical HUD look. */
export const SegmentBar: React.FC<{
  percent: number | null
  color: string
  segments?: number
}> = ({ percent, color, segments = 14 }) => {
  const lit =
    percent == null ? 0 : Math.round((Math.max(0, Math.min(100, percent)) / 100) * segments)
  return (
    <div className="flex w-full gap-[2px]">
      {Array.from({ length: segments }, (_, i) => (
        <div
          key={i}
          className="h-[6px] flex-1 skew-x-[-18deg] rounded-[1px] transition-colors duration-300"
          style={{
            backgroundColor: i < lit ? color : 'rgba(255,255,255,0.1)',
            boxShadow: i < lit ? `0 0 5px ${color}90` : undefined,
          }}
        />
      ))}
    </div>
  )
}

export const Sparkline: React.FC<{
  values: number[]
  color: string
  width?: number
  height?: number
  min?: number
  max?: number
}> = ({ values, color, width = 72, height = 20, min = 0, max = 100 }) => {
  const id = useId()
  const model = useMemo(() => {
    if (values.length < 2) return null
    const span = Math.max(1, max - min)
    const step = width / (values.length - 1)
    const pts = values.map(
      (v, i) =>
        `${(i * step).toFixed(1)},${(height - 1 - ((Math.min(max, Math.max(min, v)) - min) / span) * (height - 2)).toFixed(1)}`,
    )
    return { line: pts.join(' '), area: `M0,${height} L${pts.join(' L')} L${width},${height} Z` }
  }, [values, width, height, min, max])

  if (!model) return <div style={{ width, height }} />
  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.4" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={model.area} fill={`url(#${id})`} />
      <polyline
        points={model.line}
        fill="none"
        stroke={color}
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export const RingGauge: React.FC<{
  percent: number | null
  color: string
  label: string
  center: string
  unit?: string
  size?: number
  stroke?: number
}> = ({ percent, color, label, center, unit = '%', size = 68, stroke = 6 }) => {
  const id = useId()
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const ratio = percent == null ? 0 : Math.max(0, Math.min(1, percent / 100))
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.55" />
              <stop offset="100%" stopColor={color} />
            </linearGradient>
          </defs>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="rgba(255,255,255,0.09)"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={`url(#${id})`}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - ratio)}
            style={{
              transition: 'stroke-dashoffset 500ms ease-out',
              filter: `drop-shadow(0 0 4px ${color}aa)`,
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="font-mono font-bold tabular-nums leading-none"
            style={{ fontSize: size * 0.28, color }}
          >
            {center}
          </span>
          {unit && <span className="mt-0.5 text-[8px] opacity-50">{unit}</span>}
        </div>
      </div>
      <Label>{label}</Label>
    </div>
  )
}

export const StatusDot: React.FC<{ color: string }> = ({ color }) => (
  <span className="relative flex h-2 w-2">
    <span
      className="nx-ping absolute inline-flex h-full w-full rounded-full opacity-60"
      style={{ backgroundColor: color }}
    />
    <span
      className="relative inline-flex h-2 w-2 rounded-full"
      style={{ backgroundColor: color }}
    />
  </span>
)

export const BarRow: React.FC<{
  tokens: ThemeVisualTokens
  title: string
  bar: HudBar
}> = ({ tokens, title, bar }) => (
  <div className="flex items-center gap-2">
    <Label className="w-8 shrink-0">{title}</Label>
    <Bar percent={bar.percent} color={bar.color} className="flex-1" />
    <Value
      tokens={tokens}
      value={bar.text}
      unit="%"
      color={bar.color}
      strong
      className="w-9 shrink-0 text-right text-[12px] font-semibold"
    />
  </div>
)
