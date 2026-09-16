import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Film,
  Images,
  Maximize2,
  Play,
  Tv,
} from 'lucide-react'
import { ModalCloseButton } from '@/components/ui/modal'
import { useAnimationSpeed } from '@/hooks/use-animation-speed'
import { cn } from '@/lib/utils'
import type { HubVideo } from '@/types/models'

interface HubMediaShowcaseProps {
  gameName: string
  videos: HubVideo[]
  screenshotUrls: VecStringOrEmpty
  onPlayTrailer: (index: number) => void
}

type VecStringOrEmpty = string[]

export function HubMediaShowcase({
  gameName,
  videos,
  screenshotUrls,
  onPlayTrailer,
}: HubMediaShowcaseProps) {
  const speed = useAnimationSpeed()
  const [mediaTab, setMediaTab] = useState<'trailers' | 'screenshots'>(() =>
    videos.length > 0 ? 'trailers' : 'screenshots',
  )
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  // Automatically select screenshots tab if no trailers are available
  useEffect(() => {
    if (videos.length === 0 && screenshotUrls.length > 0) {
      setMediaTab('screenshots')
    }
  }, [videos.length, screenshotUrls.length])

  // Keyboard navigation for screenshot lightbox
  useEffect(() => {
    if (lightboxIndex === null || screenshotUrls.length === 0) return
    const shotsCount = screenshotUrls.length

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setLightboxIndex(null)
      } else if (event.key === 'ArrowLeft') {
        setLightboxIndex((prev) => (prev !== null ? (prev - 1 + shotsCount) % shotsCount : null))
      } else if (event.key === 'ArrowRight') {
        setLightboxIndex((prev) => (prev !== null ? (prev + 1) % shotsCount : null))
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [lightboxIndex, screenshotUrls])

  if (videos.length === 0 && screenshotUrls.length === 0) {
    return null
  }

  return (
    <section className="flex flex-col gap-4 rounded-3xl border border-border bg-surface p-5 sm:p-7 shadow-sm">
      {/* Header with Tab Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/80 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-xl bg-accent/15 text-accent shadow-inner">
            <Tv className="size-4.5" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-text">Media Showcase</h2>
            <p className="text-xs text-subtle">
              Official trailers and high-definition game captures
            </p>
          </div>
        </div>

        {/* Media Switcher Tabs */}
        <div className="flex items-center rounded-xl border border-border bg-surface-raised p-1">
          {videos.length > 0 && (
            <button
              type="button"
              onClick={() => setMediaTab('trailers')}
              className={cn(
                'flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all',
                mediaTab === 'trailers'
                  ? 'bg-surface text-accent shadow-xs'
                  : 'text-subtle hover:text-text',
              )}
            >
              <Film className="size-3.5" />
              <span>Trailers ({videos.length})</span>
            </button>
          )}

          {screenshotUrls.length > 0 && (
            <button
              type="button"
              onClick={() => setMediaTab('screenshots')}
              className={cn(
                'flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all',
                mediaTab === 'screenshots'
                  ? 'bg-surface text-accent shadow-xs'
                  : 'text-subtle hover:text-text',
              )}
            >
              <Images className="size-3.5" />
              <span>Screenshots ({screenshotUrls.length})</span>
            </button>
          )}
        </div>
      </div>

      {/* Tab 1: Video Trailers */}
      {mediaTab === 'trailers' && videos.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {videos.map((vid, idx) => {
            const thumbUrl = `https://img.youtube.com/vi/${vid.video_id}/maxresdefault.jpg`
            const fallbackThumb = `https://img.youtube.com/vi/${vid.video_id}/hqdefault.jpg`

            return (
              <div
                key={vid.video_id}
                role="button"
                tabIndex={0}
                aria-label={`Play ${vid.name || `Trailer #${idx + 1}`}`}
                onClick={() => onPlayTrailer(idx)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onPlayTrailer(idx)
                  }
                }}
                className="group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-border bg-surface-raised transition-all duration-300 hover:border-accent hover:shadow-lg hover:shadow-accent/10 focus:outline-none focus:ring-2 focus:ring-accent"
              >
                {/* Video Thumbnail */}
                <div className="relative aspect-video w-full overflow-hidden bg-black/80">
                  <img
                    src={thumbUrl}
                    onError={(e) => {
                      ;(e.currentTarget as HTMLImageElement).src = fallbackThumb
                    }}
                    alt={vid.name || `Trailer #${idx + 1}`}
                    className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                    loading="lazy"
                  />

                  {/* Dark gradient mask */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-70 group-hover:opacity-40 transition-opacity" />

                  {/* Big Centered Play Button */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="flex size-13 items-center justify-center rounded-full bg-red-600 text-white shadow-xl shadow-red-600/40 transition-transform duration-300 group-hover:scale-115">
                      <Play className="size-6 fill-current ml-0.5" />
                    </span>
                  </div>

                  {/* Top Indicator */}
                  <span className="absolute left-2.5 top-2.5 flex items-center gap-1 rounded-md bg-black/80 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
                    <Film className="size-3 text-red-500" />
                    <span>TRAILER</span>
                  </span>

                  <span className="absolute bottom-2.5 right-2.5 rounded-md bg-black/80 px-2 py-0.5 font-mono text-[10px] font-bold text-white shadow-sm">
                    #{idx + 1}
                  </span>
                </div>

                {/* Video Title Card Footer */}
                <div className="flex items-center justify-between p-3.5">
                  <span className="line-clamp-1 text-sm font-bold text-text group-hover:text-accent transition-colors">
                    {vid.name || `Official Trailer #${idx + 1}`}
                  </span>
                  <ExternalLink className="size-3.5 shrink-0 text-subtle group-hover:text-accent transition-colors" />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Tab 2: Screenshots */}
      {mediaTab === 'screenshots' && screenshotUrls.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {screenshotUrls.map((url, idx) => (
            <div
              key={url}
              role="button"
              tabIndex={0}
              aria-label={`View screenshot ${idx + 1} in fullscreen`}
              onClick={() => setLightboxIndex(idx)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setLightboxIndex(idx)
                }
              }}
              className={cn(
                'group relative cursor-pointer overflow-hidden rounded-2xl border border-border bg-surface-raised transition-all duration-300 hover:border-accent hover:shadow-lg hover:shadow-accent/10 focus:outline-none focus:ring-2 focus:ring-accent',
                idx === 0 && 'sm:col-span-2 sm:row-span-2',
              )}
            >
              <div
                className={cn(
                  'relative aspect-video w-full overflow-hidden bg-black/60',
                  idx === 0 && 'aspect-auto h-full min-h-[220px]',
                )}
              >
                <img
                  src={url}
                  alt={`${gameName} Screenshot ${idx + 1}`}
                  className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                  loading="lazy"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/35 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                  <span className="flex size-11 items-center justify-center rounded-2xl bg-black/75 text-white shadow-xl">
                    <Maximize2 className="size-5" />
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Screenshot Lightbox Modal */}
      <AnimatePresence>
        {lightboxIndex !== null && screenshotUrls.length > 0 && (
          <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 sm:p-8">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setLightboxIndex(null)}
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 * speed }}
              className="relative z-10 flex max-h-[92vh] max-w-[94vw] flex-col items-center justify-center"
            >
              <img
                src={screenshotUrls[lightboxIndex]}
                alt=""
                className="max-h-[82vh] max-w-full rounded-2xl object-contain shadow-2xl"
              />

              {/* Navigation Controls */}
              {screenshotUrls.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      setLightboxIndex(
                        (lightboxIndex - 1 + screenshotUrls.length) % screenshotUrls.length,
                      )
                    }
                    className="absolute left-4 flex size-12 items-center justify-center rounded-2xl bg-black/75 text-white shadow-xl transition-all hover:bg-black/95 hover:scale-105 active:scale-95"
                    aria-label="Previous screenshot"
                  >
                    <ChevronLeft className="size-6" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setLightboxIndex((lightboxIndex + 1) % screenshotUrls.length)}
                    className="absolute right-4 flex size-12 items-center justify-center rounded-2xl bg-black/75 text-white shadow-xl transition-all hover:bg-black/95 hover:scale-105 active:scale-95"
                    aria-label="Next screenshot"
                  >
                    <ChevronRight className="size-6" />
                  </button>
                </>
              )}

              {/* Close Button */}
              <ModalCloseButton
                onClick={() => setLightboxIndex(null)}
                size="lg"
                className="absolute right-3 top-3 bg-black/75 hover:bg-black/90 text-white"
                aria-label="Close screenshot"
              />

              {/* Index indicator */}
              <span className="mt-3 rounded-full bg-black/80 px-3.5 py-1 text-xs font-bold text-white shadow-sm">
                {lightboxIndex + 1} / {screenshotUrls.length}
              </span>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </section>
  )
}
