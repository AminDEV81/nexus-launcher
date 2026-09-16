import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowRight,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Compass,
  Flame,
  Gamepad2,
  Layers,
  Loader2,
  Monitor,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  Trophy,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  useHubNewReleases,
  useHubComingSoon,
  useHubTopRated,
  useHubRecommended,
  useHubSearch,
  useHubGenres,
  useHubPlatforms,
} from '../hooks/use-hub'
import { useAppearanceSettingsStore } from '@/store/appearance-settings-store'
import { useAnimationSpeed } from '@/hooks/use-animation-speed'
import { useGames } from '@/features/library/hooks/use-games'
import {
  buildHubLibraryMatcher,
  buildHubWishlistMatcher,
  buildHubInstalledMatcher,
  type HubLibraryMatcher,
} from '../utils/in-library'
import { useHubSearchStore } from '../store/hub-search-store'
import { HUB_FEEDS, type HubFeedId } from '../feeds'
import { MissingKeysPanel } from '../components/missing-keys-panel'
import { isMissingIgdbKeys } from '../utils/is-missing-keys'
import { HubFeaturedHero } from '../components/hub-featured-hero'
import { HubGameCard } from '../components/hub-game-card'
import { HubFeedSkeleton } from '../components/hub-game-skeleton'
import { useUserTasteProfile } from '../hooks/use-personalization'
import { calculateGameAffinity } from '../utils/personalization'
import type { HubGame } from '@/types/models'

// Re-export HubGameCard for backward compatibility with existing imports
export { HubGameCard } from '../components/hub-game-card'

const SEARCH_DEBOUNCE_MS = 350

/** Release-filter preset keys → labels (a year key is its own label).
 *  Must stay in sync with `release_clause` on the Rust side. */
const RELEASE_LABELS: Record<string, string> = {
  upcoming: 'Coming Soon (2026+)',
  new: 'Last 90 Days',
  'last-year': 'Past 12 Months',
  'last-3-years': 'Last 3 Years',
}

/** Year options for the Release section — spans modern eras and classic years. */
const RELEASE_YEARS = [
  '2026',
  '2025',
  '2024',
  '2023',
  '2022',
  '2021',
  '2020',
  '2018',
  '2015',
  '2010',
  '2005',
  '2000',
]

/** Era range presets — spans classic console and PC gaming generations. */
const ERA_RANGES = [
  { label: '2020 – 2026 (Modern)', from: 2020, to: 2026 },
  { label: '2015 – 2020', from: 2015, to: 2020 },
  { label: '2010 – 2015', from: 2010, to: 2015 },
  { label: '2005 – 2010 (7th Gen Classics)', from: 2005, to: 2010 },
  { label: '2000 – 2005 (Golden Era)', from: 2000, to: 2005 },
  { label: '1990 – 2000 (90s Retro)', from: 1990, to: 2000 },
] as const

/** Quick filter categories displayed below the search bar for instant 1-click filtering. */
const QUICK_GENRES = [
  { name: 'Action', emoji: '⚔️' },
  { name: 'Role-playing (RPG)', emoji: '🛡️' },
  { name: 'Shooter', emoji: '🎯' },
  { name: 'Adventure', emoji: '🗺️' },
  { name: 'Strategy', emoji: '♟️' },
  { name: 'Indie', emoji: '✨' },
  { name: 'Racing', emoji: '🏎️' },
  { name: 'Simulator', emoji: '🕹️' },
  { name: 'Fighting', emoji: '🥊' },
] as const

/** Sort options — values must stay in sync with `sort_clause` on the
 *  Rust side. `null` (Relevance) keeps IGDB's search ordering when only
 *  searching, and popularity in filter mode. */
const SORT_OPTIONS = [
  { value: 'popularity', label: 'Popularity' },
  { value: 'rating', label: 'Top rated' },
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'name', label: 'Name A-Z' },
] as const

const SORT_LABELS: Record<string, string> = Object.fromEntries(
  SORT_OPTIONS.map((option) => [option.value, `Sort: ${option.label}`]),
)

