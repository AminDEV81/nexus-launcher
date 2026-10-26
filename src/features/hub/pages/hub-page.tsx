import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowRight,
  ArrowUpDown,
  Award,
  Calendar,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Compass,
  Cpu,
  EyeOff,
  Flame,
  Gamepad2,
  Layers,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  Shuffle,
  SlidersHorizontal,
  Sparkles,
  Star,
  Swords,
  Tag,
  TrendingUp,
  Trophy,
  Users,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  useHubGenres,
  useHubHomeFeed,
  useHubPlatforms,
  useHubSearch,
  useRefreshHubCatalog,
} from '../hooks/use-hub'
import { HUB_FEEDS, type HubFeedId } from '../feeds'
import { useHubSearchStore } from '../store/hub-search-store'
import { HubFeaturedHero } from '../components/hub-featured-hero'
import { HubScoreBadge } from '../components/hub-score-badge'
import { HubGameCard } from '../components/hub-game-card'
import { HubFeedSkeleton } from '../components/hub-game-skeleton'
import { MissingKeysPanel } from '../components/missing-keys-panel'
import { HubOfflinePanel } from '../components/hub-offline-panel'
import { isMissingIgdbKeys } from '../utils/is-missing-keys'
import { useUserTasteProfile } from '../hooks/use-personalization'
import { calculateGameAffinity } from '../utils/personalization'
import { useGames } from '@/features/library/hooks/use-games'
import { useSettings } from '@/features/settings/hooks/use-settings'
import {
  buildHubLibraryMatcher,
  buildHubWishlistMatcher,
  buildHubInstalledMatcher,
  buildHubMemoryMatcher,
  type HubLibraryMatcher,
} from '../utils/in-library'
import { useAnimationSpeed } from '@/hooks/use-animation-speed'
import { useAppearanceSettingsStore } from '@/store/appearance-settings-store'
import { localDateKey } from '@/features/library/utils/format'
import type { HubGame } from '@/types/models'

const SEARCH_DEBOUNCE_MS = 120

type DropdownKey =
  | 'sort'
  | 'genres'
  | 'platforms'
  | 'release'
  | 'rating'
  | 'edition'
  | null

const RELEASE_OPTIONS = [
  { key: 'upcoming', label: 'Upcoming Releases', shortLabel: 'Upcoming', icon: Clock },
  { key: 'new', label: 'New Releases (90d)', shortLabel: 'New (90d)', icon: Sparkles },
  { key: 'last-year', label: 'Last 12 Months', shortLabel: 'Last Year', icon: Calendar },
  { key: 'last-3-years', label: 'Last 3 Years', shortLabel: 'Last 3Y', icon: Calendar },
] as const

const ERA_OPTIONS = [
  { key: '2020-2026', label: '2020s Modern Era', years: '2020 – 2026' },
  { key: '2010-2019', label: '2010s Golden Era', years: '2010 – 2019' },
  { key: '2000-2009', label: '2000s Classics', years: '2000 – 2009' },
  { key: '1990-1999', label: '90s Retro Legends', years: '1990 – 1999' },
] as const

const SINGLE_YEARS = ['2026', '2025', '2024', '2023', '2022', '2021', '2020'] as const

const RATING_OPTIONS = [
  {
    value: 90,
    label: '90+ Masterpiece',
    desc: 'Universal acclaim & must-play classics',
    badgeClass: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400',
  },
  {
    value: 85,
    label: '85+ Acclaimed',
    desc: 'Top-tier critic & community favorites',
    badgeClass: 'border-emerald-500/35 bg-emerald-500/10 text-emerald-400',
  },
  {
    value: 80,
    label: '80+ Great',
    desc: 'Highly recommended standout titles',
    badgeClass: 'border-cyan-500/40 bg-cyan-500/15 text-cyan-400',
  },
  {
    value: 75,
    label: '75+ Good',
    desc: 'Well-received games with strong reviews',
    badgeClass: 'border-amber-500/40 bg-amber-500/15 text-amber-400',
  },
  {
    value: 70,
    label: '70+ Solid',
    desc: 'Enjoyable titles worth exploring',
    badgeClass: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  },
] as const

const SORT_OPTIONS = [
  {
    key: 'popularity',
    label: 'Most Popular',
    shortLabel: 'Most Popular',
    desc: 'Ordered by community rating volume & buzz',
    icon: Flame,
  },
  {
    key: 'rating',
    label: 'Highest Rated',
    shortLabel: 'Highest Rated',
    desc: 'Top critic & player aggregated scores first',
    icon: Trophy,
  },
  {
    key: 'hypes',
    label: 'Most Hyped / Trending',
    shortLabel: 'Most Hyped',
    desc: 'Pre-release followers & trending momentum',
    icon: TrendingUp,
  },
  {
    key: 'newest',
    label: 'Release Date: Newest',
    shortLabel: 'Newest First',
    desc: 'Latest releases & newest launches first',
    icon: Sparkles,
  },
  {
    key: 'oldest',
    label: 'Release Date: Oldest',
    shortLabel: 'Oldest First',
    desc: 'Chronological order from earliest classics',
    icon: Clock,
  },
  {
    key: 'name',
    label: 'Name: A → Z',
    shortLabel: 'Name A → Z',
    desc: 'Alphabetical title ordering',
    icon: ArrowUpDown,
  },
] as const

const GAME_CATEGORY_OPTIONS = [
  { key: 'all', label: 'All Editions', desc: 'Main games, remakes, remasters, and expansions' },
  { key: 'main', label: 'Main & Standalone Games', desc: 'Full standalone releases & major remakes' },
  { key: 'remake', label: 'Remakes, Remasters & Definitive', desc: 'Combined Remakes, HD Remasters & Director’s Cuts' },
  { key: 'expansion', label: 'Expansions, DLC & Special Editions', desc: 'Story expansions, standalone DLC & Complete Editions' },
] as const

const GAME_MODE_OPTIONS = [
  { key: 'all', label: 'All Play Modes' },
  { key: 'singleplayer', label: 'Singleplayer' },
  { key: 'multiplayer', label: 'Multiplayer' },
  { key: 'coop', label: 'Co-op' },
  { key: 'splitscreen', label: 'Split-Screen' },
] as const

/** Curated top-bar quick genre chips with verified IGDB genre IDs. */
const QUICK_GENRES = [
  { label: 'Hack & Slash', id: 25, match: 'hack and slash' },
  { label: 'RPG', id: 12, match: 'role-playing' },
  { label: 'Shooter', id: 5, match: 'shooter' },
  { label: 'Adventure', id: 31, match: 'adventure' },
  { label: 'Strategy', id: 15, match: 'strategy' },
  { label: 'Indie', id: 32, match: 'indie' },
  { label: 'Simulator', id: 13, match: 'simulator' },
  { label: 'Racing', id: 10, match: 'racing' },
  { label: 'Fighting', id: 4, match: 'fighting' },
  { label: 'Puzzle', id: 9, match: 'puzzle' },
  { label: 'Platformer', id: 8, match: 'platform' },
] as const

