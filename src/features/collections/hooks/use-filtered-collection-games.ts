import { useMemo } from 'react'
import { useGamesInCollection } from './use-collections'
import {
  matchesSearch,
  matchesFilters,
  compareGames,
} from '@/features/library/hooks/use-filtered-games'
import { useLibraryUiStore, isFiltersEmpty } from '@/features/library/store/library-ui-store'

/**
 * Same search/sort/advanced-filter behavior as the main library views
 * (`useFilteredGames`), just sourced from `useGamesInCollection` instead
 * of the full library — reuses `matchesSearch`/`matchesFilters`/
 * `compareGames` rather than re-implementing them so the two never
 * drift. `'all'` is passed as `compareGames`'s scope since collections
 * have no "Recently Played" special-case to apply.
 */
export function useFilteredCollectionGames(collectionId: string | undefined) {
  const gamesQuery = useGamesInCollection(collectionId)
  const search = useLibraryUiStore((s) => s.search)
  const sort = useLibraryUiStore((s) => s.sort)
  const filters = useLibraryUiStore((s) => s.filters)

  const games = useMemo(() => {
    const source = gamesQuery.data ?? []
    return source
      .filter((game) => matchesSearch(game, search))
      .filter((game) => isFiltersEmpty(filters) || matchesFilters(game, filters))
      .sort((a, b) => compareGames(a, b, sort, 'all'))
  }, [gamesQuery.data, search, sort, filters])

  return {
    games,
    isPending: gamesQuery.isPending,
    isError: gamesQuery.isError,
    error: gamesQuery.error,
  }
}
