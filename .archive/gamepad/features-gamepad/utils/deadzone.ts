export interface RadialDeadzoneResult {
  x: number
  y: number
  magnitude: number
}

/**
 * Applies radial deadzone to an analog stick (X, Y).
 *
 * Rather than clipping X and Y separately (which distorts diagonal motion into
 * squares or crosses), radial deadzone measures Euclidean distance from center,
 * eliminates values below threshold, and rescales the remainder smoothly from 0 to 1.
 */
export function applyRadialDeadzone(
  rawX: number,
  rawY: number,
  deadzone: number,
  invertX = false,
  invertY = false,
): RadialDeadzoneResult {
  // Clamp raw input to [-1, 1], safely treating non-finite values (NaN, Infinity) as 0
  const safeX = Number.isFinite(rawX) ? rawX : 0
  const safeY = Number.isFinite(rawY) ? rawY : 0

  const clampedX = Math.max(-1, Math.min(1, safeX))
  const clampedY = Math.max(-1, Math.min(1, safeY))

  const magnitude = Math.sqrt(clampedX * clampedX + clampedY * clampedY)
  const safeDeadzone = Math.max(0, Math.min(0.95, Number.isFinite(deadzone) ? deadzone : 0))

  if (magnitude <= safeDeadzone || magnitude === 0) {
    return { x: 0, y: 0, magnitude: 0 }
  }

  // Smoothly rescale remaining magnitude to [0, 1]
  const scaledMagnitude = Math.min(1, (magnitude - safeDeadzone) / (1 - safeDeadzone))
  const normalizedX = (clampedX / magnitude) * scaledMagnitude
  const normalizedY = (clampedY / magnitude) * scaledMagnitude

  return {
    x: invertX ? -normalizedX : normalizedX,
    y: invertY ? -normalizedY : normalizedY,
    magnitude: scaledMagnitude,
  }
}

/**
 * Normalizes and applies deadzone to an analog trigger (0.0 to 1.0).
 * Handles both [0, 1] standard triggers and [-1, 1] raw trigger inputs.
 */
export function applyTriggerDeadzone(rawVal: number, deadzone: number): number {
  if (!Number.isFinite(rawVal)) return 0

  // If a device provides [-1, 1] range for unpressed->pressed, normalize to [0, 1]
  let val = rawVal
  if (val < 0 && val >= -1.0) {
    // Some DirectInput drivers report resting trigger as -1.0
    val = Math.max(0, (val + 1) / 2)
  }

  const clamped = Math.max(0, Math.min(1, val))
  const safeDeadzone = Math.max(0, Math.min(0.95, Number.isFinite(deadzone) ? deadzone : 0))

  if (clamped <= safeDeadzone) {
    return 0
  }

  return Math.min(1, (clamped - safeDeadzone) / (1 - safeDeadzone))
}
