import { getCurrentWindow } from '@tauri-apps/api/window'

const appWindow =
  typeof window !== 'undefined'
    ? getCurrentWindow()
    : (null as unknown as ReturnType<typeof getCurrentWindow>)

/**
 * Invisible resize regions for the chromeless window.
 *
 * With `decorations: false`, Windows no longer draws (or hit-tests) a
 * native resize border, so without this the window would be stuck at
 * whatever size it opens at. Each region calls `startResizeDragging`
 * with the matching edge/corner on mousedown, which hands off to the
 * OS's native resize behavior (correct cursor, correct snapping) rather
 * than us reimplementing resize-by-mouse-move ourselves.
 */
export function ResizeHandles() {
  return (
    <>
      <Handle direction="North" className="left-3 right-3 top-0 h-1.5 cursor-n-resize" />
      <Handle direction="South" className="bottom-0 left-3 right-3 h-1.5 cursor-s-resize" />
      <Handle direction="West" className="bottom-3 left-0 top-3 w-1.5 cursor-w-resize" />
      <Handle direction="East" className="bottom-3 right-0 top-3 w-1.5 cursor-e-resize" />

      <Handle direction="NorthWest" className="left-0 top-0 size-3.5 cursor-nw-resize" />
      <Handle direction="NorthEast" className="right-0 top-0 size-3.5 cursor-ne-resize" />
      <Handle direction="SouthWest" className="bottom-0 left-0 size-3.5 cursor-sw-resize" />
      <Handle direction="SouthEast" className="bottom-0 right-0 size-3.5 cursor-se-resize" />
    </>
  )
}

type ResizeDirection =
  'North' | 'South' | 'East' | 'West' | 'NorthEast' | 'NorthWest' | 'SouthEast' | 'SouthWest'

function Handle({ direction, className }: { direction: ResizeDirection; className: string }) {
  return (
    <div
      className={`fixed z-[120] ${className}`}
      onMouseDown={(e) => {
        // Only the primary button should initiate a resize.
        if (e.button !== 0) return
        appWindow.startResizeDragging(direction)
      }}
    />
  )
}
