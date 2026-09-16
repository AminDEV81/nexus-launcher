import type { Env, ArtworkOption } from './types'
import { isAllowlistedPath, canonicalizeQuery, validateGameId } from './security/validation'
import { checkRateLimit } from './security/rate-limit'
import { deduplicate } from './cache/deduplication'
import { matchEdgeCache, putEdgeCache, TTL } from './cache/edge-cache'
import { createSuccessResponse, createErrorResponse } from './normalization'
import * as igdb from './providers/igdb'
import * as sgdb from './providers/steamgrid'
import * as steam from './providers/steam'

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const pathname = url.pathname

  // Handle CORS Preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      },
    })
  }

  // 1. Strict Allowlist Security Check
  if (!isAllowlistedPath(pathname)) {
    return createErrorResponse('NOT_FOUND', 'Endpoint not found or not allowed', 404)
  }

  // 2. Rate Limiting Check
  const clientIp = request.headers.get('cf-connecting-ip') || '127.0.0.1'
  const rateLimit = checkRateLimit(clientIp)
  if (!rateLimit.allowed) {
    return createErrorResponse(
      'RATE_LIMITED',
      `Too many requests. Please retry in ${Math.ceil(rateLimit.resetInMs / 1000)}s`,
      429,
    )
  }

  // 3. Health Check
  if (pathname === '/api/v1/health') {
    return createSuccessResponse(
      {
        status: 'healthy',
        version: 'v1.0.0',
        environment: env.ENVIRONMENT || 'production',
        timestamp: new Date().toISOString(),
      },
      { ttlSeconds: 60 },
    )
  }

  // 4. Edge Cache Lookup (GET requests)
  if (request.method === 'GET') {
    const cachedResponse = await matchEdgeCache(request)
    if (cachedResponse) {
      const cloned = new Response(cachedResponse.body, cachedResponse)
      cloned.headers.set('X-Nexus-Source', 'edge-cache')
      return cloned
    }
  }

  // 5. Route to specific handler with Single-Flight deduplication
  const cacheKey = `${request.method}:${url.pathname}:${url.search}`

  try {
    const response = await deduplicate(cacheKey, async () => {
      // Feed routes
      if (pathname.startsWith('/api/v1/games/feed/')) {
        const rawFeedName = pathname.replace('/api/v1/games/feed/', '')
        const feedName = rawFeedName.toLowerCase().replace(/-/g, '_')
        const offset = parseInt(url.searchParams.get('offset') || '0', 10) || 0
        const genres = url.searchParams.get('genres') || undefined

        let ttlSeconds = TTL.RELEASES_FEED
        if (feedName === 'new_releases') ttlSeconds = TTL.NEW_RELEASES
        else if (feedName === 'coming_soon') ttlSeconds = TTL.COMING_SOON
        else if (feedName === 'top_rated') ttlSeconds = TTL.TOP_RATED

        const games = await igdb.fetchFeed(feedName, offset, genres, env)
        return createSuccessResponse(games, {
          provider: 'igdb',
          source: 'upstream',
          ttlSeconds,
        })
      }

      // Game Details
      if (pathname.startsWith('/api/v1/games/details/')) {
        const idStr = pathname.replace('/api/v1/games/details/', '')
        const id = validateGameId(idStr)
        if (!id) return createErrorResponse('INVALID_ID', 'Valid numeric game ID required', 400)

        const details = await igdb.getGameDetails(id, env)
        if (!details) return createErrorResponse('NOT_FOUND', 'Game not found', 404)

        return createSuccessResponse(details, {
          provider: 'igdb',
          source: 'upstream',
          ttlSeconds: TTL.GAME_DETAILS,
        })
      }

      // Similar Games
      if (pathname.startsWith('/api/v1/games/similar/')) {
        const idStr = pathname.replace('/api/v1/games/similar/', '')
        const id = validateGameId(idStr)
        if (!id) return createErrorResponse('INVALID_ID', 'Valid numeric game ID required', 400)

        const games = await igdb.getSimilarGames(id, env)
        return createSuccessResponse(games, {
          provider: 'igdb',
          source: 'upstream',
          ttlSeconds: TTL.GAME_DETAILS,
        })
      }

      // Game Search
      if (pathname === '/api/v1/games/search') {
        const q = canonicalizeQuery(url.searchParams.get('q'))
        const offset = parseInt(url.searchParams.get('offset') || '0', 10) || 0
        const genre = url.searchParams.get('genre')
          ? parseInt(url.searchParams.get('genre')!, 10)
          : undefined
        const platform = url.searchParams.get('platform')
          ? parseInt(url.searchParams.get('platform')!, 10)
          : undefined

        const games = await igdb.searchGames(q, offset, genre, platform, env)
        return createSuccessResponse(games, {
          provider: 'igdb',
          source: 'upstream',
          ttlSeconds: TTL.SEARCH,
        })
      }

      // Genres
      if (pathname === '/api/v1/games/genres') {
        const genres = await igdb.getGenres(env)
        return createSuccessResponse(genres, {
          provider: 'igdb',
          source: 'upstream',
          ttlSeconds: TTL.GENRES_PLATFORMS,
        })
      }

      // Platforms
      if (pathname === '/api/v1/games/platforms') {
        const platforms = await igdb.getPlatforms(env)
        return createSuccessResponse(platforms, {
          provider: 'igdb',
          source: 'upstream',
          ttlSeconds: TTL.GENRES_PLATFORMS,
        })
      }

      // Artwork Options Aggregator (Cover, Hero, Logo)
      // Supports both Steam AppID and game name search with fallback
      if (pathname.startsWith('/api/v1/artwork/options/')) {
        const type = pathname.replace('/api/v1/artwork/options/', '') as 'cover' | 'hero' | 'logo'
        let steamAppId = url.searchParams.get('app_id')
        const name = url.searchParams.get('name') || ''

        // Fallback: If no steamAppId provided, resolve via Steam Search
        if (!steamAppId && name) {
          steamAppId = await steam.searchSteamAppId(name)
        }

        const results: ArtworkOption[] = []

        // 1. Fetch Official Steam Assets if AppID exists
        if (steamAppId) {
          const steamAssets = steam.getSteamOfficialArtwork(steamAppId)
          results.push(...steamAssets.filter((a) => a.type === type))
        }

        // 2. Fetch SteamGridDB Assets via Gateway Secret
        if (env.STEAMGRIDDB_API_KEY) {
          try {
            const sgdbKind = type === 'cover' ? 'grids' : type === 'hero' ? 'heroes' : 'logos'
            let sgdbGameId: number | null = null
            if (!steamAppId && name) {
              sgdbGameId = await sgdb.searchSgdbGameId(name, env)
            }

            const sgdbAssets = await sgdb.getSgdbArtwork(sgdbKind, steamAppId, sgdbGameId, env)
            results.push(...sgdbAssets)
          } catch {
            // Graceful degradation: if SGDB fails, Steam art is still returned!
          }
        }

        return createSuccessResponse(results, {
          provider: results[0]?.provider || 'steam',
          source: 'upstream',
          ttlSeconds: TTL.ARTWORK,
        })
      }

      return createErrorResponse('NOT_FOUND', 'Route not found', 404)
    })

    // Store successful response in Edge Cache
    if (request.method === 'GET' && response.status === 200) {
      await putEdgeCache(request, response)
    }

    return response
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('RATE_LIMITED')) {
      return createErrorResponse(
        'PROVIDER_RATE_LIMITED',
        'Upstream provider is temporarily busy',
        429,
      )
    }
    return createErrorResponse('GATEWAY_ERROR', 'Internal Gateway Error', 500)
  }
}
