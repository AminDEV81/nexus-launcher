import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bookmark,
  BookmarkCheck,
  Check,
  Clock,
  Download,
  Eye,
  Gamepad2,
  Loader2,
  Plus,
  Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useStartDownloadModalStore } from '@/features/downloads/store/start-download-modal-store'
import { useAddGameFromHub, useAddGameToWishlist } from '../hooks/use-hub'
import { useGames } from '@/features/library/hooks/use-games'
import { findLibraryEntry } from '../utils/in-library'
import { useUiStore } from '@/store/ui-store'
import { localDateKey } from '@/features/library/utils/format'
import { getGameTypeInfo } from '../utils/game-type'
import { HubScoreBadge } from './hub-score-badge'
import type { HubFeedId } from '../feeds'
import type { HubGame } from '@/types/models'

export interface HubGameCardProps {
  game: HubGame
  feed?: HubFeedId
  inLibrary: boolean
  inWishlist?: boolean
  isInstalled?: boolean
  nexusMatch?: number
  matchReason?: string
  similarityReason?: string
  breakdownChips?: string[]
  className?: string
}

export function HubGameCard({
  game,
  feed: _feed,
  inLibrary,
  inWishlist,
  isInstalled,
  nexusMatch,
  matchReason,
  similarityReason,
  breakdownChips,
  className,
}: HubGameCardProps) {
  const navigate = useNavigate()
  const { data: games } = useGames()
  const selectGame = useUiStore((s) => s.selectGame)
  const openDownloadModal = useStartDownloadModalStore((s) => s.open)
  const addGame = useAddGameFromHub()
  const addToWishlist = useAddGameToWishlist()

  const isUnreleased = Boolean(game.release_date && game.release_date > localDateKey())
  const typeInfo = getGameTypeInfo(game.game_type)

  const libraryEntry = useMemo(() => findLibraryEntry(games, game), [games, game])
  const installed = Boolean(isInstalled || (libraryEntry && libraryEntry.is_installed))

  return (
    <div
      className={cn(
        'group/card relative flex h-full flex-col overflow-hidden rounded-2xl border border-border/80 bg-surface/90 shadow-sm transition-all duration-300 hover:-translate-y-2 hover:border-accent/70 hover:shadow-[0_20px_40px_-12px_rgba(0,0,0,0.7),0_0_20px_-4px_var(--nx-accent)]',
        className,
      )}
    >
      {/* Specular Rim Sheen on Hover */}
      <div className="pointer-events-none absolute inset-0 z-10 rounded-2xl ring-1 ring-inset ring-white/15 opacity-0 transition-opacity duration-300 group-hover/card:opacity-100" />

      {/* Cover Image Container with 3:4 Aspect Ratio */}
      <div className="relative aspect-[3/4] w-full shrink-0 overflow-hidden bg-surface-raised">
        {game.cover_url ? (
          <img
            src={game.cover_url}
            alt={game.name}
            loading="lazy"
            draggable={false}
            className="size-full object-cover transition-transform duration-700 ease-out group-hover/card:scale-108"
          />
        ) : (
          <span className="flex size-full items-center justify-center bg-surface-raised text-subtle">
            <Gamepad2 className="size-10 opacity-40" />
          </span>
        )}

        {/* Top Badges */}
        <div className="absolute inset-x-2 top-2 z-10 flex items-center justify-between gap-1 pointer-events-none">
          <div className="flex flex-wrap items-center gap-1">
            {/* Status Badge */}
            {installed ? (
              <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
                <Check className="size-3" strokeWidth={3} />
                <span>Installed</span>
              </span>
            ) : inLibrary ? (
              <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-700/90 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
                <Check className="size-3" strokeWidth={3} />
                <span>In Library</span>
              </span>
            ) : inWishlist ? (
              <span className="inline-flex items-center gap-1 rounded-lg bg-accent px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
                <Bookmark className="size-3" />
                <span>Wishlist</span>
              </span>
            ) : isUnreleased ? (
              <span className="inline-flex items-center gap-1 rounded-lg bg-cyan-600 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
                <Clock className="size-2.5" />
                <span>Upcoming</span>
              </span>
            ) : null}

            {/* Game Type Badge (Remake / Remaster / Expanded / Standalone) */}
            {typeInfo && (
              <span
                className={cn(
                  'inline-flex items-center rounded-lg px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white shadow-sm ring-1 ring-white/20',
                  typeInfo.bg,
                )}
              >
                {typeInfo.label}
              </span>
            )}
          </div>

          {/* Right badges: Nexus Match & Critic Score */}
          <div className="flex items-center gap-1">
            {nexusMatch !== undefined && nexusMatch > 0 && (
              <span
                title={
                  breakdownChips && breakdownChips.length > 0
                    ? `${nexusMatch}% Match • ${breakdownChips.join(' • ')}`
                    : matchReason || `${nexusMatch}% match with your taste`
                }
                className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-1.5 py-0.5 text-[9px] font-black tracking-wide text-white shadow-sm ring-1 ring-white/20"
              >
                <Sparkles className="size-2.5 fill-current text-violet-200" />
                <span>{nexusMatch}% MATCH</span>
              </span>
            )}
            <HubScoreBadge variant="card" metacriticScore={libraryEntry?.metacritic_score} />
          </div>
        </div>

        {/* Quick Action Overlay (Reveals smoothly on hover) */}
        <div className="absolute inset-0 z-20 flex flex-col justify-end bg-gradient-to-t from-black/95 via-black/50 to-transparent p-3 opacity-0 transition-opacity duration-200 group-hover/card:opacity-100">
          <div className="flex items-center gap-1.5">
            {/* If Installed: Direct Play / Open in Library */}
            {installed ? (
              <button
                type="button"
                title="Installed — Open in Library"
                aria-label={`Play ${game.name}`}
                onClick={(e) => {
                  e.stopPropagation()
                  if (libraryEntry) selectGame(libraryEntry.id)
                  navigate('/')
                }}
                className="flex size-9 flex-1 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-md transition-all hover:bg-emerald-500 hover:scale-105 active:scale-95"
              >
                <Gamepad2 className="size-4" />
              </button>
            ) : (
              /* Download Button (released games that are NOT installed) */
              !isUnreleased && (
                <button
                  type="button"
                  title="Download Game"
                  aria-label={`Download ${game.name}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    openDownloadModal({
                      gameId: libraryEntry?.id,
                      igdbId: game.igdb_id,
                      name: game.name,
                      coverUrl: game.cover_url,
                    })
                  }}
                  className="flex size-9 flex-1 items-center justify-center rounded-xl bg-accent text-white shadow-md transition-all hover:bg-accent-hover hover:scale-105 active:scale-95"
                >
                  <Download className="size-4" />
                </button>
              )
            )}

            {/* Wishlist Status Button (already in wishlist) */}
            {!inLibrary && !installed && inWishlist && (
              <button
                type="button"
                title="View in Wishlist"
                aria-label={`${game.name} is in your Wishlist. Click to view.`}
                onClick={(e) => {
                  e.stopPropagation()
                  navigate('/wishlist')
                }}
                className="flex size-9 flex-1 items-center justify-center gap-1.5 rounded-xl border border-accent/50 bg-accent/30 text-white shadow-sm transition-all hover:bg-accent hover:border-accent hover:scale-105 active:scale-95 cursor-pointer backdrop-blur-md"
              >
                <BookmarkCheck className="size-3.5 text-accent-hover shrink-0" />
                <span className="text-xs font-bold truncate">Wishlisted</span>
              </button>
            )}

            {/* Library / Wishlist Button (hidden if installed or already in wishlist) */}
            {!inLibrary && !installed && !inWishlist && (
              <button
                type="button"
                title={isUnreleased ? 'Add to Wishlist' : 'Add to Library'}
                aria-label={
                  isUnreleased ? `Add ${game.name} to Wishlist` : `Add ${game.name} to Library`
                }
                disabled={addGame.isPending || addToWishlist.isPending}
                onClick={(e) => {
                  e.stopPropagation()
                  if (isUnreleased) {
                    addToWishlist.mutate(game.igdb_id, {
                      onSuccess: () => toast.success(`${game.name} added to wishlist.`),
                      onError: (err) => toast.error(err.message),
                    })
                  } else {
                    addGame.mutate(game.igdb_id, {
                      onSuccess: () => toast.success(`${game.name} added to library.`),
                      onError: (err) => toast.error(err.message),
                    })
                  }
                }}
                className={cn(
                  'flex size-9 items-center justify-center rounded-xl border border-white/20 text-white shadow-sm transition-all hover:scale-105 active:scale-95',
                  isUnreleased
                    ? 'flex-1 bg-accent font-semibold hover:bg-accent-hover'
                    : 'bg-white/20 hover:bg-white/30',
                )}
              >
                {addGame.isPending || addToWishlist.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : isUnreleased ? (
                  <span className="flex items-center gap-1.5 text-xs font-bold">
                    <Bookmark className="size-3.5" />
                    <span>Wishlist</span>
                  </span>
                ) : (
                  <Plus className="size-4" />
                )}
              </button>
            )}

            {/* View Details Button */}
            <button
              type="button"
              title="View Game Details"
              aria-label={`View details for ${game.name}`}
              onClick={() => navigate(`/hub/${game.igdb_id}`)}
              className="flex size-9 items-center justify-center rounded-xl border border-white/20 bg-black/75 text-white shadow-sm transition-all hover:bg-black/90 hover:scale-105 active:scale-95"
            >
              <Eye className="size-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Card Info Footer */}
      <button
        type="button"
        onClick={() => navigate(`/hub/${game.igdb_id}`)}
        className="flex flex-1 flex-col justify-between p-3 text-left transition-colors"
      >
        <div className="flex flex-col min-w-0">
          <div
            className="truncate text-xs sm:text-sm font-bold text-text group-hover/card:text-accent transition-colors"
            title={game.name}
          >
            {game.name}
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-1.5 text-[11px] text-subtle">
            <span
              className="truncate font-medium text-text/80"
              title={game.genres && game.genres.length > 0 ? game.genres.join(', ') : 'Game'}
            >
              {game.genres && game.genres.length > 0 ? game.genres.join(' · ') : 'Game'}
            </span>
            <div className="flex items-center gap-1 shrink-0">
              {typeInfo && (
                <span
                  className={cn(
                    'rounded px-1.5 py-0.2 text-[9px] font-semibold uppercase tracking-wider',
                    typeInfo.badgeBg,
                  )}
                >
                  {typeInfo.label}
                </span>
              )}
              {game.release_date && (
                <span className="rounded bg-surface-raised px-1.5 py-0.2 font-mono text-[10px] font-semibold text-subtle">
                  {game.release_date.slice(0, 4)}
                </span>
              )}
            </div>
          </div>
        </div>

        {(similarityReason || matchReason) && (
          <div className="mt-1.5 flex items-center gap-1 text-[10px] font-medium text-violet-400 truncate">
            <Sparkles className="size-2.5 shrink-0" />
            <span className="truncate">{similarityReason || matchReason}</span>
          </div>
        )}
      </button>
    </div>
  )
}
