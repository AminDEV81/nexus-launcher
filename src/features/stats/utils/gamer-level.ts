import type { RecentSession } from '@/types/models'
import { parseStoredUtcDate } from '@/features/library/utils/format'

export interface GamerLevelInfo {
  level: number
  rankTitle: string
  currentXp: number
  xpForNextLevel: number
  progressPercent: number
  totalHours: number
}

export interface TimeOfDayBucket {
  id: 'morning' | 'afternoon' | 'evening' | 'night'
  label: string
  timeRange: string
  hours: number
  percentage: number
  description: string
}

export interface CircadianHabits {
  buckets: TimeOfDayBucket[]
  dominantPersona: {
    title: string
    tag: string
    description: string
    icon: 'Moon' | 'Flame' | 'Sun' | 'Sunrise' | 'Compass'
  }
}

/**
 * Calculates gamer level and rank based on total playtime seconds.
 * 1 XP = 1 minute of playtime.
 * Progressive leveling curve: earlier levels come quickly to reward initial play,
 * scaling progressively into higher veteran tiers.
 */
export function calculateGamerLevel(totalSeconds: number): GamerLevelInfo {
  const totalHours = Math.round((totalSeconds / 3600) * 10) / 10
  const totalMinutes = Math.max(0, Math.floor(totalSeconds / 60))

  let level = 1
  let prevThreshold = 0
  let nextThreshold = 300 // 5 hours for level 2

  while (totalMinutes >= nextThreshold && level < 50) {
    level += 1
    prevThreshold = nextThreshold
    // Smooth quadratic progression
    const step = Math.round(300 + Math.pow(level, 1.4) * 85)
    nextThreshold = prevThreshold + step
  }

  const currentLevelXp = totalMinutes - prevThreshold
  const xpNeeded = Math.max(1, nextThreshold - prevThreshold)
  const progressPercent = Math.min(100, Math.max(0, Math.round((currentLevelXp / xpNeeded) * 100)))

  return {
    level,
    rankTitle: getRankTitle(level),
    currentXp: currentLevelXp,
    xpForNextLevel: xpNeeded,
    progressPercent,
    totalHours,
  }
}

function getRankTitle(level: number): string {
  if (level >= 50) return 'Nexus Legend'
  if (level >= 40) return 'Grandmaster'
  if (level >= 30) return 'Elite Specialist'
  if (level >= 20) return 'Combat Veteran'
  if (level >= 15) return 'Shadow Mercenary'
  if (level >= 10) return 'Vanguard Raider'
  if (level >= 5) return 'Cyber Explorer'
  return 'Novice Wanderer'
}

/**
 * Categorizes sessions into 4 circadian time periods:
 * - Morning: 06:00 – 11:59
 * - Afternoon: 12:00 – 17:59
 * - Evening: 18:00 – 23:59
 * - Night: 00:00 – 05:59
 */
export function calculateCircadianHabits(sessions: RecentSession[]): CircadianHabits {
  let morningSec = 0
  let afternoonSec = 0
  let eveningSec = 0
  let nightSec = 0

  for (const session of sessions) {
    const duration = session.duration_seconds ?? 600
    const date = parseStoredUtcDate(session.started_at)
    if (!date) continue

    const hour = date.getHours()
    if (hour >= 6 && hour < 12) {
      morningSec += duration
    } else if (hour >= 12 && hour < 18) {
      afternoonSec += duration
    } else if (hour >= 18 && hour < 24) {
      eveningSec += duration
    } else {
      nightSec += duration
    }
  }

  const totalSec = morningSec + afternoonSec + eveningSec + nightSec || 1

  const buckets: TimeOfDayBucket[] = [
    {
      id: 'morning',
      label: 'Early Morning',
      timeRange: '06:00 – 12:00',
      hours: Math.round((morningSec / 3600) * 10) / 10,
      percentage: Math.round((morningSec / totalSec) * 100),
      description: 'Breakfast gaming & morning focus',
    },
    {
      id: 'afternoon',
      label: 'Daytime',
      timeRange: '12:00 – 18:00',
      hours: Math.round((afternoonSec / 3600) * 10) / 10,
      percentage: Math.round((afternoonSec / totalSec) * 100),
      description: 'Midday breaks & afternoon sessions',
    },
    {
      id: 'evening',
      label: 'Prime Evening',
      timeRange: '18:00 – 00:00',
      hours: Math.round((eveningSec / 3600) * 10) / 10,
      percentage: Math.round((eveningSec / totalSec) * 100),
      description: 'Peak downtime & evening campaigns',
    },
    {
      id: 'night',
      label: 'Late Night',
      timeRange: '00:00 – 06:00',
      hours: Math.round((nightSec / 3600) * 10) / 10,
      percentage: Math.round((nightSec / totalSec) * 100),
      description: 'Quiet hours & midnight raids',
    },
  ]

  const sorted = [...buckets].sort((a, b) => b.hours - a.hours)
  const top = sorted[0]

  let persona: CircadianHabits['dominantPersona'] = {
    title: 'Balanced Adventurer',
    tag: 'Adaptable',
    description: 'You spread your gaming evenly throughout all hours of the day.',
    icon: 'Compass',
  }

  if (top && top.hours > 0) {
    if (top.id === 'night' || nightSec / totalSec >= 0.3) {
      persona = {
        title: 'Midnight Phantom',
        tag: 'Night Owl',
        description: 'You thrive in the stillness of the night when the world is asleep.',
        icon: 'Moon',
      }
    } else if (top.id === 'evening') {
      persona = {
        title: 'Prime-Time Battler',
        tag: 'Evening Warrior',
        description: 'Your favorite hours are after sunset for maximum gaming immersion.',
        icon: 'Flame',
      }
    } else if (top.id === 'afternoon') {
      persona = {
        title: 'Daylight Raider',
        tag: 'Midday Gamer',
        description: 'You make the most of your afternoons to push game campaigns forward.',
        icon: 'Sun',
      }
    } else if (top.id === 'morning') {
      persona = {
        title: 'Dawn Seeker',
        tag: 'Early Bird',
        description: 'You enjoy early morning gaming sessions with maximum sharpness.',
        icon: 'Sunrise',
      }
    }
  }

  return { buckets, dominantPersona: persona }
}
