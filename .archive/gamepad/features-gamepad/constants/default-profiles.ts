import type {
  GamepadSettings,
  StandardGamepadAnalog,
  StandardGamepadButtons,
  StandardGamepadInput,
} from '../types/gamepad'
import type { GamepadProfile } from '../types/profiles'
import {
  getAxisValue,
  getButtonValue,
  isButtonPressed,
  normalizeStandardGamepad,
} from '../utils/input-normalizer'
import { applyRadialDeadzone, applyTriggerDeadzone } from '../utils/deadzone'
import { extractHardwareIds, identifyGamepadType } from '../utils/identification'

/**
 * Standard W3C profile for any controller reporting mapping === "standard".
 */
export const StandardProfile: GamepadProfile = {
  id: 'standard-w3c',
  name: 'Standard Gamepad (W3C)',
  type: 'generic',
  matches: (gamepad: Gamepad) => gamepad.mapping === 'standard',
  normalize: (gamepad: Gamepad, settings: GamepadSettings) =>
    normalizeStandardGamepad(gamepad, settings),
}

/**
 * Dedicated Xbox controller profile.
 */
export const XboxProfile: GamepadProfile = {
  id: 'xbox-controller',
  name: 'Xbox Controller',
  type: 'xbox',
  matches: (gamepad: Gamepad) => {
    const { vendorId, productId } = extractHardwareIds(gamepad.id)
    return identifyGamepadType(gamepad.id, vendorId, productId) === 'xbox'
  },
  normalize: (gamepad: Gamepad, settings: GamepadSettings) =>
    normalizeStandardGamepad(gamepad, settings),
}

/**
 * Dedicated PlayStation profile (DualSense & DualShock 4).
 */
export const PlayStationProfile: GamepadProfile = {
  id: 'playstation-controller',
  name: 'PlayStation Controller',
  type: 'dualsense',
  matches: (gamepad: Gamepad) => {
    const { vendorId, productId } = extractHardwareIds(gamepad.id)
    const type = identifyGamepadType(gamepad.id, vendorId, productId)
    return type === 'dualsense' || type === 'dualshock4'
  },
  normalize: (gamepad: Gamepad, settings: GamepadSettings) =>
    normalizeStandardGamepad(gamepad, settings),
}

/**
 * Robust fallback profile for Generic DirectInput / USB gamepads with non-standard mappings.
 */
export const GenericFallbackProfile: GamepadProfile = {
  id: 'generic-fallback',
  name: 'Generic / DirectInput Gamepad',
  type: 'generic',
  matches: () => true, // Fallback catch-all
  normalize: (gamepad: Gamepad, settings: GamepadSettings): StandardGamepadInput => {
    // If controller actually has standard mapping, defer to standard
    if (gamepad.mapping === 'standard') {
      return normalizeStandardGamepad(gamepad, settings)
    }

    // Heuristic button mapping for DirectInput / non-standard USB pads
    // Buttons 0: South, 1: East, 2: West, 3: North
    // Buttons 4: L1, 5: R1, 6: L2, 7: R2, 8: Select, 9: Start, 10: L3, 11: R3
    let dpadUp = isButtonPressed(gamepad, 12)
    let dpadDown = isButtonPressed(gamepad, 13)
    let dpadLeft = isButtonPressed(gamepad, 14)
    let dpadRight = isButtonPressed(gamepad, 15)

    // Check for Hat Switch (often on axis 9 or axis 4 in DirectInput) if D-Pad buttons aren't present
    if (
      !dpadUp &&
      !dpadDown &&
      !dpadLeft &&
      !dpadRight &&
      gamepad.axes &&
      gamepad.axes.length >= 5
    ) {
      // Some DirectInput controllers report POV hat as axis 9 (-1 to 1) or axis 4/5
      const hatX = getAxisValue(gamepad, 4)
      const hatY = getAxisValue(gamepad, 5)
      if (Math.abs(hatX) > 0.5) {
        dpadLeft = hatX < -0.5
        dpadRight = hatX > 0.5
      }
      if (Math.abs(hatY) > 0.5) {
        dpadUp = hatY < -0.5
        dpadDown = hatY > 0.5
      }
    }

    const buttons: StandardGamepadButtons = {
      south: isButtonPressed(gamepad, 0),
      east: isButtonPressed(gamepad, 1),
      west: isButtonPressed(gamepad, 2),
      north: isButtonPressed(gamepad, 3),

      l1: isButtonPressed(gamepad, 4),
      r1: isButtonPressed(gamepad, 5),

      select: isButtonPressed(gamepad, 8),
      start: isButtonPressed(gamepad, 9),

      l3: isButtonPressed(gamepad, 10),
      r3: isButtonPressed(gamepad, 11),

      dpadUp,
      dpadDown,
      dpadLeft,
      dpadRight,

      home: isButtonPressed(gamepad, 16),
      touchpad: isButtonPressed(gamepad, 17),
    }

    // Read Triggers
    const rawL2 = getButtonValue(gamepad, 6)
    const rawR2 = getButtonValue(gamepad, 7)
    const normL2 = applyTriggerDeadzone(rawL2, settings.triggerDeadzone)
    const normR2 = applyTriggerDeadzone(rawR2, settings.triggerDeadzone)

    // Read Analog Sticks
    const leftStick = applyRadialDeadzone(
      getAxisValue(gamepad, 0),
      getAxisValue(gamepad, 1),
      settings.leftStickDeadzone,
      settings.invertLeftX,
      settings.invertLeftY,
    )

    // Right stick on generic pads is usually axis 2 & 3 or 2 & 5
    const rawRightX = getAxisValue(gamepad, 2)
    const rawRightY = gamepad.axes && gamepad.axes.length >= 4 ? getAxisValue(gamepad, 3) : 0
    const rightStick = applyRadialDeadzone(
      rawRightX,
      rawRightY,
      settings.rightStickDeadzone,
      settings.invertRightX,
      settings.invertRightY,
    )

    const analog: StandardGamepadAnalog = {
      l2: normL2,
      r2: normR2,
      leftX: leftStick.x,
      leftY: leftStick.y,
      rightX: rightStick.x,
      rightY: rightStick.y,
    }

    return {
      buttons,
      analog,
    }
  },
}
