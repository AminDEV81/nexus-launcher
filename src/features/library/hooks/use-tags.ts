import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import * as tagsService from '@/services/tags'
import { gamesKey } from './use-games'

const tagsKey = ['tags'] as const

export function useTags() {
  return useQuery({
    queryKey: tagsKey,
    queryFn: tagsService.listTags,
  })
}

/** Tag CRUD is immediate (it's global library data, not per-game state);
 *  membership changes go through `useSetGameTags`' buffered Save instead. */
export function useCreateTag() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ name, color }: { name: string; color: string | null }) =>
      tagsService.createTag(name, color),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tagsKey })
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not create that tag.')
    },
  })
}

export function useUpdateTag() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, name, color }: { id: string; name: string; color: string }) =>
      tagsService.updateTag(id, name, color),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tagsKey })
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not update that tag.')
    },
  })
}

export function useDeleteTag() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: tagsService.deleteTag,
    onSuccess: () => {
      // Games embed tag_ids in their rows — removing a tag changes them too.
      queryClient.invalidateQueries({ queryKey: tagsKey })
      queryClient.invalidateQueries({ queryKey: gamesKey })
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not delete that tag.')
    },
  })
}

export function useSetGameTags() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ gameId, tagIds }: { gameId: string; tagIds: string[] }) =>
      tagsService.setGameTags(gameId, tagIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gamesKey })
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not update tags.')
    },
  })
}
