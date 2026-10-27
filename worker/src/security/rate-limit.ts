import type { Env } from '../types'

interface RateBucket {
  count: number
  resetAt: number
  lastKvSyncAt: number
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
  resetInMs: number
}

// Fast in-memory isolate map backed by throttled cross-isolate KV sync (at most 1 write per 10s per key)
const memoryBuckets = new Map<string, RateBucket>()
const KV_SYNC_INTERVAL_MS = 10_000

export async function checkRateLimit(
  requestOrIp: Request | string,
  env: Env,
  isSearchAction = false,
  ctx?: ExecutionContext,
): Promise<RateLimitResult> {
  const ip =
    typeof requestOrIp === 'string'
      ? requestOrIp || '127.0.0.1'
      : requestOrIp.headers.get('CF-Connecting-IP') ||
        requestOrIp.headers.get('cf-connecting-ip') ||
        '127.0.0.1'

  const now = Date.now()
  const windowMs = 60 * 1000 // 1 minute window

  const maxRequests = isSearchAction
    ? Number.parseInt(env.SEARCH_RATE_LIMIT_PER_MINUTE || '30', 10) || 30
    : Number.parseInt(env.RATE_LIMIT_PER_MINUTE || '60', 10) || 60

  const scope = isSearchAction ? 'search' : 'general'
  const bucketKey = `${ip}:${scope}`
  const minuteSlot = Math.floor(now / windowMs)
  const kvKey = `rl:${scope}:${ip}:${minuteSlot}`

  // 1. If Cloudflare native Rate Limiting binding is configured, consult it first
  if (env.RATE_LIMITER && typeof env.RATE_LIMITER.limit === 'function') {
    try {
      const nativeRes = await env.RATE_LIMITER.limit({ key: bucketKey })
      if (!nativeRes.success) {
        const resetAt = (minuteSlot + 1) * windowMs
        return {
          allowed: false,
          remaining: 0,
          resetAt,
          resetInMs: Math.max(1000, resetAt - now),
        }
      }
    } catch {
      // Fall through to hybrid isolate + KV limiter
    }
  }

  let bucket = memoryBuckets.get(bucketKey)
  if (!bucket || now >= bucket.resetAt) {
    const resetAt = (minuteSlot + 1) * windowMs
    let initialCount = 0
    // Hydrate from KV once per window per isolate so cross-isolate abuse counts are shared
    if (env.NEXUS_CACHE) {
      try {
        const stored = await env.NEXUS_CACHE.get<{ count?: number }>(kvKey, 'json')
        if (stored && typeof stored.count === 'number' && stored.count > 0) {
          initialCount = stored.count
        }
      } catch {
        // Ignore KV read error
      }
    }
    bucket = { count: initialCount, resetAt, lastKvSyncAt: 0 }
  }

  bucket.count += 1
  memoryBuckets.set(bucketKey, bucket)

  // Periodically prune expired keys
  if (memoryBuckets.size > 1000) {
    for (const [k, v] of memoryBuckets.entries()) {
      if (now >= v.resetAt) memoryBuckets.delete(k)
    }
  }

  // Throttled KV writeback: sync when crossing the block threshold or at most once every 10s per key
  // (strictly respects Cloudflare KV's 1 write/sec/key limit while sharing state across isolates)
  const crossedBlockThreshold = bucket.count === maxRequests + 1
  if (
    env.NEXUS_CACHE &&
    (crossedBlockThreshold || now - bucket.lastKvSyncAt >= KV_SYNC_INTERVAL_MS)
  ) {
    bucket.lastKvSyncAt = now
    const snapshot = JSON.stringify({ count: bucket.count, resetAt: bucket.resetAt })
    const putPromise = env.NEXUS_CACHE.put(kvKey, snapshot, { expirationTtl: 90 }).catch(() => {
      // Ignore KV write rate limit errors gracefully
    })
    if (ctx && typeof ctx.waitUntil === 'function') {
      ctx.waitUntil(putPromise)
    }
  }

  const allowed = bucket.count <= maxRequests
  const remaining = Math.max(0, maxRequests - bucket.count)
  const resetInMs = Math.max(1000, bucket.resetAt - now)

  return {
    allowed,
    remaining,
    resetAt: bucket.resetAt,
    resetInMs,
  }
}
