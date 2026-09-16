import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useGames, usePromoteWishlistGame } from './use-games'
import { isGameUnreleased } from '../utils/format'

/**
 * Automatically promotes wishlisted games to the library once their
 * release date arrives, and displays a celebration toast in English.
 */
export function useAutoPromoteReleasedGames() {
  const { data: games } = useGames()
  const promoteWishlist = usePromoteWishlistGame()
  const promotedIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!games || games.length === 0) return

    for (const game of games) {
      if (!game.is_wishlist || game.is_installed || !game.release_date) continue

      // If still unreleased in the future, skip
      if (isGameUnreleased(game.release_date)) continue

      // Check if it was added while unreleased (or on launch day)
      const addedDay = game.added_at ? game.added_at.slice(0, 10) : ''
      const releaseDay = game.release_date.slice(0, 10)
      const wasAddedPreLaunch = !addedDay || !releaseDay || addedDay <= releaseDay

      if (wasAddedPreLaunch && !promotedIdsRef.current.has(game.id)) {
        promotedIdsRef.current.add(game.id)
        promoteWishlist.mutate(game.id, {
          onSuccess: () => {
            toast.success(`🎉 ${game.name} has been released and added to your library!`, {
              duration: 6000,
            })
          },
        })
      }
    }
  }, [games, promoteWishlist])
}
