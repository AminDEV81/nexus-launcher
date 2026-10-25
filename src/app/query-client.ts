import { QueryClient } from '@tanstack/react-query'

/**
 * Single shared QueryClient for the whole app.
 *
 * CRITICAL FOR TAURI DESKTOP:
 * `networkMode: 'always'` is set on both `queries` and `mutations` because
 * 90% of queries and mutations in Nexus Launcher invoke local Rust/SQLite
 * IPC commands (`get_game`, `list_games`, `get_game_screenshots`, `list_tags`,
 * `get_game_save_details`, etc.), NOT remote HTTP servers.
 * Without `networkMode: 'always'`, disconnecting the internet while inside
 * the app causes `@tanstack/react-query` to pause all queries/mutations,
 * preventing the right-hand GameDetailsPanel from loading!
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      networkMode: 'always',
    },
    mutations: {
      retry: 0,
      networkMode: 'always',
    },
  },
})
