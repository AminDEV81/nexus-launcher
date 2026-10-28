import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Gamepad2,
  BatteryCharging,
  Volume2,
  SlidersHorizontal,
  Monitor,
  Wifi,
} from 'lucide-react'
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
import { FocusScope, useFocusable } from './nav/FocusScope'
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
      className={`px-4 py-2 rounded-2xl font-extrabold text-sm transition-all flex items-center gap-2 ${
        isFocused
          ? 'bg-cyan-400 text-slate-950 scale-105 ring-4 ring-cyan-300/50 shadow-lg'
          : active
            ? 'bg-white/15 text-white border border-cyan-400/50'
            : 'text-slate-400 hover:text-white'
      }`}
    >
      <span>{label}</span>
      {badgeCount && badgeCount > 0 ? (
        <span className="px-1.5 py-0.5 rounded-full bg-cyan-500 text-slate-950 text-[10px] font-black">
          {badgeCount}
        </span>
      ) : null}
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
    getHubTopRated().then(setTopRatedHub).catch(() => {})
    getHubNewReleases().then(setNewReleasesHub).catch(() => {})
    getHubComingSoon().then(setComingSoonHub).catch(() => {})
    getHubDiscountedGames().then(setDiscountedHub).catch(() => {})
  }, [hydrateFromSettings, loadProfiles, monitorIndex, refreshData])

  // Start or stop Guide button listener according to setting
  useEffect(() => {
    if (guideEnabled) {
      void consoleGuideListenerStart().catch(() => {})
    } else {
      void consoleGuideListenerStop().catch(() => {})
    }
  }, [guideEnabled])

  // Clock + telemetry refresh every 10s
  useEffect(() => {
    const updateStatus = () => {
      setClockText(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
      consoleGetSystemStatus().then(setSysStatus).catch(() => {})
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

  const handleFocusGame = useCallback(
    (game: Game) => {
      setFocusedGameId(game.id)
      consoleExtractDominantColor(game.id)
        .then((hex) => {
          if (hex && hex.startsWith('#')) {
            useConsoleStore.getState().setAmbientColor(hex)
          }
        })
        .catch(() => {})
    },
    [setFocusedGameId],
  )

  const handlePlayOrResume = useCallback(
    async (game: Game) => {
      if (runningGameIds.has(game.id)) {
        const ok = await consoleResumeGame(game.id).catch(() => false)
        if (ok) {
          toast.success(`Resumed ${game.name}`)
          return
        }
      }
      try {
        await launchGame(game.id)
        toast.success(`Launching ${game.name}...`)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : `Could not launch ${game.name}`)
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
      style={{
        backgroundColor: themeTokens.bgPrimary,
        color: themeTokens.textPrimary,
        fontSize: `${uiScale}%`,
        padding: `${safeMargin}vh ${safeMargin}vw`,
      }}
      className="relative w-screen h-screen overflow-hidden flex flex-col justify-between select-none"
    >
      {/* Dynamic Ambient Radial Backdrop */}
      <div
        className="pointer-events-none absolute inset-0 transition-all duration-500"
        style={{
          background: `radial-gradient(circle at 20% 15%, ${ambientColor}2b 0%, transparent 55%), radial-gradient(circle at 85% 80%, ${themeTokens.defaultAccent}1f 0%, transparent 60%)`,
        }}
      />

      {/* Top Navigation & Telemetry Bar */}
      <header className="relative z-30 flex items-center justify-between gap-4 px-8 py-4 border-b border-white/10 bg-slate-950/60 backdrop-blur-xl rounded-t-3xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-cyan-300 font-black text-lg shadow">
            N
          </div>
          {activeProfile && (
            <button
              type="button"
              onClick={() => setProfileGateCompleted(false)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-white/5 border border-white/10 text-xs font-bold text-slate-200 hover:bg-white/10"
            >
              <span
                className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black text-white"
                style={{ backgroundColor: activeProfile.color || '#0ea5e9' }}
              >
                {activeProfile.avatar || activeProfile.name.slice(0, 1).toUpperCase()}
              </span>
              <span>{activeProfile.name}</span>
            </button>
          )}
        </div>

        {/* Center Tabs with LB / RB hints */}
        <FocusScope
          id="console_top_tabs"
          orientation="horizontal"
          rtl={isRtl}
          className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1"
        >
          <Glyph button="lb" size="sm" />
          {TAB_ORDER.map((tabId) => (
            <TopTabButton
              key={tabId}
              tabId={tabId}
              label={t.tabs[tabId]}
              active={activeTab === tabId && !selectedGame}
              badgeCount={tabId === 'downloads' ? activeDownloadsCount : undefined}
              onSelect={() => setActiveTab(tabId)}
            />
          ))}
          <Glyph button="rb" size="sm" />
        </FocusScope>

        {/* Right Telemetry Cluster */}
        <div className="flex items-center gap-3">
          {sysStatus?.controllers?.[0] && (
            <span className="hidden lg:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 text-xs font-bold">
              <Gamepad2 className="w-3.5 h-3.5" />
              <span>{sysStatus.controllers[0].battery_percent}%</span>
            </span>
          )}
          {sysStatus?.system_battery_percent != null && (
            <span className="hidden lg:inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white/5 text-xs font-bold text-slate-300">
              <BatteryCharging className="w-3.5 h-3.5 text-amber-400" />
              {sysStatus.system_battery_percent}%
            </span>
          )}
          <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-bold text-slate-300">
            <Wifi className="w-3.5 h-3.5 text-cyan-400" />
          </span>
          <span className="font-mono text-base font-extrabold text-white">{clockText}</span>

          <button
            type="button"
            {...quickBtnFocus.focusProps}
            title={t.actions.quickSettings}
            className={`p-2.5 rounded-xl border transition-all ${
              quickBtnFocus.isFocused
                ? 'bg-cyan-400 text-slate-950 border-cyan-300 scale-105'
                : 'bg-white/5 text-slate-200 border-white/10'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>

          <button
            type="button"
            {...exitDesktopBtnFocus.focusProps}
            title={t.actions.exitConsole}
            className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all ${
              exitDesktopBtnFocus.isFocused
                ? 'bg-cyan-400 text-slate-950 border-cyan-300 scale-105'
                : 'bg-white/5 text-slate-200 border-white/10'
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">{t.actions.exitConsole}</span>
          </button>
        </div>
      </header>

      {/* Main Scrollable Stage */}
      <main className="relative z-20 flex-1 overflow-y-auto no-scrollbar px-8 py-6">
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
      </main>

      {/* Bottom Context Glyph Legend Bar */}
      <footer className="relative z-30 flex flex-wrap items-center justify-between gap-4 px-8 py-3.5 border-t border-white/10 bg-slate-950/75 backdrop-blur-xl rounded-b-3xl">
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <Volume2 className="w-4 h-4 text-cyan-400" />
          <span>Console Big Picture · 60fps Spatial Navigation</span>
        </div>

        <div className="flex flex-wrap items-center gap-6">
          <Glyph button="confirm" label={t.actions.select} />
          <Glyph button="back" label={t.actions.back} />
          <Glyph button="tertiary" label={t.actions.search} />
          <Glyph button="options" label={t.actions.quickSettings} />
        </div>
      </footer>

      {/* Overlays & Modals */}
      <WhoIsPlayingModal
        open={showProfileGate}
        onDone={() => setProfileGateCompleted(true)}
      />

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
            <p className="text-sm text-slate-300">
              Reconnect your DualSense or Xbox controller, or press any keyboard key to continue in
              Console Mode.
            </p>
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
