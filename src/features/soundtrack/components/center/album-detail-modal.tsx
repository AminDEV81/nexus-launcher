import { useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Disc3, Heart, Play, Shuffle, X } from 'lucide-react'
import { assetUrl } from '@/lib/asset-url'
import { playButtonClick } from '@/lib/sound-engine'
import { useSoundtrackPlayer } from '../../hooks/use-soundtrack-player'
import { TrackRow } from './track-row'
import type { SoundtrackAlbumWithTracks, SoundtrackTrack } from '../../types'

interface AlbumDetailModalProps {
  albumWithTracks: SoundtrackAlbumWithTracks | null
  onClose: () => void
}

function formatTotalDuration(ms: number) {
  if (!ms || ms <= 0) return ''
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  if (h > 0) {
    return `${h}h ${m}m`
  }
  return `${m}m`
}

export function AlbumDetailModal({ albumWithTracks, onClose }: AlbumDetailModalProps) {
  const { playAlbum, currentAlbum, playbackState, favorites, toggleFavorite } =
    useSoundtrackPlayer()

  const isCurrent = currentAlbum?.id === albumWithTracks?.album.id
  const isPlaying = isCurrent && playbackState === 'playing'
  const isFavorite = albumWithTracks ? favorites.has(albumWithTracks.album.id) : false

  // Group tracks by disc number
  const discGroups = useMemo<Map<number, SoundtrackTrack[]>>(() => {
    if (!albumWithTracks) return new Map<number, SoundtrackTrack[]>()
    const map = new Map<number, SoundtrackTrack[]>()
    for (const t of albumWithTracks.tracks) {
      const disc = t.disc_number || 1
      const list = map.get(disc) || []
      list.push(t)
      map.set(disc, list)
    }
    return map
  }, [albumWithTracks])

  if (!albumWithTracks) return null
  const { album, tracks } = albumWithTracks

  function handlePlayAll() {
    playButtonClick()
    void playAlbum(album, tracks, 0)
  }

  function handleShuffle() {
    playButtonClick()
    const randomIdx = Math.floor(Math.random() * tracks.length)
    void playAlbum(album, tracks, randomIdx)
  }

  const durationStr = formatTotalDuration(album.total_duration_ms)

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 sm:p-6 md:p-10">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/50 dark:bg-black/75 backdrop-blur-xl"
        />

        {/* Dialog Content */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 20 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="relative flex flex-col max-h-[88vh] w-full max-w-4xl overflow-hidden rounded-3xl border border-border/80 bg-surface/95 shadow-2xl backdrop-blur-2xl"
        >
          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-5 right-5 z-20 rounded-full border border-border/80 bg-surface/70 p-2 text-muted hover:bg-surface-raised hover:text-text transition-all"
          >
            <X className="size-4" />
          </button>

          {/* Hero Header */}
          <div className="relative flex flex-col sm:flex-row items-center sm:items-end gap-6 border-b border-border/80 bg-gradient-to-b from-surface-raised/60 via-surface/80 to-surface p-6 sm:p-8">
            {/* Artwork */}
            <div className="relative size-40 sm:size-48 shrink-0 overflow-hidden rounded-2xl border border-border/80 bg-surface-raised shadow-card">
              {assetUrl(album.cover_url) ? (
                <img
                  src={assetUrl(album.cover_url) ?? ''}
                  alt={album.title}
                  className="size-full object-cover"
                />
              ) : (
                <div className="flex size-full items-center justify-center bg-accent/10">
                  <Disc3 className="size-16 text-accent/60" />
                </div>
              )}
            </div>

            {/* Details & Actions */}
            <div className="flex flex-col min-w-0 flex-1 text-center sm:text-left">
              <span className="text-[11px] font-bold uppercase tracking-widest text-accent">
                {album.album_type.replace('_', ' ')}
              </span>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-text mt-1">
                {album.title}
              </h2>
              <p className="text-sm font-medium text-muted mt-1">{album.artist}</p>

              <div className="mt-3 flex items-center justify-center sm:justify-start gap-3 font-mono text-xs text-subtle">
                <span>{tracks.length} Tracks</span>
                {durationStr && (
                  <>
                    <span>•</span>
                    <span>{durationStr}</span>
                  </>
                )}
                {album.release_date && (
                  <>
                    <span>•</span>
                    <span>{album.release_date}</span>
                  </>
                )}
              </div>

              {/* Action Buttons */}
              <div className="mt-5 flex flex-wrap items-center justify-center sm:justify-start gap-3">
                <button
                  type="button"
                  onClick={handlePlayAll}
                  className="flex items-center gap-2 rounded-2xl bg-accent px-5 py-2.5 text-xs font-bold text-white shadow-[0_0_16px_var(--nx-accent)] hover:scale-104 active:scale-95 transition-all"
                >
                  <Play className="size-4 fill-current translate-x-0.5" />
                  <span>{isPlaying ? 'Playing Album' : 'Play All'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    playButtonClick()
                    void toggleFavorite('album', album.id)
                  }}
                  className={`flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-xs font-bold transition-all ${
                    isFavorite
                      ? 'border-rose-500/40 bg-rose-500/15 text-rose-500 dark:text-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.2)]'
                      : 'border-border/80 bg-surface-raised text-text hover:border-rose-500/30 hover:text-rose-500 dark:hover:text-rose-400'
                  }`}
                  title={isFavorite ? 'Remove album from favorites' : 'Add album to favorites'}
                >
                  <Heart
                    className={`size-4 transition-transform active:scale-125 ${
                      isFavorite ? 'fill-rose-500 text-rose-500' : ''
                    }`}
                  />
                  <span>{isFavorite ? 'Album Liked' : 'Like Album'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleShuffle}
                  className="flex items-center gap-2 rounded-2xl border border-border/80 bg-surface-raised px-4 py-2.5 text-xs font-bold text-text hover:border-accent/40 hover:bg-accent/10 transition-all"
                >
                  <Shuffle className="size-4 text-accent" />
                  <span>Shuffle</span>
                </button>
              </div>
            </div>
          </div>

          {/* Tracklist Body */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            {Array.from(discGroups.entries()).map(([discNum, discTracks]) => (
              <div key={discNum} className="mb-6 last:mb-0">
                {discGroups.size > 1 && (
                  <div className="flex items-center gap-2 mb-3 px-2 text-xs font-bold uppercase tracking-wider text-muted">
                    <Disc3 className="size-3.5 text-accent" />
                    <span>Disc {discNum}</span>
                    <span className="h-px flex-1 bg-border/60" />
                  </div>
                )}

                <div className="flex flex-col gap-1">
                  {discTracks.map((track, idx) => (
                    <TrackRow
                      key={track.id}
                      track={track}
                      album={album}
                      index={idx}
                      allTracks={tracks}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