const FALLBACK_DYNAMIC_SUGGESTIONS: Array<{
  igdb_id?: number
  term: string
  tag: string
  score?: number
  cover?: string
}> = [
  { igdb_id: 119133, term: 'Elden Ring', tag: 'Action RPG • 2022', score: 96, cover: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1245620/library_600x900_2x.jpg' },
  { igdb_id: 1877, term: 'Cyberpunk 2077', tag: 'Sci-Fi RPG • 2020', score: 86, cover: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1091500/library_600x900_2x.jpg' },
  { igdb_id: 1942, term: 'The Witcher 3: Wild Hunt', tag: 'Dark Fantasy RPG • 2015', score: 93, cover: 'https://cdn.cloudflare.steamstatic.com/steam/apps/292030/library_600x900_2x.jpg' },
  { igdb_id: 119171, term: "Baldur's Gate 3", tag: 'CRPG Masterpiece • 2023', score: 96, cover: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1086940/library_600x900_2x.jpg' },
  { igdb_id: 25076, term: 'Red Dead Redemption 2', tag: 'Open World Epic • 2018', score: 97, cover: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1174180/library_600x900_2x.jpg' },
  { igdb_id: 204359, term: 'Black Myth: Wukong', tag: 'Action Mythology • 2024', score: 82, cover: 'https://cdn.cloudflare.steamstatic.com/steam/apps/2358720/library_600x900_2x.jpg' },
  { igdb_id: 305152, term: 'Clair Obscur: Expedition 33', tag: 'Turn-Based RPG • 2025', score: 92, cover: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1903340/header.jpg' },
  { igdb_id: 279661, term: 'Kingdom Come: Deliverance II', tag: 'Medieval RPG • 2025', score: 89, cover: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1771300/library_600x900_2x.jpg' },
  { igdb_id: 279650, term: 'Monster Hunter Wilds', tag: 'Co-op Action RPG • 2025', score: 89, cover: 'https://cdn.cloudflare.steamstatic.com/steam/apps/2246340/library_600x900_2x.jpg' },
  { igdb_id: 112875, term: 'God of War Ragnarök', tag: 'Norse Action Epic • 2022', score: 94, cover: 'https://cdn.cloudflare.steamstatic.com/steam/apps/2322010/library_600x900_2x.jpg' },
  { igdb_id: 221560, term: "Ghost of Tsushima Director's Cut", tag: 'Samurai Open World • 2024', score: 89, cover: 'https://cdn.cloudflare.steamstatic.com/steam/apps/2215430/library_600x900_2x.jpg' },
  { igdb_id: 219588, term: 'Silent Hill 2', tag: 'Psychological Horror • 2024', score: 86, cover: 'https://cdn.cloudflare.steamstatic.com/steam/apps/2124490/library_600x900_2x.jpg' },
  { igdb_id: 196867, term: 'Resident Evil 4', tag: 'Survival Horror • 2023', score: 93, cover: 'https://cdn.cloudflare.steamstatic.com/steam/apps/2050650/library_600x900_2x.jpg' },
  { igdb_id: 252651, term: 'Metaphor: ReFantazio', tag: 'Fantasy JRPG • 2024', score: 94, cover: 'https://cdn.cloudflare.steamstatic.com/steam/apps/2679460/library_600x900_2x.jpg' },
  { igdb_id: 228530, term: 'Hades II', tag: 'Roguelike Action • 2024', score: 90, cover: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1145350/library_600x900_2x.jpg' },
  { igdb_id: 1020, term: 'Grand Theft Auto V', tag: 'Action / Open World', score: 97, cover: 'https://cdn.cloudflare.steamstatic.com/steam/apps/271590/library_600x900_2x.jpg' },
  { igdb_id: 76882, term: 'Sekiro: Shadows Die Twice', tag: 'Shinobi Action • 2019', score: 90, cover: 'https://cdn.cloudflare.steamstatic.com/steam/apps/814380/library_600x900_2x.jpg' },
  { igdb_id: 250619, term: 'Helldivers 2', tag: 'Co-op Shooter • 2024', score: 83, cover: 'https://cdn.cloudflare.steamstatic.com/steam/apps/553850/library_600x900_2x.jpg' },
]

const DROPDOWN_SPRING = {
  type: 'spring' as const,
  stiffness: 460,
  damping: 32,
  mass: 0.65,
}

function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), ms)
    return () => window.clearTimeout(id)
  }, [value, ms])
  return debounced
}

export function HubPage() {
  const navigate = useNavigate()
  const query = useHubSearchStore((s) => s.query)
  const setQuery = useHubSearchStore((s) => s.setQuery)
  const genreId = useHubSearchStore((s) => s.genreId)
  const genreIds = useHubSearchStore((s) => s.genreIds)
  const toggleGenreId = useHubSearchStore((s) => s.toggleGenreId)
  const setGenreIds = useHubSearchStore((s) => s.setGenreIds)
  const platformId = useHubSearchStore((s) => s.platformId)
  const platformIds = useHubSearchStore((s) => s.platformIds)
  const togglePlatformId = useHubSearchStore((s) => s.togglePlatformId)
  const setPlatformIds = useHubSearchStore((s) => s.setPlatformIds)
  const release = useHubSearchStore((s) => s.release)
  const setRelease = useHubSearchStore((s) => s.setRelease)
  const yearFrom = useHubSearchStore((s) => s.yearFrom)
  const yearTo = useHubSearchStore((s) => s.yearTo)
  const setYearRange = useHubSearchStore((s) => s.setYearRange)
  const minRating = useHubSearchStore((s) => s.minRating)
  const setMinRating = useHubSearchStore((s) => s.setMinRating)
  const sort = useHubSearchStore((s) => s.sort)
  const setSort = useHubSearchStore((s) => s.setSort)
  const gameCategory = useHubSearchStore((s) => s.gameCategory)
  const setGameCategory = useHubSearchStore((s) => s.setGameCategory)
  const gameMode = useHubSearchStore((s) => s.gameMode)
  const setGameMode = useHubSearchStore((s) => s.setGameMode)
  const onlyReleased = useHubSearchStore((s) => s.onlyReleased)
  const setOnlyReleased = useHubSearchStore((s) => s.setOnlyReleased)
  const onSale = useHubSearchStore((s) => s.onSale)
  const setOnSale = useHubSearchStore((s) => s.setOnSale)
  const hideInLibrary = useHubSearchStore((s) => s.hideInLibrary)
  const setHideInLibrary = useHubSearchStore((s) => s.setHideInLibrary)
  const clearFilters = useHubSearchStore((s) => s.clearFilters)

  const [filtersOpen, setFiltersOpen] = useState(false)
  const [openDropdown, setOpenDropdown] = useState<DropdownKey>(null)
  const [searchFocused, setSearchFocused] = useState(false)
  const [suggestionSeed, setSuggestionSeed] = useState(() => Date.now())
  const [genreSearchTerm, setGenreSearchTerm] = useState('')

  const speed = useAnimationSpeed()
  const searchInputRef = useRef<HTMLInputElement>(null)
  const headerRef = useRef<HTMLElement>(null)

  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS)

  // Close open dropdowns on outside click or Escape key
  useEffect(() => {
    function handlePointerDown(e: MouseEvent) {
      if (!headerRef.current) return
      if (!headerRef.current.contains(e.target as Node)) {
        setOpenDropdown(null)
        setSearchFocused(false)
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpenDropdown(null)
        setSearchFocused(false)
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  const toggleDropdown = (key: Exclude<DropdownKey, null>) => {
    setOpenDropdown((prev) => (prev === key ? null : key))
  }

  const filters = useMemo(
    () => ({
      genreId,
      genreIds,
      platformId,
      platformIds,
      release,
      yearFrom,
      yearTo,
      minRating,
      sort,
      gameCategory,
      gameMode,
      onlyReleased,
      onSale,
    }),
    [
      genreId,
      genreIds,
      platformId,
      platformIds,
      release,
      yearFrom,
      yearTo,
      minRating,
      sort,
      gameCategory,
      gameMode,
      onlyReleased,
      onSale,
    ],
  )

  const hasFilter =
    genreIds.length > 0 ||
    platformIds.length > 0 ||
    release !== null ||
    yearFrom !== null ||
    yearTo !== null ||
    minRating !== null ||
    sort !== null ||
    (gameCategory !== null && gameCategory !== 'all') ||
    (gameMode !== null && gameMode !== 'all') ||
    onlyReleased ||
    onSale ||
    hideInLibrary

  const isQuerying = debouncedQuery.trim().length >= 2 || hasFilter

  const { newReleases, comingSoon, topRated, recommended } = useHubHomeFeed()
  const refreshCatalog = useRefreshHubCatalog()
  const search = useHubSearch(debouncedQuery, filters)
  const genres = useHubGenres()
  const platforms = useHubPlatforms()

  const { data: games } = useGames()
  const inLibrary = buildHubLibraryMatcher(games)
  const inWishlist = buildHubWishlistMatcher(games)
  const isInstalled = buildHubInstalledMatcher(games)
  const inMemory = buildHubMemoryMatcher(games)

  const { data: settings } = useSettings()
  const providerMode = settings?.metadata_provider_mode ?? 'public'

  // Pool of all loaded home feed games for instant client-side fallback when filtering
  const homeFeedPool = useMemo(() => {
    const map = new Map<number, HubGame>()
    for (const list of [
      newReleases.data,
      topRated.data,
      recommended.data,
      comingSoon.data,
    ]) {
      if (!list) continue
      for (const g of list) {
        if (!map.has(g.igdb_id)) map.set(g.igdb_id, g)
      }
    }
    return Array.from(map.values())
  }, [newReleases.data, topRated.data, recommended.data, comingSoon.data])

  // Dynamic rotating search suggestions built from live Hub feeds + curated fallback pool
  const dynamicSearchSuggestions = useMemo(() => {
    const pool: Array<{
      igdb_id?: number
      term: string
      tag: string
      score?: number | null
      cover?: string | null
    }> = []
    const seen = new Set<string>()

    for (const g of homeFeedPool) {
      const key = g.name.toLowerCase().trim()
      if (seen.has(key)) continue
      seen.add(key)
      const primaryGenre = g.genres?.[0] || 'Featured Game'
      const yr = g.release_date ? g.release_date.slice(0, 4) : ''
      pool.push({
        igdb_id: g.igdb_id,
        term: g.name,
        tag: yr ? `${primaryGenre} • ${yr}` : primaryGenre,
        score: g.metacritic_score ?? g.opencritic_score ?? g.rating ?? null,
        cover: g.cover_url ?? g.backdrop_url ?? null,
      })
    }

    for (const fb of FALLBACK_DYNAMIC_SUGGESTIONS) {
      const key = fb.term.toLowerCase().trim()
      if (seen.has(key)) continue
      seen.add(key)
      pool.push(fb)
    }

    // Deterministic Fisher-Yates shuffle driven by suggestionSeed so suggestions rotate dynamically!
    const shuffled = [...pool]
    let state = (suggestionSeed ^ 0x9e3779b9) >>> 0
    for (let i = shuffled.length - 1; i > 0; i--) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0
      const j = state % (i + 1)
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }

    return shuffled.slice(0, 8)
  }, [homeFeedPool, suggestionSeed])

  // Featured hero uses combined top newReleases + topRated with high-res backdrops
  const heroCandidates = useMemo(() => {
    const primary = newReleases.data ?? []
    const secondary = topRated.data ?? []
    const seen = new Set<number>()
    const out: HubGame[] = []
    for (const g of [...primary, ...secondary]) {
      if (!seen.has(g.igdb_id) && (g.backdrop_url || g.cover_url)) {
        seen.add(g.igdb_id)
        out.push(g)
        if (out.length >= 6) break
      }
    }
    return out
  }, [newReleases.data, topRated.data])

  const firstError =
    newReleases.error ?? comingSoon.error ?? topRated.error ?? recommended.error
  const missingKeys = isMissingIgdbKeys(firstError, providerMode)
  const allInitialPending =
    newReleases.isPending &&
    comingSoon.isPending &&
    topRated.isPending &&
    recommended.isPending

  const isAnyFeedFetching =
    refreshCatalog.isPending ||
    newReleases.isFetching ||
    comingSoon.isFetching ||
    topRated.isFetching ||
    recommended.isFetching

  const refetchAllFeeds = () => {
    refreshCatalog.mutate(undefined, {
      onSuccess: () => {
        void newReleases.refetch()
        void comingSoon.refetch()
        void topRated.refetch()
        void recommended.refetch()
        void genres.refetch()
        void platforms.refetch()
        toast.success('Game Hub synced with live catalog & fresh recommendations!')
      },
    })
  }

  const activeFilterCount =
    (genreIds.length > 0 ? 1 : 0) +
    (platformIds.length > 0 ? 1 : 0) +
    (release !== null ? 1 : 0) +
    (minRating !== null ? 1 : 0) +
    (sort !== null ? 1 : 0) +
    (gameCategory !== null && gameCategory !== 'all' ? 1 : 0) +
    (gameMode !== null && gameMode !== 'all' ? 1 : 0) +
    (onlyReleased ? 1 : 0) +
    (onSale ? 1 : 0) +
    (hideInLibrary ? 1 : 0)

  const selectedGenres = useMemo(
    () => (genres.data ?? []).filter((g) => genreIds.includes(g.id)),
    [genres.data, genreIds],
  )
  const selectedPlatforms = useMemo(
    () => (platforms.data ?? []).filter((p) => platformIds.includes(p.id)),
    [platforms.data, platformIds],
  )
  const selectedReleaseLabel = useMemo(() => {
    if (!release) return undefined
    const preset = RELEASE_OPTIONS.find((r) => r.key === release)?.shortLabel
    if (preset) return preset
    const era = ERA_OPTIONS.find((e) => e.key === release)?.label
    if (era) return era
    if (release.includes('-')) {
      const [from, to] = release.split('-')
      if (!from) return `Up to ${to}`
      return `${from} – ${to}`
    }
    if (release.endsWith('+')) return `From ${release.replace('+', '')}`
    return `Year: ${release}`
  }, [release])

  const selectedCategoryLabel = useMemo(
    () =>
      gameCategory && gameCategory !== 'all'
        ? GAME_CATEGORY_OPTIONS.find((c) => c.key === gameCategory)?.label
        : undefined,
    [gameCategory],
  )

  const selectedModeLabel = useMemo(
    () =>
      gameMode && gameMode !== 'all'
        ? GAME_MODE_OPTIONS.find((m) => m.key === gameMode)?.label
        : undefined,
    [gameMode],
  )

  const selectedSortOption = useMemo(
    () => (sort ? SORT_OPTIONS.find((s) => s.key === sort) : undefined),
    [sort],
  )

  const resolvedQuickGenres = useMemo(() => {
    return QUICK_GENRES.map((qg) => {
      const found = genres.data?.find((g) => g.name.toLowerCase().includes(qg.match))
      return {
        label: qg.label,
        id: found ? found.id : qg.id,
      }
    })
  }, [genres.data])

  const filteredDropdownGenres = useMemo(() => {
    const all = genres.data ?? []
    const q = genreSearchTerm.trim().toLowerCase()
    if (!q) return all
    return all.filter((g) => g.name.toLowerCase().includes(q))
  }, [genres.data, genreSearchTerm])

  const activeQuickMode = useMemo(() => {
    if (!isQuerying) return 'featured'
    if (onSale && !query && release === null) return 'deals'
    if (release === 'new' && !query && minRating === null && !onSale) return 'new'
    if (release === 'upcoming' && !query && minRating === null && !onSale) return 'upcoming'
    if (minRating === 85 && sort === 'rating' && !query && release === null && !onSale) return 'hall'
    return null
  }, [isQuerying, onSale, release, query, minRating, sort])

  const editionModeActiveCount =
    (gameCategory && gameCategory !== 'all' ? 1 : 0) +
    (gameMode && gameMode !== 'all' ? 1 : 0) +
    (onlyReleased ? 1 : 0) +
    (onSale ? 1 : 0) +
    (hideInLibrary ? 1 : 0)

  return (
    <div className="h-full overflow-y-auto px-5 py-6 sm:px-8 sm:py-7">
      <div className="mx-auto flex max-w-[1680px] flex-col gap-6">
        {/* ── Next-Gen Discovery Header & Fluid Filter Command Deck ───────── */}
        <motion.header
          ref={headerRef}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28 * speed, ease: [0.16, 1, 0.3, 1] }}
          className="relative z-30 rounded-3xl border border-border bg-gradient-to-br from-surface-raised/95 via-surface to-surface-raised/80 p-5 sm:p-6 shadow-card"
        >
          {/* Non-clipping background layer for ambient glows & subtle tech grid */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl">
            <div
              className="absolute -right-20 -top-24 size-96 rounded-full opacity-90"
              style={{
                background:
                  'radial-gradient(circle, color-mix(in srgb, var(--nx-accent) 18%, transparent) 0%, transparent 70%)',
              }}
            />
            <div
              className="absolute -left-20 -bottom-24 size-80 rounded-full opacity-80"
              style={{
                background:
                  'radial-gradient(circle, rgba(6, 182, 212, 0.14) 0%, transparent 70%)',
              }}
            />
            <div
              className="absolute inset-x-0 top-0 h-px"
              style={{
                background:
                  'linear-gradient(90deg, transparent, color-mix(in srgb, var(--nx-accent) 45%, transparent), transparent)',
              }}
            />
          </div>

          <div className="relative z-30 flex flex-col gap-4">
            {/* ── Row 1: Brand Emblem + Fluid Segmented View Switcher ────── */}
            <div className="relative z-10 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex items-center gap-4">
                {/* Glowing 3D Emblem */}
                <div className="relative flex size-13 sm:size-14 shrink-0 items-center justify-center rounded-2xl border border-accent/40 bg-gradient-to-br from-accent/25 via-accent/10 to-surface-raised shadow-[0_0_24px_-6px_var(--nx-accent)]">
                  <Gamepad2 className="size-7 text-accent drop-shadow-[0_0_8px_var(--nx-accent)]" />
                  <span className="absolute -top-1 -right-1 flex size-4.5 items-center justify-center rounded-full bg-emerald-500 text-white shadow-xs ring-2 ring-surface">
                    <Sparkles className="size-2.5 fill-current" />
                  </span>
                </div>

                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/35 bg-accent/15 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-accent">
                      <Compass className="size-3" />
                      <span>NEXUS EXPLORER</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/35 bg-emerald-500/12 px-2.5 py-0.5 text-[10px] font-bold text-emerald-500">
                      <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span>500K+ Live Catalog</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/35 bg-gradient-to-r from-emerald-500/15 via-amber-500/12 to-orange-500/15 px-2.5 py-0.5 text-[10px] font-extrabold text-text shadow-2xs">
                      <span className="flex size-3.5 items-center justify-center rounded-[4px] bg-[#ffcc33] font-serif text-[8.5px] font-black leading-none text-black">
                        m
                      </span>
                      <span className="text-emerald-400">Metacritic</span>
                      <span className="text-subtle">•</span>
                      <span className="flex size-3.5 items-center justify-center rounded-[4px] bg-[#fc430a] font-mono text-[7px] font-black leading-none text-white">
                        OC
                      </span>
                      <span className="text-orange-400">OpenCritic Live</span>
                    </span>
                  </div>

                  <div className="flex items-baseline gap-2.5">
                    <h1 className="bg-gradient-to-r from-text via-text to-accent bg-clip-text text-2xl sm:text-3xl font-black tracking-tight text-transparent">
                      Game Hub
                    </h1>
                    <p className="hidden md:inline text-xs font-medium text-muted">
                      Discover trending blockbusters, acclaimed classics, and instant filters
                    </p>
                  </div>
                </div>
              </div>

              {/* Fluid Segmented Quick-Mode Switcher */}
              <div className="flex flex-wrap items-center gap-1 rounded-2xl border border-border bg-surface/90 p-1 shadow-xs self-start xl:self-auto">
                {[
                  {
                    id: 'featured',
                    label: 'Featured Hub',
                    icon: Sparkles,
                    iconColor: 'text-accent',
                    onClick: () => {
                      clearFilters()
                      setQuery('')
                    },
                  },
                  {
                    id: 'deals',
                    label: 'Hot Deals (On Sale)',
                    icon: Tag,
                    iconColor: 'text-emerald-400',
                    onClick: () => {
                      clearFilters()
                      setQuery('')
                      setOnSale(true)
                    },
                  },
                  {
                    id: 'new',
                    label: 'Hot & New',
                    icon: Flame,
                    iconColor: 'text-emerald-400',
                    onClick: () => {
                      clearFilters()
                      setQuery('')
                      setRelease('new')
                    },
                  },
                  {
                    id: 'upcoming',
                    label: 'Upcoming',
                    icon: Clock,
                    iconColor: 'text-cyan-400',
                    onClick: () => {
                      clearFilters()
                      setQuery('')
                      setRelease('upcoming')
                    },
                  },
                  {
                    id: 'hall',
                    label: 'Hall of Fame (85+)',
                    icon: Trophy,
                    iconColor: 'text-amber-400',
                    onClick: () => {
                      clearFilters()
                      setQuery('')
                      setMinRating(85)
                      setSort('rating')
                    },
                  },
                ].map((tab) => {
                  const Icon = tab.icon
                  const active = activeQuickMode === tab.id
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        setOpenDropdown(null)
                        tab.onClick()
                      }}
                      className={cn(
                        'relative flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer select-none',
                        active ? 'text-white' : 'text-muted hover:text-text',
                      )}
                    >
                      {active && (
                        <motion.span
                          layoutId="hub-quick-mode-pill"
                          transition={DROPDOWN_SPRING}
                          className="absolute inset-0 rounded-xl bg-accent shadow-sm shadow-accent/30"
                        />
                      )}
                      <Icon
                        className={cn(
                          'relative z-10 size-3.5 transition-colors',
                          active ? 'text-white' : tab.iconColor,
                        )}
                      />
                      <span className="relative z-10">{tab.label}</span>
                    </button>
                  )
                })}

                <div className="mx-1 h-4 w-px bg-border/80 hidden sm:block" />

                <button
                  type="button"
                  onClick={refetchAllFeeds}
                  disabled={isAnyFeedFetching}
                  title="Force live sync & rotate discovery shelves"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-border/80 bg-surface-raised/80 px-2.5 py-1.5 text-xs font-bold text-text transition-all hover:border-accent/50 hover:text-accent active:scale-95 disabled:opacity-60 cursor-pointer"
                >
                  <RefreshCw
                    className={cn(
                      'size-3.5 text-accent',
                      isAnyFeedFetching && 'animate-spin',
                    )}
                  />
                  <span className="hidden sm:inline">
                    {isAnyFeedFetching ? 'Syncing…' : 'Sync Live'}
                  </span>
                </button>
              </div>
            </div>

            {/* ── Row 2: Search Input + Custom Theme-Aware Dropdown Bar ──── */}
            <div className="relative z-40 flex flex-col gap-2.5">
              {/* Search Bar with Floating Quick Suggestions */}
              <div className="relative z-50">
                <div
                  className={cn(
                    'relative flex h-12 w-full items-center rounded-2xl border bg-surface transition-all duration-200 shadow-xs',
                    searchFocused
                      ? 'border-accent ring-3 ring-accent/15 bg-surface-raised/60'
                      : 'border-border hover:border-accent/45',
                  )}
                >
                  <Search className="pointer-events-none ml-4 size-4.5 shrink-0 text-accent" />
                  <input
                    ref={searchInputRef}
                    value={query}
                    onFocus={() => {
                      setSearchFocused(true)
                      setSuggestionSeed(Date.now())
                      setOpenDropdown(null)
                    }}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search 500,000+ games, franchises, or shorthand (e.g. GTA 5, Elden Ring, Witcher 3, RE4, BG3)…"
                    className="h-full flex-1 bg-transparent px-3.5 text-sm font-medium text-text placeholder:text-subtle outline-none"
                  />

                  <div className="mr-3 flex items-center gap-2">
                    {search.isFetching && isQuerying && (
                      <Loader2 className="size-4 animate-spin text-accent" />
                    )}
                    {query ? (
                      <button
                        type="button"
                        aria-label="Clear search"
                        onClick={() => {
                          setQuery('')
                          setSuggestionSeed(Date.now())
                          searchInputRef.current?.focus()
                        }}
                        className="flex size-7 items-center justify-center rounded-xl border border-border bg-surface-raised text-subtle transition-colors hover:border-accent/40 hover:text-text cursor-pointer"
                      >
                        <X className="size-3.5" />
                      </button>
                    ) : (
                      <kbd className="hidden sm:inline-flex items-center gap-1 rounded-lg border border-border bg-surface-raised px-2 py-0.5 text-[10px] font-bold text-subtle">
                        Ctrl+K
                      </kbd>
                    )}
                  </div>
                </div>

                {/* Dynamic Live Search Suggestions Dropdown when input is focused & empty */}
                <AnimatePresence>
                  {searchFocused && query.trim().length === 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 6, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 4, scale: 0.98 }}
                      transition={DROPDOWN_SPRING}
                      className="solid-panel absolute left-0 right-0 top-[calc(100%+8px)] z-50 rounded-2xl border border-border p-3.5 shadow-elevated ring-1 ring-border/70"
                    >
                      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 px-1">
                        <span className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-subtle">
                          <Sparkles className="size-3 text-accent" />
                          <span>Live Dynamic Game Suggestions</span>
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="hidden md:inline text-[10px] font-medium text-subtle">
                            Supports shorthand like GTA 5, RDR2, BG3, RE4, TW3
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setSuggestionSeed(Date.now() + Math.floor(Math.random() * 100000))
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-border/80 bg-surface-raised px-2 py-1 text-[10px] font-bold text-accent transition-all hover:border-accent/50 hover:bg-accent/10 active:scale-95 cursor-pointer"
                          >
                            <Shuffle className="size-3" />
                            <span>Refresh Picks</span>
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                        {dynamicSearchSuggestions.map((item) => (
                          <div
                            key={item.term}
                            onClick={() => {
                              setQuery(item.term)
                              setSearchFocused(false)
                            }}
                            className="group flex items-center justify-between gap-2.5 rounded-xl border border-border/70 bg-surface-raised/55 p-2 text-left transition-all hover:border-accent/50 hover:bg-surface-raised cursor-pointer"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              {item.cover ? (
                                <img
                                  src={item.cover}
                                  alt={item.term}
                                  className="h-10 w-7.5 shrink-0 rounded-lg object-cover ring-1 ring-border/60"
                                />
                              ) : (
                                <div className="flex h-10 w-7.5 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                                  <Gamepad2 className="size-4" />
                                </div>
                              )}
                              <div className="min-w-0">
                                <div className="truncate text-xs font-bold text-text group-hover:text-accent transition-colors">
                                  {item.term}
                                </div>
                                <div className="mt-0.5 flex items-center gap-1.5 truncate text-[10px] text-subtle">
                                  <span className="truncate">{item.tag}</span>
                                  <HubScoreBadge
                                    variant="compact"
                                    metacriticScore={item.score}
                                    gameName={item.term}
                                    className="shrink-0 scale-95 origin-left"
                                  />
                                </div>
                              </div>
                            </div>
                            {item.igdb_id ? (
                              <button
                                type="button"
                                title="Open Game Page"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setSearchFocused(false)
                                  navigate(`/hub/${item.igdb_id}`, { state: { expectedName: item.term } })
                                }}
                                className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-surface text-subtle transition-all hover:border-accent hover:bg-accent hover:text-white cursor-pointer"
                              >
                                <ArrowRight className="size-3.5" />
                              </button>
                            ) : (
                              <ArrowRight className="size-3.5 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
                            )}
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* ── Custom Theme-Aware Dropdown Filter Deck ───────────────── */}
              <div className="relative z-40 flex flex-wrap items-center gap-2">
                {/* 1. Sort Custom Dropdown */}
                <div className="relative">
                  <DropdownTriggerButton
                    icon={ArrowUpDown}
                    prefix="Sort:"
                    label={selectedSortOption ? selectedSortOption.shortLabel : 'Relevance'}
                    active={sort !== null}
                    open={openDropdown === 'sort'}
                    onClick={() => {
                      setSearchFocused(false)
                      toggleDropdown('sort')
                    }}
                  />
                  <AnimatePresence>
                    {openDropdown === 'sort' && (
                      <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 6, scale: 0.96 }}
                        transition={DROPDOWN_SPRING}
                        className="solid-panel absolute left-0 top-[calc(100%+8px)] z-50 w-72 rounded-2xl border border-border p-2 shadow-elevated ring-1 ring-border/70"
                      >
                        <div className="px-2.5 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-subtle">
                          Order Catalog Results By
                        </div>
                        <div className="flex flex-col gap-1">
                          <DropdownOptionRow
                            icon={Sparkles}
                            label="Default (Relevance / Popular)"
                            description="Smart title relevance & community popularity"
                            selected={sort === null}
                            onClick={() => {
                              setSort(null)
                              setOpenDropdown(null)
                            }}
                          />
                          {SORT_OPTIONS.map((opt) => (
                            <DropdownOptionRow
                              key={opt.key}
                              icon={opt.icon}
                              label={opt.label}
                              description={opt.desc}
                              selected={sort === opt.key}
                              onClick={() => {
                                setSort(sort === opt.key ? null : opt.key)
                                setOpenDropdown(null)
                              }}
                            />
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* 2. Genres Multi-Select Custom Dropdown */}
                <div className="relative">
                  <DropdownTriggerButton
                    icon={Tag}
                    label={
                      selectedGenres.length === 0
                        ? 'Genres'
                        : selectedGenres.length === 1
                          ? selectedGenres[0].name
                          : `${selectedGenres.length} Genres`
                    }
                    badgeCount={selectedGenres.length > 1 ? selectedGenres.length : undefined}
                    active={selectedGenres.length > 0}
                    open={openDropdown === 'genres'}
                    onClick={() => {
                      setSearchFocused(false)
                      toggleDropdown('genres')
                    }}
                  />
                  <AnimatePresence>
                    {openDropdown === 'genres' && (
                      <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 6, scale: 0.96 }}
                        transition={DROPDOWN_SPRING}
                        className="solid-panel absolute left-0 top-[calc(100%+8px)] z-50 w-80 sm:w-96 rounded-2xl border border-border p-3 shadow-elevated ring-1 ring-border/70"
                      >
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <span className="text-xs font-extrabold uppercase tracking-wider text-text">
                            Filter by Genres
                          </span>
                          {genreIds.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setGenreIds([])}
                              className="text-[11px] font-bold text-accent hover:underline cursor-pointer"
                            >
                              Clear ({genreIds.length})
                            </button>
                          )}
                        </div>

                        {/* Quick filter input inside genre dropdown */}
                        <div className="relative mb-2.5 flex items-center">
                          <Search className="pointer-events-none absolute left-3 size-3.5 text-subtle" />
                          <input
                            type="text"
                            value={genreSearchTerm}
                            onChange={(e) => setGenreSearchTerm(e.target.value)}
                            placeholder="Filter genres…"
                            className="h-8 w-full rounded-xl border border-border bg-surface-raised pl-8 pr-7 text-xs text-text placeholder:text-subtle outline-none focus:border-accent"
                          />
                          {genreSearchTerm && (
                            <button
                              type="button"
                              onClick={() => setGenreSearchTerm('')}
                              className="absolute right-2 text-subtle hover:text-text cursor-pointer"
                            >
                              <X className="size-3" />
                            </button>
                          )}
                        </div>

                        <div className="grid max-h-64 grid-cols-2 gap-1.5 overflow-y-auto pr-1 scrollbar-thin">
                          {filteredDropdownGenres.map((g) => {
                            const isSelected = genreIds.includes(g.id)
                            return (
                              <button
                                key={g.id}
                                type="button"
                                onClick={() => toggleGenreId(g.id)}
                                className={cn(
                                  'flex items-center justify-between gap-2 rounded-xl border px-2.5 py-2 text-left text-xs font-semibold transition-all cursor-pointer',
                                  isSelected
                                    ? 'border-accent bg-accent/15 text-accent font-bold'
                                    : 'border-border/70 bg-surface-raised/50 text-muted hover:border-accent/40 hover:bg-surface-raised hover:text-text',
                                )}
                              >
                                <span className="truncate">{g.name}</span>
                                <span
                                  className={cn(
                                    'flex size-4 shrink-0 items-center justify-center rounded-md border transition-colors',
                                    isSelected
                                      ? 'border-accent bg-accent text-white'
                                      : 'border-border bg-surface',
                                  )}
                                >
                                  {isSelected && <Check className="size-2.5 stroke-[3]" />}
                                </span>
                              </button>
                            )
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* 3. Platforms Multi-Select Custom Dropdown */}
                <div className="relative">
                  <DropdownTriggerButton
                    icon={Cpu}
                    label={
                      selectedPlatforms.length === 0
                        ? 'Platforms'
                        : selectedPlatforms
                            .slice(0, 2)
                            .map((p) => p.abbreviation || p.name)
                            .join(', ') +
                          (selectedPlatforms.length > 2
                            ? ` +${selectedPlatforms.length - 2}`
                            : '')
                    }
                    badgeCount={
                      selectedPlatforms.length > 1 ? selectedPlatforms.length : undefined
                    }
                    active={selectedPlatforms.length > 0}
                    open={openDropdown === 'platforms'}
                    onClick={() => {
                      setSearchFocused(false)
                      toggleDropdown('platforms')
                    }}
                  />
                  <AnimatePresence>
                    {openDropdown === 'platforms' && (
                      <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 6, scale: 0.96 }}
                        transition={DROPDOWN_SPRING}
                        className="solid-panel absolute left-0 top-[calc(100%+8px)] z-50 w-72 rounded-2xl border border-border p-3 shadow-elevated ring-1 ring-border/70"
                      >
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-xs font-extrabold uppercase tracking-wider text-text">
                            Target Platforms
                          </span>
                          {platformIds.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setPlatformIds([])}
                              className="text-[11px] font-bold text-accent hover:underline cursor-pointer"
                            >
                              All Platforms
                            </button>
                          )}
                        </div>
                        <div className="flex flex-col gap-1">
                          {(platforms.data ?? []).map((p) => {
                            const isSelected = platformIds.includes(p.id)
                            return (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => togglePlatformId(p.id)}
                                className={cn(
                                  'flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition-all cursor-pointer',
                                  isSelected
                                    ? 'border-accent bg-accent/15 text-accent font-bold'
                                    : 'border-transparent bg-surface-raised/45 text-muted hover:border-border hover:bg-surface-raised hover:text-text',
                                )}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="rounded-md border border-border bg-surface px-1.5 py-0.5 text-[10px] font-extrabold text-text">
                                    {p.abbreviation || 'SYS'}
                                  </span>
                                  <span className="truncate">{p.name}</span>
                                </div>
                                <span
                                  className={cn(
                                    'flex size-4 shrink-0 items-center justify-center rounded-md border transition-colors',
                                    isSelected
                                      ? 'border-accent bg-accent text-white'
                                      : 'border-border bg-surface',
                                  )}
                                >
                                  {isSelected && <Check className="size-2.5 stroke-[3]" />}
                                </span>
                              </button>
                            )
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* 4. Release Window & Era Custom Dropdown */}
                <div className="relative">
                  <DropdownTriggerButton
                    icon={Calendar}
                    label={selectedReleaseLabel ?? 'Release Era'}
                    active={release !== null}
                    open={openDropdown === 'release'}
                    onClick={() => {
                      setSearchFocused(false)
                      toggleDropdown('release')
                    }}
                  />
                  <AnimatePresence>
                    {openDropdown === 'release' && (
                      <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 6, scale: 0.96 }}
                        transition={DROPDOWN_SPRING}
                        className="solid-panel absolute left-0 top-[calc(100%+8px)] z-50 w-80 sm:w-88 rounded-2xl border border-border p-3.5 shadow-elevated ring-1 ring-border/70"
                      >
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-xs font-extrabold uppercase tracking-wider text-text">
                            Release Window & Era
                          </span>
                          {release !== null && (
                            <button
                              type="button"
                              onClick={() => setRelease(null)}
                              className="text-[11px] font-bold text-accent hover:underline cursor-pointer"
                            >
                              Any Time
                            </button>
                          )}
                        </div>

                        {/* Presets */}
                        <div className="grid grid-cols-2 gap-1.5">
                          {RELEASE_OPTIONS.map((opt) => {
                            const Icon = opt.icon
                            const active = release === opt.key
                            return (
                              <button
                                key={opt.key}
                                type="button"
                                onClick={() => {
                                  setRelease(active ? null : opt.key)
                                  setOpenDropdown(null)
                                }}
                                className={cn(
                                  'flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-xs font-semibold transition-all cursor-pointer',
                                  active
                                    ? 'border-accent bg-accent text-white font-bold shadow-xs'
                                    : 'border-border/70 bg-surface-raised/55 text-muted hover:border-accent/40 hover:bg-surface-raised hover:text-text',
                                )}
                              >
                                <Icon className="size-3.5 shrink-0" />
                                <span className="truncate">{opt.shortLabel}</span>
                              </button>
                            )
                          })}
                        </div>

                        {/* Decades / Eras */}
                        <div className="mt-3">
                          <div className="mb-1.5 text-[10px] font-extrabold uppercase tracking-wider text-subtle">
                            Gaming Decades
                          </div>
                          <div className="grid grid-cols-2 gap-1.5">
                            {ERA_OPTIONS.map((era) => {
                              const active = release === era.key
                              return (
                                <button
                                  key={era.key}
                                  type="button"
                                  onClick={() => {
                                    setRelease(active ? null : era.key)
                                    setOpenDropdown(null)
                                  }}
                                  className={cn(
                                    'flex flex-col rounded-xl border px-2.5 py-1.5 text-left transition-all cursor-pointer',
                                    active
                                      ? 'border-accent bg-accent/15 text-accent font-bold'
                                      : 'border-border/70 bg-surface-raised/50 text-muted hover:border-accent/40 hover:bg-surface-raised hover:text-text',
                                  )}
                                >
                                  <span className="text-xs font-bold">{era.label}</span>
                                  <span className="text-[10px] text-subtle">{era.years}</span>
                                </button>
                              )
                            })}
                          </div>
                        </div>

                        {/* Individual Years */}
                        <div className="mt-3">
                          <div className="mb-1.5 text-[10px] font-extrabold uppercase tracking-wider text-subtle">
                            Specific Release Year
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {SINGLE_YEARS.map((y) => {
                              const active = release === y
                              return (
                                <button
                                  key={y}
                                  type="button"
                                  onClick={() => {
                                    setRelease(active ? null : y)
                                    setOpenDropdown(null)
                                  }}
                                  className={cn(
                                    'rounded-lg border px-2.5 py-1 text-xs font-bold transition-all cursor-pointer',
                                    active
                                      ? 'border-accent bg-accent text-white'
                                      : 'border-border/70 bg-surface-raised/60 text-muted hover:border-accent/40 hover:text-text',
                                  )}
                                >
                                  {y}
                                </button>
                              )
                            })}
                          </div>
                        </div>

                        {/* Custom Year Range */}
                        <CustomYearRangePicker
                          yearFrom={yearFrom}
                          yearTo={yearTo}
                          onSetYearRange={setYearRange}
                          onClear={() => setRelease(null)}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* 5. Minimum Score Custom Dropdown */}
                <div className="relative">
                  <DropdownTriggerButton
                    icon={Award}
                    label={minRating !== null ? `Score ${minRating}+` : 'Min Score'}
                    active={minRating !== null}
                    open={openDropdown === 'rating'}
                    onClick={() => {
                      setSearchFocused(false)
                      toggleDropdown('rating')
                    }}
                  />
                  <AnimatePresence>
                    {openDropdown === 'rating' && (
                      <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 6, scale: 0.96 }}
                        transition={DROPDOWN_SPRING}
                        className="solid-panel absolute left-0 top-[calc(100%+8px)] z-50 w-72 rounded-2xl border border-border p-2.5 shadow-elevated ring-1 ring-border/70"
                      >
                        <div className="mb-1.5 flex items-center justify-between px-1.5">
                          <span className="text-[10px] font-extrabold uppercase tracking-wider text-subtle">
                            Minimum Critic & Player Score
                          </span>
                          {minRating !== null && (
                            <button
                              type="button"
                              onClick={() => {
                                setMinRating(null)
                                setOpenDropdown(null)
                              }}
                              className="text-[11px] font-bold text-accent hover:underline cursor-pointer"
                            >
                              Any Score
                            </button>
                          )}
                        </div>
                        <div className="flex flex-col gap-1">
                          {RATING_OPTIONS.map((r) => {
                            const selected = minRating === r.value
                            return (
                              <button
                                key={r.value}
                                type="button"
                                onClick={() => {
                                  setMinRating(selected ? null : r.value)
                                  setOpenDropdown(null)
                                }}
                                className={cn(
                                  'flex items-center justify-between gap-2.5 rounded-xl border px-3 py-2 text-left transition-all cursor-pointer',
                                  selected
                                    ? 'border-accent bg-accent/15 text-text'
                                    : 'border-transparent bg-surface-raised/45 text-muted hover:border-border hover:bg-surface-raised hover:text-text',
                                )}
                              >
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span
                                      className={cn(
                                        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-black',
                                        r.badgeClass,
                                      )}
                                    >
                                      <Star className="size-2.5 fill-current" />
                                      {r.value}+
                                    </span>
                                    <span className="text-xs font-bold text-text">
                                      {r.label.replace(`${r.value}+ `, '')}
                                    </span>
                                  </div>
                                  <div className="mt-0.5 text-[10px] text-subtle truncate">
                                    {r.desc}
                                  </div>
                                </div>
                                {selected && (
                                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent text-white">
                                    <Check className="size-3 stroke-[3]" />
                                  </span>
                                )}
                              </button>
                            )
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* 6. Edition, Mode & Preferences Custom Dropdown */}
                <div className="relative">
                  <DropdownTriggerButton
                    icon={Layers}
                    label={
                      selectedCategoryLabel ??
                      selectedModeLabel ??
                      'Edition & Mode'
                    }
                    badgeCount={
                      editionModeActiveCount > 0 ? editionModeActiveCount : undefined
                    }
                    active={editionModeActiveCount > 0}
                    open={openDropdown === 'edition'}
                    onClick={() => {
                      setSearchFocused(false)
                      toggleDropdown('edition')
                    }}
                  />
                  <AnimatePresence>
                    {openDropdown === 'edition' && (
                      <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 6, scale: 0.96 }}
                        transition={DROPDOWN_SPRING}
                        className="solid-panel absolute right-0 top-[calc(100%+8px)] z-50 w-80 rounded-2xl border border-border p-3.5 shadow-elevated ring-1 ring-border/70"
                      >
                        <div className="mb-2 text-[10px] font-extrabold uppercase tracking-wider text-subtle">
                          Game Edition Type
                        </div>
                        <div className="flex flex-col gap-1">
                          {GAME_CATEGORY_OPTIONS.map((opt) => {
                            const selected = (gameCategory ?? 'all') === opt.key
                            return (
                              <button
                                key={opt.key}
                                type="button"
                                onClick={() =>
                                  setGameCategory(opt.key === 'all' ? null : opt.key)
                                }
                                className={cn(
                                  'flex items-center justify-between rounded-xl border px-3 py-2 text-left transition-all cursor-pointer',
                                  selected
                                    ? 'border-accent bg-accent/15 text-accent font-bold'
                                    : 'border-transparent bg-surface-raised/45 text-muted hover:border-border hover:bg-surface-raised hover:text-text',
                                )}
                              >
                                <div>
                                  <div className="text-xs font-bold text-text">{opt.label}</div>
                                  <div className="text-[10px] text-subtle">{opt.desc}</div>
                                </div>
                                {selected && (
                                  <Check className="size-3.5 shrink-0 text-accent stroke-[3]" />
                                )}
                              </button>
                            )
                          })}
                        </div>

                        <div className="mt-3 mb-1.5 text-[10px] font-extrabold uppercase tracking-wider text-subtle">
                          Play Mode
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {GAME_MODE_OPTIONS.map((opt) => {
                            const selected = (gameMode ?? 'all') === opt.key
                            return (
                              <button
                                key={opt.key}
                                type="button"
                                onClick={() =>
                                  setGameMode(opt.key === 'all' ? null : opt.key)
                                }
                                className={cn(
                                  'rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition-all cursor-pointer',
                                  selected
                                    ? 'border-accent bg-accent text-white font-bold'
                                    : 'border-border/70 bg-surface-raised/60 text-muted hover:border-accent/40 hover:text-text',
                                )}
                              >
                                {opt.label}
                              </button>
                            )
                          })}
                        </div>

                        <div className="mt-3 border-t border-border pt-3 flex flex-col gap-1.5">
                          <button
                            type="button"
                            onClick={() => setOnlyReleased(!onlyReleased)}
                            className={cn(
                              'flex items-center justify-between rounded-xl border px-3 py-2 text-xs font-semibold transition-all cursor-pointer',
                              onlyReleased
                                ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-400 font-bold'
                                : 'border-border/70 bg-surface-raised/50 text-muted hover:text-text',
                            )}
                          >
                            <span>Released Games Only</span>
                            <span
                              className={cn(
                                'flex size-4 items-center justify-center rounded-md border',
                                onlyReleased
                                  ? 'border-emerald-500 bg-emerald-500 text-white'
                                  : 'border-border bg-surface',
                              )}
                            >
                              {onlyReleased && <Check className="size-2.5 stroke-[3]" />}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setHideInLibrary(!hideInLibrary)}
                            className={cn(
                              'flex items-center justify-between rounded-xl border px-3 py-2 text-xs font-semibold transition-all cursor-pointer',
                              hideInLibrary
                                ? 'border-violet-500/50 bg-violet-500/15 text-violet-400 font-bold'
                                : 'border-border/70 bg-surface-raised/50 text-muted hover:text-text',
                            )}
                          >
                            <span>Hide Games in Library</span>
                            <span
                              className={cn(
                                'flex size-4 items-center justify-center rounded-md border',
                                hideInLibrary
                                  ? 'border-violet-500 bg-violet-500 text-white'
                                  : 'border-border bg-surface',
                              )}
                            >
                              {hideInLibrary && <Check className="size-2.5 stroke-[3]" />}
                            </span>
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Expandable Full Filter Drawer Button */}
                <button
                  type="button"
                  onClick={() => {
                    setOpenDropdown(null)
                    setFiltersOpen((o) => !o)
                  }}
                  aria-expanded={filtersOpen}
                  className={cn(
                    'ml-auto inline-flex h-10 shrink-0 items-center gap-2 rounded-2xl border px-3.5 text-xs font-bold transition-all active:scale-95 cursor-pointer',
                    filtersOpen || activeFilterCount > 0
                      ? 'border-accent bg-accent text-white shadow-sm shadow-accent/25'
                      : 'border-border bg-surface text-text hover:border-accent/50 hover:bg-surface-raised',
                  )}
                >
                  <SlidersHorizontal className="size-3.5" />
                  <span>All Filters</span>
                  {activeFilterCount > 0 && (
                    <span className="flex size-5 items-center justify-center rounded-full bg-white/20 text-[10px] font-black text-white">
                      {activeFilterCount}
                    </span>
                  )}
                  <ChevronDown
                    className={cn(
                      'size-3.5 transition-transform duration-200',
                      filtersOpen && 'rotate-180',
                    )}
                  />
                </button>

                {(hasFilter || query.trim().length > 0) && (
                  <button
                    type="button"
                    onClick={() => {
                      clearFilters()
                      setQuery('')
                      setOpenDropdown(null)
                    }}
                    className="inline-flex h-10 items-center gap-1.5 rounded-2xl border border-rose-500/35 bg-rose-500/10 px-3 text-xs font-bold text-rose-400 transition-colors hover:bg-rose-500/20 cursor-pointer"
                  >
                    <RotateCcw className="size-3.5" />
                    <span>Reset</span>
                  </button>
                )}
              </div>
            </div>

            {/* ── Row 3: Quick Genre Strip & Edition Shortcuts ─────────────── */}
            <div className="relative z-10 flex items-center gap-1.5 overflow-x-auto pb-1 pt-0.5 scrollbar-none">
              <button
                type="button"
                onClick={() => {
                  setGenreIds([])
                  setGameCategory(null)
                  setOnSale(false)
                }}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition-all active:scale-95 cursor-pointer',
                  genreIds.length === 0 && (!gameCategory || gameCategory === 'all') && !onSale
                    ? 'border-accent bg-accent text-white shadow-xs'
                    : 'border-border bg-surface text-muted hover:border-accent/40 hover:text-text',
                )}
              >
                <Sparkles className="size-3" />
                <span>All Genres</span>
              </button>

              <button
                type="button"
                onClick={() => setOnSale(!onSale)}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-extrabold transition-all active:scale-95 cursor-pointer',
                  onSale
                    ? 'border-emerald-500 bg-emerald-500 text-black shadow-sm shadow-emerald-500/25'
                    : 'border-emerald-500/35 bg-emerald-500/10 text-emerald-500 dark:text-emerald-300 hover:border-emerald-500/60 hover:bg-emerald-500/20',
                )}
              >
                <Tag className="size-3" />
                <span>Popular On Sale</span>
              </button>

              <div className="mx-1 h-4 w-px shrink-0 bg-border" />

              {resolvedQuickGenres.map((qg) => {
                const isActive = genreIds.includes(qg.id)
                return (
                  <button
                    key={qg.label}
                    type="button"
                    onClick={() => toggleGenreId(qg.id)}
                    className={cn(
                      'inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all duration-150 active:scale-95 cursor-pointer',
                      isActive
                        ? 'border-accent bg-accent/18 text-accent font-bold ring-1 ring-accent/35'
                        : 'border-border bg-surface text-muted hover:border-accent/40 hover:bg-surface-raised hover:text-text',
                    )}
                  >
                    <span>{qg.label}</span>
                  </button>
                )
              })}

              <div className="mx-1 h-4 w-px shrink-0 bg-border" />

              <button
                type="button"
                onClick={() =>
                  setGameCategory(gameCategory === 'remake' ? null : 'remake')
                }
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all active:scale-95 cursor-pointer',
                  gameCategory === 'remake'
                    ? 'border-purple-500/60 bg-purple-500/20 text-purple-400 font-bold'
                    : 'border-border bg-surface text-muted hover:border-purple-500/40 hover:text-text',
                )}
              >
                <Layers className="size-3 text-purple-400" />
                <span>Remakes, Remasters &amp; Definitive</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  setGameCategory(gameCategory === 'expansion' ? null : 'expansion')
                }
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all active:scale-95 cursor-pointer',
                  gameCategory === 'expansion'
                    ? 'border-cyan-500/60 bg-cyan-500/20 text-cyan-400 font-bold'
                    : 'border-border bg-surface text-muted hover:border-cyan-500/40 hover:text-text',
                )}
              >
                <Sparkles className="size-3 text-cyan-400" />
                <span>Expansions &amp; Special Editions</span>
              </button>
            </div>
          </div>

          {/* ── Active Filter Pills Strip (Fluid Spring Animation) ───────── */}
          <AnimatePresence initial={false}>
            {hasFilter && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 * speed, ease: [0.16, 1, 0.3, 1] }}
                className="relative z-10 overflow-hidden"
              >
                <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border/80 pt-3">
                  <span className="mr-1 text-[11px] font-bold uppercase tracking-wider text-subtle">
                    Active Filters:
                  </span>
                  {onSale && (
                    <FilterPill
                      icon={Tag}
                      label="Popular On Sale (Discounted)"
                      onClear={() => setOnSale(false)}
                    />
                  )}
                  {selectedGenres.map((g) => (
                    <FilterPill
                      key={`g-${g.id}`}
                      icon={Tag}
                      label={g.name}
                      onClear={() => toggleGenreId(g.id)}
                    />
                  ))}
                  {selectedPlatforms.map((p) => (
                    <FilterPill
                      key={`p-${p.id}`}
                      icon={Cpu}
                      label={p.abbreviation || p.name}
                      onClear={() => togglePlatformId(p.id)}
                    />
                  ))}
                  {selectedCategoryLabel && (
                    <FilterPill
                      icon={Layers}
                      label={selectedCategoryLabel}
                      onClear={() => setGameCategory(null)}
                    />
                  )}
                  {selectedModeLabel && (
                    <FilterPill
                      icon={Users}
                      label={selectedModeLabel}
                      onClear={() => setGameMode(null)}
                    />
                  )}
                  {selectedReleaseLabel && (
                    <FilterPill
                      icon={Calendar}
                      label={selectedReleaseLabel}
                      onClear={() => setRelease(null)}
                    />
                  )}
                  {minRating !== null && (
                    <FilterPill
                      icon={Award}
                      label={`Score ${minRating}+`}
                      onClear={() => setMinRating(null)}
                    />
                  )}
                  {onlyReleased && (
                    <FilterPill
                      icon={Check}
                      label="Released Only"
                      onClear={() => setOnlyReleased(false)}
                    />
                  )}
                  {hideInLibrary && (
                    <FilterPill
                      icon={EyeOff}
                      label="Unowned Only"
                      onClear={() => setHideInLibrary(false)}
                    />
                  )}
                  {selectedSortOption && (
                    <FilterPill
                      icon={ArrowUpDown}
                      label={selectedSortOption.label}
                      onClear={() => setSort(null)}
                    />
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Collapsible Multi-Section Filter Mega-Drawer ────────────── */}
          <AnimatePresence initial={false}>
            {filtersOpen && (
              <motion.div
                key="filters-panel"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ type: 'spring', stiffness: 360, damping: 34, mass: 0.7 }}
                className="relative z-10 overflow-hidden"
              >
                <div className="mt-4 rounded-2xl border border-border bg-surface p-5 shadow-inner">
                  <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex size-8 items-center justify-center rounded-xl bg-accent/15 text-accent">
                        <SlidersHorizontal className="size-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-text">
                          Advanced Discovery Filters
                        </h3>
                        <p className="text-[11px] text-subtle">
                          Combine genres, platforms, play modes, editions, release eras, and critic ratings
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {hasFilter && (
                        <button
                          type="button"
                          onClick={clearFilters}
                          className="flex items-center gap-1 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-bold text-rose-400 transition-colors hover:bg-rose-500/20 cursor-pointer"
                        >
                          <RotateCcw className="size-3" />
                          <span>Reset All Filters</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setFiltersOpen(false)}
                        className="flex size-8 items-center justify-center rounded-xl border border-border bg-surface-raised text-subtle transition-colors hover:text-text cursor-pointer"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
                    {/* Left Column: Genres & Platforms (7 cols) */}
                    <div className="flex flex-col gap-5 lg:col-span-7">
                      <PanelSection
                        icon={Tag}
                        label="Genres"
                        description="Select one or more genres"
                        scrollable
                      >
                        <PanelChip
                          label="All Genres"
                          active={genreIds.length === 0}
                          onClick={() => setGenreIds([])}
                        />
                        {(genres.data ?? []).map((g) => (
                          <PanelChip
                            key={g.id}
                            label={g.name}
                            active={genreIds.includes(g.id)}
                            onClick={() => toggleGenreId(g.id)}
                          />
                        ))}
                      </PanelSection>

                      <PanelSection
                        icon={Cpu}
                        label="Platforms"
                        description="Filter by target gaming hardware"
                      >
                        <PanelChip
                          label="All Platforms"
                          active={platformIds.length === 0}
                          onClick={() => setPlatformIds([])}
                        />
                        {(platforms.data ?? []).map((p) => (
                          <PanelChip
                            key={p.id}
                            label={p.abbreviation || p.name}
                            active={platformIds.includes(p.id)}
                            onClick={() => togglePlatformId(p.id)}
                          />
                        ))}
                      </PanelSection>

                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <PanelSection
                          icon={Layers}
                          label="Edition / Category"
                          description="Game release type"
                        >
                          {GAME_CATEGORY_OPTIONS.map((opt) => (
                            <PanelChip
                              key={opt.key}
                              label={opt.label}
                              active={(gameCategory ?? 'all') === opt.key}
                              onClick={() =>
                                setGameCategory(opt.key === 'all' ? null : opt.key)
                              }
                            />
                          ))}
                        </PanelSection>

                        <PanelSection
                          icon={Users}
                          label="Play Mode"
                          description="Singleplayer or Multiplayer"
                        >
                          {GAME_MODE_OPTIONS.map((opt) => (
                            <PanelChip
                              key={opt.key}
                              label={opt.label}
                              active={(gameMode ?? 'all') === opt.key}
                              onClick={() => setGameMode(opt.key === 'all' ? null : opt.key)}
                            />
                          ))}
                        </PanelSection>
                      </div>
                    </div>

                    {/* Right Column: Release Era, Score, Sort & Discovery Options (5 cols) */}
                    <div className="flex flex-col gap-5 lg:col-span-5 lg:border-l lg:border-border lg:pl-5">
                      <PanelSection
                        icon={Calendar}
                        label="Release Window & Era"
                        description="Time period or custom year range"
                      >
                        <PanelChip
                          label="Any Time"
                          active={release === null && yearFrom === null && yearTo === null}
                          onClick={() => setRelease(null)}
                        />
                        {RELEASE_OPTIONS.map((r) => (
                          <PanelChip
                            key={r.key}
                            label={r.shortLabel}
                            active={release === r.key}
                            onClick={() => setRelease(release === r.key ? null : r.key)}
                          />
                        ))}
                        {ERA_OPTIONS.map((e) => (
                          <PanelChip
                            key={e.key}
                            label={e.label}
                            active={release === e.key}
                            onClick={() => setRelease(release === e.key ? null : e.key)}
                          />
                        ))}
                        <CustomYearRangePicker
                          yearFrom={yearFrom}
                          yearTo={yearTo}
                          onSetYearRange={setYearRange}
                          onClear={() => setRelease(null)}
                        />
                      </PanelSection>

                      <PanelSection
                        icon={Award}
                        label="Minimum Score"
                        description="Critic & community rating floor"
                      >
                        <PanelChip
                          label="Any Score"
                          active={minRating === null}
                          onClick={() => setMinRating(null)}
                        />
                        {RATING_OPTIONS.map((r) => (
                          <PanelChip
                            key={r.value}
                            label={r.label}
                            active={minRating === r.value}
                            onClick={() =>
                              setMinRating(minRating === r.value ? null : r.value)
                            }
                          />
                        ))}
                      </PanelSection>

                      <PanelSection
                        icon={Swords}
                        label="Library & Release Preferences"
                        description="Refine what appears in results"
                      >
                        <PanelChip
                          label="Released Games Only"
                          active={onlyReleased}
                          onClick={() => setOnlyReleased(!onlyReleased)}
                        />
                        <PanelChip
                          label="Hide Games Already in Library"
                          active={hideInLibrary}
                          onClick={() => setHideInLibrary(!hideInLibrary)}
                        />
                      </PanelSection>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.header>

        {/* ── Body: Search Results OR Curated Discovery Shelves ────────── */}
        {isQuerying ? (
          <SearchResults
            query={debouncedQuery}
            filterParts={[
              ...selectedGenres.map((g) => g.name),
              ...selectedPlatforms.map((p) => p.abbreviation || p.name),
              selectedCategoryLabel,
              selectedModeLabel,
              selectedReleaseLabel,
              minRating !== null ? `Score ${minRating}+` : undefined,
              onlyReleased ? 'Released Only' : undefined,
              hideInLibrary ? 'Unowned Only' : undefined,
            ].filter((x): x is string => Boolean(x))}
            search={search}
            homeFeedPool={homeFeedPool}
            inLibrary={inLibrary}
            inWishlist={inWishlist}
            isInstalled={isInstalled}
            inMemory={inMemory}
            onSuggestionClick={(term) => setQuery(term)}
          />
        ) : missingKeys ? (
          <MissingKeysPanel />
        ) : firstError && homeFeedPool.length === 0 ? (
          <HubOfflinePanel
            onRetry={refetchAllFeeds}
            isRetrying={
              newReleases.isFetching ||
              comingSoon.isFetching ||
              topRated.isFetching ||
              recommended.isFetching
            }
            message={firstError.message}
          />
        ) : allInitialPending ? (
          <HubFeedSkeleton />
        ) : (
          <>
            {/* 1. Featured Spotlight Carousel */}
            {heroCandidates.length > 0 && (
              <HubFeaturedHero
                games={heroCandidates}
                inLibrary={inLibrary}
                inWishlist={inWishlist}
                isInstalled={isInstalled}
                inMemory={inMemory}
              />
            )}

            {/* 2. Four Curated Discovery Shelves */}
            <HubRow
              feed="recommended"
              query={recommended}
              fallbackData={topRated.data}
              inLibrary={inLibrary}
              inWishlist={inWishlist}
              isInstalled={isInstalled}
              inMemory={inMemory}
            />
            <HubRow
              feed="new-releases"
              query={newReleases}
              inLibrary={inLibrary}
              inWishlist={inWishlist}
              isInstalled={isInstalled}
              inMemory={inMemory}
            />
            <HubRow
              feed="coming-soon"
              query={comingSoon}
              inLibrary={inLibrary}
              inWishlist={inWishlist}
              isInstalled={isInstalled}
              inMemory={inMemory}
            />
            <HubRow
              feed="top-rated"
              query={topRated}
              inLibrary={inLibrary}
              inWishlist={inWishlist}
              isInstalled={isInstalled}
              inMemory={inMemory}
            />
          </>
        )}
      </div>
    </div>
  )
}

