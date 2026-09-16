import { Heart, Play } from 'lucide-react'
import { playButtonClick } from '@/lib/sound-engine'
import { useSoundtrackPlayer } from '../../hooks/use-soundtrack-player'
import type { GameIdentity, SoundtrackAlbum, SoundtrackTrack } from '../../types'

interface TrackRowProps {
  track: SoundtrackTrack
  album?: SoundtrackAlbum | null
  game?: GameIdentity | null
  index: number
  allTracks?: SoundtrackTrack[]
}

function formatDuration(ms: number) {
  if (!ms || ms <= 0) return '--:--'
  const totalSec = Math.floor(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function TrackRow({ track, album, game, index, allTracks }: TrackRowProps) {
  const {
    currentTrack,
    playbackState,
    currentTime,
    playTrack,
    togglePlay,
    favorites,
    toggleFavorite,
  } = useSoundtrackPlayer()

  const isCurrent = currentTrack?.id === track.id
  const isPlaying =
    isCurrent &&
    (playbackState === 'playing' ||
      (playbackState !== 'paused' && playbackState !== 'error' && currentTime > 0))
  const isFavorite = favorites.has(track.id)

  function handleRowClick() {
    playButtonClick()
    if (isCurrent) {
      togglePlay()
    } else {
      void playTrack(track, album, game, allTracks)
    }
  }

  return (
    <div
      onClick={handleRowClick}
      className={`group flex items-center justify-between gap-3 rounded-2xl px-3.5 py-2.5 cursor-pointer transition-all duration-200 border ${
        isCurrent
          ? 'bg-accent/15 border-accent/30 text-accent shadow-sm'
          : 'border-transparent hover:border-border/80 hover:bg-surface-raised/70 text-text'
      }`}
    >
      {/* Track Index / Play Icon / Equalizer */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-xl font-mono text-xs text-muted group-hover:text-accent">
          {isCurrent &&
          (playbackState === 'loading' || playbackState === 'buffering') &&
          currentTime === 0 ? (
            <span className="size-3.5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          ) : isPlaying ? (
            <div className="flex items-end gap-0.5 h-3.5">
              <span className="w-0.5 h-full bg-accent animate-pulse" />
              <span className="w-0.5 h-2 bg-accent animate-bounce" />
              <span className="w-0.5 h-3 bg-accent animate-pulse" />
            </div>
          ) : isCurrent ? (
            <Play className="size-3.5 fill-current text-accent translate-x-0.5" />
          ) : (
            <span className="group-hover:hidden">{track.track_number || index + 1}</span>
          )}
          {!isCurrent && (
            <Play className="size-3.5 fill-current hidden group-hover:block text-accent translate-x-0.5" />
          )}
        </span>

        {/* Title & Artist */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`truncate text-sm font-semibold tracking-tight ${
                isCurrent ? 'text-accent font-bold' : 'text-text'
              }`}
            >
              {track.title}
            </span>
            {track.local_path && (
              <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold text-emerald-400 border border-emerald-500/20">
                Offline
              </span>
            )}
          </div>
          {track.artist && <div className="truncate text-xs text-muted mt-0.5">{track.artist}</div>}
        </div>
      </div>

      {/* Action Buttons & Duration */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Favorite */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            playButtonClick()
            void toggleFavorite('track', track.id)
          }}
          className={`p-1.5 transition-all ${
            isFavorite
              ? 'text-rose-500'
              : 'opacity-0 group-hover:opacity-100 text-muted hover:text-rose-400'
          }`}
          title="Favorite"
        >
          <Heart className={`size-4 ${isFavorite ? 'fill-current' : ''}`} />
        </button>

        {/* Duration */}
        <span className="font-mono text-xs text-muted w-12 text-right">
          {formatDuration(track.duration_ms)}
        </span>
      </div>
    </div>
  )
}
