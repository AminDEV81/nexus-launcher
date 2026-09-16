import { call } from './tauri'
import type {
  StatsSummary,
  GenrePlaytime,
  WeeklyPlaytime,
  DailyActivity,
  RecentSession,
} from '@/types/models'

function toProfileArgs(profileId?: string) {
  return typeof profileId === 'string' ? { profileId } : {}
}

export function getStatsSummary(profileId?: string) {
  return call<StatsSummary>('get_stats_summary', toProfileArgs(profileId))
}

export function getPlaytimeByGenre(profileId?: string) {
  return call<GenrePlaytime[]>('get_playtime_by_genre', toProfileArgs(profileId))
}

export function getPlaytimeTimeline(profileId?: string) {
  return call<WeeklyPlaytime[]>('get_playtime_timeline', toProfileArgs(profileId))
}

export function getDailyActivity(profileId?: string) {
  return call<DailyActivity[]>('get_daily_activity', toProfileArgs(profileId))
}

export function getRecentSessions(profileId?: string) {
  return call<RecentSession[]>('get_recent_sessions', toProfileArgs(profileId))
}
