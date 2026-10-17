import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowRight,
  ArrowUpCircle,
  ChevronRight,
  Cpu,
  DatabaseBackup,
  KeyRound,
  MonitorCog,
  Music,
  Palette,
  Rocket,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAnimationSpeed } from '@/hooks/use-animation-speed'
import { useUpdaterStore } from '@/store/updater-store'
import { useThemeStore } from '@/store/theme-store'
import { playButtonClick } from '@/lib/sound-engine'
import { AppearancePanel } from '../components/appearance-panel'
import { PerformancePanel } from '../components/performance-panel'
import { ApiKeysPanel } from '../components/api-keys-panel'
import { BackupPanel } from '../components/backup-panel'
import { CleanupPanel } from '../components/cleanup-panel'
import { SystemSpecsPanel } from '../components/system-specs-panel'
import { SoundtrackSettingsPanel } from '../components/soundtrack-settings-panel'
import { BoosterPanel } from '@/features/booster/components/booster-panel'
import { UpdatesPanel } from '../components/updates-panel'

export type SettingsSectionId =
  | 'appearance'
  | 'performance'
  | 'booster'
  | 'system_specs'
  | 'metadata'
  | 'soundtrack'
  | 'backup'
  | 'cleanup'
  | 'updates'

interface SectionMeta {
  id: SettingsSectionId
  category:
    | 'Interface & Behavior'
    | 'Gaming & Hardware'
    | 'Integrations & Media'
    | 'Data & Maintenance'
  label: string
  shortDesc: string
  description: string
  icon: typeof Palette
  badge?: string
}

const SECTIONS: SectionMeta[] = [
  // 1. Interface & Behavior
  {
    id: 'appearance',
    category: 'Interface & Behavior',
    label: 'Appearance & Theme',
    shortDesc: 'Theme, colors, fonts & density',
    description:
      'Customize Dark/Light mode, accent palettes, gaming typography, glass blur, card density, and UI audio cues.',
    icon: Palette,
  },
  {
    id: 'performance',
    category: 'Interface & Behavior',
    label: 'Launcher & Downloads',
    shortDesc: 'Download turbo, launch behavior & FPS',
    description:
      'Configure parallel HTTP download streams, bandwidth limits, auto-extraction, launch window hiding, GPU Eco mode, and 60 FPS lock.',
    icon: MonitorCog,
  },
  // 2. Gaming & Hardware
  {
    id: 'booster',
    category: 'Gaming & Hardware',
    label: 'Game Booster & OS Tuner',
    shortDesc: 'RAM purge, process killer & kernel tweaks',
    description:
      'Maximize in-game FPS with Working Set & Standby RAM purge, process whitelisting, 1.0ms kernel timer, GPU MSI mode, and network ping tweaks.',
    icon: Rocket,
    badge: 'PRO',
  },
  {
    id: 'system_specs',
    category: 'Gaming & Hardware',
    label: 'Hardware & System Specs',
    shortDesc: 'Live CPU, GPU, RAM & disk telemetry',
    description:
      'Inspect real-time processor load, memory allocation, graphics drivers, storage volumes, and export a full hardware report.',
    icon: Cpu,
  },
  // 3. Integrations & Media
  {
    id: 'metadata',
    category: 'Integrations & Media',
    label: 'Storefront & API Keys',
    shortDesc: 'Nexus Cloud, IGDB, SteamGridDB & region',
    description:
      'Switch between zero-config Nexus Cloud and personal IGDB/SteamGridDB keys, set your Steam pricing region, and sign in to YouTube.',
    icon: KeyRound,
  },
  {
    id: 'soundtrack',
    category: 'Integrations & Media',
    label: 'Soundtrack & Audio',
    shortDesc: 'Visualizer, OST storage & music sources',
    description:
      'Configure audio visualizer styles, offline soundtrack download folders, streaming provider priorities, and media hotkeys.',
    icon: Music,
  },
  // 4. Data & Maintenance
  {
    id: 'backup',
    category: 'Data & Maintenance',
    label: 'Backup & Restore',
    shortDesc: 'Export or import library & save states',
    description:
      'Create portable JSON archives of your library, collections, tags, profiles, and save states or restore from a backup.',
    icon: DatabaseBackup,
  },
  {
    id: 'cleanup',
    category: 'Data & Maintenance',
    label: 'Storage Cleaner',
    shortDesc: 'Reclaim disk space & orphaned caches',
    description:
      'Safely scan and purge orphaned artwork caches, old save snapshots, and staging scratch buffers while protecting live game saves.',
    icon: Trash2,
  },
  {
    id: 'updates',
    category: 'Data & Maintenance',
    label: 'Updates & Version',
    shortDesc: 'Release channel & auto-updater',
    description:
      'Check for new Nexus Launcher releases, manage automatic background update checks, and verify package signatures.',
    icon: ArrowUpCircle,
  },
]

