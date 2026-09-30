import React from 'react'
import type { MetricToggles, OverlayMetrics } from '../../types/overlay'
import type { ThemeVisualTokens } from '../theme-tokens'
import { buildHudModel } from '../../lib/derive'
import { BarRow, HudPanel, Label, StatusDot, Value, Bar } from '../../components/hud/primitives'
import { FrametimeGraph } from '../../components/frametime-graph'
import { BatteryMetric } from '../../components/metric/battery-metric'
import { ClockMetric } from '../../components/metric/clock-metric'

interface LayoutProps {
  metrics: OverlayMetrics
  toggles: MetricToggles
  tokens: ThemeVisualTokens
}

/** Afterburner-style dense table: one line per reading. */
export const VerticalStripLayout: React.FC<LayoutProps> = ({ metrics, toggles, tokens }) => {
  const model = buildHudModel(metrics, toggles, tokens)
  const { fps } = model
  const hasFooter = model.footer.battery || model.footer.clock

  return (
    <HudPanel tokens={tokens} className="w-[232px] px-3 py-2.5">
      <div className="flex flex-col gap-2">
        {model.session && (
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5">
              <StatusDot color={tokens.accentColor} />
              <span className={`truncate text-[11px] font-bold ${tokens.primaryTextColor}`}>
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

        {fps.show && (
          <div className="flex items-end justify-between border-b border-white/10 pb-2">
            <div className="flex items-baseline gap-1.5">
              <span
                className={`font-mono text-[30px] font-black tabular-nums leading-none ${tokens.primaryTextColor}`}
                style={{ color: fps.color }}
              >
                {fps.text}
              </span>
              <Label>FPS</Label>
            </div>
            <div className="flex flex-col items-end gap-1">
              {fps.frametime && (
                <Value
                  tokens={tokens}
                  value={fps.frametime.value}
                  unit="ms"
                  className="text-[11px]"
                />
              )}
              {fps.lows.map((low) => (
                <span key={low.key} className="flex items-baseline gap-1">
                  <Label>{low.label} LOW</Label>
                  <Value tokens={tokens} value={low.value} className="text-[11px]" />
                </span>
              ))}
            </div>
          </div>
        )}

        {fps.graph && (
          <FrametimeGraph
            history={metrics.frametime_history}
            tokens={tokens}
            width={206}
            height={28}
          />
        )}

        {model.groups.map((g) => (
          <div
            key={g.id}
            className="flex flex-col gap-1.5 border-t border-white/[0.07] pt-2 first:border-t-0 first:pt-0"
          >
            {g.main && <BarRow tokens={tokens} title={g.title} bar={g.main} />}
            {g.extra && (
              <div className="flex items-center gap-2">
                <Label className="w-8 shrink-0">{g.extra.label}</Label>
                <Bar percent={g.extra.percent} color={g.extra.color} className="flex-1 !h-[3px]" />
                <Value
                  tokens={tokens}
                  value={g.extra.text}
                  color={g.extra.color}
                  className="w-[62px] shrink-0 text-right text-[10px]"
                />
              </div>
            )}
            {g.stats.length > 0 && (
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                {g.stats.map((s) => (
                  <div key={s.key} className="flex items-baseline justify-between">
                    <Label>{g.main || g.extra ? s.label : `${g.title} ${s.label}`}</Label>
                    <Value
                      tokens={tokens}
                      value={s.value}
                      unit={s.unit}
                      color={s.color}
                      className="text-[11px]"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {hasFooter && (
          <div className="flex items-center justify-between border-t border-white/[0.07] pt-2">
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
