import React from 'react'
import type { MetricToggles, OverlayMetrics } from '../../types/overlay'
import type { ThemeVisualTokens } from '../theme-tokens'
import { buildHudModel } from '../../lib/derive'
import { HudPanel, RingGauge, StatPill, StatusDot, Value } from '../../components/hud/primitives'
import { FrametimeGraph } from '../../components/frametime-graph'
import { BatteryMetric } from '../../components/metric/battery-metric'
import { ClockMetric } from '../../components/metric/clock-metric'

interface LayoutProps {
  metrics: OverlayMetrics
  toggles: MetricToggles
  tokens: ThemeVisualTokens
}

/** Circular dashboard: concentric reactor rings per load reading, thermal/clock chips underneath. */
export const RadialGaugesLayout: React.FC<LayoutProps> = ({ metrics, toggles, tokens }) => {
  const model = buildHudModel(metrics, toggles, tokens)
  const { fps } = model
  const accent = tokens.accentColor
  const hasFooter = model.footer.battery || model.footer.clock

  const rings: React.ReactNode[] = []
  if (fps.show) {
    const fpsPercent = fps.value != null ? Math.min(100, (fps.value / 165) * 100) : null
    rings.push(
      <RingGauge
        key="fps"
        percent={fpsPercent}
        color={fps.color ?? accent}
        label="FPS"
        center={fps.text}
        unit={fps.frametime ? `${fps.frametime.value}ms` : ''}
        size={82}
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
          size={g.id === 'gpu' || g.id === 'cpu' ? 74 : 62}
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
          size={62}
        />,
      )
  }

  const chips = [
    ...fps.lows.map((l) => ({ group: 'FPS', stat: { ...l, label: `${l.label} LOW` } })),
    ...model.groups.flatMap((g) => g.stats.map((stat) => ({ group: g.title, stat }))),
  ]

  return (
    <HudPanel tokens={tokens} className="w-[288px] p-3.5">
      <div className="flex flex-col gap-3">
        {model.session && (
          <div className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.05] px-2.5 py-1.5">
            <div className="flex min-w-0 items-center gap-2">
              <StatusDot color={accent} />
              <span className={`truncate text-[12px] font-bold ${tokens.primaryTextColor}`}>
                {model.session.title}
              </span>
            </div>
            <Value
              tokens={tokens}
              value={model.session.time}
              className="shrink-0 text-[10px] font-semibold opacity-75"
            />
          </div>
        )}

        {rings.length > 0 && (
          <div className="grid grid-cols-3 place-items-center gap-x-1.5 gap-y-3 pt-1">{rings}</div>
        )}

        {fps.show && fps.graph && (
          <FrametimeGraph
            history={metrics.frametime_history}
            tokens={tokens}
            width={256}
            height={28}
          />
        )}

        {chips.length > 0 && (
          <div className="flex flex-wrap justify-center gap-1.5 border-t border-white/[0.1] pt-2.5">
            {chips.map(({ group, stat }) => (
              <StatPill
                key={`${group}-${stat.key}`}
                tokens={tokens}
                stat={{
                  ...stat,
                  label:
                    stat.label.length <= 4 || group === 'FPS'
                      ? `${group === 'FPS' ? '' : group + ' '}${stat.label}`.trim()
                      : stat.label,
                }}
              />
            ))}
          </div>
        )}

        {hasFooter && (
          <div className="flex items-center justify-between border-t border-white/[0.08] pt-1.5">
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
