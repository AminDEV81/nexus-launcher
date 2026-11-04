import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Award,
  ChevronRight,
  Clock,
  Compass,
  Flame,
  Gamepad2,
  Heart,
  Keyboard,
  Loader2,
  PlusCircle,
  RefreshCw,
  Search,
  Shuffle,
  Sparkles,
  Tag,
  TrendingUp,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import type { HubGame, HubSearchFilters } from '@/types/models'
import {
  FALLBACK_HUB_GENRES,
  HUB_CACHE_TTL_MS,
  useHubDiscountedGames,
  useHubGenres,
  useHubHomeFeed,
  useHubSearch,
  useRefreshHubCatalog,
} from '@/features/hub/hooks/use-hub'
import { useQuery } from '@tanstack/react-query'
import { addGameToWishlist, getHubGameDetails } from '@/services/hub'
import { useConsoleStore } from '../store/console-store'
import { CONSOLE_THEMES } from '../theme/tokens'
import { FocusScope, useFocusable } from '../nav/FocusScope'
import { ConsoleRow } from '../ui/Row'
import {
  buildBannerFallbackChain,
  buildCoverFallbackChain,
} from '@/features/hub/utils/cover-fallback'
import { ConsoleTile, resolveConsoleHighResUrl } from '../ui/Tile'

export interface StoreViewProps {
  topRated: HubGame[]
  newReleases: HubGame[]
  comingSoon: HubGame[]
  discounted: HubGame[]
  onSelectHubGame: (hubGame: HubGame) => void
  onWishlistUpdated?: () => void
}

type StoreCategoryTab = 'all' | 'deals' | 'new' | 'top' | 'soon'

const AUTO_SYNC_STORAGE_KEY = 'nexus_console_store_last_auto_sync_ts'

function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), ms)
    return () => window.clearTimeout(id)
  }, [value, ms])
  return debounced
}

function hasValidStoreCover(hg: HubGame | null | undefined): boolean {
  if (!hg) return false
  return Boolean(
    (hg.cover_url && hg.cover_url.trim().length > 0) ||
      (hg.backdrop_url && hg.backdrop_url.trim().length > 0) ||
      (hg.steam_app_id && String(hg.steam_app_id).trim().length > 0),
  )
}

/**
 * Normalizes a game title into its canonical identity key so duplicate Store entries
 * (e.g. same game from IGDB + Steam Specials with different prices or edition suffixes)
 * are always merged into a single card.
 */
const ROMAN_MAP: Record<string, string> = {
  ii: '2',
  iii: '3',
  iv: '4',
  v: '5',
  vi: '6',
  vii: '7',
  viii: '8',
  ix: '9',
  x: '10',
  xi: '11',
  xii: '12',
  xiii: '13',
  xiv: '14',
  xv: '15',
  xvi: '16',
}

