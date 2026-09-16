import { useEffect, useState } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'

/**
 * Whether the window currently fills the screen (maximized *or*
 * fullscreen). Drives the shell's shape: the floating window paints a
 * rounded card with a border and shadow over the transparent window
 * surface, but an edge-to-edge window must be square — rounded corners
 * there would show the desktop through the transparent gaps and the
 * border/shadow would draw hard on the screen edges.
 *
 * `onResized` is the event source (Tauri has no dedicated
 * maximize/fullscreen change event in v2): both states always resize
 * the window, so re-reading `isMaximized()`/`isFullscreen()` on resize
 * catches every transition, including the window-state plugin
 * restoring a maximized layout at startup.
 */
export function useWindowFillsScreen() {
  const [fillsScreen, setFillsScreen] = useState(false)

  useEffect(() => {
    if (!isTauri()) return
    const current = getCurrentWindow()
    let disposed = false

    async function refresh() {
      try {
        const [maximized, fullscreen] = await Promise.all([
          current.isMaximized(),
          current.isFullscreen(),
        ])
        if (!disposed) setFillsScreen(maximized || fullscreen)
      } catch {
        // The window can be gone during teardown; nothing to update.
      }
    }

    const unlistenPromise = current.onResized(() => void refresh())
    void refresh()

    return () => {
      disposed = true
      void unlistenPromise.then((unlisten) => unlisten())
    }
  }, [])

  return fillsScreen
}
