import React from 'react'
import type { MetricToggles, OverlayMetrics } from '../../types/overlay'
import type { ThemeVisualTokens } from '../theme-tokens'
import { buildHudModel, type HudGroup } from '../../lib/derive'
import {
  Bar,
  HudPanel,
  Label,
  Sparkline,
  StatPill,
  StatusDot,
  Value,
  useHistory,
} from '../../components/hud/primitives'
import { FrametimeGraph } from '../../components/frametime-graph'
import { BatteryMetric } from '../../components/metric/battery-metric'
import { ClockMetric } from '../../components/metric/clock-metric'

interface LayoutProps {
  metrics: OverlayMetrics
  toggles: MetricToggles
  tokens: ThemeVisualTokens
}

const GroupCard: React.FC<{
  group: HudGroup
  tokens: ThemeVisualTokens
  spark?: number[]
}> = ({ group, tokens, spark }) => (
  <div className="flex flex-col gap-1.5 rounded-xl border border-white/[0.07] bg-white/[0.04] p-2">
    <div className="flex items-center justify-between">
      <Label>{group.title}</Label>
      <div className="flex items-center gap-2">
        {spark && group.main && (
          <Sparkline values={spark} color={group.main.color} width={44} height={14} />
        )}
        {group.main && (
          <Value
            tokens={tokens}
            value={group.main.text}
            unit="%"
            color={group.main.color}
            strong
            className="text-[17px] font-bold"
          />
        )}
      </div>
    </div>
    {group.main && <Bar percent={group.main.percent} color={group.main.color} />}
    {group.extra && (
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <Label>{group.extra.label}</Label>
          <Value
            tokens={tokens}
            value={group.extra.text}
            color={group.extra.color}
            className="text-[11px]"
          />
        </div>
        <Bar percent={group.extra.percent} color={group.extra.color} className="!h-[3px]" />
      </div>
    )}
    {group.stats.length > 0 && (
      <div className="flex flex-wrap gap-1">
        {group.stats.map((stat) => (
          <StatPill key={stat.key} tokens={tokens} stat={stat} />
        ))}
      </div>
    )}
  </div>
)

export const ModularCardsLayout: React.FC<LayoutProps> = ({ metrics, toggles, tokens }) => {
  const model = buildHudModel(metrics, toggles, tokens)
  const history = useHistory()
  const { fps } = model
  const hasFooter = model.footer.battery || model.footer.clock

  const big = model.groups.filter((g) => g.id === 'gpu' || g.id === 'cpu' || g.id === 'ram')
  const small = model.groups.filter((g) => g.id === 'net' || g.id === 'disk')

  return (
    <HudPanel tokens={tokens} className="w-[300px] p-2.5">
      <div className="flex flex-col gap-2">
        {model.session && (
          <div className="flex items-center justify-between gap-2 px-0.5">
            <div className="flex min-w-0 items-center gap-2">
              <StatusDot color={tokens.accentColor} />
              <span className={`truncate text-[12px] font-bold ${tokens.primaryTextColor}`}>
                {model.session.title}
              </span>
            </div>
            <Value
              tokens={tokens}
              value={model.session.time}
              className="shrink-0 text-[11px] opacity-75"
            />
          </div>
        )}

        {fps.show && (
          <div className="rounded-xl border border-white/[0.07] bg-gradient-to-br from-white/[0.08] to-white/[0.02] p-2.5">
            <div className="flex items-end justify-between gap-2">
              <div className="flex items-baseline gap-1.5">
                <span
                  className={`font-mono text-[38px] font-black tabular-nums leading-none ${tokens.primaryTextColor}`}
                  style={{
                    color: fps.color,
                    textShadow: `0 0 18px ${fps.color ?? tokens.accentColor}66`,
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
                    className="text-[12px]"
                  />
                )}
                {fps.lows.length > 0 && (
                  <div className="flex gap-1">
                    {fps.lows.map((low) => (
                      <StatPill key={low.key} tokens={tokens} stat={low} />
                    ))}
                  </div>
                )}
              </div>
            </div>
            {fps.graph && (
              <FrametimeGraph
                history={metrics.frametime_history}
                tokens={tokens}
                width={262}
                height={34}
              />
            )}
          </div>
        )}

        {big.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {big.map((g) => (
              <GroupCard
                key={g.id}
                group={g}
                tokens={tokens}
                spark={g.id === 'gpu' ? history.gpu : g.id === 'cpu' ? history.cpu : undefined}
              />
            ))}
          </div>
        )}

        {small.length > 0 && (
          <div className="grid grid-cols-2 gap-1.5">
            {small.map((g) => (
              <GroupCard key={g.id} group={g} tokens={tokens} />
            ))}
          </div>
        )}

        {hasFooter && (
          <div className="flex items-center justify-between px-0.5 pt-0.5">
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
