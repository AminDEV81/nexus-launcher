import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronDown,
  Layers,
  Play,
  Pause,
  Trash2,
  Check,
  CheckCircle2,
  HardDrive,
  Gauge,
  Clock,
  Gamepad2,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { assetUrl } from '@/lib/asset-url'
import { useLaunchGame } from '@/features/library/hooks/use-games'
import { useLaunchStore } from '@/store/launch-store'
import { useSmoothedSpeed } from '../hooks/use-smoothed-speed'
import { ChunkStreamVisualizer } from './chunk-stream-visualizer'
import type { DownloadInfo } from '@/services/download'
import type { Game } from '@/types/models'

export interface GroupedDownloadItem {
  key: string
  gameId: string
  gameName: string
  coverUrl: string | null
  parts: DownloadInfo[]
  totalBytes: number
  downloadedBytes: number
  speedBps: number
  status: 'downloading' | 'extracting' | 'completed' | 'queued' | 'paused' | 'failed'
  isInstalled?: boolean
  savePath: string
}

interface GroupedDownloadCardProps {
  group: GroupedDownloadItem
  game?: Game
  onPausePart: (id: string) => void
  onResumePart: (id: string) => void
  onQueuePart?: (id: string, queue: boolean) => void
  onQueueBundle?: (gameId: string | undefined, savePath: string, queue: boolean) => void
  onCancelPart: (id: string) => void
  onDeleteGroup: (group: GroupedDownloadItem) => void
  busy?: boolean
}

function formatBytes(b: number) {
  if (b === 0) return '0 B'
  const gb = b / (1024 * 1024 * 1024)
  if (gb >= 1) return `${gb.toFixed(2)} GB`
  const mb = b / (1024 * 1024)
  return `${mb.toFixed(1)} MB`
}

function formatSpeed(bps: number) {
  if (bps <= 0) return '0 B/s'
  const mbps = bps / (1024 * 1024)
  if (mbps >= 1) return `${mbps.toFixed(1)} MB/s`
  const kbps = bps / 1024
  return `${kbps.toFixed(0)} KB/s`
}

