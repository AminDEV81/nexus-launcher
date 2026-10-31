import React from 'react'
import {
  Download,
  Pause,
  Play,
  XCircle,
  CheckCircle2,
  Trash2,
  HardDrive,
  Gauge,
  Clock,
  Gamepad2,
} from 'lucide-react'
import type { Game } from '@/types/models'
import {
  pauseDownload,
  resumeDownload,
  cancelDownload,
  deleteDownload,
  type DownloadInfo,
} from '@/services/download'
import { formatBytes } from '@/features/library/utils/guess-name'
import { useConsoleStore } from '../store/console-store'
import { CONSOLE_THEMES } from '../theme/tokens'
import { FocusScope, useFocusable } from '../nav/FocusScope'
import { resolveConsoleHighResUrl } from '../ui/Tile'

export interface DownloadsViewProps {
  downloads: DownloadInfo[]
  games?: Game[]
  onRefresh: () => void
}

function formatEta(remainingBytes: number, speedBps: number): string {
  if (speedBps <= 0 || remainingBytes <= 0) return '—'
  const secs = Math.ceil(remainingBytes / speedBps)
  if (secs < 60) return `${secs}s left`
  const mins = Math.floor(secs / 60)
  const remSecs = secs % 60
  if (mins < 60) return `${mins}m ${remSecs}s left`
  const hrs = Math.floor(mins / 60)
  return `${hrs}h ${mins % 60}m left`
}