/** Custom Theme-Aware Dropdown Trigger Button */
function DropdownTriggerButton({
  icon: Icon,
  prefix,
  label,
  badgeCount,
  active,
  open,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>
  prefix?: string
  label: string
  badgeCount?: number
  active?: boolean
  open: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      className={cn(
        'inline-flex h-10 items-center gap-2 rounded-2xl border px-3.5 text-xs font-bold transition-all duration-150 active:scale-95 cursor-pointer select-none',
        open
          ? 'border-accent bg-accent/15 text-accent ring-2 ring-accent/25 shadow-xs'
          : active
            ? 'border-accent/60 bg-accent/12 text-accent shadow-xs'
            : 'border-border bg-surface text-muted hover:border-accent/45 hover:bg-surface-raised hover:text-text',
      )}
    >
      <Icon className={cn('size-3.5 shrink-0', active || open ? 'text-accent' : 'text-subtle')} />
      {prefix && (
        <span className="text-[10px] font-extrabold uppercase tracking-wider text-subtle">
          {prefix}
        </span>
      )}
      <span className="truncate max-w-36 text-text">{label}</span>
      {badgeCount !== undefined && badgeCount > 0 && (
        <span className="flex size-4.5 items-center justify-center rounded-full bg-accent text-[10px] font-black text-white">
          {badgeCount}
        </span>
      )}
      <ChevronDown
        className={cn(
          'size-3.5 shrink-0 text-subtle transition-transform duration-200',
          open && 'rotate-180 text-accent',
        )}
      />
    </button>
  )
}

