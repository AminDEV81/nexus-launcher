import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ExternalLink,
  Film,
  Images,
  Loader2,
  Maximize2,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Tv,
  Volume2,
  X,
} from 'lucide-react'
import { openUrl } from '@tauri-apps/plugin-opener'
import { ModalCloseButton } from '@/components/ui/modal'
import { useAnimationSpeed } from '@/hooks/use-animation-speed'
import { playButtonClick } from '@/lib/sound-engine'
import { cn } from '@/lib/utils'
import {
  resolveHubTrailerStream,
  type ResolvedTrailerStream,
  type SteamTrailerMovie,
} from '@/services/hub'
import type { HubVideo } from '@/types/models'

interface HubMediaShowcaseProps {
  gameName: string
  steamAppId?: string | null
  videos: HubVideo[]
  screenshotUrls?: string[]
  activeTrailerIndex?: number | null
  onSelectTrailer?: (index: number | null) => void
  onPlayTrailer?: (index: number) => void
}

type InlineEngineMode = 'auto_bypass' | 'direct_hd' | 'yt_mirror' | 'yt_embed'

export function HubMediaShowcase({
  gameName,
  steamAppId = null,
  videos,
  screenshotUrls = [],
  activeTrailerIndex = null,
  onSelectTrailer,
  onPlayTrailer,
}: HubMediaShowcaseProps) {
  const speed = useAnimationSpeed()
  const [mediaTab, setMediaTab] = useState<'trailers' | 'screenshots'>(() =>
    videos.length > 0 ? 'trailers' : 'screenshots',
  )
  const [inlineIndex, setInlineIndex] = useState<number | null>(activeTrailerIndex)
  const [resolvedStream, setResolvedStream] = useState<ResolvedTrailerStream | null>(null)
  const [resolvedForVideoId, setResolvedForVideoId] = useState<string | null>(null)
  const [isResolving, setIsResolving] = useState(false)
  const [engineMode, setEngineMode] = useState<InlineEngineMode>('auto_bypass')
  const [directVideoFailed, setDirectVideoFailed] = useState(false)
  const [embedRuntimeBlocked, setEmbedRuntimeBlocked] = useState(false)
  const [selectedSteamMovie, setSelectedSteamMovie] = useState<SteamTrailerMovie | null>(null)
  const [playerKey, setPlayerKey] = useState(0)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [showAllShots, setShowAllShots] = useState(false)

  // Sync external activeTrailerIndex prop from HubGamePage ("Play 18+ Trailer Inline" button)
  useEffect(() => {
    if (activeTrailerIndex !== undefined) {
      setInlineIndex(activeTrailerIndex)
      if (activeTrailerIndex !== null && videos.length > 0) {
        setMediaTab('trailers')
      }
    }
  }, [activeTrailerIndex, videos.length])

  // Automatically select available tab when media updates
  useEffect(() => {
    if (videos.length === 0 && screenshotUrls.length > 0) {
      setMediaTab('screenshots')
    } else if (videos.length > 0 && screenshotUrls.length === 0) {
      setMediaTab('trailers')
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
  }, [lightboxIndex, screenshotUrls.length])

  const currentVideo =
    inlineIndex !== null && inlineIndex >= 0 && inlineIndex < videos.length
      ? videos[inlineIndex]
      : null

  const triggerResolveStream = useCallback(
    async (video: HubVideo) => {
      setIsResolving(true)
      setDirectVideoFailed(false)
      setEmbedRuntimeBlocked(false)
      setSelectedSteamMovie(null)
      try {
        const res = await resolveHubTrailerStream({
          gameName: gameName || video.name || 'Game',
          steamAppId,
          videoId: video.video_id,
          trailerName: video.name,
        })
        setResolvedStream(res)
        setResolvedForVideoId(video.video_id)
        if (res.direct_stream_url || (res.steam_movies && res.steam_movies.length > 0)) {
          setEngineMode('direct_hd')
        } else if (res.is_age_restricted && res.fallback_video_id) {
          setEngineMode('yt_mirror')
        } else {
          setEngineMode('auto_bypass')
        }
      } catch {
        setResolvedStream(null)
        setResolvedForVideoId(video.video_id)
      } finally {
        setIsResolving(false)
      }
    },
    [gameName, steamAppId],
  )

  useEffect(() => {
    if (!currentVideo) {
      setResolvedStream(null)
      setResolvedForVideoId(null)
      return
    }
    void triggerResolveStream(currentVideo)
  }, [currentVideo, triggerResolveStream])

  // Listen for YouTube embed runtime errors (e.g. Error 150 / age restriction inside iframe)
  // and immediately switch to direct HD stream or 18+ mirror without requiring user clicks!
  useEffect(() => {
    if (!currentVideo) return
    const handleMessage = (event: MessageEvent) => {
      if (
        event.origin &&
        !event.origin.includes('youtube.com') &&
        !event.origin.includes('youtube-nocookie.com')
      ) {
        return
      }
      try {
        const raw = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
        if (raw && raw.event === 'onError') {
          setEmbedRuntimeBlocked(true)
          if (resolvedStream?.direct_stream_url && !directVideoFailed) {
            setEngineMode('direct_hd')
          } else if (resolvedStream?.fallback_video_id) {
            setEngineMode('yt_mirror')
          }
        }
      } catch {
        // Ignore non-JSON messages
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [currentVideo, resolvedStream, directVideoFailed])

  if (videos.length === 0 && screenshotUrls.length === 0) {
    return null
  }

  function handleSelectInlineTrailer(index: number | null) {
    playButtonClick()
    setInlineIndex(index)
    onSelectTrailer?.(index)
    if (index !== null) {
      onPlayTrailer?.(index)
    }
  }

  function handlePrevTrailer() {
    if (inlineIndex === null || videos.length <= 1) return
    const prevIdx = (inlineIndex - 1 + videos.length) % videos.length
    handleSelectInlineTrailer(prevIdx)
  }

  function handleNextTrailer() {
    if (inlineIndex === null || videos.length <= 1) return
    const nextIdx = (inlineIndex + 1) % videos.length
    handleSelectInlineTrailer(nextIdx)
  }

  // Wait until resolveHubTrailerStream has finished for the exact currentVideo before mounting the iframe
  // so 18+ restricted trailers NEVER flash an age-gate error on first click!
  const isWaitingResolution =
    currentVideo !== null && (isResolving || resolvedForVideoId !== currentVideo.video_id)

  const indexedSteamMovie =
    selectedSteamMovie ??
    (resolvedStream?.steam_movies && resolvedStream.steam_movies.length > 0
      ? resolvedStream.steam_movies[(inlineIndex ?? 0) % resolvedStream.steam_movies.length]
      : null)

  const directVideoUrl =
    !directVideoFailed &&
    (indexedSteamMovie?.mp4_max ||
      indexedSteamMovie?.mp4_480 ||
      indexedSteamMovie?.webm_max ||
      resolvedStream?.direct_stream_url ||
      null)

  const isAgeRestrictedOrBlocked = Boolean(resolvedStream?.is_age_restricted || embedRuntimeBlocked)

  const shouldUseDirectVideo =
    Boolean(directVideoUrl) && (engineMode === 'direct_hd' || engineMode === 'auto_bypass')

  const effectiveYoutubeVideoId = (() => {
    if (!currentVideo) return ''
    if (engineMode === 'yt_mirror' && resolvedStream?.fallback_video_id) {
      return resolvedStream.fallback_video_id
    }
    if (
      engineMode === 'auto_bypass' &&
      isAgeRestrictedOrBlocked &&
      resolvedStream?.fallback_video_id
    ) {
      return resolvedStream.fallback_video_id
    }
    return currentVideo.video_id
  })()

  const displayedScreenshots = showAllShots ? screenshotUrls : screenshotUrls.slice(0, 9)

  return (
    <section
      id="hub-media-showcase"
      className="flex flex-col gap-5 rounded-3xl border border-border bg-surface p-5 sm:p-7 shadow-sm"
    >
      {/* Header with Smooth Spring-Morphing Tab Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/80 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-2xl border border-accent/30 bg-accent/15 text-accent shadow-inner">
            <Tv className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-extrabold text-text">Media Showcase</h2>
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/35 bg-emerald-500/12 px-2 py-0.5 font-mono text-[9.5px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                <Sparkles className="size-2.5" />
                Live Synced
              </span>
            </div>
            <p className="text-xs text-subtle">
              Latest official trailers, gameplay captures, and 1080p screenshots from IGDB &amp;
              Steam
            </p>
          </div>
        </div>

        {/* Media Switcher Tabs */}
        <div className="inline-flex items-center gap-1 rounded-2xl border border-border bg-surface-raised p-1">
          {videos.length > 0 && (
            <button
              type="button"
              onClick={() => {
                playButtonClick()
                setMediaTab('trailers')
              }}
              className={cn(
                'relative flex cursor-pointer items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-colors duration-200',
                mediaTab === 'trailers' ? 'text-white' : 'text-subtle hover:text-text',
              )}
            >
              {mediaTab === 'trailers' && (
                <motion.span
                  layoutId="hub-media-tab-pill"
                  transition={{ type: 'spring', stiffness: 420, damping: 32, mass: 0.7 }}
                  className="absolute inset-0 rounded-xl bg-accent shadow-xs"
                />
              )}
              <Film className="relative z-10 size-3.5" />
              <span className="relative z-10">Trailers ({videos.length})</span>
            </button>
          )}

          {screenshotUrls.length > 0 && (
            <button
              type="button"
              onClick={() => {
                playButtonClick()
                setMediaTab('screenshots')
              }}
              className={cn(
                'relative flex cursor-pointer items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-colors duration-200',
                mediaTab === 'screenshots' ? 'text-white' : 'text-subtle hover:text-text',
              )}
            >
              {mediaTab === 'screenshots' && (
                <motion.span
                  layoutId="hub-media-tab-pill"
                  transition={{ type: 'spring', stiffness: 420, damping: 32, mass: 0.7 }}
                  className="absolute inset-0 rounded-xl bg-accent shadow-xs"
                />
              )}
              <Images className="relative z-10 size-3.5" />
              <span className="relative z-10">Screenshots ({screenshotUrls.length})</span>
            </button>
          )}
        </div>
      </div>

      {/* Animated Media Body */}
      <AnimatePresence mode="wait" initial={false}>
        {/* Tab 1: Video Trailers (with Light & Dark Mode Adaptive Inline 18+ Player) */}
        {mediaTab === 'trailers' && videos.length > 0 && (
          <motion.div
            key="hub-media-trailers"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 * speed, ease: 'easeOut' }}
            className="flex flex-col gap-5"
          >
            {/* Inline 18+ Trailer Box — Theme-Adaptive for both Light Mode & Dark Mode */}
            <AnimatePresence mode="wait">
              {currentVideo && inlineIndex !== null && (
                <motion.div
                  key={`inline-trailer-box-${currentVideo.video_id}`}
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 * speed }}
                  className="flex flex-col overflow-hidden rounded-2xl border border-border bg-surface-raised shadow-lg ring-1 ring-accent/20"
                >
                  {/* Top Bar (Light & Dark Mode Adaptive) */}
                  <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-border/80 bg-surface px-4 py-3 sm:px-5">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
                        <Volume2 className="size-4 animate-pulse" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="truncate text-sm font-extrabold text-text">
                            {selectedSteamMovie && shouldUseDirectVideo
                              ? selectedSteamMovie.name
                              : currentVideo.name || `Official Trailer #${inlineIndex + 1}`}
                          </h3>
                          {isAgeRestrictedOrBlocked && (
                            <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-300">
                              <ShieldCheck className="size-3" />
                              <span>18+ Age-Gate Bypassed</span>
                            </span>
                          )}
                          {!isAgeRestrictedOrBlocked && shouldUseDirectVideo && (
                            <span className="inline-flex items-center gap-1 rounded-md border border-accent/40 bg-accent/15 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-accent">
                              <Sparkles className="size-3" />
                              <span>Uncensored HD Direct</span>
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] font-medium text-muted">
                          Trailer {inlineIndex + 1} of {videos.length}
                          {shouldUseDirectVideo && resolvedStream?.stream_source
                            ? ` • ${resolvedStream.stream_source}`
                            : effectiveYoutubeVideoId !== currentVideo.video_id
                              ? ' • Unrestricted Mirror Stream'
                              : ''}
                        </p>
                      </div>
                    </div>

                    {/* Stream Source Controls */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {directVideoUrl && (
                        <button
                          type="button"
                          onClick={() => {
                            playButtonClick()
                            setEngineMode(shouldUseDirectVideo ? 'yt_embed' : 'direct_hd')
                          }}
                          className={cn(
                            'inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition-all cursor-pointer',
                            shouldUseDirectVideo
                              ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 shadow-2xs'
                              : 'border-border bg-surface-raised text-muted hover:border-accent/40 hover:text-text',
                          )}
                          title="Switch between Uncensored Direct HD Stream and YouTube Player"
                        >
                          <ShieldCheck className="size-3.5" />
                          <span>
                            {shouldUseDirectVideo ? '18+ Direct HD Active' : 'Use 18+ Direct HD'}
                          </span>
                        </button>
                      )}

                      {resolvedStream?.fallback_video_id && (
                        <button
                          type="button"
                          onClick={() => {
                            playButtonClick()
                            setEngineMode(engineMode === 'yt_mirror' ? 'auto_bypass' : 'yt_mirror')
                            setPlayerKey((k) => k + 1)
                          }}
                          className={cn(
                            'inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition-all cursor-pointer',
                            engineMode === 'yt_mirror' ||
                              (engineMode === 'auto_bypass' &&
                                isAgeRestrictedOrBlocked &&
                                !shouldUseDirectVideo)
                              ? 'border-accent/50 bg-accent/15 text-accent shadow-2xs'
                              : 'border-border bg-surface-raised text-muted hover:border-accent/40 hover:text-text',
                          )}
                          title="Switch to unrestricted mirror stream"
                        >
                          <RefreshCw className="size-3.5" />
                          <span>18+ Mirror</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() =>
                          void openUrl(`https://www.youtube.com/watch?v=${currentVideo.video_id}`)
                        }
                        className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface-raised px-2.5 py-1.5 text-xs font-semibold text-muted hover:border-accent/40 hover:text-text transition-colors cursor-pointer"
                        title="Open trailer in external browser"
                      >
                        <ExternalLink className="size-3.5" />
                        <span className="hidden sm:inline">Browser</span>
                      </button>

                      {videos.length > 1 && (
                        <>
                          <button
                            type="button"
                            onClick={handlePrevTrailer}
                            className="flex size-8 items-center justify-center rounded-xl border border-border bg-surface-raised text-muted hover:border-accent/40 hover:text-text transition-colors cursor-pointer"
                            title="Previous trailer"
                          >
                            <ChevronLeft className="size-4" />
                          </button>
                          <button
                            type="button"
                            onClick={handleNextTrailer}
                            className="flex size-8 items-center justify-center rounded-xl border border-border bg-surface-raised text-muted hover:border-accent/40 hover:text-text transition-colors cursor-pointer"
                            title="Next trailer"
                          >
                            <ChevronRight className="size-4" />
                          </button>
                        </>
                      )}

                      <button
                        type="button"
                        onClick={() => handleSelectInlineTrailer(null)}
                        className="flex size-8 items-center justify-center rounded-xl border border-border bg-surface-raised text-muted hover:border-rose-500/40 hover:bg-rose-500/15 hover:text-rose-600 dark:hover:text-rose-300 transition-colors cursor-pointer"
                        title="Close inline trailer player"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  </div>

                  {/* 16:9 Cinema Stage */}
                  <div className="relative aspect-video w-full bg-black">
                    {isWaitingResolution ? (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-surface-raised text-text">
                        <Loader2 className="size-8 animate-spin text-accent" />
                        <span className="text-xs font-bold text-muted">
                          Resolving Uncensored HD Trailer Stream...
                        </span>
                      </div>
                    ) : shouldUseDirectVideo && directVideoUrl ? (
                      <video
                        key={directVideoUrl}
                        src={directVideoUrl}
                        poster={
                          selectedSteamMovie?.thumbnail ||
                          `https://img.youtube.com/vi/${currentVideo.video_id}/maxresdefault.jpg`
                        }
                        controls
                        autoPlay
                        playsInline
                        onError={() => {
                          setDirectVideoFailed(true)
                          if (resolvedStream?.fallback_video_id) {
                            setEngineMode('yt_mirror')
                          } else {
                            setEngineMode('yt_embed')
                          }
                        }}
                        className="size-full object-contain bg-black"
                      />
                    ) : (
                      <iframe
                        key={`${effectiveYoutubeVideoId}_${playerKey}`}
                        src={`https://www.youtube-nocookie.com/embed/${effectiveYoutubeVideoId}?autoplay=1&rel=0&modestbranding=1&playsinline=1&enablejsapi=1`}
                        title={currentVideo.name || 'Game Trailer'}
                        className="size-full border-0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                        allowFullScreen
                      />
                    )}
                  </div>

                  {/* Uncensored Steam Movies Strip (Light & Dark Mode Adaptive) */}
                  {(resolvedStream?.steam_movies?.length ?? 0) > 1 && (
                    <div className="flex items-center gap-2 overflow-x-auto border-t border-border/80 bg-surface px-4 py-2.5 scrollbar-none">
                      <span className="shrink-0 text-[10px] font-extrabold uppercase tracking-wider text-subtle">
                        Uncensored Steam Clips:
                      </span>
                      {(resolvedStream?.steam_movies ?? []).map((mv, mIdx) => {
                        const isSelected =
                          shouldUseDirectVideo &&
                          (selectedSteamMovie ? selectedSteamMovie.id === mv.id : mIdx === 0)
                        return (
                          <button
                            key={mv.id}
                            type="button"
                            onClick={() => {
                              playButtonClick()
                              setSelectedSteamMovie(mv)
                              setDirectVideoFailed(false)
                              setEngineMode('direct_hd')
                            }}
                            className={cn(
                              'shrink-0 rounded-xl border px-3 py-1 text-xs font-semibold transition-all cursor-pointer',
                              isSelected
                                ? 'border-emerald-500/50 bg-emerald-500/15 font-bold text-emerald-700 dark:text-emerald-300'
                                : 'border-border bg-surface-raised text-muted hover:border-accent/40 hover:text-text',
                            )}
                          >
                            {mv.name || `Clip #${mIdx + 1}`}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Video Thumbnail Grid */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {videos.map((vid, idx) => {
                const isPlayingHere = inlineIndex === idx
                const thumbUrl = `https://img.youtube.com/vi/${vid.video_id}/maxresdefault.jpg`
                const fallbackThumb = `https://img.youtube.com/vi/${vid.video_id}/hqdefault.jpg`

                return (
                  <div
                    key={`${vid.video_id}_${idx}`}
                    role="button"
                    tabIndex={0}
                    aria-label={`Play ${vid.name || `Trailer #${idx + 1}`}`}
                    onClick={() => handleSelectInlineTrailer(idx)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        handleSelectInlineTrailer(idx)
                      }
                    }}
                    className={cn(
                      'group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border bg-surface-raised transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-accent',
                      isPlayingHere
                        ? 'border-accent ring-2 ring-accent/30 shadow-lg shadow-accent/10'
                        : 'border-border hover:border-accent hover:shadow-lg hover:shadow-accent/10',
                    )}
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

                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-70 group-hover:opacity-40 transition-opacity" />

                      <div className="absolute inset-0 flex items-center justify-center">
                        <span
                          className={cn(
                            'flex size-13 items-center justify-center rounded-full text-white shadow-xl transition-transform duration-300 group-hover:scale-115',
                            isPlayingHere
                              ? 'bg-accent shadow-accent/40'
                              : 'bg-red-600 shadow-red-600/40',
                          )}
                        >
                          <Play className="size-6 fill-current ml-0.5" />
                        </span>
                      </div>

                      <span
                        className={cn(
                          'absolute left-2.5 top-2.5 flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold text-white shadow-sm',
                          isPlayingHere ? 'bg-accent' : 'bg-black/80',
                        )}
                      >
                        <Film
                          className={cn('size-3', isPlayingHere ? 'text-white' : 'text-red-500')}
                        />
                        <span>{isPlayingHere ? 'NOW PLAYING' : 'TRAILER'}</span>
                      </span>

                      <span className="absolute bottom-2.5 right-2.5 rounded-md bg-black/80 px-2 py-0.5 font-mono text-[10px] font-bold text-white shadow-sm">
                        #{idx + 1}
                      </span>
                    </div>

                    {/* Video Title Card Footer */}
                    <div className="flex items-center justify-between p-3.5">
                      <span
                        className={cn(
                          'line-clamp-1 text-sm font-bold transition-colors',
                          isPlayingHere ? 'text-accent' : 'text-text group-hover:text-accent',
                        )}
                      >
                        {vid.name || `Official Trailer #${idx + 1}`}
                      </span>
                      <Play className="size-3.5 shrink-0 text-subtle group-hover:text-accent transition-colors" />
                    </div>
                  </div>
                )
              })}
            </div>
          </motion.div>
        )}

        {/* Tab 2: Screenshots */}
        {mediaTab === 'screenshots' && screenshotUrls.length > 0 && (
          <motion.div
            key="hub-media-screenshots"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 * speed, ease: 'easeOut' }}
            className="flex flex-col gap-4"
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {displayedScreenshots.map((url, idx) => (
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

            {screenshotUrls.length > 9 && (
              <div className="flex justify-center pt-1">
                <button
                  type="button"
                  onClick={() => {
                    playButtonClick()
                    setShowAllShots((v) => !v)
                  }}
                  className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface-raised px-4 py-2 text-xs font-semibold text-text transition-all hover:border-accent/50 hover:text-accent cursor-pointer"
                >
                  {showAllShots ? (
                    <>
                      <ChevronUp className="size-3.5" />
                      <span>Show Compact Gallery (9)</span>
                    </>
                  ) : (
                    <>
                      <ChevronDown className="size-3.5" />
                      <span>View All {screenshotUrls.length} High-Res Screenshots</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

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

              {screenshotUrls.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      setLightboxIndex(
                        (lightboxIndex - 1 + screenshotUrls.length) % screenshotUrls.length,
                      )
                    }
                    className="absolute left-4 flex size-12 items-center justify-center rounded-2xl bg-black/75 text-white shadow-xl transition-all hover:bg-black/95 hover:scale-105 active:scale-95 cursor-pointer"
                    aria-label="Previous screenshot"
                  >
                    <ChevronLeft className="size-6" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setLightboxIndex((lightboxIndex + 1) % screenshotUrls.length)}
                    className="absolute right-4 flex size-12 items-center justify-center rounded-2xl bg-black/75 text-white shadow-xl transition-all hover:bg-black/95 hover:scale-105 active:scale-95 cursor-pointer"
                    aria-label="Next screenshot"
                  >
                    <ChevronRight className="size-6" />
                  </button>
                </>
              )}

              <ModalCloseButton
                onClick={() => setLightboxIndex(null)}
                size="lg"
                className="absolute right-3 top-3 bg-black/75 hover:bg-black/90 text-white"
                aria-label="Close screenshot"
              />

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
