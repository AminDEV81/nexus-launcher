import type { Game, HubGame } from '@/types/models'

/**
 * Matching a hub entry against the library needs more than `igdb_id`:
 * games added manually (exe/shortcut/scan) have no IGDB identity at
 * all, so id-only matching would offer "Add to Library" for games the
 * user already owns. Names are compared normalized — IGDB decorates
 * titles with ™/®/© that local imports never have.
 */
export function normalizeGameName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[™®©]/g, '')
    .replace(/\s*\([^)]*\)/g, '') // strip (2005), (PC), etc.
    .replace(/\s*\[[^\]]*\]/g, '') // strip [v1.0], [GOG], etc.
    .replace(/[:\-–—_.]/g, ' ') // treat colons, hyphens and dots as spaces
    .replace(/\s+/g, ' ')
    .trim()
}

export type HubLibraryMatcher = (game: HubGame) => boolean

/** Wishlist games are deliberately NOT "in the library" — a wishlisted
 *  entry shows its own badge and button state on hub pages. */
export function buildHubLibraryMatcher(games: Game[] | undefined): HubLibraryMatcher {
  const ids = new Set<number>()
  const names = new Set<string>()
  for (const game of games ?? []) {
    if (game.is_wishlist) continue
    if (game.igdb_id !== null && game.igdb_id > 0) ids.add(game.igdb_id)
    names.add(normalizeGameName(game.name))
  }

  return (hubGame) =>
    (hubGame.igdb_id > 0 && ids.has(hubGame.igdb_id)) || names.has(normalizeGameName(hubGame.name))
}

export function buildHubWishlistMatcher(games: Game[] | undefined): HubLibraryMatcher {
  const ids = new Set<number>()
  const names = new Set<string>()
  for (const game of games ?? []) {
    if (!game.is_wishlist) continue
    if (game.igdb_id !== null && game.igdb_id > 0) ids.add(game.igdb_id)
    names.add(normalizeGameName(game.name))
  }

  return (hubGame) =>
    (hubGame.igdb_id > 0 && ids.has(hubGame.igdb_id)) || names.has(normalizeGameName(hubGame.name))
}

export function buildHubInstalledMatcher(games: Game[] | undefined): HubLibraryMatcher {
  const ids = new Set<number>()
  const names = new Set<string>()
  for (const game of games ?? []) {
    if (!game.is_installed) continue
    if (game.igdb_id !== null && game.igdb_id > 0) ids.add(game.igdb_id)
    names.add(normalizeGameName(game.name))
  }

  return (hubGame) =>
    (hubGame.igdb_id > 0 && ids.has(hubGame.igdb_id)) || names.has(normalizeGameName(hubGame.name))
}

/** The library entry a hub game corresponds to, if any — same matching
 *  rules as the matchers above, for pages that need the actual row
 *  (its `is_wishlist` flag decides which button state to show). */
export function findLibraryEntry(
  games: Game[] | undefined,
  hubGame: { igdb_id: number; name: string },
): Game | undefined {
  const normHub = normalizeGameName(hubGame.name)
  return (games ?? []).find(
    (game) =>
      (hubGame.igdb_id > 0 && game.igdb_id === hubGame.igdb_id) ||
      normalizeGameName(game.name) === normHub,
  )
}
