import { useState, useRef, useEffect } from 'react'
import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Search,
  LayoutGrid,
  List,
  ArrowLeft,
  X,
  RotateCcw,
  Tag as TagIcon,
  ChevronDown,
  GripVertical,
  ArrowDownAZ,
  Clock,
  CalendarPlus,
  Timer,
  Check,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTags } from '../hooks/use-tags'
import { useLibraryUiStore, isFiltersEmpty } from '../store/library-ui-store'
import type { SortOption } from '../store/library-ui-store'

const SORT_OPTIONS: {
  value: SortOption
  label: string
  description: string
  icon: React.ComponentType<{ className?: string }>
}[] = [
  {
    value: 'custom',
    label: 'Manual Order',
    description: 'Custom drag & drop sequence',
    icon: GripVertical,
  },
  {
    value: 'name',
    label: 'Alphabetical',
    description: 'A to Z title order',
    icon: ArrowDownAZ,
  },
  {
    value: 'recently-played',
    label: 'Last Played',
    description: 'Most recent session first',
    icon: Clock,
  },
  {
    value: 'recently-added',
    label: 'Recently Added',
    description: 'Newest additions first',
    icon: CalendarPlus,
  },
  {
    value: 'playtime',
    label: 'Total Playtime',
    description: 'Most hours logged',
    icon: Timer,
  },
]

interface LibraryToolbarProps {
  title: string
  count: number
  /** Shows a back arrow before the title — used by the collection
   *  detail page, which isn't a top-level nav destination. */
  onBack?: () => void
  /** Rendered right after the search box, before sort — the advanced
   *  filters button lives here so it reads as part of the same filter
   *  row rather than a bolted-on extra. */
  filtersSlot?: ReactNode
  /** Rendered at the end of the toolbar, after grid/list toggle — e.g.
   *  the collection detail page's "Delete Collection" button. */
  actions?: ReactNode
}

