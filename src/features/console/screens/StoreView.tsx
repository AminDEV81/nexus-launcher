import React, { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Sparkles,
  Flame,
  Calendar,
  Tag,
  Search,
  Compass,
  ChevronRight,
  Keyboard,
  X,
  Loader2,
  TrendingUp,
  PlusCircle,
} from 'lucide-react'
import type { HubGame, HubSearchFilters } from '@/types/models'
import {
  useHubHomeFeed,
  useHubDiscountedGames,
  useHubSearch,
  useHubGenres,
  FALLBACK_HUB_GENRES,
} from '@/features/hub/hooks/use-hub'
import { useConsoleStore } from '../store/console-store'
import { CONSOLE_THEMES } from '../theme/tokens'
import { FocusScope, useFocusable } from '../nav/FocusScope'
import { ConsoleRow } from '../ui/Row'
import { ConsoleTile, resolveConsoleHighResUrl } from '../ui/Tile'

export interface StoreViewProps {
  topRated: HubGame[]
  newReleases: HubGame[]
  comingSoon: HubGame[]
  discounted: HubGame[]
  onSelectHubGame: (hubGame: HubGame) => void
}

type StoreCategoryTab = 'all' | 'deals' | 'new' | 'top' | 'soon'

function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), ms)
    return () => window.clearTimeout(id)
  }, [value, ms])
  return debounced
}

const CategoryPillButton: React.FC<{
  id: string
  label: string
  active: boolean
  isLight: boolean
  onSelect: () => void
}> = ({ id, label, active, isLight, onSelect }) => {
  const { focusProps, isFocused } = useFocusable<HTMLButtonElement>({
    id,
    scopeId: 'console_store_header',
    onConfirm: onSelect,
  })
  return (
    <button
      type="button"
      {...focusProps}
      className={`rounded-2xl border px-4 py-2 text-xs font-extrabold uppercase tracking-wider transition-all cursor-pointer ${
        isFocused
          ? 'scale-105 border-cyan-300 bg-cyan-400 text-slate-950 shadow-lg'
          : active
            ? isLight
              ? 'border-indigo-600 bg-indigo-600 text-white'
              : 'border-cyan-400/60 bg-cyan-500/20 text-cyan-300'
            : isLight
              ? 'border-slate-300 bg-white/85 text-slate-700 hover:bg-white'
              : 'border-white/12 bg-white/[0.06] text-slate-300 hover:bg-white/10'
      }`}
    >
      {label}
    </button>
  )
}

