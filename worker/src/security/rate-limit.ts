import type { Env } from '../types'

interface RateLimitRecord {
  count: number
  resetAt: number
}

const memoryRateLimit = new Map<string, RateLimitRecord>()

let lastCleanup = Date.now()
function cleanupStale() {
  const now = Date.now()
  if (now - lastCleanup < 300_000) return
  lastCleanup = now
  for (const [key, record] of memoryRateLimit.entries()) {
    if (now > record.resetAt) {
      memoryRateLimit.delete(key)
    }
  }
}

export async function checkRateLimit(
  clientIp: string,
  env?: Env,
  limitPerMinute = 120,
  windowMs = 60_000,
): Promise<{ allowed: boolean; remaining: number; resetInMs: number }> {
  cleanupStale()

  const now = Date.now()
  const bucket = Math.floor(now / windowMs)
  const record = memoryRateLimit.get(clientIp)

  if (!record || now > record.resetAt) {
    memoryRateLimit.set(clientIp, {
      count: 1,
      resetAt: now + windowMs,
    })
  } else {
    record.count += 1
    if (record.count > limitPerMinute) {
      return {
        allowed: false,
        remaining: 0,
        resetInMs: Math.max(0, record.resetAt - now),
      }
    }
  }

  // Optional KV-backed cross-isolate counter when NEXUS_CACHE is bound
  if (env?.NEXUS_CACHE) {
    const kvKey = `rl:${clientIp}:${bucket}`
    try {
      const existing = await env.NEXUS_CACHE.get(kvKey)
      const count = (existing ? parseInt(existing, 10) || 0 : 0) + 1
      if (count > limitPerMinute) {
        return {
          allowed: false,
          remaining: 0,
          resetInMs: Math.max(1000, (bucket + 1) * windowMs - now),
        }
      }
      await env.NEXUS_CACHE.put(kvKey, String(count), { expirationTtl: 65 })
      return {
        allowed: true,
        remaining: Math.max(0, limitPerMinute - count),
        resetInMs: Math.max(1000, (bucket + 1) * windowMs - now),
      }
    } catch {
      // Fall back to isolate memory counter on KV error
    }
  }

  const currentCount = memoryRateLimit.get(clientIp)?.count ?? 1
  const resetAt = memoryRateLimit.get(clientIp)?.resetAt ?? now + windowMs
  return {
    allowed: currentCount <= limitPerMinute,
    remaining: Math.max(0, limitPerMinute - currentCount),
    resetInMs: Math.max(0, resetAt - now),
  }
}