/** Single row inside a custom Sort / Option Dropdown */
function DropdownOptionRow({
  icon: Icon,
  label,
  description,
  selected,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  description?: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-between gap-2.5 rounded-xl border px-3 py-2 text-left transition-all cursor-pointer',
        selected
          ? 'border-accent bg-accent/15 text-accent'
          : 'border-transparent bg-transparent text-muted hover:border-border/70 hover:bg-surface-raised hover:text-text',
      )}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div
          className={cn(
            'flex size-7 shrink-0 items-center justify-center rounded-lg border',
            selected
              ? 'border-accent/40 bg-accent text-white'
              : 'border-border bg-surface-raised text-subtle',
          )}
        >
          <Icon className="size-3.5" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-xs font-bold text-text">{label}</div>
          {description && (
            <div className="truncate text-[10px] text-subtle">{description}</div>
          )}
        </div>
      </div>
      {selected && (
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent text-white">
          <Check className="size-3 stroke-[3]" />
        </span>
      )}
    </button>
  )
}

/** Strictly verify that a game satisfies EVERY active filter (`AND` / superset semantics).
 *  A game may have additional genres/platforms beyond the user selection,
 *  but must never be missing any selected genre, platform, or filter criteria. */
function clientMatchesFilters(
  game: HubGame,
  opts: {
    query: string
    genreIds: number[]
    platformIds: number[]
    release: string | null
    yearFrom: number | null
    yearTo: number | null
    minRating: number | null
    gameCategory: string | null
    onlyReleased: boolean
    hideInLibrary: boolean
    inLibrary: HubLibraryMatcher
    isInstalled?: HubLibraryMatcher
  },
): boolean {
  if (opts.hideInLibrary) {
    if (opts.inLibrary(game) || (opts.isInstalled && opts.isInstalled(game))) {
      return false
    }
  }

  // 1. Strict 1-to-1 Multi-Genre Match (every selected genre ID must genuinely be present on the game)
  const uniqueGenres = Array.from(new Set(opts.genreIds.filter((id) => id > 0)))
  if (uniqueGenres.length > 0) {
    const gameGenres = (game.genres || [])
      .map((g) => g.trim().toLowerCase())
      .filter((g) => g.length > 0 && g !== 'pc')
    if (gameGenres.length === 0) return false

    const genreStrMatchesId = (gg: string, gid: number): boolean => {
      switch (gid) {
        case 2:
          return gg.includes('point-and-click') || gg.includes('point and click')
        case 4:
          return gg.includes('fighting')
        case 5:
          return gg.includes('shooter')
        case 7:
          return gg.includes('music') || gg.includes('rhythm')
        case 8:
          return gg === 'platform' || gg.includes('platformer') || gg.startsWith('platform')
        case 9:
          return gg.includes('puzzle')
        case 10:
          return gg.includes('racing')
        case 11:
          return gg.includes('real time strategy') || gg === 'rts'
        case 12:
          return gg.includes('role-playing') || gg.includes('rpg')
        case 13:
          return gg.includes('simulator') || gg.includes('simulation')
        case 14:
          return gg.includes('sport')
        case 15:
          return gg === 'strategy' || gg.includes('strategy') || gg === 'rts' || gg === 'tbs'
        case 16:
          return gg.includes('turn-based strategy') || gg.includes('turn-based') || gg === 'tbs'
        case 24:
          return gg.includes('tactical')
        case 25:
          return gg.includes('hack and slash') || gg.includes("beat 'em up")
        case 26:
          return gg.includes('quiz') || gg.includes('trivia')
        case 30:
          return gg.includes('pinball')
        case 31:
          return gg.includes('adventure')
        case 32:
          return gg.includes('indie')
        case 33:
          return gg.includes('arcade')
        case 34:
          return gg.includes('visual novel')
        case 35:
          return gg.includes('card') || gg.includes('board')
        case 36:
          return gg.includes('moba')
        default:
          return false
      }
    }
    if (!uniqueGenres.every((gid) => gameGenres.some((gg) => genreStrMatchesId(gg, gid)))) {
      return false
    }
  }

  // 2. Strict Multi-Platform Match (every selected platform ID must genuinely be present on the game)
  const uniquePlats = Array.from(new Set(opts.platformIds.filter((id) => id > 0)))
  if (uniquePlats.length > 0) {
    const gamePlats = (game.platforms || []).map((p) => p.trim().toLowerCase())
    if (gamePlats.length < uniquePlats.length) {
      return false
    } else {
      const platStrMatchesId = (gp: string, pid: number): boolean => {
        switch (pid) {
          case 6:
            return gp.includes('windows') || gp === 'pc'
          case 167:
            return gp === 'playstation 5' || gp === 'ps5'
          case 48:
            return gp === 'playstation 4' || gp === 'ps4'
          case 169:
            return gp.includes('xbox series') || gp === 'series x|s' || gp === 'xsx'
          case 49:
            return gp === 'xbox one' || gp === 'xone'
          case 130:
            return gp === 'nintendo switch' || gp === 'switch'
          case 508:
            return gp === 'nintendo switch 2' || gp === 'switch 2'
          case 3:
            return gp === 'linux' || gp === 'steamos'
          case 14:
            return gp === 'mac' || gp === 'macos' || gp === 'os x'
          default:
            return false
        }
      }
      if (!uniquePlats.every((pid) => gamePlats.some((gp) => platStrMatchesId(gp, pid)))) {
        return false
      }
    }
  }

  // 3. Combined Edition / Category Match (Remakes + Remasters + Definitive + Expansions)
  if (opts.gameCategory && opts.gameCategory !== 'all') {
    const gt = game.game_type
    const nameLow = game.name.trim().toLowerCase()
    const summaryLow = (game.summary || '').toLowerCase()
    const isRemakeOrRemaster =
      gt === 8 ||
      gt === 9 ||
      gt === 10 ||
      gt === 11 ||
      [
        'remake',
        'remaster',
        'remastered',
        'definitive edition',
        "director's cut",
        'directors cut',
        'rebirth',
        'reload',
        'resurrected',
        'kiwami',
        'retold',
        'reignited',
        'n. sane',
        'reunion',
        'anniversary',
        'legendary edition',
        'master chief collection',
        'complete edition',
        'enhanced edition',
        'redux',
        'hd-2d',
        'hd remaster',
        'rehydrated',
        'collection',
        'trilogy',
        'ver.1.22',
        'resident evil 2',
        'resident evil 3',
        'resident evil 4',
        'silent hill 2',
        'dead space',
        "demon's souls",
        'the last of us part i',
        'black mesa',
        'system shock',
        'metal gear solid delta',
        'oblivion remastered',
        'nier replicant',
        'until dawn',
        'paper mario: the thousand-year door',
        'super mario rpg',
      ].some((kw) => nameLow.includes(kw) || summaryLow.includes(kw))

    const isExpansionOrEdition =
      gt === 1 ||
      gt === 2 ||
      gt === 4 ||
      gt === 10 ||
      isRemakeOrRemaster ||
      [
        'expansion',
        'standalone',
        'dlc',
        'phantom liberty',
        'shadow of the erdtree',
        'blood and wine',
        'hearts of stone',
        'iceborne',
        'sunbreak',
        'dawnguard',
        'dragonborn',
        'separate ways',
        'valhalla',
        'miles morales',
        'lost legacy',
        'below zero',
        'blood dragon',
        'new dawn',
        'death of the outsider',
        'old blood',
        'first light',
        'torna',
        'odst',
        'freedom cry',
        'gat out of hell',
        'vessel of hatred',
        'endwalker',
        'dawntrail',
        'shadowbringers',
        'edition',
      ].some((kw) => nameLow.includes(kw) || summaryLow.includes(kw))

    if (opts.gameCategory === 'main' && gt !== undefined && gt !== null && ![0, 8, 9, 10].includes(gt)) {
      return false
    }
    if (opts.gameCategory === 'remake' && !isRemakeOrRemaster) return false
    if (opts.gameCategory === 'expansion' && !isExpansionOrEdition) return false
  }

  // 4. Strict Release Date, Custom Year Range & Only Released Match
  const todayKey = localDateKey()
  if (opts.onlyReleased) {
    if (!game.release_date || game.release_date > todayKey) return false
  }

  if (opts.yearFrom !== null || opts.yearTo !== null) {
    if (!game.release_date) return false
    const y = parseInt(game.release_date.slice(0, 4), 10)
    if (isNaN(y)) return false
    if (opts.yearFrom !== null && y < opts.yearFrom) return false
    if (opts.yearTo !== null && y > opts.yearTo) return false
  }

  if (opts.release) {
    if (!game.release_date) return false
    const year = parseInt(game.release_date.slice(0, 4), 10)
    if (opts.release === 'upcoming') {
      if (game.release_date <= todayKey) return false
    } else if (opts.release === 'new') {
      const d = new Date(game.release_date).getTime()
      const now = Date.now()
      if (game.release_date > todayKey || now - d > 100 * 86_400_000) return false
    } else if (opts.release === 'last-year') {
      const d = new Date(game.release_date).getTime()
      const now = Date.now()
      if (game.release_date > todayKey || now - d > 370 * 86_400_000) return false
    } else if (opts.release === 'last-3-years') {
      const d = new Date(game.release_date).getTime()
      const now = Date.now()
      if (game.release_date > todayKey || now - d > 3 * 366 * 86_400_000) return false
    } else if (opts.release.startsWith('-')) {
      const maxY = parseInt(opts.release.slice(1), 10)
      if (!isNaN(maxY) && year > maxY) return false
    } else if (opts.release.endsWith('+')) {
      const minY = parseInt(opts.release.slice(0, -1), 10)
      if (!isNaN(minY) && year < minY) return false
    } else if (opts.release.includes('-')) {
      const [a, b] = opts.release.split('-').map((x) => parseInt(x, 10))
      if (!isNaN(a) && !isNaN(b)) {
        const lo = Math.min(a, b)
        const hi = Math.max(a, b)
        if (year < lo || year > hi) return false
      }
    } else {
      const targetY = parseInt(opts.release, 10)
      if (!isNaN(targetY) && year !== targetY) return false
    }
  }

  if (opts.minRating !== null) {
    const effectiveScore =
      game.metacritic_score ?? game.opencritic_score ?? game.rating ?? 0
    if (effectiveScore < opts.minRating) return false
  }

  return true
}

