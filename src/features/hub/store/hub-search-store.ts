import { create } from 'zustand'
import type { HubSearchFilters } from '@/types/models'

/**
 * Search + filter + sort state for the Game Hub, kept in a store (not
 * component state) so it survives navigating to a game's page and back —
 * the user returns to their exact term, filters, and sort, not a reset
 * hub. Session memory only: deliberately not persisted to disk.
 */
interface HubSearchState extends HubSearchFilters {
  query: string
  setQuery: (query: string) => void
  genreIds: number[]
  toggleGenreId: (genreId: number) => void
  setGenreIds: (genreIds: number[]) => void
  setGenreId: (genreId: number | null) => void
  platformIds: number[]
  togglePlatformId: (platformId: number) => void
  setPlatformIds: (platformIds: number[]) => void
  setPlatformId: (platformId: number | null) => void
  release: string | null
  setRelease: (release: string | null) => void
  yearFrom: number | null
  yearTo: number | null
  setYearRange: (from: number | null, to: number | null) => void
  minRating: number | null
  setMinRating: (minRating: number | null) => void
  sort: string | null
  setSort: (sort: string | null) => void
  clearFilters: () => void
}

export const useHubSearchStore = create<HubSearchState>((set) => ({
  query: '',
  setQuery: (query) => set({ query }),
  genreId: null,
  genreIds: [],
  toggleGenreId: (id) =>
    set((state) => {
      const next = state.genreIds.includes(id)
        ? state.genreIds.filter((x) => x !== id)
        : [...state.genreIds, id]
      return {
        genreIds: next,
        genreId: next.length === 1 ? next[0] : null,
      }
    }),
  setGenreIds: (genreIds) =>
    set({
      genreIds,
      genreId: genreIds.length === 1 ? genreIds[0] : null,
    }),
  setGenreId: (genreId) =>
    set({
      genreId,
      genreIds: genreId !== null ? [genreId] : [],
    }),
  platformId: null,
  platformIds: [],
  togglePlatformId: (id) =>
    set((state) => {
      const next = state.platformIds.includes(id)
        ? state.platformIds.filter((x) => x !== id)
        : [...state.platformIds, id]
      return {
        platformIds: next,
        platformId: next.length === 1 ? next[0] : null,
      }
    }),
  setPlatformIds: (platformIds) =>
    set({
      platformIds,
      platformId: platformIds.length === 1 ? platformIds[0] : null,
    }),
  setPlatformId: (platformId) =>
    set({
      platformId,
      platformIds: platformId !== null ? [platformId] : [],
    }),
  release: null,
  yearFrom: null,
  yearTo: null,
  setRelease: (release) => {
    if (!release) {
      set({ release: null, yearFrom: null, yearTo: null })
      return
    }
    if (release.includes('-')) {
      const [f, t] = release.split('-')
      const from = parseInt(f, 10)
      const to = parseInt(t, 10)
      set({
        release,
        yearFrom: !isNaN(from) ? from : null,
        yearTo: !isNaN(to) ? to : null,
      })
    } else if (release.endsWith('+')) {
      const from = parseInt(release.replace('+', ''), 10)
      set({ release, yearFrom: !isNaN(from) ? from : null, yearTo: null })
    } else {
      const single = parseInt(release, 10)
      if (!isNaN(single) && single >= 1970 && single <= 2100) {
        set({ release, yearFrom: single, yearTo: single })
      } else {
        set({ release, yearFrom: null, yearTo: null })
      }
    }
  },
  setYearRange: (from, to) => {
    if (from === null && to === null) {
      set({ yearFrom: null, yearTo: null, release: null })
      return
    }
    // Retain from and to exactly as entered — do NOT swap them in state so inputs never jump!
    let releaseStr: string | null = null
    const validFrom = from !== null && from >= 1970 && from <= 2030
    const validTo = to !== null && to >= 1970 && to <= 2030

    if (validFrom && validTo) {
      const minYear = Math.min(from, to)
      const maxYear = Math.max(from, to)
      releaseStr = minYear === maxYear ? `${minYear}` : `${minYear}-${maxYear}`
    } else if (validFrom) {
      releaseStr = `${from}+`
    } else if (validTo) {
      releaseStr = `-${to}`
    }

    set({ yearFrom: from, yearTo: to, release: releaseStr })
  },
  minRating: null,
  setMinRating: (minRating) => set({ minRating }),
  sort: null,
  setSort: (sort) => set({ sort }),
  clearFilters: () =>
    set({
      genreId: null,
      genreIds: [],
      platformId: null,
      platformIds: [],
      release: null,
      yearFrom: null,
      yearTo: null,
      minRating: null,
      sort: null,
    }),
}))
