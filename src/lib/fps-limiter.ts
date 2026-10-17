/**
 * Frame Rate Limiter (60 FPS Cap).
 *
 * Uses native `requestAnimationFrame` without dropping or delaying Framer Motion
 * exit/enter lifecycle callbacks so route navigation and modal transitions never stall.
 */

let isEnabled = true
let targetFps = 60

export function installFpsLimiter(fps = 60) {
  targetFps = fps
}

export function setFpsLimitEnabled(enabled: boolean) {
  isEnabled = enabled
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-fps-cap', enabled ? String(targetFps) : 'off')
  }
}

export function setTargetFps(fps: number) {
  targetFps = Math.max(15, Math.min(fps, 120))
  if (typeof document !== 'undefined' && isEnabled) {
    document.documentElement.setAttribute('data-fps-cap', String(targetFps))
  }
}
