import { useCommandPaletteStore } from '@/store/command-palette-store'
import { useUiStore } from '@/store/ui-store'
import { gamepadFocusManager } from './gamepad-focus-manager'
import { playClick } from '@/lib/sound-engine'

const PRIMARY_NAV_TABS = ['/', '/hub', '/downloads', '/stats', '/settings'] as const

type NavigationDelegate = (to: string | number) => void
let customNavigate: NavigationDelegate | null = null

export function setGamepadNavigate(delegate: NavigationDelegate | null) {
  customNavigate = delegate
}

function doNavigate(to: string | number) {
  if (customNavigate) {
    customNavigate(to)
    return
  }
  if (typeof window === 'undefined') return
  if (typeof to === 'number') {
    window.history.go(to)
  } else {
    window.location.hash = `#${to.startsWith('/') ? to : `/${to}`}`
  }
}

function getCurrentPathname(): string {
  if (typeof window === 'undefined') return '/'
  const hash = window.location.hash.replace(/^#/, '')
  const path = hash.split('?')[0] ?? '/'
  return path.startsWith('/') ? path : `/${path}`
}

export class GamepadActionDispatcher {
  private static instance: GamepadActionDispatcher | null = null

  private constructor() {}

  public static getInstance(): GamepadActionDispatcher {
    if (!GamepadActionDispatcher.instance) {
      GamepadActionDispatcher.instance = new GamepadActionDispatcher()
    }
    return GamepadActionDispatcher.instance
  }

  /**
   * South (A / Cross): Activates the currently focused element.
   */
  public activate(): boolean {
    const el = gamepadFocusManager.getFocusedElement()
    if (!el) return false

    try {
      playClick()
    } catch {
      // Audio fallback
    }

    // Trigger standard DOM click
    el.click()
    return true
  }

  /**
   * East (B / Circle): Contextual back action.
   * Closes active modal -> closes search -> closes details panel -> router back.
   */
  public back(): boolean {
    // 1. Close active modal
    const modal = gamepadFocusManager.findActiveModalContainer()
    if (modal) {
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Escape',
          code: 'Escape',
          bubbles: true,
          cancelable: true,
        }),
      )
      return true
    }

    // 2. Close command palette if open
    if (useCommandPaletteStore.getState().isOpen) {
      useCommandPaletteStore.getState().close()
      return true
    }

    // 3. Close game details panel if game is selected
    if (useUiStore.getState().selectedGameId !== null) {
      useUiStore.getState().selectGame(null)
      return true
    }

    // 4. If on a sub-route (e.g. /hub/:id, /collections/:id), navigate back
    const currentPath = getCurrentPathname()
    if (!PRIMARY_NAV_TABS.includes(currentPath as (typeof PRIMARY_NAV_TABS)[number])) {
      doNavigate(-1)
      return true
    }

    return false
  }

  /**
   * West (X / Square): Secondary action on the focused element (e.g. favorite toggle, context menu).
   */
  public secondary(): boolean {
    const el = gamepadFocusManager.getFocusedElement()
    if (!el) return false

    // Check for explicit secondary action button inside or on element
    const secondaryBtn = el.hasAttribute('data-gamepad-secondary')
      ? el
      : el.querySelector<HTMLElement>('[data-gamepad-secondary="true"]')

    if (secondaryBtn) {
      secondaryBtn.click()
      return true
    }

    // Dispatch context menu event as fallback secondary action
    el.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        view: window,
      }),
    )
    return true
  }

  /**
   * North (Y / Triangle): Opens the Command Palette / Quick Search.
   */
  public search(): boolean {
    // Do not open if modal is capturing input
    if (gamepadFocusManager.findActiveModalContainer()) {
      return false
    }

    useCommandPaletteStore.getState().open()
    return true
  }

  /**
   * LB / L1: Switch to previous primary route tab.
   */
  public previousTab(): boolean {
    if (gamepadFocusManager.findActiveModalContainer()) {
      return false
    }

    const currentPath = getCurrentPathname()
    const currentIndex = PRIMARY_NAV_TABS.indexOf(currentPath as (typeof PRIMARY_NAV_TABS)[number])
    const newIndex = currentIndex <= 0 ? PRIMARY_NAV_TABS.length - 1 : currentIndex - 1

    doNavigate(PRIMARY_NAV_TABS[newIndex])
    return true
  }

  /**
   * RB / R1: Switch to next primary route tab.
   */
  public nextTab(): boolean {
    if (gamepadFocusManager.findActiveModalContainer()) {
      return false
    }

    const currentPath = getCurrentPathname()
    const currentIndex = PRIMARY_NAV_TABS.indexOf(currentPath as (typeof PRIMARY_NAV_TABS)[number])
    const newIndex = (currentIndex + 1) % PRIMARY_NAV_TABS.length

    doNavigate(PRIMARY_NAV_TABS[newIndex])
    return true
  }

  /**
   * Select / View: Toggle sidebar collapsed state.
   */
  public toggleSidebar(): boolean {
    useUiStore.getState().toggleSidebar()
    return true
  }
}

export const gamepadActionDispatcher = GamepadActionDispatcher.getInstance()