export const StoreView: React.FC<StoreViewProps> = ({
  topRated: propTopRated,
  newReleases: propNewReleases,
  comingSoon: propComingSoon,
  discounted: propDiscounted,
  onSelectHubGame,
}) => {
  const themeId = useConsoleStore((s) => s.theme)
  const isLight = Boolean(CONSOLE_THEMES[themeId]?.isLight)
  const openOsk = useConsoleStore((s) => s.openOsk)

  // Requirement #5 & New Task #2: Use the exact same cached React Query hooks as Legacy Mode's HubPage!
  const { newReleases: rqNew, comingSoon: rqSoon, topRated: rqTop, recommended: rqRec } =
    useHubHomeFeed()
  const rqDeals = useHubDiscountedGames(true)
  const genresQuery = useHubGenres()
  const genresList = genresQuery.data ?? FALLBACK_HUB_GENRES

  const newReleases = useMemo(
    () => (rqNew.data?.length ? rqNew.data : propNewReleases),
    [rqNew.data, propNewReleases],
  )
  const topRated = useMemo(
    () => (rqTop.data?.length ? rqTop.data : propTopRated),
    [rqTop.data, propTopRated],
  )
  const comingSoon = useMemo(
    () => (rqSoon.data?.length ? rqSoon.data : propComingSoon),
    [rqSoon.data, propComingSoon],
  )
  const discounted = useMemo(
    () => (rqDeals.data?.length ? rqDeals.data : propDiscounted),
    [rqDeals.data, propDiscounted],
  )
  const recommended = useMemo(() => rqRec.data ?? [], [rqRec.data])

  const [category, setCategory] = useState<StoreCategoryTab>('all')
  const [selectedGenreId, setSelectedGenreId] = useState<number | null>(null)
  const [heroIndex, setHeroIndex] = useState(0)
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebouncedValue(query, 200)

  const searchFilters = useMemo<HubSearchFilters>(
    () => ({
      genreId: selectedGenreId,
      genreIds: selectedGenreId ? [selectedGenreId] : undefined,
    }),
    [selectedGenreId],
  )

  const search = useHubSearch(debouncedQuery, searchFilters)
  const isSearchMode = query.trim().length > 0 || selectedGenreId !== null

  // Pool of all cached shelves (same as HubPage.homeFeedPool) for instant 0ms results while typing!
  const homeFeedPool = useMemo(() => {
    const map = new Map<number, HubGame>()
    for (const list of [discounted, newReleases, topRated, recommended, comingSoon]) {
      for (const g of list) {
        if (g && !map.has(g.igdb_id)) map.set(g.igdb_id, g)
      }
    }
    return Array.from(map.values())
  }, [discounted, newReleases, topRated, recommended, comingSoon])

  const spotlightPool = useMemo(() => homeFeedPool.slice(0, 5), [homeFeedPool])
  const heroGame = spotlightPool[heroIndex % Math.max(1, spotlightPool.length)] ?? null

  // Merge instant local shelf matches + React Query `useHubSearch` pages (exact Legacy HubPage behavior)
  const activeSearchResults = useMemo(() => {
    const q = query.trim().toLowerCase()
    const selectedGenreName = selectedGenreId
      ? genresList.find((g) => g.id === selectedGenreId)?.name.toLowerCase()
      : null

    const localMatches = homeFeedPool.filter((hg) => {
      const nameOk = !q || hg.name.toLowerCase().includes(q) || hg.genres.some((gn) => gn.toLowerCase().includes(q))
      const genreOk =
        !selectedGenreName ||
        hg.genres.some((gn) => gn.toLowerCase().includes(selectedGenreName))
      return nameOk && genreOk
    })

    const remotePages = search.data?.pages.flat() ?? []
    const merged = [...remotePages, ...localMatches]
    const seen = new Set<number>()
    return merged.filter((hg) => {
      if (!hg || seen.has(hg.igdb_id)) return false
      seen.add(hg.igdb_id)
      return true
    })
  }, [query, selectedGenreId, genresList, homeFeedPool, search.data])

  const heroInspectFocus = useFocusable<HTMLButtonElement>({
    id: 'store_hero_inspect_btn',
    scopeId: 'console_store_hero',
    onConfirm: () => {
      if (heroGame) onSelectHubGame(heroGame)
    },
  })

  const keypadBtnFocus = useFocusable<HTMLButtonElement>({
    id: 'store_keypad_trigger_btn',
    scopeId: 'console_store_header',
    onConfirm: () => {
      openOsk('Search Store Catalog', query, (val) => {
        setQuery(val)
      })
    },
  })

  const loadMoreFocus = useFocusable<HTMLButtonElement>({
    id: 'store_search_load_more',
    scopeId: 'console_store_search_grid',
    disabled: !search.hasNextPage || search.isFetchingNextPage,
    onConfirm: () => {
      if (search.hasNextPage && !search.isFetchingNextPage) {
        void search.fetchNextPage()
      }
    },
  })

  const heroBackdrop = resolveConsoleHighResUrl(heroGame?.backdrop_url ?? heroGame?.cover_url)
  const heroScore =
    heroGame?.opencritic_score ??
    heroGame?.metacritic_score ??
    (heroGame?.rating ? Math.round(heroGame.rating) : null)

  return (
    <div className="space-y-6 pb-20">
      {/* Advanced Multi-Pane Store Command Header */}
      <div
        className={`rounded-[2rem] border p-5 shadow-2xl space-y-4 ${
          isLight
            ? 'border-slate-300 bg-white/95'
            : 'border-white/15 bg-gradient-to-b from-[#111931]/95 via-[#0c1326]/95 to-[#090e1c]/95 backdrop-blur-xl'
        }`}
      >
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-cyan-400/20 border border-cyan-400/40 text-cyan-300">
              <Compass className="size-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className={`text-xl font-black tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  Nexus Game Store
                </h1>
                <span className="rounded-full bg-emerald-500/20 border border-emerald-400/40 px-2.5 py-0.5 text-[10px] font-extrabold uppercase text-emerald-300">
                  Unified Hub Search Engine
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {homeFeedPool.length} cached titles ready · Instant IGDB + Steam catalog search
              </p>
            </div>
          </div>

          {/* Unified Fast Search Input Box (Same engine as Legacy HubPage!) */}
          <div className="flex flex-1 max-w-xl items-center gap-2.5 rounded-2xl border border-cyan-400/40 bg-slate-950/85 px-4 py-2.5">
            <Search className="size-4 text-cyan-400 shrink-0" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search any game, franchise, or genre (e.g. GTA, Elden Ring, Cyberpunk)..."
              className="w-full bg-transparent text-sm font-bold text-white placeholder:text-slate-400 outline-none"
            />
            {search.isFetching && <Loader2 className="size-4 animate-spin text-cyan-400 shrink-0" />}
            {(query || selectedGenreId !== null) && (
              <button
                type="button"
                onClick={() => {
                  setQuery('')
                  setSelectedGenreId(null)
                }}
                className="rounded-lg bg-white/10 p-1 text-slate-300 hover:text-white cursor-pointer"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          <FocusScope id="console_store_header" orientation="horizontal" className="flex flex-wrap items-center gap-2">
            <CategoryPillButton
              id="store_cat_all"
              label="Featured"
              active={category === 'all' && !isSearchMode}
              isLight={isLight}
              onSelect={() => {
                setQuery('')
                setSelectedGenreId(null)
                setCategory('all')
              }}
            />
            <CategoryPillButton
              id="store_cat_deals"
              label="Deals"
              active={category === 'deals' && !isSearchMode}
              isLight={isLight}
              onSelect={() => {
                setQuery('')
                setSelectedGenreId(null)
                setCategory('deals')
              }}
            />
            <CategoryPillButton
              id="store_cat_new"
              label="New"
              active={category === 'new' && !isSearchMode}
              isLight={isLight}
              onSelect={() => {
                setQuery('')
                setSelectedGenreId(null)
                setCategory('new')
              }}
            />
            <CategoryPillButton
              id="store_cat_top"
              label="Top Rated"
              active={category === 'top' && !isSearchMode}
              isLight={isLight}
              onSelect={() => {
                setQuery('')
                setSelectedGenreId(null)
                setCategory('top')
              }}
            />
            <CategoryPillButton
              id="store_cat_soon"
              label="Upcoming"
              active={category === 'soon' && !isSearchMode}
              isLight={isLight}
              onSelect={() => {
                setQuery('')
                setSelectedGenreId(null)
                setCategory('soon')
              }}
            />
            <button
              type="button"
              {...keypadBtnFocus.focusProps}
              title="Open Controller Keypad Search"
              className={`flex items-center gap-1.5 rounded-2xl border px-3.5 py-2 text-xs font-extrabold transition-all cursor-pointer ${
                keypadBtnFocus.isFocused
                  ? 'scale-105 border-cyan-300 bg-cyan-400 text-slate-950'
                  : 'border-white/15 bg-white/10 text-white'
              }`}
            >
              <Keyboard className="size-3.5" />
              <span>Keypad</span>
            </button>
          </FocusScope>
        </div>

        {/* Genre Quick Filter Strip (Same genres as Legacy HubPage!) */}
        <FocusScope
          id="console_store_genres"
          orientation="horizontal"
          className="flex items-center gap-2 overflow-x-auto no-scrollbar pt-1"
        >
          {genresList.slice(0, 10).map((g) => (
            <GenreFilterChip
              key={g.id}
              id={`store_genre_${g.id}`}
              label={g.name}
              active={selectedGenreId === g.id}
              isLight={isLight}
              onSelect={() => setSelectedGenreId((prev) => (prev === g.id ? null : g.id))}
            />
          ))}
        </FocusScope>

        {/* Spotlight Hero + Right Thumbnail Selector Strip */}
        {heroGame && !isSearchMode && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch pt-1">
            <div className="lg:col-span-8 relative min-h-[19rem] overflow-hidden rounded-3xl border border-white/15 bg-slate-950">
              <AnimatePresence mode="wait">
                {heroBackdrop && (
                  <motion.img
                    key={heroGame.igdb_id}
                    src={heroBackdrop}
                    alt={heroGame.name}
                    initial={{ opacity: 0, scale: 1.04 }}
                    animate={{ opacity: 0.78, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.38 }}
                    className="absolute inset-0 h-full w-full object-cover object-center saturate-110"
                  />
                )}
              </AnimatePresence>
              <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/75 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent" />

              <div className="relative z-10 flex h-full flex-col justify-between p-7 max-w-2xl">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-cyan-400 px-3 py-1 text-[11px] font-black uppercase text-slate-950">
                    <TrendingUp className="size-3.5" />
                    Spotlight #{heroIndex + 1}
                  </span>
                  {heroGame.discount_percent ? (
                    <span className="rounded-full bg-emerald-400 px-3 py-1 text-[11px] font-black text-slate-950">
                      -{heroGame.discount_percent}% OFF
                    </span>
                  ) : null}
                  {heroGame.sale_price_formatted && (
                    <span className="rounded-full bg-white/15 backdrop-blur-md px-3 py-1 text-xs font-extrabold text-white">
                      {heroGame.sale_price_formatted}
                    </span>
                  )}
                  {heroScore && heroScore > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/25 border border-emerald-400/40 px-3 py-1 text-xs font-extrabold text-emerald-300">
                      <Sparkles className="size-3.5" />
                      Critic {heroScore}
                    </span>
                  ) : null}
                </div>

                <div className="space-y-2 my-3">
                  <h2 className="line-clamp-1 text-3xl md:text-4xl font-black text-white tracking-tight">
                    {heroGame.name}
                  </h2>
                  {heroGame.summary && (
                    <p className="line-clamp-2 text-xs sm:text-sm text-slate-200/90 leading-relaxed">
                      {heroGame.summary}
                    </p>
                  )}
                </div>

                <FocusScope id="console_store_hero" orientation="horizontal" className="flex items-center gap-3">
                  <button
                    type="button"
                    {...heroInspectFocus.focusProps}
                    className={`flex items-center gap-2 rounded-2xl px-6 py-3 text-xs sm:text-sm font-extrabold transition-all cursor-pointer ${
                      heroInspectFocus.isFocused
                        ? 'scale-105 bg-cyan-400 text-slate-950 ring-4 ring-cyan-300/60 shadow-[0_0_30px_rgba(0,229,255,0.6)]'
                        : 'bg-white text-slate-950 hover:bg-cyan-300'
                    }`}
                  >
                    <span>Explore Game in Store</span>
                    <ChevronRight className="size-4" />
                  </button>
                </FocusScope>
              </div>
            </div>

            <FocusScope
              id="console_store_spotlight_strip"
              orientation="vertical"
              className="lg:col-span-4 flex flex-col justify-between gap-2"
            >
              {spotlightPool.map((item, idx) => (
                <SpotlightStripItem
                  key={item.igdb_id}
                  id={`store_spot_item_${idx}`}
                  game={item}
                  active={idx === heroIndex}
                  onHoverOrFocus={() => setHeroIndex(idx)}
                  onSelect={() => onSelectHubGame(item)}
                />
              ))}
            </FocusScope>
          </div>
        )}
      </div>

      {/* Unified Search Results Grid OR Store Shelves */}
      {isSearchMode ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-2">
            <h2 className={`text-xl font-extrabold ${isLight ? 'text-slate-900' : 'text-white'}`}>
              {query.trim()
                ? `Search Results for "${query}" (${activeSearchResults.length})`
                : `Filtered Store Catalog (${activeSearchResults.length})`}
            </h2>
            {search.isFetching && (
              <span className="flex items-center gap-2 text-xs font-bold text-cyan-400">
                <Loader2 className="size-4 animate-spin" />
                Syncing live IGDB catalog...
              </span>
            )}
          </div>

          {activeSearchResults.length === 0 && !search.isFetching ? (
            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-14 text-center text-sm text-slate-400">
              No games found matching your search. Try a shorter keyword or clear genre filters.
            </div>
          ) : (
            <FocusScope
              id="console_store_search_grid"
              orientation="grid"
              className="space-y-12"
            >
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-6 gap-y-16 py-6">
                {activeSearchResults.map((hg) => (
                  <ConsoleTile
                    key={`sr_${hg.igdb_id}`}
                    id={`store_sr_${hg.igdb_id}`}
                    scopeId="console_store_search_grid"
                    hubGame={hg}
                    onSelect={() => onSelectHubGame(hg)}
                  />
                ))}
              </div>

              {search.hasNextPage && (
                <div className="flex justify-center pt-4">
                  <button
                    type="button"
                    {...loadMoreFocus.focusProps}
                    disabled={search.isFetchingNextPage}
                    className={`flex items-center gap-2 rounded-2xl border px-8 py-4 text-sm font-extrabold transition-all cursor-pointer ${
                      loadMoreFocus.isFocused
                        ? 'scale-105 border-cyan-300 bg-cyan-400 text-slate-950 shadow-xl'
                        : 'border-white/15 bg-white/10 text-white'
                    }`}
                  >
                    <PlusCircle className="size-5" />
                    <span>
                      {search.isFetchingNextPage ? 'Loading More...' : 'Load More Store Results'}
                    </span>
                  </button>
                </div>
              )}
            </FocusScope>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {(category === 'all' || category === 'deals') && (
            <ConsoleRow
              rowId="store_deals"
              title="Spotlight Steam Deals"
              subtitle="Verified Live Discounts"
              items={discounted.map((hg) => ({ id: `deal_${hg.igdb_id}`, hubGame: hg }))}
              onSelectGame={() => {}}
              onSelectHubGame={onSelectHubGame}
            />
          )}

          {(category === 'all' || category === 'new') && (
            <ConsoleRow
              rowId="store_new"
              title="Hot New Releases"
              subtitle="Fresh on PC"
              items={newReleases.map((hg) => ({ id: `new_${hg.igdb_id}`, hubGame: hg }))}
              onSelectGame={() => {}}
              onSelectHubGame={onSelectHubGame}
            />
          )}

          {(category === 'all' || category === 'top') && (
            <ConsoleRow
              rowId="store_top"
              title="Critically Acclaimed Hall of Fame"
              subtitle="Highest Metacritic & IGDB Scores"
              items={topRated.map((hg) => ({ id: `top_${hg.igdb_id}`, hubGame: hg }))}
              onSelectGame={() => {}}
              onSelectHubGame={onSelectHubGame}
            />
          )}

          {category === 'all' && recommended.length > 0 && (
            <ConsoleRow
              rowId="store_recommended"
              title="Recommended For You"
              subtitle="Curated Highlights"
              items={recommended.map((hg) => ({ id: `rec_${hg.igdb_id}`, hubGame: hg }))}
              onSelectGame={() => {}}
              onSelectHubGame={onSelectHubGame}
            />
          )}

          {(category === 'all' || category === 'soon') && (
            <ConsoleRow
              rowId="store_soon"
              title="Most Anticipated & Coming Soon"
              subtitle="Pre-release Hype Leaders"
              items={comingSoon.map((hg) => ({ id: `soon_${hg.igdb_id}`, hubGame: hg }))}
              onSelectGame={() => {}}
              onSelectHubGame={onSelectHubGame}
            />
          )}
        </div>
      )}

      <div
        className={`flex flex-wrap items-center gap-6 px-2 text-xs font-semibold ${
          isLight ? 'text-slate-500' : 'text-slate-400'
        }`}
      >
        <span className="flex items-center gap-1.5">
          <Tag className="size-4 text-emerald-400" />
          {discounted.length} Active Deals
        </span>
        <span className="flex items-center gap-1.5">
          <Flame className="size-4 text-amber-400" />
          {topRated.length} Top Rated Classics
        </span>
        <span className="flex items-center gap-1.5">
          <Calendar className="size-4 text-cyan-400" />
          {comingSoon.length} Upcoming Releases
        </span>
      </div>
    </div>
  )
}

const GenreFilterChip: React.FC<{
  id: string
  label: string
  active: boolean
  isLight: boolean
  onSelect: () => void
}> = ({ id, label, active, isLight, onSelect }) => {
  const { focusProps, isFocused } = useFocusable<HTMLButtonElement>({
    id,
    scopeId: 'console_store_genres',
    onConfirm: onSelect,
  })
  return (
    <button
      type="button"
      {...focusProps}
      className={`shrink-0 rounded-xl border px-3 py-1.5 text-[11px] font-bold transition-all cursor-pointer ${
        isFocused
          ? 'scale-105 border-cyan-300 bg-cyan-400 text-slate-950'
          : active
            ? 'border-cyan-400 bg-cyan-500/25 text-cyan-200'
            : isLight
              ? 'border-slate-200 bg-slate-100 text-slate-700'
              : 'border-white/10 bg-white/[0.04] text-slate-300'
      }`}
    >
      {label}
    </button>
  )
}

const SpotlightStripItem: React.FC<{
  id: string
  game: HubGame
  active: boolean
  onHoverOrFocus: () => void
  onSelect: () => void
}> = ({ id, game, active, onHoverOrFocus, onSelect }) => {
  const { focusProps, isFocused } = useFocusable<HTMLButtonElement>({
    id,
    scopeId: 'console_store_spotlight_strip',
    onFocus: onHoverOrFocus,
    onConfirm: onSelect,
  })
  const thumb = resolveConsoleHighResUrl(game.cover_url ?? game.backdrop_url)

  return (
    <button
      type="button"
      {...focusProps}
      onMouseEnter={onHoverOrFocus}
      className={`flex items-center gap-3 rounded-2xl border p-2.5 text-left transition-all cursor-pointer ${
        isFocused
          ? 'scale-[1.02] border-cyan-300 bg-cyan-400 text-slate-950 shadow-lg'
          : active
            ? 'border-cyan-400/50 bg-white/15 text-white'
            : 'border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/10'
      }`}
    >
      <div className="h-11 w-9 shrink-0 overflow-hidden rounded-lg bg-slate-800">
        {thumb && <img src={thumb} alt={game.name} className="h-full w-full object-cover" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-extrabold">{game.name}</p>
        <p className={`truncate text-[10px] ${isFocused ? 'text-slate-800' : 'text-cyan-300'}`}>
          {game.sale_price_formatted || game.genres.slice(0, 2).join(' · ') || 'Featured'}
        </p>
      </div>
      {game.discount_percent ? (
        <span className="shrink-0 rounded-md bg-emerald-400 px-1.5 py-0.5 text-[10px] font-black text-slate-950">
          -{game.discount_percent}%
        </span>
      ) : null}
    </button>
  )
}
