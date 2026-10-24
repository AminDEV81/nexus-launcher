import { useEffect } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { useCloseFlowStore } from '@/store/close-flow-store'
import { useAppearanceSettingsStore } from '@/store/appearance-settings-store'

const CLOSE_ANIMATION_MS = 750

/**
 * Intercepts every way the window can be asked to close (title bar X, taskbar close, Alt+F4)
 * and coordinates the CloseConfirmModal actions:
 * - "Run in Background": resets modal state and hides the window cleanly to the system tray.
 * - "Stay in Nexus": cancels close and keeps the user in the launcher.
 * - "Exit Nexus Completely": plays the closing animation and exits the application cleanly.
 * Also listens for `app://window-restored` from single-instance / tray icon clicks to ensure
 * the modal state is always clean when the window is reopened from background.
 */
export function useWindowCloseIntercept() {
  useEffect(() => {
    const appWindow = getCurrentWindow()
    let bypass = false
    let cancelled = false
    let unlistenClose: (() => void) | null = null
    let unlistenRestored: (() => void) | null = null

    listen('app://window-restored', () => {
      useCloseFlowStore.getState().reset()
    }).then((fn) => {
      if (cancelled) fn()
      else unlistenRestored = fn
    })

    // Also subscribe directly to `isBackgrounding` / `isClosing` so clicking buttons in
    // CloseConfirmModal works whether the modal was opened via TitleBar button or Alt+F4!
    const unsubscribeStore = useCloseFlowStore.subscribe(async (state, prevState) => {
      if (state.isBackgrounding && !prevState.isBackgrounding) {
        useCloseFlowStore.getState().reset()
        try {
          await invoke('hide_to_tray')
        } catch {
          await appWindow.hide().catch(() => {})
        }
      } else if (state.isClosing && !prevState.isClosing) {
        const speed = useAppearanceSettingsStore.getState().animationSpeed
        await new Promise((resolve) => setTimeout(resolve, CLOSE_ANIMATION_MS * speed))
        bypass = true
        try {
          await invoke('exit_application')
        } catch {
          await appWindow.destroy().catch(() => {})
        }
      }
    })

    appWindow
      .onCloseRequested(async (event) => {
        if (bypass) return

        event.preventDefault()
        if (useCloseFlowStore.getState().isConfirmOpen) return

        useCloseFlowStore.getState().openConfirm()
      })
      .then((fn) => {
        if (cancelled) fn()
        else unlistenClose = fn
      })

    return () => {
      cancelled = true
      unsubscribeStore()
      unlistenClose?.()
      unlistenRestored?.()
    }
  }, [])
}
