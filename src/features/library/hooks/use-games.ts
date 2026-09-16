import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import * as gamesService from '@/services/games'
import * as metadataService from '@/services/metadata'
import { useProfileStore } from '@/store/profile-store'
import { useUiStore } from '@/store/ui-store'
import { useLaunchBoostStore } from '@/features/booster/store/launch-boost-store'
import type { Game } from '@/types/models'

export const gamesKey = ['games'] as const
export const profileGamesKey = (profileId?: string) =>
  profileId ? (['games', profileId] as const) : (['games'] as const)
export const gameKey = (id: string, profileId?: string) =>
  profileId ? (['games', profileId, id] as const) : (['games', id] as const)

export function useGames(profileId?: string) {
  const activeProfileId = useProfileStore((s) => s.activeProfile?.id)
  const targetId = profileId ?? activeProfileId

  return useQuery({
    queryKey: profileGamesKey(targetId),
    queryFn: () => gamesService.listGames(targetId),
  })
}

export function useGame(id: string | undefined, profileId?: string) {
  const activeProfileId = useProfileStore((s) => s.activeProfile?.id)
  const targetId = profileId ?? activeProfileId

  return useQuery({
    queryKey: gameKey(id ?? '', targetId),
    queryFn: () => gamesService.getGame(id as string, targetId),
    enabled: Boolean(id),
  })
}

export function useCreateGame() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: gamesService.createGame,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gamesKey })
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not add that game.')
    },
  })
}

/**
 * Covers both the Favorite toggle and the Hide toggle (Epic 7's card
 * context menu) — both are just partial updates to the same flags
 * payload, so one mutation with an optimistic update covers either.
 */
export function useUpdateGameFlags() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & gamesService.UpdateGameFlagsInput) =>
      gamesService.updateGameFlags(id, input),
    onSuccess: (updatedGame) => {
      // Patch the list cache synchronously instead of only invalidating
      // it — grid/list cards read from this array, and waiting on the
      // background refetch left a window where a just-toggled flag
      // (e.g. Live Cover enabled/disabled) still showed the old value.
      queryClient.setQueriesData<Game[]>({ queryKey: gamesKey }, (games) =>
        Array.isArray(games)
          ? games.map((game) => (game.id === updatedGame.id ? updatedGame : game))
          : games,
      )
      queryClient.setQueriesData<Game>({ queryKey: gamesKey }, (old) =>
        old && !Array.isArray(old) && old.id === updatedGame.id ? updatedGame : old,
      )
      queryClient.invalidateQueries({ queryKey: gamesKey })
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not update that game.')
    },
  })
}

/** Saves all local-install fields as one atomic update so the Installed
 * filter changes at the same instant as the path and size shown in UI. */
export function useUpdateGameInstallation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & gamesService.UpdateGameInstallationInput) =>
      gamesService.updateGameInstallation(id, input),
    onSuccess: (updatedGame) => {
      queryClient.setQueriesData<Game[]>({ queryKey: gamesKey }, (games) =>
        Array.isArray(games)
          ? games.map((game) => (game.id === updatedGame.id ? updatedGame : game))
          : games,
      )
      queryClient.setQueriesData<Game>({ queryKey: gamesKey }, (old) =>
        old && !Array.isArray(old) && old.id === updatedGame.id ? updatedGame : old,
      )
      queryClient.invalidateQueries({ queryKey: gamesKey })
      toast.success(
        updatedGame.is_installed ? 'Installation details saved.' : 'Game marked as not installed.',
      )
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not save installation details.')
    },
  })
}

export function useDeleteGame() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: gamesService.deleteGame,
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: gamesKey })
      const cached = queryClient.getQueryData<Game[]>(gamesKey)
      const targetGame = Array.isArray(cached) ? cached.find((g) => g.id === id) : null
      const isWishlist = Boolean(targetGame?.is_wishlist)

      // Guard against non-array queries (e.g. useGame stores a single Game object under ['games', profileId, id])
      queryClient.setQueriesData<Game[]>({ queryKey: gamesKey }, (games) =>
        Array.isArray(games) ? games.filter((game) => game.id !== id) : games,
      )
      queryClient.setQueriesData<Game[]>({ queryKey: ['collections'] }, (games) =>
        Array.isArray(games) ? games.filter((game) => game.id !== id) : games,
      )

      return { isWishlist }
    },
    onError: (error) => {
      queryClient.invalidateQueries({ queryKey: gamesKey })
      queryClient.invalidateQueries({ queryKey: ['collections'] })
      toast.error(error instanceof Error ? error.message : 'Could not remove that game.')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: gamesKey })
      queryClient.invalidateQueries({ queryKey: ['collections'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
    },
    onSuccess: (_data, id, context) => {
      // Clear selection if this game was selected
      if (useUiStore.getState().selectedGameId === id) {
        useUiStore.getState().selectGame(null)
      }
      queryClient.removeQueries({ queryKey: ['games', id] })
      toast(context?.isWishlist ? 'Removed from your wishlist.' : 'Removed from your library.')
    },
  })
}

/** Wishlist → library promotion from the context menu: metadata and
 *  artwork all carry over, only the wishlist flag clears. */
export function usePromoteWishlistGame() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: gamesService.promoteWishlistGame,
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: gamesKey })
      queryClient.setQueriesData<Game[]>({ queryKey: gamesKey }, (games) =>
        Array.isArray(games)
          ? games.map((game) => (game.id === id ? { ...game, is_wishlist: false } : game))
          : games,
      )
    },
    onError: (error) => {
      queryClient.invalidateQueries({ queryKey: gamesKey })
      toast.error(error instanceof Error ? error.message : 'Could not move that game.')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: gamesKey })
    },
    onSuccess: (game) => {
      toast(`${game.name} moved to your library.`)
    },
  })
}

