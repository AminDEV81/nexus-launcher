import type { ConsoleGlyphFamily, ConsoleGlyphOverride } from '../theme/tokens'
import type { NavDirection } from '../nav/spatial'

export type ConsoleAction =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'confirm'
  | 'back'
  | 'options'
  | 'tabPrev'
  | 'tabNext'
  | 'pagePrev'
  | 'pageNext'
  | 'secondary'
  | 'tertiary'
  | 'search'
  | 'guide'

export interface LogicalGamepadDescriptor {
  index: number
  id: string
  glyphFamily: ConsoleGlyphFamily
  isShadowedDuplicate: boolean
}

export const DEADZONE_ENGAGE = 0.35
export const DEADZONE_RELEASE = 0.22
export const REPEAT_INITIAL_DELAY_MS = 400
export const REPEAT_INTERVAL_MS = 90
export const REPEAT_TURBO_AFTER_MS = 1200
export const REPEAT_TURBO_INTERVAL_MS = 45
export const FOCUS_SWALLOW_WINDOW_MS = 400

/**
 * Resolves raw stick (x, y) into a cardinal direction with radial deadzone hysteresis (0.35 / 0.22)
 * and a 45-degree dominance lock so diagonal deflection never double-fires two directions.
 */
export function applyStickDeadzoneAndLock(
  x: number,
  y: number,
  prevDir: NavDirection | null,
  engageThreshold = DEADZONE_ENGAGE,
  releaseThreshold = DEADZONE_RELEASE,
): NavDirection | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  const mag = Math.hypot(x, y)
  const threshold = prevDir ? releaseThreshold : engageThreshold
  if (mag < threshold) return null

  const absX = Math.abs(x)
  const absY = Math.abs(y)

  // 45-degree lock: require dominant axis to exceed 1.18x secondary axis unless maintaining prevDir
  if (absX > absY * 1.18) {
    return x > 0 ? 'right' : 'left'
  }
  if (absY > absX * 1.18) {
    return y > 0 ? 'down' : 'up'
  }
  return prevDir
}

/**
 * Pure repeat controller with 400ms initial delay -> 90ms repeat -> 45ms turbo after 1.2s hold.
 */
export class StepRepeatTimer {
  private activeDir: NavDirection | null = null
  private pressedAtMs = 0
  private lastFiredAtMs = 0

  public update(dir: NavDirection | null, nowMs: number): NavDirection | null {
    if (!dir) {
      this.activeDir = null
      return null
    }
    if (this.activeDir !== dir) {
      this.activeDir = dir
      this.pressedAtMs = nowMs
      this.lastFiredAtMs = nowMs
      return dir
    }
    const heldMs = nowMs - this.pressedAtMs
    if (heldMs < REPEAT_INITIAL_DELAY_MS) {
      return null
    }
    const interval =
      heldMs >= REPEAT_TURBO_AFTER_MS ? REPEAT_TURBO_INTERVAL_MS : REPEAT_INTERVAL_MS
    if (nowMs - this.lastFiredAtMs >= interval) {
      this.lastFiredAtMs = nowMs
      return dir
    }
    return null
  }

  public reset(): void {
    this.activeDir = null
    this.pressedAtMs = 0
    this.lastFiredAtMs = 0
  }
}

export function detectGlyphFamilyFromId(
  rawId: string,
  dualSenseConnectedCount = 0,
  override: ConsoleGlyphOverride = 'auto',
): ConsoleGlyphFamily {
  if (override !== 'auto') return override
  const low = rawId.toLowerCase()
  if (
    low.includes('054c') ||
    low.includes('dualsense') ||
    low.includes('dualshock') ||
    low.includes('playstation') ||
    low.includes('ps5') ||
    low.includes('ps4')
  ) {
    return 'playstation'
  }
  if (
    low.includes('057e') ||
    low.includes('nintendo') ||
    low.includes('switch') ||
    low.includes('pro controller') ||
    low.includes('joy-con')
  ) {
    return 'switch'
  }
  if (dualSenseConnectedCount > 0 && (low.includes('xinput') || low.includes('xbox'))) {
    // When ViGEm Xbox 360 emulation is active for a physical DualSense, keep PlayStation glyphs!
    return 'playstation'
  }
  return 'xbox'
}

/**
 * Deduplicates physical Sony DualSense pads and their corresponding ViGEm virtual Xbox 360 pads
 * when DualSense Xbox emulation is active (`dualSenseEmulatingCount > 0`), preventing double-firing.
 */
export function dedupeLogicalGamepads(
  rawPads: Array<{ index: number; id: string; connected: boolean } | null>,
  dualSenseEmulatingCount: number,
  dualSenseConnectedCount: number,
  override: ConsoleGlyphOverride = 'auto',
): LogicalGamepadDescriptor[] {
  const connected = rawPads.filter(
    (p): p is { index: number; id: string; connected: boolean } =>
      Boolean(p && p.connected),
  )

  const xinputPads = connected.filter((p) => {
    const low = p.id.toLowerCase()
    return low.includes('xinput') || low.includes('xbox') || low.includes('045e')
  })

  let remainingShadowsToMark =
    xinputPads.length > 0 ? Math.min(dualSenseEmulatingCount, xinputPads.length) : 0

  return connected.map((pad) => {
    const low = pad.id.toLowerCase()
    const isSonyPhysical =
      low.includes('054c') ||
      low.includes('dualsense') ||
      low.includes('dualshock') ||
      low.includes('wireless controller')

    let isShadowedDuplicate = false
    if (isSonyPhysical && remainingShadowsToMark > 0) {
      isShadowedDuplicate = true
      remainingShadowsToMark -= 1
    }

    return {
      index: pad.index,
      id: pad.id,
      glyphFamily: detectGlyphFamilyFromId(pad.id, dualSenseConnectedCount, override),
      isShadowedDuplicate,
    }
  })
}

export function isWithinSwallowWindow(lastFocusRegainedAtMs: number, nowMs: number): boolean {
  if (lastFocusRegainedAtMs <= 0) return false
  return nowMs - lastFocusRegainedAtMs < FOCUS_SWALLOW_WINDOW_MS
}

export function mapFaceButtonAction(
  buttonIndex: number,
  confirmSwap: boolean,
): ConsoleAction | null {
  // Standard Gamepad mapping: 0 = South (Cross/A), 1 = East (Circle/B), 2 = West (Square/X), 3 = North (Triangle/Y)
  if (buttonIndex === 0) return confirmSwap ? 'back' : 'confirm'
  if (buttonIndex === 1) return confirmSwap ? 'confirm' : 'back'
  if (buttonIndex === 2) return 'secondary'
  if (buttonIndex === 3) return 'tertiary'
  return null
}
