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

/** Enthusiast RivaTuner/Afterburner Next-Gen vertical telemetry strip. */
export const VerticalStripLayout: React.FC<LayoutProps> = ({ metrics, toggles, tokens }) => {
  const model = buildHudModel(metrics, toggles, tokens)
  const { fps } = model
  const hasFooter = model.footer.battery || model.footer.clock

  return (
    <HudPanel tokens={tokens} className="w-[248px] px-3.5 py-3">
      <div className="flex flex-col gap-2.5">
        {model.session && (
          <div className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.05] px-2 py-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <StatusDot color={tokens.accentColor} />
              <span className={`truncate text-[11px] font-bold ${tokens.primaryTextColor}`}>
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

        {fps.show && (
          <div className="flex items-end justify-between border-b border-white/[0.12] pb-2">
            <div className="flex items-baseline gap-1.5">
              <span
                className={`font-mono text-[34px] font-black tabular-nums leading-none ${tokens.primaryTextColor}`}
                style={{
                  color: fps.color,
                  textShadow: `0 0 16px ${fps.color ?? tokens.accentColor}66`,
                }}
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
                  strong
                  className="text-[11px] font-bold"
                />
              )}
              {fps.lows.map((low) => (
                <span key={low.key} className="flex items-baseline gap-1">
                  <Label>{low.label} LOW</Label>
                  <Value tokens={tokens} value={low.value} className="text-[11px] font-semibold" />
                </span>
              ))}
            </div>
          </div>
        )}

        {fps.graph && (
          <FrametimeGraph
            history={metrics.frametime_history}
            tokens={tokens}
            width={220}
            height={30}
          />
        )}

        {model.groups.map((g) => (
          <div
            key={g.id}
            className="flex flex-col gap-1.5 border-t border-white/[0.09] pt-2 first:border-t-0 first:pt-0"
          >
            {g.subtitle && (
              <div className="flex items-center justify-between">
                <span className="text-[8.5px] font-bold uppercase tracking-widest opacity-55">
                  {g.subtitle}
                </span>
              </div>
            )}
            {g.main && <BarRow tokens={tokens} title={g.title} bar={g.main} />}
            {g.extra && (
              <div className="flex items-center gap-2">
                <Label className="w-9 shrink-0">{g.extra.label}</Label>
                <Bar percent={g.extra.percent} color={g.extra.color} className="flex-1 !h-[3.5px]" />
                <Value
                  tokens={tokens}
                  value={g.extra.text}
                  color={g.extra.color}
                  className="w-[66px] shrink-0 text-right text-[10px] font-bold"
                />
              </div>
            )}
            {g.stats.length > 0 && (
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-lg bg-white/[0.04] px-2 py-1.5">
                {g.stats.map((s) => (
                  <div key={s.key} className="flex items-baseline justify-between">
                    <Label>{g.main || g.extra ? s.label : `${g.title} ${s.label}`}</Label>
                    <Value
                      tokens={tokens}
                      value={s.value}
                      unit={s.unit}
                      color={s.color}
                      strong
                      className="text-[11px] font-bold"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {hasFooter && (
          <div className="flex items-center justify-between border-t border-white/[0.09] pt-2">
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
