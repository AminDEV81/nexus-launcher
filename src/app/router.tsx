import { createHashRouter } from 'react-router-dom'
import { Suspense } from 'react'
import { Gamepad2, History, Heart, HardDrive, EyeOff } from 'lucide-react'
import { AppShell } from '@/components/layout/app-shell'
import { SettingsPage } from '@/features/settings/pages/settings-page'
import { LibraryPage } from '@/features/library/pages/library-page'
import { CollectionsPage } from '@/features/collections/pages/collections-page'
import { CollectionDetailPage } from '@/features/collections/pages/collection-detail-page'
import { HubPage } from '@/features/hub/pages/hub-page'
import { HubGamePage } from '@/features/hub/pages/hub-game-page'
import { HubFeedPage } from '@/features/hub/pages/hub-feed-page'
import { WishlistPage } from '@/features/wishlist/pages/wishlist-page'
import { LibrarySkeleton } from '@/features/library/components/library-skeleton'
import { LazyStatsPage } from './lazy-stats-page'
import { LazyDownloadsPage } from './lazy-downloads-page'
import { LazySoundtrackPage } from './lazy-soundtrack-page'

/**
 * `createHashRouter` (not `createBrowserRouter`) because Tauri serves the
 * frontend from a local `tauri://` / `asset://` origin rather than a real
 * HTTP server with path-based routing support — hash routing avoids
 * needing server-side rewrites that don't exist here.
 *
 * `AppShell` is a layout route: every page renders inside it, below the
 * title bar and beside the sidebar. Routes below correspond 1:1 with
 * `components/layout/nav-items.ts`. The five library views (Library,
 * Recently Played, Favorites, Installed, Hidden) all share `LibraryPage`
 * — they're the same grid with a different `scope` filter, not five
 * separate implementations.
 */
export const router = createHashRouter([
  {
    element: <AppShell />,
    children: [
      {
        path: '/hub',
        element: <HubPage />,
      },
      {
        path: '/hub/browse/:feed',
        element: <HubFeedPage />,
      },
      {
        path: '/hub/:igdbId',
        element: <HubGamePage />,
      },
      {
        path: '/wishlist',
        element: <WishlistPage />,
      },
      {
        path: '/soundtrack',
        element: (
          <Suspense fallback={<LibrarySkeleton />}>
            <LazySoundtrackPage />
          </Suspense>
        ),
      },
      {
        path: '/',
        element: (
          <LibraryPage
            scope="all"
            title="Library"
            emptyIcon={Gamepad2}
            emptyTitle="Your library is empty"
            emptyDescription="Add a game manually or scan for the ones already installed on this PC."
            showEmptyActions
          />
        ),
      },
      {
        path: '/recently-played',
        element: (
          <LibraryPage
            scope="recent"
            title="Recently Played"
            emptyIcon={History}
            emptyTitle="Nothing played yet"
            emptyDescription="Games you launch will show up here, most recent first."
          />
        ),
      },
      {
        path: '/favorites',
        element: (
          <LibraryPage
            scope="favorites"
            title="Favorites"
            emptyIcon={Heart}
            emptyTitle="No favorites yet"
            emptyDescription="Click the heart on any game's cover to pin it here."
          />
        ),
      },
      {
        path: '/installed',
        element: (
          <LibraryPage
            scope="installed"
            title="Installed"
            emptyIcon={HardDrive}
            emptyTitle="No installed games"
            emptyDescription="Games detected as installed on this PC will show up here."
          />
        ),
      },
      {
        path: '/collections',
        element: <CollectionsPage />,
      },
      {
        path: '/collections/:collectionId',
        element: <CollectionDetailPage />,
      },
      {
        path: '/hidden',
        element: (
          <LibraryPage
            scope="hidden"
            title="Hidden"
            emptyIcon={EyeOff}
            emptyTitle="Nothing hidden"
            emptyDescription="Games you hide from your library will show up here."
          />
        ),
      },
      {
        path: '/stats',
        element: (
          <Suspense fallback={<LibrarySkeleton />}>
            <LazyStatsPage />
          </Suspense>
        ),
      },
      {
        path: '/settings',
        element: <SettingsPage />,
      },
      {
        path: '/downloads',
        element: (
          <Suspense fallback={<LibrarySkeleton />}>
            <LazyDownloadsPage />
          </Suspense>
        ),
      },
    ],
  },
])
