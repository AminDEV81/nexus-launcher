import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ChevronDown,
  ChevronUp,
  Disc,
  Disc3,
  ExternalLink,
  Heart,
  ListMusic,
  Maximize2,
  Music,
  Pause,
  Play,
  RefreshCw,
  Search,
  Shuffle,
  SkipBack,
  SkipForward,
  Sparkles,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { assetUrl } from '@/lib/asset-url'
import { playButtonClick } from '@/lib/sound-engine'
import type { Game } from '@/types/models'
import { useGameSoundtrack, useRefreshGameSoundtrack } from '../../hooks/use-game-soundtrack'
import { useSoundtrackPlayer } from '../../hooks/use-soundtrack-player'
import { AlbumDetailModal } from '../center/album-detail-modal'
import type { SoundtrackAlbumWithTracks, SoundtrackTrack } from '../../types'

interface SidebarSoundtrackWidgetProps {
  game: Game
  mode?: 'compact' | 'full'
  onOpenFullTab?: () => void
}

function formatDuration(ms: number) {
  if (!ms || ms <= 0) return '--:--'
  const totalSec = Math.floor(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatSeconds(sec: number) {
  if (!sec || sec <= 0 || !Number.isFinite(sec)) return '0:00'
  const total = Math.floor(sec)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatTotalRuntime(ms: number, tracks: SoundtrackTrack[]) {
  const computedMs =
    ms && ms > 0 ? ms : tracks.reduce((sum, t) => sum + (t.duration_ms || 0), 0)
  if (!computedMs || computedMs <= 0) return ''
  const totalSec = Math.floor(computedMs / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m} min`
}

export function SidebarSoundtrackWidget({
  game,
  mode = 'compact',
  onOpenFullTab,
}: SidebarSoundtrackWidgetProps) {
  const navigate = useNavigate()
  const [selectedAlbum, setSelectedAlbum] = useState<SoundtrackAlbumWithTracks | null>(null)
  const [activeAlbumIdx, setActiveAlbumIdx] = useState(0)
  const [expandedInCompact, setExpandedInCompact] = useState(false)
  const [trackFilter, setTrackFilter] = useState('')

  useEffect(() => {
    setActiveAlbumIdx(0)
    setExpandedInCompact(false)
    setTrackFilter('')
  }, [game.id, game.name])

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
  const refreshMutation = useRefreshGameSoundtrack(gameIdentity)
  const {
    currentTrack,
    playbackState,
    currentTime,
    duration,
    shuffle,
    favorites,
    playTrack,
    playAlbum,
    togglePlay,
    next,
    previous,
    seek,
    toggleShuffle,
    toggleFavorite,
    setExpanded,
  } = useSoundtrackPlayer()

  const primaryAlbum =
    albumsWithTracks[Math.min(activeAlbumIdx, Math.max(0, albumsWithTracks.length - 1))] || null
  const isAlbumFavorite = primaryAlbum ? favorites.has(primaryAlbum.album.id) : false

  // Check if currently playing track belongs to this game's active album (or any album of this game)
  const isPlayingThisGame = Boolean(
    currentTrack &&
      albumsWithTracks.some((alb) => alb.tracks.some((t) => t.id === currentTrack.id)),
  )

  const activeOrFeaturedTrack: SoundtrackTrack | null = useMemo(() => {
    if (isPlayingThisGame && currentTrack) return currentTrack
    if (!primaryAlbum || primaryAlbum.tracks.length === 0) return null
    const favorited = primaryAlbum.tracks.find((t) => favorites.has(t.id))
    return favorited || primaryAlbum.tracks[0]
  }, [isPlayingThisGame, currentTrack, primaryAlbum, favorites])

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

  const isAnyTrackPlayingForGame = Boolean(
    activeOrFeaturedTrack && isTrackPlaying(activeOrFeaturedTrack.id),
  )

  const effectiveDuration = useMemo(() => {
    if (isPlayingThisGame && duration > 0) return duration
    if (activeOrFeaturedTrack?.duration_ms && activeOrFeaturedTrack.duration_ms > 0) {
      return activeOrFeaturedTrack.duration_ms / 1000
    }
    return 0
  }, [isPlayingThisGame, duration, activeOrFeaturedTrack])

  const progressPercent =
    isPlayingThisGame && effectiveDuration > 0
      ? Math.min(100, Math.max(0, (currentTime / effectiveDuration) * 100))
      : 0

  const filteredTracks = useMemo(() => {
    if (!primaryAlbum) return []
    const q = trackFilter.trim().toLowerCase()
    if (!q) return primaryAlbum.tracks
    return primaryAlbum.tracks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        (t.artist && t.artist.toLowerCase().includes(q)) ||
        String(t.track_number).includes(q),
    )
  }, [primaryAlbum, trackFilter])

  const visibleTracks = useMemo(() => {
    if (mode === 'full' || expandedInCompact) return filteredTracks
    return filteredTracks.slice(0, 5)
  }, [mode, expandedInCompact, filteredTracks])

  function handlePlayTrack(track: SoundtrackTrack) {
    playButtonClick()
    if (currentTrack?.id === track.id) {
      togglePlay()
    } else if (primaryAlbum) {
      void playTrack(track, primaryAlbum.album, gameIdentity, primaryAlbum.tracks)
    }
  }

  function handlePlayAll() {
    if (!primaryAlbum || primaryAlbum.tracks.length === 0) return
    playButtonClick()
    if (isPlayingThisGame && activeOrFeaturedTrack) {
      togglePlay()
    } else {
      void playAlbum(primaryAlbum.album, primaryAlbum.tracks, 0, gameIdentity)
    }
  }

  function handleShufflePlay() {
    if (!primaryAlbum || primaryAlbum.tracks.length === 0) return
    playButtonClick()
    const randomIdx = Math.floor(Math.random() * primaryAlbum.tracks.length)
    void playAlbum(primaryAlbum.album, primaryAlbum.tracks, randomIdx, gameIdentity)
  }

  function handleResync() {
    playButtonClick()
    refreshMutation.mutate(undefined, {
      onSuccess: (res) => {
        if (res && res.length > 0) {
          toast.success(`Verified soundtrack synced for ${game.name}`)
        } else {
          toast.info(`No verified soundtrack found for ${game.name}`)
        }
      },
    })
  }

  const coverUrl =
    assetUrl(primaryAlbum?.album.cover_url) || assetUrl(game.cover_path) || undefined
  const runtimeLabel = primaryAlbum
    ? formatTotalRuntime(primaryAlbum.album.total_duration_ms, primaryAlbum.tracks)
    : ''

  const enrichedPrimaryAlbum = useMemo(() => {
    if (!primaryAlbum) return null
    return {
      ...primaryAlbum.album,
      game_id: primaryAlbum.album.game_id || game.id,
      cover_url: primaryAlbum.album.cover_url || assetUrl(game.cover_path) || null,
    }
  }, [primaryAlbum, game.id, game.cover_path])

  return (
    <section className="relative flex flex-col gap-3.5 overflow-hidden rounded-2xl border border-border/85 bg-gradient-to-b from-surface-raised/85 via-surface/90 to-surface p-4 shadow-sm select-none">
      {/* Subtle Ambient Aura */}
      {coverUrl && (
        <div
          className="pointer-events-none absolute -right-12 -top-12 size-44 rounded-full opacity-15 blur-3xl transition-opacity duration-500"
          style={{
            backgroundImage: `url(${coverUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
      )}

      {/* 1. Top Header Bar */}
      <div className="relative z-10 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex size-6.5 items-center justify-center rounded-lg bg-accent/15 text-accent shadow-2xs">
            <Music className="size-3.5" />
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-text">
              Official Soundtrack
            </span>
            {primaryAlbum && (
              <span className="rounded-md border border-accent/30 bg-accent/10 px-1.5 py-0.2 font-mono text-[10px] font-bold text-accent">
                {primaryAlbum.tracks.length}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleResync}
            disabled={refreshMutation.isPending || isLoading}
            title="Re-sync & verify official soundtrack"
            className="flex size-7 items-center justify-center rounded-lg border border-border/80 bg-surface-raised/70 text-muted transition-all hover:border-accent/40 hover:text-accent active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw
              className={cn('size-3.5', refreshMutation.isPending && 'animate-spin text-accent')}
            />
          </button>

          {primaryAlbum && enrichedPrimaryAlbum && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                playButtonClick()
                const wasFav = isAlbumFavorite
                void toggleFavorite('album', enrichedPrimaryAlbum.id, {
                  album: enrichedPrimaryAlbum,
                  tracks: primaryAlbum.tracks,
                })
                toast.success(
                  wasFav
                    ? `Removed "${enrichedPrimaryAlbum.title}" from Favorites`
                    : `Saved "${enrichedPrimaryAlbum.title}" to Soundtrack Favorites`,
                )
              }}
              title={isAlbumFavorite ? 'Remove album from favorites' : 'Save album to favorites'}
              className={cn(
                'flex size-7 items-center justify-center rounded-lg border transition-all active:scale-95 cursor-pointer',
                isAlbumFavorite
                  ? 'border-rose-500/40 bg-rose-500/15 text-rose-500'
                  : 'border-border/80 bg-surface-raised/70 text-muted hover:border-rose-500/30 hover:text-rose-500',
              )}
            >
              <Heart className={cn('size-3.5', isAlbumFavorite && 'fill-current')} />
            </button>
          )}

          {mode === 'compact' && onOpenFullTab ? (
            <button
              type="button"
              onClick={() => {
                playButtonClick()
                onOpenFullTab()
              }}
              className="rounded-lg border border-accent/30 bg-accent/10 px-2.5 py-1 text-[10.5px] font-semibold text-accent transition-all hover:bg-accent hover:text-white cursor-pointer"
            >
              OST Studio →
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                playButtonClick()
                navigate('/soundtrack')
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-border/80 bg-surface-raised/70 px-2.5 py-1 text-[10.5px] font-semibold text-muted transition-all hover:border-accent/40 hover:text-accent cursor-pointer"
            >
              <span>Center</span>
              <ExternalLink className="size-2.5" />
            </button>
          )}
        </div>
      </div>

      {/* Multi-Album Selector Strip */}
      {albumsWithTracks.length > 1 && (
        <div className="relative z-10 flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
          {albumsWithTracks.map((item, idx) => {
            const active = idx === activeAlbumIdx
            return (
              <button
                key={item.album.id}
                type="button"
                onClick={() => {
                  playButtonClick()
                  setActiveAlbumIdx(idx)
                }}
                className={cn(
                  'relative shrink-0 rounded-xl border px-2.5 py-1 text-[11px] font-semibold transition-colors cursor-pointer',
                  active
                    ? 'border-accent text-white'
                    : 'border-border/70 bg-surface/60 text-muted hover:text-text',
                )}
              >
                {active && (
                  <motion.span
                    layoutId={`sidebar-ost-album-pill-${mode}`}
                    transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                    className="absolute inset-0 rounded-xl bg-accent"
                  />
                )}
                <span className="relative z-10 truncate max-w-[150px] inline-block align-bottom">
                  {item.album.title}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* 2. Loading / Main Stage */}
      {isLoading || refreshMutation.isPending ? (
        <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-surface/60 p-4 text-xs text-muted">
          <span className="size-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <span>
            {refreshMutation.isPending
              ? `Syncing verified soundtrack for ${game.name}...`
              : 'Resolving official game score...'}
          </span>
        </div>
      ) : primaryAlbum && activeOrFeaturedTrack && enrichedPrimaryAlbum ? (
        <div className="relative z-10 flex flex-col gap-3">
          {/* Vinyl + Artwork Now Playing Hero Card */}
          <div className="group relative flex flex-col gap-3 rounded-2xl border border-border/80 bg-surface/90 p-3 shadow-xs transition-all hover:border-accent/35">
            <div className="flex items-center gap-3">
              {/* Artwork Jacket Cover */}
              <div
                onClick={() => setSelectedAlbum(primaryAlbum)}
                className="relative size-16 shrink-0 cursor-pointer overflow-hidden rounded-xl border border-border/90 bg-surface-raised shadow-md"
                title="View full album details"
              >
                {coverUrl ? (
                  <img
                    src={coverUrl}
                    alt={primaryAlbum.album.title}
                    className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center bg-accent/10">
                    <Disc3 className="size-7 text-accent" />
                  </div>
                )}
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                  <ListMusic className="size-4 text-white" />
                </div>
              </div>

              {/* Active Track & Album Info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 rounded-md border border-accent/30 bg-accent/10 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-accent">
                    <Sparkles className="size-2.5" />
                    {isPlayingThisGame ? 'Now Playing' : 'Featured Score'}
                  </span>
                  {runtimeLabel && (
                    <span className="font-mono text-[10px] text-subtle">{runtimeLabel}</span>
                  )}
                </div>

                <div
                  onClick={() => handlePlayTrack(activeOrFeaturedTrack)}
                  className="mt-1 truncate text-xs font-bold text-text hover:text-accent cursor-pointer transition-colors"
                  title={activeOrFeaturedTrack.title}
                >
                  {activeOrFeaturedTrack.title}
                </div>

                <div className="mt-0.5 truncate text-[11px] font-medium text-muted">
                  {activeOrFeaturedTrack.artist ||
                    primaryAlbum.album.artist ||
                    `${game.name} Official Score`}
                </div>
              </div>

              {/* Direct Like Featured Track Button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  playButtonClick()
                  const wasFav = favorites.has(activeOrFeaturedTrack.id)
                  void toggleFavorite('track', activeOrFeaturedTrack.id, {
                    track: activeOrFeaturedTrack,
                    album: enrichedPrimaryAlbum,
                    tracks: primaryAlbum.tracks,
                  })
                  toast.success(
                    wasFav
                      ? `Removed "${activeOrFeaturedTrack.title}" from Favorites`
                      : `Added "${activeOrFeaturedTrack.title}" to Soundtrack Favorites`,
                  )
                }}
                title={
                  favorites.has(activeOrFeaturedTrack.id)
                    ? 'Remove track from favorites'
                    : 'Like this track'
                }
                className={cn(
                  'flex size-8.5 shrink-0 items-center justify-center rounded-xl border transition-all active:scale-95 cursor-pointer',
                  favorites.has(activeOrFeaturedTrack.id)
                    ? 'border-rose-500/40 bg-rose-500/15 text-rose-500'
                    : 'border-border/80 bg-surface-raised/80 text-muted hover:border-rose-500/40 hover:text-rose-500',
                )}
              >
                <Heart
                  className={cn(
                    'size-4',
                    favorites.has(activeOrFeaturedTrack.id) && 'fill-current',
                  )}
                />
              </button>

              {/* Primary Play/Pause Button */}
              <button
                type="button"
                onClick={() => handlePlayTrack(activeOrFeaturedTrack)}
                className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-white shadow-[0_0_14px_var(--nx-accent)] transition-all hover:scale-105 active:scale-95 cursor-pointer"
                title={isAnyTrackPlayingForGame ? 'Pause' : 'Play'}
              >
                {isTrackLoading(activeOrFeaturedTrack.id) ? (
                  <span className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : isAnyTrackPlayingForGame ? (
                  <Pause className="size-4 fill-current" />
                ) : (
                  <Play className="size-4 fill-current translate-x-0.5" />
                )}
              </button>
            </div>

            {/* Interactive Scrubber & Transport Controls */}
            {(isPlayingThisGame || mode === 'full') && (
              <div className="flex flex-col gap-2 border-t border-border/60 pt-2.5">
                <div className="flex items-center gap-2">
                  <span className="w-8 font-mono text-[10px] text-subtle">
                    {isPlayingThisGame ? formatSeconds(currentTime) : '0:00'}
                  </span>
                  <div
                    onClick={(e) => {
                      if (!isPlayingThisGame || effectiveDuration <= 0) return
                      const rect = e.currentTarget.getBoundingClientRect()
                      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
                      seek(ratio * effectiveDuration)
                    }}
                    className="group/bar relative h-1.5 flex-1 cursor-pointer overflow-hidden rounded-full bg-surface-raised"
                  >
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-accent to-cyan-400 transition-all duration-150"
                      style={{ width: `${Math.max(2, progressPercent)}%` }}
                    />
                  </div>
                  <span className="w-8 text-right font-mono text-[10px] text-subtle">
                    {formatSeconds(effectiveDuration)}
                  </span>
                </div>

                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        playButtonClick()
                        toggleShuffle()
                      }}
                      title="Toggle Shuffle"
                      className={cn(
                        'rounded-lg p-1.5 transition-colors cursor-pointer',
                        shuffle ? 'bg-accent/15 text-accent' : 'text-subtle hover:text-text',
                      )}
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
                      className="rounded-lg p-1.5 text-muted hover:bg-surface-raised hover:text-text transition-colors cursor-pointer"
                    >
                      <SkipBack className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        playButtonClick()
                        void next()
                      }}
                      title="Next Track"
                      className="rounded-lg p-1.5 text-muted hover:bg-surface-raised hover:text-text transition-colors cursor-pointer"
                    >
                      <SkipForward className="size-3.5" />
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleShufflePlay}
                      className="rounded-lg border border-border/70 bg-surface-raised/70 px-2 py-1 text-[10px] font-semibold text-muted hover:border-accent/40 hover:text-text transition-colors cursor-pointer"
                    >
                      Shuffle All
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        playButtonClick()
                        setExpanded(true)
                      }}
                      title="Open Fullscreen Vinyl Player"
                      className="flex items-center gap-1 rounded-lg border border-accent/30 bg-accent/10 px-2 py-1 text-[10px] font-semibold text-accent hover:bg-accent hover:text-white transition-colors cursor-pointer"
                    >
                      <Maximize2 className="size-3" />
                      <span>Vinyl Stage</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Search Filter Input */}
          {(mode === 'full' || (expandedInCompact && primaryAlbum.tracks.length > 6)) && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-subtle" />
              <input
                type="text"
                value={trackFilter}
                onChange={(e) => setTrackFilter(e.target.value)}
                placeholder={`Filter ${primaryAlbum.tracks.length} tracks in ${primaryAlbum.album.title}...`}
                className="w-full rounded-xl border border-border/80 bg-surface/80 py-1.5 pl-8 pr-7 text-xs text-text placeholder:text-subtle focus:border-accent focus:outline-none"
              />
              {trackFilter && (
                <button
                  type="button"
                  onClick={() => setTrackFilter('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-subtle hover:text-text"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
          )}

          {/* 3. Interactive Tracklist */}
          <div className="flex flex-col gap-1 rounded-2xl border border-border/80 bg-surface/65 p-2">
            <div className="flex items-center justify-between px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
              <span>Album Tracklist</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePlayAll}
                  className="font-semibold text-accent hover:underline cursor-pointer"
                >
                  {isAnyTrackPlayingForGame ? 'Pause Album' : 'Play All'}
                </button>
                <span>•</span>
                <span className="font-mono text-subtle">{filteredTracks.length} Tracks</span>
              </div>
            </div>

            <div
              className={cn(
                'flex flex-col gap-0.5 overflow-y-auto pr-0.5',
                mode === 'full' ? 'max-h-[420px]' : expandedInCompact ? 'max-h-[300px]' : '',
              )}
            >
              {visibleTracks.map((track, idx) => {
                const isCurrent = currentTrack?.id === track.id
                const isPlaying = isTrackPlaying(track.id)
                const isLoadingTrack = isTrackLoading(track.id)
                const isTrackFav = favorites.has(track.id)

                return (
                  <div
                    key={track.id}
                    onClick={() => handlePlayTrack(track)}
                    className={cn(
                      'group/row flex items-center justify-between gap-2.5 rounded-xl px-2.5 py-2 cursor-pointer transition-all',
                      isCurrent
                        ? 'bg-accent/15 border border-accent/30 text-accent font-semibold shadow-2xs'
                        : 'border border-transparent hover:bg-surface-raised/85 text-text',
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <span className="flex size-5 shrink-0 items-center justify-center font-mono text-[10px] text-muted group-hover/row:text-accent">
                        {isLoadingTrack ? (
                          <span className="size-3 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                        ) : isPlaying ? (
                          <span className="flex items-end gap-0.5 h-3">
                            <span className="w-0.5 h-full bg-accent animate-pulse" />
                            <span className="w-0.5 h-2 bg-accent animate-bounce" />
                            <span className="w-0.5 h-2.5 bg-accent animate-pulse" />
                          </span>
                        ) : (
                          <>
                            <span className="group-hover/row:hidden">
                              {track.track_number || idx + 1}
                            </span>
                            <Play className="hidden size-3 fill-current text-accent group-hover/row:block" />
                          </>
                        )}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs">{track.title}</div>
                        {mode === 'full' && track.artist && (
                          <div className="truncate text-[10px] text-muted font-normal">
                            {track.artist}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {track.local_path && (
                        <span className="rounded bg-emerald-500/15 px-1.5 py-0.2 font-mono text-[8.5px] font-semibold text-emerald-400">
                          LOCAL
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          playButtonClick()
                          const wasFav = isTrackFav
                          void toggleFavorite('track', track.id, {
                            track,
                            album: enrichedPrimaryAlbum,
                            tracks: primaryAlbum.tracks,
                          })
                          toast.success(
                            wasFav
                              ? `Removed "${track.title}" from Favorites`
                              : `Added "${track.title}" to Soundtrack Favorites`,
                          )
                        }}
                        className={cn(
                          'rounded-lg p-1 transition-all cursor-pointer',
                          isTrackFav
                            ? 'text-rose-500 bg-rose-500/10'
                            : 'text-muted/75 hover:text-rose-500 hover:bg-rose-500/10',
                        )}
                        title={isTrackFav ? 'Remove from favorites' : 'Add to favorites'}
                      >
                        <Heart className={cn('size-3.5', isTrackFav && 'fill-current')} />
                      </button>

                      {track.duration_ms > 0 && (
                        <span className="w-9 text-right font-mono text-[10px] text-muted">
                          {formatDuration(track.duration_ms)}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Footer Actions: Expand Inline or Open Modal */}
            <div className="mt-1 flex items-center gap-1.5 pt-1 border-t border-border/50">
              {mode === 'compact' && filteredTracks.length > 5 && (
                <button
                  type="button"
                  onClick={() => {
                    playButtonClick()
                    setExpandedInCompact((v) => !v)
                  }}
                  className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-border/70 bg-surface-raised/60 py-1.5 text-[11px] font-semibold text-text hover:border-accent/40 hover:text-accent transition-all cursor-pointer"
                >
                  {expandedInCompact ? (
                    <>
                      <ChevronUp className="size-3.5" />
                      <span>Show Compact (5)</span>
                    </>
                  ) : (
                    <>
                      <ChevronDown className="size-3.5" />
                      <span>Show All {filteredTracks.length} Tracks</span>
                    </>
                  )}
                </button>
              )}

              <button
                type="button"
                onClick={() => setSelectedAlbum(primaryAlbum)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border/70 bg-surface-raised/60 py-1.5 text-[11px] font-semibold text-muted hover:border-accent/40 hover:bg-accent/10 hover:text-accent transition-all cursor-pointer"
              >
                <Disc className="size-3.5" />
                <span>Album Modal</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between rounded-xl border border-border/60 bg-surface/60 px-3 py-2.5 text-xs text-muted">
          <span>No verified soundtrack found yet.</span>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleResync}
              className="font-semibold text-accent hover:underline cursor-pointer"
            >
              Retry Sync
            </button>
            <button
              type="button"
              onClick={() => navigate('/soundtrack')}
              className="font-semibold text-muted hover:text-text cursor-pointer"
            >
              Center →
            </button>
          </div>
        </div>
      )}

      {/* Album Detail Modal */}
      <AlbumDetailModal albumWithTracks={selectedAlbum} onClose={() => setSelectedAlbum(null)} />
    </section>
  )
}
