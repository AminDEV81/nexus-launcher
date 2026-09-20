import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  SlidersHorizontal,
  X,
  RotateCcw,
  Tag as TagIcon,
  Gamepad2,
  Monitor,
  Building2,
  Calendar,
  Check,
  Clock,
  Heart,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useGames } from '../hooks/use-games'
import { useTags } from '../hooks/use-tags'
import { useLibraryUiStore, isFiltersEmpty } from '../store/library-ui-store'
import type { PlaytimeTierId } from '../store/library-ui-store'
import type { Tag } from '@/types/models'

const PLAYTIME_FILTERS: { id: PlaytimeTierId; label: string; range: string }[] = [
  { id: 'unplayed', label: 'Unplayed', range: '0h' },
  { id: 'under-2h', label: '< 2 Hours', range: 'Short' },
  { id: '2h-10h', label: '2 – 10 Hours', range: 'Medium' },
  { id: '10h-50h', label: '10 – 50 Hours', range: 'Long' },
  { id: '50h-plus', label: '50+ Hours', range: 'Master' },
]

/** Distinct, sorted option lists derived from whatever's actually in the
 *  library right now. */
function useFilterOptions() {
  const { data: games } = useGames()
  const { data: tags } = useTags()

  return useMemo(() => {
    const genres = new Set<string>()
    const platforms = new Set<string>()
    const developers = new Set<string>()
    const years = new Set<string>()
    const usedTagIds = new Set<string>()

    for (const game of games ?? []) {
      game.genres.forEach((genre) => genres.add(genre))
      game.platforms.forEach((platform) => platforms.add(platform))
      if (game.developer) developers.add(game.developer)
      if (game.release_date) years.add(game.release_date.slice(0, 4))
      game.tag_ids.forEach((id) => usedTagIds.add(id))
    }

    const usedTags = (tags ?? []).filter((tag) => usedTagIds.has(tag.id))

    return {
      genres: [...genres].sort(),
      platforms: [...platforms].sort(),
      developers: [...developers].sort(),
      years: [...years].sort().reverse(),
      tags: usedTags,
    }
  }, [games, tags])
}

