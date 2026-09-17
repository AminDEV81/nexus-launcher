import { useState, useMemo, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Bookmark,
  Calendar,
  Clock,
  ExternalLink,
  Gamepad2,
  Plus,
  Search,
  Trash2,
  X,
  Compass,
  CheckCircle2,
  Layers,
  AlertTriangle,
  Image as ImageIcon,
  RefreshCw,
} from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { CoverPickerModal } from '@/features/library/components/cover-picker-modal'
import { CoverMedia } from '@/components/ui/cover-media'
import {
  useGames,
  usePromoteWishlistGame,
  useDeleteGame,
  useSyncWishlistMetadata,
} from '@/features/library/hooks/use-games'
import { useDragReorder } from '@/features/library/hooks/use-drag-reorder'
import { useLibraryUiStore } from '@/features/library/store/library-ui-store'
import {
  isGameUnreleased,
  formatReleaseDate,
  parseStoredUtcDate,
} from '@/features/library/utils/format'
import { assetUrl } from '@/lib/asset-url'
import { useUiStore } from '@/store/ui-store'
import { playButtonClick, playCardHover } from '@/lib/sound-engine'
import { useWindowActive } from '@/hooks/use-window-active'
import { useAnimationSpeed } from '@/hooks/use-animation-speed'
import { cn } from '@/lib/utils'
import type { Game } from '@/types/models'

type WishlistTab = 'all' | 'upcoming' | 'released'

function WishlistCoverCountdown({ releaseDate }: { releaseDate: string | null }) {
  const windowActive = useWindowActive()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!windowActive) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [windowActive])

  if (!releaseDate) {
    return (
      <div className="flex items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-black/85 px-2.5 py-1.5 backdrop-blur-md shadow-lg">
        <Clock className="size-3 text-white/60" />
        <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-white/80">
          TBA / Coming Soon
        </span>
      </div>
    )
  }

  const parsed = parseStoredUtcDate(releaseDate)
  if (!parsed) return null

  const target = parsed.getTime()
  const diff = target - now

  if (diff <= 0) {
    return (
      <div className="flex items-center justify-center gap-1.5 rounded-xl border border-emerald-500/40 bg-black/85 px-2.5 py-1.5 backdrop-blur-md shadow-lg">
        <CheckCircle2 className="size-3.5 text-emerald-400" />
        <span className="font-mono text-[10px] font-black uppercase tracking-wider text-emerald-300">
          Available Now
        </span>
      </div>
    )
  }

  const totalSeconds = Math.floor(diff / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  const isCritical = days < 3

  return (
    <div
      className={cn(
        'flex flex-col gap-1 rounded-xl border bg-black/90 p-1.5 shadow-xl backdrop-blur-md ring-1 transition-all',
        isCritical
          ? 'border-amber-500/50 ring-amber-500/30 shadow-amber-500/10'
          : 'border-white/20 ring-white/10',
      )}
    >
      <div className="flex items-center justify-between px-1 text-[8px] font-extrabold uppercase tracking-widest">
        <span className="flex items-center gap-1 text-amber-400">
          <Clock className="size-2.5 text-amber-400 animate-pulse" />
          {isCritical ? 'Releasing Soon' : 'Countdown'}
        </span>
        <span className="font-mono text-[8px] text-white/70">RELEASES IN</span>
      </div>
      <div className="grid grid-cols-4 gap-1">
        <div className="flex flex-col items-center justify-center rounded-lg bg-white/5 py-1">
          <span className="font-mono text-xs font-black tabular-nums text-white leading-none">
            {String(days).padStart(2, '0')}
          </span>
          <span className="text-[7px] font-bold uppercase text-white/50 tracking-tight mt-0.5">
            DAYS
          </span>
        </div>
        <div className="flex flex-col items-center justify-center rounded-lg bg-white/5 py-1">
          <span className="font-mono text-xs font-black tabular-nums text-white leading-none">
            {String(hours).padStart(2, '0')}
          </span>
          <span className="text-[7px] font-bold uppercase text-white/50 tracking-tight mt-0.5">
            HRS
          </span>
        </div>
        <div className="flex flex-col items-center justify-center rounded-lg bg-white/5 py-1">
          <span className="font-mono text-xs font-black tabular-nums text-white leading-none">
            {String(minutes).padStart(2, '0')}
          </span>
          <span className="text-[7px] font-bold uppercase text-white/50 tracking-tight mt-0.5">
            MIN
          </span>
        </div>
        <div className="flex flex-col items-center justify-center rounded-lg bg-white/5 py-1">
          <span className="font-mono text-xs font-black tabular-nums text-amber-300 leading-none">
            {String(seconds).padStart(2, '0')}
          </span>
          <span className="text-[7px] font-bold uppercase text-amber-400/90 tracking-tight mt-0.5">
            SEC
          </span>
        </div>
      </div>
    </div>
  )
}

