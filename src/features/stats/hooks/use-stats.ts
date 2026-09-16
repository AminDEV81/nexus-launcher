import { useQuery } from '@tanstack/react-query'
import * as statsService from '@/services/stats'
import { useProfileStore } from '@/store/profile-store'

/**
 * Three separate queries (rather than one combined "get everything for
 * the stats page" command) since each backs a different, independently
 * cacheable part of the page — the summary cards, the genre bar chart,
 * and the weekly line chart all have the same staleness needs as each
 * other and as `useGames`, so splitting them out lets React Query dedupe
 * and invalidate them the same way it already does for everything else,
 * rather than inventing a bespoke one-off shape just for this page.
 *
 * Each query scopes by `profileId` (defaulting to the current active profile)
 * so profile switches immediately fetch that profile's telemetry.
 */
export function useStatsSummary(profileId?: string) {
  const activeProfileId = useProfileStore((s) => s.activeProfile?.id)
  const targetId = profileId ?? activeProfileId

  return useQuery({
    queryKey: ['stats', 'summary', targetId],
    queryFn: () => statsService.getStatsSummary(targetId),
    enabled: Boolean(targetId),
  })
}

export function usePlaytimeByGenre(profileId?: string) {
  const activeProfileId = useProfileStore((s) => s.activeProfile?.id)
  const targetId = profileId ?? activeProfileId

  return useQuery({
    queryKey: ['stats', 'genre', targetId],
    queryFn: () => statsService.getPlaytimeByGenre(targetId),
    enabled: Boolean(targetId),
  })
}

export function usePlaytimeTimeline(profileId?: string) {
  const activeProfileId = useProfileStore((s) => s.activeProfile?.id)
  const targetId = profileId ?? activeProfileId

  return useQuery({
    queryKey: ['stats', 'timeline', targetId],
    queryFn: () => statsService.getPlaytimeTimeline(targetId),
    enabled: Boolean(targetId),
  })
}

export function useDailyActivity(profileId?: string) {
  const activeProfileId = useProfileStore((s) => s.activeProfile?.id)
  const targetId = profileId ?? activeProfileId

  return useQuery({
    queryKey: ['stats', 'daily-activity', targetId],
    queryFn: () => statsService.getDailyActivity(targetId),
    enabled: Boolean(targetId),
  })
}

export function useRecentSessions(profileId?: string) {
  const activeProfileId = useProfileStore((s) => s.activeProfile?.id)
  const targetId = profileId ?? activeProfileId

  return useQuery({
    queryKey: ['stats', 'recent-sessions', targetId],
    queryFn: () => statsService.getRecentSessions(targetId),
    enabled: Boolean(targetId),
  })
}
