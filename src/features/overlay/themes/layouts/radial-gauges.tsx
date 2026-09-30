import React from 'react'
import type { MetricToggles, OverlayMetrics } from '../../types/overlay'
import type { ThemeVisualTokens } from '../theme-tokens'
import { buildHudModel } from '../../lib/derive'
import { HudPanel, RingGauge, StatPill, StatusDot, Value } from '../../components/hud/primitives'
import { BatteryMetric } from '../../components/metric/battery-metric'
import { ClockMetric } from '../../components/metric/clock-metric'

interface LayoutProps {
  metrics: OverlayMetrics
  toggles: MetricToggles
  tokens: ThemeVisualTokens
}

/** Circular dashboard: one ring per load reading, remaining stats as chips underneath. */
export const RadialGaugesLayout: React.FC<LayoutProps> = ({ metrics, toggles, tokens }) => {
  const model = buildHudModel(metrics, toggles, tokens)
  const { fps } = model
  const accent = tokens.accentColor
  const hasFooter = model.footer.battery || model.footer.clock

  const rings: React.ReactNode[] = []
  if (fps.show) {
    // FPS as a ring against a 165 FPS scale (typical high-refresh target).
    const fpsPercent = fps.value != null ? Math.min(100, (fps.value / 165) * 100) : null
    rings.push(
      <RingGauge
        key="fps"
        percent={fpsPercent}
        color={fps.color ?? accent}
        label="FPS"
        center={fps.text}
        unit={fps.frametime ? `${fps.frametime.value}ms` : ''}
        size={78}
      />,
    )
  }
  for (const g of model.groups) {
    if (g.main)
      rings.push(
        <RingGauge
          key={g.id}
          percent={g.main.percent}
          color={g.main.color}
          label={g.title}
          center={g.main.text}
          size={g.id === 'gpu' || g.id === 'cpu' ? 68 : 58}
        />,
      )
    if (g.extra)
      rings.push(
        <RingGauge
          key={`${g.id}-x`}
          percent={g.extra.percent}
          color={g.extra.color}
          label={g.extra.label}
          center={g.extra.percent != null ? g.extra.percent.toFixed(0) : '--'}
          size={58}
        />,
      )
  }

  const chips = [
    ...fps.lows.map((l) => ({ group: 'FPS', stat: { ...l, label: `${l.label} LOW` } })),
    ...model.groups.flatMap((g) => g.stats.map((stat) => ({ group: g.title, stat }))),
  ]

  return (
    <HudPanel tokens={tokens} className="w-[268px] p-3">
      <div className="flex flex-col gap-3">
        {model.session && (
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <StatusDot color={accent} />
              <span className={`truncate text-[12px] font-bold ${tokens.primaryTextColor}`}>
                {model.session.title}
              </span>
            </div>
            <Value
              tokens={tokens}
              value={model.session.time}
              className="shrink-0 text-[10px] opacity-70"
            />
          </div>
        )}

        {rings.length > 0 && (
          <div className="grid grid-cols-3 place-items-center gap-x-1 gap-y-3">{rings}</div>
        )}

        {chips.length > 0 && (
          <div className="flex flex-wrap justify-center gap-1 border-t border-white/[0.08] pt-2.5">
            {chips.map(({ group, stat }) => (
              <StatPill
                key={`${group}-${stat.key}`}
                tokens={tokens}
                stat={{
                  ...stat,
                  label:
                    stat.label.length <= 3 || group === 'FPS'
                      ? `${group === 'FPS' ? '' : group + ' '}${stat.label}`.trim()
                      : stat.label,
                }}
              />
            ))}
          </div>
        )}

        {hasFooter && (
          <div className="flex items-center justify-between">
            {model.footer.battery ? (
              <BatteryMetric
                percent={metrics.battery_percent}
                charging={metrics.battery_charging}
                tokens={tokens}
              />
            ) : (
              <span />
            )}
            {model.footer.clock && <ClockMetric tokens={tokens} />}
          </div>
        )}
      </div>
    </HudPanel>
  )
}
