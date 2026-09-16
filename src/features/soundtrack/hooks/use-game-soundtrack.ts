import { useQuery } from '@tanstack/react-query'
import { soundtrackResolver } from '../services/soundtrack-resolver'
import type { GameIdentity, SoundtrackAlbumWithTracks } from '../types'

export function useGameSoundtrack(game?: GameIdentity | null) {
  return useQuery<SoundtrackAlbumWithTracks[]>({
    queryKey: ['soundtrack', 'game', game?.gameId],
    queryFn: async () => {
      if (!game || !game.gameId || !game.title) return []
      return await soundtrackResolver.resolveGame(game)
    },
    enabled: Boolean(game?.gameId && game?.title),
    staleTime: 1000 * 60 * 30, // 30 minutes
    refetchOnWindowFocus: false,
  })
}
