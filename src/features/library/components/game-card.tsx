import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Play,
  Pause,
  Square,
  Heart,
  MoreVertical,
  HardDrive,
  Sparkles,
  Loader2,
  Download,
  Bookmark,
  Clock,
  Calendar,
  Star,
  Music,
} from 'lucide-react'
import type { MouseEvent } from 'react'
import { cn } from '@/lib/utils'
import { assetUrl } from '@/lib/asset-url'
import { CoverMedia } from '@/components/ui/cover-media'
import { useUpdateGameFlags, useLaunchGame, useStopGame } from '../hooks/use-games'
import { useTags } from '../hooks/use-tags'
import { useLaunchStore } from '@/store/launch-store'
import { useNavigate } from 'react-router-dom'
import { useStartDownloadModalStore } from '@/features/downloads/store/start-download-modal-store'
import { useDownloads } from '@/features/downloads/hooks/use-downloads'
import { findActiveDownloadForGame } from '@/features/downloads/utils/match-download'
import { formatElapsed, formatPlaytimeCompact, isGameUnreleased } from '../utils/format'
import { useAnimationSpeed } from '@/hooks/use-animation-speed'
import { playButtonClick, playCardHover } from '@/lib/sound-engine'
import { CoverPlaceholder } from './cover-placeholder'
import type { Game } from '@/types/models'

interface GameCardProps {
  game: Game
  selected: boolean
  onSelect: (id: string) => void
  onContextMenu: (game: Game, event: MouseEvent) => void
}

