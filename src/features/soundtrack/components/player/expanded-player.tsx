import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Activity,
  BarChart3,
  ChevronDown,
  Disc,
  Disc3,
  EyeOff,
  Heart,
  ListMusic,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Sparkles,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { playButtonClick } from '@/lib/sound-engine'
import { assetUrl } from '@/lib/asset-url'
import { useSoundtrackPlayer } from '../../hooks/use-soundtrack-player'
import { AudioVisualizer } from './audio-visualizer'
import { QueueDrawer } from './queue-drawer'

function formatTime(seconds: number) {
  if (!isFinite(seconds) || seconds < 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatDuration(ms: number) {
  if (!ms || ms <= 0) return ''
  const totalSec = Math.floor(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function ExpandedPlayer() {
  const {
    currentTrack,
    currentAlbum,
    currentGame,
    queue,
    queueIndex,
    playbackState,
    currentTime,
    duration,
    volume,
    isMuted,
    shuffle,
    repeatMode,
    isExpanded,
    visualizerMode,
    favorites,
    togglePlay,
    seek,
    next,
    previous,
    setVolume,
    toggleMute,
    toggleShuffle,
    cycleRepeatMode,
    setExpanded,
    toggleFavorite,
    setVisualizerMode,
    playTrack,
  } = useSoundtrackPlayer()

  const [showSideQueue, setShowSideQueue] = useState(false)
  const [queueDrawerOpen, setQueueDrawerOpen] = useState(false)
  const [hoverSeekSec, setHoverSeekSec] = useState<number | null>(null)
  const [hoverPercent, setHoverPercent] = useState<number>(0)

  // Listen to Escape to collapse player
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isExpanded) {
        setExpanded(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isExpanded, setExpanded])

  const isPlaying =
    playbackState === 'playing' ||
    (playbackState !== 'paused' && playbackState !== 'error' && currentTime > 0)
  const isFavorite = currentTrack ? favorites.has(currentTrack.id) : false
  const isAlbumFavorite = currentAlbum ? favorites.has(currentAlbum.id) : false
  const coverSrc = assetUrl(currentAlbum?.cover_url) || assetUrl(currentGame?.coverUrl) || null

  const effectiveDuration = useMemo(() => {
    if (duration > 0) return duration
    if (currentTrack?.duration_ms && currentTrack.duration_ms > 0) {
      return currentTrack.duration_ms / 1000
    }
    return 0
  }, [duration, currentTrack?.duration_ms])

  const progressPercent =
    effectiveDuration > 0 ? Math.min(100, Math.max(0, (currentTime / effectiveDuration) * 100)) : 0

  const nextTrack = useMemo(() => {
    if (queue.length === 0 || queueIndex < 0) return null
    const nextIdx = queueIndex + 1
    if (nextIdx < queue.length) return queue[nextIdx]
    if (repeatMode === 'queue') return queue[0]
    return null
  }, [queue, queueIndex, repeatMode])

  const providerBadge = useMemo(() => {
    if (currentTrack?.local_path) return 'Offline Local'
    if (currentTrack?.provider_id === 'khinsider') return 'KHInsider VGM'
    if (currentTrack?.provider_id === 'archive') return 'Internet Archive'
    if (currentTrack?.provider_id === 'steam') return 'Steam OST'
    if (currentTrack?.provider_id === 'invidious' || currentTrack?.provider_id === 'youtube') {
      return 'Direct Audio Stream'
    }
    return 'Digital Soundtrack'
  }, [currentTrack])

  const trackPositionText = useMemo(() => {
    if (!currentTrack) return ''
    const currentNum = currentTrack.track_number || (queueIndex >= 0 ? queueIndex + 1 : 1)
    const total = currentAlbum?.track_count || queue.length || 1
    return `Track ${currentNum} of ${total}`
  }, [currentTrack, queueIndex, currentAlbum?.track_count, queue.length])

  const isVisible = Boolean(isExpanded && currentTrack)

  return (
    <AnimatePresence>
      {isVisible && currentTrack && (
        <motion.div
          key="soundtrack-expanded-player"
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          className="fixed inset-0 z-[120] flex flex-col justify-between overflow-hidden bg-bg/95 text-text select-none"
        >
          {/* 1. Dynamic Ambient Aura Mesh Gradient */}
          {coverSrc && (
            <div
              className="pointer-events-none absolute inset-0 -z-10 scale-110 opacity-25 blur-2xl transition-opacity duration-700 dark:opacity-35"
              style={{
                backgroundImage: `url(${coverSrc})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            />
          )}
          <div className="pointer-events-none absolute inset-0 -z-10 bg-radial-[ellipse_at_center,_var(--tw-gradient-stops)] from-transparent via-surface/40 to-bg/90 dark:via-black/40 dark:to-black/85" />

          {/* 2. Top Navigation & Status Bar */}
          <header className="flex items-center justify-between px-6 py-5 sm:px-10 border-b border-border/80 bg-surface/90">
            {/* Collapse Button */}
            <button
              type="button"
              onClick={() => {
                playButtonClick()
                setExpanded(false)
              }}
              className="group flex items-center gap-2 rounded-2xl border border-border/80 bg-surface-raised/70 px-3.5 py-2 text-xs font-semibold text-text hover:bg-surface-raised hover:border-accent/40 shadow-xs transition-all active:scale-95"
            >
              <ChevronDown className="size-4 transition-transform group-hover:translate-y-0.5" />
              <span>Collapse</span>
              <kbd className="hidden sm:inline-block rounded border border-border/80 bg-surface px-1.5 py-0.5 font-mono text-[9px] text-muted shadow-2xs">
                Esc
              </kbd>
            </button>

            {/* Breadcrumb & Album Like */}
            <div className="flex items-center gap-2 rounded-full border border-border/80 bg-surface-raised/70 px-4 py-1.5 backdrop-blur-xl shadow-card">
              <Sparkles className="size-3.5 text-accent animate-pulse" />
              <span className="text-xs font-bold text-text truncate max-w-[220px] sm:max-w-md">
                {currentAlbum?.title || currentGame?.title || 'Soundtrack Player'}
              </span>
              {currentAlbum && (
                <button
                  type="button"
                  onClick={() => {
                    playButtonClick()
                    void toggleFavorite('album', currentAlbum.id)
                  }}
                  className="ml-1 p-1 text-muted hover:text-rose-500 transition-colors"
                  title={isAlbumFavorite ? 'Remove album from favorites' : 'Add album to favorites'}
                >
                  <Heart
                    className={`size-3.5 transition-transform active:scale-125 ${
                      isAlbumFavorite ? 'fill-rose-500 text-rose-500' : ''
                    }`}
                  />
                </button>
              )}
            </div>

            {/* View Mode Controls: Visualizer Switcher & Side Queue Toggle */}
            <div className="flex items-center gap-2.5">
              {/* Visualizer Mode Toggle */}
              <div className="hidden sm:flex items-center gap-0.5 rounded-2xl border border-border/80 bg-surface-raised/60 p-1 backdrop-blur-md shadow-xs">
                <button
                  type="button"
                  onClick={() => {
                    playButtonClick()
                    setVisualizerMode('minimal')
                  }}
                  className={`flex items-center gap-1 rounded-xl px-2.5 py-1 text-[10px] font-bold tracking-wider transition-all ${
                    visualizerMode === 'minimal'
                      ? 'bg-accent text-white shadow-xs'
                      : 'text-muted hover:text-text hover:bg-surface-raised/50'
                  }`}
                  title="Frequency Bars Visualizer"
                >
                  <BarChart3 className="size-3" />
                  <span>Bars</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    playButtonClick()
                    setVisualizerMode('reactive')
                  }}
                  className={`flex items-center gap-1 rounded-xl px-2.5 py-1 text-[10px] font-bold tracking-wider transition-all ${
                    visualizerMode === 'reactive'
                      ? 'bg-accent text-white shadow-xs'
                      : 'text-muted hover:text-text hover:bg-surface-raised/50'
                  }`}
                  title="Reactive Wave Visualizer"
                >
                  <Activity className="size-3" />
                  <span>Wave</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    playButtonClick()
                    setVisualizerMode('off')
                  }}
                  className={`flex items-center gap-1 rounded-xl px-2.5 py-1 text-[10px] font-bold tracking-wider transition-all ${
                    visualizerMode === 'off'
                      ? 'bg-accent text-white shadow-xs'
                      : 'text-muted hover:text-text hover:bg-surface-raised/50'
                  }`}
                  title="Turn off visualizer"
                >
                  <EyeOff className="size-3" />
                  <span>Off</span>
                </button>
              </div>

              {/* Side-by-Side Queue / Tracklist Toggle */}
              <button
                type="button"
                onClick={() => {
                  playButtonClick()
                  setShowSideQueue(!showSideQueue)
                }}
                className={`flex items-center gap-1.5 rounded-2xl border px-3.5 py-2 text-xs font-semibold transition-all ${
                  showSideQueue
                    ? 'border-accent bg-accent/15 text-accent shadow-xs font-bold'
                    : 'border-border/80 bg-surface-raised/70 text-text hover:bg-surface-raised hover:border-accent/30 shadow-xs'
                }`}
                title={showSideQueue ? 'Hide Side Tracklist' : 'Show Side Tracklist'}
              >
                <ListMusic className="size-4" />
                <span className="hidden sm:inline">Tracklist</span>
              </button>
            </div>
          </header>

          {/* 3. Center Stage: Dual View (Zen Central vs Side-by-Side Tracklist) */}
          <main className="flex flex-1 items-center justify-center p-4 sm:p-6 lg:p-8 overflow-hidden min-h-0">
            <div
              className={`flex w-full max-w-6xl items-center justify-center gap-8 lg:gap-12 transition-all duration-500 ${
                showSideQueue ? 'flex-col md:flex-row' : 'flex-col'
              }`}
            >
              {/* Left Stage: Vinyl Record & Jacket Stage */}
              <div
                className={`flex flex-col items-center text-center transition-all duration-500 ${
                  showSideQueue ? 'w-full md:w-1/2 shrink-0' : 'w-full max-w-xl'
                }`}
              >
                {/* 3D Vinyl Slide-Out Container */}
                <div className="relative group mb-6">
                  <div
                    className={`relative ${
                      showSideQueue
                        ? 'size-52 sm:size-64 md:size-72'
                        : 'size-64 sm:size-80 md:size-96'
                    }`}
                  >
                    {/* The Sliding Spinning Vinyl Record */}
                    <motion.div
                      animate={{
                        x: isPlaying ? '28%' : '0%',
                        rotate: isPlaying ? 360 : 0,
                      }}
                      transition={{
                        x: { duration: 0.8, ease: [0.16, 1, 0.3, 1] },
                        rotate: isPlaying
                          ? { repeat: Infinity, duration: 8, ease: 'linear' }
                          : { duration: 0.4 },
                      }}
                      className="absolute inset-0 rounded-full bg-[#111116] border-[6px] border-[#22222d] shadow-2xl flex items-center justify-center overflow-hidden z-0 ring-1 ring-border/80 dark:ring-white/10"
                    >
                      {/* Realistic Vinyl Grooves */}
                      <div className="absolute inset-2 rounded-full border border-white/10 dark:border-white/5 opacity-80" />
                      <div className="absolute inset-5 rounded-full border border-white/10 dark:border-white/5 opacity-60" />
                      <div className="absolute inset-8 rounded-full border border-white/10 dark:border-white/5 opacity-50" />
                      <div className="absolute inset-11 rounded-full border border-white/10 dark:border-white/5 opacity-40" />
                      <div className="absolute inset-14 rounded-full border border-white/10 dark:border-white/5 opacity-30" />
                      <div className="absolute inset-17 rounded-full border border-white/10 dark:border-white/5 opacity-20" />

                      {/* Vinyl Center Label */}
                      <div className="relative size-24 rounded-full bg-accent/25 border-4 border-surface shadow-inner flex items-center justify-center overflow-hidden">
                        {coverSrc ? (
                          <img
                            src={coverSrc}
                            alt="Vinyl Center"
                            className="size-full object-cover opacity-80"
                          />
                        ) : (
                          <Disc className="size-8 text-accent/80" />
                        )}
                        {/* Spindle Hole */}
                        <div className="absolute size-3 rounded-full bg-surface-raised border border-border shadow-inner" />
                      </div>
                    </motion.div>

                    {/* Album Jacket Poster (Foreground) */}
                    <motion.div
                      animate={{ scale: isPlaying ? 1 : 0.98 }}
                      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                      className="relative size-full overflow-hidden rounded-3xl border border-border/80 bg-surface-raised shadow-card dark:shadow-[0_20px_50px_rgba(0,0,0,0.8)] z-10"
                    >
                      {coverSrc ? (
                        <img
                          src={coverSrc}
                          alt={currentTrack.title}
                          className="size-full object-cover shadow-2xl"
                        />
                      ) : (
                        <div className="flex size-full items-center justify-center bg-accent/15 font-bold text-accent text-4xl">
                          <Disc3 className="size-16 text-accent/80" />
                        </div>
                      )}
                      {/* Glossy Overlay */}
                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-black/25 via-transparent to-white/15" />
                    </motion.div>

                    {/* Ambient Glow */}
                    <div className="pointer-events-none absolute -inset-6 -z-10 rounded-full bg-accent/20 blur-3xl opacity-75" />
                  </div>
                </div>

                {/* Badges: Provider & Position */}
                <div className="flex items-center gap-2 mb-3">
                  <span className="rounded-full bg-surface-raised/80 border border-border/80 px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-accent backdrop-blur-md shadow-2xs">
                    {providerBadge}
                  </span>
                  <span className="rounded-full bg-surface-raised/80 border border-border/80 px-2.5 py-0.5 font-mono text-[10px] font-medium text-muted backdrop-blur-md shadow-2xs">
                    {trackPositionText}
                  </span>
                  {currentTrack.local_path && (
                    <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[9px] font-bold text-emerald-500 dark:text-emerald-400">
                      Offline
                    </span>
                  )}
                </div>

                {/* Track Details */}
                <h1
                  className={`font-black text-text tracking-tight text-balance leading-tight ${
                    showSideQueue ? 'text-2xl sm:text-3xl' : 'text-3xl sm:text-4xl'
                  }`}
                >
                  {currentTrack.title}
                </h1>

                <p className="mt-1.5 text-sm sm:text-base font-semibold text-accent">
                  {currentGame?.title || currentAlbum?.title}
                </p>

                {currentTrack.artist && (
                  <p className="mt-0.5 text-xs sm:text-sm text-muted">{currentTrack.artist}</p>
                )}

                {/* Dynamic Audio Visualizer */}
                <div className="mt-4 w-full flex justify-center">
                  <AudioVisualizer
                    mode={visualizerMode}
                    className={showSideQueue ? 'w-56 h-7' : 'w-72 h-8'}
                  />
                </div>
              </div>

              {/* Right Stage: Interactive Side Tracklist & Queue */}
              {showSideQueue && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                  className="flex flex-col flex-1 w-full max-h-[380px] sm:max-h-[460px] rounded-3xl border border-border/80 bg-surface-raised/95 p-4 shadow-card overflow-hidden"
                >
                  <div className="flex items-center justify-between pb-3 border-b border-border/80">
                    <div className="flex items-center gap-2 font-bold text-sm text-text">
                      <ListMusic className="size-4 text-accent" />
                      <span>Soundtrack Queue</span>
                    </div>
                    <span className="font-mono text-xs text-muted">{queue.length} Tracks</span>
                  </div>

                  {/* Scrollable Tracklist */}
                  <div className="flex-1 overflow-y-auto space-y-1 pt-2 pr-1 custom-scrollbar">
                    {queue.map((track, idx) => {
                      const isCurrent = currentTrack.id === track.id
                      const isTrackPlaying = isCurrent && isPlaying
                      const isFav = favorites.has(track.id)

                      return (
                        <div
                          key={`${track.id}_${idx}`}
                          onClick={() => {
                            playButtonClick()
                            if (isCurrent) {
                              togglePlay()
                            } else {
                              void playTrack(track, currentAlbum, currentGame, queue)
                            }
                          }}
                          className={`group flex items-center justify-between gap-3 rounded-xl px-3 py-2 cursor-pointer transition-all ${
                            isCurrent
                              ? 'bg-accent/15 border border-accent/40 text-accent font-bold shadow-2xs'
                              : 'hover:bg-surface-raised/90 text-text border border-transparent'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <span className="w-5 text-center font-mono text-xs text-muted group-hover:text-accent">
                              {isTrackPlaying ? (
                                <span className="flex items-end gap-0.5 h-3 justify-center">
                                  <span className="w-0.5 h-full bg-accent animate-pulse" />
                                  <span className="w-0.5 h-2 bg-accent animate-bounce" />
                                  <span className="w-0.5 h-2.5 bg-accent animate-pulse" />
                                </span>
                              ) : (
                                track.track_number || idx + 1
                              )}
                            </span>

                            <div className="min-w-0 flex-1">
                              <div className="truncate text-xs font-semibold">{track.title}</div>
                              {track.artist && (
                                <div className="truncate text-[10px] text-muted">
                                  {track.artist}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                playButtonClick()
                                void toggleFavorite('track', track.id)
                              }}
                              className={`p-1 transition-colors ${
                                isFav
                                  ? 'text-rose-500'
                                  : 'opacity-0 group-hover:opacity-100 text-muted hover:text-rose-400'
                              }`}
                            >
                              <Heart className={`size-3.5 ${isFav ? 'fill-current' : ''}`} />
                            </button>

                            {track.duration_ms > 0 && (
                              <span className="font-mono text-[11px] text-muted">
                                {formatDuration(track.duration_ms)}
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </motion.div>
              )}
            </div>
          </main>

          {/* 4. Bottom Stage: Scrubber, Transport Controls, & Volume */}
          <footer className="flex flex-col items-center gap-3 p-6 sm:px-12 sm:pb-8 max-w-4xl w-full mx-auto border-t border-border/80 bg-surface/95 rounded-t-3xl shadow-card">
            {/* Scrubber Bar & Hover Time Tooltip */}
            <div className="w-full relative">
              <div
                onMouseMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect()
                  const x = e.clientX - rect.left
                  const pct = Math.max(0, Math.min(1, x / rect.width))
                  setHoverPercent(pct * 100)
                  if (effectiveDuration > 0) {
                    setHoverSeekSec(pct * effectiveDuration)
                  }
                }}
                onMouseLeave={() => setHoverSeekSec(null)}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect()
                  const clickX = e.clientX - rect.left
                  const pct = Math.max(0, Math.min(1, clickX / rect.width))
                  if (effectiveDuration > 0) {
                    seek(pct * effectiveDuration)
                  }
                }}
                className="group relative h-2.5 w-full cursor-pointer rounded-full bg-surface-raised border border-border/70 transition-all hover:h-3.5 shadow-inner"
              >
                {/* Gradient Progress Bar */}
                <div
                  className="h-full rounded-full bg-gradient-to-r from-accent via-indigo-500 to-accent-hover transition-all group-hover:brightness-110 shadow-[0_0_16px_var(--nx-accent)] relative"
                  style={{ width: `${progressPercent}%` }}
                >
                  {/* Glowing Scrubber Thumb */}
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 size-3.5 rounded-full bg-white shadow-md ring-2 ring-accent opacity-0 group-hover:opacity-100 transition-opacity scale-100 group-hover:scale-125" />
                </div>

                {/* Hover Seek Indicator */}
                {hoverSeekSec !== null && (
                  <div
                    className="pointer-events-none absolute -top-7 -translate-x-1/2 rounded-md bg-surface border border-border/90 px-1.5 py-0.5 font-mono text-[10px] text-text shadow-elevated"
                    style={{ left: `${hoverPercent}%` }}
                  >
                    {formatTime(hoverSeekSec)}
                  </div>
                )}
              </div>

              {/* Timestamp Labels */}
              <div className="mt-2 flex justify-between font-mono text-xs text-muted">
                <span>{formatTime(currentTime)}</span>

                {/* Up Next Pill in Center */}
                {nextTrack && (
                  <div
                    onClick={() => {
                      playButtonClick()
                      void next()
                    }}
                    className="hidden sm:flex items-center gap-1.5 cursor-pointer rounded-full border border-border/80 bg-surface-raised/80 px-3 py-0.5 text-[10px] text-muted hover:text-accent hover:border-accent/40 transition-all shadow-2xs"
                    title={`Skip to next: ${nextTrack.title}`}
                  >
                    <span className="font-bold text-accent uppercase tracking-wider">Up Next</span>
                    <span>•</span>
                    <span className="truncate max-w-[180px]">{nextTrack.title}</span>
                  </div>
                )}

                <span>{effectiveDuration > 0 ? formatTime(effectiveDuration) : '--:--'}</span>
              </div>
            </div>

            {/* Core Controls Deck */}
            <div className="flex items-center justify-between w-full mt-1">
              {/* Left Action: Favorite Track & Shuffle */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    playButtonClick()
                    void toggleFavorite('track', currentTrack.id)
                  }}
                  className="p-2.5 text-muted hover:text-rose-500 transition-colors"
                  title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                >
                  <Heart
                    className={`size-6 transition-transform active:scale-125 ${
                      isFavorite ? 'fill-rose-500 text-rose-500' : ''
                    }`}
                  />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    playButtonClick()
                    toggleShuffle()
                  }}
                  className={`p-2 transition-colors ${
                    shuffle ? 'text-accent' : 'text-muted hover:text-text'
                  }`}
                  title={shuffle ? 'Shuffle On' : 'Shuffle Off'}
                >
                  <Shuffle className="size-5" />
                </button>
              </div>

              {/* Center Controls: Previous, Play/Pause, Next */}
              <div className="flex items-center gap-6">
                <button
                  type="button"
                  onClick={() => {
                    playButtonClick()
                    void previous()
                  }}
                  className="p-2 text-muted hover:text-text active:scale-90 transition-all"
                  title="Previous Track (Ctrl + Left)"
                >
                  <SkipBack className="size-6" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    playButtonClick()
                    togglePlay()
                  }}
                  className="relative flex size-16 items-center justify-center rounded-full bg-accent text-white shadow-[0_0_28px_var(--nx-accent)] hover:scale-106 active:scale-95 transition-all"
                  title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
                >
                  {(playbackState === 'loading' || playbackState === 'buffering') &&
                  currentTime === 0 ? (
                    <span className="size-6 animate-spin rounded-full border-3 border-white border-t-transparent" />
                  ) : isPlaying ? (
                    <Pause className="size-7 fill-current" />
                  ) : (
                    <Play className="size-7 fill-current translate-x-0.5" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    playButtonClick()
                    void next()
                  }}
                  className="p-2 text-muted hover:text-text active:scale-90 transition-all"
                  title="Next Track (Ctrl + Right)"
                >
                  <SkipForward className="size-6" />
                </button>
              </div>

              {/* Right Action: Repeat & Volume */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    playButtonClick()
                    cycleRepeatMode()
                  }}
                  className={`p-2 transition-colors ${
                    repeatMode !== 'off' ? 'text-accent' : 'text-muted hover:text-text'
                  }`}
                  title={`Repeat: ${repeatMode}`}
                >
                  {repeatMode === 'track' ? (
                    <Repeat1 className="size-5" />
                  ) : (
                    <Repeat className="size-5" />
                  )}
                </button>

                {/* Volume Slider with Percentage */}
                <div className="flex items-center gap-2 pl-1 border-l border-border/80">
                  <button
                    type="button"
                    onClick={toggleMute}
                    className="p-1.5 text-muted hover:text-text transition-colors"
                    title={isMuted ? 'Unmute' : 'Mute'}
                  >
                    {isMuted || volume === 0 ? (
                      <VolumeX className="size-4 text-rose-400" />
                    ) : (
                      <Volume2 className="size-4" />
                    )}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.02"
                    value={isMuted ? 0 : volume}
                    onChange={(e) => setVolume(parseFloat(e.target.value))}
                    className="h-1.5 w-20 cursor-pointer appearance-none rounded-lg bg-surface-raised border border-border/80 accent-accent"
                  />
                  <span className="font-mono text-[10px] text-muted w-7 text-right">
                    {Math.round((isMuted ? 0 : volume) * 100)}%
                  </span>
                </div>
              </div>
            </div>

            {/* Keyboard Shortcuts Subtle Helper */}
            <div className="hidden sm:flex items-center gap-3 font-mono text-[10px] text-subtle mt-1">
              <span>Space: Play/Pause</span>
              <span>•</span>
              <span>Ctrl + ←/→: Skip</span>
              <span>•</span>
              <span>Ctrl + ↑/↓: Volume</span>
              <span>•</span>
              <span>Esc: Collapse</span>
            </div>
          </footer>

          {/* Slide-out Queue Drawer (Alternate Full Drawer) */}
          <QueueDrawer open={queueDrawerOpen} onClose={() => setQueueDrawerOpen(false)} />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
