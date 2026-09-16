import { useEffect } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useCloseFlowStore } from '@/store/close-flow-store'
import { useAppearanceSettingsStore } from '@/store/appearance-settings-store'

/** Matches `ClosingOverlay`'s un-scaled animation duration (last facet
 *  fires at 0.2s and takes 0.5s to fly apart, so ~0.7s total, with a
 *  little slack) at the default 1x speed — see that component for why
 *  this has to track its `speed`-scaled duration, not just this
 *  constant, at any other speed. */
const CLOSE_ANIMATION_MS = 750

/**
 * Intercepts every way the window can be asked to close — the in-app
 * title bar button (which now calls `appWindow.close()` directly, same
 * as any other close trigger), the OS taskbar's X, Alt+F4 — so all of
 * them go through the same "are you sure?" popup.
 *
 * Follows Tauri's own recommended pattern for this exactly: the
 * `onCloseRequested` handler is `async` and *awaits* the user's answer
 * before returning; only calling `event.preventDefault()` if they
 * cancel. If they confirm, the handler just finishes without calling
 * `preventDefault()`, and Tauri proceeds to close the *original*
 * request itself — no second, separate `close()` call is needed for
 * that path.
 *
 * The one place a second `close()` call genuinely happens is after the
 * closing animation finishes. That follow-up call re-triggers this same
 * listener (it's still attached), so a plain boolean ref short-circuits
 * it immediately — recognized as "already confirmed", it returns without
 * prompting again, letting that real close through.
 */
export function useWindowCloseIntercept() {
  useEffect(() => {
    const appWindow = getCurrentWindow()
    let bypass = false
    let cancelled = false
    let unlisten: (() => void) | null = null

    appWindow
      .onCloseRequested(async (event) => {
        if (bypass) return

        event.preventDefault()
        if (useCloseFlowStore.getState().isConfirmOpen) return

        useCloseFlowStore.getState().openConfirm()

        const action = await new Promise<'quit' | 'background' | 'stay'>((resolve) => {
          const unsubscribe = useCloseFlowStore.subscribe((state) => {
            if (state.isClosing) {
              unsubscribe()
              resolve('quit')
            } else if (state.isBackgrounding) {
              unsubscribe()
              resolve('background')
            } else if (!state.isConfirmOpen) {
              // Popup closed without confirming — the user clicked "Stay".
              unsubscribe()
              resolve('stay')
            }
          })
        })

        if (action === 'stay') {
          useCloseFlowStore.getState().reset()
          return
        }

        if (action === 'background') {
          useCloseFlowStore.getState().reset()
          try {
            await appWindow.hide()
          } catch (err) {
            console.error('Failed to hide window to background:', err)
          }
          return
        }

        // `isClosing` is already true at this point (set by
        // `beginClosing()`), so `ClosingOverlay` is animating right now —
        // give it time to actually play before the window disappears.
        const speed = useAppearanceSettingsStore.getState().animationSpeed
        await new Promise((resolve) => setTimeout(resolve, CLOSE_ANIMATION_MS * speed))

        // `destroy()`, not `close()`: this second call re-enters
        // `CloseRequested`, and on some setups the re-entry left the
        // process alive after the animation (the "have to End Task"
        // bug). `destroy()` skips the request cycle entirely and tears
        // the window down unconditionally — exactly right once the user
        // has confirmed and the goodbye animation has played.
        bypass = true
        await appWindow.destroy()
      })
      .then((fn) => {
        if (cancelled) fn()
        else unlisten = fn
      })

    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [])
}
