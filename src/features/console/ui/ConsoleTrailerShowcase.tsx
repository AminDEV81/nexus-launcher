import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Film,
  Image as ImageIcon,
  Layers,
  Loader2,
  Maximize2,
  Play,
  RefreshCw,
  Tv,
  X,
} from 'lucide-react'
import type { HubVideo } from '@/types/models'
import {
  openTrailerWindow,
  resolveHubTrailerStream,
  type ResolvedTrailerStream,
  type SteamTrailerMovie,
} from '@/services/hub'
import { FocusScope, useFocusable } from '../nav/FocusScope'

function extractYouTubeId(url: string | null | undefined): string | null {
  if (!url) return null
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([\w-]{11})/)
  return match ? match[1] : null
}

export interface ConsoleTrailerShowcaseProps {
  scopeId: string
  gameName: string
  steamAppId?: string | null
  videos?: HubVideo[]
  trailerUrl?: string | null
  screenshots?: string[]
  isLight?: boolean
}

type MediaFilterMode = 'all' | 'trailers' | 'screenshots'

interface UnifiedMediaItem {
  id: string
  kind: 'trailer' | 'steam_movie' | 'screenshot'
  title: string
  thumbnailUrl: string | null
  video?: HubVideo
  steamMovie?: SteamTrailerMovie
  screenshotUrl?: string
  indexLabel: string
}

