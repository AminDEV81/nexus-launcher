import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  CalendarDays,
  CalendarRange,
  Clock3,
  Crown,
  Flame,
  Gamepad2,
  HardDrive,
  History,
  Play,
  Share2,
  Shuffle,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Trophy,
} from 'lucide-react'
import {
  useStatsSummary,
  usePlaytimeByGenre,
  usePlaytimeTimeline,
  useDailyActivity,
  useRecentSessions,
} from '../hooks/use-stats'
import { useGames } from '@/features/library/hooks/use-games'
import { useUiStore } from '@/store/ui-store'
import { useProfileStore } from '@/store/profile-store'
import { assetUrl } from '@/lib/asset-url'
import { formatDateKey, formatPlaytime, localDateKey } from '@/features/library/utils/format'
import { ActivityHeatmap } from '../components/activity-heatmap'
import { RecentSessions } from '../components/recent-sessions'
import { HabitsChart } from '../components/habits-chart'
import { TrophiesGrid } from '../components/trophies-grid'
import { LibraryHealthCard } from '../components/library-health-card'
import { GamerPassportModal } from '../components/gamer-passport-modal'
import { calculateGamerLevel, calculateCircadianHabits } from '../utils/gamer-level'
import { evaluateMilestones } from '../utils/milestones'
import { useAnimationSpeed } from '@/hooks/use-animation-speed'
import { cn } from '@/lib/utils'

const GENRE_COLORS = [
  'var(--color-accent)',
  '#38bdf8',
  '#34d399',
  '#f59e0b',
  '#ec4899',
  '#8b5cf6',
  '#06b6d4',
  '#10b981',
]

type RangeMode = 'daily' | 'weekly'
type StatsTab = 'overview' | 'habits' | 'trophies'

