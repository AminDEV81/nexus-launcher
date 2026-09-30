import React, { useId, useMemo } from 'react'
import type { ThemeVisualTokens } from '../themes/theme-tokens'

interface FrametimeGraphProps {
  history: number[]
  tokens: ThemeVisualTokens
  width?: number
  height?: number
}

const FRAME_60 = 1000 / 60
const FRAME_30 = 1000 / 30

export const FrametimeGraph: React.FC<FrametimeGraphProps> = ({
  history,
  tokens,
  width = 160,
  height = 36,
}) => {
  const gradientId = useId()

  const model = useMemo(() => {
    const samples = (history ?? []).slice(-60).filter((v) => Number.isFinite(v) && v > 0)
    if (samples.length < 2) return null

    const avg = samples.reduce((a, b) => a + b, 0) / samples.length
    const max = Math.max(...samples)
    // Scale to the data (never below the 30 FPS line), so the ref lines mean something.
    const yMax = Math.max(FRAME_30 * 1.15, max * 1.1)
    const toY = (ms: number) => height - 2 - (Math.min(ms, yMax) / yMax) * (height - 4)
    const step = width / Math.max(samples.length - 1, 1)

    const coords = samples.map((v, i) => [i * step, toY(v)] as const)
    const line = coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
    const area = `M 0,${height} L ${line.replace(/ /g, ' L ')} L ${width},${height} Z`
    // Stutter frames: more than 2x the average frame time.
    const spikes = coords.filter((_, i) => samples[i] > avg * 2 && samples[i] > FRAME_60)

    return { avg, max, line, area, spikes, y60: toY(FRAME_60), y30: toY(FRAME_30), yMax }
  }, [history, width, height])

  if (!model) return null

  return (
    <div className="mt-1 flex flex-col gap-0.5">
      <div className="flex items-center justify-between font-mono text-[8px] opacity-70">
        <span>FRAME TIME</span>
        <span>
          avg {model.avg.toFixed(1)} · max {model.max.toFixed(1)} ms
        </span>
      </div>
      <svg
        width={width}
        height={height}
        className="overflow-visible rounded border border-white/5 bg-black/40"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={tokens.graphLineColor} stopOpacity="0.45" />
            <stop offset="100%" stopColor={tokens.graphLineColor} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Reference lines at the real 60 / 30 FPS frame times. */}
        <line
          x1={0}
          x2={width}
          y1={model.y60}
          y2={model.y60}
          stroke="rgba(255,255,255,0.22)"
          strokeDasharray="2,3"
        />
        <text
          x={width - 2}
          y={model.y60 - 2}
          textAnchor="end"
          fontSize="6"
          fill="rgba(255,255,255,0.45)"
        >
          60
        </text>
        {model.y30 > 2 && model.yMax >= FRAME_30 && (
          <>
            <line
              x1={0}
              x2={width}
              y1={model.y30}
              y2={model.y30}
              stroke="rgba(255,255,255,0.14)"
              strokeDasharray="2,3"
            />
            <text
              x={width - 2}
              y={model.y30 - 2}
              textAnchor="end"
              fontSize="6"
              fill="rgba(255,255,255,0.35)"
            >
              30
            </text>
          </>
        )}

        <path d={model.area} fill={`url(#${gradientId})`} />
        <polyline
          fill="none"
          stroke={tokens.graphLineColor}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          points={model.line}
        />
        {model.spikes.map(([x, y]) => (
          <circle key={`${x}`} cx={x} cy={y} r={1.8} fill={tokens.dangerColor} />
        ))}
      </svg>
    </div>
  )
}
