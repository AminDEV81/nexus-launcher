interface RateLimitRecord {
  count: number
  resetAt: number
}

const memoryRateLimit = new Map<string, RateLimitRecord>()

// Clean up stale entries every 5 minutes
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

export function checkRateLimit(
  clientIp: string,
  limitPerMinute = 120,
  windowMs = 60_000,
): { allowed: boolean; remaining: number; resetInMs: number } {
  cleanupStale()

  const now = Date.now()
  const record = memoryRateLimit.get(clientIp)

  if (!record || now > record.resetAt) {
    memoryRateLimit.set(clientIp, {
      count: 1,
      resetAt: now + windowMs,
    })
    return { allowed: true, remaining: limitPerMinute - 1, resetInMs: windowMs }
  }

  if (record.count >= limitPerMinute) {
    return {
      allowed: false,
      remaining: 0,
      resetInMs: Math.max(0, record.resetAt - now),
    }
  }

  record.count += 1
  return {
    allowed: true,
    remaining: limitPerMinute - record.count,
    resetInMs: Math.max(0, record.resetAt - now),
  }
}
