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

export function clampOffset(raw: string | null, maxOffset = 1000): number {
  if (!raw) return 0
  const parsed = parseInt(raw, 10)
  if (isNaN(parsed) || parsed < 0) return 0
  return Math.min(maxOffset, parsed)
}

const ALLOWED_QUERY_PARAMS = new Set([
  'offset',
  'genres',
  'q',
  'genre',
  'platform',
  'release',
  'min_rating',
  'sort',
  'game_category',
  'game_mode',
  'app_id',
  'name',
])

export function buildCanonicalCacheUrl(requestUrl: string): URL {
  const url = new URL(requestUrl)
  const kept: [string, string][] = []
  for (const [k, v] of url.searchParams.entries()) {
    if (ALLOWED_QUERY_PARAMS.has(k)) {
      if (k === 'offset') {
        kept.push([k, String(clampOffset(v))])
      } else if (k === 'q' || k === 'name') {
        kept.push([k, canonicalizeQuery(v)])
      } else {
        kept.push([k, v.trim().slice(0, 120)])
      }
    }
  }
  kept.sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])))
  url.search = ''
  for (const [k, v] of kept) {
    url.searchParams.append(k, v)
  }
  return url
}

const ALLOWED_CORS_ORIGINS = new Set([
  'tauri://localhost',
  'http://tauri.localhost',
  'https://tauri.localhost',
  'http://localhost:1420',
  'http://127.0.0.1:1420',
])

export function resolveCorsOrigin(requestOrigin?: string | null): string {
  if (!requestOrigin) return 'tauri://localhost'
  if (ALLOWED_CORS_ORIGINS.has(requestOrigin)) return requestOrigin
  return 'tauri://localhost'
}
