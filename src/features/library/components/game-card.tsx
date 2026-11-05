import { memo, useMemo, useState } from 'react'
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
import { useActiveDownloadForGame } from '@/features/downloads/hooks/use-downloads'
import { formatElapsed, formatPlaytimeCompact, isGameUnreleased } from '../utils/format'
import { useAnimationSpeed } from '@/hooks/use-animation-speed'
import { playButtonClick, playCardHover } from '@/lib/sound-engine'
import { CoverPlaceholder } from './cover-placeholder'
import { resolveClientCriticScores } from '@/features/hub/utils/score'
import type { Game } from '@/types/models'

function formatSizeCompact(bytes: number | null | undefined): string | null {
  if (!bytes || bytes <= 0) return null
  const gb = bytes / (1024 * 1024 * 1024)
  if (gb >= 1) return `${gb.toFixed(1)} GB`
  const mb = bytes / (1024 * 1024)
  if (mb >= 1) return `${Math.round(mb)} MB`
  return null
}

interface GameCardProps {
  game: Game
  selected: boolean
  onSelect: (id: string) => void
  onContextMenu: (game: Game, event: MouseEvent) => void
}

export const GameCard = memo(function GameCard({
  game,
  selected,
  onSelect,
  onContextMenu,
}: GameCardProps) {
  const navigate = useNavigate()
  const updateFlags = useUpdateGameFlags()
  const launchGame = useLaunchGame()
  const stopGame = useStopGame()
  const openDownloadModal = useStartDownloadModalStore((s) => s.open)
  const isRunning = useLaunchStore((s) => s.runningGameIds.has(game.id))
  const elapsedSeconds = useLaunchStore((s) => s.elapsedSeconds[game.id])
  const { data: tags } = useTags()
  const { data: activeDownload } = useActiveDownloadForGame(game)
  const cover = assetUrl(game.cover_path)
  const [hovered, setHovered] = useState(false)
  const speed = useAnimationSpeed()
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
  const sizeLabel = useMemo(
    () => formatSizeCompact(game.install_size_bytes),
    [game.install_size_bytes],
  )

  const criticScores = useMemo(() => {
    if (isGameUnreleased(game.release_date)) {
      return { metacritic: null, opencritic: null }
    }
    return resolveClientCriticScores(
      game.name,
      game.release_date,
      game.metacritic_score,
      game.opencritic_score,
      null,
    )
  }, [game.name, game.release_date, game.metacritic_score, game.opencritic_score])

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
      whileHover={{ y: -6 }}
      transition={{ type: 'spring', stiffness: 400, damping: 28 }}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-2xl border bg-surface transition-all duration-200 select-none cursor-pointer shadow-sm',
        selected
          ? 'border-accent ring-2 ring-accent/80 shadow-xl shadow-accent/20'
          : isRunning
            ? 'border-emerald-500/70 ring-2 ring-emerald-500/40 shadow-lg shadow-emerald-500/15'
            : 'border-border/85 hover:border-accent/55 hover:shadow-xl',
      )}
    >
      {/* Top Specular Rim */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />

      {/* 3:4 Poster Viewport */}
      <div className="relative aspect-[3/4] w-full overflow-hidden bg-surface-raised">
        {cover ? (
          <CoverMedia
            src={cover}
            className="size-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
            isAnimated={game.cover_is_animated}
            animatedEnabled={game.animated_cover_enabled}
            alwaysLive={selected}
            hovered={hovered}
          />
        ) : (
          <CoverPlaceholder name={game.name} />
        )}

        {/* Top & Bottom Vignettes for Badge Contrast */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-[5] h-20 bg-gradient-to-b from-black/80 via-black/25 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[5] h-24 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />

        {/* Top-Left Status & Score Badges */}
        <div className="pointer-events-none absolute left-2.5 top-2.5 z-10 flex flex-col items-start gap-1.5">
          {isDownloading ? (
            <span
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-black text-white shadow-sm',
                activeDownload?.status === 'paused'
                  ? 'border-amber-400/50 bg-amber-600/95'
                  : activeDownload?.status === 'failed'
                    ? 'border-rose-400/50 bg-rose-600/95'
                    : 'border-accent/50 bg-accent',
              )}
            >
              {activeDownload?.status === 'paused' ? (
                <Pause className="size-2.5" />
              ) : (
                <Download className="size-2.5 animate-bounce" />
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
            <span className="flex items-center gap-1.5 rounded-full border border-emerald-400/50 bg-emerald-950/90 px-2.5 py-0.5 font-mono text-[10px] font-bold text-emerald-300 shadow-sm">
              <span className="relative flex size-2 items-center justify-center">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex size-1.5 rounded-full bg-emerald-400" />
              </span>
              <span>
                {elapsedSeconds !== undefined ? formatElapsed(elapsedSeconds) : 'Playing'}
              </span>
            </span>
          ) : isWishlist ? (
            <span className="flex items-center gap-1 rounded-full border border-amber-400/40 bg-black/80 px-2 py-0.5 text-[10px] font-bold text-amber-300 shadow-xs">
              <Bookmark className="size-2.5 fill-amber-400 text-amber-400" />
              <span>{isUnreleased ? 'Upcoming' : 'Wishlist'}</span>
            </span>
          ) : game.is_installed ? (
            <span className="flex items-center gap-1 rounded-full border border-emerald-400/35 bg-black/80 px-2 py-0.5 text-[10px] font-bold text-emerald-300 shadow-xs">
              <HardDrive className="size-2.5 text-emerald-400" />
              <span>Installed</span>
            </span>
          ) : null}

          {game.cover_is_animated && (
            <span className="flex items-center gap-1 rounded-full border border-white/25 bg-gradient-to-r from-accent to-indigo-500 px-2 py-0.5 font-mono text-[9px] font-black tracking-wider text-white shadow-xs">
              <Sparkles className="size-2.5" />
              <span>LIVE</span>
            </span>
          )}
        </div>

        {/* Top-Right Favorite Heart */}
        <button
          type="button"
          onClick={handleToggleFavorite}
          aria-label={game.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
          className={cn(
            'absolute right-2.5 top-2.5 z-20 flex size-7.5 items-center justify-center rounded-full border transition-all duration-200 shadow-sm active:scale-90 cursor-pointer',
            game.is_favorite
              ? 'border-pink-500/50 bg-pink-500/25 text-pink-400 hover:bg-pink-500/35'
              : 'border-white/20 bg-black/65 text-white/75 opacity-0 group-hover:opacity-100 hover:border-white/40 hover:bg-black/85 hover:text-white',
          )}
        >
          <Heart
            className={cn(
              'size-3.5 transition-transform',
              game.is_favorite && 'fill-pink-500 text-pink-500 scale-110',
            )}
          />
        </button>

        {/* Bottom-Left Critic / User Score Pill on Poster */}
        <div className="pointer-events-none absolute bottom-2.5 left-2.5 z-10 flex items-center gap-1.5">
          {game.user_rating && game.user_rating > 0 ? (
            <span
              title={`Your Rating: ${game.user_rating}/10`}
              className="flex items-center gap-1 rounded-md border border-amber-400/40 bg-black/80 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-300 shadow-xs"
            >
              <Star className="size-2.5 fill-amber-400 text-amber-400" />
              <span>{game.user_rating}/10</span>
            </span>
          ) : criticScores.metacritic || criticScores.opencritic ? (
            <div className="inline-flex items-center gap-1 rounded-md bg-black/80 p-0.5 ring-1 ring-white/15 shadow-xs">
              {criticScores.metacritic && (
                <span
                  title={`Metacritic: ${criticScores.metacritic}/100`}
                  className={cn(
                    'rounded px-1.5 py-0.5 font-mono text-[9px] font-black text-white',
                    criticScores.metacritic >= 75
                      ? 'bg-emerald-600'
                      : criticScores.metacritic >= 50
                        ? 'bg-amber-600'
                        : 'bg-rose-600',
                  )}
                >
                  MC {criticScores.metacritic}
                </span>
              )}
              {criticScores.opencritic && (
                <span
                  title={`OpenCritic: ${criticScores.opencritic}/100`}
                  className={cn(
                    'rounded px-1.5 py-0.5 font-mono text-[9px] font-black text-white',
                    criticScores.opencritic >= 84
                      ? 'bg-[#fc430a]'
                      : criticScores.opencritic >= 75
                        ? 'bg-purple-600'
                        : 'bg-sky-600',
                  )}
                >
                  OC {criticScores.opencritic}
                </span>
              )}
            </div>
          ) : null}

          {Boolean(game.steam_app_id || game.igdb_id) && (
            <span
              title="Soundtrack available"
              className="flex items-center gap-0.5 rounded-md border border-accent/35 bg-black/80 px-1.5 py-0.5 font-mono text-[9px] font-bold text-accent"
            >
              <Music className="size-2.5" />
              <span>OST</span>
            </span>
          )}
        </div>

        {/* Bottom-Right Tag Dots */}
        {tagDots.length > 0 && (
          <span
            title={tagDots.map((tag) => tag.name).join(', ')}
            className="pointer-events-none absolute bottom-2.5 right-2.5 z-10 flex items-center gap-1 rounded-full border border-white/15 bg-black/80 px-2 py-1 shadow-xs"
          >
            {tagDots.slice(0, 4).map((tag) => (
              <span
                key={tag.id}
                className="size-2 rounded-full ring-1 ring-black/50"
                style={{ backgroundColor: tag.color }}
              />
            ))}
          </span>
        )}

        {/* Active Download Slim Progress Line */}
        {isDownloading && (
          <div className="absolute inset-x-0 bottom-0 z-20 h-1.5 bg-black/80">
            <div
              className={cn(
                'h-full transition-all duration-300',
                activeDownload?.status === 'paused'
                  ? 'bg-amber-500'
                  : 'bg-gradient-to-r from-accent via-cyan-400 to-accent',
              )}
              style={{ width: `${downloadPercent}%` }}
            />
          </div>
        )}

        {/* Center Hover Action Overlay */}
        <div className="absolute inset-0 z-15 flex items-center justify-center bg-black/55 opacity-0 transition-opacity duration-200 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto">
          {isUnreleased ? (
            <div className="flex items-center gap-1.5 rounded-full border border-amber-400/50 bg-black/90 px-3.5 py-1.5 font-mono text-xs font-bold text-amber-300 shadow-lg">
              <Calendar className="size-3.5 text-amber-400" />
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
                      ? 'Install'
                      : 'Play'
              }
              className={cn(
                'relative flex items-center justify-center overflow-hidden shadow-xl transition-all duration-200 active:scale-95 disabled:opacity-60 cursor-pointer',
                downloadable
                  ? 'h-10 px-4 gap-2 rounded-xl border border-accent bg-accent text-white font-bold text-xs hover:scale-105'
                  : 'size-13 rounded-full text-white hover:scale-110 ring-2 ring-white/25',
                isRunning
                  ? 'bg-emerald-600 hover:bg-emerald-500'
                  : isDownloading
                    ? 'bg-accent'
                    : !downloadable
                      ? 'bg-gradient-to-br from-accent to-accent-hover'
                      : '',
              )}
            >
              <AnimatePresence mode="wait" initial={false}>
                {isRunning ? (
                  <motion.span
                    key="stop"
                    initial={{ opacity: 0, scale: 0.7 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.7 }}
                    transition={{ duration: 0.14 * speed }}
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
                    transition={{ duration: 0.14 * speed }}
                    className="flex flex-col items-center justify-center font-mono text-[10px] font-black leading-none text-white"
                  >
                    <Download className="size-4 animate-bounce mb-0.5" />
                    <span>{downloadPercent}%</span>
                  </motion.span>
                ) : downloadable ? (
                  <motion.div
                    key="download"
                    initial={{ opacity: 0, scale: 0.7 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.7 }}
                    transition={{ duration: 0.14 * speed }}
                    className="flex items-center gap-1.5"
                  >
                    <Download className="size-4" />
                    <span className="font-mono text-xs font-extrabold uppercase tracking-wider">
                      Install
                    </span>
                  </motion.div>
                ) : (
                  <motion.span
                    key="play"
                    initial={{ opacity: 0, scale: 0.7 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.7 }}
                    transition={{ duration: 0.14 * speed }}
                    className="flex items-center justify-center"
                  >
                    {launchGame.isPending ? (
                      <Loader2 className="size-5 animate-spin" />
                    ) : (
                      <Play className="size-5 translate-x-0.5" fill="currentColor" />
                    )}
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          )}
        </div>
      </div>

      {/* Integrated Card Pedestal Footer (Light & Dark Mode Adaptive) */}
      <div className="flex flex-col gap-1.5 border-t border-border/60 bg-surface px-3 py-2.5">
        <div className="flex items-center justify-between gap-1.5">
          <h3 className="truncate text-xs font-extrabold tracking-tight text-text transition-colors group-hover:text-accent">
            {game.name}
          </h3>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              playButtonClick()
              onContextMenu(game, event)
            }}
            aria-label="More options"
            className="flex size-6 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-raised hover:text-text cursor-pointer"
          >
            <MoreVertical className="size-3.5" />
          </button>
        </div>

        <div className="flex items-center justify-between gap-2 text-[10px] text-muted">
          <span className="truncate font-medium">
            {game.developer ||
              (game.genres.length > 0 ? game.genres[0] : isWishlist ? 'Wishlisted' : 'PC Game')}
          </span>

          <div className="flex shrink-0 items-center gap-1.5">
            {game.total_playtime_seconds > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-accent/25 bg-accent/10 px-1.5 py-0.5 font-mono text-[9px] font-bold text-accent">
                <Clock className="size-2.5" />
                <span>{formatPlaytimeCompact(game.total_playtime_seconds)}</span>
              </span>
            ) : sizeLabel ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-raised px-1.5 py-0.5 font-mono text-[9px] font-semibold text-subtle">
                <span>{sizeLabel}</span>
              </span>
            ) : releaseYear ? (
              <span className="font-mono text-[10px] text-subtle">{releaseYear}</span>
            ) : null}
          </div>
        </div>
      </div>
    </motion.div>
  )
})
