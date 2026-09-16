import { useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'
import { useQueryClient } from '@tanstack/react-query'

/**
 * Epic 6's metadata pipeline runs entirely in the background — the
 * command that adds a game returns immediately, and description/cover/
 * banner show up later once IGDB (and SteamGridDB, if configured)
 * respond. The Rust side emits `metadata-updated` with the game's id
 * once it's done; this just invalidates that game so React Query
 * refetches it and the new artwork/details appear without the user
 * having to do anything.
 */
export function useMetadataUpdatedListener() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const unlisten = listen<string>('metadata-updated', (event) => {
      const gameId = event.payload
      queryClient.invalidateQueries({ queryKey: ['games'] })
      queryClient.invalidateQueries({ queryKey: ['games', gameId] })
    })

    return () => {
      unlisten.then((fn) => fn())
    }
  }, [queryClient])
}
