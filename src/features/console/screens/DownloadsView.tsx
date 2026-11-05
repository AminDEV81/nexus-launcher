import React, { useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  Clock,
  Download,
  Gamepad2,
  Gauge,
  HardDrive,
  Pause,
  Play,
  Trash2,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import type { Game } from '@/types/models'
import {
  cancelDownload,
  deleteDownload,
  pauseDownload,
  resumeDownload,
  type DownloadInfo,
} from '@/services/download'
import { matchDownloadToGame } from '@/features/downloads/utils/match-download'
import { buildCoverFallbackChain } from '@/features/hub/utils/cover-fallback'
import { formatBytes } from '@/features/library/utils/guess-name'
import { useConsoleStore } from '../store/console-store'
import { CONSOLE_THEMES } from '../theme/tokens'
import { FocusScope, useFocusable } from '../nav/FocusScope'
import { resolveConsoleHighResUrl, resolveConsoleMediaUrl } from '../ui/Tile'

export interface DownloadsViewProps {
  downloads: DownloadInfo[]
  games?: Game[]
  onRefresh: () => void
}

type DownloadFilterTab = 'all' | 'active' | 'completed' | 'paused'

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
      ? Math.min(100, Math.max(0, Math.round(dl.extract_percent)))
      : dl.total_bytes > 0
        ? Math.min(100, Math.max(0, Math.round((dl.downloaded_bytes / dl.total_bytes) * 100)))
        : dl.status === 'completed'
          ? 100
          : 0

  // Prioritize the game's current Library cover (`matchedGame.cover_path`) FIRST so any
  // cover change made in Legacy Mode immediately reflects in Console Mode Downloads!
  const coverCandidates = useMemo(() => {
    const primaryLocalOrCustom = resolveConsoleMediaUrl(matchedGame?.cover_path)
    const secondaryBanner = resolveConsoleHighResUrl(
      matchedGame?.banner_path ?? matchedGame?.background_path,
    )
    const dlCover = resolveConsoleHighResUrl(dl.cover_url)
    const chain = buildCoverFallbackChain(
      primaryLocalOrCustom ?? dlCover,
      secondaryBanner ?? dlCover,
      matchedGame?.steam_app_id,
      matchedGame?.igdb_id,
    )
    if (dlCover && !chain.includes(dlCover)) {
      chain.push(dlCover)
    }
    return chain
  }, [
    matchedGame?.cover_path,
    matchedGame?.banner_path,
    matchedGame?.background_path,
    matchedGame?.steam_app_id,
    matchedGame?.igdb_id,
    dl.cover_url,
  ])

  const [coverIdx, setCoverIdx] = useState(0)
  useEffect(() => {
    setCoverIdx(0)
  }, [coverCandidates])

  const coverSrc = coverCandidates[coverIdx] ?? null

  const title =
    matchedGame?.name ||
    dl.game_name ||
    (dl.file_path ? dl.file_path.split(/[\\/]/).pop() : null) ||
    `Download #${dl.id.slice(0, 8)}`

  const remaining = Math.max(0, dl.total_bytes - dl.downloaded_bytes)
  const etaText = isActive
    ? dl.status === 'extracting'
      ? `Extracting (${pct}%)`
      : formatEta(remaining, dl.speed_bps)
    : dl.status.toUpperCase()

  const toggleBtn = useFocusable<HTMLButtonElement>({
    id: `dl_toggle_${dl.id}`,
    scopeId: 'console_downloads_scope',
    onConfirm: () => {
      const action = isPaused ? resumeDownload(dl.id) : pauseDownload(dl.id)
      void action
        .then(() => {
          onRefresh()
        })
        .catch(() => {})
    },
  })

  const cancelOrDeleteBtn = useFocusable<HTMLButtonElement>({
    id: `dl_cancel_${dl.id}`,
    scopeId: 'console_downloads_scope',
    onConfirm: () => {
      const action = isActive || isPaused ? cancelDownload(dl.id) : deleteDownload(dl.id, false)
      void action
        .then(() => {
          toast.success(
            isActive || isPaused ? `Cancelled "${title}"` : `Removed "${title}" from list`,
          )
          onRefresh()
        })
        .catch(() => {})
    },
  })

  return (
    <div
      className={`group relative overflow-hidden rounded-3xl border p-5 transition-colors flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 ${
        isLight
          ? 'border-slate-200/95 bg-white/95 shadow-[0_8px_28px_rgba(15,23,42,0.06)]'
          : 'border-white/12 bg-[#0d1426]/95 shadow-xl'
      }`}
    >
      {/* Left: 3:4 Cover Poster + Telemetry */}
      <div className="flex items-center gap-5 flex-1 w-full min-w-0">
        <div className="relative h-28 w-20 shrink-0 overflow-hidden rounded-2xl border border-white/15 bg-slate-900 shadow-lg">
          {coverSrc ? (
            <img
              src={coverSrc}
              alt={title}
              loading="lazy"
              onError={() => setCoverIdx((prev) => prev + 1)}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-slate-800 to-slate-950 p-2 text-center text-cyan-300">
              <Gamepad2 className="size-6 mb-1" />
              <span className="line-clamp-2 text-[9px] font-bold text-white/80">{title}</span>
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <h3
                className={`truncate text-lg sm:text-xl font-black tracking-tight ${
                  isLight ? 'text-slate-900' : 'text-white'
                }`}
              >
                {title}
              </h3>
              {matchedGame && (
                <p
                  className={`text-[11px] font-semibold ${isLight ? 'text-slate-500' : 'text-slate-400'}`}
                >
                  Linked to Library · {matchedGame.developer || 'PC Edition'}
                </p>
              )}
            </div>

            <span
              className={`rounded-full border px-3 py-0.5 text-xs font-extrabold uppercase tracking-wider shrink-0 ${
                dl.status === 'completed'
                  ? isLight
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                    : 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40'
                  : dl.status === 'failed' || dl.status === 'cancelled'
                    ? isLight
                      ? 'bg-rose-50 text-rose-700 border-rose-300'
                      : 'bg-rose-500/20 text-rose-300 border-rose-400/40'
                    : isLight
                      ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                      : 'bg-cyan-500/20 text-cyan-300 border-cyan-400/40'
              }`}
            >
              {dl.status} · {pct}%
            </span>
          </div>

          {/* Progress Bar */}
          <div
            className={`h-3 w-full overflow-hidden rounded-full p-0.5 ${
              isLight ? 'bg-slate-200' : 'bg-slate-800/90'
            }`}
          >
            <div
              className={`h-full rounded-full transition-[width] duration-300 ${
                dl.status === 'completed'
                  ? 'bg-gradient-to-r from-emerald-400 to-teal-500'
                  : dl.status === 'failed'
                    ? 'bg-rose-500'
                    : 'bg-gradient-to-r from-cyan-400 via-sky-400 to-violet-500'
              }`}
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
              <HardDrive className={`size-3.5 ${isLight ? 'text-indigo-600' : 'text-cyan-400'}`} />
              {formatBytes(dl.downloaded_bytes)} /{' '}
              {dl.total_bytes > 0 ? formatBytes(dl.total_bytes) : 'Unknown'}
            </span>
            {dl.speed_bps > 0 && isActive && (
              <span
                className={`flex items-center gap-1.5 ${
                  isLight ? 'text-emerald-700' : 'text-emerald-400'
                }`}
              >
                <Gauge className="size-3.5" />
                {formatBytes(dl.speed_bps)}/s
              </span>
            )}
            <span
              className={`flex items-center gap-1.5 ${
                isLight ? 'text-amber-700' : 'text-amber-300'
              }`}
            >
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
            className={`flex items-center gap-2 rounded-2xl border px-5 py-3 text-xs font-extrabold transition-all cursor-pointer outline-none ${
              toggleBtn.isFocused
                ? 'scale-105 border-cyan-300 bg-cyan-400 text-slate-950 shadow-lg'
                : isLight
                  ? 'border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200'
                  : 'border-white/15 bg-white/10 text-white hover:bg-white/15'
            }`}
          >
            {isPaused ? <Play className="size-4 fill-current" /> : <Pause className="size-4" />}
            <span>{isPaused ? 'Resume' : 'Pause'}</span>
          </button>
        )}

        <button
          type="button"
          {...cancelOrDeleteBtn.focusProps}
          className={`flex items-center gap-2 rounded-2xl border px-4 py-3 text-xs font-extrabold transition-all cursor-pointer outline-none ${
            cancelOrDeleteBtn.isFocused
              ? 'scale-105 border-rose-300 bg-rose-500 text-white shadow-lg'
              : isLight
                ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                : 'border-rose-500/35 bg-rose-500/15 text-rose-300 hover:bg-rose-500/25'
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
  const [filterTab, setFilterTab] = useState<DownloadFilterTab>('all')

  const activeList = useMemo(
    () =>
      downloads.filter((d) => ['downloading', 'queued', 'paused', 'extracting'].includes(d.status)),
    [downloads],
  )
  const completedList = useMemo(
    () => downloads.filter((d) => d.status === 'completed'),
    [downloads],
  )
  const pausedOrFailedList = useMemo(
    () => downloads.filter((d) => ['paused', 'failed', 'cancelled'].includes(d.status)),
    [downloads],
  )

  const filteredDownloads = useMemo(() => {
    if (filterTab === 'active') return activeList
    if (filterTab === 'completed') return completedList
    if (filterTab === 'paused') return pausedOrFailedList
    return downloads
  }, [downloads, activeList, completedList, pausedOrFailedList, filterTab])

  const totalSpeed = activeList.reduce((acc, d) => acc + (d.speed_bps || 0), 0)

  const handleClearCompleted = async () => {
    if (completedList.length === 0) return
    await Promise.all(completedList.map((d) => deleteDownload(d.id, false).catch(() => {})))
    toast.success(`Cleared ${completedList.length} completed download(s)`)
    onRefresh()
  }

  return (
    <FocusScope id="console_downloads_scope" orientation="vertical" className="space-y-6 pb-20">
      {/* Top Summary & Filter Banner */}
      <div
        className={`flex flex-col gap-4 rounded-3xl border p-6 ${
          isLight
            ? 'border-slate-200/95 bg-white/95 shadow-[0_10px_30px_rgba(15,23,42,0.06)]'
            : 'border-white/15 bg-[#0b1020]/90 shadow-xl'
        }`}
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div
              className={`flex size-14 items-center justify-center rounded-2xl border ${
                isLight
                  ? 'bg-indigo-50 border-indigo-200 text-indigo-600'
                  : 'bg-cyan-400/20 border-cyan-400/40 text-cyan-300'
              }`}
            >
              <Download className="size-7" />
            </div>
            <div>
              <h1
                className={`text-2xl sm:text-3xl font-black tracking-tight ${
                  isLight ? 'text-slate-900' : 'text-white'
                }`}
              >
                Download Center &amp; Queue
              </h1>
              <p
                className={`text-xs sm:text-sm ${isLight ? 'text-slate-600' : 'text-slate-300/80'}`}
              >
                Multi-connection segmented engine synced with your Library artwork
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {totalSpeed > 0 && (
              <div
                className={`rounded-2xl border px-4 py-2 text-right ${
                  isLight
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                    : 'border-emerald-400/40 bg-emerald-500/15 text-emerald-300'
                }`}
              >
                <p className="text-[10px] font-bold uppercase tracking-wider">Live Bandwidth</p>
                <p className="text-lg font-black">{formatBytes(totalSpeed)}/s</p>
              </div>
            )}
            <div
              className={`rounded-2xl border px-4 py-2 text-right ${
                isLight
                  ? 'border-indigo-200 bg-indigo-50 text-indigo-800'
                  : 'border-cyan-400/30 bg-cyan-500/15 text-cyan-300'
              }`}
            >
              <p className="text-[10px] font-bold uppercase tracking-wider">Total Tasks</p>
              <p className="text-lg font-black">{downloads.length}</p>
            </div>
          </div>
        </div>

        {/* Filter Pills & Clear Completed */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'all', label: 'All Tasks', count: downloads.length },
                { id: 'active', label: 'Active', count: activeList.length },
                { id: 'completed', label: 'Completed', count: completedList.length },
                { id: 'paused', label: 'Paused / Failed', count: pausedOrFailedList.length },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterTab(tab.id)}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-extrabold transition-colors cursor-pointer ${
                  filterTab === tab.id
                    ? isLight
                      ? 'bg-slate-900 text-white'
                      : 'bg-cyan-400 text-slate-950'
                    : isLight
                      ? 'bg-slate-100 text-slate-600 hover:text-slate-900'
                      : 'bg-white/5 text-slate-300 hover:bg-white/10'
                }`}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>

          {completedList.length > 0 && (
            <button
              type="button"
              onClick={() => void handleClearCompleted()}
              className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer ${
                isLight
                  ? 'border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200'
                  : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
              }`}
            >
              <Trash2 className="size-3.5" />
              <span>Clear Completed ({completedList.length})</span>
            </button>
          )}
        </div>
      </div>

      {filteredDownloads.length === 0 ? (
        <div
          className={`rounded-3xl border p-16 text-center ${
            isLight ? 'border-slate-300 bg-white/85' : 'border-white/12 bg-white/[0.04]'
          }`}
        >
          <CheckCircle2 className="mx-auto mb-3 size-12 text-emerald-400" />
          <p className={`text-xl font-black ${isLight ? 'text-slate-900' : 'text-white'}`}>
            {downloads.length === 0
              ? 'Your download queue is clear'
              : 'No downloads in this filter'}
          </p>
          <p className={`mt-1 text-sm ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
            Any game downloads started from the Store or Game Hub will appear here with live Library
            cover art and progress.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredDownloads.map((dl) => {
            const matchedGame =
              matchDownloadToGame(dl, games) ?? games.find((g) => g.id === dl.game_id)
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
