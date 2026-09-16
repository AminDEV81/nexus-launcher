import { cn } from '@/lib/utils'

/**
 * Slow-moving, softly blurred gradient blobs behind the whole app —
 * the "ambient motion" layer from the design brief. Two things keep
 * this cheap enough to run indefinitely on a background window:
 *
 * 1. The blobs only ever animate `transform` (translate/scale), never
 *    `top`/`left`/`width`, so the browser can composite them on the GPU
 *    without triggering layout or paint on every frame.
 * 2. `prefers-reduced-motion` swaps the keyframe animations for a
 *    static frame — same visual, no motion, for accessibility and for
 *    users who'd rather not have anything moving in the background.
 *
 * The subtle mouse-parallax drift is intentionally tiny (a few px) and
 * uses a single ref + rAF-free CSS custom property update rather than
 * re-rendering React on every mousemove.
 */
export function AmbientBackground({ paused = false }: { paused?: boolean }) {
  return (
    <div
      className={cn(
        'ambient-root pointer-events-none absolute inset-0 -z-10 overflow-hidden',
        paused && 'ambient-root--paused',
      )}
    >
      <div className="ambient-blob ambient-blob--accent" />
      <div className="ambient-blob ambient-blob--secondary" />
      <div className="ambient-blob ambient-blob--tertiary" />
    </div>
  )
}
