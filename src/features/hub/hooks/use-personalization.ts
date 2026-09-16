import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useGames } from '@/features/library/hooks/use-games'
import { useRecentSessions } from '@/features/stats/hooks/use-stats'
import { getHubSimilarGames } from '@/services/hub'
import {
  calculateUserTasteProfile,
  calculateGameAffinity,
  rankPersonalizedSimilarGames,
  type UserTasteProfile,
  type GameAffinityResult,
  type SimilarGameRanking,
} from '../utils/personalization'
import type { HubGame, HubGameDetails } from '@/types/models'

/**
 * Returns the derived taste profile computed locally from the user's library and play sessions.
 * Automatically updates when games or playtime history changes.
 */
export function useUserTasteProfile(): UserTasteProfile {
  const { data: games = [] } = useGames()
  const { data: recentSessions = [] } = useRecentSessions()

  return useMemo(() => {
    return calculateUserTasteProfile(games, recentSessions)
  }, [games, recentSessions])
}

/**
 * Returns personal match affinity, Nexus Match %, and defensible explanation reason
 * for any Hub Game.
 */
export function useGameAffinity(game?: HubGame | HubGameDetails | null): GameAffinityResult | null {
  const profile = useUserTasteProfile()

  return useMemo(() => {
    if (!game) return null
    return calculateGameAffinity(game, profile)
  }, [game, profile])
}

/**
 * Fetches raw similar games from IGDB for a given game.
 * Cached for 30 minutes.
 */
export function useHubSimilarGames(igdbId?: number | null) {
  return useQuery({
    queryKey: ['hub', 'similar-games', igdbId],
    queryFn: () => getHubSimilarGames(igdbId!),
    enabled: Boolean(igdbId && igdbId > 0),
    staleTime: 1000 * 60 * 30, // 30 minutes
  })
}

/**
 * Fetches and ranks Similar Games using the Fusion Layer:
 * Deterministic Game Similarity (60%) + User Taste Affinity (40%).
 * Filters out the current game, duplicate IDs, and prioritizes new unowned discoveries.
 */
export function usePersonalizedSimilarGames(targetGame?: HubGame | HubGameDetails | null): {
  data: SimilarGameRanking[]
  isPending: boolean
  error: Error | null
} {
  const profile = useUserTasteProfile()
  const { data: libraryGames = [] } = useGames()
  const query = useHubSimilarGames(targetGame?.igdb_id)

  const libraryIgdbIds = useMemo(() => {
    const ids = new Set<number>()
    for (const g of libraryGames) {
      if (g.igdb_id) ids.add(g.igdb_id)
    }
    return ids
  }, [libraryGames])

  const rankedData = useMemo(() => {
    if (!targetGame || !query.data) return []
    return rankPersonalizedSimilarGames(targetGame, query.data, profile, libraryIgdbIds)
  }, [targetGame, query.data, profile, libraryIgdbIds])

  return {
    data: rankedData,
    isPending: query.isPending,
    error: (query.error as Error) ?? null,
  }
}
