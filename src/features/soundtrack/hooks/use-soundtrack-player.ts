import { useEffect } from 'react'
import { useSoundtrackStore } from '../store/soundtrack-store'

/**
 * Mounted once in `AppShell` to initialize soundtrack favorites/history
 * and bind global media keyboard shortcuts without duplicating listeners
 * across every consumer of `useSoundtrackPlayer()`.
 */
export function useSoundtrackGlobalShortcuts() {
  useEffect(() => {
    const { loadFavorites, loadHistory } = useSoundtrackStore.getState()
    void loadFavorites()
    void loadHistory()
  }, [])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable ||
          target.getAttribute('role') === 'textbox')
      ) {
        return
      }

      const store = useSoundtrackStore.getState()

      // Space: Toggle Play/Pause
      if (e.code === 'Space' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        if (store.currentTrack || store.queue.length > 0) {
          e.preventDefault()
          store.togglePlay()
        }
      }

      // Ctrl + ArrowLeft: Previous
      if (e.ctrlKey && e.code === 'ArrowLeft') {
        e.preventDefault()
        void store.previous()
      }

      // Ctrl + ArrowRight: Next
      if (e.ctrlKey && e.code === 'ArrowRight') {
        e.preventDefault()
        void store.next()
      }

      // Ctrl + ArrowUp: Volume Up
      if (e.ctrlKey && e.code === 'ArrowUp') {
        e.preventDefault()
        store.setVolume(Math.min(1, store.volume + 0.05))
      }

      // Ctrl + ArrowDown: Volume Down
      if (e.ctrlKey && e.code === 'ArrowDown') {
        e.preventDefault()
        store.setVolume(Math.max(0, store.volume - 0.05))
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])
}

export function useSoundtrackPlayer() {
  return useSoundtrackStore()
}
