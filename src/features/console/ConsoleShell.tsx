import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Award,
  Gamepad2,
  Monitor,
  Power,
  Rocket,
  Settings as SettingsIcon,
  SlidersHorizontal,
} from 'lucide-react'
import { LogoMark } from '@/components/brand/logo-mark'
import { ConsoleBackdrop } from './ui/Backdrop'
import { ConsoleErrorBoundary } from './ui/ErrorBoundary'
import { resolveConsoleMediaUrl } from './ui/Tile'
import { toast } from 'sonner'
import type { Game, HubGame, Collection } from '@/types/models'
import { listGames, launchGame, updateGameFlags } from '@/services/games'
import { listCollections } from '@/services/collections'
import {
  getHubTopRated,
  getHubNewReleases,
  getHubComingSoon,
  getHubDiscountedGames,
} from '@/services/hub'
import { getDownloads, type DownloadInfo } from '@/services/download'
import { getAllSettings } from '@/services/settings'
import {
  consoleModeEnter,
  consoleModeExit,
  consoleResumeGame,
  consoleExtractDominantColor,
  consoleGuideListenerStart,
  consoleGuideListenerStop,
  consoleGetSystemStatus,
  type ConsoleSystemStatus,
} from '@/services/console'
import { useLaunchStore } from '@/store/launch-store'
import { useProfileStore } from '@/store/profile-store'
import { CONSOLE_THEMES } from './theme/tokens'
import { CONSOLE_STRINGS } from './i18n/strings'
import { useConsoleStore, type ConsoleTabId } from './store/console-store'
import { consoleSoundEngine } from './audio/ui-sounds'
import { configureScrollMotion } from './nav/smooth-scroll'
import { describeGlyphFamily } from './input/InputManager'
import { useAnimationSpeed } from '@/hooks/use-animation-speed'
import { FocusScope, useFocusable, consoleNavController } from './nav/FocusScope'
import { useConsoleInputController } from './input/use-console-input'
import { Glyph } from './ui/Glyph'
import { ConsoleOSK } from './ui/OSK'
import { AuroraScreensaver } from './ui/AuroraScreensaver'
import { QuickSettingsPanel } from './ui/QuickSettingsPanel'
import { WhoIsPlayingModal } from './screens/WhoIsPlayingModal'
import { HomeView } from './screens/HomeView'
import { LibraryView } from './screens/LibraryView'
import { GameHubView } from './screens/GameHubView'
import { StoreView } from './screens/StoreView'
import { DownloadsView } from './screens/DownloadsView'
import { MusicView } from './screens/MusicView'
import { PassportView } from './screens/PassportView'
import { BoosterView } from './screens/BoosterView'
import { SettingsView } from './screens/SettingsView'
import { PowerView } from './screens/PowerView'

const TAB_ORDER: ConsoleTabId[] = [
  'home',
  'library',
  'store',
  'downloads',
  'music',
  'passport',
  'booster',
  'settings',
  'power',
]

const PRIMARY_TABS: ConsoleTabId[] = ['home', 'library', 'store', 'downloads', 'music']

const SECONDARY_TAB_ICONS: Partial<
  Record<ConsoleTabId, React.ComponentType<{ className?: string }>>
> = {
  passport: Award,
  booster: Rocket,
  settings: SettingsIcon,
  power: Power,
}
const SECONDARY_TABS = Object.keys(SECONDARY_TAB_ICONS) as ConsoleTabId[]

