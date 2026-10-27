import { Env } from '../types'

interface RateBucket {
  count: number
  resetAt: number
}

// Fast in-memory isolate map (zero KV write-rate limit or race conditions)
const memoryBuckets = new Map<string, RateBucket>()

export async function checkRateLimit(
  request: Request,
  env: Env,
  isSearchAction = false,
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const ip = request.headers.get('CF-Connecting-IP') || '127.0.0.1'
  const now = Date.now()
  const windowMs = 60 * 1000 // 1 minute window

  const maxRequests = isSearchAction
    ? parseInt(env.SEARCH_RATE_LIMIT_PER_MINUTE || '30', 10)
    : parseInt(env.RATE_LIMIT_PER_MINUTE || '60', 10)

  const bucketKey = `${ip}:${isSearchAction ? 'search' : 'general'}`

  let bucket = memoryBuckets.get(bucketKey)
  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs }
  }

  bucket.count += 1
  memoryBuckets.set(bucketKey, bucket)

  // Periodically prune expired keys
  if (memoryBuckets.size > 1000) {
    for (const [k, v] of memoryBuckets.entries()) {
      if (now > v.resetAt) memoryBuckets.delete(k)
    }
  }

  const allowed = bucket.count <= maxRequests
  const remaining = Math.max(0, maxRequests - bucket.count)

  return {
    allowed,
    remaining,
    resetAt: bucket.resetAt,
  }
}
