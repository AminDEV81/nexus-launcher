import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import * as hubService from '@/services/hub'
import type {
  HubGame,
  HubGameDetails,
  HubGenre,
  HubPlatform,
  HubSearchFilters,
} from '@/types/models'

/**
 * 12-Hour Persistent Cache Window for Game Hub:
 * Prevents Game Hub from auto-refreshing every time the user enters the Hub tab or restarts the app.
 * Auto-refreshes only once every 12 hours (or immediately when the user clicks the manual Refresh button).
 */
export const HUB_CACHE_TTL_MS = 12 * 60 * 60 * 1000 // 12 hours in ms
const HUB_STORAGE_PREFIX = 'nexus_hub_shelf_v6_'

interface PersistedShelfPayload {
  updatedAt: number
  data: HubGame[]
}

function readPersistedShelf(shelfKey: string): PersistedShelfPayload | null {
  try {
    const raw = localStorage.getItem(`${HUB_STORAGE_PREFIX}${shelfKey}`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PersistedShelfPayload
    if (
      !parsed ||
      typeof parsed.updatedAt !== 'number' ||
      !Array.isArray(parsed.data) ||
      parsed.data.length === 0
    ) {
      return null
    }
    if (Date.now() - parsed.updatedAt > HUB_CACHE_TTL_MS) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function writePersistedShelf(shelfKey: string, data: HubGame[]): void {
  try {
    if (!Array.isArray(data) || data.length === 0) return
    const payload: PersistedShelfPayload = {
      updatedAt: Date.now(),
      data,
    }
    localStorage.setItem(`${HUB_STORAGE_PREFIX}${shelfKey}`, JSON.stringify(payload))
  } catch {
    // Ignore storage quota errors
  }
}

export function clearPersistedHubShelves(): void {
  try {
    for (const key of ['new-releases', 'coming-soon', 'top-rated', 'recommended', 'discounted']) {
      localStorage.removeItem(`${HUB_STORAGE_PREFIX}${key}`)
    }
  } catch {
    // Ignore
  }
}

function createShelfQueryOptions(shelfKey: string, fetcher: () => Promise<HubGame[]>) {
  const persisted = readPersistedShelf(shelfKey)
  return {
    queryKey: ['hub', shelfKey] as const,
    queryFn: async () => {
      const fresh = await fetcher()
      writePersistedShelf(shelfKey, fresh)
      return fresh
    },
    initialData: persisted?.data,
    initialDataUpdatedAt: persisted?.updatedAt,
    staleTime: HUB_CACHE_TTL_MS,
    gcTime: HUB_CACHE_TTL_MS,
    refetchInterval: HUB_CACHE_TTL_MS,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  }
}

/** Built-in canonical IGDB genres so filter chips render immediately without waiting for network. */
export const FALLBACK_HUB_GENRES: HubGenre[] = [
  { id: 31, name: 'Adventure' },
  { id: 33, name: 'Arcade' },
  { id: 35, name: 'Card & Board Game' },
  { id: 4, name: 'Fighting' },
  { id: 25, name: "Hack and slash/Beat 'em up" },
  { id: 32, name: 'Indie' },
  { id: 36, name: 'MOBA' },
  { id: 7, name: 'Music' },
  { id: 8, name: 'Platform' },
  { id: 2, name: 'Point-and-click' },
  { id: 9, name: 'Puzzle' },
  { id: 10, name: 'Racing' },
  { id: 11, name: 'Real Time Strategy (RTS)' },
  { id: 12, name: 'Role-playing (RPG)' },
  { id: 5, name: 'Shooter' },
  { id: 13, name: 'Simulator' },
  { id: 14, name: 'Sport' },
  { id: 15, name: 'Strategy' },
  { id: 24, name: 'Tactical' },
  { id: 16, name: 'Turn-based strategy (TBS)' },
  { id: 34, name: 'Visual Novel' },
]

/** Built-in canonical IGDB platforms so platform pills render immediately. */
export const FALLBACK_HUB_PLATFORMS: HubPlatform[] = [
  { id: 6, name: 'PC (Microsoft Windows)', abbreviation: 'PC' },
  { id: 167, name: 'PlayStation 5', abbreviation: 'PS5' },
  { id: 48, name: 'PlayStation 4', abbreviation: 'PS4' },
  { id: 169, name: 'Xbox Series X|S', abbreviation: 'Series X|S' },
  { id: 49, name: 'Xbox One', abbreviation: 'XONE' },
  { id: 130, name: 'Nintendo Switch', abbreviation: 'Switch' },
  { id: 508, name: 'Nintendo Switch 2', abbreviation: 'Switch 2' },
  { id: 3, name: 'Linux', abbreviation: 'Linux' },
  { id: 14, name: 'Mac', abbreviation: 'Mac' },
]

export function useHubNewReleases() {
  return useQuery(createShelfQueryOptions('new-releases', hubService.getHubNewReleases))
}

export function useHubComingSoon() {
  return useQuery(createShelfQueryOptions('coming-soon', hubService.getHubComingSoon))
}

export function useHubTopRated() {
  return useQuery(createShelfQueryOptions('top-rated', hubService.getHubTopRated))
}

export function useHubRecommended() {
  return useQuery(createShelfQueryOptions('recommended', hubService.getHubRecommended))
}

export function useHubDiscountedGames(enabled = true) {
  const opts = createShelfQueryOptions('discounted', hubService.getHubDiscountedGames)
  return useQuery({
    ...opts,
    enabled,
  })
}

/**
 * Fetch all four home shelves in parallel (`newReleases`, `comingSoon`,
 * `topRated`, `recommended`).
 */
export function useHubHomeFeed() {
  const newReleases = useHubNewReleases()
  const comingSoon = useHubComingSoon()
  const topRated = useHubTopRated()
  const recommended = useHubRecommended()
  return {
    newReleases,
    comingSoon,
    topRated,
    recommended,
  }
}

export function useRefreshHubCatalog() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      clearPersistedHubShelves()
      return hubService.refreshHubCatalog()
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['hub'] })
      await queryClient.refetchQueries({ queryKey: ['hub'], type: 'active' })
    },
  })
}

