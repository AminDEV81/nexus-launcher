import type { NavigationDirection } from '../types/navigation'
import { findBestSpatialCandidate } from '../utils/spatial-navigation'
import { playProfileSwitch } from '@/lib/sound-engine'

export class GamepadFocusManager {
  private static instance: GamepadFocusManager | null = null

  private currentFocusedElement: HTMLElement | null = null
  private savedPreviousElement: HTMLElement | null = null
  private isGamepadModality = false

  private constructor() {}

  public static getInstance(): GamepadFocusManager {
    if (!GamepadFocusManager.instance) {
      GamepadFocusManager.instance = new GamepadFocusManager()
    }
    return GamepadFocusManager.instance
  }

  public setModality(modality: 'keyboard' | 'mouse' | 'gamepad'): void {
    const wasGamepad = this.isGamepadModality
    this.isGamepadModality = modality === 'gamepad'

    if (!this.isGamepadModality && wasGamepad && this.currentFocusedElement) {
      this.currentFocusedElement.classList.remove('nx-gamepad-focus')
      this.currentFocusedElement.removeAttribute('data-gamepad-focused')
    } else if (this.isGamepadModality && !wasGamepad && this.currentFocusedElement) {
      this.currentFocusedElement.classList.add('nx-gamepad-focus')
      this.currentFocusedElement.setAttribute('data-gamepad-focused', 'true')
    }
  }

  public getFocusedElement(): HTMLElement | null {
    if (this.currentFocusedElement && !document.body.contains(this.currentFocusedElement)) {
      this.currentFocusedElement = null
    }
    return this.currentFocusedElement
  }

  /**
   * Sets focus to a specific element.
   */
  public focus(element: HTMLElement | null, isRapidRepeat = false): void {
    if (!element || !document.body.contains(element)) {
      return
    }

    if (this.currentFocusedElement && this.currentFocusedElement !== element) {
      this.currentFocusedElement.classList.remove('nx-gamepad-focus')
      this.currentFocusedElement.removeAttribute('data-gamepad-focused')
    }

    this.currentFocusedElement = element

    if (this.isGamepadModality) {
      element.classList.add('nx-gamepad-focus')
      element.setAttribute('data-gamepad-focused', 'true')
    }

    // Call native element focus without browser automatic scroll jump
    try {
      element.focus({ preventScroll: true })
    } catch {
      // Ignored if element is not natively focusable
    }

    // Smooth scroll into viewport (or instant scroll if navigating rapidly)
    try {
      element.scrollIntoView({
        behavior: isRapidRepeat ? 'auto' : 'smooth',
        block: 'nearest',
        inline: 'nearest',
      })
    } catch {
      // Fallback
    }

    // Subtle audio feedback
    try {
      playProfileSwitch()
    } catch {
      // Audio error safety
    }
  }

  /**
   * Clears the current gamepad focus styling.
   */
  public clearFocus(): void {
    if (this.currentFocusedElement) {
      this.currentFocusedElement.classList.remove('nx-gamepad-focus')
      this.currentFocusedElement.removeAttribute('data-gamepad-focused')
      this.currentFocusedElement = null
    }
  }

  /**
   * Stores previous focus before entering a modal.
   */
  public savePreviousFocus(): void {
    this.savedPreviousElement = this.getFocusedElement()
  }

  /**
   * Restores focus after modal closes.
   */
  public restorePreviousFocus(): void {
    if (this.savedPreviousElement && document.body.contains(this.savedPreviousElement)) {
      this.focus(this.savedPreviousElement)
    } else {
      // Find fallback candidate
      const candidates = this.getEligibleElements()
      if (candidates.length > 0) {
        this.focus(candidates[0])
      }
    }
    this.savedPreviousElement = null
  }

  /**
   * Moves focus in the specified spatial direction.
   */
  public focusNext(direction: NavigationDirection, isRapidRepeat = false): boolean {
    const candidates = this.getEligibleElements()
    if (candidates.length === 0) {
      return false
    }

    const current = this.getFocusedElement()

    // If no active element, focus first valid candidate
    if (!current || !candidates.includes(current)) {
      this.focus(candidates[0], isRapidRepeat)
      return true
    }

    const next = findBestSpatialCandidate(current, candidates, direction)
    if (next) {
      this.focus(next, isRapidRepeat)
      return true
    }

    return false
  }

  /**
   * Collects all currently eligible, visible focusable elements respecting modal traps.
   */
  public getEligibleElements(): HTMLElement[] {
    if (typeof document === 'undefined') return []

    // 1. Check if an active modal or dialog is open
    const modalContainer = this.findActiveModalContainer()
    const searchRoot: Element = modalContainer ?? document.body

    // 2. Query explicit focusables and standard interactive tags
    const selector = [
      '[data-gamepad-focusable]:not([data-gamepad-disabled]):not([disabled])',
      'button:not([disabled]):not([tabindex="-1"]):not([data-gamepad-disabled])',
      'a[href]:not([tabindex="-1"]):not([data-gamepad-disabled])',
      '[tabindex="0"]:not([disabled]):not([data-gamepad-disabled])',
    ].join(', ')

    const elements = Array.from(searchRoot.querySelectorAll<HTMLElement>(selector))

    // Filter by visibility (must have bounding rect and not hidden)
    return elements.filter((el) => {
      // Don't focus elements explicitly marked as gamepad-disabled or tabindex -1
      if (el.getAttribute('tabindex') === '-1') return false
      if (
        el.hasAttribute('data-gamepad-disabled') ||
        el.closest('[data-gamepad-disabled="true"]')
      ) {
        return false
      }

      // Don't focus elements inside hidden containers
      if (el.closest('[aria-hidden="true"]')) return false

      // Ignore elements nested inside a gamepad card unless explicitly marked as focusable
      const parentCard = el.parentElement?.closest('[data-gamepad-card]')
      if (parentCard && !el.hasAttribute('data-gamepad-focusable')) {
        return false
      }

      const rect = el.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return false

      const style = window.getComputedStyle(el)
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return false
      }

      return true
    })
  }

  /**
   * Returns active modal container if one exists, or null.
   */
  public findActiveModalContainer(): HTMLElement | null {
    if (typeof document === 'undefined') return null

    // Look for elements with dialog role or modal class
    const modal = document.querySelector<HTMLElement>(
      '[data-gamepad-modal="true"], [role="dialog"]:not([aria-hidden="true"]), .modal-container',
    )

    return modal && modal.offsetParent !== null ? modal : null
  }
}

export const gamepadFocusManager = GamepadFocusManager.getInstance()
