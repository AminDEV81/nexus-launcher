import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Check,
  Clock,
  Gamepad2,
  HardDrive,
  Heart,
  RotateCcw,
  SlidersHorizontal,
  Tag as TagIcon,
  Trophy,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useGames } from '../hooks/use-games'
import { useTags } from '../hooks/use-tags'
import { useLibraryUiStore, isFiltersEmpty } from '../store/library-ui-store'
import type { InstallStatusFilter, PlaytimeTierId } from '../store/library-ui-store'

const PLAYTIME_FILTERS: { id: PlaytimeTierId; label: string; range: string }[] = [
  { id: 'unplayed', label: 'Unplayed Backlog', range: '0h' },
  { id: 'under-2h', label: 'Just Started', range: '< 2h' },
  { id: '2h-10h', label: 'In Progress', range: '2–10h' },
  { id: '10h-50h', label: 'Deep Dive', range: '10–50h' },
  { id: '50h-plus', label: 'Veteran / Mastered', range: '50h+' },
]

const INSTALL_STATUS_OPTIONS: { id: InstallStatusFilter; label: string }[] = [
  { id: 'all', label: 'All Games' },
  { id: 'installed', label: 'Installed Ready' },
  { id: 'not_installed', label: 'Not Installed' },
]

const CRITIC_SCORE_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: 'Any Score' },
  { value: 75, label: '75+ Good' },
  { value: 85, label: '85+ Great' },
  { value: 90, label: '90+ Must-Play' },
]

function useFilterOptions() {
  const { data: games } = useGames()
  const { data: tags } = useTags()

  return useMemo(() => {
    const genres = new Set<string>()
    const usedTagIds = new Set<string>()

    for (const game of games ?? []) {
      if (game.is_hidden || game.is_wishlist || game.is_memory) continue
      game.genres.forEach((genre) => {
        const trimmed = genre.trim()
        // Exclude non-genre platform labels like "PC"
        if (trimmed && trimmed.toUpperCase() !== 'PC') {
          genres.add(trimmed)
        }
      })
      game.tag_ids.forEach((id) => usedTagIds.add(id))
    }

    const usedTags = (tags ?? []).filter((tag) => usedTagIds.has(tag.id))

    return {
      genres: [...genres].sort(),
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
  const setInstallStatus = useLibraryUiStore((s) => s.setInstallStatus)
  const setMinScore = useLibraryUiStore((s) => s.setMinScore)
  const clearFilters = useLibraryUiStore((s) => s.clearFilters)
  const options = useFilterOptions()

  const activeCount =
    (filters.favoritesOnly ? 1 : 0) +
    (filters.installStatus !== 'all' ? 1 : 0) +
    (filters.minScore !== null ? 1 : 0) +
    filters.genres.size +
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

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all duration-200 shadow-sm active:scale-95 cursor-pointer',
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
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 440, damping: 28 }}
            className="absolute right-0 top-[calc(100%+8px)] z-50 w-84 sm:w-[400px] rounded-2xl border border-border bg-surface-raised/95 backdrop-blur-xl p-4 shadow-2xl ring-1 ring-border/80"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex size-7 items-center justify-center rounded-lg bg-accent-soft text-accent">
                  <SlidersHorizontal className="size-4" />
                </div>
                <div>
                  <span className="text-xs font-bold text-text">Smart Library Filters</span>
                  <p className="text-[10px] text-muted">
                    Filter by install status, backlog progress, critic score &amp; genres
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                {!isFiltersEmpty(filters) && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-muted transition-colors hover:bg-surface hover:text-text cursor-pointer"
                  >
                    <RotateCcw className="size-3" />
                    Reset
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex size-6 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-text cursor-pointer"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            </div>

            {/* Logical Filter Sections */}
            <div className="mt-3.5 flex max-h-[420px] flex-col gap-4 overflow-y-auto pr-1 scrollbar-thin">
              {/* 1. Favorites Quick Toggle */}
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

              {/* 2. Installation Status */}
              <div>
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted">
                  <HardDrive className="size-3 text-accent" />
                  <span>Installation Status</span>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  {INSTALL_STATUS_OPTIONS.map((opt) => {
                    const active = filters.installStatus === opt.id
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setInstallStatus(opt.id)}
                        className={cn(
                          'rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition-all active:scale-95 cursor-pointer',
                          active
                            ? 'border-accent/50 bg-accent-soft text-accent shadow-xs'
                            : 'border-border/80 bg-surface/60 text-muted hover:bg-surface hover:text-text',
                        )}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* 3. Playtime & Backlog Progress */}
              <div>
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted">
                  <Clock className="size-3 text-accent" />
                  <span>Playtime &amp; Backlog Status</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {PLAYTIME_FILTERS.map((tier) => {
                    const active = filters.playtime.has(tier.id)
                    return (
                      <button
                        key={tier.id}
                        type="button"
                        onClick={() => toggleFilter('playtime', tier.id)}
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

              {/* 4. Critic Score Rating Tier */}
              <div>
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted">
                  <Trophy className="size-3 text-accent" />
                  <span>Critic Rating (Metacritic / OpenCritic)</span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                  {CRITIC_SCORE_OPTIONS.map((opt) => {
                    const active = filters.minScore === opt.value
                    return (
                      <button
                        key={String(opt.value)}
                        type="button"
                        onClick={() => setMinScore(opt.value)}
                        className={cn(
                          'rounded-xl border px-2 py-1.5 text-[11px] font-semibold transition-all active:scale-95 cursor-pointer',
                          active
                            ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-400 shadow-xs'
                            : 'border-border/80 bg-surface/60 text-muted hover:bg-surface hover:text-text',
                        )}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* 5. Custom User Tags */}
              {options.tags.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted">
                    <TagIcon className="size-3 text-accent" />
                    <span>Custom Tags</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {options.tags.map((tag) => {
                      const active = filters.tags.has(tag.id)
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => toggleFilter('tags', tag.id)}
                          className={cn(
                            'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all active:scale-95 cursor-pointer',
                            !active &&
                              'border-border/80 bg-surface/60 text-muted hover:bg-surface hover:text-text',
                          )}
                          style={
                            active
                              ? {
                                  borderColor: tag.color,
                                  backgroundColor: `${tag.color}1f`,
                                  color: tag.color,
                                }
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
              )}

              {/* 6. Genres */}
              {options.genres.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted">
                    <Gamepad2 className="size-3 text-accent" />
                    <span>Game Genres</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {options.genres.map((genre) => {
                      const active = filters.genres.has(genre)
                      return (
                        <button
                          key={genre}
                          type="button"
                          onClick={() => toggleFilter('genres', genre)}
                          className={cn(
                            'rounded-xl border px-2.5 py-1 text-xs font-medium transition-all active:scale-95 cursor-pointer',
                            active
                              ? 'border-accent/50 bg-accent-soft text-accent font-semibold shadow-xs'
                              : 'border-border/80 bg-surface/60 text-muted hover:bg-surface hover:text-text',
                          )}
                        >
                          {genre}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3">
              <span className="text-[11px] text-muted">
                {activeCount > 0
                  ? `${activeCount} active filter${activeCount === 1 ? '' : 's'}`
                  : 'Showing all library games'}
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex items-center gap-1.5 rounded-xl bg-accent px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs transition-opacity hover:opacity-90 cursor-pointer"
              >
                <Check className="size-3.5" />
                Apply
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
