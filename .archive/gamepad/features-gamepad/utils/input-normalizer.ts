import type {
  GamepadSettings,
  StandardGamepadAnalog,
  StandardGamepadButtons,
  StandardGamepadInput,
} from '../types/gamepad'
import {
  STANDARD_AXIS_LEFT_X,
  STANDARD_AXIS_LEFT_Y,
  STANDARD_AXIS_RIGHT_X,
  STANDARD_AXIS_RIGHT_Y,
  STANDARD_BUTTON_DPAD_DOWN,
  STANDARD_BUTTON_DPAD_LEFT,
  STANDARD_BUTTON_DPAD_RIGHT,
  STANDARD_BUTTON_DPAD_UP,
  STANDARD_BUTTON_EAST,
  STANDARD_BUTTON_HOME,
  STANDARD_BUTTON_L1,
  STANDARD_BUTTON_L2,
  STANDARD_BUTTON_L3,
  STANDARD_BUTTON_NORTH,
  STANDARD_BUTTON_R1,
  STANDARD_BUTTON_R2,
  STANDARD_BUTTON_R3,
  STANDARD_BUTTON_SELECT,
  STANDARD_BUTTON_SOUTH,
  STANDARD_BUTTON_START,
  STANDARD_BUTTON_TOUCHPAD,
  STANDARD_BUTTON_WEST,
} from '../constants/standard-mappings'
import { applyRadialDeadzone, applyTriggerDeadzone } from './deadzone'

/** Safely extracts button pressed status without throwing if index is out of bounds */
export function isButtonPressed(gamepad: Gamepad, index: number): boolean {
  if (!gamepad.buttons || index < 0 || index >= gamepad.buttons.length) return false
  const btn = gamepad.buttons[index]
  return Boolean(btn && btn.pressed)
}

/** Safely extracts button analog value (0.0 - 1.0) */
export function getButtonValue(gamepad: Gamepad, index: number): number {
  if (!gamepad.buttons || index < 0 || index >= gamepad.buttons.length) return 0
  const btn = gamepad.buttons[index]
  if (!btn) return 0
  if (typeof btn.value === 'number' && !isNaN(btn.value)) {
    return Math.max(0, Math.min(1, btn.value))
  }
  return btn.pressed ? 1 : 0
}

/** Safely extracts axis value (-1.0 to 1.0) */
export function getAxisValue(gamepad: Gamepad, index: number): number {
  if (!gamepad.axes || index < 0 || index >= gamepad.axes.length) return 0
  const val = gamepad.axes[index]
  return isNaN(val) ? 0 : Math.max(-1, Math.min(1, val))
}

/**
 * Standard normalizer for W3C standard mapping gamepads.
 * Applies radial deadzones for left and right sticks, triggers deadzone, and axis inversions.
 */
export function normalizeStandardGamepad(
  gamepad: Gamepad,
  settings: GamepadSettings,
): StandardGamepadInput {
  // 1. Process Buttons
  const buttons: StandardGamepadButtons = {
    south: isButtonPressed(gamepad, STANDARD_BUTTON_SOUTH),
    east: isButtonPressed(gamepad, STANDARD_BUTTON_EAST),
    west: isButtonPressed(gamepad, STANDARD_BUTTON_WEST),
    north: isButtonPressed(gamepad, STANDARD_BUTTON_NORTH),

    start: isButtonPressed(gamepad, STANDARD_BUTTON_START),
    select: isButtonPressed(gamepad, STANDARD_BUTTON_SELECT),

    l1: isButtonPressed(gamepad, STANDARD_BUTTON_L1),
    r1: isButtonPressed(gamepad, STANDARD_BUTTON_R1),

    l3: isButtonPressed(gamepad, STANDARD_BUTTON_L3),
    r3: isButtonPressed(gamepad, STANDARD_BUTTON_R3),

    dpadUp: isButtonPressed(gamepad, STANDARD_BUTTON_DPAD_UP),
    dpadDown: isButtonPressed(gamepad, STANDARD_BUTTON_DPAD_DOWN),
    dpadLeft: isButtonPressed(gamepad, STANDARD_BUTTON_DPAD_LEFT),
    dpadRight: isButtonPressed(gamepad, STANDARD_BUTTON_DPAD_RIGHT),

    home: isButtonPressed(gamepad, STANDARD_BUTTON_HOME),
    touchpad: isButtonPressed(gamepad, STANDARD_BUTTON_TOUCHPAD),
  }

  // 2. Process Triggers (Analog + Deadzone)
  const rawL2 = getButtonValue(gamepad, STANDARD_BUTTON_L2)
  const rawR2 = getButtonValue(gamepad, STANDARD_BUTTON_R2)

  const normL2 = applyTriggerDeadzone(rawL2, settings.triggerDeadzone)
  const normR2 = applyTriggerDeadzone(rawR2, settings.triggerDeadzone)

  // 3. Process Left Stick (Radial Deadzone)
  const rawLeftX = getAxisValue(gamepad, STANDARD_AXIS_LEFT_X)
  const rawLeftY = getAxisValue(gamepad, STANDARD_AXIS_LEFT_Y)
  const leftStick = applyRadialDeadzone(
    rawLeftX,
    rawLeftY,
    settings.leftStickDeadzone,
    settings.invertLeftX,
    settings.invertLeftY,
  )

  // 4. Process Right Stick (Radial Deadzone)
  const rawRightX = getAxisValue(gamepad, STANDARD_AXIS_RIGHT_X)
  const rawRightY = getAxisValue(gamepad, STANDARD_AXIS_RIGHT_Y)
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
}
