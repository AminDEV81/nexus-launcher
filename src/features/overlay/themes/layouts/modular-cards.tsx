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
  <div className="relative flex flex-col gap-2 overflow-hidden rounded-xl border border-white/[0.1] bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-2.5 shadow-inner">
    {/* Left accent indicator bar */}
    <div
      className="pointer-events-none absolute inset-y-2 left-0 w-[2.5px] rounded-r-full"
      style={{
        backgroundColor: group.main?.color ?? tokens.accentColor,
        boxShadow: `0 0 8px ${group.main?.color ?? tokens.accentColor}`,
      }}
    />

    <div className="flex items-center justify-between gap-2 pl-1.5">
      <div className="flex min-w-0 items-center gap-1.5">
        <span
          className={`text-[10px] font-black uppercase tracking-[0.16em] ${tokens.primaryTextColor}`}
        >
          {group.title}
        </span>
        {group.subtitle && (
          <span className="truncate rounded bg-white/[0.07] px-1.5 py-0.5 font-mono text-[8.5px] font-semibold text-white/65">
            {group.subtitle}
          </span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2.5">
        {spark && group.main && (
          <Sparkline values={spark} color={group.main.color} width={48} height={15} />
        )}
        {group.main && (
          <Value
            tokens={tokens}
            value={group.main.text}
            unit="%"
            color={group.main.color}
            strong
            className="text-[18px] font-black"
          />
        )}
      </div>
    </div>

    {group.main && (
      <div className="pl-1.5">
        <Bar percent={group.main.percent} color={group.main.color} />
      </div>
    )}

    {group.extra && (
      <div className="flex flex-col gap-1 pl-1.5">
        <div className="flex items-center justify-between">
          <Label>{group.extra.label}</Label>
          <Value
            tokens={tokens}
            value={group.extra.text}
            color={group.extra.color}
            strong
            className="text-[11px] font-bold"
          />
        </div>
        <Bar percent={group.extra.percent} color={group.extra.color} className="!h-[3.5px]" />
      </div>
    )}

    {group.stats.length > 0 && (
      <div className="flex flex-wrap gap-1.5 pl-1.5 pt-0.5">
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
    <HudPanel tokens={tokens} className="w-[316px] p-3">
      <div className="flex flex-col gap-2">
        {model.session && (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5">
            <div className="flex min-w-0 items-center gap-2">
              <StatusDot color={tokens.accentColor} />
              <span className={`truncate text-[11.5px] font-extrabold ${tokens.primaryTextColor}`}>
                {model.session.title}
              </span>
            </div>
            <Value
              tokens={tokens}
              value={model.session.time}
              className="shrink-0 rounded bg-black/40 px-1.5 py-0.5 text-[10px] font-bold opacity-85"
            />
          </div>
        )}

        {fps.show && (
          <div className="relative overflow-hidden rounded-xl border border-white/[0.12] bg-gradient-to-br from-white/[0.1] via-white/[0.04] to-transparent p-3">
            <div className="flex items-end justify-between gap-2">
              <div className="flex items-baseline gap-2">
                <span
                  className={`font-mono text-[42px] font-black tabular-nums leading-none ${tokens.primaryTextColor}`}
                  style={{
                    color: fps.color,
                    textShadow: `0 0 22px ${fps.color ?? tokens.accentColor}77`,
                  }}
                >
                  {fps.text}
                </span>
                <div className="flex flex-col gap-0.5">
                  <span
                    className="text-[10px] font-black uppercase tracking-[0.18em]"
                    style={{ color: fps.color ?? tokens.accentColor }}
                  >
                    FPS
                  </span>
                  {fps.frametime && (
                    <Value
                      tokens={tokens}
                      value={fps.frametime.value}
                      unit="ms"
                      className="text-[11px] font-bold opacity-85"
                    />
                  )}
                </div>
              </div>

              <div className="flex flex-col items-end gap-1.5">
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
              <div className="mt-1.5">
                <FrametimeGraph
                  history={metrics.frametime_history}
                  tokens={tokens}
                  width={276}
                  height={34}
                />
              </div>
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
          <div className="flex items-center justify-between border-t border-white/[0.08] px-1 pt-1.5">
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
