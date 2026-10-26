import type { ApiResponse } from '../types'
import { buildCacheHeaders } from '../cache/edge-cache'
import { resolveCorsOrigin } from '../security/validation'

export function createSuccessResponse<T>(
  data: T,
  options: {
    source?: 'cache' | 'upstream' | 'stale-cache' | 'fallback'
    provider?: 'igdb' | 'steam' | 'steamgrid' | 'local'
    cached?: boolean
    stale?: boolean
    ttlSeconds?: number
    requestOrigin?: string | null
  } = {},
): Response {
  const body: ApiResponse<T> = {
    success: true,
    data,
    source: options.source || 'upstream',
    provider: options.provider,
    cached: options.cached ?? false,
    stale: options.stale ?? false,
  }

  const ttl = options.ttlSeconds ?? 3600
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: buildCacheHeaders(ttl, 86_400, options.requestOrigin),
  })
}

export function createErrorResponse(
  code: string,
  message: string,
  statusCode = 400,
  requestOrigin?: string | null,
): Response {
  const body: ApiResponse<null> = {
    success: false,
    error: {
      code,
      message,
    },
  }

  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': resolveCorsOrigin(requestOrigin),
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      Vary: 'Origin',
    },
  })
}
