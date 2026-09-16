export type CriticScoreSource = 'metacritic' | 'igdb'

export interface ScoreTone {
  tone: 'positive' | 'mixed' | 'negative' | 'neutral'
  label: string
  color: string
  bg: string
  text: string
  border: string
  ring: string
}

/**
 * Standard Metacritic score tiers (0–100 scale).
 * 75–100: positive (green)
 * 50–74: mixed (yellow/amber)
 * 0–49: negative (red)
 */
export function getMetacriticTone(score: number | null | undefined): ScoreTone {
  if (score === null || score === undefined) {
    return {
      tone: 'neutral',
      label: 'Not Reviewed',
      color: '#6b7280',
      bg: 'bg-neutral-500/15',
      text: 'text-neutral-400',
      border: 'border-neutral-500/30',
      ring: 'ring-neutral-500/20',
    }
  }

  const rounded = Math.round(score)

  if (rounded >= 75) {
    return {
      tone: 'positive',
      label: rounded >= 90 ? 'Universal Acclaim' : 'Generally Favorable',
      color: '#3e9b3e',
      bg: 'bg-[#3e9b3e]',
      text: 'text-emerald-300',
      border: 'border-[#3e9b3e]/40',
      ring: 'ring-[#3e9b3e]/30',
    }
  }

  if (rounded >= 50) {
    return {
      tone: 'mixed',
      label: 'Mixed or Average',
      color: '#c9a618',
      bg: 'bg-[#c9a618]',
      text: 'text-amber-300',
      border: 'border-[#c9a618]/40',
      ring: 'ring-[#c9a618]/30',
    }
  }

  return {
    tone: 'negative',
    label: 'Generally Unfavorable',
    color: '#cc3d3d',
    bg: 'bg-[#cc3d3d]',
    text: 'text-rose-300',
    border: 'border-[#cc3d3d]/40',
    ring: 'ring-[#cc3d3d]/30',
  }
}

/**
 * IGDB aggregated critic score (0–100 scale).
 * Displayed with explicit "IGDB Critics" labeling so it is never
 * confused with or misrepresented as Metacritic.
 */
export function getIgdbTone(rating: number | null | undefined): ScoreTone {
  if (rating === null || rating === undefined) {
    return {
      tone: 'neutral',
      label: 'Unrated',
      color: '#6b7280',
      bg: 'bg-neutral-500/15',
      text: 'text-neutral-400',
      border: 'border-neutral-500/30',
      ring: 'ring-neutral-500/20',
    }
  }

  const rounded = Math.round(rating)

  if (rounded >= 75) {
    return {
      tone: 'positive',
      label: rounded >= 90 ? 'Universal Praise' : 'Highly Recommended',
      color: '#38bdf8',
      bg: 'bg-sky-500/20',
      text: 'text-sky-300',
      border: 'border-sky-500/30',
      ring: 'ring-sky-500/20',
    }
  }

  if (rounded >= 50) {
    return {
      tone: 'mixed',
      label: 'Mixed Reviews',
      color: '#f59e0b',
      bg: 'bg-amber-500/20',
      text: 'text-amber-300',
      border: 'border-amber-500/30',
      ring: 'ring-amber-500/20',
    }
  }

  return {
    tone: 'negative',
    label: 'Mediocre',
    color: '#f43f5e',
    bg: 'bg-rose-500/20',
    text: 'text-rose-300',
    border: 'border-rose-500/30',
    ring: 'ring-rose-500/20',
  }
}
