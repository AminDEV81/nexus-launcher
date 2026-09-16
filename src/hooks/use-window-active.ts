import { useSyncExternalStore } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'

/**
 * A single source of truth for whether this application's native window is
 * active. `visibilitychange` alone is not enough in a desktop WebView: an
 * unfocused Tauri window remains visible, so the browser otherwise continues
 * to composite CSS animations and decode media at full speed.
 */
let active =
  typeof document === 'undefined' || (document.visibilityState === 'visible' && document.hasFocus())
let listening = false
let nativeUnlisten: (() => void) | undefined
let listenerGeneration = 0
const subscribers = new Set<() => void>()

function setActive(nextActive: boolean) {
  if (active === nextActive) return
  active = nextActive
  subscribers.forEach((subscriber) => subscriber())
}

function updateFromDocument() {
  setActive(document.visibilityState === 'visible' && document.hasFocus())
}

function startListening() {
  if (listening || typeof window === 'undefined') return
  listening = true
  const generation = ++listenerGeneration

  window.addEventListener('focus', updateFromDocument)
  window.addEventListener('blur', updateFromDocument)
  document.addEventListener('visibilitychange', updateFromDocument)
  updateFromDocument()

  // The DOM events cover browsers and most WebView cases. Tauri's native
  // focus event is included as well because a Windows WebView can remain
  // `visible` while its host window has lost focus.
  if (isTauri()) {
    void getCurrentWindow()
      .onFocusChanged(({ payload: focused }) => setActive(focused))
      .then((unlisten) => {
        // The app can unmount while the native listener is being registered.
        // Do not leave that late listener attached to a disposed React tree.
        if (listening && generation === listenerGeneration) {
          nativeUnlisten = unlisten
        } else {
          unlisten()
        }
      })
      .catch(() => {
        // A browser preview has no native window; its DOM focus events remain
        // the graceful fallback.
      })
  }
}

function stopListening() {
  if (!listening || typeof window === 'undefined') return
  listening = false
  listenerGeneration += 1
  window.removeEventListener('focus', updateFromDocument)
  window.removeEventListener('blur', updateFromDocument)
  document.removeEventListener('visibilitychange', updateFromDocument)
  nativeUnlisten?.()
  nativeUnlisten = undefined
}

function subscribe(subscriber: () => void) {
  subscribers.add(subscriber)
  startListening()
  return () => {
    subscribers.delete(subscriber)
    if (subscribers.size === 0) stopListening()
  }
}

function getSnapshot() {
  return active
}

/** Returns false as soon as the app loses focus, including in Tauri. */
export function useWindowActive() {
  return useSyncExternalStore(subscribe, getSnapshot, () => true)
}
