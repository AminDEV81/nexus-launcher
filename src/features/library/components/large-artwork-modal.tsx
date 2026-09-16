import { useEffect, useState } from 'react'
import { AlertTriangle, Download, Loader2, Sparkles } from 'lucide-react'
import { listen } from '@tauri-apps/api/event'
import { Modal } from '@/components/ui/modal'
import { CoverMedia } from '@/components/ui/cover-media'
import type { CoverOption } from '@/services/metadata'

interface LargeArtworkModalProps {
  gameId?: string | null
  open: boolean
  onClose: () => void
  onConfirm: () => void
  isDownloading: boolean
  option: CoverOption | null
  sizeBytes: number
  artworkType?: 'cover' | 'banner' | 'logo'
}

interface ProgressPayload {
  game_id: string
  downloaded_bytes: number
  total_bytes: number | null
  percent: number | null
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return 'Unknown Size'
  const mb = bytes / (1024 * 1024)
  if (mb >= 1) return `${mb.toFixed(1)} MB`
  const kb = bytes / 1024
  return `${kb.toFixed(0)} KB`
}

export function LargeArtworkModal({
  gameId,
  open,
  onClose,
  onConfirm,
  isDownloading,
  option,
  sizeBytes,
  artworkType = 'cover',
}: LargeArtworkModalProps) {
  const [progress, setProgress] = useState<ProgressPayload | null>(null)

  useEffect(() => {
    if (!open) {
      setProgress(null)
      return
    }

    let unlisten: (() => void) | undefined
    listen<ProgressPayload>('artwork-download-progress', (event) => {
      if (!gameId || event.payload.game_id === gameId) {
        setProgress(event.payload)
      }
    })
      .then((fn) => {
        unlisten = fn
      })
      .catch((err) => {
        console.error('Failed to listen for artwork progress:', err)
      })

    return () => {
      unlisten?.()
    }
  }, [open, gameId])

  if (!option) return null

  const sizeFormatted = formatBytes(sizeBytes)
  const isBanner = artworkType === 'banner'
  const isLogo = artworkType === 'logo'

  return (
    <Modal open={open} onClose={isDownloading ? () => {} : onClose} widthClassName="max-w-md">
      <div className="flex flex-col gap-5 p-6">
        {/* Header */}
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-500 shadow-xs">
            <AlertTriangle className="size-5" />
          </span>
          <div>
            <h2 className="text-base font-bold text-text">Large Artwork Detected</h2>
            <p className="mt-0.5 text-xs text-muted">
              This {artworkType} file is unusually large ({sizeFormatted}).
            </p>
          </div>
        </div>

        {/* Media Preview & Specs */}
        <div className="flex flex-col gap-3 rounded-2xl border border-border/80 bg-surface/70 p-3.5 shadow-xs">
          <div
            className={`relative overflow-hidden rounded-xl border border-border bg-bg/60 ${
              isBanner
                ? 'aspect-[16/9]'
                : isLogo
                  ? 'aspect-[16/7]'
                  : 'aspect-[2/3] max-h-56 mx-auto w-36'
            }`}
          >
            <CoverMedia
              src={option.thumbnail_url || option.url}
              mime={!option.thumbnail_url ? option.mime : undefined}
              className="size-full object-cover"
            />
            {option.is_animated && (
              <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-white shadow-xs">
                <Sparkles className="size-3" />
                LIVE COVER
              </span>
            )}
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-3 gap-2 pt-1 text-center font-mono">
            <div className="rounded-xl border border-border/60 bg-surface p-2">
              <span className="block text-[10px] font-bold uppercase text-subtle">File Size</span>
              <span className="mt-0.5 block text-xs font-black text-amber-400">
                {sizeFormatted}
              </span>
            </div>
            <div className="rounded-xl border border-border/60 bg-surface p-2">
              <span className="block text-[10px] font-bold uppercase text-subtle">Resolution</span>
              <span className="mt-0.5 block text-xs font-bold text-text">
                {option.width && option.height ? `${option.width}×${option.height}` : 'Standard'}
              </span>
            </div>
            <div className="rounded-xl border border-border/60 bg-surface p-2">
              <span className="block text-[10px] font-bold uppercase text-subtle">Format</span>
              <span className="mt-0.5 block truncate text-xs font-bold text-text">
                {option.is_animated
                  ? 'Animated'
                  : (option.mime?.split('/')[1] ?? 'Static').toUpperCase()}
              </span>
            </div>
          </div>
        </div>

        {/* Live Progress Bar when Downloading */}
        {isDownloading ? (
          <div className="flex flex-col gap-2 rounded-2xl border border-accent/40 bg-accent/10 p-3.5 shadow-sm">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 font-bold text-accent">
                <Loader2 className="size-3.5 animate-spin text-accent" />
                <span>Downloading {artworkType}…</span>
              </span>
              <span className="font-mono font-black text-text">
                {progress?.percent !== null && progress?.percent !== undefined
                  ? `${Math.round(progress.percent)}%`
                  : progress && sizeBytes > 0
                    ? `${Math.min(100, Math.round((progress.downloaded_bytes / sizeBytes) * 100))}%`
                    : 'Streaming…'}
              </span>
            </div>

            {/* Glowing progress bar */}
            <div className="relative h-2 w-full overflow-hidden rounded-full bg-black/40 ring-1 ring-border/50">
              <div
                className="h-full rounded-full bg-gradient-to-r from-accent to-accent-hover shadow-[0_0_12px_var(--nx-accent)] transition-all duration-150 ease-out"
                style={{
                  width: `${
                    progress?.percent !== null && progress?.percent !== undefined
                      ? Math.min(100, Math.max(3, progress.percent))
                      : progress && sizeBytes > 0
                        ? Math.min(100, Math.max(3, (progress.downloaded_bytes / sizeBytes) * 100))
                        : 10
                  }%`,
                }}
              />
            </div>

            <div className="flex items-center justify-between font-mono text-[10px] text-muted">
              <span>
                {progress ? formatBytes(progress.downloaded_bytes) : '0 KB'} /{' '}
                {progress?.total_bytes ? formatBytes(progress.total_bytes) : sizeFormatted}
              </span>
              <span className="font-bold text-accent">Live Stream</span>
            </div>
          </div>
        ) : (
          /* Notice text */
          <p className="text-xs leading-relaxed text-muted">
            Large artwork files use more storage and increase memory usage while navigating your
            library. Do you want to approve and download this file anyway?
          </p>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={isDownloading}
            className="rounded-xl border border-border/80 bg-surface/70 px-4 py-2 text-xs font-bold text-text shadow-xs transition-all duration-200 hover:bg-surface-raised hover:border-border hover:scale-105 active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDownloading}
            className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-xs font-bold text-white shadow-md shadow-accent/20 transition-all duration-200 hover:bg-accent-hover hover:scale-105 active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            {isDownloading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Download className="size-3.5" />
            )}
            <span>{isDownloading ? 'Downloading…' : 'Approve & Download'}</span>
          </button>
        </div>
      </div>
    </Modal>
  )
}
