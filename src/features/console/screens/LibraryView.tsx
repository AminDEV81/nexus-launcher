import React, { useMemo, useState } from 'react'
import { Search, SlidersHorizontal, ArrowUpDown } from 'lucide-react'
import type { Game } from '@/types/models'
import { useConsoleStore } from '../store/console-store'
import { CONSOLE_STRINGS } from '../i18n/strings'
import { FocusScope, useFocusable } from '../nav/FocusScope'
import { ConsoleTile } from '../ui/Tile'

export type LibraryFilterPill = 'all' | 'installed' | 'favorites' | 'recent' | 'unplayed'
export type LibrarySortMode = 'recent' | 'playtime' | 'name' | 'rating'

export interface LibraryViewProps {
  games: Game[]
  runningGameIds: Set<string>
  onSelectGame: (game: Game) => void
  onFocusGame: (game: Game) => void
  onToggleFavorite: (game: Game) => void
}

const FilterChip: React.FC<{
  id: string
  label: string
  active: boolean
  onSelect: () => void
}> = ({ id, label, active, onSelect }) => {
  const { focusProps, isFocused } = useFocusable<HTMLButtonElement>({
    id,
    scopeId: 'console_library_filters',
    onConfirm: onSelect,
  })
  return (
    <button
      type="button"
      {...focusProps}
      className={`rounded-full px-5 py-2 text-[1rem] font-medium outline-none transition-all ${
        isFocused
          ? 'bg-white text-black border-transparent scale-105 shadow-lg'
          : active
            ? 'bg-white/16 text-white border-transparent'
            : 'bg-white/8 text-white/70 border-transparent'
      }`}
    >
      {label}
    </button>
  )
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  games,
  runningGameIds,
  onSelectGame,
  onFocusGame,
  onToggleFavorite,
}) => {
  const lang = useConsoleStore((s) => s.language)
  const openOsk = useConsoleStore((s) => s.openOsk)
  const t = CONSOLE_STRINGS[lang]

  const [filter, setFilter] = useState<LibraryFilterPill>('all')
  const [sort, setSort] = useState<LibrarySortMode>('recent')
  const [searchQuery, setSearchQuery] = useState('')

  const searchBtnFocus = useFocusable<HTMLButtonElement>({
    id: 'lib_search_osk_btn',
    scopeId: 'console_library_filters',
    onConfirm: () => {
      openOsk('Search Library (English / فارسی)', searchQuery, (val) => {
        setSearchQuery(val)
      })
    },
  })

  const sortBtnFocus = useFocusable<HTMLButtonElement>({
    id: 'lib_sort_cycle_btn',
    scopeId: 'console_library_filters',
    onConfirm: () => {
      const order: LibrarySortMode[] = ['recent', 'playtime', 'name', 'rating']
      const next = order[(order.indexOf(sort) + 1) % order.length]
      setSort(next)
    },
  })

  const filteredGames = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const base = games.filter((g) => !g.is_hidden && !g.is_memory && !g.is_wishlist)

    const byFilter = base.filter((g) => {
      if (filter === 'installed') return g.is_installed
      if (filter === 'favorites') return g.is_favorite
      if (filter === 'recent') return Boolean(g.last_played_at)
      if (filter === 'unplayed') return g.total_playtime_seconds === 0
      return true
    })

    const bySearch = q
      ? byFilter.filter(
          (g) =>
            g.name.toLowerCase().includes(q) || g.genres.some((gn) => gn.toLowerCase().includes(q)),
        )
      : byFilter

    return [...bySearch].sort((a, b) => {
      if (sort === 'playtime') return b.total_playtime_seconds - a.total_playtime_seconds
      if (sort === 'name') return a.name.localeCompare(b.name)
      if (sort === 'rating') {
        const ra = a.opencritic_score ?? a.metacritic_score ?? a.user_rating ?? 0
        const rb = b.opencritic_score ?? b.metacritic_score ?? b.user_rating ?? 0
        return rb - ra
      }
      const la = a.last_played_at ? Date.parse(a.last_played_at) : 0
      const lb = b.last_played_at ? Date.parse(b.last_played_at) : 0
      return lb - la
    })
  }, [games, filter, sort, searchQuery])

  return (
    <div className="space-y-6 pb-16">
      {/* Filter & Search Bar */}
      <FocusScope
        id="console_library_filters"
        orientation="horizontal"
        className="flex flex-wrap items-center justify-between gap-4 px-2 pb-1"
      >
        <div className="flex flex-wrap items-center gap-2.5">
          <FilterChip
            id="lib_filter_all"
            label={`All (${games.filter((g) => !g.is_hidden && !g.is_memory && !g.is_wishlist).length})`}
            active={filter === 'all'}
            onSelect={() => setFilter('all')}
          />
          <FilterChip
            id="lib_filter_installed"
            label="Installed"
            active={filter === 'installed'}
            onSelect={() => setFilter('installed')}
          />
          <FilterChip
            id="lib_filter_fav"
            label={t.home.favorites}
            active={filter === 'favorites'}
            onSelect={() => setFilter('favorites')}
          />
          <FilterChip
            id="lib_filter_recent"
            label={t.home.recentlyPlayed}
            active={filter === 'recent'}
            onSelect={() => setFilter('recent')}
          />
          <FilterChip
            id="lib_filter_unplayed"
            label="Unplayed"
            active={filter === 'unplayed'}
            onSelect={() => setFilter('unplayed')}
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            {...searchBtnFocus.focusProps}
            className={`flex items-center gap-2 rounded-full px-5 py-2 text-[1rem] font-medium outline-none transition-all ${
              searchBtnFocus.isFocused
                ? 'bg-white text-black border-transparent scale-105'
                : 'bg-white/8 text-white/80 border-transparent'
            }`}
          >
            <Search className="w-4 h-4 text-white/70" />
            <span>{searchQuery ? `"${searchQuery}"` : `${t.actions.search}...`}</span>
          </button>

          <button
            type="button"
            {...sortBtnFocus.focusProps}
            className={`flex items-center gap-2 rounded-full px-5 py-2 text-[1rem] font-medium outline-none transition-all ${
              sortBtnFocus.isFocused
                ? 'bg-white text-black border-transparent scale-105'
                : 'bg-white/8 text-white/80 border-transparent'
            }`}
          >
            <ArrowUpDown className="w-4 h-4 text-white/70" />
            <span>Sort: {sort}</span>
          </button>
        </div>
      </FocusScope>

      {/* Grid */}
      {filteredGames.length === 0 ? (
        <div className="p-16 text-center rounded-3xl border border-transparent bg-white/[0.06]">
          <SlidersHorizontal className="w-10 h-10 text-slate-400 mx-auto mb-3" />
          <p className="text-lg font-bold text-white">No games match the current filter</p>
        </div>
      ) : (
        <FocusScope
          id="console_library_grid"
          orientation="grid"
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6 justify-items-center py-2"
        >
          {filteredGames.map((game) => (
            <ConsoleTile
              key={game.id}
              id={`lib_tile_${game.id}`}
              scopeId="console_library_grid"
              game={game}
              isRunning={runningGameIds.has(game.id)}
              onSelect={() => onSelectGame(game)}
              onFocusTile={() => onFocusGame(game)}
              onOptionsTile={() => onToggleFavorite(game)}
            />
          ))}
        </FocusScope>
      )}
    </div>
  )
}