/** Text tab: plain label, the active one is white with a sliding underline. */
const TopTabButton: React.FC<{
  tabId: ConsoleTabId
  label: string
  active: boolean
  badgeCount?: number
  onSelect: () => void
}> = ({ tabId, label, active, badgeCount, onSelect }) => {
  const { focusProps, isFocused } = useFocusable<HTMLButtonElement>({
    id: `console_tab_${tabId}`,
    scopeId: 'console_top_tabs',
    onConfirm: onSelect,
  })
  return (
    <button
      type="button"
      {...focusProps}
      className={`relative flex items-center gap-2 px-1 py-2 text-[1.12rem] tracking-wide outline-none transition-[color,transform] duration-200 ${
        isFocused
          ? 'scale-[1.12] font-semibold text-white'
          : active
            ? 'font-semibold text-white'
            : 'font-medium text-white/45'
      }`}
    >
      <span>{label}</span>
      {badgeCount && badgeCount > 0 ? (
        <span className="rounded-full bg-white px-1.5 text-[0.7rem] font-bold leading-[1.15rem] text-black">
          {badgeCount}
        </span>
      ) : null}
      {(active || isFocused) && (
        <motion.span
          layoutId="console-tab-underline"
          className={`absolute inset-x-0 -bottom-0.5 h-[3px] rounded-full ${
            isFocused ? 'bg-white' : 'bg-white/70'
          }`}
          transition={{ type: 'spring', stiffness: 520, damping: 40 }}
        />
      )}
    </button>
  )
}

/** Round icon button used for secondary destinations and utilities in the top-right cluster. */
const TopIconButton: React.FC<{
  id: string
  scopeId: string
  label: string
  active?: boolean
  onSelect: () => void
  children: React.ReactNode
}> = ({ id, scopeId, label, active, onSelect, children }) => {
  const { focusProps, isFocused } = useFocusable<HTMLButtonElement>({
    id,
    scopeId,
    onConfirm: onSelect,
  })
  return (
    <button
      type="button"
      {...focusProps}
      aria-label={label}
      title={label}
      className={`relative flex size-[2.8rem] items-center justify-center rounded-full outline-none transition-[background-color,color,transform] duration-200 ${
        isFocused
          ? 'scale-110 bg-white text-black'
          : active
            ? 'bg-white/14 text-white'
            : 'text-white/50 hover:text-white'
      }`}
    >
      {children}
    </button>
  )
}

