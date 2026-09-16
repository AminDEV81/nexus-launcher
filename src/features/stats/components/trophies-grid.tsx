import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  Sparkles,
  Gamepad2,
  Compass,
  Zap,
  Flame,
  Moon,
  Trophy,
  Crown,
  Clock,
  Shield,
  Target,
  Layers,
  Library,
  FolderArchive,
  HardDrive,
  Disc,
  Play,
  Activity,
  Sun,
  Coffee,
  Tv,
  Sofa,
  Swords,
  Crosshair,
  Brain,
  MapPin,
  Heart,
  Laptop,
  Award,
  CheckCircle2,
  Tag,
  Image,
  ShieldCheck,
  Lock,
  Search,
  X,
} from 'lucide-react'
import type { Milestone, MilestoneCategory } from '../utils/milestones'
import { cn } from '@/lib/utils'

interface TrophiesGridProps {
  milestones: Milestone[]
}

const ICONS: Record<string, typeof Trophy> = {
  Sparkles,
  Gamepad2,
  Compass,
  Zap,
  Flame,
  Moon,
  Trophy,
  Crown,
  Clock,
  Shield,
  Target,
  Layers,
  Library,
  FolderArchive,
  HardDrive,
  Disc,
  Play,
  Activity,
  Sun,
  Coffee,
  Tv,
  Sofa,
  Swords,
  Crosshair,
  Brain,
  MapPin,
  Heart,
  Laptop,
  Award,
  CheckCircle2,
  Tag,
  Image,
  ShieldCheck,
}

const TIER_COLORS = {
  bronze: {
    badge: 'border-amber-700/40 bg-amber-700/10 text-amber-500',
    glow: 'shadow-amber-900/20',
    dot: 'bg-amber-600',
  },
  silver: {
    badge: 'border-slate-400/40 bg-slate-400/10 text-slate-300',
    glow: 'shadow-slate-400/20',
    dot: 'bg-slate-400',
  },
  gold: {
    badge: 'border-amber-400/40 bg-amber-400/10 text-amber-300',
    glow: 'shadow-amber-400/20',
    dot: 'bg-amber-400',
  },
  platinum: {
    badge: 'border-cyan-400/40 bg-cyan-400/10 text-cyan-300',
    glow: 'shadow-cyan-400/30',
    dot: 'bg-cyan-400',
  },
}

const CATEGORIES: { id: 'all' | MilestoneCategory; label: string; icon: typeof Trophy }[] = [
  { id: 'all', label: 'All', icon: Trophy },
  { id: 'playtime', label: 'Playtime', icon: Clock },
  { id: 'collection', label: 'Collection', icon: Library },
  { id: 'streaks', label: 'Streaks', icon: Flame },
  { id: 'sessions', label: 'Sessions', icon: Activity },
  { id: 'habits', label: 'Rhythms', icon: Moon },
  { id: 'genres', label: 'Genres', icon: Compass },
  { id: 'devotion', label: 'Devotion', icon: Heart },
  { id: 'mastery', label: 'Mastery', icon: Crown },
]