const CATEGORIES = [
  'Interface & Behavior',
  'Gaming & Hardware',
  'Integrations & Media',
  'Data & Maintenance',
] as const

interface SearchableSettingItem {
  title: string
  detail: string
  keywords: string
  sectionId: SettingsSectionId
}

const SEARCHABLE_SETTINGS: SearchableSettingItem[] = [
  {
    title: 'Dark Mode / Light Mode',
    detail: 'Switch between deep obsidian dark theme and high-contrast light theme',
    keywords: 'theme dark light mode night day appearance color',
    sectionId: 'appearance',
  },
  {
    title: 'Accent Color Palette',
    detail: 'Violet, Ocean, Emerald, Crimson, Amber, Cyberpunk, Solaris, Toxic, Aquamarine, Inferno',
    keywords: 'palette color accent neon purple blue green red pink theme',
    sectionId: 'appearance',
  },
  {
    title: 'Typography & UI Font Family',
    detail: 'Sora, Rajdhani, Orbitron, Chakra Petch, Plus Jakarta, JetBrains Mono, Outfit, Russo, Teko',
    keywords: 'font typography text family size style monospace sci-fi esports',
    sectionId: 'appearance',
  },
  {
    title: 'Glass Blur Intensity & Animation Speed',
    detail: 'Adjust frosted glass backdrop blur (px) and UI transition speed multiplier',
    keywords: 'blur glass frosted animation speed spring transition motion',
    sectionId: 'appearance',
  },
  {
    title: 'Library Grid Card Density & Compact Mode',
    detail: 'Control poster card minimum width and compact UI padding',
    keywords: 'grid card size width density compact columns library layout',
    sectionId: 'appearance',
  },
  {
    title: 'Cybernetic UI Audio & Click Sounds',
    detail: 'Toggle button click sounds, hover cues, and startup chime',
    keywords: 'sound audio click mute sfx effects chime',
    sectionId: 'appearance',
  },
  {
    title: 'Parallel Download Streams (6x to 32x Turbo)',
    detail: 'Configure simultaneous HTTP Range connections for maximum download speed',
    keywords: 'download streams parallel connections turbo idm fast network',
    sectionId: 'performance',
  },
  {
    title: 'Global Bandwidth Speed Limit',
    detail: 'Throttle or uncap download speed (Unlimited, 1 MB/s to 50 MB/s)',
    keywords: 'bandwidth throttle speed limit cap download network',
    sectionId: 'performance',
  },
  {
    title: 'Gaming Mode (Auto-Pause Downloads)',
    detail: 'Automatically pause active downloads when a game starts to protect ping',
    keywords: 'gaming mode auto pause download ping lag',
    sectionId: 'performance',
  },
  {
    title: 'Auto-Extract & Auto-Delete Downloaded Archives',
    detail: 'Unpack .zip, .rar, and .7z archives automatically and clean up archives after install',
    keywords: 'extract zip rar 7z archive unpack delete cleanup install',
    sectionId: 'performance',
  },
  {
    title: 'On Game Launch Window Behavior',
    detail: 'Hide to System Tray, Minimize to Taskbar, or Keep Window Open while playing',
    keywords: 'launch window hide minimize tray taskbar close behavior',
    sectionId: 'performance',
  },
  {
    title: 'GPU Eco Mode, Lock 60 FPS & Reduce Motion',
    detail: 'Cap launcher framerate to 60 Hz, disable heavy shaders/blurs, or disable animations',
    keywords: 'gpu eco mode 60 fps cap framerate lock reduce motion ambient glow battery',
    sectionId: 'performance',
  },
  {
    title: 'Game Booster & Auto-Boost on Launch',
    detail: '1-click hardware optimization, Esports/Streamer presets, and automatic boost before games',
    keywords: 'game booster overclock auto boost fps performance optimize',
    sectionId: 'booster',
  },
  {
    title: 'Background Process Killer & App Whitelist (Discord / Spotify Safe)',
    detail: 'View RAM usage per background app, protect voice/chat apps, and kill memory hogs',
    keywords: 'process killer task manager close apps discord spotify chrome whitelist protect ram',
    sectionId: 'booster',
  },
  {
    title: 'Working Set & Standby List RAM Purge',
    detail: 'Flush Windows Standby memory cache and trim background process working sets',
    keywords: 'ram memory purge flush standby list emptyworkingset stutter free',
    sectionId: 'booster',
  },
  {
    title: 'Deep Windows Tweaks (Network Ping, GPU MSI Mode, BCD Timer)',
    detail: 'Disable Nagle TCP delay, enable GPU MSI interrupts, disable Dynamic Tick, debloat telemetry',
    keywords: 'network ping tcp nodelay msi gpu interrupt bcd timer hpet telemetry debloat',
    sectionId: 'booster',
  },
  {
    title: 'DirectX, NVIDIA & AMD Shader Cache Cleaner + Restore Point',
    detail: 'Purge corrupted GPU shader caches and create a Windows System Restore Point',
    keywords: 'shader cache directx nvidia amd stutter restore point backup windows',
    sectionId: 'booster',
  },
  {
    title: 'Hardware Specifications & Live CPU/RAM Telemetry',
    detail: 'Inspect CPU cores/clock, GPU VRAM/driver, RAM usage, SSD/HDD space, and copy report',
    keywords: 'system specs hardware cpu gpu vram ram disk ssd motherboard monitor',
    sectionId: 'system_specs',
  },
  {
    title: 'Nexus Cloud vs. Personal IGDB & SteamGridDB API Keys',
    detail: 'Use zero-config Nexus Cloud or enter custom Twitch/IGDB and SteamGridDB credentials',
    keywords: 'api keys igdb steamgriddb metadata covers artwork cloud twitch client secret',
    sectionId: 'metadata',
  },
  {
    title: 'Steam Store Region & Currency Pricing',
    detail: 'Set default country/currency (US, EU, UK, TR, AR, BR, UA, IN, JP...) for Wishlist & Hub prices',
    keywords: 'steam region currency price store country discount wishlist',
    sectionId: 'metadata',
  },
  {
    title: 'YouTube / Google Sign-In for Age-Restricted (18+) Trailers',
    detail: 'Authenticate your Google account to watch age-gated game trailers',
    keywords: 'youtube google login sign in trailer age restricted 18+',
    sectionId: 'metadata',
  },
  {
    title: 'Soundtrack Audio Visualizer & Offline Download Folder',
    detail: 'Switch between Off, Minimal Bars, and Reactive Wave visualizer or change OST folder',
    keywords: 'soundtrack ost music visualizer folder directory download khinsider',
    sectionId: 'soundtrack',
  },
  {
    title: 'Export & Restore Library Backup (.json)',
    detail: 'Back up or restore all games, collections, tags, profiles, play sessions, and settings',
    keywords: 'backup export import restore database sqlite json save',
    sectionId: 'backup',
  },
  {
    title: 'Storage Cleaner (Orphaned Saves, Snapshots & Artwork Cache)',
    detail: 'Scan and delete leftover files from deleted games and old save snapshots',
    keywords: 'cleanup cleaner storage disk space orphaned saves snapshots artwork cache',
    sectionId: 'cleanup',
  },
  {
    title: 'Software Updates & Version Check',
    detail: 'Check GitHub Releases for new Nexus Launcher versions and toggle auto-check',
    keywords: 'update version upgrade github release patch',
    sectionId: 'updates',
  },
]