export function HubPage() {
  const newReleases = useHubNewReleases()
  const comingSoon = useHubComingSoon()
  const topRated = useHubTopRated()
  const recommended = useHubRecommended()
  const { data: games, isPending: gamesPending } = useGames()

  // Input text + all filters + sort live in the store so they survive
  // navigating to a game's page and back (see hub-search-store.ts); only
  // the debounce timer and the popover's open state are local.
  const searchInput = useHubSearchStore((s) => s.query)
  const setSearchInput = useHubSearchStore((s) => s.setQuery)
  const genreIds = useHubSearchStore((s) => s.genreIds)
  const toggleGenreId = useHubSearchStore((s) => s.toggleGenreId)
  const setGenreIds = useHubSearchStore((s) => s.setGenreIds)
  const platformIds = useHubSearchStore((s) => s.platformIds)
  const togglePlatformId = useHubSearchStore((s) => s.togglePlatformId)
  const setPlatformIds = useHubSearchStore((s) => s.setPlatformIds)
  const release = useHubSearchStore((s) => s.release)
  const yearFrom = useHubSearchStore((s) => s.yearFrom)
  const yearTo = useHubSearchStore((s) => s.yearTo)
  const setRelease = useHubSearchStore((s) => s.setRelease)
  const setYearRange = useHubSearchStore((s) => s.setYearRange)
  const minRating = useHubSearchStore((s) => s.minRating)
  const setMinRating = useHubSearchStore((s) => s.setMinRating)
  const sort = useHubSearchStore((s) => s.sort)
  const setSort = useHubSearchStore((s) => s.setSort)
  const clearFilters = useHubSearchStore((s) => s.clearFilters)
  const [searchQuery, setSearchQuery] = useState(() => useHubSearchStore.getState().query)
  useEffect(() => {
    const timer = window.setTimeout(() => setSearchQuery(searchInput), SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  const [filtersOpen, setFiltersOpen] = useState(false)
  const filtersRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!filtersOpen) return
    function handleClickOutside(event: MouseEvent) {
      if (filtersRef.current && !filtersRef.current.contains(event.target as Node)) {
        setFiltersOpen(false)
      }
    }
    window.addEventListener('mousedown', handleClickOutside)
    return () => window.removeEventListener('mousedown', handleClickOutside)
  }, [filtersOpen])

  const genres = useHubGenres()
  const platforms = useHubPlatforms()

  const filters = { genreIds, platformIds, release, yearFrom, yearTo, minRating, sort }
  const hasAnyFilter =
    genreIds.length > 0 ||
    platformIds.length > 0 ||
    release !== null ||
    yearFrom !== null ||
    yearTo !== null ||
    minRating !== null ||
    sort !== null

  const search = useHubSearch(searchQuery, filters)
  // Any filter or sort alone is a valid browse mode — no term needed.
  const isFiltering = searchQuery.trim().length >= 2 || hasAnyFilter

  // Human labels for the active filters — the toolbar's removable pills
  // and the results header both describe the query by these.
  const selectedGenres = (genres.data ?? []).filter((genre) => genreIds.includes(genre.id))
  const selectedPlatforms = (platforms.data ?? []).filter((platform) =>
    platformIds.includes(platform.id),
  )

  let releaseLabel: string | null = null
  if (release) {
    if (RELEASE_LABELS[release]) {
      releaseLabel = RELEASE_LABELS[release]
    } else if (release.includes('-')) {
      const [from, to] = release.split('-')
      releaseLabel = `${from} – ${to}`
    } else if (release.endsWith('+')) {
      releaseLabel = `${release.replace('+', '')}+`
    } else {
      releaseLabel = release
    }
  }

  const ratingLabel = minRating !== null ? `${minRating}+ rating` : null
  const sortLabel = sort ? (SORT_LABELS[sort] ?? null) : null

  const activePills: [string, () => void][] = [
    ...selectedGenres.map((g): [string, () => void] => [g.name, () => toggleGenreId(g.id)]),
    ...selectedPlatforms.map((p): [string, () => void] => [
      p.abbreviation || p.name,
      () => togglePlatformId(p.id),
    ]),
    ...(releaseLabel ? [[releaseLabel, () => setRelease(null)] as [string, () => void]] : []),
    ...(ratingLabel ? [[ratingLabel, () => setMinRating(null)] as [string, () => void]] : []),
    ...(sortLabel ? [[sortLabel, () => setSort(null)] as [string, () => void]] : []),
  ]
  const filterParts = [
    ...selectedGenres.map((g) => g.name),
    ...selectedPlatforms.map((p) => p.abbreviation || p.name),
    releaseLabel,
    ratingLabel,
  ].filter((part): part is string => part !== null)

  // The library list (already warm from the app's startup prefetch) is
  // the single source of "in library" truth — it also recognizes games
  // added manually, which carry no IGDB id at all.
  const inLibrary = buildHubLibraryMatcher(games)
  const inWishlist = buildHubWishlistMatcher(games)
  const isInstalled = buildHubInstalledMatcher(games)
  const isPending =
    newReleases.isPending || comingSoon.isPending || topRated.isPending || gamesPending

  const missingKeys = [newReleases, comingSoon, topRated, recommended].some((query) =>
    isMissingIgdbKeys(query.error),
  )
  // Any other failure (network down, IGDB outage) must still show a
  // message — never a silently blank page. Partial data still wins:
  // one flaky query shouldn't hide shelves that did load.
  const loadedAnyShelf = [newReleases, comingSoon, topRated, recommended].some(
    (query) => (query.data?.length ?? 0) > 0,
  )
  const firstError =
    !missingKeys && !loadedAnyShelf
      ? ([newReleases, comingSoon, topRated, recommended].find((query) => query.error)?.error ??
        null)
      : null

  return (
    <div className="h-full overflow-y-auto p-5 sm:p-8">
      <div className="flex flex-col gap-6">
        {/* ── Top Header Showcase ─────────────────────────────────── */}
        <header className="relative overflow-hidden rounded-3xl border border-border/80 bg-gradient-to-br from-surface-raised via-surface to-surface-raised/60 p-6 sm:p-8 shadow-card">
          {/* Ambient Lighting Gradients (GPU-friendly radial gradients without blur filters) */}
          <div
            className="pointer-events-none absolute -right-20 -top-20 size-80 rounded-full"
            style={{
              background:
                'radial-gradient(circle, color-mix(in srgb, var(--nx-accent) 15%, transparent) 0%, transparent 70%)',
            }}
          />
          <div
            className="pointer-events-none absolute -left-20 -bottom-20 size-80 rounded-full"
            style={{
              background: 'radial-gradient(circle, rgba(6, 182, 212, 0.12) 0%, transparent 70%)',
            }}
          />

          <div className="relative z-10 flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
            {/* Title & Icon Branding */}
            <div className="flex items-center gap-4 sm:gap-5">
              {/* Glowing Icon Emblem */}
              <div className="relative flex size-14 sm:size-16 shrink-0 items-center justify-center rounded-3xl border border-accent/40 bg-gradient-to-br from-accent/20 via-accent/5 to-surface-raised shadow-[0_0_25px_-5px_var(--nx-accent)] backdrop-blur-md">
                <Gamepad2 className="size-8 text-accent drop-shadow-[0_0_10px_var(--nx-accent)]" />
                <div className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-emerald-500 text-[10px] text-white shadow-sm ring-2 ring-surface">
                  <Sparkles className="size-3 fill-current" />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-accent-border bg-accent-soft px-3 py-0.5 text-[11px] font-extrabold tracking-[0.18em] text-accent shadow-xs">
                    <Compass className="size-3.5" />
                    <span>NEXUS EXPLORER</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-bold text-emerald-500 shadow-xs">
                    <span className="size-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.7)]" />
                    <span>Live IGDB Catalog</span>
                  </span>
                </div>

                <h1 className="bg-gradient-to-r from-accent via-accent-hover to-text bg-clip-text text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-transparent drop-shadow-sm">
                  Game Hub
                </h1>
                <p className="max-w-xl text-xs sm:text-sm text-muted leading-relaxed font-medium">
                  Explore trending releases, critic favorites, and upcoming blockbusters with direct
                  access & live mirrors.
                </p>
              </div>
            </div>

            {/* Live Stats Pill / Header Quick Info */}
            <div className="hidden lg:flex items-center gap-3.5 rounded-3xl border border-border/80 bg-surface/90 px-4 py-3 shadow-card backdrop-blur-md">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-accent-hover text-white shadow-[0_0_20px_-3px_var(--nx-accent)]">
                <Trophy className="size-6" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-black text-text">500,000+ Titles</span>
                  <span className="rounded-md bg-accent/15 px-1.5 py-0.5 text-[9px] font-extrabold text-accent">
                    LIVE
                  </span>
                </div>
                <div className="text-[11px] font-medium text-subtle">Global Database & Reviews</div>
              </div>
            </div>
          </div>
        </header>

        {/* ── Search & Filter Command Bar ─────────────────────────── */}
        <div className="flex flex-col gap-3">
          {/* Search Input Box */}
          <div className="relative flex items-center">
            <Search className="pointer-events-none absolute left-4 size-4.5 text-subtle" />
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search across 500k+ games by title, genre, or keyword…"
              className="h-13 w-full rounded-2xl border border-border/80 bg-surface/90 pr-24 pl-12 text-sm text-text shadow-card outline-none transition-all placeholder:text-subtle focus:border-accent/60 focus:bg-surface-raised focus:ring-4 focus:ring-accent/15"
            />
            <div className="absolute right-3.5 flex items-center gap-2">
              {search.isFetching && isFiltering && (
                <Loader2 className="size-4 animate-spin text-accent" />
              )}
              {searchInput && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setSearchInput('')}
                  className="flex size-7 items-center justify-center rounded-xl bg-surface-raised text-subtle transition-colors hover:text-text"
                >
                  <X className="size-3.5" />
                </button>
              )}
              <kbd className="hidden sm:inline-flex items-center rounded-lg border border-border/80 bg-surface-raised px-2 py-1 text-[10px] font-semibold text-subtle">
                ESC to clear
              </kbd>
            </div>
          </div>

          {/* Filter Bar with Standalone Non-clipped Advanced Filters Toggle */}
          <div className="flex items-center gap-2.5">
            {/* Advanced Filters Popover Trigger (Outside overflow-x-auto) */}
            <div ref={filtersRef} className="relative shrink-0">
              <button
                type="button"
                onClick={() => setFiltersOpen((open) => !open)}
                className={cn(
                  'flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-xs font-bold transition-all duration-200 active:scale-95 shadow-xs',
                  hasAnyFilter || filtersOpen
                    ? 'border-accent bg-accent text-white shadow-md shadow-accent/25'
                    : 'border-border/80 bg-surface/90 text-text hover:border-accent/50 hover:bg-surface-raised',
                )}
              >
                <SlidersHorizontal className="size-4" />
                <span>Advanced Filters</span>
                {hasAnyFilter && (
                  <span className="flex size-5 items-center justify-center rounded-full bg-white text-[10px] font-black text-accent">
                    {activePills.length}
                  </span>
                )}
              </button>

              {/* Advanced Filters Popover Modal */}
              <AnimatePresence>
                {filtersOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.95 }}
                    transition={{ type: 'spring', stiffness: 440, damping: 28 }}
                    className="solid-panel absolute left-0 top-[calc(100%+8px)] z-50 w-[30rem] sm:w-[36rem] max-w-[92vw] rounded-3xl border border-border bg-surface-raised p-5 shadow-elevated backdrop-blur-2xl ring-1 ring-border/80"
                  >
                    {/* Modal Header */}
                    <div className="flex items-center justify-between border-b border-border/60 pb-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="flex size-9 items-center justify-center rounded-2xl bg-accent-soft text-accent border border-accent-border/50 shadow-xs">
                          <SlidersHorizontal className="size-4.5" />
                        </div>
                        <div>
                          <div className="text-sm font-bold text-text">Advanced Filters & Sort</div>
                          <div className="text-[11px] text-subtle">
                            Refine games across genres, platforms, eras, and ratings
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {hasAnyFilter && (
                          <button
                            type="button"
                            onClick={clearFilters}
                            className="flex items-center gap-1 rounded-xl px-2.5 py-1 text-xs font-semibold text-subtle transition-colors hover:text-red-400 hover:bg-red-500/10"
                          >
                            <RotateCcw className="size-3" />
                            <span>Reset</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setFiltersOpen(false)}
                          className="flex size-7 items-center justify-center rounded-xl text-subtle hover:bg-surface hover:text-text"
                        >
                          <X className="size-4" />
                        </button>
                      </div>
                    </div>

                    {/* Filter Sections */}
                    <div className="mt-4 flex max-h-[30rem] flex-col gap-5 overflow-y-auto pr-1 scrollbar-thin">
                      {/* 1. Sort By */}
                      <PanelSection
                        icon={Flame}
                        label="Sort Results By"
                        description="Order discovery feed"
                      >
                        <PanelChip
                          label="Relevance"
                          active={sort === null}
                          onClick={() => setSort(null)}
                        />
                        {SORT_OPTIONS.map((option) => (
                          <PanelChip
                            key={option.value}
                            label={option.label}
                            active={sort === option.value}
                            onClick={() => setSort(sort === option.value ? null : option.value)}
                          />
                        ))}
                      </PanelSection>

                      {/* 2. Platforms */}
                      <PanelSection
                        icon={Monitor}
                        label="Gaming Platform"
                        description="Select one or more platforms"
                      >
                        <PanelChip
                          label="Any Platform"
                          active={platformIds.length === 0}
                          onClick={() => setPlatformIds([])}
                        />
                        {(platforms.data ?? []).map((platform) => (
                          <PanelChip
                            key={platform.id}
                            label={platform.abbreviation || platform.name}
                            active={platformIds.includes(platform.id)}
                            onClick={() => togglePlatformId(platform.id)}
                          />
                        ))}
                      </PanelSection>

                      {/* 3. Release Era & Years */}
                      <PanelSection
                        icon={CalendarDays}
                        label="Release Era & Years"
                        description="Filter by timeline or era range"
                      >
                        {/* Preset Buttons */}
                        <div className="flex flex-wrap gap-1.5 w-full">
                          <PanelChip
                            label="Any Time"
                            active={release === null && yearFrom === null && yearTo === null}
                            onClick={() => setRelease(null)}
                          />
                          {Object.entries(RELEASE_LABELS).map(([value, label]) => (
                            <PanelChip
                              key={value}
                              label={label}
                              active={release === value}
                              onClick={() => setRelease(release === value ? null : value)}
                            />
                          ))}
                        </div>

                        {/* Era Range Shortcuts */}
                        <div className="mt-2 w-full">
                          <div className="mb-1.5 text-[10px] font-bold tracking-wider text-subtle uppercase">
                            Era Ranges
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {ERA_RANGES.map((era) => {
                              const isActive =
                                yearFrom === era.from &&
                                yearTo === era.to &&
                                release === `${era.from}-${era.to}`
                              return (
                                <PanelChip
                                  key={era.label}
                                  label={era.label}
                                  active={isActive}
                                  onClick={() => {
                                    if (isActive) {
                                      setRelease(null)
                                    } else {
                                      setYearRange(era.from, era.to)
                                    }
                                  }}
                                />
                              )
                            })}
                          </div>
                        </div>

                        {/* Custom Year Range Picker */}
                        <CustomYearRangePicker
                          yearFrom={yearFrom}
                          yearTo={yearTo}
                          onSetYearRange={setYearRange}
                          onClear={() => setRelease(null)}
                        />

                        {/* Single Year Quick Select */}
                        <div className="mt-2 w-full">
                          <div className="mb-1.5 text-[10px] font-bold tracking-wider text-subtle uppercase">
                            Individual Years (Click two to form a range)
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {RELEASE_YEARS.map((yearStr) => {
                              const y = parseInt(yearStr, 10)
                              const isExact =
                                release === yearStr || (yearFrom === y && yearTo === y)
                              const isInRange =
                                yearFrom !== null && yearTo !== null && y >= yearFrom && y <= yearTo
                              const active = isExact || isInRange
                              return (
                                <PanelChip
                                  key={yearStr}
                                  label={yearStr}
                                  active={active}
                                  onClick={() => {
                                    if (
                                      yearFrom !== null &&
                                      yearTo !== null &&
                                      yearFrom === yearTo &&
                                      yearFrom !== y
                                    ) {
                                      // Range between first picked year and this clicked year!
                                      setYearRange(yearFrom, y)
                                    } else if (isExact) {
                                      setRelease(null)
                                    } else {
                                      setYearRange(y, y)
                                    }
                                  }}
                                />
                              )
                            })}
                          </div>
                        </div>
                      </PanelSection>

                      {/* 4. Critic Score / Rating */}
                      <PanelSection
                        icon={Star}
                        label="Critic Rating Threshold"
                        description="Minimum review score"
                      >
                        <PanelChip
                          label="Any Rating"
                          active={minRating === null}
                          onClick={() => setMinRating(null)}
                        />
                        {[
                          { score: 90, label: '★ 90+ Masterpiece' },
                          { score: 80, label: '★ 80+ Great' },
                          { score: 70, label: '★ 70+ Good' },
                          { score: 60, label: '★ 60+ Decent' },
                        ].map(({ score, label }) => (
                          <PanelChip
                            key={score}
                            label={label}
                            active={minRating === score}
                            onClick={() => setMinRating(minRating === score ? null : score)}
                          />
                        ))}
                      </PanelSection>

                      {/* 5. Genres Explorer */}
                      <PanelSection
                        icon={Layers}
                        label="Genres Catalog"
                        description="Select one or more categories"
                        scrollable
                      >
                        <PanelChip
                          label="All Genres"
                          active={genreIds.length === 0}
                          onClick={() => setGenreIds([])}
                        />
                        {(genres.data ?? []).map((genre) => (
                          <PanelChip
                            key={genre.id}
                            label={genre.name}
                            active={genreIds.includes(genre.id)}
                            onClick={() => toggleGenreId(genre.id)}
                          />
                        ))}
                      </PanelSection>
                    </div>

                    {/* Modal Footer */}
                    <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3">
                      <span className="text-xs text-subtle">
                        {hasAnyFilter
                          ? `${activePills.length} filter${activePills.length > 1 ? 's' : ''} applied`
                          : 'No filters applied'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setFiltersOpen(false)}
                        className="rounded-xl bg-accent px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-accent-hover active:scale-95 transition-all"
                      >
                        Done & View Results
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="h-6 w-px bg-border/80 shrink-0" />

            {/* Quick Presets Horizontal Strip */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none flex-1">
              <button
                type="button"
                onClick={clearFilters}
                className={cn(
                  'rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all shrink-0',
                  !hasAnyFilter && !searchQuery
                    ? 'border-accent/50 bg-accent/15 text-accent font-bold'
                    : 'border-border/60 bg-surface/60 text-muted hover:border-border hover:text-text',
                )}
              >
                All Games
              </button>

              {/* Quick Action Genres */}
              {QUICK_GENRES.map((qg) => {
                const matchingGenre = genres.data?.find((g) =>
                  g.name.toLowerCase().includes(qg.name.toLowerCase().replace(/[^a-z]/g, '')),
                )
                const isSelected = matchingGenre ? genreIds.includes(matchingGenre.id) : false
                return (
                  <button
                    key={qg.name}
                    type="button"
                    onClick={() => {
                      if (!matchingGenre) return
                      toggleGenreId(matchingGenre.id)
                    }}
                    className={cn(
                      'rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all flex items-center gap-1.5 shrink-0',
                      isSelected
                        ? 'border-accent bg-accent text-white shadow-sm'
                        : 'border-border/60 bg-surface/60 text-muted hover:border-border hover:bg-surface-raised hover:text-text',
                    )}
                  >
                    <span>{qg.emoji}</span>
                    <span>{qg.name}</span>
                  </button>
                )
              })}

              {/* Quick 90+ Rating Preset */}
              <button
                type="button"
                onClick={() => setMinRating(minRating === 90 ? null : 90)}
                className={cn(
                  'rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all flex items-center gap-1 shrink-0',
                  minRating === 90
                    ? 'border-amber-500 bg-amber-500 text-black font-bold shadow-sm'
                    : 'border-border/60 bg-surface/60 text-amber-400/90 hover:border-amber-500/40 hover:bg-surface-raised',
                )}
              >
                <Star className="size-3 fill-current" />
                <span>90+ Score</span>
              </button>

              {/* Quick Coming Soon Preset */}
              <button
                type="button"
                onClick={() => setRelease(release === 'upcoming' ? null : 'upcoming')}
                className={cn(
                  'rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all flex items-center gap-1 shrink-0',
                  release === 'upcoming'
                    ? 'border-cyan-500 bg-cyan-500 text-white font-bold shadow-sm'
                    : 'border-border/60 bg-surface/60 text-cyan-400/90 hover:border-cyan-500/40 hover:bg-surface-raised',
                )}
              >
                <Clock className="size-3" />
                <span>Coming Soon</span>
              </button>
            </div>
          </div>

          {/* Active Filters Removable Chips */}
          {activePills.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-subtle mr-1">
                Active Filters:
              </span>
              {activePills.map(([label, clear]) => (
                <button
                  key={label as string}
                  type="button"
                  onClick={clear}
                  title={`Remove ${label}`}
                  className="group/pill flex items-center gap-1.5 rounded-xl border border-accent/40 bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent transition-all hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-400"
                >
                  <span>{label}</span>
                  <X className="size-3 text-accent/80 transition-colors group-hover/pill:text-red-400" />
                </button>
              ))}

              <button
                type="button"
                onClick={clearFilters}
                className="rounded-xl px-2 py-1 text-xs font-semibold text-subtle transition-colors hover:text-red-400"
              >
                Clear all
              </button>
            </div>
          )}
        </div>

        {missingKeys ? (
          <MissingKeysPanel />
        ) : firstError ? (
          <section className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-border bg-surface px-8 py-16 text-center">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-surface-raised">
              <Compass className="size-6 text-accent" />
            </span>
            <div>
              <div className="text-base font-semibold text-text">Couldn't reach IGDB</div>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted">{firstError.message}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                void newReleases.refetch()
                void comingSoon.refetch()
                void topRated.refetch()
                void recommended.refetch()
              }}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-muted transition-colors hover:border-accent/45 hover:text-text"
            >
              <Loader2 className="size-4" />
              Try again
            </button>
          </section>
        ) : isFiltering ? (
          <SearchResults
            query={searchQuery}
            filterParts={filterParts}
            search={search}
            inLibrary={inLibrary}
            inWishlist={inWishlist}
            isInstalled={isInstalled}
          />
        ) : isPending ? (
          <HubFeedSkeleton />
        ) : (
          <>
            {/* 1. Featured Spotlight Carousel */}
            {newReleases.data && newReleases.data.length > 0 && (
              <HubFeaturedHero
                games={newReleases.data}
                inLibrary={inLibrary}
                inWishlist={inWishlist}
                isInstalled={isInstalled}
              />
            )}

            {/* 2. Four Curated Discovery Shelves */}
            <HubRow
              feed="recommended"
              query={recommended}
              fallbackData={topRated.data}
              inLibrary={inLibrary}
              inWishlist={inWishlist}
              isInstalled={isInstalled}
            />
            <HubRow
              feed="new-releases"
              query={newReleases}
              inLibrary={inLibrary}
              inWishlist={inWishlist}
              isInstalled={isInstalled}
            />
            <HubRow
              feed="coming-soon"
              query={comingSoon}
              inLibrary={inLibrary}
              inWishlist={inWishlist}
              isInstalled={isInstalled}
            />
            <HubRow
              feed="top-rated"
              query={topRated}
              inLibrary={inLibrary}
              inWishlist={inWishlist}
              isInstalled={isInstalled}
            />
          </>
        )}
      </div>
    </div>
  )
}

