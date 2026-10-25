import { useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'
import { queryClient } from '@/app/query-client'
import { gamesKey } from './use-games'

/**
 * Listens for backend `metadata-updated` and `wishlist-metadata-synced` events
 * and refreshes the games query cache without leaking listeners on fast remounts.
 */
export function useMetadataUpdatedListener() {
  useEffect(() => {
    let disposed = false
    let unlistenMeta: (() => void) | null = null
    let unlistenWishlist: (() => void) | null = null

    listen<string | { id?: string }>('metadata-updated', () => {
      if (!disposed) {
        void queryClient.invalidateQueries({ queryKey: gamesKey })
      }
    })
      .then((fn) => {
        if (disposed) fn()
        else unlistenMeta = fn
      })
      .catch(() => {})

    listen('wishlist-metadata-synced', () => {
      if (!disposed) {
        void queryClient.invalidateQueries({ queryKey: gamesKey })
      }
    })
      .then((fn) => {
        if (disposed) fn()
        else unlistenWishlist = fn
      })
      .catch(() => {})

    return () => {
      disposed = true
      if (unlistenMeta) unlistenMeta()
      if (unlistenWishlist) unlistenWishlist()
    }
  }, [])
}
