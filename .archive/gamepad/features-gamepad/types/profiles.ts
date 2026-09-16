import type { GamepadSettings, GamepadType, StandardGamepadInput } from './gamepad'

export interface GamepadProfile {
  id: string
  name: string
  type: GamepadType
  matches(gamepad: Gamepad): boolean
  normalize(gamepad: Gamepad, settings: GamepadSettings): StandardGamepadInput
}