export function GameCard({ game, selected, onSelect, onContextMenu }: GameCardProps) {
  const navigate = useNavigate()
  const updateFlags = useUpdateGameFlags()
  const launchGame = useLaunchGame()
  const stopGame = useStopGame()
  const openDownloadModal = useStartDownloadModalStore((s) => s.open)
  const isRunning = useLaunchStore((s) => s.runningGameIds.has(game.id))
  const elapsedSeconds = useLaunchStore((s) => s.elapsedSeconds[game.id])
  const { data: tags } = useTags()
  const { data: downloads } = useDownloads()
  const cover = assetUrl(game.cover_path)
  const [hovered, setHovered] = useState(false)
  const speed = useAnimationSpeed()

  const activeDownload = useMemo(
    () => findActiveDownloadForGame(downloads, game),
    [downloads, game],
  )
  const isDownloading = Boolean(activeDownload)
  const downloadPercent =
    activeDownload && activeDownload.total_bytes > 0
      ? Math.min(
          100,
          Math.round((activeDownload.downloaded_bytes / activeDownload.total_bytes) * 100),
        )
      : 0

  const isUnreleased = isGameUnreleased(game.release_date) && !game.is_installed
  const downloadable =
    !game.is_installed && !game.executable_path && game.source !== 'steam' && !isUnreleased
  const releaseYear = game.release_date ? game.release_date.split('-')[0] : null
  const isWishlist = Boolean(game.is_wishlist)

  const tagDots = useMemo(() => {
    if (!tags || game.tag_ids.length === 0) return []
    const byId = new Map(tags.map((tag) => [tag.id, tag]))
    return game.tag_ids
      .map((id) => byId.get(id))
      .filter((tag): tag is NonNullable<typeof tag> => Boolean(tag))
  }, [tags, game.tag_ids])

  function handlePlay(event: MouseEvent) {
    event.stopPropagation()
    playButtonClick()
    if (isUnreleased) {
      onSelect(game.id)
      return
    }
    if (isRunning) {
      if (!stopGame.isPending) stopGame.mutate(game.id)
      return
    }
    if (isDownloading) {
      navigate('/downloads')
      return
    }
    if (downloadable) {
      openDownloadModal({
        gameId: game.id,
        igdbId: game.igdb_id,
        name: game.name,
        coverUrl: game.cover_path ? cover : null,
      })
      return
    }
    if (!launchGame.isPending) launchGame.mutate(game.id)
  }

  function handleToggleFavorite(event: MouseEvent) {
    event.stopPropagation()
    playButtonClick()
    updateFlags.mutate({ id: game.id, is_favorite: !game.is_favorite })
  }

  return (
    <div className="group flex flex-col gap-2.5">
      {/* Cover Card Poster Container */}
      <motion.div
        tabIndex={0}
        onClick={() => {
          playButtonClick()
          onSelect(game.id)
        }}
        onContextMenu={(event) => {
          playButtonClick()
          onContextMenu(game, event)
        }}
        onHoverStart={() => {
          setHovered(true)
          playCardHover()
        }}
        onHoverEnd={() => setHovered(false)}
        whileHover={{ y: -8, scale: 1.02 }}
        transition={{ type: 'spring', stiffness: 380, damping: 26 }}
        className={cn(
          'relative aspect-[3/4] cursor-pointer overflow-hidden rounded-2xl border bg-surface/90 transition-all duration-300 select-none shadow-md ring-1 ring-inset ring-white/10',
          selected
            ? 'border-accent ring-2 ring-accent shadow-2xl shadow-accent/30'
            : isRunning
              ? 'border-emerald-500/60 ring-2 ring-emerald-500/40 shadow-xl shadow-emerald-500/20'
              : 'border-border/80 hover:border-accent/60 hover:ring-accent/30 hover:shadow-2xl hover:shadow-black/60',
        )}
      >
        {/* Specular top glass rim line */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-px bg-gradient-to-r from-transparent via-white/35 to-transparent" />

        {/* Cover Media / Art or Placeholder */}
        {cover ? (
          <CoverMedia
            src={cover}
            className="size-full object-cover transition-transform duration-700 ease-out group-hover:scale-106"
            isAnimated={game.cover_is_animated}
            animatedEnabled={game.animated_cover_enabled}
            alwaysLive={selected}
            hovered={hovered}
          />
        ) : (
          <CoverPlaceholder name={game.name} />
        )}

        {/* Cinematic Top Vignette for Status Badges */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-[5] h-24 bg-gradient-to-b from-black/85 via-black/35 to-transparent" />

        {/* Cinematic Bottom Vignette for Tags / Metadata */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[5] h-28 bg-gradient-to-t from-black/90 via-black/45 to-transparent" />

        {/* Top-Left Badges Deck */}
        <div className="absolute left-2.5 top-2.5 z-10 flex flex-col items-start gap-1.5 pointer-events-none">
          {/* Active Download State */}
          {isDownloading ? (
            <span
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] font-black text-white shadow-md',
                activeDownload?.status === 'paused'
                  ? 'border-amber-400/40 bg-amber-500/90 shadow-amber-500/20'
                  : activeDownload?.status === 'failed'
                    ? 'border-rose-400/40 bg-rose-500/90 shadow-rose-500/20'
                    : 'border-accent/40 bg-accent/90 shadow-[0_0_14px_var(--nx-accent)]',
              )}
            >
              {activeDownload?.status === 'paused' ? (
                <Pause className="size-3" />
              ) : (
                <Download className="size-3 animate-bounce" />
              )}
              <span>
                {activeDownload?.status === 'extracting'
                  ? 'Extracting'
                  : activeDownload?.status === 'paused'
                    ? `Paused ${downloadPercent}%`
                    : activeDownload?.status === 'queued'
                      ? 'Queued'
                      : activeDownload?.status === 'failed'
                        ? 'Failed'
                        : `${downloadPercent}%`}
              </span>
            </span>
          ) : isRunning ? (
            <span className="flex items-center gap-1.5 rounded-full border border-emerald-400/50 bg-emerald-950/90 px-2.5 py-1 font-mono text-[10px] font-bold text-emerald-300 shadow-[0_0_14px_rgba(16,185,129,0.35)]">
              <span className="relative flex size-2 items-center justify-center">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex size-1.5 rounded-full bg-emerald-400" />
              </span>
              <span>
                {elapsedSeconds !== undefined ? formatElapsed(elapsedSeconds) : 'Playing'}
              </span>
            </span>
          ) : isWishlist ? (
            <span className="flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-black/85 px-2.5 py-0.5 text-[10px] font-bold text-amber-300 shadow-sm">
              <Bookmark className="size-3 fill-amber-400 text-amber-400" />
              <span>{isUnreleased ? 'Upcoming' : 'Wishlist'}</span>
            </span>
          ) : game.is_installed ? (
            <span className="flex items-center gap-1.5 rounded-full border border-white/20 bg-black/85 px-2.5 py-0.5 text-[10px] font-bold text-white shadow-sm">
              <HardDrive className="size-3 text-emerald-400" />
              <span>Ready</span>
            </span>
          ) : null}

          {/* Live Cover Tag */}
          {game.cover_is_animated && (
            <span className="flex items-center gap-1 rounded-full border border-white/25 bg-gradient-to-r from-accent via-indigo-500 to-accent-hover px-2 py-0.5 font-mono text-[9px] font-black tracking-wider text-white shadow-sm">
              <Sparkles className="size-2.5" />
              <span>LIVE</span>
            </span>
          )}

          {/* User Rating or Metacritic Badge */}
          {game.user_rating && game.user_rating > 0 ? (
            <span
              title={`Your Rating: ${game.user_rating}/10`}
              className="flex items-center gap-1 rounded-full border border-amber-400/40 bg-black/85 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-300 shadow-sm"
            >
              <Star className="size-2.5 fill-amber-400 text-amber-400" />
              <span>{game.user_rating}</span>
            </span>
          ) : !isGameUnreleased(game.release_date) &&
            game.metacritic_score &&
            game.metacritic_score > 0 ? (
            <span
              title={`Metacritic: ${game.metacritic_score}`}
              className={cn(
                'rounded-md px-1.5 py-0.5 font-mono text-[9px] font-black text-white shadow-sm ring-1 ring-white/20',
                game.metacritic_score >= 75
                  ? 'bg-emerald-600/90'
                  : game.metacritic_score >= 50
                    ? 'bg-amber-600/90'
                    : 'bg-rose-600/90',
              )}
            >
              MC {Math.round(game.metacritic_score)}
            </span>
          ) : null}

          {/* Subtle Soundtrack Availability Indicator */}
          {Boolean(game.steam_app_id || game.igdb_id) && (
            <span
              title="Soundtrack available"
              className="flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[9px] font-bold text-accent shadow-sm border border-accent/30 bg-black/85"
            >
              <Music className="size-2.5 text-accent" />
              <span>OST</span>
            </span>
          )}
        </div>

        {/* Top-Right Favorite Heart */}
        <button
          type="button"
          onClick={handleToggleFavorite}
          aria-label={game.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
          className={cn(
            'absolute right-2.5 top-2.5 z-10 flex size-8 items-center justify-center rounded-full border transition-all duration-200 shadow-md active:scale-90',
            game.is_favorite
              ? 'border-pink-500/40 bg-pink-500/30 text-pink-400 hover:bg-pink-500/40 hover:border-pink-500/60 shadow-[0_0_12px_rgba(236,72,153,0.35)]'
              : 'border-white/20 bg-black/70 text-white/70 hover:border-white/40 hover:bg-black/90 hover:text-white hover:scale-110',
          )}
        >
          <Heart
            className={cn(
              'size-4 transition-transform',
              game.is_favorite &&
                'fill-pink-500 text-pink-500 scale-110 drop-shadow-[0_0_8px_rgba(236,72,153,0.8)]',
            )}
          />
        </button>

        {/* Tag Dots Bottom-Right */}
        {tagDots.length > 0 && (
          <span
            title={tagDots.map((tag) => tag.name).join(', ')}
            className="absolute bottom-2.5 right-2.5 z-10 flex items-center gap-1.5 rounded-full border border-white/15 bg-black/85 px-2.5 py-1 shadow-md"
          >
            {tagDots.slice(0, 4).map((tag) => (
              <span
                key={tag.id}
                className="size-2 rounded-full ring-1 ring-black/50 shadow-xs"
                style={{ backgroundColor: tag.color }}
              />
            ))}
          </span>
        )}

        {/* Active Download Slim Bottom Progress Line */}
        {isDownloading && (
          <div className="absolute inset-x-0 bottom-0 z-20 h-1.5 bg-black/80">
            <div
              className={cn(
                'h-full transition-all duration-300',
                activeDownload?.status === 'paused'
                  ? 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.7)]'
                  : 'bg-gradient-to-r from-accent via-cyan-400 to-accent shadow-[0_0_10px_var(--nx-accent)]',
              )}
              style={{ width: `${downloadPercent}%` }}
            />
          </div>
        )}

        {/* Cinematic Hover Overlay & Center Action Command */}
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-between p-3.5 bg-gradient-to-t from-black/95 via-black/60 to-black/30 opacity-0 transition-opacity duration-200 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto">
          {/* Top spacer */}
          <div className="h-6" />

          {/* Center Action Command */}
          {isUnreleased ? (
            <div className="flex items-center gap-2 rounded-full border border-amber-400/50 bg-black/90 px-4 py-2 font-mono text-xs font-bold text-amber-300 shadow-2xl">
              <Calendar className="size-4 text-amber-400" />
              <span>Coming Soon</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={handlePlay}
              disabled={launchGame.isPending || stopGame.isPending}
              aria-label={
                isRunning
                  ? 'Stop'
                  : isDownloading
                    ? 'View Download'
                    : downloadable
                      ? 'Download'
                      : 'Play'
              }
              className={cn(
                'relative flex items-center justify-center overflow-hidden shadow-2xl transition-all duration-200 active:scale-95 disabled:opacity-60',
                downloadable
                  ? 'h-11 px-4 gap-2 rounded-2xl border border-accent/70 bg-surface/95 text-text shadow-[0_0_24px_color-mix(in_srgb,var(--color-accent)_40%,transparent)] hover:border-accent hover:shadow-[0_0_35px_color-mix(in_srgb,var(--color-accent)_75%,transparent)] hover:scale-105'
                  : 'size-14 rounded-full text-white hover:scale-110 ring-2 ring-white/20',
                isRunning
                  ? 'bg-emerald-600 hover:bg-emerald-500 shadow-[0_0_28px_rgba(16,185,129,0.6)] ring-emerald-400/40'
                  : isDownloading
                    ? 'border border-accent/50 bg-accent text-white shadow-[0_0_28px_var(--nx-accent)] ring-accent/40'
                    : downloadable
                      ? ''
                      : 'bg-gradient-to-br from-accent to-accent-hover shadow-[0_0_32px_var(--nx-accent)] ring-accent/40',
              )}
            >
              <AnimatePresence mode="wait" initial={false}>
                {isRunning ? (
                  <motion.span
                    key="stop"
                    initial={{ opacity: 0, scale: 0.7 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.7 }}
                    transition={{ duration: 0.16 * speed, ease: [0.16, 1, 0.3, 1] }}
                    className="flex items-center justify-center"
                  >
                    {stopGame.isPending ? (
                      <Loader2 className="size-5 animate-spin" />
                    ) : (
                      <Square className="size-5" fill="currentColor" />
                    )}
                  </motion.span>
                ) : isDownloading ? (
                  <motion.span
                    key="downloading"
                    initial={{ opacity: 0, scale: 0.7 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.7 }}
                    transition={{ duration: 0.16 * speed, ease: [0.16, 1, 0.3, 1] }}
                    className="flex flex-col items-center justify-center font-mono text-[10px] font-black leading-none text-white"
                  >
                    <Download className="size-4.5 animate-bounce mb-0.5" />
                    <span>{downloadPercent}%</span>
                  </motion.span>
                ) : downloadable ? (
                  <motion.div
                    key="download"
                    initial={{ opacity: 0, scale: 0.7 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.7 }}
                    transition={{ duration: 0.16 * speed, ease: [0.16, 1, 0.3, 1] }}
                    className="flex items-center gap-2"
                  >
                    <div className="flex size-7 items-center justify-center rounded-xl bg-accent text-white shadow-sm ring-1 ring-white/30">
                      <Download className="size-4 animate-pulse" />
                    </div>
                    <span className="font-mono text-xs font-black uppercase tracking-wider text-text">
                      Install
                    </span>
                  </motion.div>
                ) : (
                  <motion.span
                    key="play"
                    initial={{ opacity: 0, scale: 0.7 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.7 }}
                    transition={{ duration: 0.16 * speed, ease: [0.16, 1, 0.3, 1] }}
                    className="flex items-center justify-center"
                  >
                    {launchGame.isPending ? (
                      <Loader2 className="size-6 animate-spin" />
                    ) : (
                      <Play className="size-6 translate-x-0.5" fill="currentColor" />
                    )}
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          )}

          {/* Bottom Hover Telemetry Strip */}
          <div className="flex w-full items-center justify-between font-mono text-[10px] text-white/90">
            <span
              title={game.genres.length > 0 ? game.genres.join(', ') : undefined}
              className="truncate rounded-lg border border-white/10 bg-black/85 px-2 py-0.5 font-bold uppercase"
            >
              {game.genres.length > 0 ? game.genres.join(' · ') : isWishlist ? 'Wishlist' : 'Game'}
            </span>
            {releaseYear && (
              <span className="rounded-lg border border-white/10 bg-black/85 px-2 py-0.5">
                {releaseYear}
              </span>
            )}
          </div>
        </div>
      </motion.div>

      {/* Meta Information Below Card */}
      <div className="flex items-start justify-between gap-1.5 px-0.5">
        <div
          onClick={() => {
            playButtonClick()
            onSelect(game.id)
          }}
          className="min-w-0 flex-1 cursor-pointer select-none"
        >
          {/* Game Title */}
          <div className="truncate text-xs font-bold text-text transition-colors duration-150 group-hover:text-accent tracking-tight">
            {game.name}
          </div>

          {/* Subtitle / Telemetry */}
          <div className="mt-1 flex items-center gap-1.5 truncate text-[11px] text-muted">
            <span className="truncate">
              {game.developer ||
                (game.genres.length > 0 ? game.genres[0] : isWishlist ? 'Wishlisted' : 'Game')}
            </span>

            {game.total_playtime_seconds > 0 ? (
              <>
                <span className="size-1 shrink-0 rounded-full bg-border" />
                <span className="inline-flex items-center gap-1 font-mono text-[10px] font-bold text-accent bg-accent/10 px-1.5 py-0.2 rounded border border-accent/20">
                  <Clock className="size-2.5" />
                  <span>{formatPlaytimeCompact(game.total_playtime_seconds)}</span>
                </span>
              </>
            ) : game.is_installed ? (
              <>
                <span className="size-1 shrink-0 rounded-full bg-border" />
                <span className="inline-flex items-center gap-1 font-mono text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">
                  <span>Installed</span>
                </span>
              </>
            ) : isWishlist && releaseYear ? (
              <>
                <span className="size-1 shrink-0 rounded-full bg-border" />
                <span className="inline-flex items-center gap-1 font-mono text-[10px] text-subtle">
                  <Calendar className="size-2.5" />
                  <span>{releaseYear}</span>
                </span>
              </>
            ) : null}
          </div>
        </div>

        {/* Quick Context Menu Button */}
        <button
          type="button"
          onClick={(event) => {
            playButtonClick()
            onContextMenu(game, event)
          }}
          aria-label="More options"
          className="flex size-7 shrink-0 items-center justify-center rounded-xl text-muted transition-all duration-150 hover:bg-surface-raised hover:text-text hover:shadow-sm active:scale-90"
        >
          <MoreVertical className="size-3.5" />
        </button>
      </div>
    </div>
  )
}
