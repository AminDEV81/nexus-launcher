import { buildCanonicalCacheUrl, resolveCorsOrigin } from '../security/validation'

export const TTL = {
  GAME_DETAILS: 3 * 86_400, // 3 days
  ARTWORK: 14 * 86_400, // 14 days
  RELEASES_FEED: 6 * 3600, // 6 hours
  COMING_SOON: 3 * 3600, // 3 hours
  NEW_RELEASES: 3600, // 1 hour
  TOP_RATED: 12 * 3600, // 12 hours
  SEARCH: 4 * 3600, // 4 hours
  GENRES_PLATFORMS: 7 * 86_400, // 7 days
}

export function buildCacheHeaders(
  ttlSeconds: number,
  swrSeconds = 86_400,
  requestOrigin?: string | null,
): HeadersInit {
  return {
    'Cache-Control': `public, max-age=${ttlSeconds}, stale-while-revalidate=${swrSeconds}`,
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': resolveCorsOrigin(requestOrigin),
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    Vary: 'Origin',
  }
}

const CACHE_VERSION = 'v8'

export async function matchEdgeCache(request: Request): Promise<Response | null> {
  try {
    const canonicalUrl = buildCanonicalCacheUrl(request.url)
    canonicalUrl.searchParams.set('_cv', CACHE_VERSION)
    const versionedRequest = new Request(canonicalUrl.toString(), { method: 'GET' })
    const cache = caches.default
    return (await cache.match(versionedRequest)) ?? null
  } catch {
    return null
  }
}

export async function putEdgeCache(request: Request, response: Response): Promise<void> {
  try {
    const canonicalUrl = buildCanonicalCacheUrl(request.url)
    canonicalUrl.searchParams.set('_cv', CACHE_VERSION)
    const versionedRequest = new Request(canonicalUrl.toString(), { method: 'GET' })
    const cache = caches.default
    await cache.put(versionedRequest, response.clone())
  } catch {
    // Ignore cache write errors in non-standard environments
  }
}
