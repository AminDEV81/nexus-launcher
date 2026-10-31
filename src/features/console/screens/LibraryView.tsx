import React, { useMemo, useState } from 'react'
import { Search, SlidersHorizontal, ArrowUpDown } from 'lucide-react'
import type { Game } from '@/types/models'
import { useConsoleStore } from '../store/console-store'
import { CONSOLE_THEMES } from '../theme/tokens'
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
  isLight: boolean
  onSelect: () => void
}> = ({ id, label, active, isLight, onSelect }) => {
  const { focusProps, isFocused } = useFocusable<HTMLButtonElement>({
    id,
    scopeId: 'console_library_filters',
    onConfirm: onSelect,
  })
  return (
    <button
      type="button"
      {...focusProps}
      className={`rounded-2xl border px-4 py-2 text-xs font-extrabold uppercase tracking-wider outline-none transition-all cursor-pointer ${
        isFocused
          ? 'scale-105 border-cyan-300 bg-cyan-400 text-slate-950 shadow-lg'
          : active
            ? isLight
              ? 'border-indigo-600 bg-indigo-600 text-white'
              : 'border-cyan-400/50 bg-cyan-500/20 text-cyan-300'
            : isLight
              ? 'border-slate-300 bg-white/85 text-slate-700 hover:bg-white'
              : 'border-white/12 bg-white/[0.06] text-slate-300 hover:bg-white/10'
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
  const themeId = useConsoleStore((s) => s.theme)
  const isLight = Boolean(CONSOLE_THEMES[themeId]?.isLight)
  const openOsk = useConsoleStore((s) => s.openOsk)
  const t = CONSOLE_STRINGS.en

  const [filter, setFilter] = useState<LibraryFilterPill>('all')
  const [sort, setSort] = useState<LibrarySortMode>('recent')
  const [searchQuery, setSearchQuery] = useState('')

  const searchBtnFocus = useFocusable<HTMLButtonElement>({
    id: 'lib_search_osk_btn',
    scopeId: 'console_library_filters',
    onConfirm: () => {
      openOsk('Search Library Games & Genres', searchQuery, (val) => {
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
    <div className="space-y-6 pb-20">
      {/* Filter & Search Bar */}
      <FocusScope
        id="console_library_filters"
        orientation="horizontal"
        className={`flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-4 ${
          isLight ? 'border-slate-300 bg-white/85 shadow-xs' : 'border-white/12 bg-white/[0.04]'
        }`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <FilterChip
            id="lib_filter_all"
            label={`All (${games.filter((g) => !g.is_hidden && !g.is_memory && !g.is_wishlist).length})`}
            active={filter === 'all'}
            isLight={isLight}
            onSelect={() => setFilter('all')}
          />
          <FilterChip
            id="lib_filter_installed"
            label="Installed"
            active={filter === 'installed'}
            isLight={isLight}
            onSelect={() => setFilter('installed')}
          />
          <FilterChip
            id="lib_filter_fav"
            label={t.home.favorites}
            active={filter === 'favorites'}
            isLight={isLight}
            onSelect={() => setFilter('favorites')}
          />
          <FilterChip
            id="lib_filter_recent"
            label={t.home.recentlyPlayed}
            active={filter === 'recent'}
            isLight={isLight}
            onSelect={() => setFilter('recent')}
          />
          <FilterChip
            id="lib_filter_unplayed"
            label="Unplayed"
            active={filter === 'unplayed'}
            isLight={isLight}
            onSelect={() => setFilter('unplayed')}
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            {...searchBtnFocus.focusProps}
            className={`flex items-center gap-2 rounded-2xl border px-4 py-2 text-xs font-extrabold uppercase tracking-wider outline-none transition-all cursor-pointer ${
              searchBtnFocus.isFocused
                ? 'scale-105 border-cyan-300 bg-cyan-400 text-slate-950 shadow-lg'
                : isLight
                  ? 'border-slate-300 bg-slate-100 text-slate-800'
                  : 'border-cyan-400/40 bg-cyan-500/15 text-cyan-200'
            }`}
          >
            <Search className="size-4" />
            <span>{searchQuery ? `"${searchQuery}"` : `${t.actions.search}...`}</span>
          </button>

          <button
            type="button"
            {...sortBtnFocus.focusProps}
            className={`flex items-center gap-2 rounded-2xl border px-4 py-2 text-xs font-extrabold uppercase tracking-wider outline-none transition-all cursor-pointer ${
              sortBtnFocus.isFocused
                ? 'scale-105 border-cyan-300 bg-cyan-400 text-slate-950 shadow-lg'
                : isLight
                  ? 'border-slate-300 bg-slate-100 text-slate-800'
                  : 'border-white/15 bg-white/10 text-slate-200'
            }`}
          >
            <ArrowUpDown className="size-4" />
            <span>Sort: {sort}</span>
          </button>
        </div>
      </FocusScope>

      {/* Grid */}
      {filteredGames.length === 0 ? (
        <div
          className={`rounded-3xl border p-16 text-center ${
            isLight ? 'border-slate-300 bg-white/85' : 'border-white/12 bg-white/[0.04]'
          }`}
        >
          <SlidersHorizontal className="mx-auto mb-3 size-10 text-slate-400" />
          <p className={`text-lg font-extrabold ${isLight ? 'text-slate-900' : 'text-white'}`}>
            No games match the current filter
          </p>
        </div>
      ) : (
        <FocusScope
          id="console_library_grid"
          orientation="grid"
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-6 gap-y-16 justify-items-center py-4 pb-12"
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
