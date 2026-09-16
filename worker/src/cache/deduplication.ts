/**
 * In-flight Request Deduplication (Single-Flight Pattern).
 * When multiple identical requests arrive concurrently at the worker,
 * only ONE upstream request is executed; all other callers await the exact same promise.
 */

const inFlight = new Map<string, Promise<any>>()

export async function deduplicate<T>(cacheKey: string, fetcher: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(cacheKey)
  if (existing) {
    return existing as Promise<T>
  }

  const promise = (async () => {
    try {
      return await fetcher()
    } finally {
      inFlight.delete(cacheKey)
    }
  })()

  inFlight.set(cacheKey, promise)
  return promise
}