function SearchResults({
  query,
  filterParts,
  search,
  homeFeedPool,
  inLibrary,
  inWishlist,
  isInstalled,
  inMemory,
  onSuggestionClick,
}: {
  query: string
  filterParts: string[]
  search: {
    data?: { pages: HubGame[][] }
    isFetching: boolean
    isFetchingNextPage?: boolean
    hasNextPage?: boolean
    fetchNextPage: () => void
    error?: { message?: string } | null
  }
  homeFeedPool: HubGame[]
  inLibrary: HubLibraryMatcher
  inWishlist?: HubLibraryMatcher
  isInstalled?: HubLibraryMatcher
  inMemory?: HubLibraryMatcher
  onSuggestionClick: (term: string) => void
}) {
  const rawResults = useMemo(() => search.data?.pages.flat() ?? [], [search.data])
  const hasTerm = query.trim().length >= 2
  const partsLabel = filterParts.join(' · ')
  const { data: settings } = useSettings()
  const providerMode = settings?.metadata_provider_mode ?? 'public'

  const genreIds = useHubSearchStore((s) => s.genreIds)
  const platformIds = useHubSearchStore((s) => s.platformIds)
  const release = useHubSearchStore((s) => s.release)
  const yearFrom = useHubSearchStore((s) => s.yearFrom)
  const yearTo = useHubSearchStore((s) => s.yearTo)
  const minRating = useHubSearchStore((s) => s.minRating)
  const sort = useHubSearchStore((s) => s.sort)
  const gameCategory = useHubSearchStore((s) => s.gameCategory)
  const onlyReleased = useHubSearchStore((s) => s.onlyReleased)
  const hideInLibrary = useHubSearchStore((s) => s.hideInLibrary)
  const clearFilters = useHubSearchStore((s) => s.clearFilters)

  const results = useMemo(() => {
    const seen = new Set<number>()
    const combinedSource: HubGame[] = [...rawResults]

    if (!hasTerm || rawResults.length < 6) {
      const qClean = query.trim().toLowerCase()
      for (const g of homeFeedPool) {
        if (hasTerm && !g.name.toLowerCase().includes(qClean)) continue
        combinedSource.push(g)
      }
    }

    const filtered = combinedSource.filter((game) => {
      if (seen.has(game.igdb_id)) return false
      seen.add(game.igdb_id)

      return clientMatchesFilters(game, {
        query,
        genreIds,
        platformIds,
        release,
        yearFrom,
        yearTo,
        minRating,
        gameCategory,
        onlyReleased,
        hideInLibrary,
        inLibrary,
        isInstalled,
      })
    })

    if (sort === 'rating') {
      filtered.sort((a, b) => {
        const sa = a.metacritic_score ?? a.opencritic_score ?? a.rating ?? -1
        const sb = b.metacritic_score ?? b.opencritic_score ?? b.rating ?? -1
        return sb - sa || (b.rating_count ?? 0) - (a.rating_count ?? 0)
      })
    } else if (sort === 'hypes') {
      filtered.sort(
        (a, b) =>
          (b.hypes ?? 0) - (a.hypes ?? 0) ||
          (b.rating_count ?? 0) - (a.rating_count ?? 0),
      )
    } else if (sort === 'newest') {
      filtered.sort((a, b) =>
        (b.release_date ?? '').localeCompare(a.release_date ?? ''),
      )
    } else if (sort === 'oldest') {
      filtered.sort((a, b) =>
        (a.release_date ?? '9999-99-99').localeCompare(
          b.release_date ?? '9999-99-99',
        ),
      )
    } else if (sort === 'name') {
      filtered.sort((a, b) => a.name.localeCompare(b.name))
    } else if (sort === 'popularity') {
      filtered.sort(
        (a, b) =>
          (b.rating_count ?? 0) - (a.rating_count ?? 0) ||
          (b.hypes ?? 0) - (a.hypes ?? 0),
      )
    }

    return filtered
  }, [
    rawResults,
    homeFeedPool,
    hasTerm,
    query,
    genreIds,
    platformIds,
    release,
    yearFrom,
    yearTo,
    minRating,
    sort,
    gameCategory,
    onlyReleased,
    hideInLibrary,
    inLibrary,
    isInstalled,
  ])

  useEffect(() => {
    if (
      results.length < 12 &&
      search.hasNextPage &&
      !search.isFetching &&
      !search.isFetchingNextPage
    ) {
      search.fetchNextPage()
    }
  }, [results.length, search])

  if (isMissingIgdbKeys(search.error, providerMode)) {
    return <MissingKeysPanel />
  }

  if (search.error && results.length === 0) {
    return (
      <HubOfflinePanel
        onRetry={() => search.fetchNextPage()}
        isRetrying={search.isFetching}
        message={search.error.message}
      />
    )
  }

  if (search.isFetching && results.length === 0) {
    return (
      <section className="flex flex-col gap-4">
        <RowHeader
          title={hasTerm ? `Searching “${query.trim()}”…` : `Filtering Catalog…`}
          subtitle="Fetching matching titles from IGDB & Steam discovery"
        />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {Array.from({ length: 12 }, (_, idx) => (
            <div
              key={idx}
              className="aspect-[3/4] w-full animate-pulse rounded-2xl border border-border bg-surface"
            />
          ))}
        </div>
      </section>
    )
  }

  if (!search.isFetching && results.length === 0) {
    return (
      <section className="flex flex-col items-center justify-center gap-4 rounded-3xl border border-dashed border-border bg-surface/90 px-8 py-16 text-center shadow-sm">
        <span className="flex size-14 items-center justify-center rounded-2xl border border-accent/30 bg-accent/10">
          <Search className="size-6 text-accent" />
        </span>
        <div className="max-w-md">
          <div className="text-base font-bold text-text">
            {hasTerm && partsLabel
              ? `No games in ${partsLabel} matched “${query.trim()}”`
              : hasTerm
                ? `No games found for “${query.trim()}”`
                : `No games matched the selected filters`}
          </div>
          <p className="mt-1.5 text-xs text-muted leading-relaxed">
            {hasTerm && partsLabel
              ? 'Try clearing your active filters so we can search the entire catalog for this title.'
              : hasTerm
                ? 'Try a shorter keyword or pick one of the popular searches below.'
                : 'Try relaxing one of the active filters (such as minimum score or year range).'}
          </p>
        </div>

        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          {partsLabel && (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-xs font-bold text-white shadow-sm transition-all hover:bg-accent-hover cursor-pointer"
            >
              <RotateCcw className="size-3.5" />
              <span>Clear Active Filters</span>
            </button>
          )}
          {FALLBACK_DYNAMIC_SUGGESTIONS.slice(0, 5).map((sug) => (
            <button
              key={sug.term}
              type="button"
              onClick={() => onSuggestionClick(sug.term)}
              className="rounded-xl border border-border bg-surface-raised px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-accent/40 hover:text-text cursor-pointer"
            >
              {sug.term}
            </button>
          ))}
        </div>
      </section>
    )
  }

  return (
    <section>
      <RowHeader
        title={
          hasTerm && partsLabel
            ? `${partsLabel} — “${query.trim()}”`
            : hasTerm
              ? `Search Results for “${query.trim()}”`
              : `Filtered Catalog: ${partsLabel || 'All Games'}`
        }
        subtitle={
          hasTerm
            ? 'Ranked by title relevance, critical acclaim, and community popularity'
            : 'Matching titles across IGDB & Steam catalog'
        }
        count={results.length}
      />
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 items-stretch">
        {results.map((game) => (
          <HubGameCard
            key={game.igdb_id}
            game={game}
            inLibrary={inLibrary(game)}
            inWishlist={inWishlist ? inWishlist(game) : false}
            isInstalled={isInstalled ? isInstalled(game) : false}
            inMemory={inMemory ? inMemory(game) : false}
            className="h-full"
          />
        ))}
      </div>
      {search.hasNextPage && (
        <button
          type="button"
          onClick={() => search.fetchNextPage()}
          disabled={search.isFetchingNextPage}
          className="mx-auto mt-6 flex items-center gap-2 rounded-xl border border-border bg-surface px-5 py-2.5 text-sm font-bold text-text shadow-card transition-colors hover:border-accent hover:text-accent disabled:opacity-50 cursor-pointer"
        >
          {search.isFetchingNextPage ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ChevronDown className="size-4" />
          )}
          {search.isFetchingNextPage ? 'Loading more titles…' : 'Load More Games'}
        </button>
      )}
    </section>
  )
}

