import { useEffect, useState, useMemo, useRef } from 'react'
import {
  Activity,
  ArrowUpRight,
  Clock,
  Gauge,
  HardDriveDownload,
  Layers,
  Zap,
} from 'lucide-react'
import type { DownloadInfo } from '@/services/download'
import { cn } from '@/lib/utils'

interface SpeedGraphProps {
  downloads: DownloadInfo[]
}

const MAX_HISTORY_POINTS = 64
const TICK_INTERVAL_MS = 120

function formatSpeed(bps: number, useBits = false) {
  if (bps <= 0) return useBits ? '0 Mbps' : '0.0 MB/s'
  if (useBits) {
    const mbps = (bps * 8) / (1000 * 1000)
    if (mbps >= 1) return `${mbps.toFixed(1)} Mbps`
    const kbps = (bps * 8) / 1000
    return `${kbps.toFixed(0)} Kbps`
  }
  const mbps = bps / (1024 * 1024)
  if (mbps >= 1) return `${mbps.toFixed(2)} MB/s`
  const kbps = bps / 1024
  return `${kbps.toFixed(0)} KB/s`
}

function formatBytes(bytes: number) {
  if (bytes <= 0) return '0 B'
  const gb = bytes / (1024 * 1024 * 1024)
  if (gb >= 1) return `${gb.toFixed(2)} GB`
  const mb = bytes / (1024 * 1024)
  return `${mb.toFixed(1)} MB`
}

function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—'
  if (seconds < 60) return `${Math.ceil(seconds)}s`
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  if (mins < 60) return `${mins}m ${secs}s`
  const hrs = Math.floor(mins / 60)
  const remMins = mins % 60
  return `${hrs}h ${remMins}m`
}

interface Point {
  x: number
  y: number
  rawSpeed: number
}

