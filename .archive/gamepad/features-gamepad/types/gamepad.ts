export type GamepadType = 'dualsense' | 'dualshock4' | 'xbox' | 'generic' | 'unknown'

export type BatteryStatus = 'percentage' | 'charging' | 'wired' | 'unknown' | 'unsupported'

export interface GamepadBattery {
  status: BatteryStatus
  level?: number // 0.0 to 1.0 (or undefined if unknown/wired)
  charging?: boolean
  isWired?: boolean
}

export interface GamepadInfo {
  id: string
  index: number
  connected: boolean
  displayName: string
  type: GamepadType
  mapping?: string
  vendorId?: string
  productId?: string
  hasRumble: boolean
  battery?: GamepadBattery
}

export interface StandardGamepadButtons {
  south: boolean
  east: boolean
  west: boolean
  north: boolean

  start: boolean
  select: boolean

  l1: boolean
  r1: boolean

  l3: boolean
  r3: boolean

  dpadUp: boolean
  dpadDown: boolean
  dpadLeft: boolean
  dpadRight: boolean

  home?: boolean
  touchpad?: boolean
}

export interface StandardGamepadAnalog {
  l2: number
  r2: number

  leftX: number
  leftY: number

  rightX: number
  rightY: number
}

export interface StandardGamepadInput {
  buttons: StandardGamepadButtons
  analog: StandardGamepadAnalog
}

export interface GamepadSettings {
  enabled: boolean
  navigationEnabled: boolean
  showNavigationHud: boolean

  leftStickDeadzone: number
  rightStickDeadzone: number
  triggerDeadzone: number
  triggerThreshold: number

  rumbleEnabled: boolean

  invertLeftX: boolean
  invertLeftY: boolean
  invertRightX: boolean
  invertRightY: boolean

  primaryControllerId?: string

  glyphPreference: 'auto' | 'xbox' | 'playstation'
}

export interface RumbleOptions {
  weakMagnitude?: number
  strongMagnitude?: number
  duration?: number
  startDelay?: number
}
