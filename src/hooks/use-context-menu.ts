import { useCallback, useState } from 'react'
import type { MouseEvent } from 'react'

interface ContextMenuState {
  x: number
  y: number
}

/**
 * Tracks the open/closed state and cursor-anchored position for a
 * custom context menu. Reusable across game cards now and anything
 * else that wants a right-click menu later (collections, artwork, ...).
 */
export function useContextMenu() {
  const [state, setState] = useState<ContextMenuState | null>(null)

  const open = useCallback((event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setState({ x: event.clientX, y: event.clientY })
  }, [])

  const close = useCallback(() => setState(null), [])

  return { position: state, isOpen: state !== null, open, close }
}
