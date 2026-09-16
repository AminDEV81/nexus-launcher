import { motion } from 'framer-motion'
import {
  Pause,
  Play,
  X,
  Check,
  AlertCircle,
  RotateCcw,
  Trash2,
  FolderOpen,
  FileArchive,
  Gamepad2,
  Sparkles,
  Gauge,
  Clock,
  HardDrive,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { assetUrl } from '@/lib/asset-url'
import { useLaunchGame } from '@/features/library/hooks/use-games'
import { useUiStore } from '@/store/ui-store'
import { useLaunchStore } from '@/store/launch-store'
import { useSettings } from '@/features/settings/hooks/use-settings'
import { useSmoothedSpeed } from '../hooks/use-smoothed-speed'
import { ChunkStreamVisualizer } from './chunk-stream-visualizer'
import type { DownloadInfo } from '@/services/download'
import type { Game } from '@/types/models'

function formatBytes(b: number) {
  if (b === 0) return '0 B'
  const k = 1024
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(b) / Math.log(k)), units.length - 1)
  return `${(b / k ** i).toFixed(1)} ${units[i]}`
}

function formatSpeed(bps: number) {
  if (bps === 0) return '—'
  return `${formatBytes(bps)}/s`
}

/** Display name: the resolved on-disk file name (server-provided after
 *  the probe) with the URL's last segment as a pre-probe fallback. */
function displayName(d: DownloadInfo) {
  const fromPath = d.file_path ? (d.file_path.split(/[\\/]/).pop() ?? '') : ''
  return fromPath || d.url.split('/').pop()?.split('?')[0] || 'download'
}

interface Props {
  download: DownloadInfo
  game?: Game
  onPause: (id: string) => void
  onResume: (id: string) => void
  onQueue?: (id: string, queue: boolean) => void
  queuePosition?: number | null
  onCancel: (id: string) => void
  onDelete: (id: string) => void
  busy: boolean
}