export function normalizeCanonicalStoreTitle(rawName: string): string {
  const cleaned = rawName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[™®©]/g, '')
    .replace(
      /\s*[-–—:(]?\s*\b(?:complete\s+edition|deluxe\s+edition|ultimate\s+edition|definitive\s+edition|game\s+of\s+the\s+year\s+edition|goty\s+edition|director'?s\s+cut|digital\s+deluxe|standard\s+edition|remastered|the\s+final\s+cut)\b.*$/i,
      '',
    )
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  if (!cleaned) return ''
  return cleaned
    .split(/\s+/)
    .map((tok, idx) => (idx > 0 && ROMAN_MAP[tok] ? ROMAN_MAP[tok] : tok))
    .join(' ')
}

function parseFormattedPrice(priceStr?: string | null): number | null {
  if (!priceStr) return null
  const m = priceStr.match(/(\d+(?:\.\d+)?)/)
  if (!m) return null
  const val = Number.parseFloat(m[1])
  return Number.isFinite(val) ? val : null
}

/**
 * Deduplicates a list of `HubGame` items by `igdb_id`, `steam_app_id`, AND canonical normalized title.
 * When two entries represent the same game with different prices, merges them keeping the richest metadata
 * and the lowest sale price / best discount.
 */
export function dedupeAndMergeStoreGames(items: HubGame[]): HubGame[] {
  const byCanonKey = new Map<string, HubGame>()
  const steamIdToKey = new Map<string, string>()
  const igdbIdToKey = new Map<number, string>()

  for (const item of items) {
    if (!hasValidStoreCover(item)) continue
    const canonName = normalizeCanonicalStoreTitle(item.name)
    if (!canonName) continue

    const steamKey = item.steam_app_id ? String(item.steam_app_id).trim() : ''
    const existingKey =
      igdbIdToKey.get(item.igdb_id) ||
      (steamKey ? steamIdToKey.get(steamKey) : undefined) ||
      (byCanonKey.has(canonName) ? canonName : undefined)

    if (!existingKey) {
      byCanonKey.set(canonName, { ...item })
      igdbIdToKey.set(item.igdb_id, canonName)
      if (steamKey) steamIdToKey.set(steamKey, canonName)
      continue
    }

    const prev = byCanonKey.get(existingKey)!
    const prevPrice = parseFormattedPrice(prev.sale_price_formatted)
    const currPrice = parseFormattedPrice(item.sale_price_formatted)

    const pickCurrPrice =
      (currPrice !== null && prevPrice === null) ||
      (currPrice !== null && prevPrice !== null && currPrice < prevPrice) ||
      ((item.discount_percent ?? 0) > (prev.discount_percent ?? 0) && currPrice !== null)

    const preferCurrIdentity =
      prev.igdb_id >= 1_000_000_000 && item.igdb_id > 0 && item.igdb_id < 1_000_000_000

    const merged: HubGame = {
      ...(preferCurrIdentity ? item : prev),
      igdb_id: preferCurrIdentity ? item.igdb_id : prev.igdb_id,
      name: preferCurrIdentity ? item.name : prev.name,
      summary:
        prev.summary && prev.summary.length > (item.summary?.length ?? 0)
          ? prev.summary
          : (item.summary ?? prev.summary),
      release_date: prev.release_date ?? item.release_date,
      cover_url: prev.cover_url ?? item.cover_url,
      backdrop_url: prev.backdrop_url ?? item.backdrop_url,
      rating: Math.max(prev.rating ?? 0, item.rating ?? 0) || null,
      rating_count: Math.max(prev.rating_count ?? 0, item.rating_count ?? 0) || null,
      metacritic_score: prev.metacritic_score ?? item.metacritic_score,
      opencritic_score: prev.opencritic_score ?? item.opencritic_score,
      genres: prev.genres.length >= item.genres.length ? prev.genres : item.genres,
      platforms: prev.platforms.length >= item.platforms.length ? prev.platforms : item.platforms,
      steam_app_id: prev.steam_app_id ?? item.steam_app_id,
      discount_percent: pickCurrPrice
        ? (item.discount_percent ?? prev.discount_percent)
        : (prev.discount_percent ?? item.discount_percent),
      sale_price_formatted: pickCurrPrice
        ? (item.sale_price_formatted ?? prev.sale_price_formatted)
        : (prev.sale_price_formatted ?? item.sale_price_formatted),
      original_price_formatted: pickCurrPrice
        ? (item.original_price_formatted ?? prev.original_price_formatted)
        : (prev.original_price_formatted ?? item.original_price_formatted),
    }

    byCanonKey.set(existingKey, merged)
    igdbIdToKey.set(item.igdb_id, existingKey)
    if (steamKey) steamIdToKey.set(steamKey, existingKey)
  }

  return Array.from(byCanonKey.values())
}

/**
 * Builds up to 4 distinct widescreen preview frames for the Featured & Recommended right-hand gallery.
 */
function getImageIdentitySignature(url: string): string {
  try {
    const clean = url.split('?')[0].toLowerCase()
    const igdbMatch = clean.match(/\/([a-z0-9]+)\.(?:jpg|png|webp)$/)
    if (clean.includes('images.igdb.com') && igdbMatch?.[1]) {
      return `igdb:${igdbMatch[1]}`
    }
    const steamAsset = clean.split('/').pop() || clean
    return `asset:${steamAsset}`
  } catch {
    return url
  }
}

function buildHeroPreviewFrames(
  game: HubGame | null,
  detailScreenshots: string[] = [],
): string[] {
  if (!game) return []
  const frames: string[] = []
  const seenSigs = new Set<string>()

  const addDistinct = (rawUrl: string | null | undefined) => {
    const resolved = resolveConsoleHighResUrl(rawUrl)
    if (!resolved) return
    const sig = getImageIdentitySignature(resolved)
    if (seenSigs.has(sig)) return
    seenSigs.add(sig)
    frames.push(resolved)
  }

  // 1. Prioritize distinct in-game screenshots from HubGameDetails
  for (const shot of detailScreenshots) {
    addDistinct(shot)
    if (frames.length >= 4) return frames
  }

  // 2. Add primary widescreen backdrop
  addDistinct(game.backdrop_url)

  // 3. Add distinct Steam store visual assets (each is a different artwork composition, not a mirror of header.jpg)
  const resolvedAppId =
    game.steam_app_id ||
    (game.igdb_id > 1_000_000_000 ? String(game.igdb_id - 1_000_000_000) : null)
  if (resolvedAppId) {
    addDistinct(
      `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${resolvedAppId}/library_hero.jpg`,
    )
    addDistinct(
      `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${resolvedAppId}/page_bg_raw.jpg`,
    )
    addDistinct(
      `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${resolvedAppId}/capsule_616x353.jpg`,
    )
    addDistinct(
      `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${resolvedAppId}/header.jpg`,
    )
  }

  addDistinct(game.cover_url)
  return frames.slice(0, 4)
}

/**
 * Multi-CDN resilient image component for Store cards, banners, and thumbnails.
 * Automatically steps through `buildBannerFallbackChain` / `buildCoverFallbackChain` on 404.
 */
const StoreSmartImage: React.FC<{
  game: HubGame
  preferredUrl?: string | null
  mode?: 'banner' | 'poster'
  className?: string
}> = ({ game, preferredUrl, mode = 'banner', className = 'h-full w-full object-cover' }) => {
  const candidates = useMemo(() => {
    const base =
      mode === 'banner'
        ? buildBannerFallbackChain(
            resolveConsoleHighResUrl(preferredUrl ?? game.backdrop_url),
            resolveConsoleHighResUrl(game.cover_url),
            game.steam_app_id,
            game.igdb_id,
          )
        : buildCoverFallbackChain(
            resolveConsoleHighResUrl(preferredUrl ?? game.cover_url),
            resolveConsoleHighResUrl(game.backdrop_url),
            game.steam_app_id,
            game.igdb_id,
          )
    return base
  }, [game.backdrop_url, game.cover_url, game.steam_app_id, game.igdb_id, preferredUrl, mode])

  const [idx, setIdx] = useState(0)
  useEffect(() => {
    setIdx(0)
  }, [candidates])

  const src = candidates[idx] ?? null
  if (!src) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 p-2 text-center">
        <span className="line-clamp-2 text-[10px] font-bold text-slate-300">{game.name}</span>
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={game.name}
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setIdx((prev) => prev + 1)}
      className={className}
    />
  )
}

const CategoryNavTab: React.FC<{
  id: string
  label: string
  badge?: number
  active: boolean
  isLight: boolean
  onSelect: () => void
}> = ({ id, label, badge, active, isLight, onSelect }) => {
  const { focusProps, isFocused } = useFocusable<HTMLButtonElement>({
    id,
    scopeId: 'console_store_header',
    onConfirm: onSelect,
  })
  return (
    <button
      type="button"
      {...focusProps}
      className={`relative flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-bold tracking-wide transition-all cursor-pointer outline-none ${
        isFocused
          ? 'scale-105 bg-cyan-400 text-slate-950 shadow-md ring-2 ring-white'
          : active
            ? isLight
              ? 'bg-white text-slate-900 shadow-2xs'
              : 'bg-white/15 text-white shadow-2xs'
            : isLight
              ? 'text-slate-600 hover:text-slate-900'
              : 'text-slate-400 hover:text-white'
      }`}
    >
      <span>{label}</span>
      {badge !== undefined && badge > 0 && (
        <span
          className={`font-mono text-[10px] font-bold tabular-nums ${
            isFocused
              ? 'text-slate-950'
              : active
                ? isLight
                  ? 'text-indigo-600'
                  : 'text-cyan-300'
                : 'opacity-60'
          }`}
        >
          {badge}
        </span>
      )}
    </button>
  )
}

