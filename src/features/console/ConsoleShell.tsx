import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Award,
  Gamepad2,
  Monitor,
  Power,
  Rocket,
  Search,
  Settings as SettingsIcon,
  SlidersHorizontal,
} from 'lucide-react'
import { LogoMark } from '@/components/brand/logo-mark'
import { ProfileAvatarIcon } from '@/features/profiles/components/profile-avatar-icon'
import { ConsoleBackdrop } from './ui/Backdrop'
import { ConsoleErrorBoundary } from './ui/ErrorBoundary'
import { ConsoleBootIntro } from './ui/ConsoleBootIntro'
import { ConsoleExitOutro } from './ui/ConsoleExitOutro'
import { resolveConsoleHighResUrl } from './ui/Tile'
import { toast } from 'sonner'
import type { Game, HubGame, Collection } from '@/types/models'
import {
  listGames,
  launchGame,
  stopGame,
  getRunningGames,
  updateGameFlags,
  getGameScreenshots,
} from '@/services/games'
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
import { StoreGameDetailView } from './screens/StoreGameDetailView'
import { DownloadsView } from './screens/DownloadsView'
import { MusicView } from './screens/MusicView'
import { ControllerView } from './screens/ControllerView'
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
  'dualsense',
  'passport',
  'booster',
  'settings',
  'power',
]

const PRIMARY_TABS: ConsoleTabId[] = [
  'home',
  'library',
  'store',
  'downloads',
  'music',
  'dualsense',
]

const SECONDARY_TAB_ICONS: Partial<
  Record<ConsoleTabId, React.ComponentType<{ className?: string }>>
> = {
  passport: Award,
  booster: Rocket,
  settings: SettingsIcon,
  power: Power,
}
const SECONDARY_TABS = Object.keys(SECONDARY_TAB_ICONS) as ConsoleTabId[]

const TopTabButton: React.FC<{
  tabId: ConsoleTabId
  label: string
  active: boolean
  isLight: boolean
  badgeCount?: number
  onSelect: () => void
}> = ({ tabId, label, active, isLight, badgeCount, onSelect }) => {
  const { focusProps, isFocused } = useFocusable<HTMLButtonElement>({
    id: `console_tab_${tabId}`,
    scopeId: 'console_top_tabs',
    onConfirm: onSelect,
  })
  return (
    <button
      type="button"
      {...focusProps}
      className={`relative flex items-center gap-2 px-1 py-2 text-[1.12rem] tracking-wide outline-none transition-[color,transform] duration-200 cursor-pointer ${
        isFocused
          ? isLight
            ? 'scale-[1.12] font-extrabold text-indigo-600'
            : 'scale-[1.12] font-extrabold text-cyan-300'
          : active
            ? isLight
              ? 'font-bold text-slate-900'
              : 'font-bold text-white'
            : isLight
              ? 'font-medium text-slate-500 hover:text-slate-900'
              : 'font-medium text-white/55 hover:text-white'
      }`}
    >
      <span>{label}</span>
      {badgeCount && badgeCount > 0 ? (
        <span className="rounded-full bg-cyan-400 px-1.5 text-[0.7rem] font-black leading-[1.15rem] text-slate-950">
          {badgeCount}
        </span>
      ) : null}
      {(active || isFocused) && (
        <motion.span
          layoutId="console-tab-underline"
          className={`absolute inset-x-0 -bottom-0.5 h-[3px] rounded-full ${
            isFocused
              ? 'bg-cyan-400'
              : isLight
                ? 'bg-indigo-600'
                : 'bg-white/80'
          }`}
          transition={{ type: 'spring', stiffness: 520, damping: 40 }}
        />
      )}
    </button>
  )
}