export function StatsPage() {
  const speed = useAnimationSpeed()
  const activeProfile = useProfileStore((s) => s.activeProfile)
  const { data: summary, isPending: summaryPending } = useStatsSummary()
  const { data: genreData, isPending: genrePending } = usePlaytimeByGenre()
  const { data: timelineData, isPending: timelinePending } = usePlaytimeTimeline()
  const { data: dailyData, isPending: dailyPending } = useDailyActivity()
  const { data: sessions, isPending: sessionsPending } = useRecentSessions()
  const { data: games } = useGames()

  const isPending =
    summaryPending || genrePending || timelinePending || dailyPending || sessionsPending

  const [rangeMode, setRangeMode] = useState<RangeMode>('daily')
  const [activeTab, setActiveTab] = useState<StatsTab>('overview')
  const [passportOpen, setPassportOpen] = useState(false)

  const timeline = toHours(timelineData ?? [])
  const daily = toHours(dailyData ?? [])
  const genres = toHours(genreData ?? [])
  const recentHours = sumHours(timeline.slice(-4))
  const previousHours = sumHours(timeline.slice(-8, -4))
  const streak = currentStreak(dailyData ?? [])
  const topGenre = genres[0]

  // RPG Gamer Level & Habits
  const levelInfo = calculateGamerLevel(summary?.total_playtime_seconds ?? 0)
  const habits = calculateCircadianHabits(sessions ?? [])
  const milestones = evaluateMilestones({
    summary,
    genres: genreData,
    sessions,
    streak,
    games,
  })
  const unlockedTrophiesCount = milestones.filter((m) => m.unlocked).length
  const playedCount = (games ?? []).filter((g) => g.total_playtime_seconds > 0).length

  return (
    <div className="h-full overflow-y-auto p-5 sm:p-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        {/* Header */}
        <header className="flex flex-col justify-between gap-4 border-b border-border/60 pb-5 sm:flex-row sm:items-end">
          <div>
            <div className="mb-2 flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-accent">
              <Sparkles className="size-3.5" />
              Nexus Command Telemetry &amp; Analytics
            </div>
            <h1 className="text-2xl font-black tracking-tight text-text sm:text-3xl">
              Playtime Intelligence
            </h1>
            <p className="mt-1 max-w-xl text-sm text-muted">
              Live play rhythms, RPG progression, library engagement, and milestone telemetry.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {activeProfile && (
              <div className="inline-flex items-center gap-2 rounded-xl border border-border/80 bg-surface/80 px-3.5 py-2 font-mono text-xs font-semibold text-text shadow-xs">
                <span
                  className="size-2.5 rounded-full ring-2 ring-accent/30"
                  style={{ backgroundColor: activeProfile.color || 'var(--color-accent)' }}
                />
                <span className="text-muted">Operative:</span>
                <span className="font-bold text-accent">{activeProfile.name}</span>
              </div>
            )}

            <div className="inline-flex w-fit items-center gap-2 rounded-xl border border-border/80 bg-surface/80 px-3.5 py-2 font-mono text-xs font-semibold text-text shadow-xs">
              <CalendarDays className="size-3.5 text-accent" />
              <span>
                {formatDateKey(localDateKey(), {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </span>
            </div>
          </div>
        </header>

        {isPending ? (
          <StatsSkeleton />
        ) : (
          <>
            {/* Cyber Hero Playtime & RPG Level Deck */}
            <section className="relative overflow-hidden rounded-3xl border border-accent/40 bg-surface p-6 shadow-xl ring-1 ring-inset ring-white/10 sm:p-8">
              {/* Glowing Cyber Accent Backdrops (GPU-friendly radial gradients) */}
              <div
                className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full"
                style={{
                  background:
                    'radial-gradient(circle, color-mix(in srgb, var(--nx-accent) 20%, transparent) 0%, transparent 70%)',
                }}
              />
              <div
                className="pointer-events-none absolute -left-20 -bottom-20 size-72 rounded-full"
                style={{
                  background:
                    'radial-gradient(circle, color-mix(in srgb, var(--nx-accent) 10%, transparent) 0%, transparent 70%)',
                }}
              />

              <div className="relative grid gap-6 lg:grid-cols-[1.35fr_1fr] lg:items-end">
                <div>
                  {/* Gamer Level & Rank Pill */}
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/15 px-3 py-1 font-mono text-xs font-black text-accent shadow-sm">
                      <Crown className="size-3.5" />
                      <span>LVL {levelInfo.level}</span>
                      <span className="text-subtle">•</span>
                      <span>{levelInfo.rankTitle}</span>
                    </span>

                    <button
                      type="button"
                      onClick={() => setPassportOpen(true)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-surface-raised/80 px-3 py-1 font-mono text-xs font-bold text-text transition-all hover:border-accent hover:text-accent shadow-xs active:scale-95"
                    >
                      <Share2 className="size-3.5 text-accent" />
                      <span>Gamer Passport</span>
                    </button>
                  </div>

                  {/* Lifetime Hours Big Readout */}
                  <div className="mt-3">
                    <span className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-subtle">
                      LIFETIME LOGGED PLAYTIME
                    </span>
                    <div className="mt-1 font-mono text-4xl font-black tracking-tight text-text sm:text-5xl lg:text-6xl drop-shadow-sm">
                      {formatPlaytime(summary?.total_playtime_seconds ?? 0)}
                    </div>
                  </div>

                  {/* XP Bar to Next Rank */}
                  <div className="mt-4 max-w-md">
                    <div className="flex items-center justify-between font-mono text-[11px] font-bold">
                      <span className="text-muted">Rank XP Progression</span>
                      <span className="text-accent">{levelInfo.progressPercent}%</span>
                    </div>
                    <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-surface-raised ring-1 ring-inset ring-black/20">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${levelInfo.progressPercent}%` }}
                        transition={{ duration: 0.8, ease: 'easeOut' }}
                        className="h-full rounded-full bg-gradient-to-r from-accent to-accent-hover shadow-[0_0_10px_var(--nx-accent)]"
                      />
                    </div>
                  </div>
                </div>

                {/* Right Side Quick Metrics */}
                <div className="grid grid-cols-3 gap-3">
                  <HeroMetricCard
                    label="Last 4 Weeks"
                    value={formatChartHours(recentHours)}
                    hint="Active velocity"
                  />

                  <HeroMetricCard
                    label="Trend Rate"
                    value={formatTrend(recentHours, previousHours)}
                    trend={recentHours >= previousHours ? 'up' : 'down'}
                    hint="vs prior 4 weeks"
                  />

                  <HeroMetricCard
                    label="Daily Streak"
                    value={streak > 0 ? `${streak}d` : '0d'}
                    icon={Flame}
                    accent
                    hint="Consecutive days"
                  />
                </div>
              </div>
            </section>

            {/* Navigation Tabs Switcher */}
            <div className="flex items-center gap-2 border-b border-border/60 pb-1">
              <TabButton
                active={activeTab === 'overview'}
                onClick={() => setActiveTab('overview')}
                icon={Sparkles}
              >
                Command Overview
              </TabButton>
              <TabButton
                active={activeTab === 'habits'}
                onClick={() => setActiveTab('habits')}
                icon={Clock3}
              >
                Rhythms &amp; Habits
              </TabButton>
              <TabButton
                active={activeTab === 'trophies'}
                onClick={() => setActiveTab('trophies')}
                icon={Trophy}
                badge={unlockedTrophiesCount > 0 ? `${unlockedTrophiesCount}` : undefined}
              >
                Trophies &amp; Showcase
              </TabButton>
            </div>

            {/* Animated Tab Content Container */}
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 * speed, ease: 'easeOut' }}
                className="flex flex-col gap-6"
              >
                {/* ── TAB 1: OVERVIEW ── */}
                {activeTab === 'overview' && (
                  <>
                    {/* Core Metric Cards Grid */}
                    <section className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
                      <MetricCard
                        icon={Gamepad2}
                        label="Games in Library"
                        value={String(summary?.total_games ?? 0)}
                        detail="Master collection count"
                      />

                      <MetricCard
                        icon={HardDrive}
                        label="Installed & Ready"
                        value={String(summary?.installed_games ?? 0)}
                        detail="Ready to launch"
                        accent
                      />

                      <MetricCard
                        icon={Trophy}
                        label="Top Genre"
                        value={topGenre?.genre ?? '—'}
                        detail={
                          topGenre
                            ? `${formatChartHours(topGenre.hours)} logged`
                            : 'No playtime yet'
                        }
                      />

                      <MostPlayedCard mostPlayed={summary?.most_played_game ?? null} />
                    </section>

                    {/* Activity Velocity Graph & Taste Spectrum */}
                    <section className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
                      <ActivityChart
                        mode={rangeMode}
                        onModeChange={setRangeMode}
                        daily={daily.slice(-30)}
                        weekly={timeline}
                      />

                      <GenreChart data={genres} />
                    </section>

                    {/* Library Backlog Health & Recent Sessions */}
                    <section className="grid gap-5 lg:grid-cols-[1fr_1.5fr]">
                      <LibraryHealthCard
                        summary={summary}
                        sessions={sessions}
                        playedCount={playedCount}
                      />

                      <div className="flex flex-col justify-between rounded-3xl border border-border/80 bg-surface/70 p-6 shadow-card">
                        <ChartHeader
                          icon={History}
                          eyebrow="SESSION TELEMETRY"
                          title="Recent Activity"
                          detail={`${sessions?.length ?? 0} sessions`}
                        />
                        <RecentSessions sessions={(sessions ?? []).slice(0, 4)} />
                      </div>
                    </section>

                    {/* Random Game Picker */}
                    <RandomGamePicker />
                  </>
                )}

                {/* ── TAB 2: HABITS & CIRCADIAN RHYTHMS ── */}
                {activeTab === 'habits' && (
                  <>
                    {/* Circadian Habits Chart */}
                    <HabitsChart habits={habits} totalSessions={sessions?.length ?? 0} />

                    {/* Activity Heatmap Deck */}
                    <section className="rounded-3xl border border-border/80 bg-surface/70 p-6 shadow-card">
                      <ChartHeader
                        icon={CalendarRange}
                        eyebrow="CONTRIBUTION MATRIX"
                        title="13-Week Activity Heatmap"
                        detail="Daily Intensity Rhythms"
                      />
                      <div className="mt-5">
                        <ActivityHeatmap data={dailyData ?? []} />
                      </div>
                    </section>

                    {/* All Recent Sessions */}
                    <section className="rounded-3xl border border-border/80 bg-surface/70 p-6 shadow-card">
                      <ChartHeader
                        icon={History}
                        eyebrow="COMPLETE TELEMETRY LOG"
                        title="Full Session Timeline"
                        detail={`${sessions?.length ?? 0} total sessions`}
                      />
                      <RecentSessions sessions={sessions ?? []} />
                    </section>
                  </>
                )}

                {/* ── TAB 3: TROPHIES & MILESTONES ── */}
                {activeTab === 'trophies' && <TrophiesGrid milestones={milestones} />}
              </motion.div>
            </AnimatePresence>

            {/* Gamer Passport Modal */}
            <GamerPassportModal
              isOpen={passportOpen}
              onClose={() => setPassportOpen(false)}
              profile={activeProfile}
              levelInfo={levelInfo}
              summary={summary}
              topGenre={topGenre}
              streak={streak}
              milestones={milestones}
            />
          </>
        )}
      </div>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  badge,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: typeof Sparkles
  badge?: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative flex items-center gap-2 rounded-2xl px-4 py-2.5 font-mono text-xs font-bold transition-all',
        active
          ? 'bg-accent text-white shadow-md shadow-accent/20'
          : 'text-muted hover:bg-surface-raised hover:text-text',
      )}
    >
      <Icon
        className={cn(
          'size-4 transition-transform group-hover:scale-110',
          active ? 'text-white' : 'text-accent',
        )}
      />
      <span>{children}</span>
      {badge && (
        <span
          className={cn(
            'rounded-full px-2 py-0.5 font-mono text-[10px] font-extrabold',
            active ? 'bg-white/20 text-white' : 'bg-accent/15 text-accent',
          )}
        >
          {badge}
        </span>
      )}
    </button>
  )
}

