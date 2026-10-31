import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { listen } from '@tauri-apps/api/event'
import { consoleToggleQuickMenu } from '@/services/console'
import { useConsoleStore } from '@/features/console/store/console-store'
import { AnimatePresence, motion } from 'framer-motion'
import { TitleBar } from './title-bar'
import { ResizeHandles } from './resize-handles'
import { Sidebar } from './sidebar'
import { AmbientBackground } from './ambient-background'
import { AnimatedOutlet } from './animated-outlet'
import { StartupSplash } from './startup-splash'
import { CloseConfirmModal } from './close-confirm-modal'
import { ClosingOverlay } from './closing-overlay'
import { AddGameModal } from '@/features/library/components/add-game-modal'
import { StartDownloadModal } from '@/features/downloads/components/start-download-modal'
import {
  useDownloadUpdatesListener,
  useDownloadCompletedListener,
} from '@/features/downloads/hooks/use-downloads'
import { useDownloadScheduler } from '@/features/downloads/hooks/use-download-scheduler'
import { useGamingMode } from '@/features/downloads/hooks/use-gaming-mode'
import { ScanResultsModal } from '@/features/library/components/scan-results-modal'
import { GameDetailsPanel } from '@/features/library/components/game-details-panel'
import { ProfileSelectScreen } from '@/features/profiles/components/profile-select-screen'
import { ModeSelectModal } from '@/components/modals/mode-select-modal'
import { ProfileManagerModal } from '@/features/profiles/components/profile-manager-modal'
import { SaveHistoryModal } from '@/features/library/components/save-history-modal'
import { LaunchBoostModal } from '@/features/booster/components/launch-boost-modal'
import { useProfileStore } from '@/store/profile-store'
import { OnboardingOverlay } from '@/features/onboarding/components/onboarding-overlay'
import { ErrorBoundary } from '@/components/error-boundary'
import { MiniPlayer } from '@/features/soundtrack/components/player/mini-player'
import { ExpandedPlayer } from '@/features/soundtrack/components/player/expanded-player'
import { useSoundtrackDownloads } from '@/features/soundtrack/hooks/use-soundtrack-downloads'
import { useSoundtrackGlobalShortcuts } from '@/features/soundtrack/hooks/use-soundtrack-player'
import { CommandPalette } from '@/components/command-palette/command-palette'
import { useSettings } from '@/features/settings/hooks/use-settings'
import { useWindowDragDropImport } from '@/features/library/hooks/use-window-drag-drop-import'
import { useMetadataUpdatedListener } from '@/features/library/hooks/use-metadata-updated-listener'
import { useAutoPromoteReleasedGames } from '@/features/library/hooks/use-auto-promote-released-games'
import { useGlobalClickSound } from '@/hooks/use-global-click-sound'
import { useWindowCloseIntercept } from '@/hooks/use-window-close-intercept'
import { usePlaytimeTracking } from '@/hooks/use-playtime-tracking'
import { useAnimationSpeed } from '@/hooks/use-animation-speed'
import { useAppearanceSettingsStore } from '@/store/appearance-settings-store'
import { useWindowFillsScreen } from '@/hooks/use-window-maximized'
import { queryClient } from '@/app/query-client'
import { gamesKey } from '@/features/library/hooks/use-games'
import { listGames } from '@/services/games'
import { UpdateModal } from '@/features/updater/components/update-modal'
import { RecoveryBanner } from '@/features/updater/components/recovery-banner'
import { useUpdaterStore } from '@/store/updater-store'
import { markLaunchSuccessful } from '@/services/health-guard'
import { cn } from '@/lib/utils'

