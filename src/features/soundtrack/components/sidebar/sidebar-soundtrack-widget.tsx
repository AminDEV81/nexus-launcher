import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Disc3, Heart, ListMusic, Music, Pause, Play } from 'lucide-react'
import { assetUrl } from '@/lib/asset-url'
import { playButtonClick } from '@/lib/sound-engine'
import type { Game } from '@/types/models'
import { useGameSoundtrack } from '../../hooks/use-game-soundtrack'
import { useSoundtrackPlayer } from '../../hooks/use-soundtrack-player'
import { AlbumDetailModal } from '../center/album-detail-modal'
import type { SoundtrackAlbumWithTracks, SoundtrackTrack } from '../../types'

interface SidebarSoundtrackWidgetProps {
  game: Game
}

function formatDuration(ms: number) {
  if (!ms || ms <= 0) return ''
  const totalSec = Math.floor(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function SidebarSoundtrackWidget({ game }: SidebarSoundtrackWidgetProps) {
  const navigate = useNavigate()
  const [selectedAlbum, setSelectedAlbum] = useState<SoundtrackAlbumWithTracks | null>(null)

  const gameIdentity = useMemo(
    () => ({
      gameId: game.id,
      title: game.name,
      releaseYear: game.release_date?.split('-')[0] || null,
      developer: game.developer,
      publisher: game.publisher,
      steamAppId: game.steam_app_id,
      igdbId: game.igdb_id,
      coverUrl: assetUrl(game.cover_path),
    }),
    [game],
  )

  const { data: albumsWithTracks = [], isLoading } = useGameSoundtrack(gameIdentity)
  const {
    currentTrack,
    playbackState,
    currentTime,
    favorites,
    playTrack,
    togglePlay,
    toggleFavorite,
  } = useSoundtrackPlayer()

  const primaryAlbum = albumsWithTracks[0] || null
  const isAlbumFavorite = primaryAlbum ? favorites.has(primaryAlbum.album.id) : false

  // Find currently active track or primary track
  const isPlayingGameTrack = Boolean(
    currentTrack && primaryAlbum?.tracks.some((t) => t.id === currentTrack.id),
  )

  const activeOrFeaturedTrack: SoundtrackTrack | null = useMemo(() => {
    if (isPlayingGameTrack && currentTrack) return currentTrack
    if (!primaryAlbum || primaryAlbum.tracks.length === 0) return null
    // Prefer favorited track if available
    const favorited = primaryAlbum.tracks.find((t) => favorites.has(t.id))
    return favorited || primaryAlbum.tracks[0]
  }, [isPlayingGameTrack, currentTrack, primaryAlbum, favorites])

  const isTrackPlaying = (trackId: string) => {
    return (
      currentTrack?.id === trackId &&
      (playbackState === 'playing' ||
        (playbackState !== 'paused' && playbackState !== 'error' && currentTime > 0))
    )
  }

  const isTrackLoading = (trackId: string) => {
    return (
      currentTrack?.id === trackId &&
      (playbackState === 'loading' || playbackState === 'buffering') &&
      currentTime === 0
    )
  }

  function handlePlayTrack(track: SoundtrackTrack) {
    playButtonClick()
    if (currentTrack?.id === track.id) {
      togglePlay()
    } else if (primaryAlbum) {
      void playTrack(track, primaryAlbum.album, gameIdentity, primaryAlbum.tracks)
    }
  }

  return (
    <div className="flex flex-col gap-3.5 rounded-2xl border border-border/80 bg-surface/70 p-4 shadow-sm select-none">
      {/* 1. Header Bar: Title, Album Like, & Center Link */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-accent">
          <Music className="size-3.5" />
          <span>Soundtrack</span>
        </div>

        <div className="flex items-center gap-2">
          {primaryAlbum && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                playButtonClick()
                void toggleFavorite('album', primaryAlbum.album.id)
              }}
              className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs font-semibold transition-all ${
                isAlbumFavorite
                  ? 'border-rose-500/40 bg-rose-500/10 text-rose-500 dark:text-rose-400'
                  : 'border-border/80 bg-surface-raised/60 text-muted hover:border-rose-500/30 hover:text-rose-500 dark:hover:text-rose-400'
              }`}
              title={isAlbumFavorite ? 'Liked Album' : 'Like Album'}
            >
              <Heart
                className={`size-3.5 transition-transform active:scale-125 ${
                  isAlbumFavorite ? 'fill-rose-500 text-rose-500' : ''
                }`}
              />
              <span className="text-[10px] font-bold">
                {isAlbumFavorite ? 'Liked' : 'Like Album'}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              playButtonClick()
              navigate('/soundtrack')
            }}
            className="text-[11px] font-bold text-muted hover:text-accent transition-colors"
          >
            Center →
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted py-3">
          <span className="size-3.5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <span>Resolving soundtrack sources...</span>
        </div>
      ) : primaryAlbum && activeOrFeaturedTrack ? (
        <div className="flex flex-col gap-3">
          {/* 2. Featured / Playing Soundtrack Banner with Exact Name & Cover */}
          <div className="group relative flex items-center gap-3.5 rounded-xl border border-border/80 bg-surface-raised/60 p-2.5 transition-all hover:border-accent/40 hover:bg-surface-raised/90">
            {/* Exact Artwork */}
            <div
              onClick={() => setSelectedAlbum(primaryAlbum)}
              className="relative size-14 shrink-0 cursor-pointer overflow-hidden rounded-xl border border-border/80 bg-surface shadow-md group/art"
            >
              {assetUrl(primaryAlbum.album.cover_url) || assetUrl(game.cover_path) ? (
                <img
                  src={
                    assetUrl(primaryAlbum.album.cover_url) || assetUrl(game.cover_path) || undefined
                  }
                  alt={activeOrFeaturedTrack.title}
                  className="size-full object-cover transition-transform duration-500 group-hover/art:scale-110"
                />
              ) : (
                <div className="flex size-full items-center justify-center bg-accent/10">
                  <Disc3 className="size-7 text-accent" />
                </div>
              )}
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover/art:opacity-100 transition-opacity">
                <ListMusic className="size-4 text-white drop-shadow" />
              </div>
            </div>

            {/* Exact Track Title & Artist */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                {isTrackPlaying(activeOrFeaturedTrack.id) && (
                  <span className="flex items-end gap-0.5 h-3 shrink-0">
                    <span className="w-0.5 h-full bg-accent animate-pulse" />
                    <span className="w-0.5 h-2 bg-accent animate-bounce" />
                    <span className="w-0.5 h-2.5 bg-accent animate-pulse" />
                  </span>
                )}
                <span
                  onClick={() => handlePlayTrack(activeOrFeaturedTrack)}
                  className="truncate text-xs font-bold text-text hover:text-accent cursor-pointer transition-colors"
                  title={activeOrFeaturedTrack.title}
                >
                  {activeOrFeaturedTrack.title}
                </span>
              </div>

              <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted truncate">
                <span className="truncate">
                  {activeOrFeaturedTrack.artist || primaryAlbum.album.artist || 'Original Score'}
                </span>
                {activeOrFeaturedTrack.duration_ms > 0 && (
                  <>
                    <span>•</span>
                    <span className="font-mono text-[10px]">
                      {formatDuration(activeOrFeaturedTrack.duration_ms)}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Action Buttons: Like & Play */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  playButtonClick()
                  void toggleFavorite('track', activeOrFeaturedTrack.id)
                }}
                className="p-1.5 text-muted hover:text-rose-500 dark:hover:text-rose-400 transition-colors"
                title="Favorite Track"
              >
                <Heart
                  className={`size-4 transition-transform active:scale-125 ${
                    favorites.has(activeOrFeaturedTrack.id) ? 'fill-rose-500 text-rose-500' : ''
                  }`}
                />
              </button>

              <button
                type="button"
                onClick={() => handlePlayTrack(activeOrFeaturedTrack)}
                className="flex size-8 items-center justify-center rounded-full bg-accent text-white shadow-[0_0_12px_var(--nx-accent)] hover:scale-108 active:scale-95 transition-all"
                title={isTrackPlaying(activeOrFeaturedTrack.id) ? 'Pause' : 'Play Track'}
              >
                {isTrackLoading(activeOrFeaturedTrack.id) ? (
                  <span className="size-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : isTrackPlaying(activeOrFeaturedTrack.id) ? (
                  <Pause className="size-3.5 fill-current" />
                ) : (
                  <Play className="size-3.5 fill-current translate-x-0.5" />
                )}
              </button>
            </div>
          </div>

          {/* 3. Top Tracks Mini-Tracklist */}
          {primaryAlbum.tracks.length > 1 && (
            <div className="flex flex-col gap-1 rounded-xl bg-surface-raised/50 p-1.5 border border-border/80">
              <div className="px-2 py-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted">
                <span>Soundtrack Tracks</span>
                <span className="font-mono text-accent">{primaryAlbum.tracks.length} Total</span>
              </div>

              {primaryAlbum.tracks.slice(0, 3).map((track, idx) => {
                const isCurrent = currentTrack?.id === track.id
                const isPlaying = isTrackPlaying(track.id)
                const isTrackFav = favorites.has(track.id)

                return (
                  <div
                    key={track.id}
                    onClick={() => handlePlayTrack(track)}
                    className={`group/row flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 cursor-pointer transition-all ${
                      isCurrent
                        ? 'bg-accent/15 text-accent font-semibold'
                        : 'hover:bg-surface-raised/80 text-text'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="w-4 text-center font-mono text-[10px] text-muted group-hover/row:text-accent">
                        {isPlaying ? (
                          <span className="text-accent font-bold">▶</span>
                        ) : (
                          track.track_number || idx + 1
                        )}
                      </span>
                      <span className="truncate text-xs">{track.title}</span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          playButtonClick()
                          void toggleFavorite('track', track.id)
                        }}
                        className={`p-1 transition-colors ${
                          isTrackFav
                            ? 'text-rose-500'
                            : 'opacity-0 group-hover/row:opacity-100 text-muted hover:text-rose-500 dark:hover:text-rose-400'
                        }`}
                        title="Favorite"
                      >
                        <Heart className={`size-3 ${isTrackFav ? 'fill-current' : ''}`} />
                      </button>

                      {track.duration_ms > 0 && (
                        <span className="font-mono text-[10px] text-muted w-9 text-right">
                          {formatDuration(track.duration_ms)}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}

              {/* View Full Album Action */}
              <button
                type="button"
                onClick={() => setSelectedAlbum(primaryAlbum)}
                className="mt-0.5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-border/80 bg-surface-raised/50 py-1.5 text-[11px] font-bold text-muted hover:border-accent/40 hover:bg-accent/10 hover:text-accent transition-all"
              >
                <ListMusic className="size-3.5" />
                <span>View All {primaryAlbum.tracks.length} Tracks</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-between text-xs text-muted py-1">
          <span>No soundtrack found</span>
          <button
            type="button"
            onClick={() => navigate('/soundtrack')}
            className="text-accent font-semibold hover:underline"
          >
            Browse
          </button>
        </div>
      )}

      {/* Album Modal */}
      <AlbumDetailModal albumWithTracks={selectedAlbum} onClose={() => setSelectedAlbum(null)} />
    </div>
  )
}
