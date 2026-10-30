import React from 'react'
import { Pause, Play, XCircle, CheckCircle2 } from 'lucide-react'
import {
  pauseDownload,
  resumeDownload,
  cancelDownload,
  type DownloadInfo,
} from '@/services/download'
import { formatBytes } from '@/features/library/utils/guess-name'
import { FocusScope, useFocusable } from '../nav/FocusScope'

export interface DownloadsViewProps {
  downloads: DownloadInfo[]
  onRefresh: () => void
}

const DownloadRowCard: React.FC<{
  dl: DownloadInfo
  onRefresh: () => void
}> = ({ dl, onRefresh }) => {
  const isPaused = dl.status === 'paused' || dl.status === 'queued'
  const isActive = dl.status === 'downloading' || dl.status === 'extracting'
  const pct = dl.total_bytes > 0 ? Math.round((dl.downloaded_bytes / dl.total_bytes) * 100) : 0

  const toggleBtn = useFocusable<HTMLButtonElement>({
    id: `dl_toggle_${dl.id}`,
    scopeId: 'console_downloads_scope',
    onConfirm: () => {
      const action = isPaused ? resumeDownload(dl.id) : pauseDownload(dl.id)
      void action.then(onRefresh).catch(() => {})
    },
  })

  const cancelBtn = useFocusable<HTMLButtonElement>({
    id: `dl_cancel_${dl.id}`,
    scopeId: 'console_downloads_scope',
    onConfirm: () => {
      void cancelDownload(dl.id)
        .then(onRefresh)
        .catch(() => {})
    },
  })

  return (
    <div className="p-5 rounded-2xl bg-white/[0.06] border border-transparent flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
      <div className="flex-1 space-y-2 w-full">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">
            {dl.game_name || dl.file_path || `Download ${dl.id.slice(0, 8)}`}
          </h3>
          <span className="text-xs font-semibold uppercase px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-white/70">
            {dl.status} · {pct}%
          </span>
        </div>

        <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-cyan-400 to-violet-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>
            {formatBytes(dl.downloaded_bytes)} / {formatBytes(dl.total_bytes)}
          </span>
          {dl.speed_bps > 0 && <span>{formatBytes(dl.speed_bps)}/s</span>}
        </div>
      </div>

      {(isActive || isPaused) && (
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            {...toggleBtn.focusProps}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 border transition-all ${
              toggleBtn.isFocused
                ? 'bg-white text-black border-transparent scale-105'
                : 'bg-slate-900 text-slate-200 border-transparent'
            }`}
          >
            {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            <span>{isPaused ? 'Resume' : 'Pause'}</span>
          </button>

          <button
            type="button"
            {...cancelBtn.focusProps}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 border transition-all ${
              cancelBtn.isFocused
                ? 'bg-rose-500 text-white border-rose-300 scale-105'
                : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
            }`}
          >
            <XCircle className="w-4 h-4" />
            <span>Cancel</span>
          </button>
        </div>
      )}
    </div>
  )
}

export const DownloadsView: React.FC<DownloadsViewProps> = ({ downloads, onRefresh }) => {
  return (
    <FocusScope id="console_downloads_scope" orientation="vertical" className="space-y-4 pb-16">
      <div className="flex items-baseline gap-5 px-6 pb-3 pt-2">
        <h1 className="text-[2.6rem] font-semibold tracking-tight text-white">Downloads</h1>
        {downloads.length > 0 && (
          <span className="text-[1.05rem] text-white/45">
            {downloads.length} {downloads.length === 1 ? 'task' : 'tasks'}
          </span>
        )}
      </div>

      {downloads.length === 0 ? (
        <div className="flex items-center gap-3 px-6 pt-4 text-[1.15rem] text-white/45">
          <CheckCircle2 className="size-[1.4rem]" />
          <span>Nothing downloading</span>
        </div>
      ) : (
        <div className="space-y-3">
          {downloads.map((dl) => (
            <DownloadRowCard key={dl.id} dl={dl} onRefresh={onRefresh} />
          ))}
        </div>
      )}
    </FocusScope>
  )
}
