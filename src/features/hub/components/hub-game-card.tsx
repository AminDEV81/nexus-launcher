import { memo, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bookmark,
  BookmarkCheck,
  Check,
  Clock,
  Download,
  Eye,
  Flame,
  Gamepad2,
  Loader2,
  Plus,
  RotateCcw,
  Sparkles,
  Tag,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useStartDownloadModalStore } from '@/features/downloads/store/start-download-modal-store'
import { useAddGameFromHub, useAddGameToWishlist } from '../hooks/use-hub'
import { useDefaultSteamRegion, useSteamPrice } from '../hooks/use-steam-price'
import { useHubSearchStore } from '../store/hub-search-store'
import { useGames, useRestoreGameFromMemory } from '@/features/library/hooks/use-games'
import { findLibraryEntry } from '../utils/in-library'
import { buildCoverFallbackChain } from '../utils/cover-fallback'
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
  inMemory?: boolean
  nexusMatch?: number
  matchReason?: string
  similarityReason?: string
  breakdownChips?: string[]
  className?: string
}

function compactPlatformLabels(platforms?: string[]): string[] {
  if (!platforms || platforms.length === 0) return []
  const out = new Set<string>()
  for (const p of platforms) {
    const low = p.toLowerCase()
    if (low.includes('windows') || low === 'pc') out.add('PC')
    else if (low.includes('playstation 5') || low === 'ps5') out.add('PS5')
    else if (low.includes('playstation 4') || low === 'ps4') out.add('PS4')
    else if (low.includes('xbox series')) out.add('XSX')
    else if (low.includes('xbox one')) out.add('XONE')
    else if (low.includes('switch 2')) out.add('SW2')
    else if (low.includes('switch')) out.add('NSW')
    else if (low.includes('linux')) out.add('Linux')
    else if (low.includes('mac')) out.add('Mac')
    if (out.size >= 3) break
  }
  return Array.from(out)
}

