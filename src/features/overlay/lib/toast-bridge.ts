import { toast } from 'sonner'
import { pushOverlayNotification } from '../services/overlay'
import type { NotificationKind } from '../types/overlay'

let installed = false

/** sonner accepts strings or React nodes; only plain text can be shown in the overlay. */
function toText(message: unknown): string | null {
  return typeof message === 'string' && message.trim() ? message : null
}

function mirror(kind: NotificationKind, message: unknown, data?: unknown) {
  const title = toText(message)
  if (!title) return
  const description =
    data && typeof data === 'object' && 'description' in data
      ? toText((data as { description?: unknown }).description)
      : null
  // The backend drops it when the overlay isn't showing or notifications are
  // off, so this is a cheap no-op outside of a game.
  void pushOverlayNotification({ kind, title, body: description, source: 'app' }).catch(() => {})
}

/**
 * Mirrors the launcher's own toasts (download finished, Gaming Mode, errors…)
 * into the in-game overlay, so they are visible while a game is fullscreen
 * and the launcher window is hidden. Install once from the main window.
 */
export function installOverlayToastBridge(): void {
  if (installed) return
  installed = true

  const wrap = (method: 'success' | 'error' | 'info' | 'warning', kind: NotificationKind) => {
    const original = toast[method].bind(toast) as (...args: unknown[]) => unknown
    ;(toast as unknown as Record<string, unknown>)[method] = (message: unknown, data?: unknown) => {
      mirror(kind, message, data)
      return original(message, data)
    }
  }

  wrap('success', 'success')
  wrap('error', 'error')
  wrap('info', 'info')
  wrap('warning', 'warning')
}