function SearchResults({
  query,
  filterParts,
  search,
  inLibrary,
  inWishlist,
  isInstalled,
}: {
  query: string
  /** Human labels of the active filters (genre, platform, release,
   *  rating) — composed into the results header and empty state. */
  filterParts: string[]
  search: {
    data?: { pages: HubGame[][] }
    isFetching: boolean
    isFetchingNextPage?: boolean
    hasNextPage?: boolean
    fetchNextPage: () => void
    error?: { message?: string } | null
  }
  inLibrary: HubLibraryMatcher
  inWishlist?: HubLibraryMatcher
  isInstalled?: HubLibraryMatcher
}) {
  const results = search.data?.pages.flat() ?? []
  const hasTerm = query.trim().length >= 2
  const partsLabel = filterParts.join(' · ')

  if (isMissingIgdbKeys(search.error)) {
    return <MissingKeysPanel />
  }

  if (search.error) {
    return (
      <section className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-surface px-8 py-16 text-center">
        <Search className="size-6 text-accent" />
        <p className="text-sm text-muted">{search.error.message}</p>
      </section>
    )
  }

  if (!search.isFetching && results.length === 0) {
    return (
      <section className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-surface px-8 py-16 text-center">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-surface-raised">
          <Search className="size-5 text-accent" />
        </span>
        <div>
          <div className="text-sm font-medium text-text">
            {hasTerm && partsLabel
              ? `Nothing in ${partsLabel} matches “${query.trim()}”`
              : hasTerm
                ? `Nothing found for “${query.trim()}”`
                : `Nothing to browse${partsLabel ? ` in ${partsLabel}` : ''}`}
          </div>
          <p className="mt-1 text-xs text-muted">
            {hasTerm
              ? 'Try a shorter or different spelling — IGDB matches on exact title words.'
              : 'Loosen a filter or clear them to see the shelves again.'}
          </p>
        </div>
      </section>
    )
  }

  return (
    <section>
      <RowHeader
        title={
          hasTerm && partsLabel
            ? `${partsLabel} — “${query.trim()}”`
            : hasTerm
              ? `Results for “${query.trim()}”`
              : `Browse: ${partsLabel || 'All'}`
        }
        subtitle={
          hasTerm && !partsLabel
            ? "From IGDB's full catalog"
            : 'Most popular first — from IGDB’s full catalog'
        }
        count={results.length}
      />
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 items-stretch">
        {results.map((game) => (
          <HubGameCard
            key={game.igdb_id}
            game={game}
            inLibrary={inLibrary(game)}
            inWishlist={inWishlist ? inWishlist(game) : false}
            isInstalled={isInstalled ? isInstalled(game) : false}
            className="h-full"
          />
        ))}
      </div>
      {search.hasNextPage && (
        <button
          type="button"
          onClick={() => search.fetchNextPage()}
          disabled={search.isFetchingNextPage}
          className="mx-auto mt-6 flex items-center gap-2 rounded-xl border border-border bg-surface px-5 py-2.5 text-sm font-medium text-muted shadow-card transition-colors hover:border-accent/45 hover:text-text disabled:opacity-50"
        >
          {search.isFetchingNextPage ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ChevronDown className="size-4" />
          )}
          {search.isFetchingNextPage ? 'Loading…' : 'Load more'}
        </button>
      )}
    </section>
  )
}

