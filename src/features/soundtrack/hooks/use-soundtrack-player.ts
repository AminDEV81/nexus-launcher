import { useEffect } from 'react'
import { useSoundtrackStore } from '../store/soundtrack-store'

export function useSoundtrackPlayer() {
  const store = useSoundtrackStore()
  const loadFavorites = useSoundtrackStore((s) => s.loadFavorites)
  const loadHistory = useSoundtrackStore((s) => s.loadHistory)

  useEffect(() => {
    // Initialize favorites and history on mount
    void loadFavorites()
    void loadHistory()
  }, [loadFavorites, loadHistory])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't intercept if user is typing in an input, textarea, or contentEditable
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

      // Space: Toggle Play/Pause
      if (e.code === 'Space' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        // Only if track is active or queue has items
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
  }, [store])

  return store
}
