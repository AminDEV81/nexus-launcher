import type { GamepadSettings } from '../types/gamepad'

export const STANDARD_BUTTON_SOUTH = 0
export const STANDARD_BUTTON_EAST = 1
export const STANDARD_BUTTON_WEST = 2
export const STANDARD_BUTTON_NORTH = 3
export const STANDARD_BUTTON_L1 = 4
export const STANDARD_BUTTON_R1 = 5
export const STANDARD_BUTTON_L2 = 6
export const STANDARD_BUTTON_R2 = 7
export const STANDARD_BUTTON_SELECT = 8
export const STANDARD_BUTTON_START = 9
export const STANDARD_BUTTON_L3 = 10
export const STANDARD_BUTTON_R3 = 11
export const STANDARD_BUTTON_DPAD_UP = 12
export const STANDARD_BUTTON_DPAD_DOWN = 13
export const STANDARD_BUTTON_DPAD_LEFT = 14
export const STANDARD_BUTTON_DPAD_RIGHT = 15
export const STANDARD_BUTTON_HOME = 16
export const STANDARD_BUTTON_TOUCHPAD = 17

export const STANDARD_AXIS_LEFT_X = 0
export const STANDARD_AXIS_LEFT_Y = 1
export const STANDARD_AXIS_RIGHT_X = 2
export const STANDARD_AXIS_RIGHT_Y = 3

export const DEFAULT_LEFT_STICK_DEADZONE = 0.12
export const DEFAULT_RIGHT_STICK_DEADZONE = 0.12
export const DEFAULT_TRIGGER_DEADZONE = 0.05
export const DEFAULT_TRIGGER_THRESHOLD = 0.35

export const DEFAULT_GAMEPAD_SETTINGS: GamepadSettings = {
  enabled: true,
  navigationEnabled: true,
  showNavigationHud: true,
  leftStickDeadzone: DEFAULT_LEFT_STICK_DEADZONE,
  rightStickDeadzone: DEFAULT_RIGHT_STICK_DEADZONE,
  triggerDeadzone: DEFAULT_TRIGGER_DEADZONE,
  triggerThreshold: DEFAULT_TRIGGER_THRESHOLD,
  rumbleEnabled: true,
  invertLeftX: false,
  invertLeftY: false,
  invertRightX: false,
  invertRightY: false,
  primaryControllerId: undefined,
  glyphPreference: 'auto',
}
