import type { NavigationDirection } from '../types/navigation'

export interface RepeatConfig {
  initialDelayMs: number
  repeatIntervalMs: number
  minStepCooldownMs: number
  stickEngageThreshold: number
  stickReleaseThreshold: number
  releaseDebounceMs: number
}

export const DEFAULT_REPEAT_CONFIG: RepeatConfig = {
  initialDelayMs: 550,
  repeatIntervalMs: 140,
  minStepCooldownMs: 120,
  stickEngageThreshold: 0.55,
  stickReleaseThreshold: 0.35,
  releaseDebounceMs: 70,
}

/**
 * After a stick-driven step, re-engagements within this window are treated as
 * spring-back bounce (the stick physically overshoots and re-crosses the
 * engage threshold while returning to center) and produce no extra step.
 */
const STICK_BOUNCE_GUARD_MS = 300

export class InputRepeatController {
  private config: RepeatConfig
  private activeDirection: NavigationDirection | null = null
  private pressStartTime = 0
  private lastTriggerTime = 0
  private lastStepTime = -Infinity
  private releaseStartTime: number | null = null
  private stickEngaged = false
  private lastStickStepTime = -Infinity
  constructor(config: RepeatConfig = DEFAULT_REPEAT_CONFIG) {
    this.config = config
  }

  /**
   * Returns the currently active directional lock, if any.
   */
  public getActiveDirection(): NavigationDirection | null {
    return this.activeDirection
  }

  /**
   * Resets all internal repeat timers.
   * The hard step cooldown and stick bounce guard survive so contact bounce
   * arriving after the release debounce window cannot fire a second step.
   */
  public reset(): void {
    this.activeDirection = null
    this.pressStartTime = 0
    this.lastTriggerTime = 0
    this.releaseStartTime = null
    this.stickEngaged = false
  }

  /**
   * Resets only stick engagement state without affecting button timers.
   */
  public resetStick(): void {
    this.stickEngaged = false
  }

  /**
   * Converts Left Stick analog values into a discrete directional press using hysteresis.
   * A re-engage within STICK_BOUNCE_GUARD_MS after the previous stick step is
   * treated as spring-back bounce and swallowed (no direction returned).
   */
  public resolveStickDirection(
    x: number,
    y: number,
    timestamp = performance.now(),
  ): NavigationDirection | null {
    const absX = Math.abs(x)
    const absY = Math.abs(y)

    if (!this.stickEngaged) {
      if (absX >= this.config.stickEngageThreshold || absY >= this.config.stickEngageThreshold) {
        // Spring-back guard: a re-engage this soon after the last stick step is
        // the stick's physical bounce, not a deliberate new flick.
        if (timestamp - this.lastStickStepTime < STICK_BOUNCE_GUARD_MS) {
          return null
        }
        this.stickEngaged = true
        if (absX >= absY) {
          return x > 0 ? 'right' : 'left'
        } else {
          return y > 0 ? 'down' : 'up'
        }
      }
      return null
    } else {
      // Stick was previously engaged; maintain until magnitude falls below release threshold
      if (absX < this.config.stickReleaseThreshold && absY < this.config.stickReleaseThreshold) {
        this.stickEngaged = false
        return null
      }
      // Still engaged, determine primary axis
      if (absX >= absY) {
        return x > 0 ? 'right' : 'left'
      } else {
        return y > 0 ? 'down' : 'up'
      }
    }
  }

  /**
   * Evaluates whether a directional input should produce a navigation pulse at the current timestamp.
   * Returns true on initial press, or when repeat interval has elapsed.
   */
  public check(direction: NavigationDirection | null, timestamp = Date.now()): boolean {
    if (!direction) {
      if (this.activeDirection !== null) {
        if (this.releaseStartTime === null) {
          this.releaseStartTime = timestamp
        } else if (timestamp - this.releaseStartTime >= this.config.releaseDebounceMs) {
          this.reset()
        }
      }
      return false
    }

    // If button was released and debounce period elapsed before this press, complete the reset
    if (
      this.releaseStartTime !== null &&
      timestamp - this.releaseStartTime >= this.config.releaseDebounceMs
    ) {
      this.activeDirection = null
      this.pressStartTime = 0
      this.lastTriggerTime = 0
    }

    // Direction is actively pressed, clear release timer
    this.releaseStartTime = null

    // Hard step cooldown: prevent rapid multi-stepping / contact bounce / diagonal wobble
    if (timestamp - this.lastStepTime < this.config.minStepCooldownMs) {
      return false
    }

    // Direction changed (or reset after release debounce period): trigger immediately
    if (this.activeDirection !== direction) {
      this.activeDirection = direction
      this.pressStartTime = timestamp
      this.lastTriggerTime = timestamp
      this.lastStepTime = timestamp
      this.lastStickStepTime = timestamp
      return true
    }

    // Same direction held: check initial delay & repeat interval
    const holdDuration = timestamp - this.pressStartTime
    if (holdDuration < this.config.initialDelayMs) {
      return false
    }

    const timeSinceLastRepeat = timestamp - this.lastTriggerTime
    if (timeSinceLastRepeat >= this.config.repeatIntervalMs) {
      this.lastTriggerTime = timestamp
      this.lastStepTime = timestamp
      this.lastStickStepTime = timestamp
      return true
    }

    return false
  }
}