export const ConsoleTrailerShowcase: React.FC<ConsoleTrailerShowcaseProps> = ({
  scopeId,
  gameName,
  steamAppId = null,
  videos = [],
  trailerUrl = null,
  screenshots = [],
  isLight = false,
}) => {
  const baseVideos = useMemo<HubVideo[]>(() => {
    if (videos && videos.length > 0) return videos
    const ytId = extractYouTubeId(trailerUrl)
    if (ytId) return [{ name: `${gameName} — Official Trailer`, video_id: ytId }]
    return [{ name: `${gameName} — Official Gameplay Trailer`, video_id: 'auto_trailer' }]
  }, [videos, trailerUrl, gameName])

  const [resolvedStream, setResolvedStream] = useState<ResolvedTrailerStream | null>(null)
  const [loadingStream, setLoadingStream] = useState(true)
  const [directFailed, setDirectFailed] = useState(false)
  const [useEmbedFallback, setUseEmbedFallback] = useState(false)
  const [filterMode, setFilterMode] = useState<MediaFilterMode>('all')
  const [activeItemId, setActiveItemId] = useState<string>('')
  const [lightboxShot, setLightboxShot] = useState<string | null>(null)
  const stripScrollRef = useRef<HTMLDivElement | null>(null)

  const resolveTrailerSource = useCallback(
    async (video: HubVideo) => {
      setLoadingStream(true)
      setDirectFailed(false)
      setUseEmbedFallback(false)
      try {
        const res = await resolveHubTrailerStream({
          gameName,
          steamAppId: steamAppId ?? null,
          videoId: video.video_id || 'auto_trailer',
          trailerName: video.name ?? null,
        })
        setResolvedStream(res)
      } catch {
        setResolvedStream(null)
      } finally {
        setLoadingStream(false)
      }
    },
    [gameName, steamAppId],
  )

  useEffect(() => {
    const firstVideo = baseVideos[0]
    if (!firstVideo) return
    void resolveTrailerSource(firstVideo)
  }, [baseVideos, resolveTrailerSource])

  const steamMovies = resolvedStream?.steam_movies ?? []

  // Build unified list with SCREENSHOTS FIRST followed by Trailers so entering a game page always displays Screenshots first!
  const allMediaItems = useMemo<UnifiedMediaItem[]>(() => {
    const items: UnifiedMediaItem[] = []
    const fallbackThumb = screenshots[0] ?? null

    screenshots.forEach((shotUrl, idx) => {
      items.push({
        id: `media_shot_${idx}`,
        kind: 'screenshot',
        title: `${gameName} — HD Screenshot #${idx + 1}`,
        thumbnailUrl: shotUrl,
        screenshotUrl: shotUrl,
        indexLabel: `SHOT #${idx + 1}`,
      })
    })

    if (steamMovies.length > 0) {
      steamMovies.forEach((mv, idx) => {
        items.push({
          id: `media_smv_${mv.id}_${idx}`,
          kind: 'steam_movie',
          title: mv.name || `${gameName} — Official Trailer #${idx + 1}`,
          thumbnailUrl: mv.thumbnail || fallbackThumb,
          steamMovie: mv,
          indexLabel: `TRAILER #${idx + 1}`,
        })
      })
    } else {
      baseVideos.forEach((v, idx) => {
        const ytId =
          v.video_id && v.video_id !== 'auto_trailer'
            ? v.video_id
            : resolvedStream?.fallback_video_id || null
        items.push({
          id: `media_vid_${v.video_id}_${idx}`,
          kind: 'trailer',
          title: v.name || `${gameName} — Official Trailer #${idx + 1}`,
          thumbnailUrl: ytId
            ? `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`
            : fallbackThumb,
          video: v,
          indexLabel: `TRAILER #${idx + 1}`,
        })
      })
    }

    return items
  }, [steamMovies, baseVideos, screenshots, gameName, resolvedStream?.fallback_video_id])

  const filteredItems = useMemo<UnifiedMediaItem[]>(() => {
    if (filterMode === 'trailers') {
      return allMediaItems.filter((m) => m.kind === 'trailer' || m.kind === 'steam_movie')
    }
    if (filterMode === 'screenshots') {
      const shots = allMediaItems.filter((m) => m.kind === 'screenshot')
      return shots.length > 0 ? shots : allMediaItems
    }
    return allMediaItems
  }, [allMediaItems, filterMode])

  const activeIndex = useMemo(() => {
    const idx = filteredItems.findIndex((m) => m.id === activeItemId)
    return idx >= 0 ? idx : 0
  }, [filteredItems, activeItemId])

  const activeItem = filteredItems[activeIndex] ?? filteredItems[0] ?? null

  const trailerCount = useMemo(
    () => allMediaItems.filter((m) => m.kind !== 'screenshot').length,
    [allMediaItems],
  )
  const screenshotCount = screenshots.length

  const selectMediaByIndex = useCallback(
    (nextIdx: number) => {
      if (filteredItems.length === 0) return
      const wrapped = (nextIdx + filteredItems.length) % filteredItems.length
      const chosen = filteredItems[wrapped]
      if (!chosen) return
      setActiveItemId(chosen.id)
      if (chosen.kind === 'trailer' && chosen.video) {
        void resolveTrailerSource(chosen.video)
      } else if (chosen.kind === 'steam_movie') {
        setDirectFailed(false)
        setUseEmbedFallback(false)
      }
    },
    [filteredItems, resolveTrailerSource],
  )

  const directVideoUrl = useMemo(() => {
    if (!activeItem || activeItem.kind === 'screenshot') return null
    if (directFailed || useEmbedFallback) return null
    if (activeItem.kind === 'steam_movie' && activeItem.steamMovie) {
      return (
        activeItem.steamMovie.mp4_max ||
        activeItem.steamMovie.mp4_480 ||
        activeItem.steamMovie.webm_max ||
        resolvedStream?.direct_stream_url ||
        null
      )
    }
    const smv = steamMovies[0]
    return (
      smv?.mp4_max ||
      smv?.mp4_480 ||
      smv?.webm_max ||
      resolvedStream?.direct_stream_url ||
      null
    )
  }, [activeItem, directFailed, useEmbedFallback, resolvedStream, steamMovies])

  const youtubeVideoId = useMemo(() => {
    if (!activeItem || activeItem.kind === 'screenshot') return null
    if (resolvedStream?.is_age_restricted && resolvedStream?.fallback_video_id) {
      return resolvedStream.fallback_video_id
    }
    if (activeItem.video?.video_id && activeItem.video.video_id !== 'auto_trailer') {
      return activeItem.video.video_id
    }
    return resolvedStream?.fallback_video_id ?? null
  }, [activeItem, resolvedStream])

  const scrollStrip = (dir: -1 | 1) => {
    if (!stripScrollRef.current) return
    stripScrollRef.current.scrollBy({ left: dir * 420, behavior: 'smooth' })
  }

  const filterAllFocus = useFocusable<HTMLButtonElement>({
    id: `${scopeId}_media_filter_all`,
    scopeId,
    onConfirm: () => {
      setFilterMode('all')
      setActiveItemId('')
    },
  })

  const filterTrailersFocus = useFocusable<HTMLButtonElement>({
    id: `${scopeId}_media_filter_trailers`,
    scopeId,
    onConfirm: () => {
      setFilterMode('trailers')
      setActiveItemId('')
    },
  })

  const filterShotsFocus = useFocusable<HTMLButtonElement>({
    id: `${scopeId}_media_filter_shots`,
    scopeId,
    disabled: screenshotCount === 0,
    onConfirm: () => {
      if (screenshotCount > 0) {
        setFilterMode('screenshots')
        setActiveItemId('')
      }
    },
  })

  const prevMediaFocus = useFocusable<HTMLButtonElement>({
    id: `${scopeId}_media_prev_btn`,
    scopeId,
    onConfirm: () => selectMediaByIndex(activeIndex - 1),
  })

  const nextMediaFocus = useFocusable<HTMLButtonElement>({
    id: `${scopeId}_media_next_btn`,
    scopeId,
    onConfirm: () => selectMediaByIndex(activeIndex + 1),
  })

  const retryBtnFocus = useFocusable<HTMLButtonElement>({
    id: `${scopeId}_trailer_retry`,
    scopeId,
    onConfirm: () => {
      const targetVid = activeItem?.video ?? baseVideos[0]
      if (targetVid) void resolveTrailerSource(targetVid)
    },
  })

  const fullscreenBtnFocus = useFocusable<HTMLButtonElement>({
    id: `${scopeId}_media_fullscreen`,
    scopeId,
    onConfirm: () => {
      if (activeItem?.kind === 'screenshot' && activeItem.screenshotUrl) {
        setLightboxShot(activeItem.screenshotUrl)
      } else if (youtubeVideoId) {
        void openTrailerWindow(youtubeVideoId, `${gameName} — Official Trailer`).catch(() => {})
      }
    },
  })

  return (
    <section
      id="console-inline-trailer-section"
      className={`rounded-3xl border p-5 space-y-4 shadow-2xl ${
        isLight
          ? 'border-slate-300 bg-white/95'
          : 'border-white/15 bg-gradient-to-b from-[#10182f] via-[#0c1224] to-[#080d1a]'
      }`}
    >
      {/* Top Bar: Title + Filter Mode Tabs (All Media / Trailers / Screenshots) + Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={`flex size-10 items-center justify-center rounded-2xl border ${
              isLight
                ? 'bg-indigo-50 border-indigo-200 text-indigo-600'
                : 'bg-cyan-500/20 border-cyan-400/40 text-cyan-300'
            }`}
          >
            {activeItem?.kind === 'screenshot' ? (
              <ImageIcon className="size-5" />
            ) : (
              <Film className="size-5" />
            )}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2
                className={`text-lg font-black tracking-tight ${
                  isLight ? 'text-slate-900' : 'text-white'
                }`}
              >
                Media Showcase — Screenshots &amp; Trailers
              </h2>
              <span
                className={`rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase ${
                  isLight
                    ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                    : 'bg-cyan-500/20 border-cyan-400/40 text-cyan-300'
                }`}
              >
                {activeIndex + 1} / {filteredItems.length}
              </span>
              {activeItem?.kind !== 'screenshot' && (
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase ${
                    isLight
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                      : 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300'
                  }`}
                >
                  {resolvedStream?.stream_source || 'HD Stream'}
                </span>
              )}
            </div>
            <p className={`text-xs truncate max-w-xl ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              {activeItem?.title ||
                'Switch seamlessly between Official HD Trailers and 1080p Screenshots'}
            </p>
          </div>
        </div>

        {/* Filter Mode Pills + Utility Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {screenshotCount > 0 && (
            <button
              type="button"
              {...filterShotsFocus.focusProps}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-extrabold transition-all cursor-pointer ${
                filterShotsFocus.isFocused
                  ? 'scale-105 border-cyan-300 bg-cyan-400 text-slate-950 shadow-lg'
                  : filterMode === 'screenshots'
                    ? isLight
                      ? 'border-indigo-600 bg-indigo-600 text-white shadow-xs'
                      : 'border-cyan-400 bg-cyan-500/20 text-cyan-300'
                    : isLight
                      ? 'border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200'
                      : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
              }`}
            >
              <ImageIcon className="size-3.5" />
              <span>Screenshots ({screenshotCount})</span>
            </button>
          )}

          <button
            type="button"
            {...filterTrailersFocus.focusProps}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-extrabold transition-all cursor-pointer ${
              filterTrailersFocus.isFocused
                ? 'scale-105 border-rose-300 bg-rose-400 text-slate-950 shadow-lg'
                : filterMode === 'trailers'
                  ? isLight
                    ? 'border-rose-600 bg-rose-600 text-white shadow-xs'
                    : 'border-rose-400 bg-rose-500/20 text-rose-300'
                  : isLight
                    ? 'border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200'
                    : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
            }`}
          >
            <Film className="size-3.5" />
            <span>Trailers ({trailerCount})</span>
          </button>

          <button
            type="button"
            {...filterAllFocus.focusProps}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-extrabold transition-all cursor-pointer ${
              filterAllFocus.isFocused
                ? 'scale-105 border-cyan-300 bg-cyan-400 text-slate-950 shadow-lg'
                : filterMode === 'all'
                  ? isLight
                    ? 'border-indigo-600 bg-indigo-600 text-white shadow-xs'
                    : 'border-cyan-400 bg-cyan-500/20 text-cyan-300'
                  : isLight
                    ? 'border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200'
                    : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
            }`}
          >
            <Layers className="size-3.5" />
            <span>All ({allMediaItems.length})</span>
          </button>

          {filteredItems.length > 1 && (
            <div className="flex items-center gap-1.5 pl-1">
              <button
                type="button"
                {...prevMediaFocus.focusProps}
                title="Previous Media"
                className={`flex size-8 items-center justify-center rounded-xl border transition-all cursor-pointer ${
                  prevMediaFocus.isFocused
                    ? 'scale-110 border-cyan-300 bg-cyan-400 text-slate-950'
                    : isLight
                      ? 'border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200'
                      : 'border-white/15 bg-white/10 text-white hover:bg-white/20'
                }`}
              >
                <ChevronLeft className="size-4" />
              </button>
              <button
                type="button"
                {...nextMediaFocus.focusProps}
                title="Next Media"
                className={`flex size-8 items-center justify-center rounded-xl border transition-all cursor-pointer ${
                  nextMediaFocus.isFocused
                    ? 'scale-110 border-cyan-300 bg-cyan-400 text-slate-950'
                    : isLight
                      ? 'border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200'
                      : 'border-white/15 bg-white/10 text-white hover:bg-white/20'
                }`}
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          )}

          {activeItem?.kind !== 'screenshot' && (
            <button
              type="button"
              {...retryBtnFocus.focusProps}
              title="Re-sync Trailer Stream"
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-extrabold transition-all cursor-pointer ${
                retryBtnFocus.isFocused
                  ? 'scale-105 border-cyan-300 bg-cyan-400 text-slate-950'
                  : isLight
                    ? 'border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200'
                    : 'border-white/15 bg-white/10 text-white hover:bg-white/15'
              }`}
            >
              <RefreshCw className={`size-3.5 ${loadingStream ? 'animate-spin' : ''}`} />
              <span>Re-sync</span>
            </button>
          )}

          {(activeItem?.kind === 'screenshot' || youtubeVideoId) && (
            <button
              type="button"
              {...fullscreenBtnFocus.focusProps}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-extrabold transition-all cursor-pointer ${
                fullscreenBtnFocus.isFocused
                  ? 'scale-105 border-cyan-300 bg-cyan-400 text-slate-950'
                  : isLight
                    ? 'border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                    : 'border-cyan-400/40 bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25'
              }`}
            >
              {activeItem?.kind === 'screenshot' ? (
                <>
                  <Maximize2 className="size-3.5" />
                  <span>Fullscreen</span>
                </>
              ) : (
                <>
                  <ExternalLink className="size-3.5" />
                  <span>Theater</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Main Switchable 16:9 Media Stage (Plays Trailer OR Displays Screenshot) */}
      <div className="relative aspect-video max-h-[480px] w-full overflow-hidden rounded-2xl border border-white/15 bg-black shadow-2xl mx-auto">
        {activeItem?.kind === 'screenshot' && activeItem.screenshotUrl ? (
          <div
            onClick={() => setLightboxShot(activeItem.screenshotUrl!)}
            className="group relative h-full w-full cursor-pointer overflow-hidden bg-slate-950 flex items-center justify-center"
          >
            <motion.img
              key={activeItem.screenshotUrl}
              src={activeItem.screenshotUrl}
              alt={activeItem.title}
              initial={{ opacity: 0.3, scale: 1.02 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.25 }}
              className="h-full w-full object-contain"
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent p-4 flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-400/20 border border-cyan-400/40 px-3 py-1 text-xs font-extrabold text-cyan-300">
                <ImageIcon className="size-3.5" />
                {activeItem.title}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-xl bg-black/75 border border-white/15 px-3 py-1.5 text-xs font-bold text-white">
                <Maximize2 className="size-3.5 text-cyan-400" />
                Click for Fullscreen
              </span>
            </div>
          </div>
        ) : loadingStream ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-slate-300">
            <Loader2 className="size-9 animate-spin text-cyan-400" />
            <span className="text-sm font-bold">
              Resolving Official HD Trailer Stream for {gameName}...
            </span>
          </div>
        ) : directVideoUrl ? (
          <video
            key={directVideoUrl}
            src={directVideoUrl}
            poster={activeItem?.thumbnailUrl ?? undefined}
            controls
            playsInline
            preload="metadata"
            onError={() => {
              setDirectFailed(true)
              setUseEmbedFallback(true)
            }}
            className="h-full w-full object-contain bg-black"
          />
        ) : youtubeVideoId ? (
          <iframe
            key={youtubeVideoId}
            src={`https://www.youtube-nocookie.com/embed/${youtubeVideoId}?rel=0&modestbranding=1&playsinline=1`}
            title={`${gameName} Official Trailer`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            className="h-full w-full border-0"
          />
        ) : screenshots[0] ? (
          <div
            onClick={() => setLightboxShot(screenshots[0])}
            className="relative h-full w-full cursor-pointer overflow-hidden bg-slate-950"
          >
            <img
              src={screenshots[0]}
              alt={gameName}
              className="h-full w-full object-contain"
            />
          </div>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center text-slate-400">
            <Tv className="size-10 text-slate-500" />
            <p className="text-sm font-bold">
              No direct trailer stream found yet. Click &ldquo;Re-sync&rdquo; to search live sources.
            </p>
          </div>
        )}
      </div>

      {/* Unified Horizontal Thumbnail Strip (Switch between Trailers and Screenshots like Game Hub) */}
      {filteredItems.length > 1 && (
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
              Select Trailer or Screenshot ({filteredItems.length} Items)
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => scrollStrip(-1)}
                className={`flex size-7 items-center justify-center rounded-lg border cursor-pointer ${
                  isLight
                    ? "border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200"
                    : "border-white/15 bg-white/5 text-slate-300 hover:bg-white/15"
                }`}
                title="Scroll Strip Left"
              >
                <ChevronLeft className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => scrollStrip(1)}
                className={`flex size-7 items-center justify-center rounded-lg border cursor-pointer ${
                  isLight
                    ? "border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200"
                    : "border-white/15 bg-white/5 text-slate-300 hover:bg-white/15"
                }`}
                title="Scroll Strip Right"
              >
                <ChevronRight className="size-3.5" />
              </button>
            </div>
          </div>

          <FocusScope
            id={`${scopeId}_media_strip`}
            orientation="horizontal"
            className="flex items-center gap-3 overflow-x-auto no-scrollbar py-1.5 px-1"
          >
            <div ref={stripScrollRef} className="flex items-center gap-3 overflow-x-auto no-scrollbar w-full">
              {filteredItems.map((item, idx) => (
                <MediaStripThumbButton
                  key={item.id}
                  id={`${scopeId}_mthumb_${idx}`}
                  scopeId={`${scopeId}_media_strip`}
                  item={item}
                  active={activeItem?.id === item.id}
                  onSelect={() => selectMediaByIndex(idx)}
                />
              ))}
            </div>
          </FocusScope>
        </div>
      )}

      {/* Fullscreen Lightbox for Screenshots */}
      <AnimatePresence>
        {lightboxShot && (
          <motion.div
            key="console-media-showcase-lightbox"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLightboxShot(null)}
            className="fixed inset-0 z-[290] flex items-center justify-center bg-black/92 backdrop-blur-xl p-8 cursor-pointer"
          >
            <img
              src={lightboxShot}
              alt="Fullscreen Screenshot"
              className="max-h-[88vh] max-w-[92vw] rounded-3xl border border-white/20 object-contain shadow-2xl"
            />
            <button
              type="button"
              onClick={() => setLightboxShot(null)}
              className="absolute right-8 top-8 rounded-full bg-white/15 p-3 text-white hover:bg-white/25 cursor-pointer"
            >
              <X className="size-6" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}