export function WishlistPage() {
  const navigate = useNavigate()
  const { data: allGames = [], isLoading } = useGames()
  const promoteMutation = usePromoteWishlistGame()
  const deleteMutation = useDeleteGame()
  const selectGame = useUiStore((s) => s.selectGame)
  const speed = useAnimationSpeed()

  const [activeTab, setActiveTab] = useState<WishlistTab>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [gamePendingRemoval, setGamePendingRemoval] = useState<Game | null>(null)
  const lastRemovalGameRef = useRef<Game | null>(null)
  if (gamePendingRemoval) {
    lastRemovalGameRef.current = gamePendingRemoval
  }
  const displayedRemovalGame = gamePendingRemoval ?? lastRemovalGameRef.current
  const [editingGameId, setEditingGameId] = useState<string | null>(null)

  const syncWishlistMutation = useSyncWishlistMetadata()
  const wishlistCustomOrder = useLibraryUiStore((s) => s.wishlistCustomOrder)
  const reorderWishlistGames = useLibraryUiStore((s) => s.reorderWishlistGames)
  const [hoveredGameId, setHoveredGameId] = useState<string | null>(null)

  // Filter games that belong to wishlist
  const wishlistGames = useMemo(() => {
    return allGames.filter(
      (g) => g.is_wishlist || (isGameUnreleased(g.release_date) && !g.is_installed),
    )
  }, [allGames])

  const upcomingCount = useMemo(() => {
    return wishlistGames.filter((g) => isGameUnreleased(g.release_date)).length
  }, [wishlistGames])

  const releasedCount = useMemo(() => {
    return wishlistGames.filter((g) => !isGameUnreleased(g.release_date)).length
  }, [wishlistGames])

  // Apply tab filter, search & custom drag order
  const filteredGames = useMemo(() => {
    let list = wishlistGames

    if (activeTab === 'upcoming') {
      list = list.filter((g) => isGameUnreleased(g.release_date))
    } else if (activeTab === 'released') {
      list = list.filter((g) => !isGameUnreleased(g.release_date))
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      list = list.filter(
        (g) =>
          g.name.toLowerCase().includes(q) ||
          g.developer?.toLowerCase().includes(q) ||
          g.genres.some((genre) => genre.toLowerCase().includes(q)),
      )
    }

    if (wishlistCustomOrder.length > 0) {
      const orderMap = new Map(wishlistCustomOrder.map((id, index) => [id, index]))
      list = [...list].sort((a, b) => {
        const indexA = orderMap.get(a.id) ?? Number.MAX_SAFE_INTEGER
        const indexB = orderMap.get(b.id) ?? Number.MAX_SAFE_INTEGER
        return indexA - indexB
      })
    }

    return list
  }, [wishlistGames, activeTab, searchQuery, wishlistCustomOrder])

  function handleCardClick(game: Game) {
    playButtonClick()
    if (game.igdb_id) {
      navigate(`/hub/${game.igdb_id}`)
    } else {
      selectGame(game.id)
    }
  }

  const { draggedId, handlePointerDown, handleClick } = useDragReorder(
    filteredGames,
    (id) => {
      const g = filteredGames.find((game) => game.id === id)
      if (g) handleCardClick(g)
    },
    reorderWishlistGames,
  )

  function handlePromote(e: React.MouseEvent, game: Game) {
    e.stopPropagation()
    playButtonClick()
    promoteMutation.mutate(game.id)
  }

  function handleRequestRemove(e: React.MouseEvent, game: Game) {
    e.stopPropagation()
    playButtonClick()
    setGamePendingRemoval(game)
  }

  function handleConfirmRemove() {
    if (!gamePendingRemoval) return
    const id = gamePendingRemoval.id
    playButtonClick()
    deleteMutation.mutate(id)
    setGamePendingRemoval(null)
  }

  return (
    <div className="h-full min-h-0 flex-1 overflow-y-auto px-6 py-6 scroll-smooth">
      {/* Cinematic Header & Stats Strip */}
      <div className="relative mb-8 overflow-hidden rounded-3xl border border-border/80 bg-gradient-to-br from-surface-raised via-surface to-surface p-6 shadow-xl sm:p-8">
        {/* Glowing backdrop atmosphere */}
        <div className="pointer-events-none absolute -right-16 -top-16 size-52 rounded-full bg-accent/15 blur-2xl" />
        <div className="pointer-events-none absolute -left-16 -bottom-16 size-52 rounded-full bg-amber-500/10 blur-2xl" />

        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-accent/20 text-accent ring-1 ring-accent/40 shadow-inner">
                <Bookmark className="size-6 fill-current" />
              </div>
              <div>
                <h1 className="text-2xl font-black tracking-tight text-text sm:text-3xl">
                  Wishlist & Anticipated
                </h1>
                <p className="text-xs text-subtle sm:text-sm">
                  Track upcoming releases, upcoming countdowns, and games saved for later.
                </p>
              </div>
            </div>
          </div>

          {/* Metric Counters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-bg/60 px-4 py-2.5 shadow-sm">
              <div className="flex size-8 items-center justify-center rounded-xl bg-accent/15 text-accent">
                <Layers className="size-4" />
              </div>
              <div>
                <span className="font-mono text-lg font-black text-text">
                  {wishlistGames.length}
                </span>
                <span className="block text-[10px] font-bold uppercase tracking-wider text-muted">
                  Total Saved
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 shadow-sm">
              <div className="flex size-8 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400">
                <Clock className="size-4" />
              </div>
              <div>
                <span className="font-mono text-lg font-black text-amber-400">{upcomingCount}</span>
                <span className="block text-[10px] font-bold uppercase tracking-wider text-amber-400/80">
                  Upcoming
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 shadow-sm">
              <div className="flex size-8 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400">
                <CheckCircle2 className="size-4" />
              </div>
              <div>
                <span className="font-mono text-lg font-black text-emerald-400">
                  {releasedCount}
                </span>
                <span className="block text-[10px] font-bold uppercase tracking-wider text-emerald-400/80">
                  Ready to Play
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                playButtonClick()
                syncWishlistMutation.mutate()
              }}
              disabled={syncWishlistMutation.isPending}
              className="flex items-center gap-2 rounded-2xl border border-border/70 bg-bg/60 px-4 py-2.5 shadow-sm text-xs font-bold text-text hover:border-accent/50 hover:bg-surface transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
              title="Sync wishlist release dates and metadata with IGDB"
            >
              <RefreshCw
                className={cn(
                  'size-4 text-accent',
                  syncWishlistMutation.isPending && 'animate-spin',
                )}
              />
              <span>{syncWishlistMutation.isPending ? 'Syncing...' : 'Sync with IGDB'}</span>
            </button>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="mt-6 flex flex-col gap-4 border-t border-border/50 pt-5 sm:flex-row sm:items-center sm:justify-between">
          {/* Tabs */}
          <div className="flex items-center gap-1.5 rounded-xl border border-border/60 bg-bg/80 p-1">
            <button
              type="button"
              onClick={() => {
                playButtonClick()
                setActiveTab('all')
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                activeTab === 'all'
                  ? 'bg-accent text-white shadow-sm'
                  : 'text-subtle hover:text-text hover:bg-surface'
              }`}
            >
              All ({wishlistGames.length})
            </button>
            <button
              type="button"
              onClick={() => {
                playButtonClick()
                setActiveTab('upcoming')
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                activeTab === 'upcoming'
                  ? 'bg-amber-500 text-black shadow-sm'
                  : 'text-subtle hover:text-text hover:bg-surface'
              }`}
            >
              Upcoming ({upcomingCount})
            </button>
            <button
              type="button"
              onClick={() => {
                playButtonClick()
                setActiveTab('released')
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                activeTab === 'released'
                  ? 'bg-emerald-500 text-black shadow-sm'
                  : 'text-subtle hover:text-text hover:bg-surface'
              }`}
            >
              Available Now ({releasedCount})
            </button>
          </div>

          {/* Search Input */}
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search wishlisted games…"
              className="w-full rounded-xl border border-border/80 bg-bg/90 py-2 pl-9 pr-8 text-xs text-text placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-text"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content Area */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 8 }).map((_, idx) => (
            <div
              key={idx}
              className="aspect-[3/4] animate-pulse rounded-2xl border border-border/40 bg-surface-raised/40"
            />
          ))}
        </div>
      ) : filteredGames.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-3xl border border-dashed border-border/80 bg-surface/30 p-12 text-center">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-accent/15 text-accent mb-4">
            <Bookmark className="size-8" />
          </div>
          <h3 className="text-lg font-bold text-text mb-1">
            {searchQuery ? 'No matching games found' : 'Your Wishlist is Empty'}
          </h3>
          <p className="max-w-md text-xs text-subtle mb-6">
            {searchQuery
              ? 'Try changing your search terms or switching tabs.'
              : 'Discover upcoming and popular titles in Game Hub and add them to your wishlist to track release countdowns.'}
          </p>
          <Link
            to="/hub"
            onClick={playButtonClick}
            className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-accent/20 transition-transform hover:scale-105 active:scale-95"
          >
            <Compass className="size-4" />
            Explore Game Hub
          </Link>
        </div>
      ) : (
        <motion.div
          layout
          className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
          transition={{
            layout: { type: 'spring', stiffness: 320, damping: 28 },
          }}
        >
          <AnimatePresence initial={false} mode="popLayout">
            {filteredGames.map((game) => {
              const unreleased = isGameUnreleased(game.release_date)
              const coverSrc = game.cover_path ? assetUrl(game.cover_path) : null

              return (
                <motion.div
                  key={game.id}
                  data-game-id={game.id}
                  layout={draggedId !== null}
                  onPointerDown={(e) => handlePointerDown(game.id, e)}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{
                    opacity: 0,
                    scale: 0.85,
                    y: -8,
                    transition: { duration: 0.25 * speed, ease: [0.16, 1, 0.3, 1] },
                  }}
                  transition={{
                    layout: { type: 'spring', stiffness: 320, damping: 28 },
                    opacity: { duration: 0.2 * speed },
                  }}
                  className={cn(
                    'size-full select-none',
                    draggedId === game.id &&
                      'z-30 opacity-70 scale-[1.03] shadow-2xl ring-2 ring-accent/60',
                  )}
                >
                  <motion.div
                    whileHover={{ y: -6, scale: 1.015 }}
                    transition={{ type: 'spring', stiffness: 380, damping: 26 }}
                    onMouseEnter={() => {
                      playCardHover()
                      setHoveredGameId(game.id)
                    }}
                    onMouseLeave={() =>
                      setHoveredGameId((prev) => (prev === game.id ? null : prev))
                    }
                    onClick={() => handleClick(game.id)}
                    className="group relative flex size-full flex-col overflow-hidden rounded-2xl border border-border/80 bg-gradient-to-b from-surface-raised via-surface to-surface shadow-md hover:border-accent/60 hover:shadow-2xl hover:shadow-black/50 cursor-pointer"
                  >
                    {/* Cover Aspect Ratio 3:4 */}
                    <div className="relative aspect-[3/4] w-full overflow-hidden bg-bg">
                      {coverSrc ? (
                        <CoverMedia
                          src={coverSrc}
                          isAnimated={game.cover_is_animated}
                          animatedEnabled={game.animated_cover_enabled}
                          hovered={hoveredGameId === game.id}
                          className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex size-full flex-col items-center justify-center gap-2 text-subtle">
                          <Gamepad2 className="size-12 stroke-[1.2]" />
                          <span className="text-xs font-semibold">{game.name}</span>
                        </div>
                      )}

                      {/* Gradient shade for bottom readability */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/30 to-transparent pointer-events-none" />

                      {/* Top status bar: pill & metacritic */}
                      <div className="absolute left-3 top-3 flex items-center gap-1.5 z-10">
                        {unreleased ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-black/75 px-2.5 py-1 text-[10px] font-bold text-amber-300 backdrop-blur-md shadow-md">
                            <Clock className="size-3" />
                            <span>Upcoming</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/40 bg-black/75 px-2.5 py-1 text-[10px] font-bold text-emerald-300 backdrop-blur-md shadow-md">
                            <CheckCircle2 className="size-3" />
                            <span>Available</span>
                          </span>
                        )}

                        {!unreleased && game.metacritic_score && (
                          <span
                            title={`Metacritic: ${game.metacritic_score}`}
                            className={cn(
                              'rounded-md px-1.5 py-0.5 font-mono text-[10px] font-black text-white shadow-md',
                              game.metacritic_score >= 75
                                ? 'bg-[#3e9b3e]'
                                : game.metacritic_score >= 50
                                  ? 'bg-[#c9a618]'
                                  : 'bg-[#cc3d3d]',
                            )}
                          >
                            MC {Math.round(game.metacritic_score)}
                          </span>
                        )}
                      </div>

                      {/* Quick Actions: Edit Cover & Remove */}
                      <div className="absolute right-3 top-3 z-10 flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            playButtonClick()
                            setEditingGameId(game.id)
                          }}
                          title="Change Cover Art"
                          aria-label={`Change cover art for ${game.name}`}
                          className="flex size-8 items-center justify-center rounded-xl border border-white/10 bg-black/60 text-white/80 backdrop-blur-md transition-all hover:border-accent/50 hover:bg-accent/30 hover:text-white active:scale-90 shadow-md"
                        >
                          <ImageIcon className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleRequestRemove(e, game)}
                          disabled={deleteMutation.isPending}
                          title="Remove from wishlist"
                          aria-label={`Remove ${game.name} from wishlist`}
                          className="flex size-8 items-center justify-center rounded-xl border border-white/10 bg-black/60 text-subtle backdrop-blur-md transition-all hover:border-red-500/40 hover:bg-red-500/20 hover:text-red-400 active:scale-90 shadow-md"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>

                      {/* Live Release Countdown Timer right on the cover */}
                      <div className="absolute inset-x-2.5 bottom-2.5 z-10">
                        <WishlistCoverCountdown releaseDate={game.release_date} />
                      </div>
                    </div>

                    {/* Card Details & Actions */}
                    <div className="flex flex-1 flex-col justify-between p-4">
                      <div>
                        <h4 className="line-clamp-1 text-sm font-bold text-text group-hover:text-accent transition-colors">
                          {game.name}
                        </h4>
                        <p className="mt-0.5 text-[11px] text-subtle">
                          {game.developer ?? 'Unknown Studio'}
                        </p>

                        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted">
                          <Calendar className="size-3 shrink-0" />
                          <span className="truncate">{formatReleaseDate(game.release_date)}</span>
                        </div>

                        {/* Genre Chips */}
                        {game.genres.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {game.genres.map((genre) => (
                              <span
                                key={genre}
                                className="rounded-md border border-border/60 bg-surface-raised px-1.5 py-0.5 text-[9px] font-semibold text-subtle"
                              >
                                {genre}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Bottom Action Strip */}
                      <div className="mt-4 pt-3 border-t border-border/50 flex items-center gap-2">
                        {!unreleased ? (
                          <button
                            type="button"
                            onClick={(e) => handlePromote(e, game)}
                            disabled={promoteMutation.isPending}
                            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-accent px-3 py-1.5 text-xs font-bold text-white shadow-sm transition-all hover:bg-accent-hover active:scale-95 disabled:opacity-60"
                          >
                            <Plus className="size-3.5" />
                            <span>Move to Library</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleCardClick(game)}
                            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-surface-raised px-3 py-1.5 text-xs font-semibold text-text transition-all hover:border-accent hover:text-accent active:scale-95"
                          >
                            <ExternalLink className="size-3" />
                            <span>View Details</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Remove Confirmation Dialog */}
      <Modal
        open={Boolean(gamePendingRemoval)}
        onClose={() => setGamePendingRemoval(null)}
        widthClassName="max-w-md"
      >
        {displayedRemovalGame && (
          <div className="p-6">
            <div className="flex items-center gap-3.5 mb-4">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-400 shadow-inner">
                <AlertTriangle className="size-5.5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-text">Remove from Wishlist?</h3>
                <p className="text-xs text-subtle">
                  This game will be removed from your saved wishlist.
                </p>
              </div>
            </div>

            {/* Preview of game being removed */}
            <div className="mb-5 flex items-center gap-3.5 rounded-2xl border border-border/80 bg-surface/80 p-3 shadow-xs">
              {displayedRemovalGame.cover_path ? (
                <img
                  src={assetUrl(displayedRemovalGame.cover_path) ?? ''}
                  alt={displayedRemovalGame.name}
                  className="h-16 w-12 rounded-xl object-cover border border-white/10 shrink-0 shadow-sm"
                />
              ) : (
                <div className="flex h-16 w-12 shrink-0 items-center justify-center rounded-xl bg-surface-raised text-subtle border border-white/10">
                  <Gamepad2 className="size-6" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h4 className="font-bold text-sm text-text truncate">
                  {displayedRemovalGame.name}
                </h4>
                <p className="text-xs text-subtle truncate">
                  {displayedRemovalGame.developer ?? 'Unknown Studio'}
                </p>
                <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted">
                  <Calendar className="size-3 shrink-0" />
                  <span>{formatReleaseDate(displayedRemovalGame.release_date)}</span>
                </div>
              </div>
            </div>

            <p className="mb-6 text-xs text-subtle leading-relaxed">
              Are you sure you want to remove{' '}
              <strong className="text-text font-bold">{displayedRemovalGame.name}</strong> from your
              wishlist? You can easily search and re-add it from Game Hub anytime.
            </p>

            {/* Action buttons */}
            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => {
                  playButtonClick()
                  setGamePendingRemoval(null)
                }}
                className="rounded-xl border border-border/80 bg-surface-raised px-4 py-2 text-xs font-semibold text-subtle transition-all hover:bg-surface hover:text-text active:scale-95"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRemove}
                disabled={deleteMutation.isPending}
                className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-rose-600/20 transition-all hover:bg-rose-500 hover:scale-102 active:scale-95 disabled:opacity-60"
              >
                <Trash2 className="size-3.5" />
                <span>Remove from Wishlist</span>
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Cover Picker Modal for Wishlist Games */}
      <CoverPickerModal
        gameId={editingGameId}
        open={Boolean(editingGameId)}
        onClose={() => setEditingGameId(null)}
      />
    </div>
  )
}
