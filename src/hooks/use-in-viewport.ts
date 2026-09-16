import { useEffect, useState, type RefObject } from 'react'

/**
 * Tracks whether `ref`'s element is within (a small margin around) the
 * viewport, via `IntersectionObserver`. Epic 9 uses this to stop
 * decoding/playing Live Covers as soon as they're scrolled out of the
 * grid/list — the observer callback is cheap, unlike leaving a video
 * or animated WebP running off-screen.
 */
export function useInViewport<T extends Element>(ref: RefObject<T | null>): boolean {
  const [inViewport, setInViewport] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(([entry]) => setInViewport(entry.isIntersecting), {
      rootMargin: '200px',
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])

  return inViewport
}
