import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  consoleListMonitors,
  type ConsoleSystemStatus,
} from '@/services/console'
import { useLaunchStore } from '@/store/launch-store'
import { useProfileStore } from '@/store/profile-store'
import { CONSOLE_THEMES } from './theme/tokens'
import { CONSOLE_STRINGS } from './i18n/strings'
import {
  computeRecommendedMonitorScale,
  useConsoleStore,
  type ConsoleTabId,
} from './store/console-store'
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
import { WishlistView } from './screens/WishlistView'
import { MemoryView } from './screens/MemoryView'
import { isGameUnreleased } from '@/features/library/utils/format'
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
  'wishlist',
  'memory',
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
  'wishlist',
  'memory',
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
}> = React.memo(({ tabId, label, active, isLight, badgeCount, onSelect }) => {
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
        <span
          className={`absolute inset-x-0 -bottom-0.5 h-[3px] rounded-full ${
            isFocused ? 'bg-cyan-400' : isLight ? 'bg-indigo-600' : 'bg-white/80'
          }`}
        />
      )}
    </button>
  )
})
TopTabButton.displayName = 'TopTabButton'

const TopIconButton: React.FC<{
  id: string
  scopeId: string
  label: string
  active?: boolean
  isLight: boolean
  onSelect: () => void
  children: React.ReactNode
}> = React.memo(({ id, scopeId, label, active, isLight, onSelect, children }) => {
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
})
TopIconButton.displayName = 'TopIconButton'

/**
 * Isolated Backdrop & Ambient Glow layer.
 * Subscribes to `focusedGameId` and `ambientColor` independently so hovering/moving focus
 * across game tiles NEVER triggers a re-render of `ConsoleShell` or any active screen!
 */
const ConsoleDynamicBackdropLayer: React.FC<{
  games: Game[]
  activeTab: ConsoleTabId
  selectedGameId: string | null
  selectedStoreHubGame: HubGame | null
  widescreenMap: Record<string, string>
  isLight: boolean
  defaultAccent: string
}> = React.memo(
  ({
    games,
    activeTab,
    selectedGameId,
    selectedStoreHubGame,
    widescreenMap,
    isLight,
    defaultAccent,
  }) => {
    const focusedGameId = useConsoleStore((s) => s.focusedGameId)
    const focusedBackdropUrl = useConsoleStore((s) => s.focusedBackdropUrl)
    const ambientColor = useConsoleStore((s) => s.ambientColor)

    const backdropSrc = useMemo(() => {
      if (selectedStoreHubGame) {
        return resolveConsoleHighResUrl(
          selectedStoreHubGame.backdrop_url ?? selectedStoreHubGame.cover_url,
        )
      }
      const pickBestForGame = (g: Game | undefined): string | null => {
        if (!g) return null
        const lowName = g.name.trim().toLowerCase()
        if (
          lowName === 'grand theft auto vi' ||
          lowName === 'grand theft auto 6' ||
          lowName === 'gta 6' ||
          lowName === 'gta vi'
        ) {
          return 'https://images.igdb.com/igdb/image/upload/t_1080p/scq3y1.jpg'
        }
        if (g.background_path || g.banner_path) {
          return resolveConsoleHighResUrl(g.background_path ?? g.banner_path)
        }
        const ws = widescreenMap[g.id]
        if (ws) {
          return resolveConsoleHighResUrl(ws)
        }
        if (g.steam_app_id) {
          return `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${g.steam_app_id}/header.jpg`
        }
        return resolveConsoleHighResUrl(g.cover_path)
      }

      if (selectedGameId) {
        return pickBestForGame(games.find((g) => g.id === selectedGameId))
      }
      if (
        activeTab !== 'home' &&
        activeTab !== 'library' &&
        activeTab !== 'wishlist' &&
        activeTab !== 'memory' &&
        activeTab !== 'store'
      ) {
        return null
      }
      if (focusedBackdropUrl) {
        return resolveConsoleHighResUrl(focusedBackdropUrl)
      }
      const focused = focusedGameId ? games.find((g) => g.id === focusedGameId) : undefined
      if (focused) {
        return pickBestForGame(focused)
      }
      if (activeTab !== 'home' && activeTab !== 'library') return null
      const fallback = [...games]
        .filter((g) => g.last_played_at)
        .sort((a, b) => (b.last_played_at ?? '').localeCompare(a.last_played_at ?? ''))[0]
      return pickBestForGame(fallback ?? games[0])
    }, [
      games,
      focusedGameId,
      focusedBackdropUrl,
      selectedGameId,
      selectedStoreHubGame,
      activeTab,
      widescreenMap,
    ])

    const backdropIntensity =
      activeTab === 'home' || selectedGameId || selectedStoreHubGame ? 1 : isLight ? 0.84 : 0.65

    return (
      <>
        <ConsoleBackdrop src={backdropSrc} intensity={backdropIntensity} />
        <div
          className="pointer-events-none absolute inset-0 z-[1] transition-[background] duration-700 ease-out"
          style={{
            background: isLight
              ? `radial-gradient(ellipse 75% 60% at 85% 0%, color-mix(in srgb, ${ambientColor} 28%, transparent) 0%, transparent 72%), radial-gradient(ellipse 65% 50% at 0% 100%, color-mix(in srgb, ${defaultAccent} 20%, transparent) 0%, transparent 72%)`
              : `radial-gradient(ellipse 75% 60% at 85% 0%, color-mix(in srgb, ${ambientColor} 24%, transparent) 0%, transparent 72%), radial-gradient(ellipse 65% 50% at 0% 100%, color-mix(in srgb, ${defaultAccent} 15%, transparent) 0%, transparent 72%)`,
          }}
        />
      </>
    )
  },
)
ConsoleDynamicBackdropLayer.displayName = 'ConsoleDynamicBackdropLayer'

