import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { listen } from '@tauri-apps/api/event'
import {
  CheckCircle2,
  Download,
  FileImage,
  FolderOpen,
  HardDrive,
  Loader2,
  Maximize2,
  Sparkles,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  downloadArtworkFile,
  getArtworkDownloadInfo,
  getDefaultArtDownloadDir,
  openArtFolder,
  type ArtDownloadInfo,
  type ArtDownloadProgressEvent,
  type ArtItem,
} from '@/services/art-wallpaper'
import { useAnimationSpeed } from '@/hooks/use-animation-speed'
import { playBoostComplete, playButtonClick } from '@/lib/sound-engine'

interface ArtDownloadModalProps {
  item: ArtItem | null
  onClose: () => void
}

function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return 'Unknown'
  const mb = bytes / (1024 * 1024)
  if (mb >= 1) return `${mb.toFixed(2)} MB`
  return `${Math.round(bytes / 1024)} KB`
}

function getAspectLabel(w?: number | null, h?: number | null): string {
  if (!w || !h) return 'High-Res Art'
  const ratio = w / h
  if (ratio >= 2.1) return '21:9 Ultrawide'
  if (ratio >= 1.65) return '16:9 Widescreen'
  if (ratio >= 1.4) return '16:10'
  if (ratio <= 0.85) return 'Portrait Cover'
  return 'Standard'
}