const MediaStripThumbButton: React.FC<{
  id: string
  scopeId: string
  item: UnifiedMediaItem
  active: boolean
  onSelect: () => void
}> = ({ id, scopeId, item, active, onSelect }) => {
  const { focusProps, isFocused } = useFocusable<HTMLButtonElement>({
    id,
    scopeId,
    onConfirm: onSelect,
  })
  const isVideo = item.kind === 'trailer' || item.kind === 'steam_movie'

  return (
    <button
      type="button"
      {...focusProps}
      className={`group relative h-24 w-44 shrink-0 overflow-hidden rounded-2xl border text-left transition-all cursor-pointer outline-none ${
        isFocused
          ? 'scale-105 border-cyan-300 ring-3 ring-cyan-400 shadow-xl z-10'
          : active
            ? 'border-cyan-400 ring-2 ring-cyan-400/50 opacity-100'
            : 'border-white/15 opacity-75 hover:opacity-100'
      }`}
    >
      {item.thumbnailUrl ? (
        <img
          src={item.thumbnailUrl}
          alt={item.title}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-slate-900">
          {isVideo ? (
            <Film className="size-6 text-rose-400" />
          ) : (
            <ImageIcon className="size-6 text-cyan-400" />
          )}
        </div>
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />

      {/* Center Play Overlay for Trailers */}
      {isVideo && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className={`flex size-9 items-center justify-center rounded-full border shadow-lg transition-transform group-hover:scale-110 ${
              active || isFocused
                ? 'border-white bg-rose-500 text-white'
                : 'border-white/40 bg-black/70 text-white'
            }`}
          >
            <Play className="size-4 fill-current translate-x-0.5" />
          </span>
        </div>
      )}

      <div className="absolute inset-x-2 bottom-1.5 flex items-center justify-between gap-1">
        <span
          className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${
            isVideo
              ? 'bg-rose-500/90 text-white'
              : 'bg-cyan-500/85 text-slate-950'
          }`}
        >
          {isVideo ? <Play className="size-2.5 fill-current" /> : <ImageIcon className="size-2.5" />}
          {item.indexLabel}
        </span>
      </div>
    </button>
  )
}
