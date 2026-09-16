import type { RumbleOptions } from '../types/gamepad'

interface GamepadHapticActuatorExtended {
  type?: string
  playEffect?: (
    type: string,
    params?: {
      startDelay?: number
      duration?: number
      weakMagnitude?: number
      strongMagnitude?: number
    },
  ) => Promise<string>
  pulse?: (value: number, duration: number) => Promise<boolean>
}

/**
 * Executes a haptic rumble pulse safely across supported gamepads and platforms.
 * Returns true if the rumble was triggered successfully, or false if unsupported,
 * disabled by user settings, or rejected by hardware.
 */
export async function triggerRumble(
  gamepad: Gamepad | null | undefined,
  options: RumbleOptions = {},
  isRumbleEnabled = true,
): Promise<boolean> {
  if (!isRumbleEnabled || !gamepad) {
    return false
  }

  const { startDelay = 0, duration = 200, weakMagnitude = 0.5, strongMagnitude = 0.5 } = options

  // 1. Try standard Gamepad Haptic Actuator API (Chromium / Windows WebView2 standard)
  const g = gamepad as unknown as {
    vibrationActuator?: GamepadHapticActuatorExtended
    hapticActuators?: GamepadHapticActuatorExtended[]
  }

  try {
    if (g.vibrationActuator && typeof g.vibrationActuator.playEffect === 'function') {
      await g.vibrationActuator.playEffect('dual-rumble', {
        startDelay: Math.max(0, startDelay),
        duration: Math.max(10, Math.min(5000, duration)),
        weakMagnitude: Math.max(0, Math.min(1, weakMagnitude)),
        strongMagnitude: Math.max(0, Math.min(1, strongMagnitude)),
      })
      return true
    }

    // 2. Fallback to older hapticActuators if available
    if (
      Array.isArray(g.hapticActuators) &&
      g.hapticActuators.length > 0 &&
      typeof g.hapticActuators[0]?.pulse === 'function'
    ) {
      const intensity = Math.max(weakMagnitude, strongMagnitude)
      await g.hapticActuators[0].pulse(intensity, duration)
      return true
    }
  } catch {
    // Graceful fail-safe: device disconnected, actuator busy, or platform security rejection
    return false
  }

  return false
}