export function useGameScreenshots(id: string | undefined) {
  return useQuery({
    queryKey: ['games', id, 'screenshots'],
    queryFn: () => gamesService.getGameScreenshots(id as string),
    enabled: Boolean(id),
    staleTime: 5 * 60_000,
  })
}

export function useUpdateLaunchArguments() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, launchArguments }: { id: string; launchArguments: string | null }) =>
      gamesService.updateLaunchArguments(id, launchArguments),
    onSuccess: (updatedGame) => {
      queryClient.setQueriesData<Game>({ queryKey: gamesKey }, (old) =>
        old && old.id === updatedGame.id ? updatedGame : old,
      )
      queryClient.invalidateQueries({ queryKey: gamesKey })
      toast.success('Launch options saved.')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not save launch options.')
    },
  })
}

export function useUpdatePreLaunchCommand() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, preLaunchCommand }: { id: string; preLaunchCommand: string | null }) =>
      gamesService.updatePreLaunchCommand(id, preLaunchCommand),
    onSuccess: (updatedGame) => {
      queryClient.setQueriesData<Game>({ queryKey: gamesKey }, (old) =>
        old && old.id === updatedGame.id ? updatedGame : old,
      )
      queryClient.invalidateQueries({ queryKey: gamesKey })
      toast.success('Pre-launch command saved.')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not save that command.')
    },
  })
}

export function useUpdatePostLaunchCommand() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, postLaunchCommand }: { id: string; postLaunchCommand: string | null }) =>
      gamesService.updatePostLaunchCommand(id, postLaunchCommand),
    onSuccess: (updatedGame) => {
      queryClient.setQueriesData<Game>({ queryKey: gamesKey }, (old) =>
        old && old.id === updatedGame.id ? updatedGame : old,
      )
      queryClient.invalidateQueries({ queryKey: gamesKey })
      toast.success('Post-exit command saved.')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not save that command.')
    },
  })
}

/**
 * Starts the game. Doesn't touch React Query or do any optimistic
 * update — the running/elapsed state lives entirely in `useLaunchStore`,
 * driven by the `game-launched`/`playtime-updated`/`game-exited` events
 * (see `use-playtime-tracking.ts`), since this call resolves as soon as
 * the process is *started*, well before we know it actually stayed up.
 */
export function useLaunchGame() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (gameId: string) => {
      const cachedGames = queryClient.getQueryData<Game[]>(gamesKey)
      const game = cachedGames?.find((g) => g.id === gameId)
      if (game) {
        useLaunchBoostStore.getState().open({
          id: game.id,
          name: game.name,
          cover_path: game.cover_path,
          developer: game.developer,
          genres: game.genres,
        })
      } else {
        useLaunchBoostStore.getState().open({
          id: gameId,
          name: 'Game',
          cover_path: null,
        })
      }
      return gamesService.launchGame(gameId)
    },
    onError: (error) => {
      useLaunchBoostStore.getState().close()
      toast.error(error instanceof Error ? error.message : 'Could not launch that game.')
    },
  })
}

/** See `services/games.ts#stopGame` — this doesn't optimistically clear
 *  `useLaunchStore`'s running state either; the tracker's own
 *  `game-exited` event does that once the process is actually gone, so
 *  the badge doesn't flicker back to "running" if the kill happens to
 *  race a slightly-stale poll tick. */
export function useStopGame() {
  return useMutation({
    mutationFn: gamesService.stopGame,
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not close that game.')
    },
  })
}

export function useSetGameUserRating() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, rating }: { id: string; rating: number | null }) =>
      gamesService.setGameUserRating(id, rating),
    onMutate: async ({ id, rating }) => {
      await queryClient.cancelQueries({ queryKey: gamesKey })
      queryClient.setQueriesData<Game[]>({ queryKey: gamesKey }, (games) =>
        Array.isArray(games)
          ? games.map((game) => (game.id === id ? { ...game, user_rating: rating } : game))
          : games,
      )
      queryClient.setQueryData<Game>(['games', id], (game) =>
        game ? { ...game, user_rating: rating } : game,
      )
    },
    onError: (error) => {
      queryClient.invalidateQueries({ queryKey: gamesKey })
      toast.error(error instanceof Error ? error.message : 'Could not save rating.')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: gamesKey })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
    },
  })
}

export function useSyncGameMetadata() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (gameId: string) => metadataService.syncGameMetadata(gameId),
    onSuccess: (updatedGame) => {
      queryClient.setQueriesData<Game[]>({ queryKey: gamesKey }, (old) =>
        Array.isArray(old) ? old.map((g) => (g.id === updatedGame.id ? updatedGame : g)) : old,
      )
      queryClient.setQueryData(['games', updatedGame.id], updatedGame)
      queryClient.invalidateQueries({ queryKey: gamesKey })
      toast.success(`Metadata updated for ${updatedGame.name}`)
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to sync metadata from IGDB.')
    },
  })
}

export function useSyncWishlistMetadata() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => metadataService.syncWishlistMetadata(),
    onSuccess: (updatedGames) => {
      queryClient.invalidateQueries({ queryKey: gamesKey })
      toast.success(`Synced ${updatedGames.length} games with IGDB`)
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to sync wishlist metadata.')
    },
  })
}
