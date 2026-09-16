import { useEffect } from 'react'
import { playClick, unlockAudioOnFirstInteraction } from '@/lib/sound-engine'

/**
 * Plays a soft click sound for every button press in the app — via one
 * delegated listener on the document rather than wiring a sound call
 * into each individual button, so every button (present and future,
 * anywhere in the tree) gets it automatically for free.
 */
export function useGlobalClickSound() {
  useEffect(() => {
    unlockAudioOnFirstInteraction()

    function handlePointerDown(event: PointerEvent) {
      const target = event.target
      if (!(target instanceof Element)) return
      const button = target.closest('button, [role="button"]')
      if (button && !button.hasAttribute('disabled')) {
        playClick()
      }
    }

    // `pointerdown` rather than `click`: fires the instant the press
    // happens, which reads as more responsive than waiting for the
    // full click (press+release) to resolve.
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [])
}
