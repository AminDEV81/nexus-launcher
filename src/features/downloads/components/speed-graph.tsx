import { useEffect, useState, useMemo, useRef } from 'react'
import { Activity, ArrowUpRight, HardDriveDownload, Zap } from 'lucide-react'
import type { DownloadInfo } from '@/services/download'

interface SpeedGraphProps {
  downloads: DownloadInfo[]
}

const MAX_HISTORY_POINTS = 50
const TICK_INTERVAL_MS = 500

function formatSpeed(bps: number) {
  if (bps <= 0) return '0 B/s'
  const mbps = bps / (1024 * 1024)
  if (mbps >= 1) return `${mbps.toFixed(1)} MB/s`
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

interface Point {
  x: number
  y: number
}

function buildSmoothSpline(points: Point[], height: number, width: number) {
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

    // Gentle cubic Bézier tension for natural sea wave fluidity
    const tension = 0.22
    const cp1x = p1.x + (p2.x - p0.x) * tension
    const cp1y = p1.y + (p2.y - p0.y) * tension
    const cp2x = p2.x - (p3.x - p1.x) * tension
    const cp2y = p2.y - (p3.y - p1.y) * tension

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

  // Calculate instantaneous aggregate speed across all active downloads
  const currentSpeed = useMemo(
    () =>
      downloads
        .filter((d) => d.status === 'downloading')
        .reduce((sum, d) => sum + (d.speed_bps || 0), 0),
    [downloads],
  )

  const activeCount = downloads.filter(
    (d) => d.status === 'downloading' || d.status === 'extracting',
  ).length
  const totalDownloaded = useMemo(
    () => downloads.reduce((sum, d) => sum + (d.downloaded_bytes || 0), 0),
    [downloads],
  )

  const currentSpeedRef = useRef(currentSpeed)
  useEffect(() => {
    currentSpeedRef.current = currentSpeed
  }, [currentSpeed])

  const smoothedSpeedRef = useRef(0)
  // Continuous fluid ticker with soft exponential dampening
  useEffect(() => {
    const interval = setInterval(() => {
      const rawSpeed = currentSpeedRef.current
      const alpha = 0.38
      smoothedSpeedRef.current = Math.round(
        smoothedSpeedRef.current * (1 - alpha) + rawSpeed * alpha,
      )
      const nextVal = rawSpeed > 0 ? Math.max(smoothedSpeedRef.current, rawSpeed * 0.15) : 0

      setHistory((prev) => [...prev.slice(1), nextVal])
      setPeakSpeed((prev) => Math.max(prev, rawSpeed))
    }, TICK_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [])

  // SVG dimensions
  const width = 600
  const height = 90
  const maxVal = Math.max(...history, peakSpeed, 1024 * 1024) // minimum scale 1 MB/s

  // Compute primary smooth curve points
  const points = useMemo(() => {
    return history.map((val, idx) => {
      const x = (idx / (MAX_HISTORY_POINTS - 1)) * width
      const y = height - (val / maxVal) * (height - 18) - 6
      return {
        x: Number(x.toFixed(1)),
        y: Math.max(4, Math.min(height - 2, Number(y.toFixed(1)))),
      }
    })
  }, [history, maxVal, width, height])

  // Secondary soft wave points for depth and organic sea wave feel
  const secondaryPoints = useMemo(() => {
    return points.map((p, idx) => {
      const waveOffset = currentSpeed > 0 ? Math.sin(idx * 0.5) * 3 : 0
      const y = Math.min(height - 2, Math.max(5, p.y + 4 + waveOffset))
      return { x: p.x, y: Number(y.toFixed(1)) }
    })
  }, [points, currentSpeed, height])

  const { linePath, areaPath } = useMemo(
    () => buildSmoothSpline(points, height, width),
    [points, height, width],
  )
  const { linePath: secondaryLinePath, areaPath: secondaryAreaPath } = useMemo(
    () => buildSmoothSpline(secondaryPoints, height, width),
    [secondaryPoints, height, width],
  )

  const lastPoint = points[points.length - 1]

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-gradient-to-b from-surface-raised via-surface to-surface p-4 shadow-sm">
      {/* Ambient background glow */}
      {currentSpeed > 0 && (
        <div className="pointer-events-none absolute -right-10 -top-10 size-48 rounded-full bg-accent/10 blur-3xl transition-opacity duration-500" />
      )}

      {/* Top Bar / Live Metrics */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-accent/15 text-accent ring-1 ring-accent/30 shadow-inner">
            <Activity className="size-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-2xl font-black tracking-tight text-text">
                {formatSpeed(currentSpeed)}
              </span>
              <span className="font-mono text-xs font-semibold text-accent uppercase tracking-wider">
                Current Speed
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-subtle">
              <span className="flex items-center gap-1">
                <ArrowUpRight className="size-3 text-emerald-400" />
                Peak: <strong className="font-mono text-text">{formatSpeed(peakSpeed)}</strong>
              </span>
              <span>·</span>
              <span className="flex items-center gap-1">
                <HardDriveDownload className="size-3 text-accent" />
                Total:{' '}
                <strong className="font-mono text-text">{formatBytes(totalDownloaded)}</strong>
              </span>
            </div>
          </div>
        </div>

        {/* Active badge */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold text-text shadow-sm">
            <span
              className={`size-2 rounded-full transition-colors duration-300 ${
                activeCount > 0 ? 'bg-accent animate-ping' : 'bg-subtle'
              }`}
            />
            <span>
              {activeCount > 0
                ? `${activeCount} Active Download${activeCount > 1 ? 's' : ''}`
                : 'Queue Idle'}
            </span>
            {activeCount > 0 && (
              <span className="flex items-center gap-1 font-mono text-[10px] font-bold text-accent">
                <Zap className="size-3 fill-current" />
                LIVE
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Steam/IDM-Style Rolling Speed Waveform Graph */}
      <div className="relative h-[90px] w-full overflow-hidden rounded-xl border border-border/40 bg-bg/50">
        {/* Horizontal grid lines */}
        <div className="absolute inset-0 flex flex-col justify-between p-1.5 opacity-15 pointer-events-none">
          <div className="border-b border-text/40 border-dashed" />
          <div className="border-b border-text/40 border-dashed" />
          <div className="border-b border-text/40 border-dashed" />
        </div>

        {/* Max speed label */}
        <span className="absolute right-2 top-1 font-mono text-[9px] font-semibold text-subtle/70">
          {formatSpeed(maxVal)}
        </span>
        <span className="absolute right-2 bottom-1 font-mono text-[9px] font-semibold text-subtle/70">
          0 B/s
        </span>

        {/* Graph SVG */}
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="size-full overflow-visible preserve-3d"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="speedAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--nx-accent, #6366f1)" stopOpacity="0.45" />
              <stop offset="65%" stopColor="var(--nx-accent, #6366f1)" stopOpacity="0.12" />
              <stop offset="100%" stopColor="var(--nx-accent, #6366f1)" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="speedAreaGradSecondary" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--nx-accent, #6366f1)" stopOpacity="0.25" />
              <stop offset="100%" stopColor="var(--nx-accent, #6366f1)" stopOpacity="0.0" />
            </linearGradient>
            <filter id="speedGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Secondary gentle ocean wave layer */}
          {secondaryAreaPath && (
            <path
              d={secondaryAreaPath}
              fill="url(#speedAreaGradSecondary)"
              className="transition-all duration-500 ease-out opacity-60"
            />
          )}

          {/* Primary wave area fill */}
          <path
            d={areaPath}
            fill="url(#speedAreaGrad)"
            className="transition-all duration-500 ease-out"
          />

          {/* Secondary subtle wave contour */}
          {secondaryLinePath && (
            <path
              d={secondaryLinePath}
              fill="none"
              stroke="var(--nx-accent, #6366f1)"
              strokeWidth="1.2"
              strokeOpacity="0.35"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="transition-all duration-500 ease-out"
            />
          )}

          {/* Primary Smooth Stroke Line */}
          <path
            d={linePath}
            fill="none"
            stroke="var(--nx-accent, #6366f1)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="url(#speedGlow)"
            className="transition-all duration-500 ease-out"
          />

          {/* Leading Edge Glowing Pulse Point */}
          {lastPoint && currentSpeed > 0 && (
            <g transform={`translate(${lastPoint.x}, ${lastPoint.y})`}>
              <circle
                r="6"
                fill="var(--nx-accent, #6366f1)"
                opacity="0.3"
                className="animate-ping"
              />
              <circle r="3.5" fill="var(--nx-accent, #6366f1)" stroke="#ffffff" strokeWidth="1.5" />
            </g>
          )}
        </svg>
      </div>
    </div>
  )
}