function FilterPill({
  icon: Icon,
  label,
  onClear,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClear: () => void
}) {
  return (
    <motion.span
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={DROPDOWN_SPRING}
      className="inline-flex items-center gap-1.5 rounded-xl border border-accent/45 bg-accent/15 pl-2.5 pr-1.5 py-1 text-xs font-bold text-accent shadow-xs"
    >
      <Icon className="size-3 shrink-0" />
      <span>{label}</span>
      <button
        type="button"
        onClick={onClear}
        aria-label={`Remove ${label} filter`}
        className="flex size-4 items-center justify-center rounded-md text-accent/80 transition-colors hover:bg-accent/25 hover:text-white cursor-pointer"
      >
        <X className="size-3" />
      </button>
    </motion.span>
  )
}

function HubRow({
  feed,
  query,
  fallbackData,
  inLibrary,
  inWishlist,
  isInstalled,
  inMemory,
}: {
  feed: HubFeedId
  query: { data?: HubGame[]; isPending: boolean }
  fallbackData?: HubGame[]
  inLibrary: HubLibraryMatcher
  inWishlist?: HubLibraryMatcher
  isInstalled?: HubLibraryMatcher
  inMemory?: HubLibraryMatcher
}) {
  const navigate = useNavigate()
  const speed = useAnimationSpeed()
  const reduceMotion = useAppearanceSettingsStore((s) => s.reduceMotion)
  const profile = useUserTasteProfile()

  const [shuffleSeed, setShuffleSeed] = useState(0)
  const { title } = HUB_FEEDS[feed]
  let subtitle: string = HUB_FEEDS[feed].subtitle
  const baseGames = query.data && query.data.length > 0 ? query.data : (fallbackData ?? [])
  const games = useMemo(() => {
    if (shuffleSeed === 0 || baseGames.length <= 2) return baseGames
    const copy = [...baseGames]
    let state = (shuffleSeed * 2654435761) >>> 0
    for (let i = copy.length - 1; i > 0; i--) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0
      const j = state % (i + 1)
      const tmp = copy[i]
      copy[i] = copy[j]
      copy[j] = tmp
    }
    return copy
  }, [baseGames, shuffleSeed])
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  if (feed === 'recommended') {
    if (profile.hasSufficientHistory) {
      if (profile.topPlayedGameNames.length > 0) {
        subtitle = `Because you play: ${profile.topPlayedGameNames.slice(0, 3).join(' • ')}`
      } else if (profile.genres.length > 0) {
        subtitle = `Based on your interest in ${profile.genres
          .slice(0, 2)
          .map((g) => g.name)
          .join(' & ')}`
      }
    } else {
      subtitle = 'Trending masterworks to kickstart your personalized game feed'
    }
  }

  function scroll(direction: 'left' | 'right') {
    if (!scrollContainerRef.current) return
    const offset = direction === 'left' ? -420 : 420
    scrollContainerRef.current.scrollBy({ left: offset, behavior: 'smooth' })
  }

  if (query.isPending && games.length === 0) {
    return (
      <section className="flex flex-col gap-3">
        <RowHeader feed={feed} title={title} subtitle={subtitle} />
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: 6 }, (_, index) => (
            <div
              key={index}
              className="h-72 w-48 shrink-0 animate-pulse rounded-2xl border border-border bg-surface"
            />
          ))}
        </div>
      </section>
    )
  }

  if (games.length === 0) return null

  return (
    <motion.section
      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 * speed, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col gap-3"
    >
      <RowHeader
        feed={feed}
        title={title}
        subtitle={subtitle}
        count={games.length}
        onShuffle={() => {
          setShuffleSeed((s) => s + 1)
          scrollContainerRef.current?.scrollTo({ left: 0, behavior: 'smooth' })
        }}
        onScrollLeft={() => scroll('left')}
        onScrollRight={() => scroll('right')}
        onBrowseAll={() => navigate(`/hub/browse/${feed}`)}
      />

      <div
        ref={scrollContainerRef}
        className="flex items-stretch gap-4 overflow-x-auto pb-3 pt-1 pr-1 scrollbar-none"
      >
        {games.map((game) => {
          const affinity = feed === 'recommended' ? calculateGameAffinity(game, profile) : null
          return (
            <div key={game.igdb_id} className="flex w-48 sm:w-52 shrink-0 flex-col">
              <HubGameCard
                game={game}
                feed={feed}
                inLibrary={inLibrary(game)}
                inWishlist={inWishlist ? inWishlist(game) : false}
                isInstalled={isInstalled ? isInstalled(game) : false}
                inMemory={inMemory ? inMemory(game) : false}
                nexusMatch={affinity?.matchPercentage}
                matchReason={affinity?.reason}
                breakdownChips={affinity?.breakdown?.highlightChips}
                className="h-full"
              />
            </div>
          )
        })}

        {/* End-of-shelf "See More" Card */}
        <button
          type="button"
          onClick={() => navigate(`/hub/browse/${feed}`)}
          className="group flex w-48 sm:w-52 shrink-0 flex-col items-center justify-center gap-3 self-stretch rounded-2xl border border-dashed border-border bg-surface/50 p-5 text-muted transition-all hover:border-accent/60 hover:bg-accent/5 hover:text-accent hover:shadow-lg cursor-pointer"
        >
          <span className="flex size-12 items-center justify-center rounded-2xl bg-accent/15 text-accent shadow-sm ring-1 ring-accent/30 transition-transform group-hover:scale-110">
            <ArrowRight className="size-6" />
          </span>
          <div className="text-center">
            <div className="text-sm font-bold text-text group-hover:text-accent transition-colors">
              Browse All
            </div>
            <div className="text-[11px] text-subtle mt-0.5">Explore full {title} feed</div>
          </div>
        </button>
      </div>
    </motion.section>
  )
}