const QUICK_JUMP_CHIPS: Array<{ label: string; sectionId: SettingsSectionId; icon: typeof Palette }> = [
  { label: 'Theme & Fonts', sectionId: 'appearance', icon: Palette },
  { label: 'Download Turbo', sectionId: 'performance', icon: MonitorCog },
  { label: 'Game Booster', sectionId: 'booster', icon: Rocket },
  { label: 'Steam Region & Keys', sectionId: 'metadata', icon: KeyRound },
  { label: 'Disk Cleaner', sectionId: 'cleanup', icon: Trash2 },
  { label: 'Library Backup', sectionId: 'backup', icon: DatabaseBackup },
]

export function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const sectionParam = searchParams.get('section') as SettingsSectionId | null
  const initialSection =
    sectionParam && SECTIONS.some((s) => s.id === sectionParam) ? sectionParam : 'appearance'
  const [activeSection, setActiveSection] = useState<SettingsSectionId>(initialSection)
  const [searchQuery, setSearchQuery] = useState('')
  const mainScrollRef = useRef<HTMLElement | null>(null)

  const speed = useAnimationSpeed()
  const updaterStatus = useUpdaterStore((s) => s.status)
  const currentVersion = useUpdaterStore((s) => s.currentVersion)
  const themeMode = useThemeStore((s) => s.mode)

  useEffect(() => {
    if (sectionParam && SECTIONS.some((s) => s.id === sectionParam)) {
      setActiveSection((prev) => (prev === sectionParam ? prev : sectionParam))
    }
  }, [sectionParam])

  function handleSelectSection(id: SettingsSectionId) {
    if (id === activeSection && !searchQuery) return
    playButtonClick()
    setActiveSection(id)
    setSearchQuery('')
    setSearchParams({ section: id }, { replace: true })
    if (mainScrollRef.current) {
      mainScrollRef.current.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
    }
  }

  const active = SECTIONS.find((section) => section.id === activeSection) ?? SECTIONS[0]

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return []
    const terms = q.split(/\s+/)
    return SEARCHABLE_SETTINGS.filter((item) => {
      const hay = `${item.title} ${item.detail} ${item.keywords}`.toLowerCase()
      return terms.every((t) => hay.includes(t))
    })
  }, [searchQuery])

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-bg">
      {/* ── Top Control Center Header with Instant Search ────────────────── */}
      <header className="relative shrink-0 border-b border-border bg-surface/65 px-6 pb-5 pt-6 lg:px-8">
        <div
          className="pointer-events-none absolute -right-16 -top-24 size-72 rounded-full"
          style={{
            background:
              'radial-gradient(circle, color-mix(in srgb, var(--nx-accent) 14%, transparent) 0%, transparent 70%)',
          }}
        />

        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-1.5 flex items-center gap-2 font-mono text-[11px] font-extrabold uppercase tracking-[0.2em] text-accent">
              <Sparkles className="size-3.5" />
              <span>Nexus Control Center // System Configuration</span>
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black tracking-tight text-text sm:text-3xl">Settings</h1>
              <span className="rounded-full border border-border bg-surface-raised px-3 py-0.5 font-mono text-xs font-bold text-text/90 shadow-2xs">
                v{currentVersion || '0.6.0'} • {themeMode === 'dark' ? 'Dark Theme' : 'Light Theme'}
              </span>
            </div>
          </div>

          {/* Instant Settings Search Box */}
          <div className="relative w-full lg:w-[420px]">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-accent" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search any setting (e.g. FPS, Font, Steam region, RAM, Backup)..."
              className="w-full rounded-2xl border border-border bg-surface pl-10 pr-9 py-2.5 text-xs font-bold text-text placeholder:font-medium placeholder:text-subtle shadow-xs outline-none transition-all focus:border-accent focus:ring-2 focus:ring-accent/25"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-subtle hover:bg-surface-raised hover:text-text"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Quick-Access Jump Bar */}
        <div className="relative mt-4 flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          <span className="shrink-0 font-mono text-[11px] font-extrabold uppercase tracking-wider text-text/80">
            Quick Access:
          </span>
          {QUICK_JUMP_CHIPS.map((chip) => {
            const ChipIcon = chip.icon
            const isSelected = activeSection === chip.sectionId && !searchQuery
            return (
              <button
                key={chip.label}
                type="button"
                onClick={() => handleSelectSection(chip.sectionId)}
                className={cn(
                  'relative flex shrink-0 items-center gap-1.5 rounded-xl border px-3.5 py-1.5 text-xs font-bold tracking-tight transition-colors duration-200 cursor-pointer select-none',
                  isSelected
                    ? 'border-accent text-white'
                    : 'border-border bg-surface text-text/90 hover:border-accent/50 hover:bg-surface-raised hover:text-text',
                )}
              >
                {isSelected && (
                  <motion.span
                    layoutId="settings-quick-chip-bg"
                    transition={{
                      type: 'spring',
                      stiffness: 420,
                      damping: 32,
                      mass: 0.75,
                    }}
                    className="absolute inset-0 rounded-xl bg-accent shadow-sm shadow-accent/30"
                  />
                )}
                <ChipIcon
                  className={cn('relative z-10 size-3.5', isSelected ? 'text-white' : 'text-accent')}
                  strokeWidth={2.25}
                />
                <span className="relative z-10">{chip.label}</span>
              </button>
            )
          })}
        </div>

        {/* Instant Search Results Dropdown Panel */}
        <AnimatePresence>
          {searchQuery.trim().length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 * speed }}
              className="mt-3 max-h-72 overflow-y-auto rounded-2xl border border-accent/50 bg-surface p-3.5 shadow-2xl backdrop-blur-xl"
            >
              <div className="mb-2.5 flex items-center justify-between px-2 font-mono text-[11px] font-bold uppercase tracking-wider text-text/85">
                <span>Matching Settings ({searchResults.length})</span>
                <span>Click any option to jump directly</span>
              </div>

              {searchResults.length === 0 ? (
                <div className="py-6 text-center text-xs font-semibold text-muted">
                  No setting matched &ldquo;{searchQuery}&rdquo;. Try keywords like{' '}
                  <strong className="font-bold text-text">
                    theme, font, download, booster, ram, region, backup
                  </strong>
                  .
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {searchResults.map((item) => {
                    const sec = SECTIONS.find((s) => s.id === item.sectionId) ?? SECTIONS[0]
                    const SecIcon = sec.icon
                    return (
                      <button
                        key={item.title}
                        type="button"
                        onClick={() => handleSelectSection(item.sectionId)}
                        className="group flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-raised/80 p-3 text-left transition-all hover:border-accent hover:bg-accent/10 cursor-pointer"
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-accent/30 bg-accent/15 text-accent">
                            <SecIcon className="size-4" strokeWidth={2.25} />
                          </span>
                          <div className="min-w-0">
                            <div className="truncate text-[13px] font-bold text-text group-hover:text-accent">
                              {item.title}
                            </div>
                            <div className="mt-0.5 line-clamp-1 text-[11px] font-medium text-muted">
                              {item.detail}
                            </div>
                            <div className="mt-1 inline-flex items-center gap-1 rounded-md border border-accent/25 bg-surface px-1.5 py-0.5 font-mono text-[9.5px] font-bold text-accent">
                              {sec.category} → {sec.label}
                            </div>
                          </div>
                        </div>
                        <ArrowRight className="size-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
                      </button>
                    )
                  })}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* ── Main Categorized Layout ──────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col gap-5 p-5 lg:flex-row lg:p-7">
        {/* Left Categorized Navigation Sidebar with Bold Typography & Smooth Morphing */}
        <nav className="flex shrink-0 gap-2.5 overflow-x-auto lg:w-[304px] lg:flex-col lg:gap-4 lg:overflow-y-auto lg:pr-1.5 select-none">
          {CATEGORIES.map((categoryName) => {
            const groupSections = SECTIONS.filter((s) => s.category === categoryName)
            return (
              <div key={categoryName} className="flex shrink-0 gap-2 lg:flex-col lg:gap-1.5">
                {/* Category Header */}
                <div className="hidden items-center gap-2 px-2 pb-1 lg:flex">
                  <span className="h-3.5 w-1.5 rounded-full bg-accent" />
                  <span className="text-[11px] font-black uppercase tracking-[0.15em] text-text/85">
                    {categoryName}
                  </span>
                  <div className="h-px flex-1 bg-border/80" />
                </div>

                {groupSections.map((section) => {
                  const Icon = section.icon
                  const isActive = section.id === activeSection
                  const hasUpdate =
                    section.id === 'updates' &&
                    (updaterStatus === 'available' || updaterStatus === 'ready-to-install')

                  return (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() => handleSelectSection(section.id)}
                      className={cn(
                        'group relative flex min-w-[225px] items-center gap-3 overflow-hidden rounded-2xl border px-3.5 py-3 text-left transition-colors duration-200 lg:min-w-0 cursor-pointer',
                        isActive
                          ? 'border-accent/65 text-text shadow-sm'
                          : 'border-border/85 bg-surface/80 text-text/95 hover:border-accent/45 hover:bg-surface-raised hover:text-text',
                      )}
                    >
                      {isActive && (
                        <>
                          <motion.span
                            layoutId="settings-active-card-bg"
                            transition={{
                              type: 'spring',
                              stiffness: 420,
                              damping: 34,
                              mass: 0.75,
                            }}
                            className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-r from-accent/18 via-accent/10 to-transparent"
                          />
                          <motion.span
                            layoutId="settings-active-pill"
                            transition={{
                              type: 'spring',
                              stiffness: 420,
                              damping: 34,
                              mass: 0.75,
                            }}
                            className="pointer-events-none absolute inset-y-2 left-0 w-1.5 rounded-r-full bg-accent shadow-[0_0_12px_var(--nx-accent)]"
                          />
                        </>
                      )}

                      <span
                        className={cn(
                          'relative z-10 flex size-10 shrink-0 items-center justify-center rounded-xl border transition-all duration-200',
                          isActive
                            ? 'border-accent bg-accent text-white shadow-[0_0_14px_var(--nx-accent)]'
                            : 'border-border bg-surface-raised text-accent group-hover:border-accent/45 group-hover:bg-accent/15',
                        )}
                      >
                        <Icon className="size-4.5" strokeWidth={2.35} />
                      </span>

                      <span className="relative z-10 min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-1.5">
                          <span
                            className={cn(
                              'truncate text-[13.5px] tracking-tight transition-colors',
                              isActive
                                ? 'font-extrabold text-accent'
                                : 'font-bold text-text group-hover:text-accent',
                            )}
                          >
                            {section.label}
                          </span>
                          {section.badge && (
                            <span
                              className={cn(
                                'shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[9.5px] font-black tracking-wider',
                                isActive
                                  ? 'bg-accent text-white shadow-xs'
                                  : 'border border-accent/35 bg-accent/15 text-accent',
                              )}
                            >
                              {section.badge}
                            </span>
                          )}
                          {hasUpdate && (
                            <span className="size-2.5 shrink-0 rounded-full bg-cyan-400 shadow-[0_0_8px_#00f0ff] animate-pulse" />
                          )}
                        </span>
                        <span
                          className={cn(
                            'mt-0.5 block truncate text-[11px] font-semibold transition-colors',
                            isActive
                              ? 'text-text/85'
                              : 'text-muted group-hover:text-text/80',
                          )}
                        >
                          {section.shortDesc}
                        </span>
                      </span>

                      <ChevronRight
                        className={cn(
                          'relative z-10 size-4 shrink-0 transition-all duration-200',
                          isActive
                            ? 'translate-x-0 text-accent opacity-100'
                            : '-translate-x-1 text-subtle opacity-60 group-hover:translate-x-0 group-hover:text-accent group-hover:opacity-100',
                        )}
                        strokeWidth={2.4}
                      />
                    </button>
                  )
                })}
              </div>
            )
          })}
        </nav>

        {/* Right Active Panel Container */}
        <main
          ref={mainScrollRef}
          className={cn(
            'min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable] rounded-3xl border shadow-card transition-colors duration-200',
            activeSection === 'booster'
              ? 'border-accent/35 bg-bg'
              : 'border-border bg-surface/65',
          )}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={activeSection}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 * speed, ease: [0.22, 1, 0.36, 1] }}
              className={cn(activeSection !== 'booster' && 'p-6 lg:p-8')}
            >
              {activeSection !== 'booster' && (
                <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
                  <div className="flex items-center gap-4">
                    <div className="flex size-12 items-center justify-center rounded-2xl border border-accent/35 bg-accent/15 text-accent shadow-xs">
                      <active.icon className="size-5.5" strokeWidth={2.35} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center rounded-md border border-accent/30 bg-accent/10 px-2 py-0.5 font-mono text-[10px] font-extrabold uppercase tracking-wider text-accent">
                          {active.category}
                        </span>
                      </div>
                      <h2 className="mt-1 text-xl font-black tracking-tight text-text sm:text-2xl">
                        {active.label}
                      </h2>
                      <p className="mt-0.5 text-xs font-semibold text-muted">
                        {active.description}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {activeSection === 'appearance' && <AppearancePanel />}
              {activeSection === 'performance' && <PerformancePanel />}
              {activeSection === 'booster' && <BoosterPanel />}
              {activeSection === 'system_specs' && <SystemSpecsPanel />}
              {activeSection === 'metadata' && <ApiKeysPanel />}
              {activeSection === 'soundtrack' && <SoundtrackSettingsPanel />}
              {activeSection === 'backup' && <BackupPanel />}
              {activeSection === 'cleanup' && <CleanupPanel />}
              {activeSection === 'updates' && <UpdatesPanel />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  )
}