export function ArtDownloadModal({ item, onClose }: ArtDownloadModalProps) {
  const speed = useAnimationSpeed()
  const [destDir, setDestDir] = useState('')
  const [filename, setFilename] = useState('')
  const [info, setInfo] = useState<ArtDownloadInfo | null>(null)
  const [loadingInfo, setLoadingInfo] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState<ArtDownloadProgressEvent | null>(null)
  const [savedPath, setSavedPath] = useState<string | null>(null)

  const downloadId = useMemo(() => (item ? `artdl_${item.id}_${Date.now()}` : ''), [item])

  useEffect(() => {
    if (!item) return
    let cancelled = false
    setProgress(null)
    setSavedPath(null)
    setDownloading(false)
    setInfo(null)
    setFilename(item.title.replace(/[<>:"/\\|?*]+/g, '_').slice(0, 72) || 'nexus_artwork')
    setLoadingInfo(true)

    void getDefaultArtDownloadDir()
      .then((dir) => {
        if (!cancelled) setDestDir(dir)
      })
      .catch(() => undefined)

    void getArtworkDownloadInfo(item.image_url)
      .then((res) => {
        if (!cancelled) setInfo(res)
      })
      .catch(() => {
        if (!cancelled) setInfo(null)
      })
      .finally(() => {
        if (!cancelled) setLoadingInfo(false)
      })

    return () => {
      cancelled = true
    }
  }, [item])

  useEffect(() => {
    if (!item || !downloadId) return
    let disposed = false
    let unlisten: (() => void) | null = null

    listen<ArtDownloadProgressEvent>('art-download-progress', (ev) => {
      if (disposed || ev.payload.download_id !== downloadId) return
      setProgress(ev.payload)
    })
      .then((fn) => {
        if (disposed) fn()
        else unlisten = fn
      })
      .catch(() => undefined)

    return () => {
      disposed = true
      unlisten?.()
    }
  }, [item, downloadId])

  const effectiveBytes = info?.size_bytes ?? item?.file_size_bytes
  const effectiveFormat = (info?.file_format ?? item?.file_format ?? 'jpg').toUpperCase()

  async function handleChooseFolder() {
    playButtonClick()
    try {
      const picked = await openDialog({
        directory: true,
        multiple: false,
        defaultPath: destDir || undefined,
      })
      if (typeof picked === 'string' && picked.trim()) {
        setDestDir(picked)
      }
    } catch {
      // Cancelled
    }
  }

  async function handleStartDownload() {
    if (!item || !destDir.trim() || downloading) return
    playButtonClick()
    setDownloading(true)
    setSavedPath(null)
    setProgress({
      download_id: downloadId,
      downloaded_bytes: 0,
      total_bytes: effectiveBytes ?? null,
      percent: 0,
      status: 'downloading',
    })

    try {
      const outPath = await downloadArtworkFile({
        url: item.image_url,
        destDir: destDir.trim(),
        filename: filename.trim() || item.title,
        downloadId,
      })
      setSavedPath(outPath)
      playBoostComplete()
      toast.success('Artwork downloaded successfully!')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Artwork download failed.')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <AnimatePresence>
      {item && (
        <motion.div
          key="art-download-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 * speed }}
          className="fixed inset-0 z-[220] flex items-center justify-center p-4"
        >
          <div
            className="absolute inset-0 bg-black/55 dark:bg-black/75 backdrop-blur-sm"
            onClick={() => !downloading && onClose()}
          />
          <motion.div
            key="art-download-dialog"
            initial={{ opacity: 0, scale: 0.94, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', stiffness: 360, damping: 28, mass: 0.85 }}
            className="relative z-10 w-full max-w-xl overflow-hidden rounded-3xl border border-border bg-surface text-text shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border/80 px-6 py-4">
              <div className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-2xl border border-accent/25 bg-accent/15 text-accent">
                  <Download className="size-4.5" />
                </span>
                <div>
                  <h3 className="text-sm font-extrabold text-text">Download High-Res Artwork</h3>
                  <p className="text-[11px] text-subtle">
                    Inspect specifications &amp; choose destination
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={downloading}
                onClick={onClose}
                className="rounded-xl p-1.5 text-muted transition hover:bg-surface-raised hover:text-text disabled:opacity-40 cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Body */}
            <div className="flex flex-col gap-5 p-6">
              {/* Preview & Specs Card */}
              <div className="flex flex-col gap-4 rounded-2xl border border-border/80 bg-surface-raised/70 p-3.5 sm:flex-row">
                <img
                  src={item.thumb_url}
                  alt={item.title}
                  className="h-36 w-full shrink-0 rounded-xl bg-surface object-contain shadow-sm sm:w-48"
                />
                <div className="flex min-w-0 flex-1 flex-col justify-between gap-2.5">
                  <div>
                    <div className="line-clamp-2 text-sm font-extrabold text-text">
                      {item.title}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10.5px]">
                      <span className="rounded-md border border-accent/30 bg-accent/10 px-2 py-0.5 font-bold uppercase text-accent">
                        {item.source}
                      </span>
                      {item.author && <span className="truncate text-muted">by {item.author}</span>}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="flex items-center gap-1.5 rounded-xl border border-border/70 bg-surface px-2.5 py-1.5">
                      <Maximize2 className="size-3.5 text-accent" />
                      <span className="font-mono font-bold text-text">
                        {item.width && item.height ? `${item.width} × ${item.height}` : 'Original'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 rounded-xl border border-border/70 bg-surface px-2.5 py-1.5">
                      <HardDrive className="size-3.5 text-emerald-500" />
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {loadingInfo ? 'Checking...' : formatBytes(effectiveBytes)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 rounded-xl border border-border/70 bg-surface px-2.5 py-1.5">
                      <FileImage className="size-3.5 text-violet-500" />
                      <span className="font-mono font-bold text-text">{effectiveFormat}</span>
                    </div>
                    <div className="flex items-center gap-1.5 rounded-xl border border-border/70 bg-surface px-2.5 py-1.5">
                      <Sparkles className="size-3.5 text-amber-500" />
                      <span className="truncate font-semibold text-muted">
                        {getAspectLabel(item.width, item.height)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Filename & Folder Picker */}
              <div className="flex flex-col gap-3">
                <div>
                  <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-subtle">
                    File Name
                  </label>
                  <input
                    type="text"
                    value={filename}
                    disabled={downloading}
                    onChange={(e) => setFilename(e.target.value)}
                    className="w-full rounded-xl border border-border bg-surface-raised px-3.5 py-2 text-xs font-semibold text-text outline-none transition focus:border-accent"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-subtle">
                    Save Destination
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={destDir}
                      disabled={downloading}
                      onChange={(e) => setDestDir(e.target.value)}
                      className="min-w-0 flex-1 rounded-xl border border-border bg-surface-raised px-3.5 py-2 font-mono text-xs text-text outline-none transition focus:border-accent"
                    />
                    <button
                      type="button"
                      disabled={downloading}
                      onClick={() => void handleChooseFolder()}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-border bg-surface-raised px-3.5 py-2 text-xs font-bold text-text transition hover:border-accent/50 hover:text-accent disabled:opacity-40 cursor-pointer"
                    >
                      <FolderOpen className="size-3.5" />
                      <span>Browse</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Live Progress Bar */}
              {(downloading || progress || savedPath) && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl border border-border bg-surface-raised/80 p-3.5"
                >
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 font-bold text-text">
                      {savedPath ? (
                        <>
                          <CheckCircle2 className="size-4 text-emerald-500" />
                          <span>Download Complete</span>
                        </>
                      ) : (
                        <>
                          <Loader2 className="size-3.5 animate-spin text-accent" />
                          <span>Downloading Artwork...</span>
                        </>
                      )}
                    </span>
                    <span className="font-mono text-[11px] font-black text-accent">
                      {progress?.percent ?? 0}%
                    </span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-border/60">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-accent to-emerald-500 transition-all duration-150"
                      style={{ width: `${progress?.percent ?? (savedPath ? 100 : 0)}%` }}
                    />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between font-mono text-[10.5px] text-subtle">
                    <span>
                      {formatBytes(progress?.downloaded_bytes ?? 0)}
                      {progress?.total_bytes ? ` / ${formatBytes(progress.total_bytes)}` : ''}
                    </span>
                    {savedPath && (
                      <span className="max-w-[60%] truncate text-emerald-600 dark:text-emerald-400">
                        {savedPath}
                      </span>
                    )}
                  </div>
                </motion.div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2.5 border-t border-border/80 bg-surface-raised/40 px-6 py-4">
              {savedPath && (
                <button
                  type="button"
                  onClick={() => void openArtFolder(savedPath)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-4 py-2 text-xs font-extrabold text-emerald-600 dark:text-emerald-300 transition hover:bg-emerald-500/25 cursor-pointer"
                >
                  <FolderOpen className="size-3.5" />
                  <span>Open Folder</span>
                </button>
              )}
              <button
                type="button"
                disabled={downloading}
                onClick={onClose}
                className="rounded-xl border border-border bg-surface px-4 py-2 text-xs font-bold text-muted transition hover:bg-surface-raised hover:text-text disabled:opacity-40 cursor-pointer"
              >
                {savedPath ? 'Close' : 'Cancel'}
              </button>
              {!savedPath && (
                <button
                  type="button"
                  disabled={downloading || !destDir.trim()}
                  onClick={() => void handleStartDownload()}
                  className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2 text-xs font-extrabold text-white shadow-md transition hover:bg-accent-hover active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  {downloading ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Download className="size-3.5" />
                  )}
                  <span>{downloading ? 'Downloading...' : 'Start Download'}</span>
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