function findCachedHubGame(
  queryClient: ReturnType<typeof useQueryClient>,
  igdbId: number,
): HubGameDetails | undefined {
  const entries = queryClient.getQueriesData<unknown>({ queryKey: ['hub'] })
  for (const [, data] of entries) {
    if (!data) continue
    if (Array.isArray(data)) {
      const match = (data as HubGame[]).find((g) => g && g.igdb_id === igdbId)
      if (match) {
        return {
          ...match,
          genres: match.genres ?? [],
          platforms: match.platforms ?? [],
          developer: null,
          publisher: null,
          trailer_url: null,
          videos: [],
          screenshot_urls: match.backdrop_url ? [match.backdrop_url] : [],
          metacritic_score: match.metacritic_score ?? null,
          opencritic_score: match.opencritic_score ?? null,
          steam_app_id: null,
          system_requirements: null,
          download_size: null,
        }
      }
    } else if (
      typeof data === 'object' &&
      data !== null &&
      'pages' in data &&
      Array.isArray((data as { pages: unknown[] }).pages)
    ) {
      for (const page of (data as { pages: HubGame[][] }).pages) {
        if (!Array.isArray(page)) continue
        const match = page.find((g) => g && g.igdb_id === igdbId)
        if (match) {
          return {
            ...match,
            developer: null,
            publisher: null,
            trailer_url: null,
            videos: [],
            screenshot_urls: match.backdrop_url ? [match.backdrop_url] : [],
            metacritic_score: match.metacritic_score ?? null,
            opencritic_score: match.opencritic_score ?? null,
            steam_app_id: null,
            system_requirements: null,
            download_size: null,
          }
        }
      }
    }
  }
  return undefined
}

export function useHubGameDetails(igdbId: number, expectedName?: string | null) {
  const queryClient = useQueryClient()
  const cached = findCachedHubGame(queryClient, igdbId)
  const effectiveExpectedName = expectedName?.trim() || cached?.name || null

  return useQuery({
    queryKey: ['hub', 'game', igdbId, (effectiveExpectedName ?? '').toLowerCase()],
    queryFn: async () => {
      const details = await hubService.getHubGameDetails(igdbId, effectiveExpectedName)
      if (details && (details.metacritic_score != null || details.opencritic_score != null)) {
        queryClient.setQueryData(
          ['hub', 'critic-scores', details.name.trim().toLowerCase(), details.release_date ?? ''],
          {
            metacritic: details.metacritic_score ?? null,
            opencritic: details.opencritic_score ?? null,
          },
        )
        for (const shelfKey of ['new-releases', 'coming-soon', 'top-rated', 'recommended', 'discounted']) {
          queryClient.setQueryData<HubGame[]>(['hub', shelfKey], (old) => {
            if (!Array.isArray(old)) return old
            let changed = false
            const next = old.map((g) => {
              if (g.igdb_id === details.igdb_id || g.name.toLowerCase() === details.name.toLowerCase()) {
                changed = true
                return {
                  ...g,
                  metacritic_score: details.metacritic_score ?? g.metacritic_score,
                  opencritic_score: details.opencritic_score ?? g.opencritic_score,
                }
              }
              return g
            })
            if (changed) writePersistedShelf(shelfKey, next)
            return changed ? next : old
          })
        }
      }
      return details
    },
    enabled: igdbId > 0,
    staleTime: HUB_CACHE_TTL_MS,
    gcTime: HUB_CACHE_TTL_MS,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    placeholderData: () => cached,
  })
}