function HubRow({
  feed,
  query,
  fallbackData,
  inLibrary,
  inWishlist,
  isInstalled,
}: {
  feed: HubFeedId
  query: { data?: HubGame[]; isPending: boolean }
  fallbackData?: HubGame[]
  inLibrary: HubLibraryMatcher
  inWishlist?: HubLibraryMatcher
  isInstalled?: HubLibraryMatcher
}) {
  const navigate = useNavigate()
  const speed = useAnimationSpeed()
  const reduceMotion = useAppearanceSettingsStore((s) => s.reduceMotion)
  const profile = useUserTasteProfile()

  const { title } = HUB_FEEDS[feed]
  let subtitle: string = HUB_FEEDS[feed].subtitle
  const games = query.data && query.data.length > 0 ? query.data : (fallbackData ?? [])
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Dynamic personalized subtitle for "recommended" feed (Section 43.8)
  if (feed === 'recommended') {
    if (profile.hasSufficientHistory) {
      if (profile.topPlayedGameNames.length > 0) {
        subtitle = `Because you play: ${profile.topPlayedGameNames.slice(0, 3).join(' • ')}`
      } else if (profile.genres.length > 0) {
        subtitle = `Based on your interest in ${profile.genres
          .slice(0, 2)
          .map((g) => g.name)
          .join(' & ')}`
      }
    } else {
      subtitle = 'Trending masterworks to kickstart your personalized game feed'
    }
  }

  function scroll(direction: 'left' | 'right') {
    if (!scrollContainerRef.current) return
    const offset = direction === 'left' ? -380 : 380
    scrollContainerRef.current.scrollBy({ left: offset, behavior: 'smooth' })
  }

  if (query.isPending && games.length === 0) {
    return (
      <section className="flex flex-col gap-3">
        <RowHeader feed={feed} title={title} subtitle={subtitle} />
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: 6 }, (_, index) => (
            <div
              key={index}
              className="h-72 w-48 shrink-0 animate-pulse rounded-2xl border border-border bg-surface"
            />
          ))}
        </div>
      </section>
    )
  }

  if (games.length === 0) return null

  return (
    <motion.section
      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 * speed, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col gap-3"
    >
      <RowHeader
        feed={feed}
        title={title}
        subtitle={subtitle}
        count={games.length}
        onScrollLeft={() => scroll('left')}
        onScrollRight={() => scroll('right')}
        onBrowseAll={() => navigate(`/hub/browse/${feed}`)}
      />

      <div
        ref={scrollContainerRef}
        className="flex items-stretch gap-4 overflow-x-auto pb-3 pt-1 pr-1 scrollbar-none"
      >
        {games.map((game) => {
          const affinity = feed === 'recommended' ? calculateGameAffinity(game, profile) : null
          return (
            <div key={game.igdb_id} className="flex w-48 sm:w-52 shrink-0 flex-col">
              <HubGameCard
                game={game}
                feed={feed}
                inLibrary={inLibrary(game)}
                inWishlist={inWishlist ? inWishlist(game) : false}
                isInstalled={isInstalled ? isInstalled(game) : false}
                nexusMatch={affinity?.matchPercentage}
                matchReason={affinity?.reason}
                breakdownChips={affinity?.breakdown?.highlightChips}
                className="h-full"
              />
            </div>
          )
        })}

        {/* End-of-shelf "See More" Card */}
        <button
          type="button"
          onClick={() => navigate(`/hub/browse/${feed}`)}
          className="group flex w-48 sm:w-52 shrink-0 flex-col items-center justify-center gap-3 self-stretch rounded-2xl border border-dashed border-border/80 bg-surface/40 p-5 text-muted transition-all hover:border-accent/60 hover:bg-accent/5 hover:text-accent hover:shadow-lg"
        >
          <span className="flex size-12 items-center justify-center rounded-2xl bg-accent/15 text-accent shadow-sm ring-1 ring-accent/30 transition-transform group-hover:scale-110">
            <ArrowRight className="size-6" />
          </span>
          <div className="text-center">
            <div className="text-sm font-bold text-text group-hover:text-accent transition-colors">
              Browse All
            </div>
            <div className="text-[11px] text-subtle mt-0.5">Explore full {title} feed</div>
          </div>
        </button>
      </div>
    </motion.section>
  )
}

