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
  const gpuTemp = gpu?.stats.find((s) => s.key === 'temp')
  const cpuTemp = cpu?.stats.find((s) => s.key === 'temp')

  return (
    <HudPanel tokens={{ ...tokens, cornerStyle: 'pill' }} className="w-fit px-4 py-2">
      <div className="flex items-center gap-3">
        <StatusDot color={color} />
        {model.fps.show && (
          <div className="flex items-baseline gap-1">
            <span
              className={`font-mono text-[22px] font-black tabular-nums leading-none ${tokens.primaryTextColor}`}
              style={{ color: model.fps.color, textShadow: `0 0 12px ${color}66` }}
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
            className="text-[11px] font-semibold"
          />
        )}
        {(gpu?.main || gpuTemp) && (
          <div className="flex items-baseline gap-1.5 border-l border-white/15 pl-3">
            <Label>GPU</Label>
            {gpu?.main && (
              <Value
                tokens={tokens}
                value={gpu.main.text}
                unit="%"
                color={gpu.main.color}
                strong
                className="text-[11.5px] font-bold"
              />
            )}
            {gpuTemp && (
              <Value
                tokens={tokens}
                value={gpuTemp.value}
                unit="°C"
                color={gpuTemp.color}
                className="text-[11px] font-semibold"
              />
            )}
          </div>
        )}
        {(cpu?.main || cpuTemp) && (
          <div className="flex items-baseline gap-1.5 border-l border-white/15 pl-3">
            <Label>CPU</Label>
            {cpu?.main && (
              <Value
                tokens={tokens}
                value={cpu.main.text}
                unit="%"
                color={cpu.main.color}
                strong
                className="text-[11.5px] font-bold"
              />
            )}
            {cpuTemp && (
              <Value
                tokens={tokens}
                value={cpuTemp.value}
                unit="°C"
                color={cpuTemp.color}
                className="text-[11px] font-semibold"
              />
            )}
          </div>
        )}
      </div>
    </HudPanel>
  )
}