export function AdvancedFiltersPanel() {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const filters = useLibraryUiStore((s) => s.filters)
  const toggleFilter = useLibraryUiStore((s) => s.toggleFilter)
  const toggleFavoritesOnly = useLibraryUiStore((s) => s.toggleFavoritesOnly)
  const setYearRange = useLibraryUiStore((s) => s.setYearRange)
  const clearFilters = useLibraryUiStore((s) => s.clearFilters)
  const options = useFilterOptions()

  const activeCount =
    (filters.favoritesOnly ? 1 : 0) +
    filters.genres.size +
    filters.platforms.size +
    filters.developers.size +
    filters.years.size +
    (filters.yearRange.from !== null || filters.yearRange.to !== null ? 1 : 0) +
    filters.tags.size +
    filters.playtime.size

  useEffect(() => {
    if (!open) return
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const hasAnyOptions =
    options.genres.length > 0 ||
    options.platforms.length > 0 ||
    options.developers.length > 0 ||
    options.years.length > 0 ||
    options.tags.length > 0 ||
    PLAYTIME_FILTERS.length > 0

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all duration-200 shadow-sm active:scale-95',
          activeCount > 0
            ? 'border-accent/40 bg-accent-soft text-accent ring-2 ring-accent/20'
            : 'border-border bg-surface text-text hover:bg-surface-raised hover:border-border-hover',
        )}
      >
        <SlidersHorizontal className="size-3.5" />
        <span>Filters</span>
        {activeCount > 0 && (
          <span className="flex size-4 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white shadow-xs">
            {activeCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.94 }}
            transition={{ type: 'spring', stiffness: 440, damping: 28 }}
            className="absolute right-0 top-[calc(100%+8px)] z-50 w-80 sm:w-96 rounded-2xl border border-border bg-surface-raised/95 backdrop-blur-xl p-4 shadow-2xl ring-1 ring-border/80"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex size-7 items-center justify-center rounded-lg bg-accent-soft text-accent">
                  <SlidersHorizontal className="size-4" />
                </div>
                <div>
                  <span className="text-xs font-bold text-text">Library Filters</span>
                  <p className="text-[10px] text-muted">Refine by tags, genres, platforms & more</p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                {!isFiltersEmpty(filters) && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-muted transition-colors hover:bg-surface hover:text-text"
                  >
                    <RotateCcw className="size-3" />
                    Reset
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex size-6 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-text"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            </div>

            {/* Body */}
            {hasAnyOptions ? (
              <div className="mt-3 flex max-h-96 flex-col gap-4 overflow-y-auto pr-1">
                {/* Favorites Quick Filter */}
                <button
                  type="button"
                  onClick={toggleFavoritesOnly}
                  className={cn(
                    'flex w-full items-center justify-between rounded-xl border p-2.5 text-xs font-bold transition-all cursor-pointer select-none',
                    filters.favoritesOnly
                      ? 'border-red-500/40 bg-red-500/10 text-red-400 ring-2 ring-red-500/20 shadow-sm'
                      : 'border-border/80 bg-surface/70 text-muted hover:border-border hover:bg-surface hover:text-text',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        'flex size-6 items-center justify-center rounded-lg border',
                        filters.favoritesOnly
                          ? 'border-red-500/30 bg-red-500/20 text-red-400'
                          : 'border-border/60 bg-surface text-subtle',
                      )}
                    >
                      <Heart className={cn('size-3.5', filters.favoritesOnly && 'fill-red-400')} />
                    </div>
                    <span>Favorites Only</span>
                  </div>
                  {filters.favoritesOnly && (
                    <span className="flex size-4 items-center justify-center rounded-full bg-red-500 text-[10px] text-white">
                      <Check className="size-2.5" />
                    </span>
                  )}
                </button>

                <TagFilterSection
                  tags={options.tags}
                  selected={filters.tags}
                  onToggle={(value) => toggleFilter('tags', value)}
                />
                <PlaytimeFilterSection
                  selected={filters.playtime}
                  onToggle={(value) => toggleFilter('playtime', value)}
                />
                <FilterSection
                  icon={Gamepad2}
                  label="Genre"
                  options={options.genres}
                  selected={filters.genres}
                  onToggle={(value) => toggleFilter('genres', value)}
                />
                <FilterSection
                  icon={Monitor}
                  label="Platform"
                  options={options.platforms}
                  selected={filters.platforms}
                  onToggle={(value) => toggleFilter('platforms', value)}
                />
                <FilterSection
                  icon={Building2}
                  label="Developer"
                  options={options.developers}
                  selected={filters.developers}
                  onToggle={(value) => toggleFilter('developers', value)}
                />
                <YearFilterSection
                  options={options.years}
                  selectedYears={filters.years}
                  yearRange={filters.yearRange}
                  onToggleYear={(value) => toggleFilter('years', value)}
                  onSetYearRange={setYearRange}
                />
              </div>
            ) : (
              <div className="py-6 text-center text-xs text-subtle">
                No filter options available yet — add games to your library to populate categories.
              </div>
            )}

            {/* Footer */}
            <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3">
              <span className="text-[11px] text-muted">
                {activeCount > 0
                  ? `${activeCount} active filter${activeCount === 1 ? '' : 's'}`
                  : 'No active filters'}
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex items-center gap-1.5 rounded-xl bg-accent px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs transition-opacity hover:opacity-90"
              >
                <Check className="size-3.5" />
                Done
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function TagFilterSection({
  tags,
  selected,
  onToggle,
}: {
  tags: Tag[]
  selected: Set<string>
  onToggle: (id: string) => void
}) {
  if (tags.length === 0) return null

  return (
    <div>
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted">
        <TagIcon className="size-3 text-accent" />
        <span>Tags</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {tags.map((tag) => {
          const active = selected.has(tag.id)
          return (
            <button
              key={tag.id}
              type="button"
              onClick={() => onToggle(tag.id)}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all active:scale-95',
                !active &&
                  'border-border/80 bg-surface/60 text-muted hover:bg-surface hover:text-text',
              )}
              style={
                active
                  ? { borderColor: tag.color, backgroundColor: `${tag.color}1f`, color: tag.color }
                  : undefined
              }
            >
              <span
                className={cn('size-1.5 rounded-full', !active && 'bg-current opacity-60')}
                style={active ? { backgroundColor: tag.color } : undefined}
              />
              {tag.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function PlaytimeFilterSection({
  selected,
  onToggle,
}: {
  selected: Set<PlaytimeTierId>
  onToggle: (id: PlaytimeTierId) => void
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted">
        <Clock className="size-3 text-accent" />
        <span>Playtime Range</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {PLAYTIME_FILTERS.map((tier) => {
          const active = selected.has(tier.id)
          return (
            <button
              key={tier.id}
              type="button"
              onClick={() => onToggle(tier.id)}
              className={cn(
                'flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs font-medium transition-all active:scale-95 cursor-pointer',
                active
                  ? 'border-accent/50 bg-accent-soft text-accent font-semibold shadow-xs'
                  : 'border-border/80 bg-surface/60 text-muted hover:bg-surface hover:text-text',
              )}
            >
              <span>{tier.label}</span>
              <span
                className={cn(
                  'rounded px-1.5 py-0.2 text-[9px] font-mono font-bold',
                  active ? 'bg-accent/25 text-accent' : 'bg-surface-raised text-subtle',
                )}
              >
                {tier.range}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function FilterSection({
  icon: Icon,
  label,
  options,
  selected,
  onToggle,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  options: string[]
  selected: Set<string>
  onToggle: (value: string) => void
}) {
  if (options.length === 0) return null

  return (
    <div>
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted">
        <Icon className="size-3 text-accent" />
        <span>{label}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {options.map((option) => {
          const active = selected.has(option)
          return (
            <button
              key={option}
              type="button"
              onClick={() => onToggle(option)}
              className={cn(
                'rounded-xl border px-2.5 py-1 text-xs font-medium transition-all active:scale-95',
                active
                  ? 'border-accent/50 bg-accent-soft text-accent font-semibold shadow-xs'
                  : 'border-border/80 bg-surface/60 text-muted hover:bg-surface hover:text-text',
              )}
            >
              {option}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function YearFilterSection({
  options,
  selectedYears,
  yearRange,
  onToggleYear,
  onSetYearRange,
}: {
  options: string[]
  selectedYears: Set<string>
  yearRange: { from: number | null; to: number | null }
  onToggleYear: (year: string) => void
  onSetYearRange: (from: number | null, to: number | null) => void
}) {
  const [fromStr, setFromStr] = useState(yearRange.from !== null ? String(yearRange.from) : '')
  const [toStr, setToStr] = useState(yearRange.to !== null ? String(yearRange.to) : '')

  useEffect(() => {
    setFromStr(yearRange.from !== null ? String(yearRange.from) : '')
  }, [yearRange.from])

  useEffect(() => {
    setToStr(yearRange.to !== null ? String(yearRange.to) : '')
  }, [yearRange.to])

  if (options.length === 0) return null

  const commit = (fText: string, tText: string) => {
    const fVal = fText.trim().length === 4 ? parseInt(fText.trim(), 10) : null
    const tVal = tText.trim().length === 4 ? parseInt(tText.trim(), 10) : null
    onSetYearRange(
      fVal !== null && !isNaN(fVal) ? fVal : null,
      tVal !== null && !isNaN(tVal) ? tVal : null,
    )
  }

  const isRangeActive =
    yearRange.from !== null || yearRange.to !== null || fromStr.length > 0 || toStr.length > 0

  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted">
          <Calendar className="size-3 text-accent" />
          <span>Release Year & Range</span>
        </div>
        {isRangeActive && (
          <button
            type="button"
            onClick={() => {
              setFromStr('')
              setToStr('')
              onSetYearRange(null, null)
            }}
            className="text-[10px] text-accent hover:underline font-medium cursor-pointer"
          >
            Clear range
          </button>
        )}
      </div>

      {/* Custom Range Inputs */}
      <div className="mt-2 flex items-center gap-2 rounded-xl border border-border/70 bg-surface/50 p-2">
        <div className="flex items-center gap-1.5 flex-1">
          <span className="text-[10px] text-subtle font-medium">From:</span>
          <input
            type="text"
            inputMode="numeric"
            maxLength={4}
            placeholder="e.g. 2005"
            value={fromStr}
            onChange={(e) => {
              const text = e.target.value.replace(/\D/g, '').slice(0, 4)
              setFromStr(text)
              commit(text, toStr)
            }}
            className="w-full rounded-lg border border-border bg-surface-raised px-2 py-0.5 text-xs text-text outline-none focus:border-accent font-medium"
          />
        </div>
        <span className="text-subtle font-bold text-xs">—</span>
        <div className="flex items-center gap-1.5 flex-1">
          <span className="text-[10px] text-subtle font-medium">To:</span>
          <input
            type="text"
            inputMode="numeric"
            maxLength={4}
            placeholder="e.g. 2010"
            value={toStr}
            onChange={(e) => {
              const text = e.target.value.replace(/\D/g, '').slice(0, 4)
              setToStr(text)
              commit(fromStr, text)
            }}
            className="w-full rounded-lg border border-border bg-surface-raised px-2 py-0.5 text-xs text-text outline-none focus:border-accent font-medium"
          />
        </div>
      </div>

      {/* Year Chips */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {options.map((option) => {
          const y = parseInt(option, 10)
          const inRange =
            yearRange.from !== null &&
            yearRange.to !== null &&
            y >= yearRange.from &&
            y <= yearRange.to
          const active = selectedYears.has(option) || inRange
          return (
            <button
              key={option}
              type="button"
              onClick={() => {
                if (isRangeActive) {
                  onSetYearRange(null, null)
                  onToggleYear(option)
                } else {
                  onToggleYear(option)
                }
              }}
              className={cn(
                'rounded-xl border px-2.5 py-1 text-xs font-medium transition-all active:scale-95 cursor-pointer',
                active
                  ? 'border-accent/50 bg-accent-soft text-accent font-semibold shadow-xs'
                  : 'border-border/80 bg-surface/60 text-muted hover:bg-surface hover:text-text',
              )}
            >
              {option}
            </button>
          )
        })}
      </div>
    </div>
  )
}