export function LibraryToolbar({
  title,
  count,
  onBack,
  filtersSlot,
  actions,
}: LibraryToolbarProps) {
  const search = useLibraryUiStore((s) => s.search)
  const setSearch = useLibraryUiStore((s) => s.setSearch)
  const sort = useLibraryUiStore((s) => s.sort)
  const setSort = useLibraryUiStore((s) => s.setSort)
  const viewMode = useLibraryUiStore((s) => s.viewMode)
  const setViewMode = useLibraryUiStore((s) => s.setViewMode)
  const filters = useLibraryUiStore((s) => s.filters)
  const toggleFilter = useLibraryUiStore((s) => s.toggleFilter)
  const clearFilters = useLibraryUiStore((s) => s.clearFilters)
  const { data: tags } = useTags()

  const [sortOpen, setSortOpen] = useState(false)
  const sortRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!sortOpen) return
    function handleClickOutside(event: MouseEvent) {
      if (sortRef.current && !sortRef.current.contains(event.target as Node)) {
        setSortOpen(false)
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setSortOpen(false)
      }
    }
    window.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [sortOpen])

  const tagMap = new Map((tags ?? []).map((t) => [t.id, t]))
  const hasActiveFilters = !isFiltersEmpty(filters)
  const currentSortConfig = SORT_OPTIONS.find((opt) => opt.value === sort) ?? SORT_OPTIONS[1]
  const CurrentSortIcon = currentSortConfig.icon

  return (
    <div className="flex shrink-0 flex-col gap-2 px-6 pt-4 pb-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Title and Back */}
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label="Back"
              className="flex size-8 items-center justify-center rounded-xl border border-border bg-surface text-muted transition-colors hover:bg-surface-raised hover:text-text active:scale-95"
            >
              <ArrowLeft className="size-4" />
            </button>
          )}
          <div>
            <h1 className="text-xl font-bold tracking-tight text-text">{title}</h1>
            <p className="text-xs text-muted">
              {count} {count === 1 ? 'game' : 'games'}
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Search Bar */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setSearch('')
              }}
              placeholder="Search library..."
              className="w-48 sm:w-56 rounded-xl border border-border bg-surface py-1.5 pl-8 pr-7 text-xs text-text placeholder:text-muted outline-none transition-all focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-text"
              >
                <X className="size-3" />
              </button>
            )}
          </div>

          {/* Advanced Filters Popover */}
          {filtersSlot}

          {/* Custom Animated Sort Dropdown */}
          <div ref={sortRef} className="relative">
            <button
              type="button"
              onClick={() => setSortOpen((open) => !open)}
              className={cn(
                'flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all duration-200 shadow-sm active:scale-95',
                sortOpen
                  ? 'border-accent/40 bg-accent-soft text-accent ring-2 ring-accent/20'
                  : 'border-border bg-surface text-text hover:bg-surface-raised hover:border-border-hover',
              )}
            >
              <CurrentSortIcon className="size-3.5 text-accent" />
              <span>{currentSortConfig.label}</span>
              <ChevronDown
                className={cn(
                  'size-3.5 text-muted transition-transform duration-200',
                  sortOpen && 'rotate-180 text-accent',
                )}
              />
            </button>

            <AnimatePresence>
              {sortOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.94 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.94 }}
                  transition={{ type: 'spring', stiffness: 440, damping: 28 }}
                  className="absolute right-0 top-[calc(100%+8px)] z-50 w-56 rounded-2xl border border-border bg-surface-raised/95 backdrop-blur-xl p-1.5 shadow-2xl ring-1 ring-border/80"
                >
                  <div className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted">
                    Sort Collection By
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {SORT_OPTIONS.map((option) => {
                      const Icon = option.icon
                      const active = sort === option.value
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => {
                            setSort(option.value)
                            setSortOpen(false)
                          }}
                          className={cn(
                            'group flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs transition-all active:scale-[0.98]',
                            active
                              ? 'bg-accent-soft text-accent font-bold shadow-xs'
                              : 'text-text hover:bg-surface hover:text-text',
                          )}
                        >
                          <div className="flex items-center gap-2.5">
                            <div
                              className={cn(
                                'flex size-6 items-center justify-center rounded-lg transition-colors',
                                active
                                  ? 'bg-accent text-white'
                                  : 'bg-surface text-muted group-hover:text-text',
                              )}
                            >
                              <Icon className="size-3.5" />
                            </div>
                            <div>
                              <div className="font-semibold">{option.label}</div>
                              <div className="text-[10px] text-muted font-normal">
                                {option.description}
                              </div>
                            </div>
                          </div>
                          {active && <Check className="size-3.5 text-accent shrink-0" />}
                        </button>
                      )
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Grid / List Toggle */}
          <div className="flex items-center rounded-xl border border-border bg-surface/50 p-0.5">
            <ViewButton
              icon={LayoutGrid}
              active={viewMode === 'grid'}
              onClick={() => setViewMode('grid')}
            />
            <ViewButton
              icon={List}
              active={viewMode === 'list'}
              onClick={() => setViewMode('list')}
            />
          </div>

          {actions}
        </div>
      </div>

      {/* Active Filter Chips Strip */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-[11px] font-semibold text-muted">Active:</span>

          {/* Tags */}
          {Array.from(filters.tags).map((id) => {
            const tag = tagMap.get(id)
            if (!tag) return null
            return (
              <button
                key={id}
                type="button"
                onClick={() => toggleFilter('tags', id)}
                className="group flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-opacity hover:opacity-80"
                style={{
                  borderColor: tag.color,
                  backgroundColor: `${tag.color}1f`,
                  color: tag.color,
                }}
              >
                <TagIcon className="size-2.5" />
                <span>{tag.name}</span>
                <X className="size-2.5 opacity-60 group-hover:opacity-100" />
              </button>
            )
          })}

          {/* Genres */}
          {Array.from(filters.genres).map((genre) => (
            <button
              key={genre}
              type="button"
              onClick={() => toggleFilter('genres', genre)}
              className="group flex items-center gap-1 rounded-full border border-accent/40 bg-accent-soft px-2.5 py-0.5 text-[11px] font-medium text-accent hover:bg-accent/20"
            >
              <span>{genre}</span>
              <X className="size-2.5 opacity-60 group-hover:opacity-100" />
            </button>
          ))}

          {/* Platforms */}
          {Array.from(filters.platforms).map((plat) => (
            <button
              key={plat}
              type="button"
              onClick={() => toggleFilter('platforms', plat)}
              className="group flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-0.5 text-[11px] font-medium text-text hover:bg-surface-raised"
            >
              <span>{plat}</span>
              <X className="size-2.5 text-muted group-hover:text-text" />
            </button>
          ))}

          {/* Developers */}
          {Array.from(filters.developers).map((dev) => (
            <button
              key={dev}
              type="button"
              onClick={() => toggleFilter('developers', dev)}
              className="group flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-0.5 text-[11px] font-medium text-text hover:bg-surface-raised"
            >
              <span>{dev}</span>
              <X className="size-2.5 text-muted group-hover:text-text" />
            </button>
          ))}

          {/* Years */}
          {Array.from(filters.years).map((year) => (
            <button
              key={year}
              type="button"
              onClick={() => toggleFilter('years', year)}
              className="group flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-0.5 text-[11px] font-medium text-text hover:bg-surface-raised"
            >
              <span>{year}</span>
              <X className="size-2.5 text-muted group-hover:text-text" />
            </button>
          ))}

          {/* Reset All */}
          <button
            type="button"
            onClick={clearFilters}
            className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold text-muted transition-colors hover:text-text"
          >
            <RotateCcw className="size-2.5" />
            Clear
          </button>
        </div>
      )}
    </div>
  )
}

function ViewButton({
  icon: Icon,
  active,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex size-7 items-center justify-center rounded-lg transition-all',
        active ? 'bg-accent text-white shadow-xs' : 'text-muted hover:bg-surface hover:text-text',
      )}
    >
      <Icon className="size-3.5" />
    </button>
  )
}
