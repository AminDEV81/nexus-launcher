import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Disc3, ExternalLink, Music, Play, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { playButtonClick } from '@/lib/sound-engine'
import type { HubGameDetails } from '@/types/models'
import { useGameSoundtrack, useRefreshGameSoundtrack } from '../../hooks/use-game-soundtrack'
import { useSoundtrackPlayer } from '../../hooks/use-soundtrack-player'
import { TrackRow } from '../center/track-row'
import { AlbumDetailModal } from '../center/album-detail-modal'
import type { SoundtrackAlbumWithTracks } from '../../types'

interface HubSoundtrackSectionProps {
  game: HubGameDetails
}

export function HubSoundtrackSection({ game }: HubSoundtrackSectionProps) {
  const navigate = useNavigate()
  const [selectedAlbum, setSelectedAlbum] = useState<SoundtrackAlbumWithTracks | null>(null)
  const [activeAlbumIdx, setActiveAlbumIdx] = useState(0)

  const gameIdentity = useMemo(
    () => ({
      gameId: `igdb_${game.igdb_id}`,
      title: game.name,
      releaseYear: game.release_date ? game.release_date.split('-')[0] : null,
      steamAppId: game.steam_app_id,
      igdbId: game.igdb_id,
      coverUrl: game.cover_url,
    }),
    [game],
  )

  useEffect(() => {
    setActiveAlbumIdx(0)
  }, [game.igdb_id, game.name])

  const { data: albumsWithTracks = [], isLoading } = useGameSoundtrack(gameIdentity)
  const refreshMutation = useRefreshGameSoundtrack(gameIdentity)
  const { playAlbum, currentAlbum, playbackState, currentTime } = useSoundtrackPlayer()

  const primaryAlbum =
    albumsWithTracks[Math.min(activeAlbumIdx, Math.max(0, albumsWithTracks.length - 1))] || null
  const isCurrent = currentAlbum?.id === primaryAlbum?.album.id
  const isPlaying =
    isCurrent &&
    (playbackState === 'playing' ||
      (playbackState !== 'paused' && playbackState !== 'error' && currentTime > 0))

  function handleResyncSoundtrack() {
    playButtonClick()
    refreshMutation.mutate(undefined, {
      onSuccess: (res) => {
        if (res && res.length > 0) {
          toast.success(`Resolved verified soundtrack for ${game.name}`)
        } else {
          toast.info(`No verified soundtrack albums found for ${game.name}`)
        }
      },
    })
  }

  if (isLoading || refreshMutation.isPending) {
    return (
      <section className="flex flex-col gap-4 rounded-3xl border border-border/80 bg-surface p-6 shadow-sm">
        <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-wider text-accent">
          <Music className="size-4" />
          <span>Soundtrack</span>
          <span className="h-px flex-1 bg-gradient-to-r from-accent/40 to-transparent" />
        </div>
        <div className="flex items-center gap-3 text-xs text-muted py-4">
          <span className="size-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <span>
            {refreshMutation.isPending
              ? `Re-syncing verified soundtrack for ${game.name}...`
              : 'Discovering official soundtracks across providers...'}
          </span>
        </div>
      </section>
    )
  }

  if (!primaryAlbum) {
    return (
      <section className="flex flex-col gap-4 rounded-3xl border border-border/80 bg-surface p-6 shadow-sm">
        <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-wider text-accent">
          <Music className="size-4" />
          <span>Soundtrack</span>
          <span className="h-px flex-1 bg-gradient-to-r from-accent/40 to-transparent" />
        </div>
        <div className="flex items-center justify-between text-xs text-muted py-2">
          <span>No soundtrack available for this game yet.</span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleResyncSoundtrack}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-accent transition-colors cursor-pointer"
            >
              <RefreshCw className="size-3.5" />
              <span>Retry Search</span>
            </button>
            <button
              type="button"
              onClick={() => navigate('/soundtrack')}
              className="text-accent hover:underline font-semibold cursor-pointer"
            >
              Explore Soundtrack Center
            </button>
          </div>
        </div>
      </section>
    )
  }

  const { album, tracks } = primaryAlbum

  function handlePlayAll() {
    playButtonClick()
    void playAlbum(album, tracks, 0, gameIdentity)
  }

  return (
    <section className="flex flex-col gap-5 rounded-3xl border border-border/80 bg-surface p-6 sm:p-7 shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-wider text-accent flex-1 min-w-[200px]">
          <Music className="size-4" />
          <span>
            Soundtrack ({albumsWithTracks.length} Album{albumsWithTracks.length > 1 ? 's' : ''})
          </span>
          <span className="h-px flex-1 bg-gradient-to-r from-accent/40 to-transparent" />
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleResyncSoundtrack}
            title="Re-sync & verify game soundtrack"
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface-raised/60 px-2.5 py-1 text-xs font-semibold text-muted hover:border-accent/40 hover:text-accent transition-colors cursor-pointer"
          >
            <RefreshCw className="size-3.5" />
            <span>Re-sync OST</span>
          </button>

          <button
            type="button"
            onClick={() => navigate('/soundtrack')}
            className="flex items-center gap-1.5 text-xs font-bold text-accent hover:text-accent-hover transition-colors cursor-pointer"
          >
            <span>Open in Soundtrack Center</span>
            <ExternalLink className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Multi-Album Selector Strip (when multiple verified OST albums exist) */}
      {albumsWithTracks.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          {albumsWithTracks.map((item, idx) => {
            const active = idx === activeAlbumIdx
            return (
              <button
                key={item.album.id}
                type="button"
                onClick={() => setActiveAlbumIdx(idx)}
                className={cn(
                  'rounded-xl border px-3 py-1.5 text-xs font-bold transition-all cursor-pointer',
                  active
                    ? 'border-accent bg-accent text-white shadow-xs'
                    : 'border-border bg-surface-raised/60 text-muted hover:border-accent/40 hover:text-text',
                )}
              >
                {item.album.title} ({item.tracks.length})
              </button>
            )
          })}
        </div>
      )}

      {/* Album Showcase Card */}
      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 rounded-2xl border border-border/70 bg-surface-raised/40 p-5">
        {/* Cover Art */}
        <div
          onClick={() => setSelectedAlbum(primaryAlbum)}
          className="relative size-32 shrink-0 cursor-pointer overflow-hidden rounded-xl border border-white/10 bg-surface-raised shadow-md group"
        >
          {album.cover_url || game.cover_url ? (
            <img
              src={album.cover_url || game.cover_url || undefined}
              alt={album.title}
              className="size-full object-cover transition-transform group-hover:scale-108"
            />
          ) : (
            <div className="flex size-full items-center justify-center bg-accent/10">
              <Disc3 className="size-10 text-accent" />
            </div>
          )}
        </div>

        {/* Info & Play Action */}
        <div className="flex flex-col min-w-0 flex-1 text-center sm:text-left">
          <span className="text-[10px] font-bold uppercase tracking-wider text-accent">
            {album.album_type.replace('_', ' ')}
          </span>
          <h3 className="text-lg font-bold text-text mt-0.5 truncate">{album.title}</h3>
          <p className="text-xs text-muted mt-0.5">{album.artist || game.name}</p>

          <div className="mt-3 flex items-center justify-center sm:justify-start gap-3 font-mono text-xs text-subtle">
            <span>{tracks.length} Tracks</span>
            {album.release_date && (
              <>
                <span>•</span>
                <span>{album.release_date}</span>
              </>
            )}
          </div>

          <div className="mt-4 flex items-center justify-center sm:justify-start gap-3">
            <button
              type="button"
              onClick={handlePlayAll}
              className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-xs font-bold text-white shadow-md hover:scale-104 active:scale-95 transition-all cursor-pointer"
            >
              <Play className="size-3.5 fill-current translate-x-0.5" />
              <span>{isPlaying ? 'Playing Album' : 'Play Album'}</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedAlbum(primaryAlbum)}
              className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3.5 py-2 text-xs font-semibold text-text hover:bg-surface-raised transition-colors cursor-pointer"
            >
              <span>View Tracklist</span>
            </button>
          </div>
        </div>
      </div>

      {/* Top 5 Tracks Preview */}
      {tracks.length > 0 && (
        <div className="flex flex-col gap-1 mt-1">
          <div className="text-[11px] font-bold uppercase tracking-wider text-subtle px-2 mb-1">
            Tracklist Preview
          </div>
          {tracks.slice(0, 5).map((track, idx) => (
            <TrackRow
              key={track.id}
              track={track}
              album={album}
              game={gameIdentity}
              index={idx}
              allTracks={tracks}
            />
          ))}

          {tracks.length > 5 && (
            <button
              type="button"
              onClick={() => setSelectedAlbum(primaryAlbum)}
              className="mt-2 text-center text-xs font-bold text-accent hover:underline py-1 cursor-pointer"
            >
              + {tracks.length - 5} more tracks in this soundtrack
            </button>
          )}
        </div>
      )}

      {/* Album Detail Modal */}
      <AlbumDetailModal albumWithTracks={selectedAlbum} onClose={() => setSelectedAlbum(null)} />
    </section>
  )
}
