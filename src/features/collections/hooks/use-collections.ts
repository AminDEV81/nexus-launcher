import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import * as collectionsService from '@/services/collections'

import { useProfileStore } from '@/store/profile-store'

const collectionsKey = ['collections'] as const
const collectionsPreviewKey = ['collections', 'previews'] as const
export const collectionGamesKey = (collectionId: string, profileId?: string) =>
  profileId
    ? (['collections', collectionId, 'games', profileId] as const)
    : (['collections', collectionId, 'games'] as const)
const collectionMembershipKey = (gameId: string) => ['collections', 'membership', gameId] as const

export function useCollections() {
  return useQuery({
    queryKey: collectionsKey,
    queryFn: collectionsService.listCollections,
  })
}

/** Backs `/collections` — each card's mosaic + count in one round trip. */
export function useCollectionsWithPreviews() {
  return useQuery({
    queryKey: collectionsPreviewKey,
    queryFn: collectionsService.listCollectionsWithPreviews,
  })
}

export function useGamesInCollection(collectionId: string | undefined, profileId?: string) {
  const activeProfileId = useProfileStore((s) => s.activeProfile?.id)
  const targetId = profileId ?? activeProfileId
  return useQuery({
    queryKey: collectionGamesKey(collectionId ?? '', targetId),
    queryFn: () => collectionsService.listGamesInCollection(collectionId as string, targetId),
    enabled: Boolean(collectionId),
  })
}

/** Which collections a game is already in — for the "Add to Collection"
 *  picker's checkboxes. Only fetched while that picker is actually open
 *  (`enabled`), since every other consumer of collection data doesn't
 *  need this per-game breakdown. */
export function useCollectionIdsForGame(gameId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: collectionMembershipKey(gameId ?? ''),
    queryFn: () => collectionsService.listCollectionIdsForGame(gameId as string),
    enabled: Boolean(gameId) && enabled,
  })
}

export function useCreateCollection() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: collectionsService.createCollection,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: collectionsKey })
      queryClient.invalidateQueries({ queryKey: collectionsPreviewKey })
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not create that collection.')
    },
  })
}

export function useDeleteCollection() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: collectionsService.deleteCollection,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: collectionsKey })
      queryClient.invalidateQueries({ queryKey: collectionsPreviewKey })
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not delete that collection.')
    },
  })
}

export function useAddGameToCollection() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ collectionId, gameId }: { collectionId: string; gameId: string }) =>
      collectionsService.addGameToCollection(collectionId, gameId),
    onSuccess: (_data, { collectionId, gameId }) => {
      queryClient.invalidateQueries({ queryKey: collectionGamesKey(collectionId) })
      queryClient.invalidateQueries({ queryKey: collectionsPreviewKey })
      queryClient.invalidateQueries({ queryKey: collectionMembershipKey(gameId) })
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : 'Could not add that game to the collection.',
      )
    },
  })
}

export function useRemoveGameFromCollection() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ collectionId, gameId }: { collectionId: string; gameId: string }) =>
      collectionsService.removeGameFromCollection(collectionId, gameId),
    onSuccess: (_data, { collectionId, gameId }) => {
      queryClient.invalidateQueries({ queryKey: collectionGamesKey(collectionId) })
      queryClient.invalidateQueries({ queryKey: collectionsPreviewKey })
      queryClient.invalidateQueries({ queryKey: collectionMembershipKey(gameId) })
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not remove that game.')
    },
  })
}