export const ConsoleShell: React.FC = () => {
  const navigate = useNavigate()
  const shellRef = useRef<HTMLDivElement | null>(null)
  const activeTab = useConsoleStore((s) => s.activeTab)
  const setActiveTab = useConsoleStore((s) => s.setActiveTab)
  const selectedGameId = useConsoleStore((s) => s.selectedGameId)
  const setSelectedGameId = useConsoleStore((s) => s.setSelectedGameId)
  const selectedStoreHubGame = useConsoleStore((s) => s.selectedStoreHubGame)
  const setSelectedStoreHubGame = useConsoleStore((s) => s.setSelectedStoreHubGame)
  const setFocusedGameId = useConsoleStore((s) => s.setFocusedGameId)
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

  const controllerLabel =
    activeControllerCount > 0 ? describeGlyphFamily(detectedGlyphFamily) : 'Keyboard & Mouse Ready'
  const stageSeconds = 0.2 * animSpeed

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

  const refreshStoreHubCatalog = useCallback(async () => {
    const [top, nw, soon, deals] = await Promise.all([
      getHubTopRated().catch(() => [] as HubGame[]),
      getHubNewReleases().catch(() => [] as HubGame[]),
      getHubComingSoon().catch(() => [] as HubGame[]),
      getHubDiscountedGames().catch(() => [] as HubGame[]),
    ])
    if (top.length > 0) setTopRatedHub(top)
    if (nw.length > 0) setNewReleasesHub(nw)
    if (soon.length > 0) setComingSoonHub(soon)
    if (deals.length > 0) setDiscountedHub(deals)
  }, [])

  // Enter borderless fullscreen Console Mode on mount
  useEffect(() => {
    void loadProfiles(false)
    Promise.all([
      getAllSettings().catch(() => undefined),
      consoleListMonitors().catch(() => []),
    ]).then(([raw, mons]) => {
      hydrateFromSettings(raw)
      if (!raw || raw['console_ui_scale'] === undefined) {
        const monIdx =
          raw && raw['console_monitor']
            ? Number.parseInt(raw['console_monitor'], 10) || 0
            : monitorIndex
        const targetMon = mons[monIdx] ?? mons[0]
        const rec = computeRecommendedMonitorScale(targetMon?.width, targetMon?.height)
        void useConsoleStore.getState().updateConsoleSetting('uiScale', rec.scale)
      }
    })
    void consoleModeEnter(monitorIndex).catch(() => {})
    void refreshData()

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

  // Poll running games every 3000ms and tick elapsed seconds ONLY when a game is actually running!
  useEffect(() => {
    const syncRunning = () => {
      getRunningGames()
        .then((ids) => {
          const cur = useLaunchStore.getState().runningGameIds
          if (cur.size !== ids.length || ids.some((id) => !cur.has(id))) {
            useLaunchStore.getState().hydrateRunning(ids)
          }
        })
        .catch(() => {})
    }
    syncRunning()
    const pollId = window.setInterval(syncRunning, 3000)
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

  useEffect(() => {
    const root = document.documentElement
    const apply = () => {
      if (exitingToDesktop) return
      const ratio = Math.min(window.innerWidth / 1920, window.innerHeight / 1080)
      const px = Math.max(0.82, ratio) * 14.5 * (uiScale / 100)
      root.style.fontSize = `${Math.min(28, Math.max(11, px)).toFixed(2)}px`
    }
    apply()
    window.addEventListener('resize', apply)
    return () => {
      window.removeEventListener('resize', apply)
      root.style.fontSize = ''
    }
  }, [uiScale, exitingToDesktop])

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
    const id = window.setInterval(updateStatus, 15000)
    return () => window.clearInterval(id)
  }, [])

  const exitingToDesktopRef = useRef(false)
  exitingToDesktopRef.current = exitingToDesktop

  // Guard Console Mode fullscreen state: if an embedded <video> or <iframe> ever triggers
  // document.exitFullscreen(), immediately re-assert Console Mode fullscreen on the Tauri window!
  useEffect(() => {
    const onFullscreenChange = () => {
      if (!document.fullscreenElement && !exitingToDesktopRef.current) {
        window.setTimeout(() => {
          if (!exitingToDesktopRef.current) {
            void consoleModeEnter(monitorIndex).catch(() => {})
          }
        }, 60)
      }
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [monitorIndex])

  const finishExitConsoleNow = useCallback(async () => {
    document.documentElement.style.fontSize = ''
    await consoleModeExit().catch(() => {})
    window.dispatchEvent(new Event('resize'))
    navigate(lastDesktopRoute || '/')
  }, [lastDesktopRoute, navigate])

  const handleExitConsole = useCallback(async () => {
    if (exitingToDesktop) return
    exitingToDesktopRef.current = true
    setQuickSettingsOpen(false)
    setExitingToDesktop(true)
    consoleSoundEngine.play('close')
    await new Promise((resolve) => window.setTimeout(resolve, 1950))
    await finishExitConsoleNow()
  }, [exitingToDesktop, finishExitConsoleNow, setQuickSettingsOpen])

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

  const colorCacheRef = useRef<Map<string, string>>(new Map())
  const checkedScreenshotsRef = useRef<Set<string>>(new Set())
  const focusDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isScrollingRef = useRef(false)
  const scrollIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleMainScroll = useCallback(() => {
    isScrollingRef.current = true
    if (scrollIdleTimerRef.current) {
      clearTimeout(scrollIdleTimerRef.current)
    }
    scrollIdleTimerRef.current = setTimeout(() => {
      isScrollingRef.current = false
    }, 140)
  }, [])

  const applyAmbientColorToDom = useCallback((hex: string) => {
    if (shellRef.current) {
      shellRef.current.style.setProperty('--console-ambient', hex)
    }
    useConsoleStore.getState().setAmbientColor(hex)
  }, [])

  const handleFocusGame = useCallback(
    (game: Game) => {
      if (isScrollingRef.current) return
      if (focusDebounceTimerRef.current) {
        clearTimeout(focusDebounceTimerRef.current)
      }
      // Debounce rapid focus sweeps (e.g. holding D-Pad / moving mouse across tiles)
      // so fast navigation never triggers redundant backdrop swaps or IPC calls!
      focusDebounceTimerRef.current = setTimeout(() => {
        setFocusedGameId(game.id)

        if (
          !game.background_path &&
          !game.banner_path &&
          !checkedScreenshotsRef.current.has(game.id)
        ) {
          checkedScreenshotsRef.current.add(game.id)
          getGameScreenshots(game.id)
            .then((shots) => {
              if (shots && shots[0]) {
                setWidescreenMap((prev) =>
                  prev[game.id] === shots[0] ? prev : { ...prev, [game.id]: shots[0] },
                )
              }
            })
            .catch(() => {})
        }

        const cached = colorCacheRef.current.get(game.id)
        if (cached) {
          applyAmbientColorToDom(cached)
          return
        }
        consoleExtractDominantColor(game.id)
          .then((hex) => {
            if (hex && hex.startsWith('#')) {
              colorCacheRef.current.set(game.id, hex)
              applyAmbientColorToDom(hex)
            }
          })
          .catch(() => {})
      }, 40)
    },
    [applyAmbientColorToDom, setFocusedGameId],
  )

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

  const handleOpenGameHub = useCallback(
    (game: Game) => {
      setSelectedGameId(game.id)
    },
    [setSelectedGameId],
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

  const wishlistCount = useMemo(
    () =>
      games.filter(
        (g) =>
          !g.is_memory &&
          !g.is_hidden &&
          (g.is_wishlist || (isGameUnreleased(g.release_date) && !g.is_installed)),
      ).length,
    [games],
  )

  const memoryCount = useMemo(
    () => games.filter((g) => g.is_memory && !g.is_hidden).length,
    [games],
  )

  // Poll downloads while on the Downloads tab or when active downloads are running
  useEffect(() => {
    if (activeTab !== 'downloads' && activeDownloadsCount === 0) return
    const id = window.setInterval(() => {
      getDownloads()
        .then(setDownloads)
        .catch(() => {})
    }, 1500)
    return () => window.clearInterval(id)
  }, [activeTab, activeDownloadsCount])

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
      ref={shellRef}
      style={
        {
          backgroundColor: themeTokens.bgPrimary,
          color: themeTokens.textPrimary,
          padding: `${Math.min(safeMargin, 1.2)}vh ${Math.min(safeMargin, 1.5)}vw`,
          '--console-ambient': '#00e5ff',
          transition: 'background-color 350ms ease',
        } as React.CSSProperties
      }
      className="relative w-screen h-screen overflow-hidden flex flex-col justify-between select-none"
    >
      <ConsoleDynamicBackdropLayer
        games={games}
        activeTab={activeTab}
        selectedGameId={selectedGameId}
        selectedStoreHubGame={selectedStoreHubGame}
        widescreenMap={widescreenMap}
        isLight={isLight}
        defaultAccent={themeTokens.defaultAccent}
      />

      {/* Top Navigation & Telemetry Header */}
      <header className="relative z-30 flex items-center justify-between gap-4 px-6 pb-1.5 pt-3">
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
          className="flex items-center gap-5 lg:gap-6"
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
              badgeCount={
                tabId === 'downloads'
                  ? activeDownloadsCount
                  : tabId === 'wishlist'
                    ? wishlistCount
                    : tabId === 'memory'
                      ? memoryCount
                      : undefined
              }
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

      {/* Main Scrollable Stage (Hardware-accelerated without mask-image tearing) */}
      <main
        onScroll={handleMainScroll}
        className="relative z-20 flex-1 overflow-y-auto overscroll-contain no-scrollbar px-6 pb-3 pt-2 [transform:translateZ(0)]"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={stageKey}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: stageSeconds, ease: [0.22, 1, 0.36, 1] }}
          >
            <ConsoleErrorBoundary resetKey={stageKey}>
              {selectedStoreHubGame ? (
                <StoreGameDetailView
                  hubGame={selectedStoreHubGame}
                  games={games}
                  onBack={() => setSelectedStoreHubGame(null)}
                  onSelectSimilarHubGame={handleSelectHubGame}
                  onGameAddedToLibrary={() => {
                    void refreshData()
                  }}
                  onPlayGame={(g) => {
                    void handlePlayOrResume(g)
                  }}
                  onOpenGameHub={(g) => {
                    setSelectedStoreHubGame(null)
                    setSelectedGameId(g.id)
                  }}
                  onOpenMemoryTab={() => {
                    setSelectedStoreHubGame(null)
                    setActiveTab('memory')
                  }}
                  onSwitchToLegacyMode={() => {
                    void handleExitConsole()
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
                  onPlayOrResume={handlePlayOrResume}
                  onOpenGameHub={handleOpenGameHub}
                  onSelectHubGame={handleSelectHubGame}
                  onFocusGame={handleFocusGame}
                  onToggleFavorite={handleToggleFavorite}
                  onGoToDesktopScan={handleExitConsole}
                />
              ) : activeTab === 'library' ? (
                <LibraryView
                  games={games}
                  runningGameIds={runningGameIds}
                  onSelectGame={handleOpenGameHub}
                  onFocusGame={handleFocusGame}
                  onToggleFavorite={handleToggleFavorite}
                />
              ) : activeTab === 'store' ? (
                <StoreView
                  topRated={topRatedHub}
                  newReleases={newReleasesHub}
                  comingSoon={comingSoonHub}
                  discounted={discountedHub}
                  onSelectHubGame={handleSelectHubGame}
                  onWishlistUpdated={refreshData}
                  onSyncStoreCatalog={refreshStoreHubCatalog}
                />
              ) : activeTab === 'wishlist' ? (
                <WishlistView
                  games={games}
                  storeDeals={discountedHub}
                  storeUpcoming={comingSoonHub}
                  storeTopRated={topRatedHub}
                  onOpenGameHub={handleOpenGameHub}
                  onSelectHubGame={handleSelectHubGame}
                  onFocusGame={handleFocusGame}
                  onGoToStore={() => setActiveTab('store')}
                  onRefreshGames={refreshData}
                />
              ) : activeTab === 'memory' ? (
                <MemoryView
                  games={games}
                  onOpenGameHub={handleOpenGameHub}
                  onFocusGame={handleFocusGame}
                  onRefreshGames={refreshData}
                  onSwitchToLegacyMode={handleExitConsole}
                />
              ) : activeTab === 'downloads' ? (
                <DownloadsView downloads={downloads} games={games} onRefresh={refreshData} />
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
                  onExitToDesktop={handleExitConsole}
                  onSwitchProfile={() => setProfileGateCompleted(false)}
                />
              )}
            </ConsoleErrorBoundary>
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Bottom Control Hints */}
      <footer
        className={`relative z-30 flex items-center justify-between gap-4 px-6 pb-3 pt-1.5 ${
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

      <ConsoleBootIntro open={booting} onFinish={() => setBooting(false)} />
      <ConsoleExitOutro open={exitingToDesktop} onSkip={() => void finishExitConsoleNow()} />
      <WhoIsPlayingModal open={showProfileGate} onDone={() => setProfileGateCompleted(true)} />

      <QuickSettingsPanel
        open={quickSettingsOpen}
        onClose={() => setQuickSettingsOpen(false)}
        onOpenPowerMenu={() => setActiveTab('power')}
        onExitConsoleMode={handleExitConsole}
        onOpenBooster={() => setActiveTab('booster')}
      />

      <ConsoleOSK games={games} storeGames={allStoreGames} />
      <AuroraScreensaver />

      {controllerDisconnectedModal && (
        <div className="fixed inset-0 z-[270] bg-black/70 backdrop-blur-md flex items-center justify-center p-6">
          <div
            className={`max-w-md w-full p-8 rounded-3xl border text-center space-y-4 shadow-2xl ${
              isLight
                ? 'bg-white border-amber-500/40 text-slate-900'
                : 'bg-slate-950 border-amber-400/40 text-white'
            }`}
          >
            <Gamepad2
              className={`w-12 h-12 mx-auto animate-bounce ${
                isLight ? 'text-amber-600' : 'text-amber-400'
              }`}
            />
            <h2 className={`text-2xl font-black ${isLight ? 'text-slate-900' : 'text-white'}`}>
              Controller Disconnected
            </h2>
            <p className={`text-sm ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>
              Reconnect your controller to continue.
            </p>
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
