import React from 'react'
import type { MetricToggles, OverlayMetrics } from '../../types/overlay'
import type { ThemeVisualTokens } from '../theme-tokens'
import { buildHudModel } from '../../lib/derive'
import { HudPanel, Label, StatusDot, Value } from '../../components/hud/primitives'
import { BatteryMetric } from '../../components/metric/battery-metric'
import { ClockMetric } from '../../components/metric/clock-metric'

interface LayoutProps {
  metrics: OverlayMetrics
  toggles: MetricToggles
  tokens: ThemeVisualTokens
}

const Divider = () => <div className="h-7 w-px shrink-0 bg-white/10" />

/** Label above, value below — reads at a glance in a one-line strip. */
const Cell: React.FC<{
  tokens: ThemeVisualTokens
  label: string
  value: string
  unit?: string
  color?: string
}> = ({ tokens, label, value, unit, color }) => (
  <div className="flex flex-col items-start gap-1">
    <Label>{label}</Label>
    <Value
      tokens={tokens}
      value={value}
      unit={unit}
      color={color}
      className="text-[13px] font-semibold"
    />
  </div>
)

export const HorizontalBarLayout: React.FC<LayoutProps> = ({ metrics, toggles, tokens }) => {
  const model = buildHudModel(metrics, toggles, tokens)
  const accent = model.fps.color ?? tokens.accentColor

  const segments: React.ReactNode[] = []

  if (model.session) {
    segments.push(
      <div key="session" className="flex items-center gap-2">
        <StatusDot color={tokens.accentColor} />
        <div className="flex max-w-[150px] flex-col gap-1">
          <span
            className={`truncate text-[12px] font-bold leading-none ${tokens.primaryTextColor}`}
          >
            {model.session.title}
          </span>
          <Value tokens={tokens} value={model.session.time} className="text-[10px] opacity-70" />
        </div>
      </div>,
    )
  }

  if (model.fps.show) {
    segments.push(
      <div key="fps" className="flex items-center gap-3">
        <div className="flex items-baseline gap-1">
          <span
            className={`font-mono text-[26px] font-black tabular-nums leading-none ${tokens.primaryTextColor}`}
            style={{ color: model.fps.color, textShadow: `0 0 14px ${accent}66` }}
          >
            {model.fps.text}
          </span>
          <Label>FPS</Label>
        </div>
        {model.fps.frametime && (
          <Cell tokens={tokens} label="FT" value={model.fps.frametime.value} unit="ms" />
        )}
        {model.fps.lows.map((low) => (
          <Cell key={low.key} tokens={tokens} label={`${low.label} LOW`} value={low.value} />
        ))}
      </div>,
    )
  }

  for (const g of model.groups) {
    segments.push(
      <div key={g.id} className="flex items-center gap-3">
        {g.main && (
          <Cell tokens={tokens} label={g.title} value={g.main.text} unit="%" color={g.main.color} />
        )}
        {g.extra && (
          <Cell tokens={tokens} label={g.extra.label} value={g.extra.text} color={g.extra.color} />
        )}
        {g.stats.map((s) => (
          <Cell
            key={s.key}
            tokens={tokens}
            label={g.main || g.extra ? s.label : `${g.title} ${s.label}`}
            value={s.value}
            unit={s.unit}
            color={s.color}
          />
        ))}
      </div>,
    )
  }

  if (model.footer.battery || model.footer.clock) {
    segments.push(
      <div key="footer" className="flex items-center gap-3">
        {model.footer.battery && (
          <BatteryMetric
            percent={metrics.battery_percent}
            charging={metrics.battery_charging}
            tokens={tokens}
          />
        )}
        {model.footer.clock && <ClockMetric tokens={tokens} />}
      </div>,
    )
  }

  return (
    <HudPanel tokens={tokens} className="w-fit px-4 py-2">
      <div className="flex items-center gap-4">
        {segments.map((seg, i) => (
          <React.Fragment key={i}>
            {i > 0 && <Divider />}
            {seg}
          </React.Fragment>
        ))}
      </div>
    </HudPanel>
  )
}
