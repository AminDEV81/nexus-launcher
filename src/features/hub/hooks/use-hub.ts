import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as hubService from '@/services/hub'
import type { HubGame, HubSearchFilters } from '@/types/models'

/**
 * Hub queries poll periodically rather than only on mount: the feed is
 * supposed to stay current ("new games keep showing up") even while the
 * window stays open. 30-minute refetch + refetch-on-focus is plenty —
 * IGDB's catalog doesn't change faster than that, and it keeps us far
 * away from rate limits.
 */
const HUB_REFRESH = {
  staleTime: 15 * 60_000,
  refetchInterval: 30 * 60_000,
  refetchOnWindowFocus: true,
}

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

export function useHubGameDetails(igdbId: number) {
  return useQuery({
    queryKey: ['hub', 'game', igdbId],
    queryFn: () => hubService.getHubGameDetails(igdbId),
    staleTime: 10 * 60_000,
  })
}

/** Catalog search, paged 24 at a time behind "Load more". Infinite
 *  query (not a plain one) so each loaded page survives remounts —
 *  coming back from a game's page restores every page already fetched,
 *  not just the first. Any active filter/sort also enables it without a
 *  term — a pure browse mode. */
export function useHubSearch(query: string, filters: HubSearchFilters) {
  return useInfiniteQuery({
    queryKey: ['hub', 'search', query, filters],
    queryFn: ({ pageParam }) => hubService.searchHubGames(query, pageParam, filters),
    initialPageParam: 0,
    getNextPageParam: (lastPage: HubGame[], allPages: HubGame[][]) =>
      lastPage.length < hubService.HUB_SEARCH_PAGE_SIZE
        ? undefined
        : allPages.length * hubService.HUB_SEARCH_PAGE_SIZE,
    enabled:
      query.trim().length >= 2 ||
      filters.genreId != null ||
      Boolean(filters.genreIds && filters.genreIds.length > 0) ||
      filters.platformId != null ||
      Boolean(filters.platformIds && filters.platformIds.length > 0) ||
      Boolean(filters.release) ||
      filters.yearFrom != null ||
      filters.yearTo != null ||
      filters.minRating != null ||
      Boolean(filters.sort),
    staleTime: 60_000,
  })
}

/** IGDB's fixed genre list for the filter chips — cached for the whole
 *  session; the catalog's genre set changes at geological speed. */
export function useHubGenres() {
  return useQuery({
    queryKey: ['hub', 'genres'],
    queryFn: hubService.listHubGenres,
    staleTime: 24 * 60 * 60_000,
  })
}

/** Curated modern platforms for the filter dropdown, same caching. */
export function useHubPlatforms() {
  return useQuery({
    queryKey: ['hub', 'platforms'],
    queryFn: hubService.listHubPlatforms,
    staleTime: 24 * 60 * 60_000,
  })
}

/** Full listing behind a shelf's "More" button — paged 24 at a time,
 *  same infinite-query pattern as the search so loaded pages survive
 *  remounts (coming back from a game's page keeps the grid). */
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
    staleTime: 15 * 60_000,
  })
}

export function useAddGameFromHub() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (igdbId: number) => hubService.addGameFromHub(igdbId),
    onSuccess: () => {
      // The library list is the hub's "in library" source of truth (see
      // utils/in-library.ts), so refreshing it flips every badge and
      // the detail page's button in one shot.
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
