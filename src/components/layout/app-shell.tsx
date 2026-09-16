import { useEffect, useState } from 'react'
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
import { ProfileManagerModal } from '@/features/profiles/components/profile-manager-modal'
import { SaveHistoryModal } from '@/features/library/components/save-history-modal'
import { LaunchBoostModal } from '@/features/booster/components/launch-boost-modal'
import { useProfileStore } from '@/store/profile-store'
import { OnboardingOverlay } from '@/features/onboarding/components/onboarding-overlay'
import { ErrorBoundary } from '@/components/error-boundary'
import { MiniPlayer } from '@/features/soundtrack/components/player/mini-player'
import { ExpandedPlayer } from '@/features/soundtrack/components/player/expanded-player'
import { useSoundtrackDownloads } from '@/features/soundtrack/hooks/use-soundtrack-downloads'
import { CommandPalette } from '@/components/command-palette/command-palette'
import { useSettings } from '@/features/settings/hooks/use-settings'
import { useWindowDragDropImport } from '@/features/library/hooks/use-window-drag-drop-import'
import { useMetadataUpdatedListener } from '@/features/library/hooks/use-metadata-updated-listener'
import { useAutoPromoteReleasedGames } from '@/features/library/hooks/use-auto-promote-released-games'
import { useGlobalClickSound } from '@/hooks/use-global-click-sound'
import { useWindowCloseIntercept } from '@/hooks/use-window-close-intercept'
import { usePlaytimeTracking } from '@/hooks/use-playtime-tracking'
import { useAnimationSpeed } from '@/hooks/use-animation-speed'
import { useWindowFillsScreen } from '@/hooks/use-window-maximized'
import { queryClient } from '@/app/query-client'
import { gamesKey } from '@/features/library/hooks/use-games'
import { listGames } from '@/services/games'
import { cn } from '@/lib/utils'

/**
 * Root layout for every route. Owns the pieces that exist regardless of
 * which page is active: the custom title bar, the invisible resize
 * handles, the sidebar, the ambient background, the Add Game modal, the
 * startup splash, the close-confirmation flow, and the startup fade-in.
 *
 * `relative` + `rounded-xl` + `overflow-hidden` here matters beyond
 * styling: the window itself is fully transparent (`transparent: true`
 * in tauri.conf.json), so *this* div is what actually paints the visible
 * rounded card — and its `overflow-hidden` is what clips `AmbientBackground`,
 * `Modal`, `StartupSplash`, and `ClosingOverlay` (all absolutely
 * positioned children) to that same rounded shape instead of letting
 * them spill into the transparent corners.
 */
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

  const [showSplash, setShowSplash] = useState(true)
  const speed = useAnimationSpeed()
  const fillsScreen = useWindowFillsScreen()
  const loadProfiles = useProfileStore((s) => s.loadProfiles)

  const isGateOpen = useProfileStore((s) => s.isGateOpen)

  useEffect(() => {
    void loadProfiles(true)
  }, [loadProfiles])

  // First-run onboarding sits above everything once the splash is gone,
  // until the user finishes or skips it (`onboarded` setting). While
  // settings are still loading it stays hidden so an existing user never
  // sees a flash of the wizard.
  const { data: settings } = useSettings()
  const [onboardingDismissed, setOnboardingDismissed] = useState(false)
  const showOnboarding =
    !showSplash && !onboardingDismissed && settings !== undefined && settings.onboarded !== '1'

  // The splash's own animation is already cheap (compositor-only
  // transform/opacity, no animated filters — see startup-splash.tsx),
  // but it was still visibly dropping frames because the *library
  // route* was mounting and rendering behind it at the same time: the
  // full games list arriving, a virtualized grid measuring its
  // container, and a card per visible game each running its own
  // IntersectionObserver. That's real synchronous main-thread work
  // competing with the splash's frames, invisible to profiling the
  // splash's own CSS in isolation.
  //
  // Fetching still starts immediately (prefetching into the query
  // cache costs nothing render-wise — it's just an IPC call resolving
  // in the background), so the data is already there the instant the
  // splash finishes; only the *mounting* of the actual grid/cards is
  // deferred until then.
  useEffect(() => {
    queryClient.prefetchQuery({ queryKey: gamesKey, queryFn: () => listGames() })
  }, [])

  return (
    <div
      className={cn(
        'relative flex h-screen flex-col overflow-hidden bg-bg',
        // Rounded card, border, and shadow belong to the floating
        // window only — maximized/fullscreen must sit square against
        // the screen edges (see use-window-maximized.ts). The window
        // itself is transparent (`transparent: true`), so this div is
        // what paints the visible rounded card.
        !fillsScreen && 'rounded-xl border border-border shadow-elevated',
      )}
    >
      <AmbientBackground paused={showSplash || isGateOpen} />
      <ResizeHandles />
      <TitleBar />

      <div className="flex min-h-0 flex-1">
        <Sidebar />

        <motion.main
          className="min-h-0 min-w-0 flex-1 flex flex-col"
          initial={{ opacity: 0, scale: 0.99 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.35 * speed, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* Page-level boundary: a crash inside any route (stats, hub,
            settings) shows a compact fallback while the rest of the
            shell — sidebar, details panel — keeps working. */}
          {!showSplash && (
            <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
              <div className="flex-1 min-h-0 overflow-hidden">
                <ErrorBoundary label="This page" compact>
                  <AnimatedOutlet />
                </ErrorBoundary>
              </div>
              <MiniPlayer />
            </div>
          )}
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
      <LaunchBoostModal />
      <ExpandedPlayer />

      {/* Nested features (notably the game details panel) portal their
          dialogs here. Keeping this host inside the rounded shell lets those
          dialogs use the whole app window without escaping its corners.
          Elevated to z-[150] so confirmation dialogs sit cleanly above
          the full-screen profile selection (z-[100]). */}
      <div id="modal-host" className="pointer-events-none absolute inset-0 z-[150]" />

      {showSplash && <StartupSplash onDone={() => setShowSplash(false)} />}

      <AnimatePresence>
        {showOnboarding && <OnboardingOverlay onDone={() => setOnboardingDismissed(true)} />}
      </AnimatePresence>
    </div>
  )
}
