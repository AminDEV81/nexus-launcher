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
  'polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 14px 100%, 0 calc(100% - 14px))'

export function useHistory() {
  return useOverlayStore((s) => s.history)
}

/** Themed container: corner style, dual accent top/bottom specular glow, optional CRT scanlines. */
export const HudPanel: React.FC<{
  tokens: ThemeVisualTokens
  className?: string
  children: React.ReactNode
}> = ({ tokens, className = '', children }) => {
  const corner = tokens.cornerStyle ?? 'rounded'
  return (
    <div
      className={`nx-hud-in relative overflow-hidden backdrop-blur-xl ${RADIUS[corner]} ${tokens.bgStyle} ${tokens.fontFamily} ${className}`}
      style={corner === 'chamfered' ? { clipPath: CHAMFER } : undefined}
    >
      {/* Ambient Radial Aura */}
      <div
        className="pointer-events-none absolute -top-12 -right-12 h-28 w-28 rounded-full opacity-20 blur-2xl"
        style={{ backgroundColor: tokens.accentColor }}
      />
      {/* Top Specular Edge */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[1.5px]"
        style={{
          background: `linear-gradient(90deg, transparent 5%, ${tokens.accentColor}, transparent 95%)`,
          boxShadow: `0 0 12px ${tokens.accentColor}`,
        }}
      />
      {/* Bottom Subtle Edge */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px opacity-45"
        style={{
          background: `linear-gradient(90deg, transparent 15%, ${tokens.accentColor}, transparent 85%)`,
        }}
      />
      {tokens.scanlines && (
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: 'repeating-linear-gradient(0deg, #fff 0 1px, transparent 1px 3px)',
          }}
        />
      )}
      {corner === 'chamfered' && (
        <>
          <div
            className="pointer-events-none absolute h-[1.5px] w-[20px] rotate-45"
            style={{ top: 6.5, right: -3, backgroundColor: tokens.accentColor, opacity: 0.9 }}
          />
          <div
            className="pointer-events-none absolute h-[1.5px] w-[20px] rotate-45"
            style={{ bottom: 6.5, left: -3, backgroundColor: tokens.accentColor, opacity: 0.9 }}
          />
        </>
      )}
      <div className="relative z-10">{children}</div>
    </div>
  )
}

export const Label: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => (
  <span
    className={`text-[9px] font-bold uppercase leading-none tracking-[0.15em] opacity-70 ${className}`}
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
    {unit && <span className="ml-0.5 text-[0.65em] font-medium opacity-70">{unit}</span>}
  </span>
)

export const StatPill: React.FC<{ tokens: ThemeVisualTokens; stat: HudStat }> = ({
  tokens,
  stat,
}) => (
  <span className="inline-flex items-baseline gap-1.5 rounded-lg border border-white/[0.09] bg-white/[0.06] px-2 py-[3.5px] shadow-2xs">
    <Label className="opacity-65">{stat.label}</Label>
    <Value
      tokens={tokens}
      value={stat.value}
      unit={stat.unit}
      color={stat.color}
      strong
      className="text-[11px] font-bold"
    />
  </span>
)

/** Luminous telemetry bar with glowing leading edge. */
export const Bar: React.FC<{ percent: number | null; color: string; className?: string }> = ({
  percent,
  color,
  className = '',
}) => {
  const ratio = percent == null ? 0 : Math.max(0, Math.min(1, percent / 100))
  return (
    <div
      className={`relative h-[5px] w-full overflow-hidden rounded-full bg-white/[0.11] ring-1 ring-inset ring-white/[0.06] ${className}`}
    >
      <div
        className="h-full w-full origin-left rounded-full transition-transform duration-500 ease-out"
        style={{
          transform: `scaleX(${ratio})`,
          background: `linear-gradient(90deg, ${color}55, ${color})`,
          boxShadow: `0 0 10px ${color}99`,
        }}
      />
    </div>
  )
}

/** Discrete angled "LED" bar for the tactical HUD look. */
export const SegmentBar: React.FC<{
  percent: number | null
  color: string
  segments?: number
}> = ({ percent, color, segments = 16 }) => {
  const lit =
    percent == null ? 0 : Math.round((Math.max(0, Math.min(100, percent)) / 100) * segments)
  return (
    <div className="flex w-full gap-[2.5px]">
      {Array.from({ length: segments }, (_, i) => {
        const active = i < lit
        return (
          <div
            key={i}
            className="h-[6px] flex-1 skew-x-[-18deg] rounded-[1px] transition-all duration-300"
            style={{
              backgroundColor: active ? color : 'rgba(255,255,255,0.09)',
              boxShadow: active ? `0 0 6px ${color}88` : undefined,
              opacity: active ? 0.75 + (i / segments) * 0.25 : 1,
            }}
          />
        )
      })}
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
    const lastPt = pts[pts.length - 1]?.split(',')
    return {
      line: pts.join(' '),
      area: `M0,${height} L${pts.join(' L')} L${width},${height} Z`,
      lastX: lastPt ? parseFloat(lastPt[0]) : width,
      lastY: lastPt ? parseFloat(lastPt[1]) : height / 2,
    }
  }, [values, width, height, min, max])

  if (!model) return <div style={{ width, height }} />
  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.45" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={model.area} fill={`url(#${id})`} />
      <polyline
        points={model.line}
        fill="none"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={model.lastX}
        cy={model.lastY}
        r={2}
        fill={color}
        style={{ filter: `drop-shadow(0 0 4px ${color})` }}
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
}> = ({ percent, color, label, center, unit = '%', size = 72, stroke = 6 }) => {
  const id = useId()
  const r = (size - stroke) / 2
  const innerR = r - stroke * 0.9
  const c = 2 * Math.PI * r
  const ratio = percent == null ? 0 : Math.max(0, Math.min(1, percent / 100))
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.6" />
              <stop offset="100%" stopColor={color} />
            </linearGradient>
          </defs>
          {/* Inner decorative dashed ring */}
          {innerR > 10 && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={innerR}
              fill="none"
              stroke="rgba(255,255,255,0.06)"
              strokeWidth={1}
              strokeDasharray="2 3"
            />
          )}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="rgba(255,255,255,0.1)"
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
              filter: `drop-shadow(0 0 6px ${color}aa)`,
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="font-mono font-black tabular-nums leading-none"
            style={{ fontSize: size * 0.27, color, textShadow: `0 0 10px ${color}44` }}
          >
            {center}
          </span>
          {unit && <span className="mt-0.5 text-[8px] font-semibold opacity-65">{unit}</span>}
        </div>
      </div>
      <Label>{label}</Label>
    </div>
  )
}

export const StatusDot: React.FC<{ color: string }> = ({ color }) => (
  <span className="relative flex h-2 w-2 shrink-0">
    <span
      className="nx-ping absolute inline-flex h-full w-full rounded-full opacity-70"
      style={{ backgroundColor: color }}
    />
    <span
      className="relative inline-flex h-2 w-2 rounded-full"
      style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }}
    />
  </span>
)

export const BarRow: React.FC<{
  tokens: ThemeVisualTokens
  title: string
  bar: HudBar
}> = ({ tokens, title, bar }) => (
  <div className="flex items-center gap-2">
    <Label className="w-9 shrink-0">{title}</Label>
    <Bar percent={bar.percent} color={bar.color} className="flex-1" />
    <Value
      tokens={tokens}
      value={bar.text}
      unit="%"
      color={bar.color}
      strong
      className="w-10 shrink-0 text-right text-[12px] font-bold"
    />
  </div>
)
