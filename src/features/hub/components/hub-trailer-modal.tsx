import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ExternalLink,
  Play,
  Film,
  ShieldAlert,
  ShieldCheck,
  LogIn,
  Check,
  RotateCcw,
  Tv,
  Sparkles,
  Loader2,
  Lock,
} from 'lucide-react'
import { openUrl } from '@tauri-apps/plugin-opener'
import { listen } from '@tauri-apps/api/event'
import { toast } from 'sonner'
import type { HubVideo } from '@/types/models'
import { cn } from '@/lib/utils'
import { useAnimationSpeed } from '@/hooks/use-animation-speed'
import { ModalCloseButton } from '@/components/ui/modal'
import {
  resolveHubTrailerStream,
  openGoogleAuthWindow,
  mountEmbeddedTrailer,
  mountEmbeddedGoogleAuth,
  updateEmbeddedTrailerBounds,
  unmountEmbeddedTrailer,
  type ResolvedTrailerStream,
  type SteamTrailerMovie,
} from '@/services/hub'

interface HubTrailerModalProps {
  open: boolean
  onClose: () => void
  gameName: string
  steamAppId?: string | null
  videos: HubVideo[]
  initialIndex?: number
}

type PlayerEngineMode = 'youtube_embed' | 'direct_bypass' | 'google_docked'

