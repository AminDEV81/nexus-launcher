import type { GamepadNavigationContext } from '../types/navigation'
import { gamepadFocusManager } from './gamepad-focus-manager'
import { useCommandPaletteStore } from '@/store/command-palette-store'

export function resolveNavigationContext(): GamepadNavigationContext {
  if (typeof document === 'undefined') return 'launcher'

  // 1. Text input / typing actively focused
  const activeEl = document.activeElement
  if (
    activeEl instanceof HTMLInputElement ||
    activeEl instanceof HTMLTextAreaElement ||
    activeEl?.getAttribute('contenteditable') === 'true'
  ) {
    return 'text-input'
  }

  // 2. Command Palette open
  if (useCommandPaletteStore.getState().isOpen) {
    return 'command-palette'
  }

  // 3. Modal / Dialog open
  if (gamepadFocusManager.findActiveModalContainer()) {
    return 'modal'
  }

  // 4. Focus inside sidebar
  const currentFocused = gamepadFocusManager.getFocusedElement()
  if (currentFocused?.closest('aside, nav, [data-gamepad-group="sidebar"]')) {
    return 'sidebar'
  }

  // 5. Route-specific context
  const hash = typeof window !== 'undefined' ? window.location.hash.replace(/^#/, '') : ''
  const pathname = hash.split('?')[0] || '/'
  if (pathname.startsWith('/settings')) {
    return 'settings'
  }

  return 'library'
}
