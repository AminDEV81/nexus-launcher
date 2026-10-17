import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type SortOption = 'custom' | 'name' | 'recently-played' | 'recently-added' | 'playtime'
export type ViewMode = 'grid' | 'list'

export type PlaytimeTierId = 'unplayed' | 'under-2h' | '2h-10h' | '10h-50h' | '50h-plus'
export type InstallStatusFilter = 'all' | 'installed' | 'not_installed'

export type FilterField = 'genres' | 'platforms' | 'developers' | 'years' | 'tags' | 'playtime'

export interface AdvancedFilters {
  genres: Set<string>
  platforms: Set<string>
  developers: Set<string>
  years: Set<string>
  yearRange: { from: number | null; to: number | null }
  tags: Set<string>
  playtime: Set<PlaytimeTierId>
  favoritesOnly: boolean
  installStatus: InstallStatusFilter
  minScore: number | null
}

function emptyFilters(): AdvancedFilters {
  return {
    genres: new Set(),
    platforms: new Set(),
    developers: new Set(),
    years: new Set(),
    yearRange: { from: null, to: null },
    tags: new Set(),
    playtime: new Set(),
    favoritesOnly: false,
    installStatus: 'all',
    minScore: null,
  }
}

export function isFiltersEmpty(filters: AdvancedFilters): boolean {
  return (
    filters.genres.size === 0 &&
    filters.platforms.size === 0 &&
    filters.developers.size === 0 &&
    filters.years.size === 0 &&
    filters.yearRange.from === null &&
    filters.yearRange.to === null &&
    filters.tags.size === 0 &&
    filters.playtime.size === 0 &&
    !filters.favoritesOnly &&
    filters.installStatus === 'all' &&
    filters.minScore === null
  )
}

interface LibraryUiState {
  search: string
  setSearch: (value: string) => void
  sort: SortOption
  setSort: (value: SortOption) => void
  viewMode: ViewMode
  setViewMode: (value: ViewMode) => void
  filters: AdvancedFilters
  toggleFilter: (field: FilterField, value: string) => void
  toggleFavoritesOnly: () => void
  setInstallStatus: (status: InstallStatusFilter) => void
  setMinScore: (score: number | null) => void
  setYearRange: (from: number | null, to: number | null) => void
  clearFilters: () => void
  customOrder: string[]
  setCustomOrder: (order: string[]) => void
  reorderGames: (activeId: string, overId: string, allIds?: string[]) => void
  wishlistCustomOrder: string[]
  setWishlistCustomOrder: (order: string[]) => void
  reorderWishlistGames: (activeId: string, overId: string, allIds?: string[]) => void
}

export const useLibraryUiStore = create<LibraryUiState>()(
  persist(
    (set) => ({
      search: '',
      setSearch: (search) => set({ search }),
      sort: 'name',
      setSort: (sort) => set({ sort }),
      viewMode: 'grid',
      setViewMode: (viewMode) => set({ viewMode }),
      filters: emptyFilters(),
      toggleFilter: (field, value) =>
        set((state) => {
          const next = new Set(state.filters[field])
          if (next.has(value)) next.delete(value)
          else next.add(value)
          return { filters: { ...state.filters, [field]: next } }
        }),
      toggleFavoritesOnly: () =>
        set((state) => ({
          filters: {
            ...state.filters,
            favoritesOnly: !state.filters.favoritesOnly,
          },
        })),
      setInstallStatus: (installStatus) =>
        set((state) => ({
          filters: {
            ...state.filters,
            installStatus,
          },
        })),
      setMinScore: (minScore) =>
        set((state) => ({
          filters: {
            ...state.filters,
            minScore,
          },
        })),
      setYearRange: (from, to) =>
        set((state) => ({
          filters: {
            ...state.filters,
            yearRange: { from, to },
          },
        })),
      clearFilters: () => set({ filters: emptyFilters() }),
      customOrder: [],
      setCustomOrder: (customOrder) => set({ customOrder }),
      reorderGames: (activeId, overId, allIds) =>
        set((state) => {
          let currentOrder =
            state.customOrder.length > 0 ? [...state.customOrder] : allIds ? [...allIds] : []
          if (allIds && allIds.length > 0) {
            const existingSet = new Set(currentOrder)
            const missing = allIds.filter((id) => !existingSet.has(id))
            if (missing.length > 0) {
              currentOrder = [...currentOrder, ...missing]
            }
          }
          const oldIndex = currentOrder.indexOf(activeId)
          const newIndex = currentOrder.indexOf(overId)
          if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return state
          const nextOrder = [...currentOrder]
          const [moved] = nextOrder.splice(oldIndex, 1)
          nextOrder.splice(newIndex, 0, moved)
          return { customOrder: nextOrder, sort: 'custom' }
        }),
      wishlistCustomOrder: [],
      setWishlistCustomOrder: (wishlistCustomOrder) => set({ wishlistCustomOrder }),
      reorderWishlistGames: (activeId, overId, allIds) =>
        set((state) => {
          let currentOrder =
            state.wishlistCustomOrder.length > 0
              ? [...state.wishlistCustomOrder]
              : allIds
                ? [...allIds]
                : []
          if (allIds && allIds.length > 0) {
            const existingSet = new Set(currentOrder)
            const missing = allIds.filter((id) => !existingSet.has(id))
            if (missing.length > 0) {
              currentOrder = [...currentOrder, ...missing]
            }
          }
          const oldIndex = currentOrder.indexOf(activeId)
          const newIndex = currentOrder.indexOf(overId)
          if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return state
          const nextOrder = [...currentOrder]
          const [moved] = nextOrder.splice(oldIndex, 1)
          nextOrder.splice(newIndex, 0, moved)
          return { wishlistCustomOrder: nextOrder }
        }),
    }),
    {
      name: 'nexus-library-ui',
      partialize: (state) => ({
        viewMode: state.viewMode,
        customOrder: state.customOrder,
        wishlistCustomOrder: state.wishlistCustomOrder,
      }),
    },
  ),
)