export const ConsoleShell: React.FC = () => {
  const navigate = useNavigate()
  const activeTab = useConsoleStore((s) => s.activeTab)
  const setActiveTab = useConsoleStore((s) => s.setActiveTab)
  const selectedGameId = useConsoleStore((s) => s.selectedGameId)
  const setSelectedGameId = useConsoleStore((s) => s.setSelectedGameId)
  const setFocusedGameId = useConsoleStore((s) => s.setFocusedGameId)
  const ambientColor = useConsoleStore((s) => s.ambientColor)
  const themeId = useConsoleStore((s) => s.theme)
  const uiScale = useConsoleStore((s) => s.uiScale)
  const safeMargin = useConsoleStore((s) => s.safeMargin)
  const lang = useConsoleStore((s) => s.language)
  const monitorIndex = useConsoleStore((s) => s.monitorIndex)
  const guideEnabled = useConsoleStore((s) => s.guideEnabled)
  const quickSettingsOpen = useConsoleStore((s) => s.quickSettingsOpen)
  const setQuickSettingsOpen = useConsoleStore((s) => s.setQuickSettingsOpen)
  const profileGateCompleted = useConsoleStore((s) => s.profileGateCompleted)
  const setProfileGateCompleted = useConsoleStore((s) => s.setProfileGateCompleted)
  const controllerDisconnectedModal = useConsoleStore((s) => s.controllerDisconnectedModal)
  const setControllerDisconnectedModal = useConsoleStore((s) => s.setControllerDisconnectedModal)
  const lastDesktopRoute = useConsoleStore((s) => s.lastDesktopRoute)
  const hydrateFromSettings = useConsoleStore((s) => s.hydrateFromSettings)

  const detectedGlyphFamily = useConsoleStore((s) => s.detectedGlyphFamily)
  const activeControllerCount = useConsoleStore((s) => s.activeControllerCount)
  const animSpeed = useAnimationSpeed()

  const runningGameIds = useLaunchStore((s) => s.runningGameIds)
  const profiles = useProfileStore((s) => s.profiles)
  const activeProfile = useProfileStore((s) => s.activeProfile)
  const loadProfiles = useProfileStore((s) => s.loadProfiles)

  const [games, setGames] = useState<Game[]>([])
  const [collections, setCollections] = useState<Collection[]>([])
  const [downloads, setDownloads] = useState<DownloadInfo[]>([])
  const [topRatedHub, setTopRatedHub] = useState<HubGame[]>([])
  const [newReleasesHub, setNewReleasesHub] = useState<HubGame[]>([])
  const [comingSoonHub, setComingSoonHub] = useState<HubGame[]>([])
  const [discountedHub, setDiscountedHub] = useState<HubGame[]>([])
  const [sysStatus, setSysStatus] = useState<ConsoleSystemStatus | null>(null)
  const [clockText, setClockText] = useState(() =>
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  )

  const t = CONSOLE_STRINGS[lang]
  const themeTokens = CONSOLE_THEMES[themeId] ?? CONSOLE_THEMES.cyberpunk
  const isRtl = lang === 'fa'
  const focusedGameId = useConsoleStore((s) => s.focusedGameId)
  const backdropSrc = useMemo(() => {
    if (selectedGameId) {
      const open = games.find((g) => g.id === selectedGameId)
      return open
        ? resolveConsoleMediaUrl(open.background_path ?? open.banner_path ?? open.cover_path)
        : null
    }
    if (activeTab !== 'home' && activeTab !== 'library') return null
    const focused = focusedGameId ? games.find((g) => g.id === focusedGameId) : undefined
    const fallback = [...games]
      .filter((g) => g.last_played_at)
      .sort((a, b) => (b.last_played_at ?? '').localeCompare(a.last_played_at ?? ''))[0]
    const g = focused ?? fallback ?? games[0]
    if (!g) return null
    return resolveConsoleMediaUrl(g.background_path ?? g.banner_path ?? g.cover_path)
  }, [games, focusedGameId, selectedGameId, activeTab])
  const controllerLabel =
    activeControllerCount > 0 ? describeGlyphFamily(detectedGlyphFamily) : 'No controller'
  const stageSeconds = 0.24 * animSpeed

  const refreshData = useCallback(async () => {
    const [gList, cList, dList] = await Promise.all([
      listGames().catch(() => [] as Game[]),
      listCollections().catch(() => [] as Collection[]),
      getDownloads().catch(() => [] as DownloadInfo[]),
    ])
    setGames(gList)
    setCollections(cList)
    setDownloads(dList)
  }, [])

  // Enter borderless fullscreen Console Mode on mount
  useEffect(() => {
    void loadProfiles(false)
    getAllSettings()
      .then((raw) => hydrateFromSettings(raw))
      .catch(() => {})
    void consoleModeEnter(monitorIndex).catch(() => {})
    consoleSoundEngine.play('boot')
    void refreshData()

    // Fetch Hub store shelves in background
    getHubTopRated()
      .then(setTopRatedHub)
      .catch(() => {})
    getHubNewReleases()
      .then(setNewReleasesHub)
      .catch(() => {})
    getHubComingSoon()
      .then(setComingSoonHub)
      .catch(() => {})
    getHubDiscountedGames()
      .then(setDiscountedHub)
      .catch(() => {})
  }, [hydrateFromSettings, loadProfiles, monitorIndex, refreshData])

  // Start or stop Guide button listener according to setting
  useEffect(() => {
    if (guideEnabled) {
      void consoleGuideListenerStart().catch(() => {})
    } else {
      void consoleGuideListenerStop().catch(() => {})
    }
  }, [guideEnabled])

  // Proportional 10-foot scaling: every rem-based size follows the screen height, so the UI looks
  // identical on 720p, 1080p and 4K panels and is readable from the couch (base 19px at 1080p).
  useEffect(() => {
    const root = document.documentElement
    const previous = root.style.fontSize
    const apply = () => {
      const px = (window.innerHeight / 1080) * 19 * (uiScale / 100)
      root.style.fontSize = `${Math.min(44, Math.max(9, px)).toFixed(2)}px`
    }
    apply()
    window.addEventListener('resize', apply)
    return () => {
      window.removeEventListener('resize', apply)
      root.style.fontSize = previous
    }
  }, [uiScale])

  // When LB / RB (or a shortcut) changes the tab while focus sits in the tab bar, move the focus
  // highlight with it so the highlighted tab always matches the visible screen.
  useEffect(() => {
    const focusedId = document.querySelector('[data-focused="true"]')?.getAttribute('data-focus-id')
    if (focusedId?.startsWith('console_tab_') && focusedId !== `console_tab_${activeTab}`) {
      consoleNavController.setFocus(`console_tab_${activeTab}`, false)
    }
  }, [activeTab])

  // Focus-follow scrolling honours the user's animation speed / reduced-motion setting.
  useEffect(() => {
    configureScrollMotion({
      reduceMotion: animSpeed === 0,
      speed: animSpeed > 0 ? 1 / animSpeed : 1,
    })
  }, [animSpeed])

  // Clock + telemetry refresh every 10s
  useEffect(() => {
    const updateStatus = () => {
      setClockText(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
      consoleGetSystemStatus()
        .then(setSysStatus)
        .catch(() => {})
    }
    updateStatus()
    const id = window.setInterval(updateStatus, 10000)
    return () => window.clearInterval(id)
  }, [])

  const handleExitConsole = useCallback(async () => {
    await consoleModeExit().catch(() => {})
    navigate(lastDesktopRoute || '/')
  }, [lastDesktopRoute, navigate])

  const cycleTab = useCallback(
    (delta: number) => {
      const idx = TAB_ORDER.indexOf(activeTab)
      const next = TAB_ORDER[(idx + delta + TAB_ORDER.length) % TAB_ORDER.length]
      setActiveTab(next)
    },
    [activeTab, setActiveTab],
  )

  useConsoleInputController(
    {
      onBack: () => {
        if (quickSettingsOpen) {
          setQuickSettingsOpen(false)
          return
        }
        if (selectedGameId) {
          setSelectedGameId(null)
          return
        }
        if (activeTab !== 'home') {
          setActiveTab('home')
          return
        }
        setQuickSettingsOpen(true)
      },
      onOptions: () => {
        setQuickSettingsOpen(!quickSettingsOpen)
      },
      onTabPrev: () => cycleTab(-1),
      onTabNext: () => cycleTab(1),
      onSearch: () => {
        setActiveTab('library')
      },
      onGuide: () => {
        setQuickSettingsOpen(!quickSettingsOpen)
      },
    },
    true,
  )

  const colorCacheRef = React.useRef<Map<string, string>>(new Map())
  const colorTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleFocusGame = useCallback(
    (game: Game) => {
      setFocusedGameId(game.id)
      const cached = colorCacheRef.current.get(game.id)
      if (cached) {
        useConsoleStore.getState().setAmbientColor(cached)
        return
      }
      // Debounced: scrolling quickly through a row must not fire one IPC call per tile.
      if (colorTimerRef.current) clearTimeout(colorTimerRef.current)
      colorTimerRef.current = setTimeout(() => {
        consoleExtractDominantColor(game.id)
          .then((hex) => {
            if (hex && hex.startsWith('#')) {
              colorCacheRef.current.set(game.id, hex)
              useConsoleStore.getState().setAmbientColor(hex)
            }
          })
          .catch(() => {})
      }, 140)
    },
    [setFocusedGameId],
  )

  const handlePlayOrResume = useCallback(
    async (game: Game) => {
      if (runningGameIds.has(game.id)) {
        const ok = await consoleResumeGame(game.id).catch(() => false)
        if (ok) {
          consoleSoundEngine.play('launch')
          toast.success(`Resumed ${game.name}`, { id: 'console-launch', duration: 2500 })
          return
        }
      }
      try {
        consoleSoundEngine.play('launch')
        await launchGame(game.id)
        toast.success(`Launching ${game.name}`, { id: 'console-launch', duration: 2500 })
      } catch (e) {
        consoleSoundEngine.play('error')
        toast.error(e instanceof Error ? e.message : `Could not launch ${game.name}`, {
          id: 'console-launch',
        })
      }
    },
    [runningGameIds],
  )

  const handleToggleFavorite = useCallback(
    async (game: Game) => {
      try {
        await updateGameFlags(game.id, { is_favorite: !game.is_favorite })
        await refreshData()
        toast.success(
          !game.is_favorite
            ? `Added ${game.name} to Favorites`
            : `Removed ${game.name} from Favorites`,
        )
      } catch {
        // Ignore
      }
    },
    [refreshData],
  )

  const handleSelectHubGame = useCallback(
    async (hubGame: HubGame) => {
      await consoleModeExit().catch(() => {})
      navigate(`/hub/${hubGame.igdb_id}`)
    },
    [navigate],
  )

  const selectedGame = useMemo(
    () => (selectedGameId ? (games.find((g) => g.id === selectedGameId) ?? null) : null),
    [games, selectedGameId],
  )

  const activeDownloadsCount = useMemo(
    () =>
      downloads.filter((d) => ['downloading', 'queued', 'extracting'].includes(d.status)).length,
    [downloads],
  )

  const quickBtnFocus = useFocusable<HTMLButtonElement>({
    id: 'console_top_quick_btn',
    scopeId: 'console_top_tabs',
    onConfirm: () => setQuickSettingsOpen(true),
  })

  const exitDesktopBtnFocus = useFocusable<HTMLButtonElement>({
    id: 'console_top_exit_btn',
    scopeId: 'console_top_tabs',
    onConfirm: () => {
      void handleExitConsole()
    },
  })

  const showProfileGate = !profileGateCompleted && profiles.length > 1

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      style={
        {
          backgroundColor: themeTokens.bgPrimary,
          color: themeTokens.textPrimary,
          padding: `${safeMargin}vh ${safeMargin}vw`,
          '--console-ambient': ambientColor,
          transition: '--console-ambient 650ms ease',
        } as React.CSSProperties
      }
      className="relative w-screen h-screen overflow-hidden flex flex-col justify-between select-none"
    >
      {/* Dynamic Ambient Radial Backdrop */}
      <style>{`@property --console-ambient { syntax: '<color>'; inherits: true; initial-value: #00e5ff; }`}</style>
      <ConsoleBackdrop src={backdropSrc} intensity={activeTab === 'library' ? 0.55 : 1} />
      <div
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{
          background: `radial-gradient(ellipse 70% 55% at 85% 0%, color-mix(in srgb, var(--console-ambient) 16%, transparent) 0%, transparent 70%), radial-gradient(ellipse 60% 45% at 0% 100%, color-mix(in srgb, ${themeTokens.defaultAccent} 7%, transparent) 0%, transparent 70%)`,
        }}
      />

      {/* Top bar: no box, no border — just brand, tabs and a quiet status cluster */}
      <header className="relative z-30 flex items-center justify-between gap-6 px-10 pb-2 pt-7">
        <div className="flex min-w-[16rem] items-center gap-5">
          <LogoMark className="size-[1.9rem] opacity-90" />
          {activeProfile && (
            <button
              type="button"
              onClick={() => setProfileGateCompleted(false)}
              className="flex items-center gap-2.5 rounded-full py-1 pr-3 text-[0.95rem] font-medium text-white/70 transition-colors hover:text-white"
            >
              <span
                className="flex size-[1.9rem] items-center justify-center rounded-full text-[0.8rem] font-semibold text-white"
                style={{ backgroundColor: activeProfile.color || '#0ea5e9' }}
              >
                {activeProfile.avatar || activeProfile.name.slice(0, 1).toUpperCase()}
              </span>
              <span>{activeProfile.name}</span>
            </button>
          )}
        </div>

        {/* Center tabs with LB / RB hints */}
        <FocusScope
          id="console_top_tabs"
          orientation="horizontal"
          rtl={isRtl}
          className="flex items-center gap-9"
        >
          <span className="opacity-40">
            <Glyph button="lb" size="sm" />
          </span>
          {PRIMARY_TABS.map((tabId) => (
            <TopTabButton
              key={tabId}
              tabId={tabId}
              label={t.tabs[tabId]}
              active={activeTab === tabId && !selectedGame}
              badgeCount={tabId === 'downloads' ? activeDownloadsCount : undefined}
              onSelect={() => setActiveTab(tabId)}
            />
          ))}
          <span className="opacity-40">
            <Glyph button="rb" size="sm" />
          </span>
        </FocusScope>

        {/* Right cluster: status + secondary destinations */}
        <div className="flex min-w-[16rem] items-center justify-end gap-5">
          {sysStatus?.controllers?.[0] && (
            <span className="flex items-center gap-1.5 text-[0.9rem] font-medium text-white/55">
              <Gamepad2 className="size-[1.1rem]" />
              {sysStatus.controllers[0].battery_percent}%
            </span>
          )}
          <span className="text-[1.05rem] font-medium tabular-nums text-white/75">{clockText}</span>

          <FocusScope
            id="console_top_actions"
            orientation="horizontal"
            className="flex items-center gap-1"
          >
            {SECONDARY_TABS.map((tabId) => {
              const Icon = SECONDARY_TAB_ICONS[tabId]
              return (
                <TopIconButton
                  key={tabId}
                  id={`console_tab_${tabId}`}
                  scopeId="console_top_actions"
                  label={t.tabs[tabId]}
                  active={activeTab === tabId && !selectedGame}
                  onSelect={() => setActiveTab(tabId)}
                >
                  {Icon ? <Icon className="size-[1.2rem]" /> : null}
                </TopIconButton>
              )
            })}
            <button
              type="button"
              {...quickBtnFocus.focusProps}
              title={t.actions.quickSettings}
              aria-label={t.actions.quickSettings}
              className={`flex size-[2.8rem] items-center justify-center rounded-full outline-none transition-[background-color,color,transform] duration-200 ${
                quickBtnFocus.isFocused
                  ? 'scale-110 bg-white text-black'
                  : 'text-white/50 hover:text-white'
              }`}
            >
              <SlidersHorizontal className="size-[1.2rem]" />
            </button>
            <button
              type="button"
              {...exitDesktopBtnFocus.focusProps}
              title={t.actions.exitConsole}
              aria-label={t.actions.exitConsole}
              className={`flex size-[2.8rem] items-center justify-center rounded-full outline-none transition-[background-color,color,transform] duration-200 ${
                exitDesktopBtnFocus.isFocused
                  ? 'scale-110 bg-white text-black'
                  : 'text-white/50 hover:text-white'
              }`}
            >
              <Monitor className="size-[1.2rem]" />
            </button>
          </FocusScope>
        </div>
      </header>

      {/* Main Scrollable Stage */}
      <main
        className="relative z-20 flex-1 overflow-y-auto no-scrollbar px-8 pb-4 pt-3"
        style={{
          WebkitMaskImage:
            'linear-gradient(to bottom, transparent 0, #000 1.6rem, #000 calc(100% - 1.4rem), transparent 100%)',
          maskImage:
            'linear-gradient(to bottom, transparent 0, #000 1.6rem, #000 calc(100% - 1.4rem), transparent 100%)',
        }}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={selectedGame ? `game_${selectedGame.id}` : `tab_${activeTab}`}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: stageSeconds, ease: [0.22, 1, 0.36, 1] }}
          >
            <ConsoleErrorBoundary
              resetKey={selectedGame ? `game_${selectedGame.id}` : `tab_${activeTab}`}
            >
              {selectedGame ? (
                <GameHubView
                  game={selectedGame}
                  isRunning={runningGameIds.has(selectedGame.id)}
                  onBack={() => setSelectedGameId(null)}
                  onPlayOrResume={(g) => {
                    void handlePlayOrResume(g)
                  }}
                  onToggleFavorite={(g) => {
                    void handleToggleFavorite(g)
                  }}
                  onOpenMusicTab={() => {
                    setSelectedGameId(null)
                    setActiveTab('music')
                  }}
                />
              ) : activeTab === 'home' ? (
                <HomeView
                  games={games}
                  runningGameIds={runningGameIds}
                  downloads={downloads}
                  comingSoonHub={comingSoonHub}
                  dealsHub={discountedHub}
                  collections={collections}
                  onPlayOrResume={(g) => {
                    void handlePlayOrResume(g)
                  }}
                  onOpenGameHub={(g) => setSelectedGameId(g.id)}
                  onSelectHubGame={(hg) => {
                    void handleSelectHubGame(hg)
                  }}
                  onFocusGame={handleFocusGame}
                  onToggleFavorite={(g) => {
                    void handleToggleFavorite(g)
                  }}
                  onGoToDesktopScan={() => {
                    void handleExitConsole()
                  }}
                />
              ) : activeTab === 'library' ? (
                <LibraryView
                  games={games}
                  runningGameIds={runningGameIds}
                  onSelectGame={(g) => setSelectedGameId(g.id)}
                  onFocusGame={handleFocusGame}
                  onToggleFavorite={(g) => {
                    void handleToggleFavorite(g)
                  }}
                />
              ) : activeTab === 'store' ? (
                <StoreView
                  topRated={topRatedHub}
                  newReleases={newReleasesHub}
                  comingSoon={comingSoonHub}
                  discounted={discountedHub}
                  onSelectHubGame={(hg) => {
                    void handleSelectHubGame(hg)
                  }}
                />
              ) : activeTab === 'downloads' ? (
                <DownloadsView
                  downloads={downloads}
                  onRefresh={() => {
                    void refreshData()
                  }}
                />
              ) : activeTab === 'music' ? (
                <MusicView />
              ) : activeTab === 'passport' ? (
                <PassportView />
              ) : activeTab === 'booster' ? (
                <BoosterView />
              ) : activeTab === 'settings' ? (
                <SettingsView />
              ) : (
                <PowerView
                  onExitToDesktop={() => {
                    void handleExitConsole()
                  }}
                  onSwitchProfile={() => setProfileGateCompleted(false)}
                />
              )}
            </ConsoleErrorBoundary>
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Quiet control hints */}
      <footer className="relative z-30 flex items-center justify-between gap-4 px-10 pb-6 pt-2 text-white/45">
        <span className="text-[0.82rem] tracking-wide">{controllerLabel}</span>
        <div className="flex items-center gap-7 text-[0.85rem]">
          <Glyph button="confirm" label={t.actions.select} />
          <Glyph button="back" label={t.actions.back} />
          <Glyph button="tertiary" label={t.actions.search} />
          <Glyph button="options" label={t.actions.quickSettings} />
        </div>
      </footer>

      {/* Overlays & Modals */}
      <WhoIsPlayingModal open={showProfileGate} onDone={() => setProfileGateCompleted(true)} />

      <QuickSettingsPanel
        open={quickSettingsOpen}
        onClose={() => setQuickSettingsOpen(false)}
        onOpenPowerMenu={() => setActiveTab('power')}
        onExitConsoleMode={() => {
          void handleExitConsole()
        }}
        onOpenBooster={() => setActiveTab('booster')}
      />

      <ConsoleOSK />
      <AuroraScreensaver />

      {controllerDisconnectedModal && (
        <div className="fixed inset-0 z-[270] bg-black/80 backdrop-blur-md flex items-center justify-center p-6">
          <div className="max-w-md w-full p-8 rounded-3xl bg-slate-950 border border-amber-400/40 text-center space-y-4 shadow-2xl">
            <Gamepad2 className="w-12 h-12 text-amber-400 mx-auto animate-bounce" />
            <h2 className="text-2xl font-black text-white">Controller Disconnected</h2>
            <p className="text-sm text-slate-300">Reconnect your controller to continue.</p>
            <button
              type="button"
              onClick={() => setControllerDisconnectedModal(false)}
              className="px-6 py-3 rounded-2xl bg-cyan-400 text-slate-950 font-extrabold text-sm"
            >
              Continue with Keyboard / Mouse
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default ConsoleShell
