import { memo, useState } from 'react'
import { getSecondaryCoverFallbackUrl, resolveAlbumCoverFallback } from '../../services/curated-soundtracks'
import {
  Disc3,
  Gamepad2,
  HardDrive,
  Heart,
  ListMusic,
  Play,
  Radio,
  Sparkles,
} from 'lucide-react'
import { assetUrl } from '@/lib/asset-url'
import { cn } from '@/lib/utils'
import { playButtonClick } from '@/lib/sound-engine'
import {
  cleanGameTitleFromAlbumTitle,
  useSoundtrackStore,
} from '../../store/soundtrack-store'
import type { GameIdentity, SoundtrackAlbum, SoundtrackTrack } from '../../types'

interface TrackRowProps {
  track: SoundtrackTrack
  album?: SoundtrackAlbum | null
  game?: GameIdentity | null
  index: number
  allTracks?: SoundtrackTrack[]
  variant?: 'card' | 'row'
  badgeType?: 'favorite' | 'queue' | 'local' | 'default'
  onOpenAlbum?: (albumId: string) => void
}

function formatDuration(ms: number) {
  if (!ms || ms <= 0) return '2:45'
  const totalSec = Math.floor(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function getFileExtensionBadge(path?: string | null): string {
  if (!path) return 'HI-RES'
  const ext = path.split('.').pop()?.toUpperCase() || 'AUDIO'
  if (['MP3', 'FLAC', 'WAV', 'OGG', 'M4A', 'AAC', 'OPUS'].includes(ext)) {
    return ext
  }
  return 'LOCAL'
}

export const TrackRow = memo(function TrackRow({
  track,
  album,
  game,
  index,
  allTracks,
  variant = 'row',
  badgeType = 'default',
  onOpenAlbum,
}: TrackRowProps) {
  const isCurrent = useSoundtrackStore((s) => s.currentTrack?.id === track.id)
  const isPlaying = useSoundtrackStore(
    (s) =>
      s.currentTrack?.id === track.id &&
      (s.playbackState === 'playing' ||
        (s.playbackState !== 'paused' && s.playbackState !== 'error' && s.currentTime > 0)),
  )
  const isLoading = useSoundtrackStore(
    (s) =>
      s.currentTrack?.id === track.id &&
      (s.playbackState === 'loading' || s.playbackState === 'buffering') &&
      s.currentTime === 0,
  )
  const isFavorite = useSoundtrackStore((s) => s.favorites.has(track.id))
  const playTrack = useSoundtrackStore((s) => s.playTrack)
  const togglePlay = useSoundtrackStore((s) => s.togglePlay)
  const toggleFavorite = useSoundtrackStore((s) => s.toggleFavorite)

  const initialCover =
    assetUrl(album?.cover_url) ||
    assetUrl(game?.coverUrl) ||
    resolveAlbumCoverFallback(album?.title || game?.title) ||
    null
  const [imgSrc, setImgSrc] = useState<string | null>(initialCover)
  const gameTitle =
    game?.title || (album?.title ? cleanGameTitleFromAlbumTitle(album.title) : null)

  function handleRowClick() {
    playButtonClick()
    if (isCurrent) {
      togglePlay()
    } else {
      void playTrack(track, album, game, allTracks)
    }
  }

  // ── RICH VISUAL SOUNDTRACK CARD (Used in Favorites, Live Queue, and Local Library) ──
  if (variant === 'card') {
    const extBadge = track.local_path ? getFileExtensionBadge(track.local_path) : null

    return (
      <div
        onClick={handleRowClick}
        className={cn(
          'group relative flex items-center justify-between gap-3.5 overflow-hidden rounded-2xl border p-3.5 cursor-pointer transition-all duration-200 select-none',
          isCurrent
            ? 'border-accent/60 bg-gradient-to-r from-accent/18 via-accent/8 to-surface-raised shadow-[0_8px_28px_-6px_var(--nx-accent)]'
            : 'border-border/80 bg-gradient-to-br from-surface-raised/85 via-surface/90 to-surface hover:border-accent/45 hover:bg-surface-raised hover:shadow-lg hover:-translate-y-0.5',
        )}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

        {/* Left: Clean Contained Album Cover Thumbnail + Play Overlay */}
        <div className="flex min-w-0 flex-1 items-center gap-3.5">
          <div className="relative size-14 shrink-0 overflow-hidden rounded-xl border border-border/90 bg-surface-raised shadow-md">
            {imgSrc ? (
              <img
                src={imgSrc}
                alt={track.title}
                loading="lazy"
                onError={() => {
                  const nextUrl = getSecondaryCoverFallbackUrl(imgSrc)
                  if (nextUrl && nextUrl !== imgSrc) {
                    setImgSrc(nextUrl)
                  } else {
                    setImgSrc(null)
                  }
                }}
                className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
            ) : (
              <div className="flex size-full items-center justify-center bg-gradient-to-br from-accent/25 via-surface-raised to-bg text-accent">
                <Disc3 className={cn('size-6', isPlaying && 'animate-spin')} />
              </div>
            )}

            {/* Hover / Active Play Overlay */}
            <div
              className={cn(
                'absolute inset-0 flex items-center justify-center bg-black/55 backdrop-blur-[1px] transition-opacity duration-200',
                isCurrent ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
              )}
            >
              {isLoading ? (
                <span className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : isPlaying ? (
                <div className="flex h-4 items-end gap-0.5">
                  <span className="w-1 h-full rounded-full bg-accent animate-pulse" />
                  <span className="w-1 h-2.5 rounded-full bg-cyan-400 animate-bounce" />
                  <span className="w-1 h-3.5 rounded-full bg-accent animate-pulse" />
                </div>
              ) : (
                <span className="flex size-7 items-center justify-center rounded-full bg-accent text-white shadow-md">
                  <Play className="size-3.5 fill-current translate-x-0.5" />
                </span>
              )}
            </div>
          </div>

          {/* Center: Track Title, Game Badge & Composer */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span
                className={cn(
                  'inline-flex items-center rounded-md px-1.5 py-0.5 font-mono text-[9px] font-black',
                  isCurrent
                    ? 'bg-accent text-white'
                    : badgeType === 'queue'
                      ? 'bg-surface border border-border/80 text-accent'
                      : 'bg-surface border border-border/70 text-subtle',
                )}
              >
                #{String(track.track_number || index + 1).padStart(2, '0')}
              </span>

              {isCurrent && (
                <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[9px] font-bold text-emerald-400">
                  <Radio className="size-2.5 animate-pulse" />
                  <span>NOW PLAYING</span>
                </span>
              )}

              {extBadge && (
                <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/35 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[9px] font-bold text-emerald-400">
                  <HardDrive className="size-2.5" />
                  <span>{extBadge}</span>
                </span>
              )}

              {!extBadge && badgeType === 'favorite' && (
                <span className="inline-flex items-center gap-1 rounded-md border border-rose-500/30 bg-rose-500/10 px-1.5 py-0.5 font-mono text-[9px] font-bold text-rose-400">
                  <Sparkles className="size-2.5" />
                  <span>MASTER SCORE</span>
                </span>
              )}
            </div>

            <div
              className={cn(
                'mt-1 truncate text-sm font-bold tracking-tight transition-colors',
                isCurrent ? 'text-accent' : 'text-text group-hover:text-accent',
              )}
            >
              {track.title}
            </div>

            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
              {gameTitle && (
                <span className="inline-flex items-center gap-1 truncate font-semibold text-text/85 max-w-[160px]">
                  <Gamepad2 className="size-3 shrink-0 text-accent" />
                  <span className="truncate">{gameTitle}</span>
                </span>
              )}
              {track.artist && (
                <>
                  {gameTitle && <span className="text-subtle">•</span>}
                  <span className="truncate text-muted">{track.artist}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right: Actions & Duration */}
        <div className="flex shrink-0 items-center gap-1.5">
          {album && onOpenAlbum && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                playButtonClick()
                onOpenAlbum(album.id)
              }}
              title={`Open ${album.title}`}
              className="flex size-8 items-center justify-center rounded-xl border border-border/70 bg-surface/80 text-muted opacity-0 transition-all group-hover:opacity-100 hover:border-accent/40 hover:text-accent"
            >
              <ListMusic className="size-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              playButtonClick()
              void toggleFavorite('track', track.id, {
                track,
                album,
                tracks: allTracks,
              })
            }}
            className={cn(
              'flex size-8 items-center justify-center rounded-xl border transition-all',
              isFavorite
                ? 'border-rose-500/40 bg-rose-500/15 text-rose-500'
                : 'border-border/60 bg-surface/70 text-muted hover:border-rose-500/40 hover:text-rose-400',
            )}
            title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            <Heart className={cn('size-3.5', isFavorite && 'fill-current')} />
          </button>

          <span className="ml-1 rounded-lg border border-border/60 bg-surface/80 px-2 py-1 font-mono text-[11px] font-bold tabular-nums text-muted">
            {formatDuration(track.duration_ms)}
          </span>
        </div>
      </div>
    )
  }

  // ── COMPACT ROW VARIANT (Used inside AlbumDetailModal & HubSoundtrackSection) ──
  return (
    <div
      onClick={handleRowClick}
      className={`group flex items-center justify-between gap-3 rounded-2xl px-3.5 py-2.5 cursor-pointer transition-all duration-200 border ${
        isCurrent
          ? 'bg-accent/15 border-accent/30 text-accent shadow-sm'
          : 'border-transparent hover:border-border/80 hover:bg-surface-raised/70 text-text'
      }`}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-xl font-mono text-xs text-muted group-hover:text-accent">
          {isLoading ? (
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

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            playButtonClick()
            void toggleFavorite('track', track.id, {
              track,
              album,
              tracks: allTracks,
            })
          }}
          className={`p-1.5 transition-all ${
            isFavorite
              ? 'text-rose-500'
              : 'opacity-75 group-hover:opacity-100 text-muted hover:text-rose-400'
          }`}
          title="Favorite"
        >
          <Heart className={`size-4 ${isFavorite ? 'fill-current' : ''}`} />
        </button>

        <span className="font-mono text-xs text-muted w-12 text-right">
          {formatDuration(track.duration_ms)}
        </span>
      </div>
    </div>
  )
})
