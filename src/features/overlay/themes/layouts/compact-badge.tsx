import React from 'react'
import type { MetricToggles, OverlayMetrics } from '../../types/overlay'
import type { ThemeVisualTokens } from '../theme-tokens'
import { buildHudModel } from '../../lib/derive'
import {
  HudPanel,
  Label,
  Sparkline,
  StatusDot,
  Value,
  useHistory,
} from '../../components/hud/primitives'

interface LayoutProps {
  metrics: OverlayMetrics
  toggles: MetricToggles
  tokens: ThemeVisualTokens
}

export const CompactBadgeLayout: React.FC<LayoutProps> = ({ metrics, toggles, tokens }) => {
  const model = buildHudModel(metrics, toggles, tokens)
  const history = useHistory()
  const color = model.fps.color ?? tokens.accentColor
  const gpu = model.groups.find((g) => g.id === 'gpu')
  const cpu = model.groups.find((g) => g.id === 'cpu')
  const temp = gpu?.stats.find((s) => s.key === 'temp')

  return (
    <HudPanel tokens={{ ...tokens, cornerStyle: 'pill' }} className="w-fit px-3.5 py-1.5">
      <div className="flex items-center gap-3">
        <StatusDot color={color} />
        {model.fps.show && (
          <div className="flex items-baseline gap-1">
            <span
              className={`font-mono text-[20px] font-black tabular-nums leading-none ${tokens.primaryTextColor}`}
              style={{ color: model.fps.color }}
            >
              {model.fps.text}
            </span>
            <Label>FPS</Label>
          </div>
        )}
        {model.fps.show && model.fps.graph && (
          <Sparkline
            values={history.fps}
            color={color}
            width={44}
            height={16}
            min={Math.max(0, Math.min(...(history.fps.length ? history.fps : [0])) - 5)}
            max={Math.max(1, ...(history.fps.length ? history.fps : [1])) + 5}
          />
        )}
        {model.fps.frametime && (
          <Value
            tokens={tokens}
            value={model.fps.frametime.value}
            unit="ms"
            className="text-[11px]"
          />
        )}
        {gpu?.main && (
          <span className="flex items-baseline gap-1">
            <Label>GPU</Label>
            <Value
              tokens={tokens}
              value={gpu.main.text}
              unit="%"
              color={gpu.main.color}
              className="text-[11px]"
            />
          </span>
        )}
        {temp && (
          <Value
            tokens={tokens}
            value={temp.value}
            unit="°C"
            color={temp.color}
            className="text-[11px]"
          />
        )}
        {cpu?.main && (
          <span className="flex items-baseline gap-1">
            <Label>CPU</Label>
            <Value
              tokens={tokens}
              value={cpu.main.text}
              unit="%"
              color={cpu.main.color}
              className="text-[11px]"
            />
          </span>
        )}
      </div>
    </HudPanel>
  )
}
