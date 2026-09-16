import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Heart,
  ListMusic,
  Maximize2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  X,
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

export function MiniPlayer() {
  const {
    currentTrack,
    currentAlbum,
    currentGame,
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
    closePlayer,
  } = useSoundtrackPlayer()

  const [queueOpen, setQueueOpen] = useState(false)
  const isPlaying =
    playbackState === 'playing' ||
    (playbackState !== 'paused' && playbackState !== 'error' && currentTime > 0)
  const isFavorite = currentTrack ? favorites.has(currentTrack.id) : false

  const coverSrc = useMemo(() => {
    return assetUrl(currentAlbum?.cover_url) || assetUrl(currentGame?.coverUrl) || null
  }, [currentAlbum?.cover_url, currentGame?.coverUrl])

  const visible = Boolean(currentTrack && !isExpanded)

  const effectiveDuration = useMemo(() => {
    if (duration > 0) return duration
    if (currentTrack?.duration_ms && currentTrack.duration_ms > 0) {
      return currentTrack.duration_ms / 1000
    }
    return 0
  }, [duration, currentTrack?.duration_ms])

  const progressPercent =
    effectiveDuration > 0 ? Math.min(100, Math.max(0, (currentTime / effectiveDuration) * 100)) : 0

  return (
    <>
      <AnimatePresence>
        {visible && currentTrack && (
          <motion.div
            key="soundtrack-mini-player"
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-40 flex h-20 shrink-0 items-center justify-between border-t border-border/90 bg-surface/90 px-4 backdrop-blur-2xl shadow-2xl select-none"
          >
            {/* Top Scrubber Progress Bar */}
            <div
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect()
                const clickX = e.clientX - rect.left
                const pct = Math.max(0, Math.min(1, clickX / rect.width))
                if (effectiveDuration > 0) {
                  seek(pct * effectiveDuration)
                }
              }}
              className="group absolute inset-x-0 top-0 h-1.5 cursor-pointer bg-surface-raised/80 transition-all hover:h-2.5"
            >
              <div
                className="h-full bg-gradient-to-r from-accent via-indigo-500 to-accent-hover transition-all group-hover:brightness-110 shadow-[0_0_10px_var(--nx-accent)]"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            {/* 1. Track Info & Artwork */}
            <div className="flex items-center gap-3.5 min-w-0 max-w-[28%]">
              <div
                onClick={() => setExpanded(true)}
                className="relative size-12 shrink-0 overflow-hidden rounded-xl border border-border/80 bg-surface-raised cursor-pointer shadow-md group"
              >
                {coverSrc ? (
                  <img
                    src={coverSrc}
                    alt={currentTrack.title}
                    className="size-full object-cover transition-transform duration-500 group-hover:scale-110"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center bg-accent/10 font-bold text-accent">
                    OST
                  </div>
                )}
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Maximize2 className="size-4 text-white drop-shadow" />
                </div>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    onClick={() => setExpanded(true)}
                    title={currentTrack.title}
                    className="truncate text-xs font-bold text-text hover:text-accent cursor-pointer transition-colors"
                  >
                    {currentTrack.title}
                  </span>
                  {currentTrack.local_path && (
                    <span className="shrink-0 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold text-emerald-400 border border-emerald-500/20">
                      Offline
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 truncate text-[11px] text-muted">
                  <span>{currentGame?.title || currentAlbum?.title || 'Soundtrack'}</span>
                  {currentTrack.artist && (
                    <>
                      <span>•</span>
                      <span className="truncate">{currentTrack.artist}</span>
                    </>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  playButtonClick()
                  void toggleFavorite('track', currentTrack.id)
                }}
                className="p-1 text-muted hover:text-rose-400 transition-colors"
              >
                <Heart
                  className={`size-4 transition-transform active:scale-125 ${
                    isFavorite ? 'fill-rose-500 text-rose-500' : ''
                  }`}
                />
              </button>
            </div>

            {/* 2. Central Player Controls */}
            <div className="flex flex-col items-center gap-1.5 flex-1 max-w-[44%] px-4">
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => {
                    playButtonClick()
                    toggleShuffle()
                  }}
                  title={shuffle ? 'Shuffle On' : 'Shuffle Off'}
                  className={`p-1.5 transition-colors ${
                    shuffle ? 'text-accent' : 'text-muted hover:text-text'
                  }`}
                >
                  <Shuffle className="size-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    playButtonClick()
                    void previous()
                  }}
                  title="Previous Track"
                  className="p-1.5 text-muted hover:text-text active:scale-95 transition-all"
                >
                  <SkipBack className="size-4" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    playButtonClick()
                    togglePlay()
                  }}
                  title={isPlaying ? 'Pause' : 'Play'}
                  className="flex size-9 items-center justify-center rounded-full bg-accent text-white shadow-[0_0_16px_var(--nx-accent)] hover:scale-106 active:scale-95 transition-all"
                >
                  {(playbackState === 'loading' || playbackState === 'buffering') &&
                  currentTime === 0 ? (
                    <span className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : isPlaying ? (
                    <Pause className="size-4 fill-current" />
                  ) : (
                    <Play className="size-4 fill-current translate-x-0.5" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    playButtonClick()
                    void next()
                  }}
                  title="Next Track"
                  className="p-1.5 text-muted hover:text-text active:scale-95 transition-all"
                >
                  <SkipForward className="size-4" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    playButtonClick()
                    cycleRepeatMode()
                  }}
                  title={`Repeat: ${repeatMode}`}
                  className={`p-1.5 transition-colors ${
                    repeatMode !== 'off' ? 'text-accent' : 'text-muted hover:text-text'
                  }`}
                >
                  {repeatMode === 'track' ? (
                    <Repeat1 className="size-3.5" />
                  ) : (
                    <Repeat className="size-3.5" />
                  )}
                </button>
              </div>

              <div className="flex items-center gap-2 font-mono text-[10px] text-muted">
                <span>{formatTime(currentTime)}</span>
                <span>/</span>
                <span>{effectiveDuration > 0 ? formatTime(effectiveDuration) : '--:--'}</span>
              </div>
            </div>

            {/* 3. Visualizer, Volume & Queue */}
            <div className="flex items-center justify-end gap-3 min-w-0 max-w-[28%]">
              {/* Subtle Visualizer */}
              <div className="hidden xl:block">
                <AudioVisualizer mode={visualizerMode} className="w-28 h-6" />
              </div>

              {/* Volume Slider */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleMute}
                  className="p-1 text-muted hover:text-text transition-colors"
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
                  className="h-1 w-16 cursor-pointer appearance-none rounded-lg bg-surface-raised accent-accent"
                />
              </div>

              {/* Queue Drawer Button */}
              <button
                type="button"
                onClick={() => setQueueOpen(!queueOpen)}
                title="Open Queue"
                className={`rounded-xl border p-2 transition-all ${
                  queueOpen
                    ? 'border-accent/40 bg-accent/15 text-accent'
                    : 'border-border/80 bg-surface-raised/60 text-muted hover:text-text'
                }`}
              >
                <ListMusic className="size-4" />
              </button>

              {/* Expand to Cinematic Player */}
              <button
                type="button"
                onClick={() => setExpanded(true)}
                title="Expand Player"
                className="rounded-xl border border-border/80 bg-surface-raised/60 p-2 text-muted hover:text-accent hover:border-accent/30 transition-all"
              >
                <Maximize2 className="size-4" />
              </button>

              {/* Close / Dismiss Player */}
              <button
                type="button"
                onClick={() => {
                  playButtonClick()
                  closePlayer()
                }}
                title="Close Player"
                className="rounded-xl border border-border/80 bg-surface-raised/60 p-2 text-muted hover:text-rose-500 hover:border-rose-500/40 hover:bg-rose-500/10 transition-all"
              >
                <X className="size-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Queue Drawer */}
      <QueueDrawer open={queueOpen} onClose={() => setQueueOpen(false)} />
    </>
  )
}
