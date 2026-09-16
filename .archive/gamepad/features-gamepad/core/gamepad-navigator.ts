import type { StandardGamepadInput } from '../types/gamepad'
import type { InputModality, NavigationDirection } from '../types/navigation'
import { gamepadFocusManager } from './gamepad-focus-manager'
import { gamepadActionDispatcher } from './gamepad-action-dispatcher'
import { InputRepeatController } from '../utils/input-repeat'
import { resolveNavigationContext } from './gamepad-navigation-context'
import { useGamepadStore } from '../store/gamepad-store'

export class GamepadNavigator {
  private static instance: GamepadNavigator | null = null

  private repeatController = new InputRepeatController()
  private modality: InputModality = 'mouse'
  private prevButtons: Record<string, boolean> = {}

  private isAttached = false

  private constructor() {}

  public static getInstance(): GamepadNavigator {
    if (!GamepadNavigator.instance) {
      GamepadNavigator.instance = new GamepadNavigator()
    }
    return GamepadNavigator.instance
  }

  public attachListeners(): void {
    if (this.isAttached || typeof window === 'undefined') return
    this.isAttached = true

    window.addEventListener('mousemove', this.handleMouseMove, { passive: true })
    window.addEventListener('mousedown', this.handleMouseDown, { passive: true })
    window.addEventListener('keydown', this.handleKeyDown, { passive: true })
  }

  public detachListeners(): void {
    if (!this.isAttached || typeof window === 'undefined') return
    this.isAttached = false

    window.removeEventListener('mousemove', this.handleMouseMove)
    window.removeEventListener('mousedown', this.handleMouseDown)
    window.removeEventListener('keydown', this.handleKeyDown)
    this.repeatController.reset()
  }

  public getModality(): InputModality {
    return this.modality
  }

  private setModality(newModality: InputModality): void {
    if (this.modality !== newModality) {
      this.modality = newModality
      gamepadFocusManager.setModality(newModality)
    }
  }

  private handleMouseMove = (): void => {
    this.setModality('mouse')
  }

  private handleMouseDown = (): void => {
    this.setModality('mouse')
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (['Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
      this.setModality('keyboard')
    }
  }

  /**
   * Called on every active Gamepad polling frame.
   */
  public processInput(input: StandardGamepadInput, timestamp = Date.now()): void {
    const { settings } = useGamepadStore.getState()
    if (!settings.enabled || !settings.navigationEnabled) {
      return
    }

    const { buttons, analog } = input

    // 1. Determine directional input (D-Pad or Left Stick)
    let direction: NavigationDirection | null = null

    // Preserve active direction if its physical button is still held (prevents diagonal rocking wobble)
    const currentActive = this.repeatController.getActiveDirection()
    if (currentActive === 'up' && buttons.dpadUp) {
      direction = 'up'
    } else if (currentActive === 'down' && buttons.dpadDown) {
      direction = 'down'
    } else if (currentActive === 'left' && buttons.dpadLeft) {
      direction = 'left'
    } else if (currentActive === 'right' && buttons.dpadRight) {
      direction = 'right'
    } else if (buttons.dpadUp) {
      direction = 'up'
      this.repeatController.resetStick()
    } else if (buttons.dpadDown) {
      direction = 'down'
      this.repeatController.resetStick()
    } else if (buttons.dpadLeft) {
      direction = 'left'
      this.repeatController.resetStick()
    } else if (buttons.dpadRight) {
      direction = 'right'
      this.repeatController.resetStick()
    } else {
      direction = this.repeatController.resolveStickDirection(analog.leftX, analog.leftY, timestamp)
    }

    // Check if any button is pressed or stick engaged
    const hasAnyGamepadInteraction =
      Boolean(direction) ||
      buttons.south ||
      buttons.east ||
      buttons.west ||
      buttons.north ||
      buttons.l1 ||
      buttons.r1 ||
      buttons.start ||
      buttons.select

    if (hasAnyGamepadInteraction) {
      this.setModality('gamepad')
    }

    const context = resolveNavigationContext()

    // 2. Process Directional Navigation
    if (context !== 'text-input') {
      const shouldStep = this.repeatController.check(direction, timestamp)
      if (shouldStep && direction) {
        gamepadFocusManager.focusNext(direction)
      }
    }

    // 3. Process Rising-Edge Actions (Button transitions from false -> true)
    const isRisingEdge = (key: string, current: boolean) => {
      const was = Boolean(this.prevButtons[key])
      return current && !was
    }

    if (context === 'text-input') {
      // In text inputs, only allow East (B) to unfocus / cancel typing
      if (isRisingEdge('east', buttons.east)) {
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur()
        }
      }
    } else {
      // Normal UI context action dispatching
      if (isRisingEdge('south', buttons.south)) {
        gamepadActionDispatcher.activate()
      } else if (isRisingEdge('east', buttons.east)) {
        gamepadActionDispatcher.back()
      } else if (isRisingEdge('west', buttons.west)) {
        gamepadActionDispatcher.secondary()
      } else if (isRisingEdge('north', buttons.north)) {
        gamepadActionDispatcher.search()
      } else if (isRisingEdge('l1', buttons.l1)) {
        gamepadActionDispatcher.previousTab()
      } else if (isRisingEdge('r1', buttons.r1)) {
        gamepadActionDispatcher.nextTab()
      } else if (isRisingEdge('select', buttons.select)) {
        gamepadActionDispatcher.toggleSidebar()
      }
    }

    // Save current button states for rising-edge detection
    this.prevButtons = {
      south: buttons.south,
      east: buttons.east,
      west: buttons.west,
      north: buttons.north,
      l1: buttons.l1,
      r1: buttons.r1,
      start: buttons.start,
      select: buttons.select,
      dpadUp: buttons.dpadUp,
      dpadDown: buttons.dpadDown,
      dpadLeft: buttons.dpadLeft,
      dpadRight: buttons.dpadRight,
    }
  }
}

export const gamepadNavigator = GamepadNavigator.getInstance()