export function TrophiesGrid({ milestones }: TrophiesGridProps) {
  const [activeCategory, setActiveCategory] = useState<'all' | MilestoneCategory>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'unlocked' | 'locked'>('all')
  const [tierFilter, setTierFilter] = useState<'all' | 'bronze' | 'silver' | 'gold' | 'platinum'>(
    'all',
  )
  const [searchQuery, setSearchQuery] = useState('')

  // Overview Counts
  const unlockedCount = useMemo(() => milestones.filter((m) => m.unlocked).length, [milestones])
  const totalCount = milestones.length
  const completionPercent = totalCount > 0 ? Math.round((unlockedCount / totalCount) * 100) : 0

  // Tier counts
  const tierCounts = useMemo(() => {
    const counts = {
      bronze: { total: 0, unlocked: 0 },
      silver: { total: 0, unlocked: 0 },
      gold: { total: 0, unlocked: 0 },
      platinum: { total: 0, unlocked: 0 },
    }
    for (const m of milestones) {
      counts[m.tier].total++
      if (m.unlocked) counts[m.tier].unlocked++
    }
    return counts
  }, [milestones])

  // Category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, { total: number; unlocked: number }> = {}
    for (const m of milestones) {
      if (!counts[m.category]) {
        counts[m.category] = { total: 0, unlocked: 0 }
      }
      counts[m.category].total++
      if (m.unlocked) counts[m.category].unlocked++
    }
    return counts
  }, [milestones])

  // Filtered Milestones
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return milestones.filter((m) => {
      // Category filter
      if (activeCategory !== 'all' && m.category !== activeCategory) return false

      // Status filter
      if (statusFilter === 'unlocked' && !m.unlocked) return false
      if (statusFilter === 'locked' && m.unlocked) return false

      // Tier filter
      if (tierFilter !== 'all' && m.tier !== tierFilter) return false

      // Search query filter
      if (q) {
        const matchesTitle = m.title.toLowerCase().includes(q)
        const matchesSubtitle = m.subtitle.toLowerCase().includes(q)
        const matchesDesc = m.description.toLowerCase().includes(q)
        if (!matchesTitle && !matchesSubtitle && !matchesDesc) return false
      }

      return true
    })
  }, [milestones, activeCategory, statusFilter, tierFilter, searchQuery])

  return (
    <div className="flex flex-col gap-6">
      {/* ── Main Trophy Command Deck ──────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-3xl border border-border/80 bg-surface/80 p-6 shadow-card">
        <div className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-accent/15 blur-3xl" />

        <div className="relative flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-widest text-accent">
              <Trophy className="size-3.5" />
              NEXUS TROPHY MATRIX // 100 MILESTONES
            </div>
            <h3 className="mt-1 text-2xl font-black tracking-tight text-text">Achievement Codex</h3>
            <p className="mt-0.5 text-xs text-muted">
              Unlock prestigious trophies across playtime, library expansion, endurance marathons,
              and daily rhythms.
            </p>
          </div>

          {/* Master Progress Pill */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2.5 rounded-2xl border border-accent/40 bg-accent/10 px-4 py-2.5 font-mono text-xs font-bold text-accent shadow-xs">
              <CheckCircle2 className="size-4.5" />
              <span>
                {unlockedCount} / {totalCount} Unlocked ({completionPercent}%)
              </span>
            </div>
          </div>
        </div>

        {/* Tier Stats Row */}
        <div className="mt-5 grid grid-cols-2 gap-2.5 border-t border-border/60 pt-4 sm:grid-cols-4">
          {(['bronze', 'silver', 'gold', 'platinum'] as const).map((tier) => {
            const data = tierCounts[tier]
            const isSelected = tierFilter === tier
            return (
              <button
                key={tier}
                type="button"
                onClick={() => setTierFilter(isSelected ? 'all' : tier)}
                className={cn(
                  'flex items-center justify-between rounded-xl border p-2.5 text-left transition-all cursor-pointer',
                  isSelected
                    ? 'border-accent bg-accent/15 shadow-xs'
                    : 'border-border/70 bg-surface/60 hover:bg-surface-raised hover:border-border',
                )}
              >
                <div className="flex items-center gap-2">
                  <span className={cn('size-2 rounded-full', TIER_COLORS[tier].dot)} />
                  <span className="text-xs font-bold capitalize text-text">{tier}</span>
                </div>
                <span className="font-mono text-xs font-semibold text-muted">
                  <strong className="text-text">{data.unlocked}</strong> / {data.total}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Filters, Categories & Search Bar ──────────────────────────────── */}
      <div className="flex flex-col gap-3">
        {/* Top Controls: Search + Status */}
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          {/* Real-time Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search 100 achievements (e.g., Midnight, 100h, Marathon)..."
              className="w-full rounded-xl border border-border/80 bg-surface/90 py-2 pl-9.5 pr-8 text-xs text-text placeholder:text-muted/70 shadow-2xs focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/40"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-muted hover:text-text cursor-pointer"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          {/* Status Segmented Filter */}
          <div className="flex items-center gap-1.5 self-start sm:self-auto rounded-xl border border-border/80 bg-surface/90 p-1 shadow-2xs">
            <FilterButton active={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>
              All ({totalCount})
            </FilterButton>
            <FilterButton
              active={statusFilter === 'unlocked'}
              onClick={() => setStatusFilter('unlocked')}
            >
              Unlocked ({unlockedCount})
            </FilterButton>
            <FilterButton
              active={statusFilter === 'locked'}
              onClick={() => setStatusFilter('locked')}
            >
              In Progress ({totalCount - unlockedCount})
            </FilterButton>
          </div>
        </div>

        {/* Category Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon
            const isSelected = activeCategory === cat.id
            const count = cat.id === 'all' ? totalCount : (categoryCounts[cat.id]?.total ?? 0)
            const unlocked =
              cat.id === 'all' ? unlockedCount : (categoryCounts[cat.id]?.unlocked ?? 0)

            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className={cn(
                  'flex items-center gap-2 whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-bold transition-all cursor-pointer shadow-2xs shrink-0',
                  isSelected
                    ? 'bg-accent text-white shadow-xs'
                    : 'border border-border/80 bg-surface/70 text-muted hover:border-border hover:bg-surface hover:text-text',
                )}
              >
                <Icon className="size-3.5" />
                <span>{cat.label}</span>
                <span
                  className={cn(
                    'rounded-md px-1.5 py-0.2 text-[10px] font-mono font-bold',
                    isSelected ? 'bg-white/20 text-white' : 'bg-surface-raised text-subtle',
                  )}
                >
                  {unlocked}/{count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Active Filter Bar Reset Notification ──────────────────────────── */}
      {(searchQuery ||
        activeCategory !== 'all' ||
        statusFilter !== 'all' ||
        tierFilter !== 'all') && (
        <div className="flex items-center justify-between rounded-xl border border-border/60 bg-surface/40 px-3 py-1.5 text-xs text-muted">
          <span>
            Showing <strong className="text-text">{filtered.length}</strong> matching trophies
          </span>
          <button
            type="button"
            onClick={() => {
              setActiveCategory('all')
              setStatusFilter('all')
              setTierFilter('all')
              setSearchQuery('')
            }}
            className="text-[11px] font-bold text-accent hover:underline cursor-pointer"
          >
            Reset all filters
          </button>
        </div>
      )}

      {/* ── Empty State ───────────────────────────────────────────────────── */}
      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border/80 bg-surface/40 p-12 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-surface-raised text-muted mb-3">
            <Search className="size-6" />
          </div>
          <h4 className="text-base font-bold text-text">No Milestones Found</h4>
          <p className="mt-1 text-xs text-muted max-w-sm">
            No achievements match your current search and filter combination.
          </p>
          <button
            type="button"
            onClick={() => {
              setActiveCategory('all')
              setStatusFilter('all')
              setTierFilter('all')
              setSearchQuery('')
            }}
            className="mt-4 rounded-xl bg-surface-raised px-4 py-2 text-xs font-bold text-accent hover:bg-accent/15 transition-colors cursor-pointer"
          >
            Clear Filters
          </button>
        </div>
      )}

      {/* ── Grid of 100 Badges ────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filtered.map((milestone) => {
          const IconComponent = ICONS[milestone.iconName] ?? Trophy
          const tierStyle = TIER_COLORS[milestone.tier]

          return (
            <motion.div
              key={milestone.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15 }}
              className={cn(
                'group relative flex flex-col justify-between rounded-3xl border p-5 transition-all duration-200 shadow-2xs',
                milestone.unlocked
                  ? 'border-accent/50 bg-gradient-to-br from-surface to-surface-raised shadow-md shadow-accent/5 hover:border-accent hover:shadow-accent/10 hover:-translate-y-0.5'
                  : 'border-border/60 bg-surface/40 opacity-75 hover:opacity-100 hover:bg-surface/70 hover:border-border/90',
              )}
            >
              <div>
                {/* Header: Icon & Tier Tag */}
                <div className="flex items-start justify-between">
                  <span
                    className={cn(
                      'flex size-12 items-center justify-center rounded-2xl shadow-sm transition-transform duration-200 group-hover:scale-105',
                      milestone.unlocked
                        ? 'bg-accent text-white shadow-accent/30 ring-2 ring-accent/30'
                        : 'bg-surface-raised text-subtle border border-border/80',
                    )}
                  >
                    <IconComponent className="size-6" />
                  </span>

                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        'rounded-full border px-2.5 py-0.5 font-mono text-[9px] font-extrabold uppercase tracking-wider',
                        tierStyle.badge,
                      )}
                    >
                      {milestone.tier}
                    </span>

                    {milestone.unlocked ? (
                      <span className="flex size-6 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
                        <CheckCircle2 className="size-3.5" />
                      </span>
                    ) : (
                      <span className="flex size-6 items-center justify-center rounded-full bg-surface-raised text-subtle">
                        <Lock className="size-3" />
                      </span>
                    )}
                  </div>
                </div>

                {/* Title & Description */}
                <div className="mt-4">
                  <span className="block font-mono text-[10px] font-bold uppercase tracking-wider text-accent">
                    {milestone.subtitle}
                  </span>
                  <h4 className="text-base font-bold text-text">{milestone.title}</h4>
                  <p className="mt-1 text-xs text-muted leading-relaxed line-clamp-3">
                    {milestone.description}
                  </p>
                </div>
              </div>

              {/* Progress Footer */}
              <div className="mt-5 border-t border-border/40 pt-3">
                <div className="flex items-center justify-between font-mono text-[10px] font-bold">
                  <span className="text-subtle truncate max-w-[150px]">
                    {milestone.progressLabel}
                  </span>
                  <span className={milestone.unlocked ? 'text-accent' : 'text-muted'}>
                    {milestone.progressPercent}%
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-raised">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-500',
                      milestone.unlocked
                        ? 'bg-accent shadow-[0_0_8px_var(--nx-accent)]'
                        : 'bg-muted/40',
                    )}
                    style={{ width: `${milestone.progressPercent}%` }}
                  />
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-lg px-2.5 py-1 font-mono text-xs font-bold transition-all cursor-pointer',
        active ? 'bg-accent text-white shadow-xs' : 'text-subtle hover:text-text',
      )}
    >
      {children}
    </button>
  )
}
