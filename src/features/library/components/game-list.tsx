import { useState } from 'react'
import type { MouseEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Heart,
  HardDrive,
  MoreVertical,
  Play,
  Square,
  Sparkles,
  Download,
  Bookmark,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { assetUrl } from '@/lib/asset-url'
import { CoverMedia } from '@/components/ui/cover-media'
import { useUpdateGameFlags, useLaunchGame, useStopGame } from '../hooks/use-games'
import { useLaunchStore } from '@/store/launch-store'
import { useStartDownloadModalStore } from '@/features/downloads/store/start-download-modal-store'
import { useDragReorder } from '../hooks/use-drag-reorder'
import { useAnimationSpeed } from '@/hooks/use-animation-speed'
import { formatElapsed, formatPlaytime, isGameUnreleased } from '../utils/format'
import { CoverPlaceholder } from './cover-placeholder'
import type { Game } from '@/types/models'

interface GameListProps {
  games: Game[]
  selectedId: string | null
  onSelect: (id: string) => void
  onContextMenu: (game: Game, event: MouseEvent) => void
}

/**
 * Deliberately not virtualized, unlike `GameGrid` — list view is the
 * secondary/less-used mode here, and a plain scrolling list of DOM rows
 * stays smooth well past what a typical personal library needs. Uses
 * Framer Motion `popLayout` for seamless morphing upon addition/deletion.
 * Supports smooth Left-Click Hold & Drag reordering.
 */
export function GameList({ games, selectedId, onSelect, onContextMenu }: GameListProps) {
  const speed = useAnimationSpeed()
  const { draggedId, handlePointerDown, handleClick } = useDragReorder(games, onSelect)

  return (
    <div className="flex h-full flex-col gap-1.5 overflow-y-auto px-6 pb-6 pt-3">
      <AnimatePresence initial={false} mode="popLayout">
        {games.map((game) => (
          <motion.div
            layout="position"
            key={game.id}
            data-game-id={game.id}
            className={cn(
              'transition-opacity select-none',
              draggedId === game.id && 'opacity-40 scale-[0.99] z-20 cursor-grabbing',
            )}
            exit={{
              opacity: 0,
              scale: 0.96,
              y: -4,
              transition: { duration: 0.18 * speed, ease: [0.16, 1, 0.3, 1] },
            }}
            transition={{
              layout: { type: 'spring', stiffness: 350, damping: 28 },
              opacity: { duration: 0.2 * speed },
            }}
          >
            <div onPointerDown={(e) => handlePointerDown(game.id, e)} className="size-full">
              <GameListRow
                game={game}
                selected={game.id === selectedId}
                onSelect={() => handleClick(game.id)}
                onContextMenu={onContextMenu}
              />
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

function GameListRow({
  game,
  selected,
  onSelect,
  onContextMenu,
}: {
  game: Game
  selected: boolean
  onSelect: (id: string) => void
  onContextMenu: (game: Game, event: MouseEvent) => void
}) {
  const updateFlags = useUpdateGameFlags()
  const launchGame = useLaunchGame()
  const stopGame = useStopGame()
  const openDownloadModal = useStartDownloadModalStore((s) => s.open)
  const isRunning = useLaunchStore((s) => s.runningGameIds.has(game.id))
  const elapsedSeconds = useLaunchStore((s) => s.elapsedSeconds[game.id])
  const cover = assetUrl(game.cover_path)
  const [hovered, setHovered] = useState(false)

  const isUnreleased = isGameUnreleased(game.release_date) && !game.is_installed
  const downloadable =
    !game.is_installed && !game.executable_path && game.source !== 'steam' && !isUnreleased
  const releaseYear = game.release_date ? game.release_date.split('-')[0] : null

  function handlePlay(event: MouseEvent) {
    event.stopPropagation()
    if (isUnreleased) {
      onSelect(game.id)
      return
    }
    if (isRunning) {
      if (!stopGame.isPending) stopGame.mutate(game.id)
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

  return (
    <div
      tabIndex={0}
      onClick={() => onSelect(game.id)}
      onContextMenu={(event) => onContextMenu(game, event)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        'group flex cursor-pointer items-center justify-between gap-4 rounded-2xl border px-4 py-2.5 transition-all duration-200 shadow-xs',
        selected
          ? 'border-accent bg-accent/10 ring-1 ring-accent/40 shadow-sm'
          : 'border-border/70 bg-surface/80 hover:border-border hover:bg-surface-raised hover:shadow-sm',
      )}
    >
      {/* Left: Thumbnail & Main Info */}
      <div className="flex min-w-0 flex-1 items-center gap-3.5">
        {/* Cover Thumbnail 3:4 */}
        <div className="relative h-16 w-12 shrink-0 overflow-hidden rounded-xl border border-border/80 bg-surface shadow-xs transition-transform duration-200 group-hover:scale-105">
          {cover ? (
            <CoverMedia
              src={cover}
              className="size-full object-cover"
              isAnimated={game.cover_is_animated}
              animatedEnabled={game.animated_cover_enabled}
              alwaysLive={selected}
              hovered={hovered}
            />
          ) : (
            <CoverPlaceholder name={game.name} />
          )}

          {/* Thumbnail play action overlay */}
          {!isUnreleased && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                type="button"
                onClick={handlePlay}
                disabled={launchGame.isPending || stopGame.isPending}
                aria-label={isRunning ? 'Stop' : downloadable ? 'Download' : 'Play'}
                className="flex size-7 items-center justify-center rounded-full bg-accent text-white shadow-md active:scale-95"
              >
                {isRunning ? (
                  <Square className="size-3" fill="currentColor" />
                ) : downloadable ? (
                  <Download className="size-3.5" />
                ) : (
                  <Play className="size-3.5 translate-x-0.5" fill="currentColor" />
                )}
              </button>
            </div>
          )}
        </div>

        {/* Info Column */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-bold text-text transition-colors group-hover:text-accent">
              {game.name}
            </span>
            {game.cover_is_animated && (
              <span className="flex items-center gap-0.5 rounded-md bg-accent px-1.5 py-0.5 font-mono text-[9px] font-black text-white">
                <Sparkles className="size-2" />
                LIVE
              </span>
            )}
            {!isGameUnreleased(game.release_date) && game.metacritic_score && (
              <span
                className={cn(
                  'rounded px-1.5 py-0.2 font-mono text-[10px] font-black text-white shadow-xs',
                  game.metacritic_score >= 75
                    ? 'bg-emerald-600'
                    : game.metacritic_score >= 50
                      ? 'bg-amber-600'
                      : 'bg-red-600',
                )}
              >
                {game.metacritic_score}
              </span>
            )}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-subtle">
            <span className="truncate">{game.developer || 'Unknown Studio'}</span>
            {releaseYear && (
              <>
                <span className="size-1 rounded-full bg-border" />
                <span>{releaseYear}</span>
              </>
            )}
            {game.genres.length > 0 && (
              <>
                <span className="size-1 rounded-full bg-border" />
                <span
                  title={game.genres.join(', ')}
                  className="truncate max-w-[220px] rounded-md bg-surface-raised px-1.5 py-0.5 text-[10px] font-medium text-subtle border border-border/50"
                >
                  {game.genres.join(' · ')}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Right: Status Pills & Action Strip */}
      <div className="flex shrink-0 items-center gap-3">
        {/* Playtime Badge */}
        <span className="hidden sm:inline-flex rounded-lg bg-surface px-2.5 py-1 text-xs font-mono font-medium text-subtle border border-border/50">
          {game.total_playtime_seconds > 0
            ? `${formatPlaytime(game.total_playtime_seconds)} played`
            : 'Unplayed'}
        </span>

        {/* State Indicators */}
        {game.is_wishlist && (
          <span className="flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold text-amber-400">
            <Bookmark className="size-3 fill-amber-400" />
            <span className="hidden md:inline">{isUnreleased ? 'Unreleased' : 'Wishlist'}</span>
          </span>
        )}

        {game.is_installed && !isRunning && (
          <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold text-emerald-400">
            <HardDrive className="size-3" />
            <span className="hidden md:inline">Installed</span>
          </span>
        )}

        {isRunning && (
          <span className="flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-600/90 px-3 py-1 font-mono text-[10px] font-bold text-white shadow-sm shadow-emerald-500/30">
            <span className="size-1.5 animate-ping rounded-full bg-white" />
            <span>{elapsedSeconds !== undefined ? formatElapsed(elapsedSeconds) : 'Playing'}</span>
          </span>
        )}

        {/* Quick Launch / Install Action Button */}
        {!isUnreleased && (
          <button
            type="button"
            onClick={handlePlay}
            disabled={launchGame.isPending || stopGame.isPending}
            className={cn(
              'hidden sm:flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all active:scale-95 disabled:opacity-60 shadow-xs',
              isRunning
                ? 'bg-red-500/15 text-red-400 hover:bg-red-500/25 border border-red-500/30'
                : downloadable
                  ? 'bg-accent/15 text-accent hover:bg-accent hover:text-white border border-accent/30'
                  : 'bg-accent text-white hover:bg-accent-hover shadow-accent/20',
            )}
          >
            {isRunning ? (
              <>
                <Square className="size-3" fill="currentColor" />
                <span>Stop</span>
              </>
            ) : downloadable ? (
              <>
                <Download className="size-3.5" />
                <span>Install</span>
              </>
            ) : (
              <>
                <Play className="size-3.5 fill-current" />
                <span>Play</span>
              </>
            )}
          </button>
        )}

        {/* Favorite Button */}
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            updateFlags.mutate({ id: game.id, is_favorite: !game.is_favorite })
          }}
          aria-label={game.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
          className={cn(
            'flex size-8 items-center justify-center rounded-xl border transition-all active:scale-90',
            game.is_favorite
              ? 'border-pink-500/40 bg-pink-500/10 text-pink-500 shadow-xs'
              : 'border-border/60 bg-surface text-muted hover:border-border hover:text-text',
          )}
        >
          <Heart
            className={cn(
              'size-3.5',
              game.is_favorite && 'fill-pink-500 drop-shadow-[0_0_6px_rgba(236,72,153,0.5)]',
            )}
          />
        </button>

        {/* Context Menu Dots */}
        <button
          type="button"
          onClick={(event) => onContextMenu(game, event)}
          aria-label="More options"
          className="flex size-8 items-center justify-center rounded-xl text-subtle transition-colors hover:bg-surface-raised hover:text-text"
        >
          <MoreVertical className="size-4" />
        </button>
      </div>
    </div>
  )
}
