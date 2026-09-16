export const MAX_QUERY_LENGTH = 100
export const MAX_RESPONSE_BYTES = 5 * 1024 * 1024 // 5 MB

export function validateGameId(idStr: string): number | null {
  const id = parseInt(idStr, 10)
  if (isNaN(id) || id <= 0 || !/^\d+$/.test(idStr)) {
    return null
  }
  return id
}

export function validateSteamAppId(appIdStr: string): string | null {
  if (!/^\d{1,10}$/.test(appIdStr)) {
    return null
  }
  return appIdStr
}

export function canonicalizeQuery(q: string | null): string {
  if (!q) return ''
  return q.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, MAX_QUERY_LENGTH)
}

export function isAllowlistedPath(pathname: string): boolean {
  const allowedPrefixes = [
    '/api/v1/health',
    '/api/v1/games/feed/',
    '/api/v1/games/details/',
    '/api/v1/games/similar/',
    '/api/v1/games/search',
    '/api/v1/games/genres',
    '/api/v1/games/platforms',
    '/api/v1/artwork/options/',
    '/api/v1/artwork/grids/',
    '/api/v1/artwork/heroes/',
    '/api/v1/artwork/logos/',
  ]

  return allowedPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(prefix))
}