export function GroupedDownloadCard({
  group,
  game,
  onPausePart,
  onResumePart,
  onQueuePart,
  onQueueBundle,
  onCancelPart,
  onDeleteGroup,
  busy,
}: GroupedDownloadCardProps) {
  const [expanded, setExpanded] = useState(false)
  const launchGame = useLaunchGame()
  const runningGameIds = useLaunchStore((s) => s.runningGameIds)
  const isRunning = game ? runningGameIds.has(game.id) : false

  const pct = group.totalBytes > 0 ? (group.downloadedBytes / group.totalBytes) * 100 : 0
  const active = group.status === 'downloading' || group.status === 'extracting'
  const done = group.status === 'completed'
  const queued = group.status === 'queued'
  const paused = group.status === 'paused'
  const failed = group.status === 'failed'
  const extracting = group.status === 'extracting'
  const extractingPart = group.parts.find((p) => p.status === 'extracting')
  const extractPct =
    extractingPart?.extract_percent ??
    (extractingPart && extractingPart.speed_bps <= 100 ? extractingPart.speed_bps : 0)

  const completedPartsCount = group.parts.filter((p) => p.status === 'completed').length

  const remainingBytes = Math.max(0, group.totalBytes - group.downloadedBytes)
  const isDownloading = group.status === 'downloading'
  const { smoothedSpeed, etaText } = useSmoothedSpeed(group.speedBps, remainingBytes, isDownloading)

  function handlePauseAll() {
    for (const p of group.parts) {
      if (p.status === 'downloading' || p.status === 'extracting' || p.status === 'queued') {
        onPausePart(p.id)
      }
    }
  }

  function handleResumeAll() {
    for (const p of group.parts) {
      if (p.status === 'paused' || p.status === 'queued') {
        onResumePart(p.id)
      }
    }
  }

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-2xl border transition-all duration-300',
        active
          ? 'border-accent/40 bg-gradient-to-r from-surface-raised/90 via-surface/80 to-surface/90 shadow-md shadow-accent/5'
          : done
            ? 'border-emerald-500/30 bg-surface/70 shadow-sm'
            : queued
              ? 'border-amber-500/30 bg-gradient-to-r from-amber-500/5 via-surface/80 to-surface/90'
              : 'border-border/80 bg-surface/60 hover:border-border hover:bg-surface/80',
      )}
    >
      <div className="p-4 sm:p-5">
        <div className="flex items-start gap-4">
          {/* Cover Art */}
          <div className="relative size-16 shrink-0 overflow-hidden rounded-2xl border border-border/80 bg-bg shadow-sm sm:size-20">
            {group.coverUrl ? (
              <img
                src={assetUrl(group.coverUrl) ?? group.coverUrl}
                alt={group.gameName}
                className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
            ) : (
              <div className="flex size-full items-center justify-center bg-accent/15 text-accent">
                <Gamepad2 className="size-8" />
              </div>
            )}
            <span className="absolute bottom-1 right-1 flex items-center gap-0.5 rounded-md bg-black/85 px-1.5 py-0.5 text-[9px] font-bold text-white shadow-xs">
              <Layers className="size-2.5 text-accent" />
              {group.parts.length}P
            </span>
          </div>

          {/* Info & Main Status */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-base font-bold text-text">{group.gameName}</h3>
              <span className="flex items-center gap-1 rounded-full border border-accent/30 bg-accent/15 px-2 py-0.5 text-[10px] font-bold text-accent">
                <Layers className="size-3" />
                Multi-Part Bundle ({completedPartsCount}/{group.parts.length} Completed)
              </span>
              {queued && (
                <span className="flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-400">
                  <Clock className="size-3" />
                  In Queue
                </span>
              )}
            </div>

            <p className="mt-0.5 truncate text-xs text-subtle font-mono">
              <span>{formatBytes(group.downloadedBytes)}</span>
              {group.totalBytes > 0 && <span> / {formatBytes(group.totalBytes)}</span>}
              <span className="text-muted"> · {group.savePath}</span>
            </p>
          </div>

          {/* Master Toolbar Actions */}
          <div className="flex items-center gap-1.5">
            {done && game?.is_installed && (
              <button
                type="button"
                onClick={() => game && launchGame.mutate(game.id)}
                disabled={launchGame.isPending || isRunning}
                className="flex items-center gap-1.5 rounded-xl bg-accent px-3 py-1.5 text-xs font-bold text-white shadow-sm transition-all hover:bg-accent-hover active:scale-95 disabled:opacity-60"
              >
                <Play className="size-3.5 fill-current" />
                <span>{isRunning ? 'Running' : 'Play'}</span>
              </button>
            )}

            {/* In Queue Master Buttons */}
            {queued && (
              <>
                <button
                  type="button"
                  onClick={handleResumeAll}
                  disabled={busy}
                  title="Resume all parts immediately"
                  className="flex size-8 items-center justify-center rounded-xl bg-accent/15 text-accent ring-1 ring-accent/30 transition-all hover:bg-accent hover:text-white active:scale-95 disabled:opacity-50"
                >
                  <Play className="size-4 fill-current" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onQueueBundle
                      ? onQueueBundle(group.gameId, group.savePath, false)
                      : handlePauseAll()
                  }
                  disabled={busy}
                  title="Pause game bundle / Remove from queue"
                  className="flex size-8 items-center justify-center rounded-xl bg-surface-raised text-amber-400 ring-1 ring-amber-500/30 transition-all hover:bg-amber-500/20 active:scale-95 disabled:opacity-50"
                >
                  <Pause className="size-4" />
                </button>
              </>
            )}

            {/* Paused Master Buttons */}
            {(paused || failed) && (
              <>
                {onQueueBundle && (
                  <button
                    type="button"
                    onClick={() => onQueueBundle(group.gameId, group.savePath, true)}
                    disabled={busy}
                    title="Add all uncompleted parts to queue (One by One)"
                    className="flex size-8 items-center justify-center rounded-xl bg-surface-raised text-amber-400 ring-1 ring-border transition-all hover:bg-amber-500/15 hover:ring-amber-500/40 active:scale-95 disabled:opacity-50"
                  >
                    <Clock className="size-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleResumeAll}
                  disabled={busy}
                  title="Resume all parts simultaneously"
                  className="flex size-8 items-center justify-center rounded-xl bg-accent/15 text-accent ring-1 ring-accent/30 transition-all hover:bg-accent hover:text-white active:scale-95 disabled:opacity-50"
                >
                  <Play className="size-4 fill-current" />
                </button>
              </>
            )}

            {active && (
              <button
                type="button"
                onClick={handlePauseAll}
                disabled={busy}
                title="Pause all parts"
                className="flex size-8 items-center justify-center rounded-xl bg-surface-raised text-subtle ring-1 ring-border transition-all hover:bg-accent/15 hover:text-accent active:scale-95 disabled:opacity-50"
              >
                <Pause className="size-4" />
              </button>
            )}

            <button
              type="button"
              onClick={() => onDeleteGroup(group)}
              disabled={busy}
              title="Remove bundle from list"
              className="flex size-8 items-center justify-center rounded-xl bg-surface-raised text-subtle ring-1 ring-border transition-all hover:bg-red-500/15 hover:text-red-400 hover:ring-red-500/30 active:scale-95 disabled:opacity-50"
            >
              <Trash2 className="size-4" />
            </button>

            {/* Toggle Dropdown Accordion */}
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className={cn(
                'flex items-center gap-1 rounded-xl border border-border bg-surface px-2.5 py-1.5 text-xs font-semibold text-subtle transition-all hover:bg-surface-raised hover:text-text',
                expanded && 'border-accent/40 bg-accent/10 text-accent font-bold',
              )}
            >
              <span>{expanded ? 'Hide Parts' : `Parts (${group.parts.length})`}</span>
              <ChevronDown
                className={cn(
                  'size-3.5 transition-transform duration-200',
                  expanded && 'rotate-180',
                )}
              />
            </button>
          </div>
        </div>

        {/* Master Progress Bar & Telemetry */}
        <div className="mt-3.5 space-y-1.5">
          <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-bg/80 border border-border/40">
            <motion.div
              className={cn(
                'absolute inset-y-0 left-0 rounded-full transition-all',
                done
                  ? 'bg-gradient-to-r from-emerald-500 to-emerald-400 shadow-[0_0_12px_rgb(52_211_153/0.5)]'
                  : failed
                    ? 'bg-red-500'
                    : extracting
                      ? 'bg-gradient-to-r from-amber-500 to-amber-400 shadow-[0_0_12px_rgb(245_158_11/0.5)]'
                      : 'bg-gradient-to-r from-accent/80 to-accent shadow-[0_0_12px_color-mix(in_srgb,var(--color-accent)_70%,transparent)]',
              )}
              initial={false}
              animate={{ width: `${extracting ? extractPct : pct}%` }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            />
          </div>

          {active && !extracting && group.totalBytes > 0 && (
            <ChunkStreamVisualizer
              downloadedBytes={group.downloadedBytes}
              totalBytes={group.totalBytes}
              streamCount={8}
              speedBps={group.speedBps}
              className="mt-2"
            />
          )}

          {/* Footer Live Telemetry stats */}
          <div className="flex items-center justify-between text-[11px] pt-1">
            <div className="flex items-center gap-3 text-subtle">
              {active && !extracting && (
                <>
                  <span className="flex items-center gap-1 font-semibold text-text">
                    <Gauge className="size-3 text-accent" />
                    {formatSpeed(smoothedSpeed || group.speedBps)}
                  </span>
                  {etaText && (
                    <span className="flex items-center gap-1">
                      <Clock className="size-3 text-subtle" />
                      {etaText} remaining
                    </span>
                  )}
                </>
              )}
              {extracting && (
                <span className="flex items-center gap-1.5 font-semibold text-amber-400">
                  <HardDrive className="size-3 animate-bounce" />
                  Decompressing multi-part archive:{' '}
                  <strong className="font-mono text-text">{extractPct}%</strong>
                </span>
              )}
              {done && (
                <span className="flex items-center gap-1 text-emerald-400 font-medium">
                  <Check className="size-3" />
                  All {group.parts.length} parts downloaded & extracted successfully
                </span>
              )}
              {paused && (
                <span className="text-subtle">
                  Bundle paused at {formatBytes(group.downloadedBytes)} ({pct.toFixed(1)}%)
                </span>
              )}
            </div>

            {(group.totalBytes > 0 || extracting) && (
              <span className="font-mono text-xs font-bold text-text tabular-nums">
                {extracting ? `${extractPct}%` : `${pct.toFixed(1)}%`}
              </span>
            )}
          </div>
        </div>

        {/* Collapsible Accordion showing individual parts */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              className="overflow-hidden border-t border-border/70 mt-4 pt-3.5"
            >
              <div className="mb-2 text-[11px] font-bold text-subtle uppercase tracking-wider">
                Individual Volume Parts ({group.parts.length})
              </div>

              <div className="flex flex-col gap-2">
                {group.parts.map((part, idx) => {
                  const partPct =
                    part.total_bytes > 0 ? (part.downloaded_bytes / part.total_bytes) * 100 : 0
                  const partName =
                    part.file_path?.split(/[\\/]/).pop() ??
                    part.url.split('/').pop()?.split('?')[0] ??
                    `Part ${idx + 1}`

                  const isPartActive = part.status === 'downloading' || part.status === 'extracting'
                  const isPartDone = part.status === 'completed'
                  const isPartQueued = part.status === 'queued'
                  const isPartPaused = part.status === 'paused'

                  return (
                    <div
                      key={part.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-border/60 bg-bg/50 p-2.5 shadow-inner"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-surface-raised px-1.5 py-0.5 font-mono text-[10px] font-bold text-subtle">
                            P{idx + 1}
                          </span>
                          <span
                            className="truncate text-xs font-semibold text-text"
                            title={partName}
                          >
                            {partName}
                          </span>
                        </div>

                        {/* Part Mini progress bar */}
                        <div className="mt-1.5 flex items-center gap-2.5">
                          <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-surface-raised">
                            <div
                              className={cn(
                                'h-full rounded-full transition-all',
                                isPartDone
                                  ? 'bg-emerald-500'
                                  : isPartActive
                                    ? 'bg-accent'
                                    : isPartQueued
                                      ? 'bg-amber-400'
                                      : 'bg-subtle',
                              )}
                              style={{ width: `${partPct}%` }}
                            />
                          </div>
                          <span className="font-mono text-[10px] text-subtle">
                            {formatBytes(part.downloaded_bytes)} / {formatBytes(part.total_bytes)} (
                            {partPct.toFixed(0)}%)
                          </span>
                        </div>
                      </div>

                      {/* Part Status & Quick Controls */}
                      <div className="flex items-center gap-2 self-end sm:self-center">
                        {isPartActive && (
                          <span className="font-mono text-[10px] font-semibold text-accent">
                            {formatSpeed(part.speed_bps)}
                          </span>
                        )}
                        {isPartDone && (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400">
                            <CheckCircle2 className="size-3" />
                            Done
                          </span>
                        )}
                        {isPartQueued && (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-amber-400">
                            <Clock className="size-3" />
                            Queued
                          </span>
                        )}
                        {isPartPaused && (
                          <span className="text-[10px] text-subtle font-medium">Paused</span>
                        )}

                        {isPartActive && (
                          <button
                            type="button"
                            onClick={() => onPausePart(part.id)}
                            className="rounded-lg bg-surface p-1 text-subtle hover:bg-accent/15 hover:text-accent"
                            title="Pause this part"
                          >
                            <Pause className="size-3" />
                          </button>
                        )}
                        {isPartQueued && (
                          <>
                            <button
                              type="button"
                              onClick={() => onResumePart(part.id)}
                              className="rounded-lg bg-accent/15 p-1 text-accent hover:bg-accent hover:text-white"
                              title="Resume this part now"
                            >
                              <Play className="size-3 fill-current" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                onQueuePart ? onQueuePart(part.id, false) : onPausePart(part.id)
                              }
                              className="rounded-lg bg-surface p-1 text-amber-400 hover:bg-amber-500/20"
                              title="Remove from queue / Pause"
                            >
                              <Pause className="size-3" />
                            </button>
                          </>
                        )}
                        {isPartPaused && (
                          <>
                            {onQueuePart && (
                              <button
                                type="button"
                                onClick={() => onQueuePart(part.id, true)}
                                className="rounded-lg bg-surface p-1 text-amber-400 hover:bg-amber-500/20"
                                title="Add this part to queue"
                              >
                                <Clock className="size-3" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => onResumePart(part.id)}
                              className="rounded-lg bg-accent/15 p-1 text-accent hover:bg-accent hover:text-white"
                              title="Resume this part"
                            >
                              <Play className="size-3 fill-current" />
                            </button>
                          </>
                        )}
                        {!isPartDone && (
                          <button
                            type="button"
                            onClick={() => onCancelPart(part.id)}
                            className="rounded-lg bg-surface p-1 text-subtle hover:bg-red-500/15 hover:text-red-400"
                            title="Cancel this part"
                          >
                            <X className="size-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
