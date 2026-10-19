import { memo, useState } from 'react'
import { getSecondaryCoverFallbackUrl, resolveAlbumCoverFallback } from '../../services/curated-soundtracks'
import { motion } from 'framer-motion'
import { Disc3, Gamepad2, Heart, Play } from 'lucide-react'
import { assetUrl } from '@/lib/asset-url'
import { cn } from '@/lib/utils'
import { playButtonClick } from '@/lib/sound-engine'
import {
  cleanGameTitleFromAlbumTitle,
  deriveGameIdentityFromAlbum,
  useSoundtrackStore,
} from '../../store/soundtrack-store'
import type { SoundtrackAlbumWithTracks } from '../../types'

interface AlbumCardProps {
  albumWithTracks: SoundtrackAlbumWithTracks
  onOpenDetails: (album: SoundtrackAlbumWithTracks) => void
  className?: string
}

export const AlbumCard = memo(function AlbumCard({
  albumWithTracks,
  onOpenDetails,
  className,
}: AlbumCardProps) {
  const { album, tracks } = albumWithTracks
  const isPlaying = useSoundtrackStore(
    (s) => s.currentAlbum?.id === album.id && s.playbackState === 'playing',
  )
  const isFavorite = useSoundtrackStore((s) => s.favorites.has(album.id))
  const playAlbum = useSoundtrackStore((s) => s.playAlbum)
  const toggleFavorite = useSoundtrackStore((s) => s.toggleFavorite)

  function handlePlay(e: React.MouseEvent) {
    e.stopPropagation()
    playButtonClick()
    void playAlbum(album, tracks, 0, deriveGameIdentityFromAlbum(album))
  }

  const initialCover = assetUrl(album.cover_url) || resolveAlbumCoverFallback(album.title)
  const [imgSrc, setImgSrc] = useState<string | null>(initialCover)
  const cleanGameName = cleanGameTitleFromAlbumTitle(album.title)

  return (
    <motion.div
      whileHover={{ y: -5 }}
      transition={{ type: 'spring', stiffness: 400, damping: 28 }}
      onClick={() => onOpenDetails(albumWithTracks)}
      className={cn(
        'group relative flex flex-col gap-3 overflow-hidden rounded-2xl border p-3.5 cursor-pointer select-none transition-colors duration-200',
        isPlaying
          ? 'border-accent/65 bg-gradient-to-b from-accent/15 via-surface-raised/90 to-surface shadow-[0_12px_32px_-8px_var(--nx-accent)]'
          : 'border-border/80 bg-surface/80 shadow-sm hover:border-accent/50 hover:bg-surface-raised/90 hover:shadow-xl',
        className,
      )}
    >
      {/* Self-Contained Album Cover Frame (Zero protruding/clipping disc) */}
      <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-border/75 bg-surface-raised shadow-md">
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={album.title}
            loading="lazy"
            onError={() => {
              const nextUrl = getSecondaryCoverFallbackUrl(imgSrc)
              if (nextUrl && nextUrl !== imgSrc) {
                setImgSrc(nextUrl)
              } else {
                setImgSrc(null)
              }
            }}
            className="size-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
          />
        ) : (
          <div className="flex size-full items-center justify-center bg-gradient-to-br from-accent/20 via-surface-raised to-bg">
            <Disc3 className="size-11 text-accent/65 animate-spin-slow" />
          </div>
        )}

        {/* Smooth Dark Vignette Overlay on Hover */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />

        {/* Top-Left Status / Track Count Badge */}
        {isPlaying ? (
          <div className="absolute left-2.5 top-2.5 z-10 inline-flex items-center gap-1.5 rounded-full bg-accent/95 px-2.5 py-1 font-mono text-[9px] font-bold text-white shadow-md backdrop-blur-md">
            <span className="flex h-2.5 items-end gap-0.5">
              <span className="w-0.5 h-full bg-white animate-pulse" />
              <span className="w-0.5 h-1.5 bg-white animate-bounce" />
              <span className="w-0.5 h-2 bg-white animate-pulse" />
            </span>
            <span>PLAYING</span>
          </div>
        ) : (
          <div className="absolute left-2.5 top-2.5 z-10 rounded-lg border border-white/15 bg-black/55 px-2 py-0.5 font-mono text-[9px] font-bold text-white/90 opacity-0 backdrop-blur-md transition-opacity duration-200 group-hover:opacity-100">
            {tracks.length || album.track_count} Tracks
          </div>
        )}

        {/* Top-Right Favorite Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            playButtonClick()
            void toggleFavorite('album', album.id, { album, tracks })
          }}
          className={cn(
            'absolute right-2.5 top-2.5 z-10 flex size-8 items-center justify-center rounded-full border border-white/15 backdrop-blur-md transition-all shadow-md',
            isFavorite
              ? 'bg-black/65 text-rose-500 opacity-100 scale-100'
              : 'bg-black/45 text-white/85 opacity-0 group-hover:opacity-100 hover:bg-black/70 hover:text-rose-400',
          )}
          title={isFavorite ? 'Remove album from favorites' : 'Add album to favorites'}
        >
          <Heart
            className={cn('size-4 transition-transform active:scale-125', isFavorite && 'fill-current')}
          />
        </button>

        {/* Bottom-Right Play Action Button */}
        <button
          type="button"
          onClick={handlePlay}
          className="absolute bottom-3 right-3 z-10 flex size-10 items-center justify-center rounded-full bg-accent text-white shadow-[0_6px_20px_var(--nx-accent)] opacity-0 translate-y-2 transition-all duration-200 group-hover:opacity-100 group-hover:translate-y-0 hover:scale-110 active:scale-95"
          title="Play Album"
        >
          <Play className="size-4 fill-current translate-x-0.5" />
        </button>
      </div>

      {/* Info Footer */}
      <div className="flex min-w-0 flex-col">
        <div className="flex items-center gap-1 text-[10px] font-semibold text-accent">
          <Gamepad2 className="size-3 shrink-0" />
          <span className="truncate">{cleanGameName}</span>
        </div>

        <h3 className="mt-0.5 truncate text-sm font-bold text-text transition-colors group-hover:text-accent">
          {album.title}
        </h3>

        <p className="mt-0.5 truncate text-xs text-muted">
          {album.artist || 'Original Game Soundtrack'}
        </p>

        <div className="mt-2 flex items-center justify-between border-t border-border/50 pt-2 font-mono text-[10px] text-muted">
          <span className="font-bold text-text/90">
            {tracks.length || album.track_count} Tracks
          </span>
          <span className="rounded-md bg-surface-raised px-1.5 py-0.5 text-[9px] uppercase text-subtle">
            {album.provider_id === 'curated' ? 'Official OST' : 'Live Score'}
          </span>
        </div>
      </div>
    </motion.div>
  )
})