function buildCatmullRomSpline(points: Point[], height: number, width: number) {
  if (points.length === 0) {
    return { linePath: '', areaPath: '' }
  }
  if (points.length === 1) {
    return {
      linePath: `M ${points[0].x} ${points[0].y}`,
      areaPath: `M 0 ${height} L ${points[0].x} ${points[0].y} L ${width} ${height} Z`,
    }
  }

  let line = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[Math.min(points.length - 1, i + 2)]

    const tension = 0.24
    const cp1x = p1.x + (p2.x - p0.x) * tension
    const cp1y = Math.max(4, Math.min(height - 3, p1.y + (p2.y - p0.y) * tension))
    const cp2x = p2.x - (p3.x - p1.x) * tension
    const cp2y = Math.max(4, Math.min(height - 3, p2.y - (p3.y - p1.y) * tension))

    line += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`
  }

  const last = points[points.length - 1]
  const first = points[0]
  const area = `${line} L ${last.x.toFixed(1)} ${height} L ${first.x.toFixed(1)} ${height} Z`

  return { linePath: line, areaPath: area }
}

export function SpeedGraph({ downloads }: SpeedGraphProps) {
  const [history, setHistory] = useState<number[]>(() => Array(MAX_HISTORY_POINTS).fill(0))
  const [peakSpeed, setPeakSpeed] = useState(0)
  const [useBitsUnit, setUseBitsUnit] = useState(false)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const [wavePhase, setWavePhase] = useState(0)
  const svgContainerRef = useRef<HTMLDivElement>(null)

  // Instantaneous aggregate speed across all active downloads
  const currentSpeed = useMemo(
    () =>
      downloads
        .filter((d) => d.status === 'downloading')
        .reduce((sum, d) => sum + (d.speed_bps || 0), 0),
    [downloads],
  )

  const activeDownloads = useMemo(
    () => downloads.filter((d) => d.status === 'downloading' || d.status === 'extracting'),
    [downloads],
  )
  const activeCount = activeDownloads.length

  const totalDownloaded = useMemo(
    () => downloads.reduce((sum, d) => sum + (d.downloaded_bytes || 0), 0),
    [downloads],
  )

  const remainingBytes = useMemo(
    () =>
      downloads
        .filter((d) => d.status === 'downloading' && d.total_bytes > d.downloaded_bytes)
        .reduce((sum, d) => sum + (d.total_bytes - d.downloaded_bytes), 0),
    [downloads],
  )

  const estimatedEtaSeconds = useMemo(
    () => (currentSpeed > 0 && remainingBytes > 0 ? remainingBytes / currentSpeed : 0),
    [currentSpeed, remainingBytes],
  )

  const averageSpeed = useMemo(() => {
    const nonZero = history.filter((v) => v > 0)
    if (nonZero.length === 0) return 0
    return nonZero.reduce((a, b) => a + b, 0) / nonZero.length
  }, [history])

  const currentSpeedRef = useRef(currentSpeed)
  useEffect(() => {
    currentSpeedRef.current = currentSpeed
  }, [currentSpeed])

  const smoothedSpeedRef = useRef(0)
  const velocityRef = useRef(0)

  // High-frequency spring-damped telemetry sampler (120ms = ~8.3Hz rolling buffer with smooth physics)
  useEffect(() => {
    const interval = setInterval(() => {
      const target = currentSpeedRef.current
      const current = smoothedSpeedRef.current
      // Second-order spring-damper interpolation for silky-smooth organic curve transitions
      const stiffness = 0.28
      const damping = 0.62
      velocityRef.current = velocityRef.current * damping + (target - current) * stiffness
      const nextSmoothed = Math.max(0, current + velocityRef.current)
      smoothedSpeedRef.current = target === 0 && nextSmoothed < 2048 ? 0 : nextSmoothed

      setWavePhase((p) => (p + 0.35) % (Math.PI * 20))
      setHistory((prev) => [...prev.slice(1), smoothedSpeedRef.current])
      if (target > 0) {
        setPeakSpeed((prev) => Math.max(prev, target))
      }
    }, TICK_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [])

  const width = 760
  const height = 148
  const maxVal = Math.max(...history, peakSpeed * 1.08, 2 * 1024 * 1024) // min 2 MB/s scale

  const points: Point[] = useMemo(() => {
    return history.map((val, idx) => {
      const x = (idx / (MAX_HISTORY_POINTS - 1)) * width
      const normalized = Math.min(1, Math.max(0, val / maxVal))
      const y = height - normalized * (height - 26) - 10
      return {
        x: Number(x.toFixed(1)),
        y: Math.max(8, Math.min(height - 6, Number(y.toFixed(1)))),
        rawSpeed: val,
      }
    })
  }, [history, maxVal, width, height])

  // Secondary harmonic sub-wave for depth
  const harmonicPoints: Point[] = useMemo(() => {
    return points.map((p, idx) => {
      const harmonic =
        currentSpeed > 0 || p.rawSpeed > 0
          ? Math.sin(idx * 0.32 + wavePhase) * 4.5 + Math.cos(idx * 0.18 - wavePhase) * 2.5
          : 0
      const y = Math.min(height - 4, Math.max(10, p.y + 8 + harmonic))
      return { x: p.x, y: Number(y.toFixed(1)), rawSpeed: p.rawSpeed }
    })
  }, [points, currentSpeed, wavePhase, height])

  const { linePath, areaPath } = useMemo(
    () => buildCatmullRomSpline(points, height, width),
    [points, height, width],
  )
  const { linePath: harmonicLinePath, areaPath: harmonicAreaPath } = useMemo(
    () => buildCatmullRomSpline(harmonicPoints, height, width),
    [harmonicPoints, height, width],
  )

  const avgY = useMemo(() => {
    if (averageSpeed <= 0) return null
    const norm = Math.min(1, Math.max(0, averageSpeed / maxVal))
    return Math.max(10, Math.min(height - 8, height - norm * (height - 26) - 10))
  }, [averageSpeed, maxVal, height])

  const lastPoint = points[points.length - 1]
  const hoveredPoint = hoverIdx !== null && points[hoverIdx] ? points[hoverIdx] : null

  return (
    <div className="relative overflow-hidden rounded-3xl border border-border/80 bg-gradient-to-b from-surface-raised/95 via-surface to-surface p-5 shadow-md">
      {/* Ambient Cyber Glow */}
      <div
        className={cn(
          'pointer-events-none absolute -right-16 -top-16 size-64 rounded-full blur-3xl transition-opacity duration-700',
          currentSpeed > 0 ? 'bg-accent/20 opacity-100' : 'bg-accent/5 opacity-40',
        )}
      />
      <div
        className={cn(
          'pointer-events-none absolute -left-16 -bottom-16 size-56 rounded-full blur-3xl transition-opacity duration-700',
          currentSpeed > 0 ? 'bg-emerald-500/12 opacity-100' : 'opacity-0',
        )}
      />

      {/* Top Header & Telemetry Readout Deck */}
      <div className="relative z-10 mb-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        {/* Left: Primary Speed Hero & Unit Switcher */}
        <div className="flex items-center gap-3.5">
          <div
            className={cn(
              'relative flex size-12 shrink-0 items-center justify-center rounded-2xl ring-1 transition-all duration-300 shadow-inner',
              currentSpeed > 0
                ? 'bg-accent text-white ring-accent/50 shadow-[0_0_20px_var(--nx-accent)]'
                : 'bg-accent/12 text-accent ring-accent/25',
            )}
          >
            <Activity className={cn('size-6', currentSpeed > 0 && 'animate-pulse')} />
            {currentSpeed > 0 && (
              <span className="absolute -right-1 -top-1 flex size-3">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex size-3 rounded-full bg-emerald-500" />
              </span>
            )}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] font-extrabold uppercase tracking-[0.2em] text-accent">
                BANDWIDTH TELEMETRY OSCILLOSCOPE
              </span>
              <button
                type="button"
                onClick={() => setUseBitsUnit((u) => !u)}
                title="Toggle between MB/s (Megabytes) and Mbps (Megabits)"
                className="rounded-md border border-border/80 bg-surface-raised px-1.5 py-0.5 font-mono text-[9.5px] font-bold text-subtle hover:border-accent/40 hover:text-accent transition-colors cursor-pointer"
              >
                {useBitsUnit ? 'UNIT: Mbps' : 'UNIT: MB/s'}
              </button>
            </div>

            <div className="mt-0.5 flex items-baseline gap-3">
              <span className="font-mono text-3xl font-black tracking-tight text-text sm:text-4xl">
                {formatSpeed(hoveredPoint ? hoveredPoint.rawSpeed : currentSpeed, useBitsUnit)}
              </span>
              <span className="font-mono text-xs font-bold text-muted">
                {hoveredPoint
                  ? 'Sampled Point'
                  : formatSpeed(currentSpeed, !useBitsUnit)}
              </span>
            </div>
          </div>
        </div>

        {/* Right: 4-Pillar Telemetry Stat Chips */}
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <div className="flex flex-col justify-between rounded-2xl border border-border/75 bg-surface/85 px-3.5 py-2 shadow-2xs">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-subtle">
              <span>Peak Velocity</span>
              <ArrowUpRight className="size-3.5 text-emerald-400" />
            </div>
            <div className="mt-1 font-mono text-sm font-black text-emerald-400">
              {formatSpeed(peakSpeed, useBitsUnit)}
            </div>
          </div>

          <div className="flex flex-col justify-between rounded-2xl border border-border/75 bg-surface/85 px-3.5 py-2 shadow-2xs">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-subtle">
              <span>Avg Velocity</span>
              <Gauge className="size-3.5 text-cyan-400" />
            </div>
            <div className="mt-1 font-mono text-sm font-black text-cyan-400">
              {formatSpeed(averageSpeed, useBitsUnit)}
            </div>
          </div>

          <div className="flex flex-col justify-between rounded-2xl border border-border/75 bg-surface/85 px-3.5 py-2 shadow-2xs">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-subtle">
              <span>Transferred</span>
              <HardDriveDownload className="size-3.5 text-accent" />
            </div>
            <div className="mt-1 font-mono text-sm font-black text-text">
              {formatBytes(totalDownloaded)}
            </div>
          </div>

          <div className="flex flex-col justify-between rounded-2xl border border-border/75 bg-surface/85 px-3.5 py-2 shadow-2xs">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-subtle">
              <span>Est. Remaining</span>
              <Clock className="size-3.5 text-amber-400" />
            </div>
            <div className="mt-1 font-mono text-sm font-black text-amber-400">
              {activeCount > 0 ? formatEta(estimatedEtaSeconds) : 'Idle'}
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Oscilloscope Waveform Stage */}
      <div
        ref={svgContainerRef}
        onMouseMove={(e) => {
          if (!svgContainerRef.current) return
          const rect = svgContainerRef.current.getBoundingClientRect()
          const relX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
          const idx = Math.round(relX * (MAX_HISTORY_POINTS - 1))
          setHoverIdx(idx)
        }}
        onMouseLeave={() => setHoverIdx(null)}
        className="relative h-[148px] w-full overflow-hidden rounded-2xl border border-border/60 bg-bg/75 shadow-inner cursor-crosshair select-none"
      >
        {/* Subtle Cyber Matrix Background Grid */}
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              'linear-gradient(to right, var(--color-border) 1px, transparent 1px), linear-gradient(to bottom, var(--color-border) 1px, transparent 1px)',
            backgroundSize: '32px 28px',
          }}
        />

        {/* Y-Axis Scale Labels */}
        <div className="pointer-events-none absolute right-2.5 top-2 z-20 flex flex-col items-end gap-0.5">
          <span className="rounded bg-surface/80 px-1.5 py-0.5 font-mono text-[9px] font-bold text-subtle backdrop-blur-xs">
            MAX {formatSpeed(maxVal, useBitsUnit)}
          </span>
        </div>
        <div className="pointer-events-none absolute right-2.5 bottom-2 z-20">
          <span className="rounded bg-surface/80 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-subtle/80">
            0 B/s
          </span>
        </div>

        {/* Status Pill Top-Left */}
        <div className="pointer-events-none absolute left-3 top-2.5 z-20 flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-surface/85 px-2.5 py-0.5 font-mono text-[10px] font-bold text-text backdrop-blur-md">
            <span
              className={cn(
                'size-2 rounded-full',
                activeCount > 0
                  ? 'bg-emerald-400 shadow-[0_0_8px_#34d399] animate-pulse'
                  : 'bg-subtle',
              )}
            />
            <span>
              {activeCount > 0
                ? `${activeCount} Active Stream${activeCount > 1 ? 's' : ''}`
                : 'Telemetry Standby'}
            </span>
          </span>
          {activeCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/15 px-2 py-0.5 font-mono text-[9.5px] font-extrabold text-accent">
              <Zap className="size-2.5 fill-current" />
              <span>MULTI-THREAD TURBO</span>
            </span>
          )}
        </div>

        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="size-full overflow-visible"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="nxSpeedPrimaryGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--nx-accent, #7c5cff)" stopOpacity="0.55" />
              <stop offset="55%" stopColor="var(--nx-accent, #7c5cff)" stopOpacity="0.18" />
              <stop offset="100%" stopColor="var(--nx-accent, #7c5cff)" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="nxSpeedHarmonicGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="nxSpeedStrokeGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.5" />
              <stop offset="50%" stopColor="var(--nx-accent, #7c5cff)" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="1" />
            </linearGradient>
            <filter id="nxNeonGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3.5" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Average Speed Reference Line */}
          {avgY !== null && averageSpeed > 0 && (
            <g>
              <line
                x1={0}
                y1={avgY}
                x2={width}
                y2={avgY}
                stroke="#06b6d4"
                strokeWidth="1"
                strokeDasharray="5 5"
                strokeOpacity="0.5"
              />
            </g>
          )}

          {/* Secondary Harmonic Wave Fill & Line */}
          {harmonicAreaPath && (
            <path d={harmonicAreaPath} fill="url(#nxSpeedHarmonicGrad)" />
          )}
          {harmonicLinePath && (
            <path
              d={harmonicLinePath}
              fill="none"
              stroke="#06b6d4"
              strokeOpacity="0.4"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          )}

          {/* Primary Spline Area Fill */}
          {areaPath && <path d={areaPath} fill="url(#nxSpeedPrimaryGrad)" />}

          {/* Primary Spline Glowing Stroke */}
          {linePath && (
            <path
              d={linePath}
              fill="none"
              stroke="url(#nxSpeedStrokeGrad)"
              strokeWidth="2.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="url(#nxNeonGlow)"
            />
          )}

          {/* Vertical Spectrum Bars along the bottom for tactile hardware feel */}
          {points.map((pt, idx) => {
            if (idx % 2 !== 0) return null
            const barH = Math.max(2, ((height - pt.y) / height) * 26)
            return (
              <rect
                key={idx}
                x={pt.x - 2}
                y={height - barH}
                width={3}
                height={barH}
                rx={1.5}
                fill="var(--nx-accent, #7c5cff)"
                opacity={pt.rawSpeed > 0 ? 0.32 : 0.08}
              />
            )
          })}

          {/* Hover Crosshair & Sample Beacon */}
          {hoveredPoint && (
            <g>
              <line
                x1={hoveredPoint.x}
                y1={0}
                x2={hoveredPoint.x}
                y2={height}
                stroke="var(--nx-accent, #7c5cff)"
                strokeWidth="1.2"
                strokeDasharray="3 3"
              />
              <circle
                cx={hoveredPoint.x}
                cy={hoveredPoint.y}
                r="5.5"
                fill="var(--nx-accent, #7c5cff)"
                stroke="#fff"
                strokeWidth="2"
              />
            </g>
          )}

          {/* Leading-Edge Live Plasma Beacon */}
          {lastPoint && currentSpeed > 0 && (
            <g>
              <circle
                cx={lastPoint.x}
                cy={lastPoint.y}
                r="11"
                fill="#10b981"
                opacity="0.22"
              >
                <animate
                  attributeName="r"
                  values="5;14;5"
                  dur="1.6s"
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="opacity"
                  values="0.45;0.05;0.45"
                  dur="1.6s"
                  repeatCount="indefinite"
                />
              </circle>
              <circle
                cx={lastPoint.x}
                cy={lastPoint.y}
                r="4.2"
                fill="#10b981"
                stroke="#ffffff"
                strokeWidth="1.8"
              />
            </g>
          )}
        </svg>
      </div>

      {/* Bottom Multi-Channel Activity Strip */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
        <div className="flex items-center gap-2">
          <Layers className="size-3.5 text-accent" />
          <span>
            {activeCount > 0
              ? `Streaming across parallel HTTP Range segments • Smooth Catmull-Rom telemetry`
              : 'Hover anywhere on the oscilloscope to inspect historical throughput samples'}
          </span>
        </div>
        <div className="flex items-center gap-3 font-mono text-[10px]">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-accent" />
            <span>Primary Throughput</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-cyan-400" />
            <span>Avg Baseline</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-emerald-400" />
            <span>Live Crest</span>
          </span>
        </div>
      </div>
    </div>
  )
}