function RowHeader({
  feed,
  title,
  subtitle,
  count,
  onShuffle,
  onScrollLeft,
  onScrollRight,
  onBrowseAll,
}: {
  feed?: HubFeedId
  title: string
  subtitle: string
  count?: number
  onShuffle?: () => void
  onScrollLeft?: () => void
  onScrollRight?: () => void
  onBrowseAll?: () => void
}) {
  const iconConfig = (feed &&
    {
      'new-releases': {
        icon: Sparkles,
        color: 'text-emerald-400',
        badgeBg: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400',
        label: 'New',
      },
      'coming-soon': {
        icon: Clock,
        color: 'text-cyan-400',
        badgeBg: 'bg-cyan-500/15 border-cyan-500/30 text-cyan-400',
        label: 'Upcoming',
      },
      'top-rated': {
        icon: Flame,
        color: 'text-amber-400',
        badgeBg: 'bg-amber-500/15 border-amber-500/30 text-amber-400',
        label: 'Trending',
      },
      recommended: {
        icon: Sparkles,
        color: 'text-violet-400',
        badgeBg: 'bg-violet-500/15 border-violet-500/30 text-violet-400',
        label: 'For You',
      },
    }[feed]) || {
    icon: Trophy,
    color: 'text-accent',
    badgeBg: 'bg-accent/15 border-accent/30 text-accent',
    label: 'Results',
  }

  const Icon = iconConfig.icon

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-2xl border border-border bg-surface-raised shadow-xs">
          <Icon className={cn('size-5', iconConfig.color)} />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base sm:text-lg font-bold tracking-tight text-text">{title}</h2>
            <span
              className={cn(
                'rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                iconConfig.badgeBg,
              )}
            >
              {iconConfig.label}
            </span>
            {count !== undefined && (
              <span className="rounded-full border border-border bg-surface-raised px-2 py-0.5 text-[10px] font-semibold text-subtle">
                {count} games
              </span>
            )}
          </div>
          <p className="text-xs text-subtle">{subtitle}</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {onShuffle && (
          <button
            type="button"
            onClick={onShuffle}
            title="Shuffle & discover different games in this shelf"
            className="flex items-center gap-1 rounded-xl border border-border bg-surface px-2.5 py-1.5 text-xs font-bold text-subtle transition-all hover:border-accent/50 hover:text-accent active:scale-95 cursor-pointer"
          >
            <Shuffle className="size-3.5" />
            <span className="hidden sm:inline">Shuffle</span>
          </button>
        )}
        {onBrowseAll && (
          <button
            type="button"
            onClick={onBrowseAll}
            className="flex items-center gap-1 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-bold text-subtle transition-colors hover:border-accent/50 hover:text-accent cursor-pointer"
          >
            <span>See All</span>
            <ArrowRight className="size-3.5" />
          </button>
        )}

        {onScrollLeft && onScrollRight && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Scroll left"
              onClick={onScrollLeft}
              className="flex size-8 items-center justify-center rounded-xl border border-border bg-surface text-subtle shadow-xs transition-all hover:border-accent/50 hover:bg-surface-raised hover:text-text active:scale-95 cursor-pointer"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Scroll right"
              onClick={onScrollRight}
              className="flex size-8 items-center justify-center rounded-xl border border-border bg-surface text-subtle shadow-xs transition-all hover:border-accent/50 hover:bg-surface-raised hover:text-text active:scale-95 cursor-pointer"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function PanelSection({
  icon: Icon,
  label,
  description,
  scrollable = false,
  children,
}: {
  icon?: React.ComponentType<{ className?: string }>
  label: string
  description?: string
  scrollable?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {Icon && <Icon className="size-3.5 text-accent" />}
          <span className="text-xs font-bold uppercase tracking-wider text-text">{label}</span>
        </div>
        {description && <span className="text-[10px] text-subtle">{description}</span>}
      </div>
      <div
        className={
          scrollable
            ? 'flex max-h-36 flex-wrap gap-1.5 overflow-y-auto pr-1 scrollbar-thin'
            : 'flex flex-wrap gap-1.5'
        }
      >
        {children}
      </div>
    </div>
  )
}

function PanelChip({
  label,
  active,
  onClick,
  icon: Icon,
}: {
  label: string
  active: boolean
  onClick: () => void
  icon?: React.ComponentType<{ className?: string }>
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all duration-150 active:scale-95 cursor-pointer',
        active
          ? 'border-accent bg-accent text-white shadow-sm shadow-accent/30 font-bold'
          : 'border-border bg-surface-raised/60 text-muted hover:border-accent/40 hover:bg-surface-raised hover:text-text',
      )}
    >
      {Icon && <Icon className={cn('size-3', active ? 'text-white' : 'text-accent')} />}
      <span>{label}</span>
    </button>
  )
}

