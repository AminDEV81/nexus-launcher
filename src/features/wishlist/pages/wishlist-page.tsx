import { useState, useMemo, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AlertTriangle,
  ArrowUpDown,
  Bookmark,
  Calendar,
  CheckCircle2,
  Clock,
  Compass,
  Download,
  ExternalLink,
  Flame,
  Gamepad2,
  Image as ImageIcon,
  Layers,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Trophy,
  X,
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
import { useStartDownloadModalStore } from '@/features/downloads/store/start-download-modal-store'
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

type WishlistTab = 'all' | 'upcoming' | 'released' | 'acclaimed'
type WishlistSort = 'custom' | 'release-soon' | 'score-desc' | 'name'

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
          Available Now • Ready
        </span>
      </div>
    )
  }

  const totalSeconds = Math.floor(diff / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  const isCritical = days < 7

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
          {isCritical ? 'Launching Soon' : 'Live Countdown'}
        </span>
        <span className="font-mono text-[8px] text-white/70">T-MINUS</span>
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
  const openDownloadModal = useStartDownloadModalStore((s) => s.open)
  const speed = useAnimationSpeed()

  const [activeTab, setActiveTab] = useState<WishlistTab>('all')
  const [sortBy, setSortBy] = useState<WishlistSort>('custom')
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
      (g) =>
        !g.is_memory && (g.is_wishlist || (isGameUnreleased(g.release_date) && !g.is_installed)),
    )
  }, [allGames])

  const upcomingCount = useMemo(() => {
    return wishlistGames.filter((g) => isGameUnreleased(g.release_date)).length
  }, [wishlistGames])

  const releasedCount = useMemo(() => {
    return wishlistGames.filter((g) => !isGameUnreleased(g.release_date)).length
  }, [wishlistGames])

  const acclaimedCount = useMemo(() => {
    return wishlistGames.filter(
      (g) => Math.max(g.metacritic_score ?? 0, g.opencritic_score ?? 0) >= 80,
    ).length
  }, [wishlistGames])

  const avgCriticScore = useMemo(() => {
    const scored = wishlistGames
      .map((g) => Math.max(g.metacritic_score ?? 0, g.opencritic_score ?? 0))
      .filter((s) => s > 0)
    if (scored.length === 0) return null
    return Math.round(scored.reduce((a, b) => a + b, 0) / scored.length)
  }, [wishlistGames])

  // Spotlight Hero Game (soonest upcoming release, or highest-rated wishlisted game)
  const spotlightGame = useMemo(() => {
    if (wishlistGames.length === 0) return null
    const upcomingWithDates = wishlistGames
      .filter((g) => isGameUnreleased(g.release_date) && g.release_date)
      .sort((a, b) => (a.release_date ?? '').localeCompare(b.release_date ?? ''))
    if (upcomingWithDates.length > 0) return upcomingWithDates[0]
    const byScore = [...wishlistGames].sort(
      (a, b) =>
        Math.max(b.metacritic_score ?? 0, b.opencritic_score ?? 0) -
        Math.max(a.metacritic_score ?? 0, a.opencritic_score ?? 0),
    )
    return byScore[0] ?? wishlistGames[0]
  }, [wishlistGames])

  // Apply tab filter, search & sort order
  const filteredGames = useMemo(() => {
    let list = [...wishlistGames]

    if (activeTab === 'upcoming') {
      list = list.filter((g) => isGameUnreleased(g.release_date))
    } else if (activeTab === 'released') {
      list = list.filter((g) => !isGameUnreleased(g.release_date))
    } else if (activeTab === 'acclaimed') {
      list = list.filter(
        (g) => Math.max(g.metacritic_score ?? 0, g.opencritic_score ?? 0) >= 80,
      )
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

    if (sortBy === 'name') {
      list.sort((a, b) => a.name.localeCompare(b.name))
    } else if (sortBy === 'score-desc') {
      list.sort(
        (a, b) =>
          Math.max(b.metacritic_score ?? 0, b.opencritic_score ?? 0) -
          Math.max(a.metacritic_score ?? 0, a.opencritic_score ?? 0),
      )
    } else if (sortBy === 'release-soon') {
      list.sort((a, b) => {
        if (!a.release_date && !b.release_date) return a.name.localeCompare(b.name)
        if (!a.release_date) return 1
        if (!b.release_date) return -1
        return a.release_date.localeCompare(b.release_date)
      })
    } else if (wishlistCustomOrder.length > 0) {
      const orderMap = new Map(wishlistCustomOrder.map((id, index) => [id, index]))
      list.sort((a, b) => {
        const indexA = orderMap.get(a.id) ?? Number.MAX_SAFE_INTEGER
        const indexB = orderMap.get(b.id) ?? Number.MAX_SAFE_INTEGER
        return indexA - indexB
      })
    }

    return list
  }, [wishlistGames, activeTab, searchQuery, sortBy, wishlistCustomOrder])

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

  function handleDownloadWishlistGame(e: React.MouseEvent, game: Game) {
    e.stopPropagation()
    playButtonClick()
    openDownloadModal({
      gameId: game.id,
      igdbId: game.igdb_id ?? undefined,
      name: game.name,
      coverUrl: game.cover_path ? assetUrl(game.cover_path) : null,
    })
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
      <div className="mx-auto flex w-full max-w-[1920px] flex-col gap-6">
        {/* ── 1. Cinematic Wishlist Command Header & Telemetry Strip ─── */}
        <div className="relative overflow-hidden rounded-3xl border border-border/85 bg-gradient-to-br from-surface-raised via-surface to-surface p-6 shadow-xl sm:p-8">
          <div className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-accent/15 blur-3xl" />
          <div className="pointer-events-none absolute -left-16 -bottom-16 size-64 rounded-full bg-amber-500/10 blur-3xl" />

          <div className="relative flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-3.5">
                <div className="flex size-13 shrink-0 items-center justify-center rounded-2xl border border-accent/40 bg-gradient-to-br from-accent/25 via-accent/10 to-surface-raised text-accent shadow-[0_0_24px_-6px_var(--nx-accent)]">
                  <Bookmark className="size-6.5 fill-current" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full border border-accent/35 bg-accent/15 px-2.5 py-0.5 font-mono text-[10px] font-black uppercase tracking-widest text-accent">
                      <Sparkles className="size-3" />
                      <span>ANTICIPATED RADAR</span>
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/35 bg-emerald-500/10 px-2.5 py-0.5 font-mono text-[10px] font-bold text-emerald-400">
                      Live Countdown &amp; Release Tracker
                    </span>
                  </div>
                  <h1 className="mt-1 text-2xl font-black tracking-tight text-text sm:text-3xl">
                    Wishlist &amp; Release Radar
                  </h1>
                </div>
              </div>
            </div>

            {/* 4 Telemetry KPI Counters + IGDB Sync */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-3 rounded-2xl border border-border/80 bg-bg/65 px-4 py-2.5 shadow-sm">
                <div className="flex size-9 items-center justify-center rounded-xl bg-accent/15 text-accent">
                  <Layers className="size-4.5" />
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
                <div className="flex size-9 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400">
                  <Clock className="size-4.5" />
                </div>
                <div>
                  <span className="font-mono text-lg font-black text-amber-400">
                    {upcomingCount}
                  </span>
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-amber-400/80">
                    Upcoming Hype
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 shadow-sm">
                <div className="flex size-9 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400">
                  <CheckCircle2 className="size-4.5" />
                </div>
                <div>
                  <span className="font-mono text-lg font-black text-emerald-400">
                    {releasedCount}
                  </span>
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-emerald-400/80">
                    Out Now
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-2xl border border-purple-500/30 bg-purple-500/10 px-4 py-2.5 shadow-sm">
                <div className="flex size-9 items-center justify-center rounded-xl bg-purple-500/20 text-purple-400">
                  <Trophy className="size-4.5" />
                </div>
                <div>
                  <span className="font-mono text-lg font-black text-purple-300">
                    {avgCriticScore ?? '—'}
                  </span>
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-purple-300/80">
                    Avg Score
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
                className="flex items-center gap-2 rounded-2xl border border-accent/40 bg-accent/15 px-4 py-3 text-xs font-bold text-accent hover:bg-accent hover:text-white transition-all active:scale-95 disabled:opacity-50 cursor-pointer shadow-sm"
                title="Sync wishlist release dates, covers and critic scores with IGDB"
              >
                <RefreshCw
                  className={cn(
                    'size-4',
                    syncWishlistMutation.isPending && 'animate-spin',
                  )}
                />
                <span>{syncWishlistMutation.isPending ? 'Syncing...' : 'Sync Radar'}</span>
              </button>
            </div>
          </div>

          {/* ── Featured Spotlight Hero Banner (When Wishlist Has Games) ── */}
          {spotlightGame && !searchQuery && activeTab === 'all' && (
            <div className="relative mt-6 overflow-hidden rounded-2xl border border-white/15 bg-black/75 p-5 sm:p-6 shadow-xl">
              {spotlightGame.cover_path && (
                <img
                  src={assetUrl(spotlightGame.cover_path) ?? ''}
                  alt=""
                  className="pointer-events-none absolute inset-0 size-full object-cover opacity-25 blur-xl scale-110"
                />
              )}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/90 via-black/75 to-black/50" />

              <div className="relative z-10 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4 sm:gap-5">
                  <div
                    onClick={() => handleCardClick(spotlightGame)}
                    className="relative h-28 w-20 sm:h-32 sm:w-24 shrink-0 cursor-pointer overflow-hidden rounded-xl border border-white/20 bg-surface-raised shadow-2xl"
                  >
                    {spotlightGame.cover_path ? (
                      <img
                        src={assetUrl(spotlightGame.cover_path) ?? ''}
                        alt={spotlightGame.name}
                        className="size-full object-cover transition-transform duration-300 hover:scale-105"
                      />
                    ) : (
                      <div className="flex size-full items-center justify-center text-accent">
                        <Gamepad2 className="size-8" />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-md bg-amber-500 px-2 py-0.5 font-mono text-[9.5px] font-black uppercase tracking-wider text-black">
                        <Flame className="size-3 fill-current" />
                        <span>
                          {isGameUnreleased(spotlightGame.release_date)
                            ? 'NEXT ANTICIPATED LAUNCH'
                            : 'SPOTLIGHT WISHLIST PICK'}
                        </span>
                      </span>
                      {spotlightGame.metacritic_score && (
                        <span className="rounded-md bg-emerald-500/20 border border-emerald-500/40 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-300">
                          MC {Math.round(spotlightGame.metacritic_score)}
                        </span>
                      )}
                    </div>

                    <h2
                      onClick={() => handleCardClick(spotlightGame)}
                      className="cursor-pointer truncate text-xl font-black text-white hover:text-accent transition-colors sm:text-2xl"
                    >
                      {spotlightGame.name}
                    </h2>

                    <p className="text-xs text-white/70">
                      {spotlightGame.developer ?? 'Official Studio'} •{' '}
                      {formatReleaseDate(spotlightGame.release_date)}
                    </p>

                    {spotlightGame.genres.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {spotlightGame.genres.slice(0, 4).map((g) => (
                          <span
                            key={g}
                            className="rounded-lg border border-white/15 bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/90"
                          >
                            {g}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                  {!isGameUnreleased(spotlightGame.release_date) && (
                    <>
                      <button
                        type="button"
                        onClick={(e) => handleDownloadWishlistGame(e, spotlightGame)}
                        className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-accent/25 hover:bg-accent-hover active:scale-95 transition-all cursor-pointer"
                      >
                        <Download className="size-3.5" />
                        <span>Download Now</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handlePromote(e, spotlightGame)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/20 px-4 py-2.5 text-xs font-bold text-emerald-300 hover:bg-emerald-500/30 active:scale-95 transition-all cursor-pointer"
                      >
                        <Plus className="size-3.5" />
                        <span>Move to Library</span>
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => handleCardClick(spotlightGame)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-xs font-bold text-white hover:bg-white/20 active:scale-95 transition-all cursor-pointer"
                  >
                    <ExternalLink className="size-3.5" />
                    <span>Open in Hub</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Filter Tabs, Sort Control & Search Bar ── */}
          <div className="mt-6 flex flex-col gap-3 border-t border-border/60 pt-5 lg:flex-row lg:items-center lg:justify-between">
            {/* Filter Tabs */}
            <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-border/70 bg-bg/80 p-1">
              <button
                type="button"
                onClick={() => {
                  playButtonClick()
                  setActiveTab('all')
                }}
                className={cn(
                  'rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer',
                  activeTab === 'all'
                    ? 'bg-accent text-white shadow-sm'
                    : 'text-subtle hover:text-text hover:bg-surface',
                )}
              >
                All Saved ({wishlistGames.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  playButtonClick()
                  setActiveTab('released')
                }}
                className={cn(
                  'rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer',
                  activeTab === 'released'
                    ? 'bg-emerald-500 text-black shadow-sm'
                    : 'text-subtle hover:text-text hover:bg-surface',
                )}
              >
                Available Now ({releasedCount})
              </button>
              <button
                type="button"
                onClick={() => {
                  playButtonClick()
                  setActiveTab('upcoming')
                }}
                className={cn(
                  'rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer',
                  activeTab === 'upcoming'
                    ? 'bg-amber-500 text-black shadow-sm'
                    : 'text-subtle hover:text-text hover:bg-surface',
                )}
              >
                Upcoming ({upcomingCount})
              </button>
              <button
                type="button"
                onClick={() => {
                  playButtonClick()
                  setActiveTab('acclaimed')
                }}
                className={cn(
                  'rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer',
                  activeTab === 'acclaimed'
                    ? 'bg-purple-500 text-white shadow-sm'
                    : 'text-subtle hover:text-text hover:bg-surface',
                )}
              >
                Top Rated 80+ ({acclaimedCount})
              </button>
            </div>

            {/* Right Controls: Sort + Search */}
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex items-center gap-1.5 rounded-xl border border-border/80 bg-bg/90 px-3 py-1.5 text-xs">
                <ArrowUpDown className="size-3.5 text-accent" />
                <span className="text-subtle font-medium">Sort:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as WishlistSort)}
                  className="bg-transparent font-bold text-text outline-none cursor-pointer"
                >
                  <option value="custom" className="bg-surface text-text">
                    Custom Order
                  </option>
                  <option value="release-soon" className="bg-surface text-text">
                    Release Date
                  </option>
                  <option value="score-desc" className="bg-surface text-text">
                    Highest Score
                  </option>
                  <option value="name" className="bg-surface text-text">
                    Name (A–Z)
                  </option>
                </select>
              </div>

              <div className="relative w-full sm:w-68">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search wishlisted games or studios…"
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
        </div>

        {/* ── 2. Wishlist Grid Content Area ──────────────────────────── */}
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
              {searchQuery ? 'No matching games found' : 'Your Wishlist Radar is Empty'}
            </h3>
            <p className="max-w-md text-xs text-subtle mb-6">
              {searchQuery
                ? 'Try changing your search terms or switching filter tabs.'
                : 'Discover upcoming blockbusters and acclaimed titles in Game Hub and add them to your wishlist to track live release countdowns.'}
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
                const topScore = Math.max(game.metacritic_score ?? 0, game.opencritic_score ?? 0)

                return (
                  <motion.div
                    key={game.id}
                    data-game-id={game.id}
                    layout={draggedId !== null}
                    onPointerDown={(e) => handlePointerDown(game.id, e)}
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{
                      opacity: 0,
                      scale: 0.88,
                      y: -8,
                      transition: { duration: 0.22 * speed, ease: [0.16, 1, 0.3, 1] },
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
                      whileHover={{ y: -5, scale: 1.012 }}
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
                            <span className="px-3 text-center text-xs font-semibold">
                              {game.name}
                            </span>
                          </div>
                        )}

                        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/30 to-transparent pointer-events-none" />

                        {/* Top status bar: pill & critic score */}
                        <div className="absolute left-3 top-3 flex items-center gap-1.5 z-10">
                          {unreleased ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-black/75 px-2.5 py-1 text-[10px] font-bold text-amber-300 backdrop-blur-md shadow-md">
                              <Clock className="size-3" />
                              <span>Upcoming</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/40 bg-black/75 px-2.5 py-1 text-[10px] font-bold text-emerald-300 backdrop-blur-md shadow-md">
                              <CheckCircle2 className="size-3" />
                              <span>Out Now</span>
                            </span>
                          )}

                          {topScore > 0 && (
                            <span
                              title={`Critic Score: ${topScore}`}
                              className={cn(
                                'rounded-md px-1.5 py-0.5 font-mono text-[10px] font-black text-white shadow-md',
                                topScore >= 75
                                  ? 'bg-[#3e9b3e]'
                                  : topScore >= 50
                                    ? 'bg-[#c9a618]'
                                    : 'bg-[#cc3d3d]',
                              )}
                            >
                              ★ {Math.round(topScore)}
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
                            className="flex size-8 items-center justify-center rounded-xl border border-white/10 bg-black/60 text-white/80 backdrop-blur-md transition-all hover:border-accent/50 hover:bg-accent/30 hover:text-white active:scale-90 shadow-md cursor-pointer"
                          >
                            <ImageIcon className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleRequestRemove(e, game)}
                            disabled={deleteMutation.isPending}
                            title="Remove from wishlist"
                            aria-label={`Remove ${game.name} from wishlist`}
                            className="flex size-8 items-center justify-center rounded-xl border border-white/10 bg-black/60 text-subtle backdrop-blur-md transition-all hover:border-red-500/40 hover:bg-red-500/20 hover:text-red-400 active:scale-90 shadow-md cursor-pointer"
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
                          <p className="mt-0.5 truncate text-[11px] text-subtle">
                            {game.developer ?? 'Official Studio'}
                          </p>

                          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted">
                            <Calendar className="size-3 shrink-0 text-accent" />
                            <span className="truncate">{formatReleaseDate(game.release_date)}</span>
                          </div>

                          {/* Genre Chips */}
                          {game.genres.length > 0 && (
                            <div className="mt-2.5 flex flex-wrap gap-1">
                              {game.genres.slice(0, 3).map((genre) => (
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
                        <div className="mt-4 pt-3 border-t border-border/50 flex items-center gap-1.5">
                          {!unreleased ? (
                            <>
                              <button
                                type="button"
                                onClick={(e) => handleDownloadWishlistGame(e, game)}
                                title="Download & Install Game"
                                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-accent px-2.5 py-1.5 text-xs font-bold text-white shadow-sm transition-all hover:bg-accent-hover active:scale-95 cursor-pointer"
                              >
                                <Download className="size-3.5" />
                                <span>Download</span>
                              </button>
                              <button
                                type="button"
                                onClick={(e) => handlePromote(e, game)}
                                disabled={promoteMutation.isPending}
                                title="Move to Library"
                                className="flex items-center justify-center gap-1 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1.5 text-xs font-bold text-emerald-400 transition-all hover:bg-emerald-500 hover:text-black active:scale-95 disabled:opacity-60 cursor-pointer"
                              >
                                <Plus className="size-3.5" />
                                <span>Library</span>
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleCardClick(game)}
                              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-surface-raised px-3 py-1.5 text-xs font-semibold text-text transition-all hover:border-accent hover:text-accent active:scale-95 cursor-pointer"
                            >
                              <ExternalLink className="size-3" />
                              <span>Explore in Hub</span>
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
      </div>

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
                  {displayedRemovalGame.developer ?? 'Official Studio'}
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
