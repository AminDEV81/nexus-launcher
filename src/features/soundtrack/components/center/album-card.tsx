import { motion } from 'framer-motion'
import { Disc3, Heart, Play } from 'lucide-react'
import { assetUrl } from '@/lib/asset-url'
import { playButtonClick } from '@/lib/sound-engine'
import { useSoundtrackPlayer } from '../../hooks/use-soundtrack-player'
import type { SoundtrackAlbumWithTracks } from '../../types'

interface AlbumCardProps {
  albumWithTracks: SoundtrackAlbumWithTracks
  onOpenDetails: (album: SoundtrackAlbumWithTracks) => void
}

export function AlbumCard({ albumWithTracks, onOpenDetails }: AlbumCardProps) {
  const { playAlbum, currentAlbum, playbackState, favorites, toggleFavorite } =
    useSoundtrackPlayer()
  const { album, tracks } = albumWithTracks

  const isCurrent = currentAlbum?.id === album.id
  const isPlaying = isCurrent && playbackState === 'playing'
  const isFavorite = favorites.has(album.id)

  function handlePlay(e: React.MouseEvent) {
    e.stopPropagation()
    playButtonClick()
    void playAlbum(album, tracks, 0)
  }

  const coverSrc = assetUrl(album.cover_url)

  return (
    <motion.div
      whileHover={{ y: -6, scale: 1.02 }}
      transition={{ type: 'spring', stiffness: 380, damping: 26 }}
      onClick={() => onOpenDetails(albumWithTracks)}
      className="group relative flex flex-col gap-3 rounded-2xl border border-border/80 bg-surface/70 p-3.5 cursor-pointer select-none shadow-sm hover:border-accent/50 hover:bg-surface-raised/80 hover:shadow-xl transition-all"
    >
      {/* Artwork Poster */}
      <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-surface-raised shadow-md border border-border/70">
        {coverSrc ? (
          <img
            src={coverSrc}
            alt={album.title}
            className="size-full object-cover transition-transform duration-700 ease-out group-hover:scale-108"
          />
        ) : (
          <div className="flex size-full items-center justify-center bg-accent/10">
            <Disc3 className="size-10 text-accent/60 animate-spin-slow" />
          </div>
        )}

        {/* Hover Gradient Vignette */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

        {/* Favorite Album Button Overlay */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            playButtonClick()
            void toggleFavorite('album', album.id)
          }}
          className={`absolute top-2.5 right-2.5 z-10 rounded-full p-2 backdrop-blur-md transition-all shadow-md ${
            isFavorite
              ? 'bg-surface/90 dark:bg-black/60 text-rose-500 opacity-100 scale-100 border border-border/80'
              : 'bg-surface/80 dark:bg-black/40 text-text/80 dark:text-white/80 opacity-0 group-hover:opacity-100 hover:text-rose-500 hover:bg-surface dark:hover:bg-black/60 border border-border/80'
          }`}
          title={isFavorite ? 'Remove album from favorites' : 'Add album to favorites'}
        >
          <Heart
            className={`size-4 transition-transform active:scale-125 ${
              isFavorite ? 'fill-current' : ''
            }`}
          />
        </button>

        {/* Play Button Overlay */}
        <button
          type="button"
          onClick={handlePlay}
          className="absolute bottom-3 right-3 flex size-10 items-center justify-center rounded-full bg-accent text-white shadow-xl opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all hover:scale-110 active:scale-95"
          title="Play Album"
        >
          <Play className="size-4 fill-current translate-x-0.5" />
        </button>

        {/* Active Badge */}
        {isPlaying && (
          <div className="absolute top-2.5 left-2.5 rounded-full bg-accent/90 px-2 py-0.5 font-mono text-[9px] font-bold text-white shadow-md backdrop-blur-md">
            PLAYING
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-col min-w-0">
        <h3 className="truncate text-sm font-bold text-text group-hover:text-accent transition-colors">
          {album.title}
        </h3>
        <p className="truncate text-xs text-muted mt-0.5">
          {album.artist || 'Original Soundtrack'}
        </p>

        <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-muted">
          <span>{tracks.length || album.track_count} Tracks</span>
          <span className="capitalize">{album.album_type.replace('_', ' ')}</span>
        </div>
      </div>
    </motion.div>
  )
}
