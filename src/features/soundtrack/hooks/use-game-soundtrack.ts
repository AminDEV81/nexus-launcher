import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { soundtrackResolver } from '../services/soundtrack-resolver'
import type { GameIdentity, SoundtrackAlbumWithTracks } from '../types'

export function useGameSoundtrack(game?: GameIdentity | null) {
  return useQuery<SoundtrackAlbumWithTracks[]>({
    queryKey: ['soundtrack', 'game', game?.gameId, game?.title],
    queryFn: async () => {
      if (!game || !game.gameId || !game.title) return []
      return await soundtrackResolver.resolveGame(game)
    },
    enabled: Boolean(game?.gameId && game?.title),
    staleTime: 1000 * 60 * 30, // 30 minutes
    refetchOnWindowFocus: false,
  })
}

export function useRefreshGameSoundtrack(game?: GameIdentity | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      if (!game || !game.gameId || !game.title) return []
      return await soundtrackResolver.resolveGame(game, true)
    },
    onSuccess: (freshAlbums) => {
      if (game?.gameId) {
        queryClient.setQueryData(['soundtrack', 'game', game.gameId, game.title], freshAlbums)
        void queryClient.invalidateQueries({ queryKey: ['soundtrack', 'all-albums'] })
      }
    },
  })
}
