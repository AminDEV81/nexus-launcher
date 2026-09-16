import { useCallback, useEffect, useRef, useState } from 'react'
import { useLibraryUiStore } from '../store/library-ui-store'
import type { Game } from '@/types/models'

export function useDragReorder(
  games: Game[],
  onSelect: (id: string) => void,
  customReorder?: (activeId: string, overId: string, allIds?: string[]) => void,
) {
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const defaultReorderGames = useLibraryUiStore((s) => s.reorderGames)
  const reorderFn = customReorder ?? defaultReorderGames
  const isDraggingRef = useRef(false)
  const startPosRef = useRef<{ x: number; y: number } | null>(null)
  const currentDraggedIdRef = useRef<string | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const gamesRef = useRef(games)
  gamesRef.current = games

  // Clean up any lingering global listeners if the component unmounts mid-drag
  useEffect(() => {
    return () => {
      cleanupRef.current?.()
    }
  }, [])

  const handlePointerDown = useCallback(
    (gameId: string, e: React.PointerEvent) => {
      // Allow primary left click (0) and right click (2)
      if (e.button !== 0 && e.button !== 2) return
      const buttonPressed = e.button
      cleanupRef.current?.()

      startPosRef.current = { x: e.clientX, y: e.clientY }
      currentDraggedIdRef.current = gameId
      isDraggingRef.current = false

      const handlePointerMove = (moveEvent: PointerEvent) => {
        if (!startPosRef.current || !currentDraggedIdRef.current) return
        const dx = moveEvent.clientX - startPosRef.current.x
        const dy = moveEvent.clientY - startPosRef.current.y
        const distance = Math.hypot(dx, dy)

        // Require a 5px threshold so normal clicks or right-clicks don't initiate drag
        if (distance > 5 && !isDraggingRef.current) {
          isDraggingRef.current = true
          setDraggedId(currentDraggedIdRef.current)
        }

        if (isDraggingRef.current) {
          moveEvent.preventDefault()
          const elements = document.elementsFromPoint(moveEvent.clientX, moveEvent.clientY)
          for (const el of elements) {
            const targetCard = el.closest('[data-game-id]')
            if (targetCard) {
              const targetId = targetCard.getAttribute('data-game-id')
              if (targetId && targetId !== currentDraggedIdRef.current) {
                const allIds = gamesRef.current.map((g) => g.id)
                reorderFn(currentDraggedIdRef.current, targetId, allIds)
              }
              break
            }
          }
        }
      }

      const handlePointerUp = () => {
        window.removeEventListener('pointermove', handlePointerMove)
        window.removeEventListener('pointerup', handlePointerUp)
        window.removeEventListener('pointercancel', handlePointerUp)
        cleanupRef.current = null

        if (isDraggingRef.current) {
          if (buttonPressed === 2) {
            const suppressContextMenu = (cmEvent: MouseEvent) => {
              cmEvent.preventDefault()
              cmEvent.stopPropagation()
            }
            window.addEventListener('contextmenu', suppressContextMenu, {
              capture: true,
              once: true,
            })
            setTimeout(() => {
              window.removeEventListener('contextmenu', suppressContextMenu, { capture: true })
            }, 100)
          }
          // Delay resetting isDraggingRef so the ensuing click event is suppressed
          setTimeout(() => {
            isDraggingRef.current = false
          }, 60)
          setDraggedId(null)
        }
        startPosRef.current = null
        currentDraggedIdRef.current = null
      }

      cleanupRef.current = () => {
        window.removeEventListener('pointermove', handlePointerMove)
        window.removeEventListener('pointerup', handlePointerUp)
        window.removeEventListener('pointercancel', handlePointerUp)
      }

      window.addEventListener('pointermove', handlePointerMove)
      window.addEventListener('pointerup', handlePointerUp)
      window.addEventListener('pointercancel', handlePointerUp)
    },
    [reorderFn],
  )

  const handleClick = useCallback(
    (gameId: string) => {
      if (!isDraggingRef.current) {
        onSelect(gameId)
      }
    },
    [onSelect],
  )

  return {
    draggedId,
    handlePointerDown,
    handleClick,
  }
}
