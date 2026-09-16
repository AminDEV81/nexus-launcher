/**
 * One stable color per IGDB genre name, so "RPG" reads as purple on
 * every game, every view, every session — like tag colors, but derived
 * from the genre itself since genres are IGDB-controlled, not
 * user-created. Hex values are mid-brightness 400/500-level tones that
 * stay readable as tinted chips over both dark and light themes.
 *
 * Genres IGDB adds or renames later aren't in the map — they fall back
 * to a deterministic hash of the name (never random), so an unmapped
 * genre still always shows the same color.
 */
const GENRE_COLORS: Record<string, string> = {
  Adventure: '#f59e0b',
  Arcade: '#fb923c',
  'Card & Board Game': '#2dd4bf',
  Fighting: '#ef4444',
  "Hack and slash/Beat 'em up": '#f87171',
  Indie: '#a78bfa',
  MOBA: '#38bdf8',
  Music: '#e879f9',
  Pinball: '#a3e635',
  Platform: '#60a5fa',
  'Point-and-click': '#fbbf24',
  Puzzle: '#facc15',
  'Quiz/Trivia': '#34d399',
  Racing: '#22d3ee',
  'Real Time Strategy (RTS)': '#4ade80',
  'Role-playing (RPG)': '#c084fc',
  Shooter: '#dc2626',
  Simulator: '#94a3b8',
  Sport: '#10b981',
  Strategy: '#818cf8',
  Tactical: '#6366f1',
  'Turn-based strategy (TBS)': '#8b5cf6',
  'Visual Novel': '#f472b6',
}

const FALLBACK_PALETTE = [
  '#60a5fa',
  '#f59e0b',
  '#34d399',
  '#f472b6',
  '#a78bfa',
  '#22d3ee',
  '#fb923c',
  '#4ade80',
] as const

export function genreColor(name: string): string {
  const known = GENRE_COLORS[name]
  if (known) return known

  let hash = 0
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) | 0
  }
  return FALLBACK_PALETTE[Math.abs(hash) % FALLBACK_PALETTE.length]
}
