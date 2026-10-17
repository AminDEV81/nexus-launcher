import { useMemo } from 'react'
import { useGames } from './use-games'
import { useLibraryUiStore, isFiltersEmpty } from '../store/library-ui-store'
import type { AdvancedFilters, PlaytimeTierId } from '../store/library-ui-store'
import { isGameUnreleased, parseStoredUtcDate } from '../utils/format'
import type { Game } from '@/types/models'

export type LibraryScope = 'all' | 'recent' | 'favorites' | 'installed' | 'hidden' | 'wishlist'

export function getPlaytimeTier(seconds: number): PlaytimeTierId {
  if (seconds <= 0) return 'unplayed'
  if (seconds < 2 * 3600) return 'under-2h'
  if (seconds < 10 * 3600) return '2h-10h'
  if (seconds < 50 * 3600) return '10h-50h'
  return '50h-plus'
}

export function matchesScope(game: Game, scope: LibraryScope): boolean {
  if (game.is_memory) return false
  const unreleased = isGameUnreleased(game.release_date) && !game.is_installed
  switch (scope) {
    case 'all':
      return !game.is_hidden && !game.is_wishlist && !unreleased
    case 'recent':
      return !game.is_hidden && game.last_played_at !== null
    case 'favorites':
      return !game.is_hidden && game.is_favorite
    case 'installed':
      return !game.is_hidden && game.is_installed
    case 'hidden':
      return game.is_hidden
    case 'wishlist':
      return game.is_wishlist || unreleased
  }
}

export function matchesSearch(game: Game, query: string): boolean {
  if (!query.trim()) return true
  const needle = query.trim().toLowerCase()
  return (
    game.name.toLowerCase().includes(needle) ||
    (game.developer?.toLowerCase().includes(needle) ?? false) ||
    (game.publisher?.toLowerCase().includes(needle) ?? false) ||
    game.genres.some((genre) => genre.toLowerCase().includes(needle))
  )
}

export function matchesFilters(game: Game, filters: AdvancedFilters): boolean {
  if (filters.favoritesOnly && !game.is_favorite) {
    return false
  }
  if (filters.installStatus === 'installed' && !game.is_installed) {
    return false
  }
  if (filters.installStatus === 'not_installed' && game.is_installed) {
    return false
  }
  if (filters.minScore !== null) {
    const bestScore = Math.max(game.metacritic_score ?? 0, game.opencritic_score ?? 0)
    if (bestScore < filters.minScore) {
      return false
    }
  }
  if (
    filters.genres.size > 0 &&
    !game.genres.some((genre) => filters.genres.has(genre))
  ) {
    return false
  }
  if (
    filters.platforms.size > 0 &&
    !game.platforms.some((platform) => filters.platforms.has(platform))
  ) {
    return false
  }
  if (filters.developers.size > 0 && !(game.developer && filters.developers.has(game.developer))) {
    return false
  }
  if (filters.yearRange.from !== null || filters.yearRange.to !== null) {
    const rawYear = game.release_date?.slice(0, 4)
    if (!rawYear) return false
    const y = parseInt(rawYear, 10)
    if (isNaN(y)) return false
    const minYear =
      filters.yearRange.from !== null && filters.yearRange.to !== null
        ? Math.min(filters.yearRange.from, filters.yearRange.to)
        : filters.yearRange.from
    const maxYear =
      filters.yearRange.from !== null && filters.yearRange.to !== null
        ? Math.max(filters.yearRange.from, filters.yearRange.to)
        : filters.yearRange.to
    if (minYear !== null && y < minYear) return false
    if (maxYear !== null && y > maxYear) return false
  } else if (filters.years.size > 0) {
    const year = game.release_date?.slice(0, 4)
    if (!year || !filters.years.has(year)) return false
  }
  if (filters.tags.size > 0 && !game.tag_ids.some((id) => filters.tags.has(id))) {
    return false
  }
  if (filters.playtime.size > 0) {
    const tier = getPlaytimeTier(game.total_playtime_seconds)
    if (!filters.playtime.has(tier)) return false
  }
  return true
}

function chronoDesc(a: string | null | undefined, b: string | null | undefined): number {
  const aMs = a ? (parseStoredUtcDate(a)?.getTime() ?? 0) : 0
  const bMs = b ? (parseStoredUtcDate(b)?.getTime() ?? 0) : 0
  return bMs - aMs
}

export function compareGames(
  a: Game,
  b: Game,
  sort: string,
  scope: LibraryScope,
  customOrder?: string[],
): number {
  if (scope === 'recent' && sort === 'name') {
    return chronoDesc(a.last_played_at, b.last_played_at)
  }

  switch (sort) {
    case 'custom': {
      if (!customOrder || customOrder.length === 0) return a.name.localeCompare(b.name)
      const idxA = customOrder.indexOf(a.id)
      const idxB = customOrder.indexOf(b.id)
      if (idxA === -1 && idxB === -1) return a.name.localeCompare(b.name)
      if (idxA === -1) return 1
      if (idxB === -1) return -1
      return idxA - idxB
    }
    case 'recently-played':
      return chronoDesc(a.last_played_at, b.last_played_at)
    case 'recently-added':
      return chronoDesc(a.added_at, b.added_at)
    case 'playtime':
      return b.total_playtime_seconds - a.total_playtime_seconds
    case 'name':
    default:
      return a.name.localeCompare(b.name)
  }
}

export function useFilteredGames(scope: LibraryScope) {
  const gamesQuery = useGames()
  const search = useLibraryUiStore((s) => s.search)
  const sort = useLibraryUiStore((s) => s.sort)
  const filters = useLibraryUiStore((s) => s.filters)
  const customOrder = useLibraryUiStore((s) => s.customOrder)

  const games = useMemo(() => {
    const source = gamesQuery.data ?? []
    return source
      .filter((game) => matchesScope(game, scope))
      .filter((game) => matchesSearch(game, search))
      .filter((game) => isFiltersEmpty(filters) || matchesFilters(game, filters))
      .sort((a, b) => compareGames(a, b, sort, scope, customOrder))
  }, [gamesQuery.data, scope, search, sort, filters, customOrder])

  return {
    games,
    isPending: gamesQuery.isPending,
    isError: gamesQuery.isError,
    error: gamesQuery.error,
  }
}