export const HubGameCard = memo(function HubGameCard({
  game,
  feed: _feed,
  inLibrary,
  inWishlist,
  isInstalled,
  inMemory,
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
  const restoreGame = useRestoreGameFromMemory()
  const { defaultRegion } = useDefaultSteamRegion()

  const [hasHovered, setHasHovered] = useState(false)

  const isUnreleased = Boolean(game.release_date && game.release_date > localDateKey())
  const typeInfo = getGameTypeInfo(game.game_type)
  const activeGenreIds = useHubSearchStore((s) => s.genreIds)

  const libraryEntry = useMemo(() => findLibraryEntry(games, game), [games, game])

  // Fetch live Steam price & discount percentage on hover (cached for 10 mins)
  const { data: livePrice, isFetching: isFetchingPrice } = useSteamPrice(
    libraryEntry?.steam_app_id ?? game.steam_app_id ?? null,
    defaultRegion,
    game.name,
    hasHovered && !isUnreleased,
  )

  const coverCandidates = useMemo(
    () => buildCoverFallbackChain(game.cover_url, game.backdrop_url),
    [game.cover_url, game.backdrop_url],
  )
  const [coverIdx, setCoverIdx] = useState(0)

  useEffect(() => {
    setCoverIdx(0)
  }, [game.igdb_id, game.cover_url, game.backdrop_url])

  const activeCoverUrl = coverCandidates[coverIdx] ?? null

  const displayGenresText = useMemo(() => {
    if (!game.genres || game.genres.length === 0) return 'Game'
    const matchId = (gg: string, gid: number): boolean => {
      const low = gg.trim().toLowerCase()
      switch (gid) {
        case 2:
          return low === 'point-and-click' || low === 'point and click'
        case 4:
          return low === 'fighting'
        case 5:
          return low === 'shooter'
        case 7:
          return low === 'music'
        case 8:
          return low === 'platform' || low === 'platformer'
        case 9:
          return low === 'puzzle'
        case 10:
          return low === 'racing'
        case 11:
          return low.includes('real time strategy') || low === 'rts'
        case 12:
          return low.includes('role-playing') || low === 'rpg'
        case 13:
          return low === 'simulator' || low === 'simulation'
        case 14:
          return low === 'sport' || low === 'sports'
        case 15:
          return low === 'strategy'
        case 16:
          return low.includes('turn-based strategy') || low === 'tbs'
        case 24:
          return low === 'tactical'
        case 25:
          return low.includes('hack and slash') || low.includes("beat 'em up")
        case 26:
          return low.includes('quiz') || low.includes('trivia')
        case 30:
          return low === 'pinball'
        case 31:
          return low === 'adventure'
        case 32:
          return low === 'indie'
        case 33:
          return low === 'arcade'
        case 34:
          return low === 'visual novel'
        case 35:
          return low.includes('card') || low.includes('board')
        case 36:
          return low === 'moba'
        default:
          return false
      }
    }
    const sorted = [...game.genres].sort((a, b) => {
      const aMatch = activeGenreIds.some((id) => matchId(a, id)) ? 1 : 0
      const bMatch = activeGenreIds.some((id) => matchId(b, id)) ? 1 : 0
      return bMatch - aMatch
    })
    const maxShow = Math.max(3, activeGenreIds.length)
    const shown = sorted.slice(0, maxShow)
    const extra = sorted.length - shown.length
    return extra > 0 ? `${shown.join(' · ')} +${extra}` : shown.join(' · ')
  }, [game.genres, activeGenreIds])

  const isMem = Boolean(inMemory || (libraryEntry && libraryEntry.is_memory))
  const installed = Boolean(!isMem && (isInstalled || (libraryEntry && libraryEntry.is_installed)))
  const inLib = Boolean(!isMem && inLibrary)
  const inWish = Boolean(!isMem && inWishlist)
  const platformChips = useMemo(() => compactPlatformLabels(game.platforms), [game.platforms])

  return (
    <div
      onMouseEnter={() => {
        if (!hasHovered) setHasHovered(true)
      }}
      className={cn(
        'group/card relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-surface/95 shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:border-accent/70 hover:shadow-[0_18px_36px_-12px_rgba(0,0,0,0.65),0_0_20px_-6px_var(--nx-accent)]',
        className,
      )}
    >
      {/* Specular Rim Sheen on Hover */}
      <div className="pointer-events-none absolute inset-0 z-10 rounded-2xl ring-1 ring-inset ring-white/15 opacity-0 transition-opacity duration-300 group-hover/card:opacity-100" />

      {/* Cover Image Container with 3:4 Aspect Ratio */}
      <div
        onClick={() => navigate(`/hub/${game.igdb_id}`, { state: { expectedName: game.name } })}
        className="relative aspect-[3/4] w-full shrink-0 cursor-pointer overflow-hidden bg-surface-raised"
      >
        {activeCoverUrl ? (
          <img
            src={activeCoverUrl}
            alt={game.name}
            loading="lazy"
            decoding="async"
            draggable={false}
            onError={() => {
              setCoverIdx((prev) => prev + 1)
            }}
            className="size-full object-cover transition-transform duration-700 ease-out group-hover/card:scale-108"
          />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-surface-raised via-surface to-accent/15 p-4 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl border border-accent/30 bg-accent/10 text-accent shadow-inner">
              <Gamepad2 className="size-6" />
            </div>
            <span className="line-clamp-3 text-xs font-extrabold tracking-tight text-text/90">
              {game.name}
            </span>
            <span className="rounded-md border border-border/70 bg-surface/80 px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-subtle">
              {displayGenresText}
            </span>
          </div>
        )}

        {/* Subtle Bottom Vignette for readability */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

        {/* Top Badges */}
        <div className="absolute inset-x-2.5 top-2.5 z-10 flex items-start justify-between gap-1 pointer-events-none">
          <div className="flex flex-wrap items-center gap-1">
            {installed ? (
              <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-600/95 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm ring-1 ring-emerald-400/40 backdrop-blur-md">
                <Check className="size-3" strokeWidth={3} />
                <span>Installed</span>
              </span>
            ) : isMem ? (
              <span className="inline-flex items-center gap-1 rounded-lg bg-amber-600/95 border border-amber-400/40 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm backdrop-blur-md">
                <RotateCcw className="size-2.5" />
                <span>In Memory</span>
              </span>
            ) : inLib ? (
              <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-700/95 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm ring-1 ring-emerald-400/30 backdrop-blur-md">
                <Check className="size-3" strokeWidth={3} />
                <span>In Library</span>
              </span>
            ) : inWish ? (
              <span className="inline-flex items-center gap-1 rounded-lg bg-accent/95 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm ring-1 ring-white/20 backdrop-blur-md">
                <Bookmark className="size-3" />
                <span>Wishlist</span>
              </span>
            ) : isUnreleased ? (
              <span className="inline-flex items-center gap-1 rounded-lg bg-cyan-600/95 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm ring-1 ring-cyan-300/30 backdrop-blur-md">
                <Clock className="size-2.5" />
                <span>Upcoming</span>
              </span>
            ) : null}

            {typeInfo && (
              <span
                className={cn(
                  'inline-flex items-center rounded-lg px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white shadow-sm ring-1 ring-white/20 backdrop-blur-md',
                  typeInfo.bg,
                )}
              >
                {typeInfo.label}
              </span>
            )}
          </div>

          {/* Right badges: Nexus Match & Critic/IGDB Score */}
          <div className="flex flex-col items-end gap-1">
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
                <span>{nexusMatch}%</span>
              </span>
            )}
            <HubScoreBadge
              variant="card"
              metacriticScore={game.metacritic_score ?? libraryEntry?.metacritic_score}
              opencriticScore={game.opencritic_score ?? libraryEntry?.opencritic_score}
              igdbRating={game.rating}
              gameName={game.name}
              releaseDate={game.release_date}
            />
          </div>
        </div>

        {/* Bottom-left Platform & Hype micro-badges (visible when not hovered) */}
        {(platformChips.length > 0 || (game.hypes && game.hypes >= 25) || livePrice || (game.discount_percent && game.discount_percent > 0)) && (
          <div className="pointer-events-none absolute inset-x-2.5 bottom-2 z-10 flex items-center justify-between gap-1 transition-opacity duration-200 group-hover/card:opacity-0">
            <div className="flex items-center gap-1">
              {platformChips.map((plat) => (
                <span
                  key={plat}
                  className="rounded-md border border-white/15 bg-black/65 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-white/90 backdrop-blur-sm"
                >
                  {plat}
                </span>
              ))}
            </div>
            {livePrice ? (
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[9.5px] font-extrabold shadow-sm backdrop-blur-md',
                  livePrice.is_free
                    ? 'border-emerald-400/40 bg-emerald-600/90 text-white'
                    : livePrice.discount_percent > 0
                      ? 'border-emerald-400/50 bg-black/85 text-emerald-300'
                      : 'border-white/20 bg-black/80 text-white',
                )}
              >
                {livePrice.discount_percent > 0 && (
                  <span className="rounded bg-emerald-500 px-1 py-0.2 text-[8.5px] font-black text-black">
                    -{livePrice.discount_percent}%
                  </span>
                )}
                <span>{livePrice.is_free ? 'FREE' : livePrice.final_formatted}</span>
              </span>
            ) : game.discount_percent && game.discount_percent > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-emerald-400/50 bg-black/85 px-1.5 py-0.5 font-mono text-[9.5px] font-extrabold text-emerald-300 shadow-sm backdrop-blur-md">
                <span className="rounded bg-emerald-500 px-1 py-0.2 text-[8.5px] font-black text-black">
                  -{game.discount_percent}%
                </span>
                <span>{game.sale_price_formatted || 'ON SALE'}</span>
              </span>
            ) : game.hypes != null && game.hypes >= 25 ? (
              <span className="inline-flex items-center gap-0.5 rounded-md border border-amber-400/30 bg-black/65 px-1.5 py-0.5 text-[9px] font-bold text-amber-300 backdrop-blur-sm">
                <Flame className="size-2.5 fill-current text-amber-400" />
                <span>{game.hypes}</span>
              </span>
            ) : null}
          </div>
        )}

        {/* Quick Action + Live Price Overlay (Reveals smoothly on hover) */}
        <div className="absolute inset-0 z-20 flex flex-col justify-end gap-2 bg-gradient-to-t from-black/95 via-black/65 to-transparent p-3 opacity-0 transition-opacity duration-200 group-hover/card:opacity-100">
          {/* Live Steam Price & Discount Showcase Pill on Hover */}
          {!isUnreleased && (
            <div className="pointer-events-none flex items-center justify-between rounded-xl border border-white/15 bg-black/85 px-2.5 py-1.5 shadow-lg backdrop-blur-md">
              <div className="flex items-center gap-1.5 min-w-0">
                <Tag className="size-3 shrink-0 text-emerald-400" />
                <span className="truncate text-[10px] font-bold uppercase tracking-wider text-white/80">
                  {livePrice?.flag_emoji ? `${livePrice.flag_emoji} Live Price` : 'Steam Price'}
                </span>
              </div>

              {livePrice ? (
                <div className="flex items-center gap-1.5 shrink-0">
                  {livePrice.is_free ? (
                    <span className="rounded-md bg-emerald-500/20 border border-emerald-400/40 px-2 py-0.5 font-mono text-[10px] font-black uppercase text-emerald-300">
                      Free to Play
                    </span>
                  ) : (
                    <>
                      {livePrice.discount_percent > 0 && (
                        <span className="rounded-md bg-emerald-500 px-1.5 py-0.5 font-mono text-[10px] font-black text-black shadow-xs">
                          -{livePrice.discount_percent}%
                        </span>
                      )}
                      <div className="flex flex-col items-end leading-none">
                        {livePrice.discount_percent > 0 && livePrice.initial_formatted && (
                          <span className="font-mono text-[9px] text-white/50 line-through">
                            {livePrice.initial_formatted}
                          </span>
                        )}
                        <span className="font-mono text-xs font-black text-emerald-300">
                          {livePrice.final_formatted}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              ) : isFetchingPrice ? (
                <span className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold text-white/70">
                  <Loader2 className="size-3 animate-spin text-accent" />
                  <span>Checking…</span>
                </span>
              ) : (
                <span className="font-mono text-[10px] font-semibold text-white/60">
                  Check Store
                </span>
              )}
            </div>
          )}

          <div className="flex items-center gap-1.5">
            {isMem && libraryEntry ? (
              <button
                type="button"
                title="Restore to Library"
                aria-label={`Restore ${game.name} from Memory`}
                disabled={restoreGame.isPending}
                onClick={(e) => {
                  e.stopPropagation()
                  restoreGame.mutate(libraryEntry.id)
                }}
                className="flex size-9 flex-1 items-center justify-center gap-1.5 rounded-xl border border-amber-400/50 bg-amber-600 text-white shadow-md transition-all hover:bg-amber-500 hover:border-amber-300 hover:scale-105 active:scale-95 cursor-pointer backdrop-blur-md"
              >
                {restoreGame.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="size-3.5" />
                )}
                <span className="text-xs font-bold truncate">Restore</span>
              </button>
            ) : installed ? (
              <button
                type="button"
                title="Installed — Open in Library"
                aria-label={`Play ${game.name}`}
                onClick={(e) => {
                  e.stopPropagation()
                  if (libraryEntry) selectGame(libraryEntry.id)
                  navigate('/')
                }}
                className="flex size-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 text-white shadow-md transition-all hover:bg-emerald-500 hover:scale-105 active:scale-95"
              >
                <Gamepad2 className="size-4" />
                <span className="text-xs font-bold">Play</span>
              </button>
            ) : (
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
                      coverUrl: activeCoverUrl ?? game.cover_url,
                    })
                  }}
                  className="flex size-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-accent text-white shadow-md transition-all hover:bg-accent-hover hover:scale-105 active:scale-95"
                >
                  <Download className="size-3.5" />
                  <span className="text-xs font-bold">Get</span>
                </button>
              )
            )}

            {!isMem && !inLib && !installed && inWish && (
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
                <span className="text-xs font-bold truncate">Saved</span>
              </button>
            )}

            {!isMem && !inLib && !installed && !inWish && (
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

            <button
              type="button"
              title="View Game Details"
              aria-label={`View details for ${game.name}`}
              onClick={(e) => {
                e.stopPropagation()
                navigate(`/hub/${game.igdb_id}`, { state: { expectedName: game.name } })
              }}
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
        onClick={() => navigate(`/hub/${game.igdb_id}`, { state: { expectedName: game.name } })}
        className="flex flex-1 flex-col justify-between p-3 text-left transition-colors"
      >
        <div className="flex flex-col min-w-0">
          <div
            className="truncate text-xs sm:text-sm font-bold text-text group-hover/card:text-accent transition-colors"
            title={game.name}
          >
            {game.name}
          </div>
          <div className="mt-1.5 flex items-start justify-between gap-1.5 text-[11px] text-subtle">
            <span
              className="line-clamp-2 font-medium text-text/85 leading-snug"
              title={game.genres && game.genres.length > 0 ? game.genres.join(', ') : 'Game'}
            >
              {displayGenresText}
            </span>
            <div className="flex items-center gap-1 shrink-0">
              {game.release_date && (
                <span className="rounded-md border border-border/60 bg-surface-raised px-1.5 py-0.5 font-mono text-[10px] font-semibold text-subtle">
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
})