export function AppShell() {
  useWindowDragDropImport()
  useMetadataUpdatedListener()
  useAutoPromoteReleasedGames()
  useDownloadUpdatesListener()
  useDownloadCompletedListener()
  useDownloadScheduler()
  useGamingMode()
  useGlobalClickSound()
  useWindowCloseIntercept()
  usePlaytimeTracking()
  useSoundtrackDownloads()
  useSoundtrackGlobalShortcuts()

  const navigate = useNavigate()
  const location = useLocation()
  const [showSplash, setShowSplash] = useState(true)
  const speed = useAnimationSpeed()
  const fillsScreen = useWindowFillsScreen()
  const loadProfiles = useProfileStore((s) => s.loadProfiles)

  const isGateOpen = useProfileStore((s) => s.isGateOpen)

  useEffect(() => {
    void loadProfiles(true)
  }, [loadProfiles])

  // Failsafe timer so StartupSplash can never stay stuck if an animation callback is skipped
  useEffect(() => {
    if (!showSplash) return
    const timer = window.setTimeout(() => setShowSplash(false), 2600)
    return () => window.clearTimeout(timer)
  }, [showSplash])

  const { data: settings } = useSettings()
  const [onboardingDismissed, setOnboardingDismissed] = useState(false)
  const showOnboarding =
    !showSplash && !onboardingDismissed && settings !== undefined && settings.onboarded !== '1'

  // Console Mode global keyboard shortcut (Ctrl+Alt+Enter), single-instance CLI --console event,
  // Guide button listener event, and boot-into-console setting.
  useEffect(() => {
    if (settings) {
      useConsoleStore.getState().hydrateFromSettings(settings)
      if (
        (settings.console_start_in_console === '1' ||
          settings.console_start_in_console === 'true') &&
        location.pathname !== '/console'
      ) {
        useConsoleStore.getState().setLastDesktopRoute(location.pathname)
        navigate('/console')
      }
    }
  }, [settings, location.pathname, navigate])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.altKey && e.key === 'Enter') {
        e.preventDefault()
        useConsoleStore.getState().setLastDesktopRoute(location.pathname)
        navigate('/console')
      }
    }
    const blockBrowserMouseBack = (e: MouseEvent) => {
      if (e.button === 3 || e.button === 4) {
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('mouseup', blockBrowserMouseBack, true)
    window.addEventListener('auxclick', blockBrowserMouseBack, true)

    let disposed = false
    const unlisteners: Array<() => void> = []
    void Promise.all([
      listen('console://enter', () => {
        useConsoleStore.getState().setLastDesktopRoute(location.pathname)
        navigate('/console')
      }),
      listen('console://guide', () => {
        void consoleToggleQuickMenu().catch(() => {})
      }),
    ]).then((subs) => {
      if (disposed) subs.forEach((u) => u())
      else unlisteners.push(...subs)
    })

    return () => {
      disposed = true
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('mouseup', blockBrowserMouseBack, true)
      window.removeEventListener('auxclick', blockBrowserMouseBack, true)
      unlisteners.forEach((u) => u())
    }
  }, [location.pathname, navigate])

  useEffect(() => {
    void queryClient.prefetchQuery({ queryKey: gamesKey, queryFn: () => listGames() })
    void queryClient.prefetchQuery({
      queryKey: ['games', 'default'],
      queryFn: () => listGames('default'),
    })
  }, [])

  // Auto-Update system initialization, launch health registration, and background check
  useEffect(() => {
    let intervalId: number | null = null
    let startupTimer: number | null = null

    const initUpdater = async () => {
      await useUpdaterStore.getState().init()
      const ver = useUpdaterStore.getState().currentVersion
      await markLaunchSuccessful(ver)

      startupTimer = window.setTimeout(() => {
        if (typeof navigator === "undefined" || navigator.onLine !== false) {
          void useUpdaterStore.getState().checkUpdates(false, true)
        }
      }, 1800)

      intervalId = window.setInterval(
        () => {
          if (typeof navigator === "undefined" || navigator.onLine !== false) {
            void useUpdaterStore.getState().checkUpdates(false, false)
          }
        },
        2 * 60 * 60 * 1000,
      )
    }

    void initUpdater()

    return () => {
      if (startupTimer !== null) window.clearTimeout(startupTimer)
      if (intervalId !== null) window.clearInterval(intervalId)
    }
  }, [])

  return (
    <div
      className={cn(
        'relative flex h-screen flex-col overflow-hidden bg-bg',
        !fillsScreen && 'rounded-xl border border-border shadow-elevated',
      )}
    >
      {useAppearanceSettingsStore((s) => s.ambientBackground && !s.gpuEcoMode) && (
        <AmbientBackground paused={showSplash || isGateOpen} />
      )}
      <ResizeHandles />
      <TitleBar />
      <RecoveryBanner />

      <div className="flex min-h-0 flex-1">
        <Sidebar />

        <motion.main
          className="min-h-0 min-w-0 flex-1 flex flex-col"
          initial={{ opacity: 0, scale: 0.99 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.25 * speed, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
            <div className="flex-1 min-h-0 overflow-hidden">
              <ErrorBoundary label="This page" compact>
                <AnimatedOutlet />
              </ErrorBoundary>
            </div>
            <MiniPlayer />
          </div>
        </motion.main>

        <ErrorBoundary label="The details panel" compact>
          <GameDetailsPanel />
        </ErrorBoundary>
      </div>

      <AddGameModal />
      <StartDownloadModal />
      <ScanResultsModal />
      <CloseConfirmModal />
      <ClosingOverlay />
      <CommandPalette />
      <ProfileManagerModal />
      <SaveHistoryModal />
      <ProfileSelectScreen />
      <ModeSelectModal />
      <LaunchBoostModal />
      <ExpandedPlayer />
      <UpdateModal />

      <div id="modal-host" className="pointer-events-none absolute inset-0 z-[150]" />

      {showSplash && <StartupSplash onDone={() => setShowSplash(false)} />}

      <AnimatePresence>
        {showOnboarding && <OnboardingOverlay onDone={() => setOnboardingDismissed(true)} />}
      </AnimatePresence>
    </div>
  )
}