export function useSimilarHubGames(igdbId: number) {
  return useQuery({
    queryKey: ['hub', 'similar', igdbId],
    queryFn: () => hubService.getHubSimilarGames(igdbId),
    enabled: igdbId > 0,
    staleTime: HUB_CACHE_TTL_MS,
    gcTime: HUB_CACHE_TTL_MS,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  })
}

/**
 * Catalog search, paged 24 at a time behind "Load more".
 * Runs when either `query` is >= 2 chars OR at least one filter/sort in `filters` is set.
 */
export function useHubSearch(query: string, filters: HubSearchFilters = {}) {
  const trimmed = query.trim()
  const gIds = filters.genreIds && filters.genreIds.length > 0 ? filters.genreIds : undefined
  const pIds =
    filters.platformIds && filters.platformIds.length > 0 ? filters.platformIds : undefined
  const hasFilter = Boolean(
    (gIds && gIds.length > 0) ||
      filters.genreId != null ||
      (pIds && pIds.length > 0) ||
      filters.platformId != null ||
      (filters.release && filters.release.length > 0) ||
      filters.yearFrom != null ||
      filters.yearTo != null ||
      filters.minRating != null ||
      (filters.sort && filters.sort.length > 0) ||
      (filters.gameCategory && filters.gameCategory !== 'all') ||
      (filters.gameMode && filters.gameMode !== 'all') ||
      filters.onlyReleased,
  )
  const enabled = trimmed.length >= 2 || hasFilter
  const normalizedFilters: HubSearchFilters = {
    genreId: filters.genreId ?? null,
    genreIds: gIds,
    platformId: filters.platformId ?? null,
    platformIds: pIds,
    release: filters.release ?? null,
    yearFrom: filters.yearFrom ?? null,
    yearTo: filters.yearTo ?? null,
    minRating: filters.minRating ?? null,
    sort: filters.sort ?? null,
    gameCategory: filters.gameCategory ?? null,
    gameMode: filters.gameMode ?? null,
    onlyReleased: filters.onlyReleased ?? null,
  }

  return useInfiniteQuery({
    queryKey: ['hub', 'search', trimmed.toLowerCase(), normalizedFilters],
    queryFn: ({ pageParam }) =>
      hubService.searchHubGames(trimmed, pageParam, normalizedFilters),
    initialPageParam: 0,
    getNextPageParam: (lastPage: HubGame[], allPages: HubGame[][]) =>
      lastPage.length < 16
        ? undefined
        : allPages.length * hubService.HUB_SEARCH_PAGE_SIZE,
    enabled,
    staleTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  })
}

/** IGDB's fixed genre list for the filter chips — with instant fallback. */
export function useHubGenres() {
  return useQuery({
    queryKey: ['hub', 'genres'],
    queryFn: hubService.listHubGenres,
    placeholderData: FALLBACK_HUB_GENRES,
    staleTime: 24 * 60 * 60_000,
    refetchOnWindowFocus: false,
  })
}

/** Curated modern platforms for the filter dropdown — with instant fallback. */
export function useHubPlatforms() {
  return useQuery({
    queryKey: ['hub', 'platforms'],
    queryFn: hubService.listHubPlatforms,
    placeholderData: FALLBACK_HUB_PLATFORMS,
    staleTime: 24 * 60 * 60_000,
    refetchOnWindowFocus: false,
  })
}

/** Full listing behind a shelf's "More" button — paged 24 at a time. */
export function useHubFeed(feed: string, enabled = true) {
  return useInfiniteQuery({
    queryKey: ['hub', 'feed', feed],
    queryFn: ({ pageParam }) => hubService.getHubFeed(feed, pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage: HubGame[], allPages: HubGame[][]) =>
      lastPage.length < hubService.HUB_FEED_PAGE_SIZE
        ? undefined
        : allPages.length * hubService.HUB_FEED_PAGE_SIZE,
    enabled,
    staleTime: HUB_CACHE_TTL_MS,
    gcTime: HUB_CACHE_TTL_MS,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  })
}

export function useAddGameFromHub() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (igdbId: number) => hubService.addGameFromHub(igdbId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['games'] })
    },
  })
}

export function useAddGameToWishlist() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (igdbId: number) => hubService.addGameToWishlist(igdbId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['games'] })
    },
  })
}