function CustomYearRangePicker({
  yearFrom,
  yearTo,
  onSetYearRange,
  onClear,
}: {
  yearFrom: number | null
  yearTo: number | null
  onSetYearRange: (from: number | null, to: number | null) => void
  onClear: () => void
}) {
  const [fromStr, setFromStr] = useState(yearFrom !== null ? String(yearFrom) : '')
  const [toStr, setToStr] = useState(yearTo !== null ? String(yearTo) : '')

  useEffect(() => {
    setFromStr(yearFrom !== null ? String(yearFrom) : '')
  }, [yearFrom])

  useEffect(() => {
    setToStr(yearTo !== null ? String(yearTo) : '')
  }, [yearTo])

  const commit = (fText: string, tText: string) => {
    const fVal = fText.trim().length === 4 ? parseInt(fText.trim(), 10) : null
    const tVal = tText.trim().length === 4 ? parseInt(tText.trim(), 10) : null
    onSetYearRange(
      fVal !== null && !isNaN(fVal) ? fVal : null,
      tVal !== null && !isNaN(tVal) ? tVal : null,
    )
  }

  return (
    <div className="mt-3 w-full rounded-2xl border border-border bg-surface-raised/60 p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-[11px] font-bold text-text">Custom Year Range</span>
        {(yearFrom !== null || yearTo !== null || fromStr || toStr) && (
          <button
            type="button"
            onClick={() => {
              setFromStr('')
              setToStr('')
              onClear()
            }}
            className="text-[10px] text-accent hover:underline font-semibold cursor-pointer"
          >
            Clear range
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 flex-1">
          <span className="text-[11px] text-subtle font-medium">From:</span>
          <input
            type="text"
            inputMode="numeric"
            maxLength={4}
            placeholder="e.g. 2015"
            value={fromStr}
            onChange={(e) => {
              const text = e.target.value.replace(/\D/g, '').slice(0, 4)
              setFromStr(text)
              commit(text, toStr)
            }}
            className="w-full rounded-xl border border-border bg-surface px-2.5 py-1 text-xs text-text outline-none focus:border-accent font-medium"
          />
        </div>
        <span className="text-subtle font-bold">—</span>
        <div className="flex items-center gap-1.5 flex-1">
          <span className="text-[11px] text-subtle font-medium">To:</span>
          <input
            type="text"
            inputMode="numeric"
            maxLength={4}
            placeholder="e.g. 2026"
            value={toStr}
            onChange={(e) => {
              const text = e.target.value.replace(/\D/g, '').slice(0, 4)
              setToStr(text)
              commit(fromStr, text)
            }}
            className="w-full rounded-xl border border-border bg-surface px-2.5 py-1 text-xs text-text outline-none focus:border-accent font-medium"
          />
        </div>
      </div>
    </div>
  )
}
