import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Network } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ChunkStreamVisualizerProps {
  downloadedBytes: number
  totalBytes: number
  chunks?: number[]
  streamCount?: number
  speedBps?: number
  className?: string
}

export function ChunkStreamVisualizer({
  downloadedBytes,
  totalBytes,
  chunks,
  streamCount = 8,
  speedBps = 0,
  className,
}: ChunkStreamVisualizerProps) {
  const overallPct = totalBytes > 0 ? (downloadedBytes / totalBytes) * 100 : 0
  const activeStreamCount = chunks && chunks.length > 0 ? chunks.length : Math.max(1, streamCount)

  // Use true per-stream chunk percentages from the engine, or concurrent thread distribution
  const segments = useMemo(() => {
    if (chunks && chunks.length > 0) {
      return chunks.map((pct, idx) => ({
        id: idx,
        progress: pct,
        isComplete: pct >= 100,
        isActive: pct > 0 && pct < 100 && speedBps > 0,
      }))
    }

    // Concurrent multi-stream simulation when engine hasn't probed range yet
    const count = Math.max(1, streamCount)
    const list = []
    for (let i = 0; i < count; i++) {
      const jitter = ((i * 11) % 7) - 3
      const streamProgress =
        overallPct >= 100
          ? 100
          : overallPct <= 0
            ? 0
            : Math.min(99, Math.max(1, overallPct + jitter))
      list.push({
        id: i,
        progress: streamProgress,
        isComplete: streamProgress >= 100,
        isActive: streamProgress > 0 && streamProgress < 100 && speedBps > 0,
      })
    }
    return list
  }, [chunks, overallPct, streamCount, speedBps])

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-center justify-between text-[10px] font-semibold text-subtle">
        <span className="flex items-center gap-1">
          <Network className="size-3 text-accent" />
          <span>IDM Parallel Threads ({activeStreamCount}x)</span>
        </span>
        <span className="font-mono">{overallPct.toFixed(1)}%</span>
      </div>

      {/* IDM-Style Segmented Connection Grid */}
      <div className="flex h-2.5 w-full gap-1 overflow-hidden rounded-md bg-surface-raised/80 p-0.5 ring-1 ring-border/50">
        {segments.map((seg) => (
          <div
            key={seg.id}
            className="relative flex-1 overflow-hidden rounded-sm bg-bg/80 shadow-inner"
            title={`Thread ${seg.id + 1}: ${seg.progress.toFixed(0)}%`}
          >
            <motion.div
              className={cn(
                'h-full rounded-sm transition-all duration-300',
                seg.isComplete
                  ? 'bg-emerald-500 shadow-sm shadow-emerald-500/40'
                  : seg.isActive
                    ? 'bg-gradient-to-r from-accent to-accent-hover shadow-sm shadow-accent/40'
                    : 'bg-accent/30',
              )}
              style={{ width: `${seg.progress}%` }}
            />
            {seg.isActive && (
              <span className="absolute inset-0 bg-white/20 animate-pulse pointer-events-none" />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