const TopIconButton: React.FC<{
  id: string
  scopeId: string
  label: string
  active?: boolean
  isLight: boolean
  onSelect: () => void
  children: React.ReactNode
}> = ({ id, scopeId, label, active, isLight, onSelect, children }) => {
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
      className={`relative flex size-[2.8rem] items-center justify-center rounded-full outline-none transition-[background-color,color,transform] duration-200 cursor-pointer ${
        isFocused
          ? 'scale-110 bg-cyan-400 text-slate-950 shadow-lg'
          : active
            ? isLight
              ? 'bg-indigo-600 text-white'
              : 'bg-white/20 text-white'
            : isLight
              ? 'text-slate-600 hover:bg-slate-200 hover:text-slate-900'
              : 'text-white/65 hover:text-white'
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
  const selectedStoreHubGame = useConsoleStore((s) => s.selectedStoreHubGame)
  const setSelectedStoreHubGame = useConsoleStore((s) => s.setSelectedStoreHubGame)
  const setFocusedGameId = useConsoleStore((s) => s.setFocusedGameId)
  const ambientColor = useConsoleStore((s) => s.ambientColor)
  const themeId = useConsoleStore((s) => s.theme)
  const uiScale = useConsoleStore((s) => s.uiScale)
  const safeMargin = useConsoleStore((s) => s.safeMargin)
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
  const openOsk = useConsoleStore((s) => s.openOsk)
  const oskOpen = useConsoleStore((s) => s.osk.open)
  const closeOsk = useConsoleStore((s) => s.closeOsk)

  const detectedGlyphFamily = useConsoleStore((s) => s.detectedGlyphFamily)
  const activeControllerCount = useConsoleStore((s) => s.activeControllerCount)
  const animSpeed = useAnimationSpeed()

  const runningGameIds = useLaunchStore((s) => s.runningGameIds)
  const activeProfile = useProfileStore((s) => s.activeProfile)
  const loadProfiles = useProfileStore((s) => s.loadProfiles)

  const [booting, setBooting] = useState(true)
  const [exitingToDesktop, setExitingToDesktop] = useState(false)
  const [games, setGames] = useState<Game[]>([])
  const [widescreenMap, setWidescreenMap] = useState<Record<string, string>>({})
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

  const t = CONSOLE_STRINGS.en
  const themeTokens = CONSOLE_THEMES[themeId] ?? CONSOLE_THEMES.cyberpunk
  const isLight = Boolean(themeTokens.isLight)
  const focusedGameId = useConsoleStore((s) => s.focusedGameId)

  // Always resolve high-resolution 1080p backdrop URLs on hover/focus
  const backdropSrc = useMemo(() => {
    if (selectedStoreHubGame) {
      return resolveConsoleHighResUrl(
        selectedStoreHubGame.backdrop_url ?? selectedStoreHubGame.cover_url,
      )
    }
    const pickBestForGame = (g: Game | undefined): string | null => {
      if (!g) return null
      if (g.background_path || g.banner_path) {
        return resolveConsoleHighResUrl(g.background_path ?? g.banner_path)
      }
      if (widescreenMap[g.id]) {
        return resolveConsoleHighResUrl(widescreenMap[g.id])
      }
      if (g.steam_app_id) {
        return `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${g.steam_app_id}/library_hero.jpg`
      }
      return resolveConsoleHighResUrl(g.cover_path)
    }

    if (selectedGameId) {
      return pickBestForGame(games.find((g) => g.id === selectedGameId))
    }
    if (activeTab !== 'home' && activeTab !== 'library') return null
    const focused = focusedGameId ? games.find((g) => g.id === focusedGameId) : undefined
    const fallback = [...games]
      .filter((g) => g.last_played_at)
      .sort((a, b) => (b.last_played_at ?? '').localeCompare(a.last_played_at ?? ''))[0]
    return pickBestForGame(focused ?? fallback ?? games[0])
  }, [games, focusedGameId, selectedGameId, selectedStoreHubGame, activeTab, widescreenMap])

  const controllerLabel =
    activeControllerCount > 0 ? describeGlyphFamily(detectedGlyphFamily) : 'Keyboard & Mouse Ready'
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

  // New Task #1: Poll running games every 2000ms and tick elapsed seconds every 1000ms
  // so the `Stop · MM:SS` button counts up live and immediately resets when a game exits!
  useEffect(() => {
    const syncRunning = () => {
      getRunningGames()
        .then((ids) => {
          useLaunchStore.getState().hydrateRunning(ids)
        })
        .catch(() => {})
    }
    syncRunning()
    const pollId = window.setInterval(syncRunning, 2000)
    const tickId = window.setInterval(() => {
      const state = useLaunchStore.getState()
      if (state.runningGameIds.size === 0) return
      state.runningGameIds.forEach((id) => {
        const prev = state.elapsedSeconds[id] ?? 0
        state.updateElapsed(id, prev + 1)
      })
    }, 1000)
    return () => {
      window.clearInterval(pollId)
      window.clearInterval(tickId)
    }
  }, [])

  useEffect(() => {
    if (guideEnabled) {
      void consoleGuideListenerStart().catch(() => {})
    } else {
      void consoleGuideListenerStop().catch(() => {})
    }
  }, [guideEnabled])

  // Proportional 10-foot scaling
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

  useEffect(() => {
    const focusedId = document.querySelector('[data-focused="true"]')?.getAttribute('data-focus-id')
    if (focusedId?.startsWith('console_tab_') && focusedId !== `console_tab_${activeTab}`) {
      consoleNavController.setFocus(`console_tab_${activeTab}`, false)
    }
  }, [activeTab])

  useEffect(() => {
    configureScrollMotion({
      reduceMotion: animSpeed === 0,
      speed: animSpeed > 0 ? 1 / animSpeed : 1,
    })
  }, [animSpeed])

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

  // New Task #5: Smooth Console Exit Animation + Descending Harmonic Chord before returning to Desktop Mode
  const handleExitConsole = useCallback(async () => {
    if (exitingToDesktop) return
    setQuickSettingsOpen(false)
    setExitingToDesktop(true)
    consoleSoundEngine.play('close')
    await new Promise((resolve) => window.setTimeout(resolve, 980))
    await consoleModeExit().catch(() => {})
    navigate(lastDesktopRoute || '/')
  }, [exitingToDesktop, lastDesktopRoute, navigate, setQuickSettingsOpen])

  const cycleTab = useCallback(
    (delta: number) => {
      const idx = TAB_ORDER.indexOf(activeTab)
      const next = TAB_ORDER[(idx + delta + TAB_ORDER.length) % TAB_ORDER.length]
      setActiveTab(next)
    },
    [activeTab, setActiveTab],
  )

  const handleGlobalSearch = useCallback(() => {
    openOsk('Spotlight Search — Library & Store', '', (query) => {
      if (query.trim()) {
        setActiveTab('library')
      }
    })
  }, [openOsk, setActiveTab])

  useConsoleInputController(
    {
      onBack: () => {
        if (oskOpen) {
          closeOsk()
          return
        }
        if (booting || !profileGateCompleted || exitingToDesktop) {
          return
        }
        if (quickSettingsOpen) {
          setQuickSettingsOpen(false)
          return
        }
        if (selectedStoreHubGame) {
          setSelectedStoreHubGame(null)
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
        if (booting || !profileGateCompleted || exitingToDesktop || oskOpen) return
        setQuickSettingsOpen(!quickSettingsOpen)
      },
      onTabPrev: () => {
        if (booting || !profileGateCompleted || exitingToDesktop || oskOpen) return
        cycleTab(-1)
      },
      onTabNext: () => {
        if (booting || !profileGateCompleted || exitingToDesktop || oskOpen) return
        cycleTab(1)
      },
      onSearch: () => {
        if (booting || !profileGateCompleted || exitingToDesktop || oskOpen) return
        handleGlobalSearch()
      },
      onGuide: () => {
        if (booting || !profileGateCompleted || exitingToDesktop || oskOpen) return
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
      if (!game.background_path && !game.banner_path && !widescreenMap[game.id]) {
        getGameScreenshots(game.id)
          .then((shots) => {
            if (shots && shots[0]) {
              setWidescreenMap((prev) => ({ ...prev, [game.id]: shots[0] }))
            }
          })
          .catch(() => {})
      }
      const cached = colorCacheRef.current.get(game.id)
      if (cached) {
        useConsoleStore.getState().setAmbientColor(cached)
        return
      }
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
    [setFocusedGameId, widescreenMap],
  )

  // New Task #1: Clicking the primary button while a game is running stops the game (just like Desktop sidebar)!
  const handlePlayOrResume = useCallback(
    async (game: Game) => {
      if (runningGameIds.has(game.id)) {
        try {
          consoleSoundEngine.play('back')
          await stopGame(game.id)
          useLaunchStore.getState().markExited(game.id)
          toast.success(`Stopped ${game.name}`, { id: 'console-launch', duration: 2200 })
          void refreshData()
        } catch (e) {
          toast.error(e instanceof Error ? e.message : `Could not stop ${game.name}`, {
            id: 'console-launch',
          })
        }
        return
      }
      try {
        consoleSoundEngine.play('launch')
        useLaunchStore.getState().markLaunched(game.id)
        useLaunchStore.getState().updateElapsed(game.id, 0)
        await launchGame(game.id)
        toast.success(`Playing ${game.name}`, { id: 'console-launch', duration: 2500 })
      } catch (e) {
        useLaunchStore.getState().markExited(game.id)
        consoleSoundEngine.play('error')
        toast.error(e instanceof Error ? e.message : `Could not launch ${game.name}`, {
          id: 'console-launch',
        })
      }
    },
    [refreshData, runningGameIds],
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
    (hubGame: HubGame) => {
      setSelectedStoreHubGame(hubGame)
    },
    [setSelectedStoreHubGame],
  )

  const selectedGame = useMemo(
    () => (selectedGameId ? (games.find((g) => g.id === selectedGameId) ?? null) : null),
    [games, selectedGameId],
  )

  const allStoreGames = useMemo(() => {
    const merged = [...discountedHub, ...newReleasesHub, ...topRatedHub, ...comingSoonHub]
    const seen = new Set<number>()
    return merged.filter((hg) => {
      if (seen.has(hg.igdb_id)) return false
      seen.add(hg.igdb_id)
      return true
    })
  }, [discountedHub, newReleasesHub, topRatedHub, comingSoonHub])

  const activeDownloadsCount = useMemo(
    () =>
      downloads.filter((d) => ['downloading', 'queued', 'extracting'].includes(d.status)).length,
    [downloads],
  )

  const searchBtnFocus = useFocusable<HTMLButtonElement>({
    id: 'console_top_search_btn',
    scopeId: 'console_top_actions',
    onConfirm: handleGlobalSearch,
  })

  const quickBtnFocus = useFocusable<HTMLButtonElement>({
    id: 'console_top_quick_btn',
    scopeId: 'console_top_actions',
    onConfirm: () => setQuickSettingsOpen(true),
  })

  const exitDesktopBtnFocus = useFocusable<HTMLButtonElement>({
    id: 'console_top_exit_btn',
    scopeId: 'console_top_actions',
    onConfirm: () => {
      void handleExitConsole()
    },
  })

  const showProfileGate = !booting && !profileGateCompleted

  const stageKey = selectedStoreHubGame
    ? `store_game_${selectedStoreHubGame.igdb_id}`
    : selectedGame
      ? `game_${selectedGame.id}`
      : `tab_${activeTab}`

  return (
    <div
      style={
        {
          backgroundColor: themeTokens.bgPrimary,
          color: themeTokens.textPrimary,
          padding: `${safeMargin}vh ${safeMargin}vw`,
          '--console-ambient': ambientColor,
          transition: '--console-ambient 650ms ease, background-color 350ms ease',
        } as React.CSSProperties
      }
      className="relative w-screen h-screen overflow-hidden flex flex-col justify-between select-none"
    >
      <style>{`@property --console-ambient { syntax: '<color>'; inherits: true; initial-value: #00e5ff; }`}</style>
      <ConsoleBackdrop src={backdropSrc} intensity={activeTab === 'library' ? 0.65 : 1} />

      {/* Brighter Ambient Radial Glow */}
      <div
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{
          background: isLight
            ? `radial-gradient(ellipse 70% 55% at 85% 0%, color-mix(in srgb, ${themeTokens.defaultAccent} 14%, transparent) 0%, transparent 70%)`
            : `radial-gradient(ellipse 75% 60% at 85% 0%, color-mix(in srgb, var(--console-ambient) 26%, transparent) 0%, transparent 72%), radial-gradient(ellipse 65% 50% at 0% 100%, color-mix(in srgb, ${themeTokens.defaultAccent} 15%, transparent) 0%, transparent 72%)`,
        }}
      />

      {/* Top Navigation & Telemetry Header */}
      <header className="relative z-30 flex items-center justify-between gap-6 px-10 pb-2 pt-6">
        <div className="flex min-w-[15rem] items-center gap-4">
          <LogoMark className="size-[1.9rem] opacity-95" />
          {activeProfile && (
            <button
              type="button"
              onClick={() => setProfileGateCompleted(false)}
              className={`flex items-center gap-2.5 rounded-full border px-3 py-1 text-[0.92rem] font-bold transition-colors cursor-pointer ${
                isLight
                  ? 'border-slate-300 bg-white/90 text-slate-800 hover:bg-white shadow-2xs'
                  : 'border-white/15 bg-white/10 text-white/90 hover:bg-white/20'
              }`}
            >
              <span
                className="flex size-[1.95rem] shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/25 text-white"
                style={{ backgroundColor: activeProfile.color || '#0ea5e9' }}
              >
                <ProfileAvatarIcon
                  avatar={activeProfile.avatar ?? undefined}
                  className="size-4 text-white"
                />
              </span>
              <span className="truncate max-w-[9rem]">{activeProfile.name}</span>
            </button>
          )}
        </div>

        {/* Center Tabs with LB / RB hints */}
        <FocusScope
          id="console_top_tabs"
          orientation="horizontal"
          className="flex items-center gap-8"
        >
          <span className="opacity-55">
            <Glyph button="lb" size="sm" />
          </span>
          {PRIMARY_TABS.map((tabId) => (
            <TopTabButton
              key={tabId}
              tabId={tabId}
              label={t.tabs[tabId]}
              active={activeTab === tabId && !selectedGame && !selectedStoreHubGame}
              isLight={isLight}
              badgeCount={tabId === 'downloads' ? activeDownloadsCount : undefined}
              onSelect={() => setActiveTab(tabId)}
            />
          ))}
          <span className="opacity-55">
            <Glyph button="rb" size="sm" />
          </span>
        </FocusScope>

        {/* Right Cluster: Status + Search + Secondary Tabs */}
        <div className="flex min-w-[15rem] items-center justify-end gap-4">
          {sysStatus?.controllers?.[0] && (
            <span
              className={`flex items-center gap-1.5 text-[0.88rem] font-bold ${
                isLight ? 'text-emerald-700' : 'text-emerald-300'
              }`}
            >
              <Gamepad2 className="size-[1.1rem]" />
              {sysStatus.controllers[0].battery_percent}%
            </span>
          )}
          <span
            className={`text-[1rem] font-bold tabular-nums ${
              isLight ? 'text-slate-700' : 'text-white/85'
            }`}
          >
            {clockText}
          </span>

          <FocusScope
            id="console_top_actions"
            orientation="horizontal"
            className="flex items-center gap-1"
          >
            <button
              type="button"
              {...searchBtnFocus.focusProps}
              title="Spotlight Search (Y / Triangle / /)"
              aria-label="Spotlight Search"
              className={`flex size-[2.8rem] items-center justify-center rounded-full outline-none transition-all duration-200 cursor-pointer ${
                searchBtnFocus.isFocused
                  ? 'scale-110 bg-cyan-400 text-slate-950 shadow-lg'
                  : isLight
                    ? 'text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                    : 'text-white/65 hover:text-white'
              }`}
            >
              <Search className="size-[1.15rem]" />
            </button>

            {SECONDARY_TABS.map((tabId) => {
              const Icon = SECONDARY_TAB_ICONS[tabId]
              return (
                <TopIconButton
                  key={tabId}
                  id={`console_tab_${tabId}`}
                  scopeId="console_top_actions"
                  label={t.tabs[tabId]}
                  active={activeTab === tabId && !selectedGame && !selectedStoreHubGame}
                  isLight={isLight}
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
              className={`flex size-[2.8rem] items-center justify-center rounded-full outline-none transition-all duration-200 cursor-pointer ${
                quickBtnFocus.isFocused
                  ? 'scale-110 bg-cyan-400 text-slate-950 shadow-lg'
                  : isLight
                    ? 'text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                    : 'text-white/65 hover:text-white'
              }`}
            >
              <SlidersHorizontal className="size-[1.2rem]" />
            </button>

            <button
              type="button"
              {...exitDesktopBtnFocus.focusProps}
              title={t.actions.exitConsole}
              aria-label={t.actions.exitConsole}
              className={`flex size-[2.8rem] items-center justify-center rounded-full outline-none transition-all duration-200 cursor-pointer ${
                exitDesktopBtnFocus.isFocused
                  ? 'scale-110 bg-cyan-400 text-slate-950 shadow-lg'
                  : isLight
                    ? 'text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                    : 'text-white/65 hover:text-white'
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
            'linear-gradient(to bottom, transparent 0, #000 1.2rem, #000 calc(100% - 1.2rem), transparent 100%)',
          maskImage:
            'linear-gradient(to bottom, transparent 0, #000 1.2rem, #000 calc(100% - 1.2rem), transparent 100%)',
        }}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={stageKey}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: stageSeconds, ease: [0.22, 1, 0.36, 1] }}
          >
            <ConsoleErrorBoundary resetKey={stageKey}>
              {selectedStoreHubGame ? (
                <StoreGameDetailView
                  hubGame={selectedStoreHubGame}
                  onBack={() => setSelectedStoreHubGame(null)}
                  onSelectSimilarHubGame={(hg) => setSelectedStoreHubGame(hg)}
                  onGameAddedToLibrary={() => {
                    void refreshData()
                  }}
                />
              ) : selectedGame ? (
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
                  onSelectHubGame={handleSelectHubGame}
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
                  onSelectHubGame={handleSelectHubGame}
                />
              ) : activeTab === 'downloads' ? (
                <DownloadsView
                  downloads={downloads}
                  games={games}
                  onRefresh={() => {
                    void refreshData()
                  }}
                />
              ) : activeTab === 'music' ? (
                <MusicView games={games} />
              ) : activeTab === 'dualsense' ? (
                <ControllerView />
              ) : activeTab === 'passport' ? (
                <PassportView games={games} />
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

      {/* Bottom Control Hints */}
      <footer
        className={`relative z-30 flex items-center justify-between gap-4 px-10 pb-5 pt-2 ${
          isLight ? 'text-slate-600' : 'text-white/60'
        }`}
      >
        <span className="text-[0.82rem] font-semibold tracking-wide">
          {controllerLabel} · {themeTokens.name}
        </span>
        <div className="flex items-center gap-7 text-[0.85rem]">
          <Glyph button="confirm" label={t.actions.select} />
          <Glyph button="back" label={t.actions.back} />
          <Glyph button="tertiary" label={t.actions.search} />
          <Glyph button="options" label={t.actions.quickSettings} />
        </div>
      </footer>

      {/* 3.4-Second Cinematic Boot Intro (New Task #4) */}
      <ConsoleBootIntro open={booting} onFinish={() => setBooting(false)} />

      {/* Smooth Console Exit Animation when returning to Legacy Mode (New Task #5) */}
      <ConsoleExitOutro open={exitingToDesktop} />

      {/* Minimalist PS5-Style Who's Playing Gate (Bug #1 & #2) */}
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

      <ConsoleOSK games={games} storeGames={allStoreGames} />
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
              className="px-6 py-3 rounded-2xl bg-cyan-400 text-slate-950 font-extrabold text-sm cursor-pointer"
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