function RowHeader({
  feed,
  title,
  subtitle,
  count,
  onScrollLeft,
  onScrollRight,
  onBrowseAll,
}: {
  feed?: HubFeedId
  title: string
  subtitle: string
  count?: number
  onScrollLeft?: () => void
  onScrollRight?: () => void
  onBrowseAll?: () => void
}) {
  // Feed theme icons and styling
  const iconConfig = (feed &&
    {
      'new-releases': {
        icon: Sparkles,
        color: 'text-emerald-400',
        badgeBg: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300',
        label: 'New',
      },
      'coming-soon': {
        icon: Clock,
        color: 'text-cyan-400',
        badgeBg: 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300',
        label: 'Upcoming',
      },
      'top-rated': {
        icon: Flame,
        color: 'text-amber-400',
        badgeBg: 'bg-amber-500/15 border-amber-500/30 text-amber-300',
        label: 'Trending',
      },
      recommended: {
        icon: Sparkles,
        color: 'text-violet-400',
        badgeBg: 'bg-violet-500/15 border-violet-500/30 text-violet-300',
        label: 'For You',
      },
    }[feed]) || {
    icon: Trophy,
    color: 'text-accent',
    badgeBg: 'bg-accent/15 border-accent/30 text-accent',
    label: 'Results',
  }

  const Icon = iconConfig.icon

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-2xl border border-border/80 bg-surface-raised shadow-xs">
          <Icon className={cn('size-5', iconConfig.color)} />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base sm:text-lg font-bold tracking-tight text-text">{title}</h2>
            <span
              className={cn(
                'rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                iconConfig.badgeBg,
              )}
            >
              {iconConfig.label}
            </span>
            {count !== undefined && (
              <span className="rounded-full bg-surface-raised px-2 py-0.5 text-[10px] font-medium text-subtle">
                {count} games
              </span>
            )}
          </div>
          <p className="text-xs text-subtle">{subtitle}</p>
        </div>
      </div>

      {/* Navigation Controls & See All */}
      <div className="flex items-center gap-2">
        {onBrowseAll && (
          <button
            type="button"
            onClick={onBrowseAll}
            className="flex items-center gap-1 rounded-xl border border-border/70 bg-surface px-3 py-1.5 text-xs font-semibold text-subtle transition-colors hover:border-accent/40 hover:text-accent"
          >
            <span>See All</span>
            <ArrowRight className="size-3.5" />
          </button>
        )}

        {onScrollLeft && onScrollRight && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Scroll left"
              onClick={onScrollLeft}
              className="flex size-8 items-center justify-center rounded-xl border border-border/80 bg-surface text-subtle shadow-xs transition-all hover:border-accent/40 hover:bg-surface-raised hover:text-text active:scale-95"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Scroll right"
              onClick={onScrollRight}
              className="flex size-8 items-center justify-center rounded-xl border border-border/80 bg-surface text-subtle shadow-xs transition-all hover:border-accent/40 hover:bg-surface-raised hover:text-text active:scale-95"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/** One labeled group of chips inside the filters popover with icon and description. */
function PanelSection({
  icon: Icon,
  label,
  description,
  scrollable = false,
  children,
}: {
  icon?: React.ComponentType<{ className?: string }>
  label: string
  description?: string
  scrollable?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {Icon && <Icon className="size-3.5 text-accent" />}
          <span className="text-xs font-bold uppercase tracking-wider text-text">{label}</span>
        </div>
        {description && <span className="text-[10px] text-subtle">{description}</span>}
      </div>
      <div
        className={
          scrollable
            ? 'flex max-h-36 flex-wrap gap-1.5 overflow-y-auto pr-1 scrollbar-thin'
            : 'flex flex-wrap gap-1.5'
        }
      >
        {children}
      </div>
    </div>
  )
}

/** A single selectable chip in the filters popover with tactile interaction. */
function PanelChip({
  label,
  active,
  onClick,
  icon: Icon,
}: {
  label: string
  active: boolean
  onClick: () => void
  icon?: React.ComponentType<{ className?: string }>
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all duration-150 active:scale-95',
        active
          ? 'border-accent bg-accent text-white shadow-sm shadow-accent/30 font-bold'
          : 'border-border/80 bg-surface text-muted hover:border-accent/40 hover:bg-surface-raised hover:text-text hover:scale-[1.02]',
      )}
    >
      {Icon && <Icon className={cn('size-3', active ? 'text-white' : 'text-accent')} />}
      <span>{label}</span>
    </button>
  )
}