export const StoreView: React.FC<StoreViewProps> = ({
  topRated: propTopRated,
  newReleases: propNewReleases,
  comingSoon: propComingSoon,
  discounted: propDiscounted,
  onSelectHubGame,
  onWishlistUpdated,
}) => {
  const themeId = useConsoleStore((s) => s.theme)
  const isLight = Boolean(CONSOLE_THEMES[themeId]?.isLight)
  const openOsk = useConsoleStore((s) => s.openOsk)

  const { newReleases: rqNew, comingSoon: rqSoon, topRated: rqTop, recommended: rqRec } =
    useHubHomeFeed()
  const rqDeals = useHubDiscountedGames(true)
  const genresQuery = useHubGenres()
  const refreshCatalog = useRefreshHubCatalog()
  const genresList = genresQuery.data ?? FALLBACK_HUB_GENRES

  const discounted = useMemo(
    () => dedupeAndMergeStoreGames((rqDeals.data?.length ? rqDeals.data : propDiscounted) ?? []),
    [rqDeals.data, propDiscounted],
  )
  const newReleases = useMemo(
    () => dedupeAndMergeStoreGames((rqNew.data?.length ? rqNew.data : propNewReleases) ?? []),
    [rqNew.data, propNewReleases],
  )
  const topRated = useMemo(
    () => dedupeAndMergeStoreGames((rqTop.data?.length ? rqTop.data : propTopRated) ?? []),
    [rqTop.data, propTopRated],
  )
  const comingSoon = useMemo(
    () => dedupeAndMergeStoreGames((rqSoon.data?.length ? rqSoon.data : propComingSoon) ?? []),
    [rqSoon.data, propComingSoon],
  )
  const recommended = useMemo(
    () => dedupeAndMergeStoreGames(rqRec.data ?? []),
    [rqRec.data],
  )

  const [category, setCategory] = useState<StoreCategoryTab>('all')
  const [selectedGenreId, setSelectedGenreId] = useState<number | null>(null)
  const [heroIndex, setHeroIndex] = useState(0)
  const [activePreviewFrame, setActivePreviewFrame] = useState<string | null>(null)
  const [shuffleSeed, setShuffleSeed] = useState(0)
  const [query, setQuery] = useState('')
  const [wishlistingHero, setWishlistingHero] = useState(false)
  const debouncedQuery = useDebouncedValue(query, 120)

  const handleSyncLive = useCallback(
    async (silent = false) => {
      if (refreshCatalog.isPending) return
      try {
        await refreshCatalog.mutateAsync()
        localStorage.setItem(AUTO_SYNC_STORAGE_KEY, String(Date.now()))
        if (!silent) {
          toast.success('Synced live Store catalog, Steam deals & upcoming releases!')
        }
      } catch {
        if (!silent) {
          toast.error('Could not sync live store catalog right now')
        }
      }
    },
    [refreshCatalog],
  )

  useEffect(() => {
    try {
      const lastTs = Number(localStorage.getItem(AUTO_SYNC_STORAGE_KEY) || '0')
      if (!lastTs || Date.now() - lastTs >= HUB_CACHE_TTL_MS) {
        localStorage.setItem(AUTO_SYNC_STORAGE_KEY, String(Date.now()))
        void handleSyncLive(true)
      }
    } catch {
      // Ignore storage access errors
    }
    const id = window.setInterval(() => {
      void handleSyncLive(true)
    }, HUB_CACHE_TTL_MS)
    return () => window.clearInterval(id)
  }, [handleSyncLive])

  const searchFilters = useMemo<HubSearchFilters>(
    () => ({
      genreId: selectedGenreId,
      genreIds: selectedGenreId ? [selectedGenreId] : undefined,
    }),
    [selectedGenreId],
  )

  const search = useHubSearch(debouncedQuery, searchFilters)
  const isSearchMode = query.trim().length > 0 || selectedGenreId !== null

  const homeFeedPool = useMemo(
    () =>
      dedupeAndMergeStoreGames([
        ...discounted,
        ...newReleases,
        ...topRated,
        ...recommended,
        ...comingSoon,
      ]),
    [discounted, newReleases, topRated, recommended, comingSoon],
  )

  const spotlightPool = useMemo(() => {
    if (homeFeedPool.length === 0) return []
    if (shuffleSeed === 0) return homeFeedPool.slice(0, 5)
    const rotated = [...homeFeedPool]
    const offset = shuffleSeed % rotated.length
    return [...rotated.slice(offset), ...rotated.slice(0, offset)].slice(0, 5)
  }, [homeFeedPool, shuffleSeed])

  const [heroPaused, setHeroPaused] = useState(false)
  const heroGame = spotlightPool[heroIndex % Math.max(1, spotlightPool.length)] ?? null

  const { data: heroDetails } = useQuery({
    queryKey: ['console-store-hero-details', heroGame?.igdb_id, heroGame?.name],
    queryFn: () =>
      heroGame ? getHubGameDetails(heroGame.igdb_id, heroGame.name) : Promise.resolve(null),
    enabled: Boolean(heroGame),
    staleTime: 1000 * 60 * 15,
  })

  const heroFrames = useMemo(
    () => buildHeroPreviewFrames(heroGame, heroDetails?.screenshot_urls ?? []),
    [heroGame, heroDetails?.screenshot_urls],
  )

  // Auto-advance spotlight hero every 10 seconds (10,000ms) when not paused/hovered
  useEffect(() => {
    if (isSearchMode || heroPaused || spotlightPool.length <= 1) return
    const timer = window.setInterval(() => {
      setHeroIndex((prev) => (prev + 1) % spotlightPool.length)
    }, 10000)
    return () => window.clearInterval(timer)
  }, [isSearchMode, heroPaused, spotlightPool.length])

  useEffect(() => {
    setActivePreviewFrame(null)
    if (heroGame) {
      useConsoleStore
        .getState()
        .setFocusedBackdropUrl(heroGame.backdrop_url ?? heroGame.cover_url)
    }
  }, [heroGame])

  const activeSearchResults = useMemo(() => {
    const q = query.trim().toLowerCase()
    const selectedGenreName = selectedGenreId
      ? genresList.find((g) => g.id === selectedGenreId)?.name.toLowerCase()
      : null

    const localMatches = homeFeedPool.filter((hg) => {
      const nameOk =
        !q ||
        hg.name.toLowerCase().includes(q) ||
        hg.genres.some((gn) => gn.toLowerCase().includes(q))
      const genreOk =
        !selectedGenreName ||
        hg.genres.some((gn) => gn.toLowerCase().includes(selectedGenreName))
      return nameOk && genreOk
    })

    const remotePages = (search.data?.pages.flat() ?? []).filter(hasValidStoreCover)
    const merged = remotePages.length > 0 ? [...remotePages, ...localMatches] : localMatches
    return dedupeAndMergeStoreGames(merged)
  }, [query, selectedGenreId, genresList, homeFeedPool, search.data])

  const heroInspectFocus = useFocusable<HTMLButtonElement>({
    id: 'store_hero_inspect_btn',
    scopeId: 'console_store_hero',
    onConfirm: () => {
      if (heroGame) onSelectHubGame(heroGame)
    },
  })

  const heroWishlistFocus = useFocusable<HTMLButtonElement>({
    id: 'store_hero_wishlist_btn',
    scopeId: 'console_store_hero',
    onConfirm: () => {
      if (!heroGame || wishlistingHero) return
      setWishlistingHero(true)
      addGameToWishlist(heroGame.igdb_id)
        .then(() => {
          toast.success(`Added ${heroGame.name} to your Wishlist!`)
          onWishlistUpdated?.()
        })
        .catch(() => {
          toast.error('Could not add to Wishlist')
        })
        .finally(() => setWishlistingHero(false))
    },
  })

  const syncLiveBtnFocus = useFocusable<HTMLButtonElement>({
    id: 'store_sync_live_btn',
    scopeId: 'console_store_header',
    onConfirm: () => {
      void handleSyncLive(false)
    },
  })

  const shuffleBtnFocus = useFocusable<HTMLButtonElement>({
    id: 'store_shuffle_picks_btn',
    scopeId: 'console_store_header',
    onConfirm: () => {
      setShuffleSeed((prev) => prev + 3)
      setHeroIndex(0)
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

  const heroBackdrop =
    activePreviewFrame ??
    resolveConsoleHighResUrl(heroGame?.backdrop_url ?? heroGame?.cover_url)
  const heroScore =
    heroGame?.opencritic_score ??
    heroGame?.metacritic_score ??
    (heroGame?.rating ? Math.round(heroGame.rating) : null)

  const isSyncing =
    refreshCatalog.isPending ||
    rqNew.isFetching ||
    rqDeals.isFetching ||
    rqTop.isFetching ||
    rqSoon.isFetching

  return (
    <div className="space-y-6 pb-20">
      {/* 1. Minimalist Architectural Store Navigation & Search Header */}
      <div className="space-y-3">
        <FocusScope
          id="console_store_header"
          orientation="horizontal"
          className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-2.5 backdrop-blur-xl ${
            isLight
              ? 'border-slate-200/90 bg-white/88 shadow-[0_8px_30px_rgba(15,23,42,0.06)]'
              : 'border-white/10 bg-[#0b1020]/82 shadow-xl'
          }`}
        >
          {/* Left: Minimalist Segmented Navigation */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-2 pr-1">
              <div
                className={`flex size-8 items-center justify-center rounded-xl border ${
                  isLight
                    ? 'bg-indigo-50 border-indigo-200 text-indigo-600'
                    : 'bg-cyan-500/15 border-cyan-400/30 text-cyan-300'
                }`}
              >
                <Compass className="size-4" />
              </div>
              <span
                className={`text-sm font-black tracking-tight ${
                  isLight ? 'text-slate-900' : 'text-white'
                }`}
              >
                Store
              </span>
            </div>

            <div
              className={`flex flex-wrap items-center gap-1 rounded-xl p-1 ${
                isLight
                  ? 'bg-slate-100 border border-slate-200/80'
                  : 'bg-black/35 border border-white/8'
              }`}
            >
              <CategoryNavTab
                id="store_cat_all"
                label="Discover"
                active={category === 'all' && !isSearchMode}
                isLight={isLight}
                onSelect={() => {
                  setQuery('')
                  setSelectedGenreId(null)
                  setCategory('all')
                }}
              />
              <CategoryNavTab
                id="store_cat_deals"
                label="Specials"
                badge={discounted.length}
                active={category === 'deals' && !isSearchMode}
                isLight={isLight}
                onSelect={() => {
                  setQuery('')
                  setSelectedGenreId(null)
                  setCategory('deals')
                }}
              />
              <CategoryNavTab
                id="store_cat_new"
                label="New & Trending"
                badge={newReleases.length}
                active={category === 'new' && !isSearchMode}
                isLight={isLight}
                onSelect={() => {
                  setQuery('')
                  setSelectedGenreId(null)
                  setCategory('new')
                }}
              />
              <CategoryNavTab
                id="store_cat_top"
                label="Top Rated"
                badge={topRated.length}
                active={category === 'top' && !isSearchMode}
                isLight={isLight}
                onSelect={() => {
                  setQuery('')
                  setSelectedGenreId(null)
                  setCategory('top')
                }}
              />
              <CategoryNavTab
                id="store_cat_soon"
                label="Upcoming"
                badge={comingSoon.length}
                active={category === 'soon' && !isSearchMode}
                isLight={isLight}
                onSelect={() => {
                  setQuery('')
                  setSelectedGenreId(null)
                  setCategory('soon')
                }}
              />
            </div>
          </div>

          {/* Center & Right: Minimal Search Input + Live Sync + Shuffle */}
          <div className="flex flex-1 sm:flex-initial items-center justify-end gap-2">
            <div
              className={`flex flex-1 sm:w-72 items-center gap-2 rounded-xl border px-3 py-1.5 ${
                isLight
                  ? 'border-slate-200 bg-slate-100/90'
                  : 'border-white/10 bg-black/40'
              }`}
            >
              <Search
                className={`size-3.5 shrink-0 ${
                  isLight ? 'text-slate-500' : 'text-slate-400'
                }`}
              />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search store, deals, genres..."
                className={`w-full bg-transparent text-xs font-semibold outline-none ${
                  isLight
                    ? 'text-slate-900 placeholder:text-slate-400'
                    : 'text-white placeholder:text-slate-500'
                }`}
              />
              {search.isFetching && (
                <Loader2
                  className={`size-3.5 animate-spin shrink-0 ${
                    isLight ? 'text-indigo-600' : 'text-cyan-400'
                  }`}
                />
              )}
              {(query || selectedGenreId !== null) && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('')
                    setSelectedGenreId(null)
                  }}
                  className={`cursor-pointer ${
                    isLight
                      ? 'text-slate-400 hover:text-slate-900'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <X className="size-3.5" />
                </button>
              )}
              <button
                type="button"
                {...keypadBtnFocus.focusProps}
                title="Open On-Screen Keypad"
                className={`rounded-lg px-1.5 py-0.5 text-[10px] font-bold uppercase transition-all cursor-pointer shrink-0 ${
                  keypadBtnFocus.isFocused
                    ? 'bg-cyan-400 text-slate-950 scale-105'
                    : isLight
                      ? 'bg-white text-slate-600 border border-slate-200'
                      : 'bg-white/10 text-slate-300'
                }`}
              >
                <Keyboard className="size-3" />
              </button>
            </div>

            <button
              type="button"
              {...syncLiveBtnFocus.focusProps}
              disabled={isSyncing}
              title="Sync Live Store Catalog"
              className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition-all cursor-pointer outline-none ${
                syncLiveBtnFocus.isFocused
                  ? 'scale-105 border-cyan-300 bg-cyan-400 text-slate-950 shadow-md'
                  : isLight
                    ? 'border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200'
                    : 'border-white/10 bg-white/[0.06] text-slate-200 hover:bg-white/10'
              }`}
            >
              <RefreshCw className={`size-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{isSyncing ? 'Syncing' : 'Sync'}</span>
            </button>

            <button
              type="button"
              {...shuffleBtnFocus.focusProps}
              title="Shuffle Spotlight"
              className={`flex size-8 items-center justify-center rounded-xl border transition-all cursor-pointer outline-none ${
                shuffleBtnFocus.isFocused
                  ? 'scale-105 border-cyan-300 bg-cyan-400 text-slate-950 shadow-md'
                  : isLight
                    ? 'border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200'
                    : 'border-white/10 bg-white/[0.06] text-slate-200 hover:bg-white/10'
              }`}
            >
              <Shuffle className="size-3.5" />
            </button>
          </div>
        </FocusScope>

        {/* Minimalist Category / Genre Filter Strip */}
        <FocusScope
          id="console_store_genres"
          orientation="horizontal"
          className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 px-1"
        >
          <GenreFilterChip
            id="store_genre_all_reset"
            label="All Categories"
            active={selectedGenreId === null}
            isLight={isLight}
            onSelect={() => setSelectedGenreId(null)}
          />
          {genresList.slice(0, 12).map((g) => (
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
      </div>

      {/* 2. Next-Gen Steam "Featured & Recommended" Split Showcase Deck */}
      {heroGame && !isSearchMode && (
        <div className="space-y-2.5">
          <div
            onMouseEnter={() => setHeroPaused(true)}
            onMouseLeave={() => setHeroPaused(false)}
            className={`grid grid-cols-1 lg:grid-cols-12 overflow-hidden rounded-3xl border shadow-2xl ${
              isLight
                ? 'border-slate-200/95 bg-white/95 shadow-[0_18px_50px_rgba(15,23,42,0.08)]'
                : 'border-white/10 bg-[#0b1020]/90'
            }`}
          >
            {/* Main Widescreen Stage (Right 8 Columns on Desktop) */}
            <div className="relative lg:order-2 lg:col-span-8 min-h-[19.5rem] sm:min-h-[21.5rem] overflow-hidden bg-slate-950 flex flex-col justify-between p-6">
              <AnimatePresence mode="wait">
                <motion.div
                  key={`${heroGame.igdb_id}_${heroBackdrop ?? "default"}`}
                  initial={{ opacity: 0, scale: 1.03 }}
                  animate={{ opacity: 0.88, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.35 }}
                  className="absolute inset-0 h-full w-full"
                >
                  <StoreSmartImage
                    game={heroGame}
                    preferredUrl={heroBackdrop}
                    mode="banner"
                    className="h-full w-full object-cover object-center"
                  />
                </motion.div>
              </AnimatePresence>

              {/* Clean architectural gradients over the main stage */}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/92 via-black/35 to-black/15" />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/75 via-transparent to-transparent" />

              {/* Top Floating Stage Badges */}
              <div className="relative z-10 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 border border-white/20 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white backdrop-blur-md">
                    <TrendingUp className="size-3 text-cyan-300" />
                    Featured &amp; Recommended
                  </span>
                  {heroGame.discount_percent ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400 px-2.5 py-1 text-[10px] font-black uppercase text-slate-950 shadow">
                      -{heroGame.discount_percent}% Special
                    </span>
                  ) : null}
                </div>

                {heroScore && heroScore > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/40 bg-black/70 px-3 py-1 text-xs font-black text-emerald-300 backdrop-blur-md">
                    <Sparkles className="size-3" />
                    {heroScore}
                  </span>
                ) : null}
              </div>

              {/* Bottom Left Stage Info + CTAs */}
              <div className="relative z-10 max-w-2xl space-y-3 pt-10">
                <h2 className="line-clamp-1 text-2xl sm:text-4xl font-black tracking-tight text-white drop-shadow">
                  {heroGame.name}
                </h2>

                {heroGame.summary && (
                  <p className="line-clamp-2 text-xs sm:text-sm text-slate-200/90 leading-relaxed max-w-xl">
                    {heroGame.summary}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <FocusScope
                    id="console_store_hero"
                    orientation="horizontal"
                    className="flex flex-wrap items-center gap-2.5"
                  >
                    <button
                      type="button"
                      {...heroInspectFocus.focusProps}
                      className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs sm:text-sm font-black transition-all cursor-pointer outline-none ${
                        heroInspectFocus.isFocused
                          ? 'scale-105 bg-cyan-400 text-slate-950 ring-3 ring-white shadow-xl'
                          : 'bg-white text-slate-950 hover:bg-cyan-300'
                      }`}
                    >
                      <span>Explore Game</span>
                      <ChevronRight className="size-4" />
                    </button>

                    <button
                      type="button"
                      {...heroWishlistFocus.focusProps}
                      disabled={wishlistingHero}
                      className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-bold transition-all cursor-pointer outline-none ${
                        heroWishlistFocus.isFocused
                          ? 'scale-105 border-amber-300 bg-amber-400 text-slate-950 shadow-lg'
                          : 'border-white/25 bg-white/10 text-white backdrop-blur-md hover:bg-white/20'
                      }`}
                    >
                      <Heart className="size-3.5 text-rose-400" />
                      <span>{wishlistingHero ? 'Saving...' : 'Wishlist'}</span>
                    </button>
                  </FocusScope>
                </div>
              </div>
            </div>

            {/* Left 4 Columns: 4-Screenshot Interactive Gallery & Live Telemetry Panel */}
            <div
              className={`lg:order-1 lg:col-span-4 flex flex-col justify-between p-5 border-t lg:border-t-0 lg:border-r ${
                isLight
                  ? 'border-slate-200/90 bg-slate-50/70'
                  : 'border-white/10 bg-[#0d1428]/65'
              }`}
            >
              <div className="space-y-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`text-[10px] font-black uppercase tracking-widest ${
                      isLight ? 'text-slate-500' : 'text-slate-400'
                    }`}
                  >
                    4 In-Game Screenshots · 10s Auto
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] font-bold ${
                      isLight ? 'text-emerald-700' : 'text-emerald-300'
                    }`}
                  >
                    <Gamepad2 className="size-3" />
                    Controller Verified
                  </span>
                </div>

                {/* 2x2 Widescreen Preview Frames (Hovering previews on main stage like Steam!) */}
                <div className="grid grid-cols-2 gap-2">
                  {heroFrames.map((frameUrl, idx) => {
                    const isCurrentFrame =
                      activePreviewFrame === frameUrl || (!activePreviewFrame && idx === 0)
                    return (
                      <button
                        key={idx}
                        type="button"
                        onMouseEnter={() => setActivePreviewFrame(frameUrl)}
                        onMouseLeave={() => setActivePreviewFrame(null)}
                        onClick={() => onSelectHubGame(heroGame)}
                        className={`group relative aspect-[16/9] overflow-hidden rounded-xl border transition-all cursor-pointer ${
                          isCurrentFrame
                            ? isLight
                              ? 'border-indigo-500 ring-2 ring-indigo-500/30'
                              : 'border-cyan-400 ring-2 ring-cyan-400/35'
                            : isLight
                              ? 'border-slate-200 opacity-85 hover:opacity-100'
                              : 'border-white/10 opacity-75 hover:opacity-100'
                        }`}
                      >
                        <StoreSmartImage
                          game={heroGame}
                          preferredUrl={frameUrl}
                          mode="banner"
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      </button>
                    )
                  })}
                </div>

                {/* Genre Pills */}
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  {heroGame.genres.slice(0, 4).map((gn) => (
                    <span
                      key={gn}
                      className={`rounded-lg px-2.5 py-0.5 text-[10px] font-bold ${
                        isLight
                          ? 'bg-white border border-slate-200 text-slate-700'
                          : 'bg-white/[0.06] border border-white/8 text-slate-300'
                      }`}
                    >
                      {gn}
                    </span>
                  ))}
                </div>
              </div>

              {/* Bottom Telemetry & Price Box inside Right Panel */}
              <div
                className={`mt-4 flex items-center justify-between rounded-2xl border p-3 ${
                  isLight
                    ? 'border-slate-200 bg-white shadow-2xs'
                    : 'border-white/10 bg-black/35'
                }`}
              >
                <div>
                  <p
                    className={`text-[10px] font-bold uppercase tracking-wider ${
                      isLight ? 'text-slate-400' : 'text-slate-500'
                    }`}
                  >
                    {heroGame.release_date ? `Release · ${heroGame.release_date}` : 'Store Edition'}
                  </p>
                  <p
                    className={`text-xs font-extrabold mt-0.5 ${
                      isLight ? 'text-slate-800' : 'text-slate-200'
                    }`}
                  >
                    {heroScore ? `Critic Rating: ${heroScore}/100` : 'Official Store Listing'}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {heroGame.discount_percent && heroGame.discount_percent > 0 ? (
                    <span className="rounded-lg bg-emerald-400 px-2 py-1 font-mono text-xs font-black text-slate-950">
                      -{heroGame.discount_percent}%
                    </span>
                  ) : null}
                  <div className="text-right">
                    {heroGame.original_price_formatted && heroGame.discount_percent ? (
                      <p
                        className={`font-mono text-[10px] line-through leading-none ${
                          isLight ? 'text-slate-400' : 'text-slate-500'
                        }`}
                      >
                        {heroGame.original_price_formatted}
                      </p>
                    ) : null}
                    <p
                      className={`font-mono text-sm font-black ${
                        heroGame.discount_percent
                          ? isLight
                            ? 'text-emerald-700'
                            : 'text-emerald-300'
                          : isLight
                            ? 'text-slate-900'
                            : 'text-white'
                      }`}
                    >
                      {heroGame.sale_price_formatted || 'View Price'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 5-Game Minimalist Spotlight Switcher Strip */}
          <FocusScope
            id="console_store_spotlight_strip"
            orientation="horizontal"
            className="grid grid-cols-2 sm:grid-cols-5 gap-2.5"
          >
            {spotlightPool.map((item, idx) => (
              <SpotlightDockCard
                key={item.igdb_id}
                id={`store_spot_item_${idx}`}
                game={item}
                active={idx === heroIndex}
                isLight={isLight}
                onHoverOrFocus={() => setHeroIndex(idx)}
                onSelect={() => onSelectHubGame(item)}
              />
            ))}
          </FocusScope>
        </div>
      )}

      {/* 3. Unified Search Results OR Multi-Section Steam Storefront */}
      {isSearchMode ? (
        <div className="space-y-6 pb-20">
          <div className="flex items-center justify-between px-2">
            <h2 className={`text-lg font-extrabold ${isLight ? 'text-slate-900' : 'text-white'}`}>
              {query.trim()
                ? `Search Results for "${query}" (${activeSearchResults.length})`
                : `Filtered Store Catalog (${activeSearchResults.length})`}
            </h2>
            {search.isFetching && (
              <span
                className={`flex items-center gap-2 text-xs font-bold ${
                  isLight ? 'text-indigo-600' : 'text-cyan-400'
                }`}
              >
                <Loader2 className="size-4 animate-spin" />
                Searching live catalog...
              </span>
            )}
          </div>

          {activeSearchResults.length === 0 && !search.isFetching ? (
            <div
              className={`rounded-3xl border p-12 text-center text-sm ${
                isLight
                  ? 'border-slate-200 bg-white/90 text-slate-600 shadow-xs'
                  : 'border-white/10 bg-white/[0.04] text-slate-400'
              }`}
            >
              No games with verified artwork found matching your search. Try another keyword or clear genre filters.
            </div>
          ) : (
            <FocusScope
              id="console_store_search_grid"
              orientation="grid"
              className="space-y-14 pb-16"
            >
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-5 gap-y-16 pt-4 pb-14 justify-items-center">
                {activeSearchResults.map((hg) => (
                  <ConsoleTile
                    key={`sr_${hg.igdb_id}`}
                    id={`store_sr_${hg.igdb_id}`}
                    scopeId="console_store_search_grid"
                    hubGame={hg}
                    onFocusTile={() =>
                      useConsoleStore
                        .getState()
                        .setFocusedBackdropUrl(hg.backdrop_url ?? hg.cover_url)
                    }
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
                    className={`flex items-center gap-2 rounded-2xl border px-7 py-3.5 text-sm font-extrabold transition-all cursor-pointer ${
                      loadMoreFocus.isFocused
                        ? 'scale-105 border-cyan-300 bg-cyan-400 text-slate-950 shadow-xl'
                        : isLight
                          ? 'border-slate-300 bg-white text-slate-900 hover:bg-slate-100 shadow-sm'
                          : 'border-white/15 bg-white/10 text-white'
                    }`}
                  >
                    <PlusCircle className="size-4" />
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
        <div className="space-y-7">
          {/* Section A: Steam "Special Offers" Widescreen Deal Bento Grid */}
          {(category === 'all' || category === 'deals') && discounted.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-2.5">
                  <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-400 text-slate-950">
                    <Tag className="size-4" />
                  </span>
                  <div>
                    <h2
                      className={`text-base font-black tracking-tight ${
                        isLight ? 'text-slate-900' : 'text-white'
                      }`}
                    >
                      Special Offers &amp; Spotlight Deals
                    </h2>
                  </div>
                </div>
                {category === 'all' && (
                  <button
                    type="button"
                    onClick={() => setCategory('deals')}
                    className={`text-xs font-bold cursor-pointer ${
                      isLight
                        ? 'text-indigo-600 hover:text-indigo-800'
                        : 'text-cyan-300 hover:text-white'
                    }`}
                  >
                    View All {discounted.length} Deals →
                  </button>
                )}
              </div>

              <FocusScope
                id="console_store_bento_deals"
                orientation="grid"
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5"
              >
                {discounted.slice(0, category === 'deals' ? 12 : 4).map((hg) => (
                  <SteamDealBentoCard
                    key={`bento_deal_${hg.igdb_id}`}
                    id={`store_bento_deal_${hg.igdb_id}`}
                    game={hg}
                    isLight={isLight}
                    onSelect={() => onSelectHubGame(hg)}
                    onWishlistUpdated={onWishlistUpdated}
                  />
                ))}
              </FocusScope>
            </section>
          )}

          {/* Section B: Steam-Style 3-Column Interactive Top Charts (Trending | Top Rated | Upcoming) */}
          {category === 'all' && (
            <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <StoreChartColumn
                scopeId="store_chart_trending"
                title="New & Trending"
                subtitle="Hot Releases"
                icon={<Flame className="size-4 text-rose-400" />}
                items={newReleases.slice(0, 5)}
                isLight={isLight}
                onSelect={onSelectHubGame}
                onViewAll={() => setCategory('new')}
              />
              <StoreChartColumn
                scopeId="store_chart_top"
                title="Top Rated Hall of Fame"
                subtitle="Highest Critic Scores"
                icon={<Award className="size-4 text-amber-400" />}
                items={topRated.slice(0, 5)}
                isLight={isLight}
                onSelect={onSelectHubGame}
                onViewAll={() => setCategory('top')}
              />
              <StoreChartColumn
                scopeId="store_chart_soon"
                title="Most Anticipated"
                subtitle="Upcoming Radar"
                icon={<Clock className="size-4 text-cyan-400" />}
                items={comingSoon.slice(0, 5)}
                isLight={isLight}
                onSelect={onSelectHubGame}
                onViewAll={() => setCategory('soon')}
              />
            </section>
          )}

          {/* Section C: Full Horizontal Curated Shelves */}
          <div className="space-y-3">
            {(category === 'all' || category === 'deals') && (
              <ConsoleRow
                rowId="store_deals"
                title="All Live Steam Discounts"
                subtitle="Deduplicated Best Prices"
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
                title="Critically Acclaimed Catalog"
                subtitle="Metacritic & OpenCritic Leaders"
                items={topRated.map((hg) => ({ id: `top_${hg.igdb_id}`, hubGame: hg }))}
                onSelectGame={() => {}}
                onSelectHubGame={onSelectHubGame}
              />
            )}

            {category === 'all' && recommended.length > 0 && (
              <ConsoleRow
                rowId="store_recommended"
                title="Recommended For You"
                subtitle="Widescreen Highlights"
                variant="landscape"
                items={recommended.map((hg) => ({ id: `rec_${hg.igdb_id}`, hubGame: hg }))}
                onSelectGame={() => {}}
                onSelectHubGame={onSelectHubGame}
              />
            )}

            {(category === 'all' || category === 'soon') && (
              <ConsoleRow
                rowId="store_soon"
                title="Coming Soon & Pre-Release"
                subtitle="Release Radar"
                items={comingSoon.map((hg) => ({ id: `soon_${hg.igdb_id}`, hubGame: hg }))}
                onSelectGame={() => {}}
                onSelectHubGame={onSelectHubGame}
              />
            )}
          </div>
        </div>
      )}
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
      className={`shrink-0 rounded-xl border px-3 py-1 text-[11px] font-bold transition-all cursor-pointer outline-none ${
        isFocused
          ? 'scale-105 border-cyan-300 bg-cyan-400 text-slate-950 shadow-sm'
          : active
            ? isLight
              ? 'border-slate-900 bg-slate-900 text-white shadow-2xs'
              : 'border-cyan-400/60 bg-cyan-400/20 text-cyan-200'
            : isLight
              ? 'border-slate-200/90 bg-white/85 text-slate-600 hover:text-slate-900 hover:bg-white'
              : 'border-white/8 bg-white/[0.04] text-slate-400 hover:bg-white/10 hover:text-white'
      }`}
    >
      {label}
    </button>
  )
}

/**
 * Minimalist horizontal capsule in the 5-item Spotlight Queue Strip below the Hero.
 */
const SpotlightDockCard: React.FC<{
  id: string
  game: HubGame
  active: boolean
  isLight: boolean
  onHoverOrFocus: () => void
  onSelect: () => void
}> = ({ id, game, active, isLight, onHoverOrFocus, onSelect }) => {
  const { focusProps, isFocused } = useFocusable<HTMLButtonElement>({
    id,
    scopeId: 'console_store_spotlight_strip',
    onFocus: onHoverOrFocus,
    onConfirm: onSelect,
  })
  return (
    <button
      type="button"
      {...focusProps}
      onMouseEnter={onHoverOrFocus}
      className={`group relative flex items-center gap-2.5 overflow-hidden rounded-2xl border p-2 text-left transition-all cursor-pointer outline-none ${
        isFocused
          ? 'scale-[1.03] border-cyan-400 ring-2 ring-cyan-400 shadow-lg'
          : active
            ? isLight
              ? 'border-indigo-500 bg-white shadow-sm'
              : 'border-cyan-400/60 bg-white/12 shadow-md'
            : isLight
              ? 'border-slate-200/90 bg-white/75 opacity-80 hover:opacity-100'
              : 'border-white/8 bg-[#0b1020]/70 opacity-75 hover:opacity-100'
      }`}
    >
      <div className="h-11 w-18 shrink-0 overflow-hidden rounded-xl bg-slate-900">
        <StoreSmartImage
          game={game}
          mode="banner"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-xs font-extrabold ${
            isLight ? 'text-slate-900' : 'text-white'
          }`}
        >
          {game.name}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5">
          {game.discount_percent ? (
            <span className="rounded bg-emerald-400 px-1 py-0.2 font-mono text-[9px] font-black text-slate-950">
              -{game.discount_percent}%
            </span>
          ) : null}
          <span
            className={`truncate font-mono text-[10px] font-bold ${
              isLight ? 'text-slate-500' : 'text-slate-400'
            }`}
          >
            {game.sale_price_formatted || 'Spotlight'}
          </span>
        </div>
      </div>
    </button>
  )
}

/**
 * Steam-inspired Widescreen Special Offer Bento Card.
 */
const SteamDealBentoCard: React.FC<{
  id: string
  game: HubGame
  isLight: boolean
  onSelect: () => void
  onWishlistUpdated?: () => void
}> = ({ id, game, isLight, onSelect, onWishlistUpdated }) => {
  const { focusProps, isFocused } = useFocusable<HTMLButtonElement>({
    id,
    scopeId: 'console_store_bento_deals',
    onFocus: () => {
      useConsoleStore
        .getState()
        .setFocusedBackdropUrl(game.backdrop_url ?? game.cover_url)
    },
    onConfirm: onSelect,
  })

  const score =
    game.opencritic_score ??
    game.metacritic_score ??
    (game.rating ? Math.round(game.rating) : null)

  return (
    <button
      type="button"
      {...focusProps}
      onMouseEnter={() => {
        useConsoleStore
          .getState()
          .setFocusedBackdropUrl(game.backdrop_url ?? game.cover_url)
      }}
      className={`group relative flex flex-col justify-between overflow-hidden rounded-2xl border text-left transition-all duration-200 cursor-pointer outline-none ${
        isFocused
          ? 'scale-[1.02] border-cyan-400 ring-2 ring-cyan-400/50 shadow-xl'
          : isLight
            ? 'border-slate-200/95 bg-white/95 hover:border-slate-300 shadow-[0_6px_20px_rgba(15,23,42,0.05)]'
            : 'border-white/10 bg-[#0b1020]/85 hover:border-white/20 shadow-lg'
      }`}
    >
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-slate-900">
        <StoreSmartImage
          game={game}
          mode="banner"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent" />

        {score && score > 0 ? (
          <span className="absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-full border border-white/20 bg-black/75 px-2 py-0.5 text-[10px] font-black text-emerald-300 backdrop-blur-md">
            <Sparkles className="size-2.5" />
            {score}
          </span>
        ) : null}

        <div className="absolute inset-x-3 bottom-2.5">
          <p className="truncate text-sm font-black text-white drop-shadow">{game.name}</p>
          <p className="truncate text-[10px] font-medium text-slate-300">
            {game.genres.slice(0, 2).join(' · ') || 'Special Offer'}
          </p>
        </div>
      </div>

      {/* Steam Signature Discount + Price Strip */}
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <div className="flex items-center gap-2">
          {game.discount_percent && game.discount_percent > 0 ? (
            <span className="rounded-lg bg-emerald-400 px-2 py-1 font-mono text-xs font-black text-slate-950">
              -{game.discount_percent}%
            </span>
          ) : null}
          <div className="leading-tight">
            {game.original_price_formatted && game.discount_percent ? (
              <span
                className={`block font-mono text-[10px] line-through ${
                  isLight ? 'text-slate-400' : 'text-slate-500'
                }`}
              >
                {game.original_price_formatted}
              </span>
            ) : null}
            <span
              className={`font-mono text-xs font-black ${
                game.discount_percent
                  ? isLight
                    ? 'text-emerald-700'
                    : 'text-emerald-300'
                  : isLight
                    ? 'text-slate-900'
                    : 'text-white'
              }`}
            >
              {game.sale_price_formatted || 'Special Deal'}
            </span>
          </div>
        </div>

        <span
          onClick={(e) => {
            e.stopPropagation()
            addGameToWishlist(game.igdb_id)
              .then(() => {
                toast.success(`Added ${game.name} to Wishlist!`)
                onWishlistUpdated?.()
              })
              .catch(() => {})
          }}
          title="Add to Wishlist"
          className={`flex size-7 items-center justify-center rounded-lg border transition-colors ${
            isLight
              ? 'border-slate-200 bg-slate-100 text-slate-500 hover:text-rose-600 hover:bg-rose-50'
              : 'border-white/10 bg-white/[0.05] text-slate-400 hover:text-rose-400'
          }`}
        >
          <Heart className="size-3.5" />
        </span>
      </div>
    </button>
  )
}

/**
 * Steam-inspired Interactive Top Charts Column (5 numbered compact horizontal capsules).
 */
const StoreChartColumn: React.FC<{
  scopeId: string
  title: string
  subtitle: string
  icon: React.ReactNode
  items: HubGame[]
  isLight: boolean
  onSelect: (game: HubGame) => void
  onViewAll: () => void
}> = ({ scopeId, title, subtitle, icon, items, isLight, onSelect, onViewAll }) => {
  if (items.length === 0) return null
  return (
    <div
      className={`flex flex-col justify-between rounded-2xl border p-4 ${
        isLight
          ? 'border-slate-200/95 bg-white/92 shadow-[0_6px_22px_rgba(15,23,42,0.05)]'
          : 'border-white/10 bg-[#0b1020]/82 shadow-lg'
      }`}
    >
      <div>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {icon}
            <div>
              <h3
                className={`text-sm font-black tracking-tight ${
                  isLight ? 'text-slate-900' : 'text-white'
                }`}
              >
                {title}
              </h3>
              <p className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                {subtitle}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onViewAll}
            className={`text-[11px] font-bold cursor-pointer ${
              isLight
                ? 'text-indigo-600 hover:text-indigo-800'
                : 'text-cyan-300 hover:text-white'
            }`}
          >
            More →
          </button>
        </div>

        <FocusScope id={scopeId} orientation="vertical" className="space-y-1.5">
          {items.map((game, idx) => (
            <StoreChartRowItem
              key={game.igdb_id}
              id={`${scopeId}_item_${game.igdb_id}`}
              scopeId={scopeId}
              rank={idx + 1}
              game={game}
              isLight={isLight}
              onSelect={() => onSelect(game)}
            />
          ))}
        </FocusScope>
      </div>
    </div>
  )
}

const StoreChartRowItem: React.FC<{
  id: string
  scopeId: string
  rank: number
  game: HubGame
  isLight: boolean
  onSelect: () => void
}> = ({ id, scopeId, rank, game, isLight, onSelect }) => {
  const { focusProps, isFocused } = useFocusable<HTMLButtonElement>({
    id,
    scopeId,
    onFocus: () => {
      useConsoleStore
        .getState()
        .setFocusedBackdropUrl(game.backdrop_url ?? game.cover_url)
    },
    onConfirm: onSelect,
  })

  const score =
    game.opencritic_score ??
    game.metacritic_score ??
    (game.rating ? Math.round(game.rating) : null)

  return (
    <button
      type="button"
      {...focusProps}
      onMouseEnter={() => {
        useConsoleStore
          .getState()
          .setFocusedBackdropUrl(game.backdrop_url ?? game.cover_url)
      }}
      className={`flex w-full items-center justify-between gap-2.5 rounded-xl border p-2 text-left transition-all cursor-pointer outline-none ${
        isFocused
          ? isLight
            ? 'scale-[1.015] border-indigo-500 bg-indigo-50/90 text-slate-900 shadow-sm'
            : 'scale-[1.015] border-cyan-400 bg-cyan-400/15 text-white shadow-md'
          : isLight
            ? 'border-transparent bg-slate-50/80 hover:bg-slate-100 text-slate-900'
            : 'border-transparent bg-white/[0.03] hover:bg-white/[0.07] text-white'
      }`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <span
          className={`w-4 text-center font-mono text-[10px] font-bold shrink-0 ${
            isLight ? 'text-slate-400' : 'text-slate-500'
          }`}
        >
          {rank}
        </span>
        <div className="h-10 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-900">
          <StoreSmartImage game={game} mode="banner" className="h-full w-full object-cover" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs font-extrabold">{game.name}</p>
          <p
            className={`truncate text-[10px] ${
              isLight ? 'text-slate-500' : 'text-slate-400'
            }`}
          >
            {game.genres.slice(0, 2).join(' · ') || game.release_date || 'PC'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {game.discount_percent ? (
          <span className="rounded bg-emerald-400 px-1.5 py-0.5 font-mono text-[10px] font-black text-slate-950">
            -{game.discount_percent}%
          </span>
        ) : null}
        {game.sale_price_formatted ? (
          <span
            className={`font-mono text-[11px] font-black ${
              game.discount_percent
                ? isLight
                  ? 'text-emerald-700'
                  : 'text-emerald-300'
                : isLight
                  ? 'text-slate-800'
                  : 'text-slate-200'
            }`}
          >
            {game.sale_price_formatted}
          </span>
        ) : score && score > 0 ? (
          <span
            className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] font-black ${
              isLight
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-emerald-500/15 text-emerald-300'
            }`}
          >
            ★ {score}
          </span>
        ) : null}
      </div>
    </button>
  )
}
