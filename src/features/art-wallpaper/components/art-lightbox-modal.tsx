import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  Heart,
  Loader2,
  Maximize2,
  Monitor,
  User,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { openUrl } from '@tauri-apps/plugin-opener'
import { toast } from 'sonner'
import { setDesktopWallpaper, type ArtItem } from '@/services/art-wallpaper'
import { useAnimationSpeed } from '@/hooks/use-animation-speed'
import { playBoostComplete, playButtonClick } from '@/lib/sound-engine'
import { cn } from '@/lib/utils'

interface ArtLightboxModalProps {
  item: ArtItem | null
  onClose: () => void
  onToggleLike: (item: ArtItem) => void
  onDownload: (item: ArtItem) => void
  onPrev?: () => void
  onNext?: () => void
  hasPrev?: boolean
  hasNext?: boolean
}

export function ArtLightboxModal({
  item,
  onClose,
  onToggleLike,
  onDownload,
  onPrev,
  onNext,
  hasPrev = false,
  hasNext = false,
}: ArtLightboxModalProps) {
  const speed = useAnimationSpeed()
  const [zoomed, setZoomed] = useState(false)
  const [copied, setCopied] = useState(false)
  const [applyingWp, setApplyingWp] = useState(false)
  const [useThumbFallback, setUseThumbFallback] = useState(false)

  useEffect(() => {
    setZoomed(false)
    setCopied(false)
    setUseThumbFallback(false)
  }, [item?.id])

  useEffect(() => {
    if (!item) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft' && hasPrev && onPrev) {
        e.preventDefault()
        onPrev()
      } else if (e.key === 'ArrowRight' && hasNext && onNext) {
        e.preventDefault()
        onNext()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [item, onClose, hasPrev, hasNext, onPrev, onNext])

  async function handleSetWallpaper() {
    if (!item || applyingWp) return
    playButtonClick()
    setApplyingWp(true)
    try {
      await setDesktopWallpaper(item.image_url, item.title)
      playBoostComplete()
      toast.success('Desktop wallpaper applied!')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to apply desktop wallpaper.')
    } finally {
      setApplyingWp(false)
    }
  }

  function handleCopyUrl() {
    if (!item) return
    playButtonClick()
    void navigator.clipboard.writeText(item.image_url).then(() => {
      setCopied(true)
      toast.success('Image URL copied to clipboard')
      window.setTimeout(() => setCopied(false), 1800)
    })
  }

  return (
    <AnimatePresence>
      {item && (
        <motion.div
          key="art-lightbox-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 * speed }}
          className="fixed inset-0 z-[210] flex items-center justify-center p-4 sm:p-8"
        >
          <div
            className="absolute inset-0 bg-black/65 dark:bg-black/85 backdrop-blur-md"
            onClick={onClose}
          />
          <motion.div
            key="art-lightbox-dialog"
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: 'spring', stiffness: 340, damping: 28, mass: 0.85 }}
            className="relative z-10 flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-border bg-surface text-text shadow-2xl"
          >
            {/* Top bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/80 bg-surface-raised/60 px-5 py-3.5">
              <div className="min-w-0">
                <h3 className="truncate text-sm sm:text-base font-extrabold text-text">
                  {item.title}
                </h3>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted">
                  <span className="rounded-md border border-accent/30 bg-accent/10 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-accent">
                    {item.source}
                  </span>
                  {item.author && (
                    <span className="inline-flex items-center gap-1">
                      <User className="size-3" /> {item.author}
                    </span>
                  )}
                  {item.width && item.height && (
                    <span className="inline-flex items-center gap-1 font-mono text-[11px]">
                      <Maximize2 className="size-3" /> {item.width} × {item.height}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setZoomed((z) => !z)}
                  className="rounded-xl border border-border bg-surface p-2 text-muted transition hover:border-accent/50 hover:text-accent cursor-pointer"
                  title={zoomed ? 'Fit to Screen' : 'Zoom 100%'}
                >
                  {zoomed ? <ZoomOut className="size-4" /> : <ZoomIn className="size-4" />}
                </button>

                <button
                  type="button"
                  onClick={handleCopyUrl}
                  className="rounded-xl border border-border bg-surface p-2 text-muted transition hover:border-accent/50 hover:text-accent cursor-pointer"
                  title="Copy Direct Image URL"
                >
                  {copied ? <Check className="size-4 text-emerald-500" /> : <Copy className="size-4" />}
                </button>

                <button
                  type="button"
                  disabled={applyingWp}
                  onClick={() => void handleSetWallpaper()}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3 py-2 text-xs font-extrabold text-emerald-600 dark:text-emerald-300 transition hover:bg-emerald-500/25 active:scale-95 disabled:opacity-50 cursor-pointer"
                  title="Download and apply directly as Windows Desktop Wallpaper"
                >
                  {applyingWp ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Monitor className="size-3.5" />
                  )}
                  <span>{applyingWp ? 'Applying...' : 'Set Wallpaper'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => onToggleLike(item)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-extrabold transition active:scale-95 cursor-pointer',
                    item.is_liked
                      ? 'border-rose-500/50 bg-rose-500/15 text-rose-500'
                      : 'border-border bg-surface text-text hover:border-rose-400/50 hover:text-rose-500',
                  )}
                >
                  <Heart className={cn('size-3.5', item.is_liked && 'fill-rose-500 text-rose-500')} />
                  <span>{item.is_liked ? 'Liked' : 'Like'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => onDownload(item)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-xs font-extrabold text-white shadow-md transition hover:bg-accent-hover active:scale-95 cursor-pointer"
                >
                  <Download className="size-3.5" />
                  <span>Download</span>
                </button>

                {item.page_url && (
                  <button
                    type="button"
                    onClick={() => void openUrl(item.page_url!)}
                    className="rounded-xl border border-border bg-surface p-2 text-muted transition hover:border-accent/50 hover:text-accent cursor-pointer"
                    title="Open Original Source Page"
                  >
                    <ExternalLink className="size-4" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl border border-border bg-surface p-2 text-muted transition hover:bg-surface-raised hover:text-text cursor-pointer"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>

            {/* Full Resolution Image + Prev/Next Controls */}
            <div className="relative flex flex-1 items-center justify-center overflow-auto bg-surface-raised/40 p-4 sm:p-6">
              {hasPrev && onPrev && (
                <button
                  type="button"
                  onClick={() => {
                    playButtonClick()
                    onPrev()
                  }}
                  className="fixed left-6 top-1/2 z-20 -translate-y-1/2 rounded-2xl border border-white/15 bg-black/65 p-3 text-white shadow-xl transition hover:scale-105 hover:bg-accent cursor-pointer sm:absolute sm:left-4"
                  title="Previous Artwork (Left Arrow)"
                >
                  <ChevronLeft className="size-5" />
                </button>
              )}

              <img
                src={useThumbFallback ? item.thumb_url : item.image_url}
                alt={item.title}
                onClick={() => setZoomed((z) => !z)}
                onError={() => {
                  if (!useThumbFallback) setUseThumbFallback(true)
                }}
                className={cn(
                  'rounded-2xl shadow-xl transition-all duration-200 cursor-zoom-in',
                  zoomed
                    ? 'max-h-none max-w-none cursor-zoom-out'
                    : 'max-h-[75vh] max-w-full object-contain',
                )}
              />

              {hasNext && onNext && (
                <button
                  type="button"
                  onClick={() => {
                    playButtonClick()
                    onNext()
                  }}
                  className="fixed right-6 top-1/2 z-20 -translate-y-1/2 rounded-2xl border border-white/15 bg-black/65 p-3 text-white shadow-xl transition hover:scale-105 hover:bg-accent cursor-pointer sm:absolute sm:right-4"
                  title="Next Artwork (Right Arrow)"
                >
                  <ChevronRight className="size-5" />
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