export function HubTrailerModal({
  open,
  onClose,
  gameName,
  steamAppId,
  videos,
  initialIndex = 0,
}: HubTrailerModalProps) {
  const [selectedIndex, setSelectedIndex] = useState(initialIndex)
  const [playerKey, setPlayerKey] = useState(0)
  const [engineMode, setEngineMode] = useState<PlayerEngineMode>('youtube_embed')
  const [isDockedSigningIn, setIsDockedSigningIn] = useState(false)
  const [isResolvingStream, setIsResolvingStream] = useState(false)
  const [resolvedStream, setResolvedStream] = useState<ResolvedTrailerStream | null>(null)
  const [selectedSteamMovie, setSelectedSteamMovie] = useState<SteamTrailerMovie | null>(null)
  const [isGoogleConnected, setIsGoogleConnected] = useState(
    () => localStorage.getItem('google_auth_active') === 'true',
  )
  const containerRef = useRef<HTMLDivElement>(null)
  const speed = useAnimationSpeed()

  const currentVideo = videos[selectedIndex] ?? videos[0]

  useEffect(() => {
    if (open) {
      setSelectedIndex(initialIndex)
      setSelectedSteamMovie(null)
      setEngineMode('youtube_embed')
      setIsDockedSigningIn(false)
    } else {
      void unmountEmbeddedTrailer()
      setEngineMode('youtube_embed')
      setIsDockedSigningIn(false)
    }
  }, [open, initialIndex])

  const handleMountDockedYouTube = useCallback(
    async (videoIdOverride?: string) => {
      if (!containerRef.current || !currentVideo?.video_id) return
      const vidId = videoIdOverride ?? currentVideo.video_id
      const rect = containerRef.current.getBoundingClientRect()
      try {
        setIsDockedSigningIn(false)
        setEngineMode('google_docked')
        await mountEmbeddedTrailer(
          vidId,
          Math.round(rect.left),
          Math.round(rect.top),
          Math.round(rect.width),
          Math.round(rect.height),
        )
      } catch {
        setEngineMode('youtube_embed')
      }
    },
    [currentVideo?.video_id],
  )

  // Automatically check age restriction & resolve direct uncensored HD streams (Steam CDN + Piped + unrestricted mirror)
  useEffect(() => {
    if (!open || !currentVideo?.video_id) return
    let cancelled = false
    setIsResolvingStream(true)

    resolveHubTrailerStream({
      gameName,
      steamAppId,
      videoId: currentVideo.video_id,
      trailerName: currentVideo.name,
    })
      .then((res) => {
        if (cancelled) return
        setResolvedStream(res)
        // Whenever a trailer is 18+ age-restricted, immediately unlock it in-place inside the fixed frame!
        if (res.is_age_restricted) {
          if (res.direct_stream_url) {
            void unmountEmbeddedTrailer()
            setEngineMode('direct_bypass')
            toast.success(
              `18+ Trailer unlocked via ${res.stream_source || 'Uncensored Direct HD Stream'}!`,
            )
          } else if (res.fallback_video_id) {
            void unmountEmbeddedTrailer()
            setEngineMode('youtube_embed')
            setPlayerKey((k) => k + 1)
          } else {
            void handleMountDockedYouTube(currentVideo.video_id)
          }
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setIsResolvingStream(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, currentVideo?.video_id, currentVideo?.name, gameName, steamAppId, handleMountDockedYouTube])

  // Continuously lock docked native WebView bounds to the exact fixed container frame (no manual resizing!)
  useEffect(() => {
    if (!open || engineMode !== 'google_docked') return
    function syncBounds() {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      if (rect.width < 50 || rect.height < 50) return
      void updateEmbeddedTrailerBounds(
        Math.round(rect.left),
        Math.round(rect.top),
        Math.round(rect.width),
        Math.round(rect.height),
      )
    }

    syncBounds()
    const observer =
      typeof ResizeObserver !== 'undefined' && containerRef.current
        ? new ResizeObserver(() => syncBounds())
        : null
    if (observer && containerRef.current) {
      observer.observe(containerRef.current)
    }

    window.addEventListener('resize', syncBounds)
    window.addEventListener('scroll', syncBounds, true)
    const interval = window.setInterval(syncBounds, 350)

    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', syncBounds)
      window.removeEventListener('scroll', syncBounds, true)
      window.clearInterval(interval)
    }
  }, [open, engineMode])

  // Listen for Google login success event emitted by Rust backend
  useEffect(() => {
    const unlistenPromise = listen('google-auth-success', () => {
      setIsGoogleConnected(true)
      setIsDockedSigningIn(false)
      localStorage.setItem('google_auth_active', 'true')
      setPlayerKey((k) => k + 1)
      toast.success('Google account verified! 18+ age-restricted trailers unlocked.')
    })

    return () => {
      void unlistenPromise.then((unlisten) => unlisten())
    }
  }, [])

  const handleCloseModal = useCallback(() => {
    void unmountEmbeddedTrailer()
    setEngineMode('youtube_embed')
    setIsDockedSigningIn(false)
    onClose()
  }, [onClose])

  useEffect(() => {
    if (!open) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        handleCloseModal()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      void unmountEmbeddedTrailer()
    }
  }, [open, handleCloseModal])

  if (!open || videos.length === 0) return null
  if (!currentVideo?.video_id) return null

  const activeVideoId =
    engineMode === 'youtube_embed' &&
    resolvedStream?.is_age_restricted &&
    resolvedStream?.fallback_video_id
      ? resolvedStream.fallback_video_id
      : currentVideo.video_id

  const youtubeWatchUrl = `https://www.youtube.com/watch?v=${currentVideo.video_id}`
  const embedUrl = `https://www.youtube-nocookie.com/embed/${activeVideoId}?autoplay=1&rel=0&playsinline=1&enablejsapi=1&modestbranding=1`

  const directStreamUrl =
    selectedSteamMovie?.mp4_max ||
    selectedSteamMovie?.mp4_480 ||
    selectedSteamMovie?.webm_max ||
    resolvedStream?.direct_stream_url ||
    null

  /**
   * Opens Google Account sign-in directly inside the fixed modal video box (zero popup window!)
   * and automatically transitions into the trailer player once signed in.
   */
  async function handleStartInModalGoogleLogin() {
    if (!containerRef.current) {
      await openGoogleAuthWindow()
      return
    }
    const rect = containerRef.current.getBoundingClientRect()
    try {
      setIsDockedSigningIn(true)
      setEngineMode('google_docked')
      await mountEmbeddedGoogleAuth(
        currentVideo.video_id,
        Math.round(rect.left),
        Math.round(rect.top),
        Math.round(rect.width),
        Math.round(rect.height),
      )
      toast.info(
        'Sign into your Google account inside the fixed player frame — trailer starts automatically!',
      )
    } catch {
      await openGoogleAuthWindow()
    }
  }

  async function handleSwitchToDirectBypass() {
    await unmountEmbeddedTrailer()
    setIsDockedSigningIn(false)
    if (directStreamUrl) {
      setEngineMode('direct_bypass')
      toast.success('Switched to Uncensored Direct HD Stream (Zero Age-Gate).')
    } else if (resolvedStream?.fallback_video_id) {
      setEngineMode('youtube_embed')
      setPlayerKey((k) => k + 1)
      toast.success('Switched to unrestricted official trailer stream.')
    } else {
      await handleMountDockedYouTube(currentVideo.video_id)
    }
  }

  async function handleSwitchToStandardEmbed() {
    await unmountEmbeddedTrailer()
    setIsDockedSigningIn(false)
    setSelectedSteamMovie(null)
    setEngineMode('youtube_embed')
  }

  function handleSelectTrailer(index: number) {
    setSelectedIndex(index)
    setSelectedSteamMovie(null)
    const nextVid = videos[index]
    if (nextVid?.video_id && engineMode === 'google_docked') {
      void handleMountDockedYouTube(nextVid.video_id)
    }
  }

  function handleSelectSteamMovie(movie: SteamTrailerMovie) {
    void unmountEmbeddedTrailer()
    setIsDockedSigningIn(false)
    setSelectedSteamMovie(movie)
    setEngineMode('direct_bypass')
  }

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-5 lg:p-8 select-none">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 * speed }}
            onClick={handleCloseModal}
            className="absolute inset-0 bg-black/85 backdrop-blur-md"
          />

          {/* Fixed-Dimension Modal Container (Non-resizable, locked aspect geometry) */}
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.2 * speed, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 flex w-[92vw] max-w-[1040px] flex-col overflow-hidden rounded-3xl border border-border/80 bg-surface shadow-2xl resize-none"
          >
            {/* Modal Header */}
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border/80 bg-surface-raised px-5 py-3 sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent shadow-inner">
                  <Film className="size-4.5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-base font-extrabold text-text sm:text-lg">
                      {selectedSteamMovie?.name || currentVideo.name || 'Official Trailer'}
                    </h3>
                    {resolvedStream?.is_age_restricted && (
                      <span className="shrink-0 inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 font-mono text-[10px] font-black uppercase text-emerald-400">
                        <ShieldCheck className="size-3" />
                        <span>18+ UNLOCKED</span>
                      </span>
                    )}
                    {isResolvingStream && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-accent/15 px-2 py-0.5 font-mono text-[10px] font-bold text-accent">
                        <Loader2 className="size-3 animate-spin" />
                        <span>Optimizing Stream...</span>
                      </span>
                    )}
                  </div>
                  <p className="truncate text-xs font-medium text-subtle">{gameName}</p>
                </div>
              </div>

              {/* Engine Switcher & Google Account Controls */}
              <div className="flex flex-wrap items-center gap-2">
                {/* 1. 18+ Direct Stream Bypass Button */}
                {directStreamUrl && (
                  <button
                    type="button"
                    onClick={() => void handleSwitchToDirectBypass()}
                    title="Play uncensored HD MP4/WebM trailer directly without YouTube age restrictions"
                    className={cn(
                      'flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-extrabold transition-all active:scale-95 cursor-pointer',
                      engineMode === 'direct_bypass'
                        ? 'border-emerald-500 bg-emerald-500 text-black shadow-md'
                        : 'border-emerald-500/40 bg-emerald-500/12 text-emerald-400 hover:bg-emerald-500/20',
                    )}
                  >
                    <ShieldCheck className="size-3.5" />
                    <span>18+ Direct HD</span>
                  </button>
                )}

                {/* 2. Docked Fixed-Frame Player Button */}
                <button
                  type="button"
                  onClick={() => {
                    if (engineMode === 'google_docked' && !isDockedSigningIn) {
                      void handleSwitchToStandardEmbed()
                    } else {
                      void handleMountDockedYouTube()
                    }
                  }}
                  title="Play inside the fixed theater frame with age-gate auto-bypass"
                  className={cn(
                    'flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition-all active:scale-95 cursor-pointer',
                    engineMode === 'google_docked' && !isDockedSigningIn
                      ? 'border-accent bg-accent text-white shadow-md'
                      : 'border-border bg-surface text-text hover:border-accent/50',
                  )}
                >
                  <Tv className="size-3.5" />
                  <span>
                    {engineMode === 'google_docked' && !isDockedSigningIn
                      ? 'Standard Frame'
                      : 'Theater 18+ Frame'}
                  </span>
                </button>

                {/* 3. In-Frame Google Sign-In Status / Action */}
                {isGoogleConnected ? (
                  <div className="flex items-center gap-1">
                    <span
                      title="Google Account Connected"
                      className="flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-400"
                    >
                      <Check className="size-3.5 text-emerald-400" strokeWidth={2.5} />
                      <span className="hidden sm:inline">Google Verified</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleStartInModalGoogleLogin()}
                      title="Switch or re-authenticate Google account inside frame"
                      className="flex size-8 items-center justify-center rounded-xl border border-border bg-surface text-subtle hover:text-text hover:bg-surface-raised active:scale-95 transition-all cursor-pointer"
                    >
                      <LogIn className="size-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleStartInModalGoogleLogin()}
                    title="Sign in to Google directly inside this fixed frame (no popup)"
                    className="flex items-center gap-1.5 rounded-xl border border-red-500/40 bg-red-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-red-500 active:scale-95 transition-all cursor-pointer"
                  >
                    <LogIn className="size-3.5" />
                    <span className="hidden sm:inline">Google Sign-In</span>
                  </button>
                )}

                {/* Open in Default Web Browser */}
                <button
                  type="button"
                  onClick={() => void openUrl(youtubeWatchUrl)}
                  title="Open on YouTube in Browser"
                  className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text shadow-xs transition-colors hover:border-accent hover:text-accent active:scale-95 cursor-pointer"
                >
                  <ExternalLink className="size-3.5" />
                  <span className="hidden sm:inline">Browser</span>
                </button>

                <ModalCloseButton
                  onClick={handleCloseModal}
                  size="lg"
                  aria-label="Close trailer player"
                />
              </div>
            </div>

            {/* Locked Fixed-Size 16:9 Player Stage (Never manually resizable) */}
            <div className="flex flex-col">
              <div
                ref={containerRef}
                className="relative aspect-video w-full bg-black flex items-center justify-center overflow-hidden resize-none select-none"
              >
                {engineMode === 'direct_bypass' && directStreamUrl ? (
                  <video
                    key={directStreamUrl}
                    src={directStreamUrl}
                    controls
                    autoPlay
                    playsInline
                    className="size-full object-contain bg-black"
                    onError={() => {
                      if (resolvedStream?.fallback_video_id) {
                        setEngineMode('youtube_embed')
                        setPlayerKey((k) => k + 1)
                      } else {
                        void handleMountDockedYouTube()
                      }
                    }}
                  />
                ) : engineMode === 'google_docked' ? (
                  <div className="flex flex-col items-center justify-center gap-2.5 p-6 text-center text-muted">
                    <Tv className="size-8 text-accent animate-pulse" />
                    <span className="text-xs font-bold text-text">
                      {isDockedSigningIn
                        ? 'Google Sign-In Active Inside Fixed Frame'
                        : '18+ Theater Frame Locked & Active'}
                    </span>
                    <span className="text-[11px] text-muted max-w-md">
                      {isDockedSigningIn
                        ? 'Complete your Google sign-in inside this frame. The trailer will start automatically right here.'
                        : 'Playing seamlessly inside the fixed trailer stage.'}
                    </span>
                    <div className="mt-2 flex items-center gap-2">
                      {directStreamUrl && (
                        <button
                          type="button"
                          onClick={() => void handleSwitchToDirectBypass()}
                          className="rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-bold text-black hover:bg-emerald-400 transition-all cursor-pointer"
                        >
                          Switch to Direct HD MP4
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void handleSwitchToStandardEmbed()}
                        className="rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-subtle hover:text-text hover:bg-surface-raised transition-all cursor-pointer"
                      >
                        Return to Standard Frame
                      </button>
                    </div>
                  </div>
                ) : isResolvingStream ? (
                  <div className="flex flex-col items-center justify-center gap-3 p-6 text-center text-muted">
                    <Loader2 className="size-8 animate-spin text-accent" />
                    <span className="text-xs font-bold text-white/90">
                      Resolving Uncensored HD Trailer Stream...
                    </span>
                  </div>
                ) : (
                  <iframe
                    key={`${activeVideoId}_${playerKey}`}
                    src={embedUrl}
                    title={`${gameName} Trailer`}
                    className="size-full border-0 pointer-events-auto"
                    referrerPolicy="strict-origin-when-cross-origin"
                    sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox allow-forms"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                  />
                )}
              </div>

              {/* Compact Status & Instant Unlock Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/80 bg-surface-raised/95 px-5 py-2.5 text-xs text-muted">
                <div className="flex items-center gap-2.5 min-w-0">
                  {engineMode === 'direct_bypass' ? (
                    <>
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
                        <ShieldCheck className="size-3.5" />
                      </span>
                      <div className="min-w-0">
                        <p className="font-bold text-emerald-400 truncate">
                          Uncensored Direct HD Stream Active ({resolvedStream?.stream_source || 'Direct Stream'})
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
                        <Lock className="size-3.5" />
                      </span>
                      <div className="min-w-0">
                        <p className="font-bold text-text truncate">
                          Fixed-Size Seamless Trailer Stage • 18+ Auto-Bypass Ready
                        </p>
                      </div>
                    </>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {directStreamUrl && engineMode !== 'direct_bypass' && (
                    <button
                      type="button"
                      onClick={() => void handleSwitchToDirectBypass()}
                      className="flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-1 text-xs font-extrabold text-black shadow-xs hover:bg-emerald-400 active:scale-95 transition-all cursor-pointer"
                    >
                      <Sparkles className="size-3.5" />
                      <span>Unlock 18+ Direct HD</span>
                    </button>
                  )}

                  {engineMode !== 'google_docked' && (
                    <button
                      type="button"
                      onClick={() => void handleMountDockedYouTube()}
                      className="flex items-center gap-1.5 rounded-xl bg-accent px-3 py-1 text-xs font-extrabold text-white shadow-xs hover:bg-accent-hover active:scale-95 transition-all cursor-pointer"
                    >
                      <Play className="size-3 fill-current" />
                      <span>18+ Theater Mode</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setPlayerKey((k) => k + 1)}
                    title="Reload video player"
                    className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-text hover:bg-surface-raised active:scale-95 transition-all cursor-pointer"
                  >
                    <RotateCcw className="size-3" />
                    <span>Reload</span>
                  </button>
                </div>
              </div>

              {/* Multi-Trailer & Uncensored Steam HD Movies Playlist Selector */}
              {(videos.length > 1 || (resolvedStream?.steam_movies?.length ?? 0) > 0) && (
                <div className="border-t border-border/80 bg-surface-raised/80 p-3 sm:px-5">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-subtle">
                      Available Trailers ({videos.length + (resolvedStream?.steam_movies?.length ?? 0)})
                    </span>
                    <span className="text-[11px] text-emerald-400 font-semibold">
                      Direct HD streams play uncensored with zero age restrictions
                    </span>
                  </div>

                  <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-thin">
                    {/* Official Uncensored Steam HD Trailers */}
                    {(resolvedStream?.steam_movies ?? []).map((movie) => {
                      const isSelected =
                        engineMode === 'direct_bypass' && selectedSteamMovie?.id === movie.id
                      return (
                        <button
                          key={`steam_${movie.id}`}
                          type="button"
                          onClick={() => handleSelectSteamMovie(movie)}
                          className={cn(
                            'group relative flex w-44 shrink-0 flex-col items-start gap-1 rounded-xl border p-1.5 text-left transition-all cursor-pointer',
                            isSelected
                              ? 'border-emerald-500 bg-emerald-500/15 ring-2 ring-emerald-500/30'
                              : 'border-emerald-500/35 bg-surface hover:border-emerald-500 hover:bg-surface-raised',
                          )}
                        >
                          <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black/60">
                            {movie.thumbnail && (
                              <img
                                src={movie.thumbnail}
                                alt=""
                                className="size-full object-cover transition-transform group-hover:scale-105"
                              />
                            )}
                            <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/10">
                              <span
                                className={cn(
                                  'flex size-7 items-center justify-center rounded-full shadow-md transition-transform group-hover:scale-110',
                                  isSelected
                                    ? 'bg-emerald-500 text-black'
                                    : 'bg-black/75 text-emerald-400',
                                )}
                              >
                                <Play className="size-3 fill-current ml-0.5" />
                              </span>
                            </div>
                            <span className="absolute left-1 top-1 rounded bg-emerald-500 px-1.5 py-0.5 font-mono text-[8.5px] font-black text-black">
                              UNCENSORED HD
                            </span>
                          </div>
                          <span className="line-clamp-1 w-full text-xs font-bold text-text">
                            {movie.name}
                          </span>
                        </button>
                      )
                    })}

                    {/* YouTube Trailers */}
                    {videos.map((vid, idx) => {
                      const isSelected = !selectedSteamMovie && idx === selectedIndex
                      const thumbUrl = `https://img.youtube.com/vi/${vid.video_id}/mqdefault.jpg`

                      return (
                        <button
                          key={vid.video_id}
                          type="button"
                          onClick={() => void handleSelectTrailer(idx)}
                          className={cn(
                            'group relative flex w-44 shrink-0 flex-col items-start gap-1 rounded-xl border p-1.5 text-left transition-all cursor-pointer',
                            isSelected
                              ? 'border-accent bg-accent/15 ring-2 ring-accent/30'
                              : 'border-border/80 bg-surface hover:border-accent/50 hover:bg-surface-raised',
                          )}
                        >
                          <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black/60">
                            <img
                              src={thumbUrl}
                              alt=""
                              className="size-full object-cover transition-transform group-hover:scale-105"
                            />
                            <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/10">
                              <span
                                className={cn(
                                  'flex size-7 items-center justify-center rounded-full shadow-md transition-transform group-hover:scale-110',
                                  isSelected ? 'bg-accent text-white' : 'bg-black/75 text-white',
                                )}
                              >
                                <Play className="size-3 fill-current ml-0.5" />
                              </span>
                            </div>
                            <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 py-0.5 font-mono text-[9px] font-bold text-white">
                              #{idx + 1}
                            </span>
                          </div>
                          <span className="line-clamp-1 w-full text-xs font-bold text-text">
                            {vid.name || `Trailer #${idx + 1}`}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
