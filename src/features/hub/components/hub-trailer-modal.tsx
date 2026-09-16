import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ExternalLink, Play, Film, ShieldAlert, LogIn, Check, RotateCcw, Tv, X } from 'lucide-react'
import { openUrl } from '@tauri-apps/plugin-opener'
import { listen } from '@tauri-apps/api/event'
import { toast } from 'sonner'
import type { HubVideo } from '@/types/models'
import { cn } from '@/lib/utils'
import { useAnimationSpeed } from '@/hooks/use-animation-speed'
import { ModalCloseButton } from '@/components/ui/modal'
import {
  openGoogleAuthWindow,
  openTrailerWindow,
  mountEmbeddedTrailer,
  unmountEmbeddedTrailer,
} from '@/services/hub'

interface HubTrailerModalProps {
  open: boolean
  onClose: () => void
  gameName: string
  videos: HubVideo[]
  initialIndex?: number
}

export function HubTrailerModal({
  open,
  onClose,
  gameName,
  videos,
  initialIndex = 0,
}: HubTrailerModalProps) {
  const [selectedIndex, setSelectedIndex] = useState(initialIndex)
  const [playerKey, setPlayerKey] = useState(0)
  const [isEmbeddedMounted, setIsEmbeddedMounted] = useState(false)
  const [isGoogleConnected, setIsGoogleConnected] = useState(
    () => localStorage.getItem('google_auth_active') === 'true',
  )
  const containerRef = useRef<HTMLDivElement>(null)
  const speed = useAnimationSpeed()

  useEffect(() => {
    if (open) {
      setSelectedIndex(initialIndex)
      setIsEmbeddedMounted(false)
    } else {
      void unmountEmbeddedTrailer()
      setIsEmbeddedMounted(false)
    }
  }, [open, initialIndex])

  // Listen for background Google login success event emitted by Rust backend
  useEffect(() => {
    const unlistenPromise = listen('google-auth-success', () => {
      setIsGoogleConnected(true)
      localStorage.setItem('google_auth_active', 'true')
      setPlayerKey((k) => k + 1)
      toast.success('Google account connected! Age restrictions unlocked.')
    })

    return () => {
      void unlistenPromise.then((unlisten) => unlisten())
    }
  }, [])

  // Auto-check if Google auth is active when returning to launcher window
  useEffect(() => {
    function handleWindowFocus() {
      if (localStorage.getItem('google_auth_active') === 'true') {
        setIsGoogleConnected(true)
      }
    }
    window.addEventListener('focus', handleWindowFocus)
    return () => window.removeEventListener('focus', handleWindowFocus)
  }, [])

  const handleCloseModal = useCallback(() => {
    void unmountEmbeddedTrailer()
    setIsEmbeddedMounted(false)
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

  const currentVideo = videos[selectedIndex] ?? videos[0]
  if (!currentVideo?.video_id) return null

  const youtubeWatchUrl = `https://www.youtube.com/watch?v=${currentVideo.video_id}`
  const embedUrl = `https://www.youtube.com/embed/${currentVideo.video_id}?autoplay=1&rel=0&playsinline=1&enablejsapi=1`

  async function handleGoogleLogin() {
    try {
      await openGoogleAuthWindow()
      toast.info('Sign in to your Google account to lift age restrictions on YouTube trailers.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not open Google sign-in window.')
    }
  }

  async function handleMountInAppPlayer(videoIdOverride?: string) {
    if (!containerRef.current) return
    const vidId = videoIdOverride ?? currentVideo.video_id
    const rect = containerRef.current.getBoundingClientRect()
    try {
      await mountEmbeddedTrailer(
        vidId,
        Math.round(rect.left),
        Math.round(rect.top),
        Math.round(rect.width),
        Math.round(rect.height),
      )
      setIsEmbeddedMounted(true)
      toast.success('Playing directly inside Nexus Launcher.')
    } catch {
      // Fallback: open dedicated trailer window if child mounting fails
      void openTrailerWindow(vidId, currentVideo.name || gameName)
    }
  }

  async function handleUnmountInAppPlayer() {
    try {
      await unmountEmbeddedTrailer()
      setIsEmbeddedMounted(false)
    } catch {
      // Ignore
    }
  }

  function handleSelectTrailer(index: number) {
    setSelectedIndex(index)
    const nextVid = videos[index]
    if (nextVid?.video_id && isEmbeddedMounted) {
      void handleMountInAppPlayer(nextVid.video_id)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-5 lg:p-8">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 * speed }}
            onClick={handleCloseModal}
            className="absolute inset-0 bg-black/85 backdrop-blur-md"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 1, y: 0 }}
            transition={{ duration: 0.24 * speed, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-border/80 bg-surface shadow-2xl"
          >
            {/* Modal Header */}
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border/80 bg-surface-raised px-5 py-3 sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent shadow-inner">
                  <Film className="size-4.5" />
                </div>
                <div className="min-w-0">
                  <h3 className="truncate text-base font-extrabold text-text sm:text-lg">
                    {currentVideo.name || 'Official Trailer'}
                  </h3>
                  <p className="truncate text-xs font-medium text-subtle">{gameName}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* In-App Player Toggle */}
                {isEmbeddedMounted ? (
                  <button
                    type="button"
                    onClick={() => void handleUnmountInAppPlayer()}
                    className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3.5 py-1.5 text-xs font-bold text-text hover:bg-surface-raised active:scale-95 transition-all"
                  >
                    <X className="size-3.5" />
                    <span>Close In-App Player</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleMountInAppPlayer()}
                    title="Play directly inside Nexus without opening a popup"
                    className="flex items-center gap-1.5 rounded-xl bg-accent px-3.5 py-1.5 text-xs font-black text-white shadow-md transition-all hover:bg-accent-hover active:scale-95"
                  >
                    <Tv className="size-4" />
                    <span>In-App Player</span>
                  </button>
                )}

                {/* Google Account Authentication Status in Header */}
                {isGoogleConnected ? (
                  <div className="flex items-center gap-1">
                    <span
                      title="Google Account Connected"
                      className="flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400"
                    >
                      <Check className="size-3.5 text-emerald-500" strokeWidth={2.5} />
                      <span className="hidden sm:inline">Google Connected</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setPlayerKey((k) => k + 1)}
                      title="Reload player with current session"
                      className="flex size-8 items-center justify-center rounded-xl border border-border bg-surface text-subtle hover:text-text hover:bg-surface-raised active:scale-95 transition-all"
                    >
                      <RotateCcw className="size-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleGoogleLogin}
                    title="Sign in with Google to lift YouTube age restrictions"
                    className="flex items-center gap-1.5 rounded-xl border border-red-500/40 bg-red-500/10 px-3.5 py-1.5 text-xs font-bold text-red-500 shadow-xs hover:bg-red-500/20 active:scale-95 transition-all"
                  >
                    <LogIn className="size-3.5" />
                    <span>Sign in with Google</span>
                  </button>
                )}

                {/* Open in Default Web Browser */}
                <button
                  type="button"
                  onClick={() => void openUrl(youtubeWatchUrl)}
                  title="Open on YouTube in Browser"
                  className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text shadow-xs transition-colors hover:border-accent hover:text-accent active:scale-95"
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

            {/* Scrollable Modal Body */}
            <div className="flex flex-1 flex-col overflow-y-auto scrollbar-thin">
              {/* Video Player Box */}
              <div
                ref={containerRef}
                className="relative aspect-video w-full max-h-[58vh] mx-auto bg-black flex items-center justify-center overflow-hidden"
              >
                {!isEmbeddedMounted ? (
                  <iframe
                    key={playerKey}
                    src={embedUrl}
                    title={`${gameName} Trailer`}
                    className="size-full border-0"
                    referrerPolicy="strict-origin-when-cross-origin"
                    sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox allow-forms"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center gap-2 p-6 text-center text-muted">
                    <Tv className="size-8 text-accent animate-pulse" />
                    <span className="text-xs font-semibold text-text">
                      In-App Native Player Active
                    </span>
                    <span className="text-[11px] text-muted">
                      Playing directly inside the modal
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleUnmountInAppPlayer()}
                      className="mt-2 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-subtle hover:text-text hover:bg-surface-raised transition-all"
                    >
                      Switch to Standard Player
                    </button>
                  </div>
                )}
              </div>

              {/* Age restriction & Google verification panel */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/80 bg-surface-raised/95 px-5 py-3 text-xs text-muted">
                <div className="flex items-center gap-2.5 min-w-0">
                  {isGoogleConnected ? (
                    <>
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500">
                        <Check className="size-3.5" strokeWidth={2.5} />
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold text-text truncate">Google Account Connected</p>
                        <p className="text-[11px] text-muted truncate">
                          Age restrictions unlocked. If video is paused or blank, click Reload.
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-500">
                        <ShieldAlert className="size-3.5" />
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold text-text truncate">
                          Mature / Age-Restricted Trailer?
                        </p>
                        <p className="text-[11px] text-muted truncate">
                          If video asks to &ldquo;Sign in to confirm your age&rdquo;, click Sign in
                          with Google to unlock trailers.
                        </p>
                      </div>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {isEmbeddedMounted ? (
                    <button
                      type="button"
                      onClick={() => void handleUnmountInAppPlayer()}
                      className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3.5 py-1.5 text-xs font-semibold text-text hover:bg-surface-raised active:scale-95 transition-all"
                    >
                      <span>Standard Player</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleMountInAppPlayer()}
                      className="flex items-center gap-1.5 rounded-xl bg-accent px-3.5 py-1.5 text-xs font-black text-white shadow-xs hover:bg-accent-hover active:scale-95 transition-all"
                    >
                      <Play className="size-3.5 fill-current" />
                      <span>Play In-App (No Popup)</span>
                    </button>
                  )}

                  {isGoogleConnected ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setPlayerKey((k) => k + 1)}
                        title="Reload video player"
                        className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text hover:bg-surface-raised active:scale-95 transition-all"
                      >
                        <RotateCcw className="size-3.5" />
                        <span>Reload Player</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleGoogleLogin}
                        title="Switch Google account"
                        className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-subtle hover:text-text hover:bg-surface-raised active:scale-95 transition-all"
                      >
                        <LogIn className="size-3.5" />
                        <span>Switch Account</span>
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={handleGoogleLogin}
                      className="flex items-center gap-1.5 rounded-xl bg-red-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-red-500 active:scale-95 transition-all"
                    >
                      <LogIn className="size-3.5" />
                      <span>Sign in with Google</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => void openUrl(youtubeWatchUrl)}
                    title="Open trailer on YouTube in default web browser"
                    className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-subtle hover:text-text hover:bg-surface-raised active:scale-95 transition-all"
                  >
                    <ExternalLink className="size-3.5" />
                    <span>Browser</span>
                  </button>
                </div>
              </div>

              {/* Multi-Trailer Playlist Selector (if more than 1 trailer) */}
              {videos.length > 1 && (
                <div className="border-t border-border/80 bg-surface-raised/80 p-3 sm:p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-subtle">
                      Available Trailers ({videos.length})
                    </span>
                    <span className="text-[11px] text-subtle">Select to switch</span>
                  </div>

                  <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-thin">
                    {videos.map((vid, idx) => {
                      const isSelected = idx === selectedIndex
                      const thumbUrl = `https://img.youtube.com/vi/${vid.video_id}/mqdefault.jpg`

                      return (
                        <button
                          key={vid.video_id}
                          type="button"
                          onClick={() => void handleSelectTrailer(idx)}
                          className={cn(
                            'group relative flex w-44 shrink-0 flex-col items-start gap-1.5 rounded-xl border p-1.5 text-left transition-all',
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
