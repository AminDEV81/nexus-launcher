import React from 'react'
import { Download, Pause, Play, XCircle, CheckCircle2 } from 'lucide-react'
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
      void cancelDownload(dl.id).then(onRefresh).catch(() => {})
    },
  })

  return (
    <div className="p-5 rounded-2xl bg-white/5 border border-white/10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
      <div className="flex-1 space-y-2 w-full">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-extrabold text-white">
            {dl.game_name || dl.file_path || `Download ${dl.id.slice(0, 8)}`}
          </h3>
          <span className="text-xs font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300">
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
                ? 'bg-cyan-400 text-slate-950 border-cyan-300 scale-105'
                : 'bg-slate-900 text-slate-200 border-white/15'
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
      <div className="flex items-center justify-between p-6 rounded-3xl bg-white/5 border border-white/10">
        <div className="flex items-center gap-3">
          <Download className="w-7 h-7 text-cyan-400" />
          <div>
            <h1 className="text-2xl font-black text-white">Download Queue & Manager</h1>
            <p className="text-xs text-slate-400">
              Multi-connection segmented downloads with automatic archive extraction
            </p>
          </div>
        </div>
        <span className="text-sm font-extrabold text-cyan-300">
          {downloads.length} {downloads.length === 1 ? 'Task' : 'Tasks'}
        </span>
      </div>

      {downloads.length === 0 ? (
        <div className="p-16 rounded-3xl bg-white/5 border border-white/10 text-center">
          <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
          <p className="text-lg font-bold text-white">No active or queued downloads</p>
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