export function DownloadCard({
  download: d,
  game,
  onPause,
  onResume,
  onQueue,
  queuePosition,
  onCancel,
  onDelete,
  busy,
}: Props) {
  const pct = d.total_bytes > 0 ? Math.min((d.downloaded_bytes / d.total_bytes) * 100, 100) : 0
  const active = d.status === 'downloading' || d.status === 'extracting'
  const extracting = d.status === 'extracting'
  const extractPct = d.extract_percent ?? (extracting && d.speed_bps <= 100 ? d.speed_bps : 0)
  const queued = d.status === 'queued'
  const paused = d.status === 'paused'
  const done = d.status === 'completed'
  const failed = d.status === 'failed'
  const fileName = displayName(d)

  const remainingBytes = d.total_bytes > d.downloaded_bytes ? d.total_bytes - d.downloaded_bytes : 0
  const isDownloading = d.status === 'downloading'
  const { smoothedSpeed, etaText } = useSmoothedSpeed(d.speed_bps, remainingBytes, isDownloading)

  const coverSrc = game?.cover_path ? assetUrl(game.cover_path) : null
  const selectGame = useUiStore((s) => s.selectGame)
  const launchGame = useLaunchGame()
  const isRunning = useLaunchStore((s) => (game ? s.runningGameIds.has(game.id) : false))
  const { data: settings } = useSettings()
  const activeStreams = settings?.download_streams ?? '8'

  async function openFolder() {
    try {
      const { revealItemInDir } = await import('@tauri-apps/plugin-opener')
      const target = game?.install_path || d.save_path
      await revealItemInDir(target)
    } catch {
      /* opener unavailable */
    }
  }

  function handlePlay() {
    if (game && game.is_installed && !launchGame.isPending) {
      launchGame.mutate(game.id)
    }
  }

  return (
    <div
      className={cn(
        'glass-panel relative flex flex-col sm:flex-row items-stretch gap-4 overflow-hidden rounded-2xl border p-4 shadow-lg transition-all duration-300',
        done
          ? 'border-emerald-500/30 bg-gradient-to-r from-emerald-500/10 via-surface/90 to-surface hover:border-emerald-500/50'
          : failed
            ? 'border-red-500/30 bg-gradient-to-r from-red-500/10 via-surface/90 to-surface'
            : active
              ? 'border-accent/40 bg-gradient-to-r from-accent/10 via-surface/90 to-surface shadow-accent/5'
              : queued
                ? 'border-amber-500/30 bg-gradient-to-r from-amber-500/5 via-surface/90 to-surface'
                : 'border-border bg-surface/90 hover:border-border-hover',
      )}
    >
      {/* Game Cover Art or Archive Badge */}
      <div className="relative shrink-0 flex items-center justify-center sm:justify-start">
        {coverSrc ? (
          <div
            onClick={() => game && selectGame(game.id)}
            className="group/cover relative h-28 w-20 cursor-pointer overflow-hidden rounded-xl border border-white/10 shadow-md transition-transform duration-200 hover:scale-105"
          >
            <img src={coverSrc} alt={game?.name ?? ''} className="size-full object-cover" />
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover/cover:opacity-100">
              <Gamepad2 className="size-5 text-white" />
            </div>
          </div>
        ) : (
          <div
            className={cn(
              'flex h-28 w-20 flex-col items-center justify-center gap-2 rounded-xl border shadow-inner',
              done
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                : failed
                  ? 'border-red-500/30 bg-red-500/10 text-red-400'
                  : active
                    ? 'border-accent/40 bg-accent/10 text-accent'
                    : 'border-border bg-surface-raised text-subtle',
            )}
          >
            <FileArchive className="size-8" />
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-muted">
              {fileName.split('.').pop() || 'FILE'}
            </span>
          </div>
        )}
      </div>

      {/* Main Info + Telemetry + Controls */}
      <div className="flex flex-1 flex-col justify-between gap-3">
        {/* Title row */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h4
                onClick={() => game && selectGame(game.id)}
                className={cn(
                  'truncate text-base font-bold text-text',
                  game && 'cursor-pointer hover:text-accent transition-colors',
                )}
              >
                {game?.name ?? fileName}
              </h4>

              {/* Status Badge */}
              {done && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/30">
                  <Check className="size-3" />
                  Completed & Installed
                </span>
              )}
              {extracting && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-bold text-amber-400 border border-amber-500/30 animate-pulse">
                  <Sparkles className="size-3" />
                  Extracting {extractPct > 0 ? `${extractPct}%` : 'Archive…'}
                </span>
              )}
              {active && !extracting && (
                <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2.5 py-0.5 text-[10px] font-bold text-accent border border-accent/30">
                  <span className="size-1.5 rounded-full bg-accent animate-ping" />
                  {activeStreams}x Parallel Streams
                </span>
              )}
              {queued && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-bold text-amber-400 border border-amber-500/30">
                  <Clock className="size-3" />
                  {queuePosition ? `In Queue (#${queuePosition})` : 'In Queue'}
                </span>
              )}
              {paused && (
                <span className="inline-flex items-center gap-1 rounded-full bg-surface-raised px-2.5 py-0.5 text-[10px] font-bold text-subtle border border-border">
                  <Pause className="size-3" />
                  Paused
                </span>
              )}
              {failed && (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2.5 py-0.5 text-[10px] font-bold text-red-400 border border-red-500/30">
                  <AlertCircle className="size-3" />
                  Failed
                </span>
              )}
            </div>

            <p className="mt-1 truncate text-xs text-subtle">
              {game ? `${fileName} · ` : ''}
              <span className="font-medium text-text">{formatBytes(d.downloaded_bytes)}</span>
              <span className="text-muted"> of </span>
              <span className="font-medium text-text">
                {d.total_bytes > 0 ? formatBytes(d.total_bytes) : 'Unknown size'}
              </span>
            </p>
          </div>

          {/* Quick Actions Toolbar */}
          <div className="flex items-center gap-1.5">
            {done && game?.is_installed && (
              <button
                type="button"
                onClick={handlePlay}
                disabled={launchGame.isPending || isRunning}
                className="flex items-center gap-1.5 rounded-xl bg-accent px-3 py-1.5 text-xs font-bold text-white shadow-sm transition-all hover:bg-accent-hover active:scale-95 disabled:opacity-60"
              >
                <Play className="size-3.5 fill-current" />
                <span>{isRunning ? 'Running' : 'Play'}</span>
              </button>
            )}

            {/* In Queue Action Buttons */}
            {queued && (
              <>
                <button
                  type="button"
                  onClick={() => onResume(d.id)}
                  disabled={busy}
                  title="Resume now (Start immediately)"
                  className="flex size-8 items-center justify-center rounded-xl bg-accent/15 text-accent ring-1 ring-accent/30 transition-all hover:bg-accent hover:text-white active:scale-95 disabled:opacity-50"
                >
                  <Play className="size-4 fill-current" />
                </button>
                <button
                  type="button"
                  onClick={() => (onQueue ? onQueue(d.id, false) : onPause(d.id))}
                  disabled={busy}
                  title="Remove from queue / Pause"
                  className="flex size-8 items-center justify-center rounded-xl bg-surface-raised text-amber-400 ring-1 ring-amber-500/30 transition-all hover:bg-amber-500/20 active:scale-95 disabled:opacity-50"
                >
                  <Pause className="size-4" />
                </button>
              </>
            )}

            {/* Paused Action Buttons */}
            {(paused || failed) && (
              <>
                {onQueue && (
                  <button
                    type="button"
                    onClick={() => onQueue(d.id, true)}
                    disabled={busy}
                    title="Add to download queue"
                    className="flex size-8 items-center justify-center rounded-xl bg-surface-raised text-amber-400 ring-1 ring-border transition-all hover:bg-amber-500/15 hover:ring-amber-500/40 active:scale-95 disabled:opacity-50"
                  >
                    <Clock className="size-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onResume(d.id)}
                  disabled={busy}
                  title={failed ? 'Retry download' : 'Resume download now'}
                  className="flex size-8 items-center justify-center rounded-xl bg-accent/15 text-accent ring-1 ring-accent/30 transition-all hover:bg-accent hover:text-white active:scale-95 disabled:opacity-50"
                >
                  {failed ? (
                    <RotateCcw className="size-4" />
                  ) : (
                    <Play className="size-4 fill-current" />
                  )}
                </button>
              </>
            )}

            {active && (
              <button
                type="button"
                onClick={() => onPause(d.id)}
                disabled={busy}
                title="Pause download"
                className="flex size-8 items-center justify-center rounded-xl bg-surface-raised text-subtle ring-1 ring-border transition-all hover:bg-accent/15 hover:text-accent active:scale-95 disabled:opacity-50"
              >
                <Pause className="size-4" />
              </button>
            )}

            {done && (
              <button
                type="button"
                onClick={() => void openFolder()}
                title="Open installation folder"
                className="flex size-8 items-center justify-center rounded-xl border border-border bg-surface text-subtle transition-all hover:bg-surface-raised hover:text-text active:scale-95"
              >
                <FolderOpen className="size-4" />
              </button>
            )}

            {(done || failed) && (
              <button
                type="button"
                onClick={() => onDelete(d.id)}
                disabled={busy}
                title="Remove from downloads list"
                className="flex size-8 items-center justify-center rounded-xl border border-border bg-surface text-subtle transition-all hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-400 active:scale-95 disabled:opacity-50"
              >
                <Trash2 className="size-4" />
              </button>
            )}

            {!done && !queued && (
              <button
                type="button"
                onClick={() => onCancel(d.id)}
                disabled={busy}
                title="Cancel download and delete files"
                className="flex size-8 items-center justify-center rounded-xl border border-border bg-surface text-subtle transition-all hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-400 active:scale-95 disabled:opacity-50"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        </div>

        {/* Progress Bar & Telemetry */}
        <div className="space-y-1.5">
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-bg/80 border border-border/40">
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

          {/* IDM-Style Parallel Streams Segment Visualizer */}
          {active && !extracting && d.total_bytes > 0 && (
            <ChunkStreamVisualizer
              downloadedBytes={d.downloaded_bytes}
              totalBytes={d.total_bytes}
              chunks={d.chunks}
              streamCount={Number(activeStreams)}
              speedBps={smoothedSpeed || d.speed_bps}
              className="mt-2"
            />
          )}

          {/* Footer Live Telemetry stats */}
          <div className="flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-3 text-subtle">
              {active && !extracting && (
                <>
                  <span className="flex items-center gap-1 font-semibold text-text">
                    <Gauge className="size-3 text-accent" />
                    {formatSpeed(smoothedSpeed || d.speed_bps)}
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
                  Decompressing archive:{' '}
                  <strong className="font-mono text-text">{extractPct}%</strong>
                </span>
              )}
              {done && (
                <span className="flex items-center gap-1 text-emerald-400 font-medium">
                  <Check className="size-3" />
                  Ready to launch from Library
                </span>
              )}
              {failed && (
                <span className="truncate text-red-400" title={d.error_message ?? undefined}>
                  {d.error_message ?? 'Download failed. Click retry to resume.'}
                </span>
              )}
              {paused && (
                <span className="text-subtle">
                  Paused at {formatBytes(d.downloaded_bytes)} ({pct.toFixed(1)}%)
                </span>
              )}
            </div>

            {(d.total_bytes > 0 || extracting) && (
              <span className="font-mono text-xs font-bold text-text tabular-nums">
                {extracting ? `${extractPct}%` : `${pct.toFixed(1)}%`}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