function CustomYearRangePicker({
  yearFrom,
  yearTo,
  onSetYearRange,
  onClear,
}: {
  yearFrom: number | null
  yearTo: number | null
  onSetYearRange: (from: number | null, to: number | null) => void
  onClear: () => void
}) {
  const [fromStr, setFromStr] = useState(yearFrom !== null ? String(yearFrom) : '')
  const [toStr, setToStr] = useState(yearTo !== null ? String(yearTo) : '')

  useEffect(() => {
    setFromStr(yearFrom !== null ? String(yearFrom) : '')
  }, [yearFrom])

  useEffect(() => {
    setToStr(yearTo !== null ? String(yearTo) : '')
  }, [yearTo])

  const commit = (fText: string, tText: string) => {
    const fVal = fText.trim().length === 4 ? parseInt(fText.trim(), 10) : null
    const tVal = tText.trim().length === 4 ? parseInt(tText.trim(), 10) : null
    onSetYearRange(
      fVal !== null && !isNaN(fVal) ? fVal : null,
      tVal !== null && !isNaN(tVal) ? tVal : null,
    )
  }

  return (
    <div className="mt-2 w-full rounded-2xl border border-border/70 bg-surface/70 p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-[11px] font-bold text-text">Custom Year Range</span>
        {(yearFrom !== null || yearTo !== null || fromStr || toStr) && (
          <button
            type="button"
            onClick={() => {
              setFromStr('')
              setToStr('')
              onClear()
            }}
            className="text-[10px] text-accent hover:underline font-medium cursor-pointer"
          >
            Clear range
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 flex-1">
          <span className="text-[11px] text-subtle font-medium">From:</span>
          <input
            type="text"
            inputMode="numeric"
            maxLength={4}
            placeholder="e.g. 2000"
            value={fromStr}
            onChange={(e) => {
              const text = e.target.value.replace(/\D/g, '').slice(0, 4)
              setFromStr(text)
              commit(text, toStr)
            }}
            className="w-full rounded-xl border border-border bg-surface-raised px-2.5 py-1 text-xs text-text outline-none focus:border-accent font-medium"
          />
        </div>
        <span className="text-subtle font-bold">—</span>
        <div className="flex items-center gap-1.5 flex-1">
          <span className="text-[11px] text-subtle font-medium">To:</span>
          <input
            type="text"
            inputMode="numeric"
            maxLength={4}
            placeholder="e.g. 2005"
            value={toStr}
            onChange={(e) => {
              const text = e.target.value.replace(/\D/g, '').slice(0, 4)
              setToStr(text)
              commit(fromStr, text)
            }}
            className="w-full rounded-xl border border-border bg-surface-raised px-2.5 py-1 text-xs text-text outline-none focus:border-accent font-medium"
          />
        </div>
      </div>
    </div>
  )
}