const DownloadRowCard: React.FC<{
  dl: DownloadInfo
  matchedGame?: Game
  isLight: boolean
  onRefresh: () => void
}> = ({ dl, matchedGame, isLight, onRefresh }) => {
  const isPaused = dl.status === 'paused' || dl.status === 'queued'
  const isActive = dl.status === 'downloading' || dl.status === 'extracting'
  const pct =
    dl.status === 'extracting' && typeof dl.extract_percent === 'number'
      ? Math.round(dl.extract_percent)
      : dl.total_bytes > 0
        ? Math.min(100, Math.round((dl.downloaded_bytes / dl.total_bytes) * 100))
        : 0

  const coverSrc = resolveConsoleHighResUrl(
    dl.cover_url ?? matchedGame?.cover_path ?? matchedGame?.banner_path,
  )
  const title =
    dl.game_name ||
    matchedGame?.name ||
    (dl.file_path ? dl.file_path.split(/[\/]/).pop() : null) ||
    `Download #${dl.id.slice(0, 8)}`

  const remaining = Math.max(0, dl.total_bytes - dl.downloaded_bytes)
  const etaText = isActive ? formatEta(remaining, dl.speed_bps) : dl.status.toUpperCase()

  const toggleBtn = useFocusable<HTMLButtonElement>({
    id: `dl_toggle_${dl.id}`,
    scopeId: 'console_downloads_scope',
    onConfirm: () => {
      const action = isPaused ? resumeDownload(dl.id) : pauseDownload(dl.id)
      void action.then(onRefresh).catch(() => {})
    },
  })

  const cancelOrDeleteBtn = useFocusable<HTMLButtonElement>({
    id: `dl_cancel_${dl.id}`,
    scopeId: 'console_downloads_scope',
    onConfirm: () => {
      const action =
        isActive || isPaused ? cancelDownload(dl.id) : deleteDownload(dl.id, false)
      void action.then(onRefresh).catch(() => {})
    },
  })

  return (
    <div
      className={`group relative overflow-hidden rounded-3xl border p-5 transition-all flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 ${
        isLight
          ? 'border-slate-300 bg-white/95 shadow-sm'
          : 'border-white/15 bg-gradient-to-r from-[#111a30] via-[#0e1526] to-[#0a101d] shadow-xl'
      }`}
    >
      {/* Left: Cover Poster + Metadata */}
      <div className="flex items-center gap-5 flex-1 w-full min-w-0">
        <div className="relative h-28 w-20 shrink-0 overflow-hidden rounded-2xl border border-white/20 bg-slate-900 shadow-lg">
          {coverSrc ? (
            <img src={coverSrc} alt={title} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-cyan-500/15 text-cyan-300">
              <Gamepad2 className="size-8" />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3
              className={`truncate text-xl font-black tracking-tight ${
                isLight ? 'text-slate-900' : 'text-white'
              }`}
            >
              {title}
            </h3>
            <span
              className={`rounded-full px-3 py-0.5 text-xs font-extrabold uppercase tracking-wider ${
                dl.status === 'completed'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                  : dl.status === 'failed'
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-400/40'
                    : 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40'
              }`}
            >
              {dl.status} · {pct}%
            </span>
          </div>

          {/* Progress Bar */}
          <div className="h-3 w-full overflow-hidden rounded-full bg-slate-800/90 p-0.5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-sky-400 to-violet-500 transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>

          {/* Telemetry Row */}
          <div
            className={`flex flex-wrap items-center gap-5 text-xs font-bold ${
              isLight ? 'text-slate-600' : 'text-slate-300'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <HardDrive className="size-3.5 text-cyan-400" />
              {formatBytes(dl.downloaded_bytes)} /{' '}
              {dl.total_bytes > 0 ? formatBytes(dl.total_bytes) : 'Unknown'}
            </span>
            {dl.speed_bps > 0 && (
              <span className="flex items-center gap-1.5 text-emerald-400">
                <Gauge className="size-3.5" />
                {formatBytes(dl.speed_bps)}/s
              </span>
            )}
            <span className="flex items-center gap-1.5 text-amber-300">
              <Clock className="size-3.5" />
              {etaText}
            </span>
          </div>
        </div>
      </div>

      {/* Right: Controller Action Buttons */}
      <div className="flex items-center gap-3 shrink-0 self-end lg:self-center">
        {(isActive || isPaused) && (
          <button
            type="button"
            {...toggleBtn.focusProps}
            className={`flex items-center gap-2 rounded-2xl border px-5 py-3 text-xs font-extrabold transition-all cursor-pointer ${
              toggleBtn.isFocused
                ? 'scale-105 border-cyan-300 bg-cyan-400 text-slate-950 shadow-lg'
                : isLight
                  ? 'border-slate-300 bg-slate-100 text-slate-800'
                  : 'border-white/15 bg-white/10 text-white'
            }`}
          >
            {isPaused ? <Play className="size-4 fill-current" /> : <Pause className="size-4" />}
            <span>{isPaused ? 'Resume' : 'Pause'}</span>
          </button>
        )}

        <button
          type="button"
          {...cancelOrDeleteBtn.focusProps}
          className={`flex items-center gap-2 rounded-2xl border px-4 py-3 text-xs font-extrabold transition-all cursor-pointer ${
            cancelOrDeleteBtn.isFocused
              ? 'scale-105 border-rose-300 bg-rose-500 text-white shadow-lg'
              : 'border-rose-500/35 bg-rose-500/15 text-rose-300'
          }`}
        >
          {isActive || isPaused ? (
            <>
              <XCircle className="size-4" />
              <span>Cancel</span>
            </>
          ) : (
            <>
              <Trash2 className="size-4" />
              <span>Remove</span>
            </>
          )}
        </button>
      </div>
    </div>
  )
}

export const DownloadsView: React.FC<DownloadsViewProps> = ({
  downloads,
  games = [],
  onRefresh,
}) => {
  const themeId = useConsoleStore((s) => s.theme)
  const isLight = Boolean(CONSOLE_THEMES[themeId]?.isLight)

  const activeList = downloads.filter((d) =>
    ['downloading', 'queued', 'paused', 'extracting'].includes(d.status),
  )
  const totalSpeed = activeList.reduce((acc, d) => acc + (d.speed_bps || 0), 0)

  return (
    <FocusScope id="console_downloads_scope" orientation="vertical" className="space-y-6 pb-20">
      {/* Top Summary Banner */}
      <div
        className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-3xl border p-6 ${
          isLight
            ? 'border-slate-300 bg-white/90 shadow-xs'
            : 'border-white/15 bg-gradient-to-r from-cyan-950/50 via-[#10192e] to-violet-950/40'
        }`}
      >
        <div className="flex items-center gap-4">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-cyan-400/20 border border-cyan-400/40 text-cyan-300">
            <Download className="size-7" />
          </div>
          <div>
            <h1
              className={`text-2xl sm:text-3xl font-black tracking-tight ${
                isLight ? 'text-slate-900' : 'text-white'
              }`}
            >
              Download Center & Queue
            </h1>
            <p className={`text-xs sm:text-sm ${isLight ? 'text-slate-600' : 'text-slate-300/80'}`}>
              Multi-connection segmented engine with automatic archive extraction
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {totalSpeed > 0 && (
            <div className="rounded-2xl border border-emerald-400/40 bg-emerald-500/15 px-4 py-2 text-right">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                Live Bandwidth
              </p>
              <p className="text-lg font-black text-emerald-300">{formatBytes(totalSpeed)}/s</p>
            </div>
          )}
          <div className="rounded-2xl border border-cyan-400/30 bg-cyan-500/15 px-4 py-2 text-right">
            <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-300">
              Total Tasks
            </p>
            <p className="text-lg font-black text-cyan-300">{downloads.length}</p>
          </div>
        </div>
      </div>

      {downloads.length === 0 ? (
        <div
          className={`rounded-3xl border p-16 text-center ${
            isLight ? 'border-slate-300 bg-white/85' : 'border-white/12 bg-white/[0.04]'
          }`}
        >
          <CheckCircle2 className="mx-auto mb-3 size-12 text-emerald-400" />
          <p className={`text-xl font-black ${isLight ? 'text-slate-900' : 'text-white'}`}>
            Your download queue is clear
          </p>
          <p className={`mt-1 text-sm ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
            Any game downloads started from the Store or Game Hub will appear here with live cover
            art and progress.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {downloads.map((dl) => {
            const matchedGame = games.find((g) => g.id === dl.game_id)
            return (
              <DownloadRowCard
                key={dl.id}
                dl={dl}
                matchedGame={matchedGame}
                isLight={isLight}
                onRefresh={onRefresh}
              />
            )
          })}
        </div>
      )}
    </FocusScope>
  )
}
