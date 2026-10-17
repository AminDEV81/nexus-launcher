export interface GameTypeInfo {
  label: string
  bg: string
  badgeBg: string
}

export function getGameTypeInfo(gameType?: number | null): GameTypeInfo | null {
  if (gameType === null || gameType === undefined) return null

  switch (gameType) {
    case 8:
      return {
        label: 'Remake',
        bg: 'bg-purple-600',
        badgeBg: 'bg-purple-500/20 text-purple-300 border border-purple-500/30',
      }
    case 9:
      return {
        label: 'Remaster',
        bg: 'bg-sky-600',
        badgeBg: 'bg-sky-500/20 text-sky-300 border border-sky-500/30',
      }
    case 10:
      return {
        label: 'Expanded',
        bg: 'bg-amber-600',
        badgeBg: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
      }
    case 4:
      return {
        label: 'Standalone',
        bg: 'bg-indigo-600',
        badgeBg: 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30',
      }
    case 2:
      return {
        label: 'Expansion',
        bg: 'bg-fuchsia-600',
        badgeBg: 'bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30',
      }
    case 3:
      return {
        label: 'Bundle',
        bg: 'bg-teal-600',
        badgeBg: 'bg-teal-500/20 text-teal-300 border border-teal-500/30',
      }
    default:
      return null
  }
}
