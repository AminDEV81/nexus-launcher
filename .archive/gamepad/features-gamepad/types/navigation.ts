export type InputModality = 'keyboard' | 'mouse' | 'gamepad'

export type GamepadNavigationContext =
  | 'launcher'
  | 'library'
  | 'sidebar'
  | 'modal'
  | 'settings'
  | 'search'
  | 'command-palette'
  | 'dialog'
  | 'text-input'

export type NavigationDirection = 'up' | 'down' | 'left' | 'right'

export interface SpatialCandidate {
  element: HTMLElement
  rect: DOMRect
  score: number
  group?: string
  priority: number
}
