import React from 'react'
import type { MetricToggles, OverlayMetrics } from '../../types/overlay'
import type { ThemeVisualTokens } from '../theme-tokens'
import { buildHudModel } from '../../lib/derive'
import {
  Label,
  SegmentBar,
  StatPill,
  StatusDot,
  Value,
  useHistory,
  Sparkline,
} from '../../components/hud/primitives'
import { FrametimeGraph } from '../../components/frametime-graph'
import { BatteryMetric } from '../../components/metric/battery-metric'
import { ClockMetric } from '../../components/metric/clock-metric'

interface LayoutProps {
  metrics: OverlayMetrics
  toggles: MetricToggles
  tokens: ThemeVisualTokens
}

const Corner: React.FC<{ pos: string; color: string }> = ({ pos, color }) => (
  <div
    className={`pointer-events-none absolute h-3.5 w-3.5 ${pos}`}
    style={{ borderColor: color, filter: `drop-shadow(0 0 3px ${color})` }}
  />
)

/** Tactical HUD: open corner brackets, segmented LED bars, no solid panel edge. */
export const BracketHudLayout: React.FC<LayoutProps> = ({ metrics, toggles, tokens }) => {
  const model = buildHudModel(metrics, toggles, tokens)
  const history = useHistory()
  const { fps } = model
  const c = tokens.accentColor
  const hasFooter = model.footer.battery || model.footer.clock

  return (
    <div
      className={`nx-hud-in relative w-[264px] px-4 py-3 ${tokens.bgStyle.replace(/border(-\S+)?/g, '').trim()} ${tokens.fontFamily}`}
      style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.62), rgba(0,0,0,0.42))' }}
    >
      <Corner pos="top-0 left-0 border-t-2 border-l-2" color={c} />
      <Corner pos="top-0 right-0 border-t-2 border-r-2" color={c} />
      <Corner pos="bottom-0 left-0 border-b-2 border-l-2" color={c} />
      <Corner pos="bottom-0 right-0 border-b-2 border-r-2" color={c} />
      {tokens.scanlines && (
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: 'repeating-linear-gradient(0deg, #fff 0 1px, transparent 1px 3px)',
          }}
        />
      )}

      <div className="relative flex flex-col gap-2.5">
        {model.session && (
          <div className="flex items-center justify-between gap-2 border-b border-dashed border-white/20 pb-1.5">
            <div className="flex min-w-0 items-center gap-1.5">
              <StatusDot color={c} />
              <span
                className={`truncate text-[11px] font-bold uppercase tracking-wider ${tokens.primaryTextColor}`}
              >
                {model.session.title}
              </span>
            </div>
            <Value
              tokens={tokens}
              value={model.session.time}
              className="shrink-0 text-[10px] opacity-75"
            />
          </div>
        )}

        {fps.show && (
          <div className="flex items-center justify-between">
            <div className="flex items-baseline gap-1.5">
              <span
                className={`font-mono text-[40px] font-black tabular-nums leading-none ${tokens.primaryTextColor}`}
                style={{ color: fps.color, textShadow: `0 0 16px ${fps.color ?? c}88` }}
              >
                {fps.text}
              </span>
              <Label>FPS</Label>
            </div>
            <div className="flex flex-col items-end gap-1">
              <Sparkline
                values={history.fps}
                color={fps.color ?? c}
                width={64}
                height={20}
                min={Math.max(0, Math.min(...(history.fps.length ? history.fps : [0])) - 5)}
                max={Math.max(1, ...(history.fps.length ? history.fps : [1])) + 5}
              />
              {fps.frametime && (
                <Value
                  tokens={tokens}
                  value={fps.frametime.value}
                  unit="ms"
                  className="text-[11px]"
                />
              )}
            </div>
          </div>
        )}
        {fps.show && fps.lows.length > 0 && (
          <div className="flex gap-1.5">
            {fps.lows.map((low) => (
              <StatPill
                key={low.key}
                tokens={tokens}
                stat={{ ...low, label: `${low.label} LOW` }}
              />
            ))}
          </div>
        )}
        {fps.graph && (
          <FrametimeGraph
            history={metrics.frametime_history}
            tokens={tokens}
            width={232}
            height={30}
          />
        )}

        {model.groups.map((g) => (
          <div key={g.id} className="flex flex-col gap-1.5">
            {g.main && (
              <div className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between">
                  <Label>{g.title}</Label>
                  <Value
                    tokens={tokens}
                    value={g.main.text}
                    unit="%"
                    color={g.main.color}
                    strong
                    className="text-[14px] font-bold"
                  />
                </div>
                <SegmentBar percent={g.main.percent} color={g.main.color} />
              </div>
            )}
            {g.extra && (
              <div className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between">
                  <Label>{g.extra.label}</Label>
                  <Value
                    tokens={tokens}
                    value={g.extra.text}
                    color={g.extra.color}
                    className="text-[11px]"
                  />
                </div>
                <SegmentBar percent={g.extra.percent} color={g.extra.color} segments={20} />
              </div>
            )}
            {g.stats.length > 0 && (
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {g.stats.map((s) => (
                  <span key={s.key} className="flex items-baseline gap-1">
                    <Label>{g.main || g.extra ? s.label : `${g.title} ${s.label}`}</Label>
                    <Value
                      tokens={tokens}
                      value={s.value}
                      unit={s.unit}
                      color={s.color}
                      className="text-[11px]"
                    />
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}

        {hasFooter && (
          <div className="flex items-center justify-between border-t border-dashed border-white/20 pt-1.5">
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
    </div>
  )
}
