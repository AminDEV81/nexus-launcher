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

const HUB_REFRESH = {
  staleTime: 3 * 60_000,
  refetchInterval: 5 * 60_000,
  refetchOnWindowFocus: true,
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
  return useQuery({
    queryKey: ['hub', 'new-releases'],
    queryFn: hubService.getHubNewReleases,
    ...HUB_REFRESH,
  })
}

export function useHubComingSoon() {
  return useQuery({
    queryKey: ['hub', 'coming-soon'],
    queryFn: hubService.getHubComingSoon,
    ...HUB_REFRESH,
  })
}

export function useHubTopRated() {
  return useQuery({
    queryKey: ['hub', 'top-rated'],
    queryFn: hubService.getHubTopRated,
    ...HUB_REFRESH,
  })
}

export function useHubRecommended() {
  return useQuery({
    queryKey: ['hub', 'recommended'],
    queryFn: hubService.getHubRecommended,
    ...HUB_REFRESH,
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
    mutationFn: () => hubService.refreshHubCatalog(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['hub'] })
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
          }
        }
      }
    }
  }
  return undefined
}

export function useHubGameDetails(igdbId: number) {
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: ['hub', 'game', igdbId],
    queryFn: () => hubService.getHubGameDetails(igdbId),
    enabled: igdbId > 0,
    staleTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    placeholderData: () => findCachedHubGame(queryClient, igdbId),
  })
}

export function useSimilarHubGames(igdbId: number) {
  return useQuery({
    queryKey: ['hub', 'similar', igdbId],
    queryFn: () => hubService.getHubSimilarGames(igdbId),
    enabled: igdbId > 0,
    staleTime: 10 * 60_000,
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
    queryFn: ({ pageParam }) => hubService.searchHubGames(trimmed, pageParam, normalizedFilters),
    initialPageParam: 0,
    getNextPageParam: (lastPage: HubGame[], allPages: HubGame[][]) =>
      lastPage.length < 16 ? undefined : allPages.length * hubService.HUB_SEARCH_PAGE_SIZE,
    enabled,
    staleTime: 2 * 60_000,
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
  })
}

/** Curated modern platforms for the filter dropdown — with instant fallback. */
export function useHubPlatforms() {
  return useQuery({
    queryKey: ['hub', 'platforms'],
    queryFn: hubService.listHubPlatforms,
    placeholderData: FALLBACK_HUB_PLATFORMS,
    staleTime: 24 * 60 * 60_000,
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
    staleTime: 5 * 60_000,
  })
}

export function useAddGameFromHub() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (igdbId: number) => hubService.addGameFromHub(igdbId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['games'] })
      queryClient.invalidateQueries({ queryKey: ['hub', 'recommended'] })
    },
  })
}

export function useAddGameToWishlist() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (igdbId: number) => hubService.addGameToWishlist(igdbId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['games'] })
      queryClient.invalidateQueries({ queryKey: ['hub', 'recommended'] })
    },
  })
}