function ActivityChart({
  mode,
  onModeChange,
  daily,
  weekly,
}: {
  mode: RangeMode
  onModeChange: (mode: RangeMode) => void
  daily: { date: string; hours: number }[]
  weekly: { week_start: string; hours: number }[]
}) {
  const hasDailyActivity = daily.some((day) => day.hours > 0)
  const hasWeeklyActivity = weekly.some((week) => week.hours > 0)
  const hasActivity = mode === 'daily' ? hasDailyActivity : hasWeeklyActivity
  const peakHours = Math.max(...(mode === 'daily' ? daily : weekly).map((point) => point.hours), 0)

  return (
    <div className="flex flex-col justify-between rounded-3xl border border-border/80 bg-surface/70 p-6 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 pb-4">
        <ChartHeader
          icon={Clock3}
          eyebrow="ACTIVITY VELOCITY"
          title={mode === 'daily' ? 'Past 30 Days Activity' : 'Weekly Playtime Rhythm'}
          detail={hasActivity ? `Peak: ${formatChartHours(peakHours)}` : 'No sessions recorded yet'}
        />

        <div className="flex shrink-0 items-center rounded-xl border border-border/80 bg-surface p-1 shadow-xs">
          <RangeButton active={mode === 'daily'} onClick={() => onModeChange('daily')}>
            Daily View
          </RangeButton>
          <RangeButton active={mode === 'weekly'} onClick={() => onModeChange('weekly')}>
            Weekly View
          </RangeButton>
        </div>
      </div>

      {!hasActivity ? (
        <EmptyChartMessage>
          Your playtime trend will generate here automatically after your first gaming session.
        </EmptyChartMessage>
      ) : mode === 'daily' ? (
        <div className="mt-5 h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={daily} margin={{ top: 12, right: 8, left: -22, bottom: 0 }}>
              <CartesianGrid
                vertical={false}
                strokeDasharray="3 5"
                stroke="var(--color-border)"
                opacity={0.6}
              />
              <XAxis
                dataKey="date"
                tickFormatter={(value: string) =>
                  formatDateKey(value, { month: 'short', day: 'numeric' })
                }
                tick={{ fill: 'var(--color-subtle)', fontSize: 10, fontFamily: 'monospace' }}
                axisLine={false}
                tickLine={false}
                minTickGap={20}
              />
              <YAxis
                tickFormatter={(value: number) => `${value}h`}
                tick={{ fill: 'var(--color-subtle)', fontSize: 10, fontFamily: 'monospace' }}
                axisLine={false}
                tickLine={false}
                width={36}
              />
              <Tooltip
                content={<ChartTooltip labelFormatter={formatDailyLabel} />}
                cursor={{ fill: 'var(--color-accent)', fillOpacity: 0.08, radius: 4 }}
              />
              <Bar
                dataKey="hours"
                fill="var(--color-accent)"
                radius={[4, 4, 0, 0]}
                maxBarSize={18}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="mt-5 h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={weekly} margin={{ top: 12, right: 8, left: -22, bottom: 0 }}>
              <defs>
                <linearGradient id="stats-area-glow" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid
                vertical={false}
                strokeDasharray="3 5"
                stroke="var(--color-border)"
                opacity={0.6}
              />
              <XAxis
                dataKey="week_start"
                tickFormatter={formatWeekLabel}
                tick={{ fill: 'var(--color-subtle)', fontSize: 10, fontFamily: 'monospace' }}
                axisLine={false}
                tickLine={false}
                minTickGap={28}
              />
              <YAxis
                tickFormatter={(value: number) => `${value}h`}
                tick={{ fill: 'var(--color-subtle)', fontSize: 10, fontFamily: 'monospace' }}
                axisLine={false}
                tickLine={false}
                width={36}
              />
              <Tooltip
                content={<ChartTooltip labelFormatter={formatWeekRange} />}
                cursor={{ stroke: 'var(--color-accent)', strokeOpacity: 0.3 }}
              />
              <Area
                type="monotone"
                dataKey="hours"
                stroke="var(--color-accent)"
                strokeWidth={3}
                fill="url(#stats-area-glow)"
                activeDot={{
                  r: 6,
                  fill: 'var(--color-accent)',
                  stroke: 'var(--color-surface)',
                  strokeWidth: 2,
                  filter: 'drop-shadow(0 0 6px var(--nx-accent))',
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

function GenreChart({ data }: { data: { genre: string; hours: number }[] }) {
  const topGenres = data.slice(0, 5)
  const genreHours = sumHours(data)

  return (
    <div className="flex flex-col justify-between rounded-3xl border border-border/80 bg-surface/70 p-6 shadow-card">
      <div className="border-b border-border/60 pb-4">
        <ChartHeader
          icon={Trophy}
          eyebrow="TASTE SPECTRUM"
          title="Top Genres"
          detail={data.length ? `${data.length} genres` : 'Empty'}
        />
      </div>

      {data.length > 0 ? (
        <div className="mt-4 flex flex-col items-center">
          <div className="relative h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip content={<ChartTooltip />} />
                <Pie
                  data={data}
                  dataKey="hours"
                  nameKey="genre"
                  innerRadius={60}
                  outerRadius={84}
                  paddingAngle={3}
                  stroke="none"
                >
                  {data.map((genre, index) => (
                    <Cell key={genre.genre} fill={GENRE_COLORS[index % GENRE_COLORS.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>

            {/* Central Donut Readout */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="font-mono text-2xl font-black text-text">
                {formatChartHours(genreHours)}
              </span>
              <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-subtle">
                CATEGORIZED
              </span>
            </div>
          </div>

          {/* Genre Percentage Bar Breakdown */}
          <div className="mt-3 flex w-full flex-col gap-2.5">
            {topGenres.map((genre, index) => {
              const color = GENRE_COLORS[index % GENRE_COLORS.length]
              const percent = genreHours > 0 ? Math.round((genre.hours / genreHours) * 100) : 0

              return (
                <div key={genre.genre} className="flex flex-col gap-1 text-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="size-2 rounded-full" style={{ backgroundColor: color }} />
                      <span className="font-bold text-text truncate max-w-[130px]">
                        {genre.genre}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 font-mono text-[11px]">
                      <span className="font-bold text-muted">{formatChartHours(genre.hours)}</span>
                      <span className="font-bold text-subtle">({percent}%)</span>
                    </div>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-raised">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${percent}%`, backgroundColor: color }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <EmptyChartMessage>
          Play games with genre tags to generate your taste distribution.
        </EmptyChartMessage>
      )}
    </div>
  )
}

function RangeButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-lg px-3 py-1.5 font-mono text-xs font-bold transition-all shadow-xs',
        active
          ? 'bg-accent text-white shadow-sm'
          : 'text-subtle hover:bg-surface-raised hover:text-text',
      )}
    >
      {children}
    </button>
  )
}

function ChartHeader({
  icon: Icon,
  eyebrow,
  title,
  detail,
}: {
  icon: typeof Clock3
  eyebrow: string
  title: string
  detail: string
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-accent">
          <Icon className="size-3.5" />
          <span>{eyebrow}</span>
        </div>
        <h2 className="mt-1 text-base font-bold text-text">{title}</h2>
      </div>
      <span className="rounded-full border border-border/80 bg-surface px-3 py-1 font-mono text-[10px] font-bold text-subtle shadow-xs">
        {detail}
      </span>
    </div>
  )
}

function HeroMetricCard({
  label,
  value,
  trend,
  icon: Icon,
  accent = false,
  hint,
}: {
  label: string
  value: string
  trend?: 'up' | 'down'
  icon?: typeof Flame
  accent?: boolean
  hint?: string
}) {
  return (
    <div className="flex flex-col justify-between rounded-2xl border border-border/80 bg-surface/80 p-3.5 shadow-xs transition-all hover:bg-surface-raised">
      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-subtle">
        <span>{label}</span>
        {Icon && (
          <Icon className="size-3.5 text-amber-500 drop-shadow-[0_0_6px_rgba(245,158,11,0.5)]" />
        )}
        {trend &&
          (trend === 'up' ? (
            <TrendingUp className="size-3.5 text-emerald-400" />
          ) : (
            <TrendingDown className="size-3.5 text-rose-500" />
          ))}
      </div>

      <div
        className={cn(
          'mt-2 font-mono text-xl font-black tracking-tight sm:text-2xl',
          accent ? 'text-accent' : 'text-text',
        )}
      >
        {value}
      </div>

      {hint && <span className="mt-1 text-[10px] text-muted">{hint}</span>}
    </div>
  )
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  accent = false,
}: {
  icon: typeof Gamepad2
  label: string
  value: string
  detail: string
  accent?: boolean
}) {
  return (
    <div className="flex flex-col justify-between rounded-2xl border border-border/80 bg-surface/70 p-4 shadow-sm transition-all hover:bg-surface-raised">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="text-xs font-bold text-subtle uppercase">{label}</span>
          <div
            className={cn(
              'mt-1 font-mono text-2xl font-black tracking-tight',
              accent ? 'text-accent' : 'text-text',
            )}
            title={value}
          >
            {value}
          </div>
        </div>
        <span className="flex size-10 items-center justify-center rounded-xl bg-accent/15 text-accent shadow-xs">
          <Icon className="size-5" />
        </span>
      </div>
      <div className="mt-3 text-xs text-muted">{detail}</div>
    </div>
  )
}

function MostPlayedCard({
  mostPlayed,
}: {
  mostPlayed: {
    id: string
    name: string
    cover_path: string | null
    total_playtime_seconds: number
  } | null
}) {
  const navigate = useNavigate()
  const selectGame = useUiStore((s) => s.selectGame)
  const cover = assetUrl(mostPlayed?.cover_path)

  if (!mostPlayed) {
    return (
      <MetricCard icon={Trophy} label="Top Champion" value="—" detail="No gaming records yet" />
    )
  }

  return (
    <button
      type="button"
      onClick={() => {
        selectGame(mostPlayed.id)
        navigate('/')
      }}
      className="group flex flex-col justify-between rounded-2xl border border-border/80 bg-surface/70 p-4 text-left shadow-sm transition-all duration-200 hover:border-accent/50 hover:bg-surface-raised hover:shadow-md hover:shadow-accent/5 active:scale-[0.99]"
    >
      <div className="flex items-start gap-3">
        <span className="relative flex h-14 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/80 bg-surface shadow-xs transition-transform duration-200 group-hover:scale-105">
          {cover ? (
            <img src={cover} alt="" className="size-full object-cover" />
          ) : (
            <Trophy className="size-5 text-accent" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-wider text-accent">
            <Trophy className="size-3" />
            <span>MOST PLAYED</span>
          </div>
          <div className="mt-0.5 truncate text-sm font-bold text-text group-hover:text-accent">
            {mostPlayed.name}
          </div>
          <div className="mt-1 font-mono text-xs font-bold text-muted">
            {formatPlaytime(mostPlayed.total_playtime_seconds)}
          </div>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between border-t border-border/40 pt-2 text-[11px] font-semibold text-accent">
        <span>Open in Library</span>
        <Play className="size-3 fill-current" />
      </div>
    </button>
  )
}

function RandomGamePicker() {
  const { data: games } = useGames()
  const navigate = useNavigate()
  const selectGame = useUiStore((s) => s.selectGame)
  const [picking, setPicking] = useState(false)

  function handlePick() {
    if (!games || games.length === 0) return
    const installed = games.filter((game) => game.is_installed && !game.is_hidden)
    const candidates = installed.length > 0 ? installed : games.filter((game) => !game.is_hidden)
    if (candidates.length === 0) return

    setPicking(true)
    const chosen = candidates[Math.floor(Math.random() * candidates.length)]
    window.setTimeout(() => {
      setPicking(false)
      selectGame(chosen.id)
      navigate('/')
    }, 250)
  }

  return (
    <button
      type="button"
      onClick={handlePick}
      disabled={!games || games.length === 0}
      className="group relative flex items-center justify-between gap-4 overflow-hidden rounded-3xl border border-dashed border-accent/40 bg-surface/60 p-5 text-left shadow-sm transition-all duration-200 hover:border-accent hover:bg-surface-raised active:scale-[0.99] disabled:opacity-50"
    >
      <div className="flex items-center gap-3.5">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-accent/15 text-accent shadow-xs transition-transform duration-300 group-hover:scale-110 group-hover:bg-accent group-hover:text-white">
          <Shuffle className={picking ? 'size-5 animate-spin' : 'size-5'} />
        </span>
        <div>
          <div className="text-sm font-bold text-text group-hover:text-accent">
            Undecided what to play?
          </div>
          <div className="text-xs text-muted">
            Spin the Nexus cyber-roulette to pick a random installed title from your backlog.
          </div>
        </div>
      </div>

      <span className="flex items-center gap-1.5 rounded-xl border border-accent/40 bg-accent/10 px-4 py-2 font-mono text-xs font-bold text-accent shadow-xs transition-colors group-hover:bg-accent group-hover:text-white">
        <span>Pick for me</span>
      </span>
    </button>
  )
}

function toHours<T extends { total_playtime_seconds: number }>(
  data: T[],
): (T & { hours: number })[] {
  return data.map((item) => ({
    ...item,
    hours: Math.round((item.total_playtime_seconds / 3600) * 10) / 10,
  }))
}

function sumHours(data: { hours: number }[]) {
  return Math.round(data.reduce((total, item) => total + item.hours, 0) * 10) / 10
}

function currentStreak(daily: { total_playtime_seconds: number }[]): number {
  if (daily.length === 0) return 0
  let index = daily.length - 1
  if (daily[index].total_playtime_seconds === 0) {
    index -= 1
    if (index < 0) return 0
  }
  let streak = 0
  while (index >= 0 && daily[index].total_playtime_seconds > 0) {
    streak += 1
    index -= 1
  }
  return streak
}

function formatChartHours(hours: number): string {
  if (hours <= 0) return '0h'
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`
  return `${hours.toLocaleString(undefined, { maximumFractionDigits: 1 })}h`
}

function formatTrend(current: number, previous: number): string {
  if (current === 0 && previous === 0) return '0%'
  if (previous === 0) return '+100%'
  const change = Math.round(((current - previous) / previous) * 100)
  return `${change > 0 ? '+' : ''}${change}%`
}

function formatDailyLabel(dateKey: string): string {
  return formatDateKey(dateKey, { weekday: 'short', month: 'short', day: 'numeric' })
}

function formatWeekLabel(weekStart: string): string {
  return formatDateKey(weekStart, { month: 'short', day: 'numeric' })
}

function formatWeekRange(weekStart: string): string {
  const end = new Date(`${weekStart}T00:00:00Z`)
  if (Number.isNaN(end.getTime())) return weekStart
  end.setUTCDate(end.getUTCDate() + 6)
  return `${formatDateKey(weekStart, { month: 'long', day: 'numeric' })} – ${formatDateKey(end.toISOString().slice(0, 10), { month: 'long', day: 'numeric', year: 'numeric' })}`
}

function ChartTooltip({
  active,
  payload,
  label,
  labelFormatter,
}: {
  active?: boolean
  payload?: { value?: number; name?: string }[]
  label?: string
  labelFormatter?: (label: string) => string
}) {
  if (!active || !payload?.length) return null
  const value = Number(payload[0].value ?? 0)

  return (
    <div className="glass-panel rounded-xl border border-border bg-surface/95 px-3.5 py-2.5 text-xs shadow-xl backdrop-blur-md">
      {(label || payload[0].name) && (
        <div className="font-bold text-text">
          {label ? (labelFormatter ? labelFormatter(label) : label) : payload[0].name}
        </div>
      )}
      <div className="mt-1 font-mono font-bold text-accent">{formatChartHours(value)}</div>
    </div>
  )
}

function EmptyChartMessage({ children }: { children: ReactNode }) {
  return (
    <div className="mt-4 flex h-56 items-center justify-center rounded-2xl border border-dashed border-border/80 bg-surface/30 px-8 text-center text-xs font-medium text-subtle">
      {children}
    </div>
  )
}

function StatsSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="h-56 animate-pulse rounded-3xl border border-border bg-surface" />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="h-28 animate-pulse rounded-2xl border border-border bg-surface"
          />
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <div className="h-96 animate-pulse rounded-3xl border border-border bg-surface" />
        <div className="h-96 animate-pulse rounded-3xl border border-border bg-surface" />
      </div>
      <div className="h-44 animate-pulse rounded-3xl border border-border bg-surface" />
    </div>
  )
}
