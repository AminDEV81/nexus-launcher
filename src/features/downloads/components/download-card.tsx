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
  Copy,
  ArchiveRestore,
  Network,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { assetUrl } from '@/lib/asset-url'
import { useLaunchGame, useRestoreGameFromMemory } from '@/features/library/hooks/use-games'
import { useUiStore } from '@/store/ui-store'
import { useLaunchStore } from '@/store/launch-store'
import { useSettings } from '@/features/settings/hooks/use-settings'
import { useAnimationSpeed } from '@/hooks/use-animation-speed'
import { useSmoothedSpeed } from '../hooks/use-smoothed-speed'
import { ChunkStreamVisualizer } from './chunk-stream-visualizer'
import type { DownloadInfo } from '@/services/download'
import type { Game } from '@/types/models'

function formatBytes(b: number) {
  if (!b || b <= 0) return '0 B'
  const k = 1024
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(b) / Math.log(k)), units.length - 1)
  return `${(b / k ** i).toFixed(i >= 3 ? 2 : 1)} ${units[i]}`
}

function formatSpeed(bps: number) {
  if (!bps || bps <= 0) return '—'
  return `${formatBytes(bps)}/s`
}

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
  const speed = useAnimationSpeed()
  const { smoothedSpeed, etaText } = useSmoothedSpeed(d.speed_bps, remainingBytes, isDownloading)

  const rawCover = game?.cover_path || d.cover_url || null
  const coverSrc = rawCover
    ? rawCover.startsWith('http://') || rawCover.startsWith('https://')
      ? rawCover
      : assetUrl(rawCover)
    : null
  const resolvedTitle = game?.name || d.game_name || fileName
  const isArchivedInMemory = Boolean(game?.is_memory)

  const selectGame = useUiStore((s) => s.selectGame)
  const launchGame = useLaunchGame()
  const restoreFromMemory = useRestoreGameFromMemory()
  const isRunning = useLaunchStore((s) => (game ? s.runningGameIds.has(game.id) : false))
  const { data: settings } = useSettings()
  const activeStreams = settings?.download_streams ?? '8'

  async function openFolder() {
    try {
      const { revealItemInDir } = await import('@tauri-apps/plugin-opener')
      const target = d.file_path || game?.install_path || d.save_path
      await revealItemInDir(target)
    } catch {
      toast.info(`Saved in: ${d.save_path}`)
    }
  }

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(d.url)
      toast.success('Download URL copied to clipboard')
    } catch {
      toast.error('Could not copy URL')
    }
  }

  function handlePlay() {
    if (game && game.is_installed && !game.is_memory && !launchGame.isPending) {
      launchGame.mutate(game.id)
    }
  }

  function handleRestoreToLibrary() {
    if (game && game.is_memory && !restoreFromMemory.isPending) {
      restoreFromMemory.mutate(game.id, {
        onSuccess: () => {
          toast.success(`${game.name} restored to your active Library!`)
        },
      })
    }
  }

  return (
    <div
      className={cn(
        'group relative flex flex-col sm:flex-row items-stretch gap-4 overflow-hidden rounded-2xl border p-4 shadow-md transition-all duration-300',
        done
          ? 'border-emerald-500/35 bg-gradient-to-r from-emerald-500/[0.07] via-surface to-surface hover:border-emerald-500/55'
          : failed
            ? 'border-rose-500/35 bg-gradient-to-r from-rose-500/[0.07] via-surface to-surface'
            : active
              ? 'border-accent/45 bg-gradient-to-r from-accent/[0.08] via-surface to-surface shadow-lg shadow-accent/5'
              : queued
                ? 'border-amber-500/35 bg-gradient-to-r from-amber-500/[0.06] via-surface to-surface'
                : 'border-border/80 bg-surface hover:border-border-hover hover:bg-surface-raised/40',
      )}
    >
      {/* Top specular highlight */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/25 to-transparent" />

      {/* Game Cover Art or Archive Badge */}
      <div className="relative shrink-0 flex items-center justify-center sm:justify-start">
        {coverSrc ? (
          <div
            onClick={() => game && !game.is_memory && selectGame(game.id)}
            className={cn(
              'group/cover relative h-28 w-20 overflow-hidden rounded-xl border border-border/80 bg-surface-raised shadow-md transition-transform duration-200',
              game && !game.is_memory && 'cursor-pointer hover:scale-105',
            )}
          >
            <img src={coverSrc} alt={resolvedTitle} className="size-full object-cover" />
            {game && !game.is_memory && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition-opacity group-hover/cover:opacity-100">
                <Gamepad2 className="size-5 text-white" />
              </div>
            )}
          </div>
        ) : (
          <div
            className={cn(
              'flex h-28 w-20 flex-col items-center justify-center gap-2 rounded-xl border shadow-inner',
              done
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500 dark:text-emerald-400'
                : failed
                  ? 'border-rose-500/30 bg-rose-500/10 text-rose-500 dark:text-rose-400'
                  : active
                    ? 'border-accent/40 bg-accent/10 text-accent'
                    : 'border-border bg-surface-raised text-subtle',
            )}
          >
            <FileArchive className="size-8" />
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-muted">
              {fileName.split('.').pop()?.slice(0, 5) || 'FILE'}
            </span>
          </div>
        )}
      </div>

      {/* Main Info + Telemetry + Controls */}
      <div className="flex flex-1 flex-col justify-between gap-3 min-w-0">
        {/* Title row */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h4
                onClick={() => game && !game.is_memory && selectGame(game.id)}
                className={cn(
                  'truncate text-base font-extrabold tracking-tight text-text',
                  game && !game.is_memory && 'cursor-pointer hover:text-accent transition-colors',
                )}
              >
                {resolvedTitle}
              </h4>

              {/* Status Badge */}
              {done && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                  <Check className="size-3" />
                  Completed
                </span>
              )}
              {isArchivedInMemory && (
                <span
                  title="This game was removed from the active Library, but its download history is preserved."
                  className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-300 border border-amber-500/30"
                >
                  <Sparkles className="size-2.5" />
                  Removed from Library (History Saved)
                </span>
              )}
              {extracting && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400 border border-amber-500/30 animate-pulse">
                  <Sparkles className="size-3" />
                  Extracting {extractPct > 0 ? `${extractPct}%` : 'Archive…'}
                </span>
              )}
              {active && !extracting && (
                <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2.5 py-0.5 text-[10px] font-bold text-accent border border-accent/30">
                  <Network className="size-3" />
                  {activeStreams}x Turbo Streams
                </span>
              )}
              {queued && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400 border border-amber-500/30">
                  <Clock className="size-3" />
                  {queuePosition ? `Queued (#${queuePosition})` : 'Queued'}
                </span>
              )}
              {paused && (
                <span className="inline-flex items-center gap-1 rounded-full bg-surface-raised px-2.5 py-0.5 text-[10px] font-bold text-subtle border border-border">
                  <Pause className="size-3" />
                  Paused
                </span>
              )}
              {failed && (
                <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2.5 py-0.5 text-[10px] font-bold text-rose-600 dark:text-rose-400 border border-rose-500/30">
                  <AlertCircle className="size-3" />
                  Failed
                </span>
              )}
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-subtle">
              <span className="truncate max-w-[260px] font-mono text-[11px]" title={fileName}>
                {fileName}
              </span>
              <span>·</span>
              <span>
                <strong className="font-mono font-bold text-text">
                  {formatBytes(d.downloaded_bytes)}
                </strong>
                <span className="text-muted"> / </span>
                <strong className="font-mono font-bold text-text">
                  {d.total_bytes > 0 ? formatBytes(d.total_bytes) : 'Unknown size'}
                </strong>
              </span>
              {d.save_path && (
                <>
                  <span>·</span>
                  <span
                    className="truncate max-w-[240px] font-mono text-[10px] text-muted"
                    title={d.save_path}
                  >
                    {d.save_path}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Quick Actions Toolbar */}
          <div className="flex flex-wrap items-center gap-1.5">
            {done && game?.is_installed && !game.is_memory && (
              <button
                type="button"
                onClick={handlePlay}
                disabled={launchGame.isPending || isRunning}
                className="flex items-center gap-1.5 rounded-xl bg-accent px-3 py-1.5 text-xs font-bold text-white shadow-sm transition-all hover:bg-accent-hover active:scale-95 disabled:opacity-60 cursor-pointer"
              >
                <Play className="size-3.5 fill-current" />
                <span>{isRunning ? 'Running' : 'Play'}</span>
              </button>
            )}

            {isArchivedInMemory && (
              <button
                type="button"
                onClick={handleRestoreToLibrary}
                disabled={restoreFromMemory.isPending}
                title="Restore this game back to your active Library"
                className="flex items-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-xs font-bold text-amber-600 dark:text-amber-300 shadow-xs transition-all hover:bg-amber-500/25 active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                <ArchiveRestore className="size-3.5" />
                <span>Restore to Library</span>
              </button>
            )}

            {/* In Queue Action Buttons */}
            {queued && (
              <>
                <button
                  type="button"
                  onClick={() => onResume(d.id)}
                  disabled={busy}
                  title="Start download immediately"
                  className="flex size-8 items-center justify-center rounded-xl bg-accent/15 text-accent ring-1 ring-accent/30 transition-all hover:bg-accent hover:text-white active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  <Play className="size-4 fill-current" />
                </button>
                <button
                  type="button"
                  onClick={() => (onQueue ? onQueue(d.id, false) : onPause(d.id))}
                  disabled={busy}
                  title="Remove from queue / Pause"
                  className="flex size-8 items-center justify-center rounded-xl bg-surface-raised text-amber-500 ring-1 ring-amber-500/30 transition-all hover:bg-amber-500/20 active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  <Pause className="size-4" />
                </button>
              </>
            )}

            {/* Paused / Failed Action Buttons */}
            {(paused || failed) && (
              <>
                {onQueue && (
                  <button
                    type="button"
                    onClick={() => onQueue(d.id, true)}
                    disabled={busy}
                    title="Add to sequential download queue"
                    className="flex size-8 items-center justify-center rounded-xl bg-surface-raised text-amber-500 ring-1 ring-border transition-all hover:bg-amber-500/15 hover:ring-amber-500/40 active:scale-95 disabled:opacity-50 cursor-pointer"
                  >
                    <Clock className="size-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onResume(d.id)}
                  disabled={busy}
                  title={failed ? 'Retry download' : 'Resume download now'}
                  className="flex size-8 items-center justify-center rounded-xl bg-accent/15 text-accent ring-1 ring-accent/30 transition-all hover:bg-accent hover:text-white active:scale-95 disabled:opacity-50 cursor-pointer"
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
                className="flex size-8 items-center justify-center rounded-xl bg-surface-raised text-subtle ring-1 ring-border transition-all hover:bg-accent/15 hover:text-accent active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                <Pause className="size-4" />
              </button>
            )}

            <button
              type="button"
              onClick={() => void copyUrl()}
              title="Copy download source URL"
              className="flex size-8 items-center justify-center rounded-xl border border-border bg-surface text-subtle transition-all hover:bg-surface-raised hover:text-text active:scale-95 cursor-pointer"
            >
              <Copy className="size-3.5" />
            </button>

            <button
              type="button"
              onClick={() => void openFolder()}
              title="Open destination folder"
              className="flex size-8 items-center justify-center rounded-xl border border-border bg-surface text-subtle transition-all hover:bg-surface-raised hover:text-text active:scale-95 cursor-pointer"
            >
              <FolderOpen className="size-4" />
            </button>

            {(done || failed || paused) && (
              <button
                type="button"
                onClick={() => onDelete(d.id)}
                disabled={busy}
                title="Remove from download history"
                className="flex size-8 items-center justify-center rounded-xl border border-border bg-surface text-subtle transition-all hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-500 active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                <Trash2 className="size-4" />
              </button>
            )}

            {active && (
              <button
                type="button"
                onClick={() => onCancel(d.id)}
                disabled={busy}
                title="Cancel active download"
                className="flex size-8 items-center justify-center rounded-xl border border-border bg-surface text-subtle transition-all hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-500 active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        </div>

        {/* Progress Bar & Telemetry */}
        <div className="space-y-1.5">
          <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-surface-raised border border-border/60">
            <motion.div
              className={cn(
                'absolute inset-y-0 left-0 rounded-full transition-all',
                done
                  ? 'bg-gradient-to-r from-emerald-500 to-emerald-400 shadow-[0_0_12px_rgb(52_211_153/0.45)]'
                  : failed
                    ? 'bg-rose-500'
                    : extracting
                      ? 'bg-gradient-to-r from-amber-500 to-amber-400 shadow-[0_0_12px_rgb(245_158_11/0.45)]'
                      : 'bg-gradient-to-r from-accent/85 via-accent to-cyan-400 shadow-[0_0_12px_color-mix(in_srgb,var(--color-accent)_65%,transparent)]',
              )}
              initial={false}
              animate={{ width: `${extracting ? extractPct : done ? 100 : pct}%` }}
              transition={{ duration: 0.28 * speed, ease: 'easeOut' }}
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
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <div className="flex flex-wrap items-center gap-3 text-subtle">
              {active && !extracting && (
                <>
                  <span className="flex items-center gap-1 font-mono font-bold text-text">
                    <Gauge className="size-3.5 text-accent" />
                    {formatSpeed(smoothedSpeed || d.speed_bps)}
                  </span>
                  {etaText && (
                    <span className="flex items-center gap-1 font-mono">
                      <Clock className="size-3 text-subtle" />
                      {etaText} remaining
                    </span>
                  )}
                </>
              )}
              {extracting && (
                <span className="flex items-center gap-1.5 font-semibold text-amber-500 dark:text-amber-400">
                  <HardDrive className="size-3.5 animate-bounce" />
                  Decompressing archive:{' '}
                  <strong className="font-mono text-text">{extractPct}%</strong>
                </span>
              )}
              {done && (
                <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-semibold">
                  <Check className="size-3.5" />
                  {isArchivedInMemory
                    ? 'Download completed • Preserved in Download History'
                    : 'Download verified & ready in Library'}
                </span>
              )}
              {failed && (
                <span
                  className="truncate text-rose-500 dark:text-rose-400 font-medium"
                  title={d.error_message ?? undefined}
                >
                  {d.error_message ?? 'Download interrupted. Click retry to resume from last byte.'}
                </span>
              )}
              {paused && (
                <span className="text-subtle font-medium">
                  Paused at {formatBytes(d.downloaded_bytes)} ({pct.toFixed(1)}%) — Range resume
                  ready
                </span>
              )}
            </div>

            {(d.total_bytes > 0 || extracting || done) && (
              <span className="font-mono text-xs font-extrabold text-text tabular-nums">
                {extracting ? `${extractPct}%` : done ? '100%' : `${pct.toFixed(1)}%`}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
