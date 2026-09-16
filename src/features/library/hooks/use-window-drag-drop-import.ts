import { useEffect } from 'react'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { toast } from 'sonner'
import { useAddGameModalStore, type DroppedPathKind } from '../store/add-game-modal-store'

function guessKind(path: string): DroppedPathKind {
  const lower = path.toLowerCase()
  if (lower.endsWith('.exe')) return 'executable'
  if (lower.endsWith('.lnk')) return 'shortcut'
  return 'folder'
}

/**
 * Lets the user drop an .exe, a .lnk shortcut, or a game's install
 * folder anywhere in the window to open the Add Game modal pre-filled,
 * instead of only supporting the button-driven pickers.
 *
 * Uses Tauri's native webview drag-drop event (`dragDropEnabled: true`
 * in tauri.conf.json) rather than the HTML5 drag-and-drop API: the
 * native event hands us real filesystem paths, while HTML5 DnD only
 * exposes opaque File/Blob objects with no path — useless for a command
 * that needs to pass a real path to the Rust backend.
 */
export function useWindowDragDropImport() {
  const openModal = useAddGameModalStore((s) => s.open)

  useEffect(() => {
    const unlisten = getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type !== 'drop') return

      const paths = event.payload.paths
      if (paths.length === 0) return
      if (paths.length > 1) {
        toast('Only the first item is used — drop one game at a time.')
      }

      const path = paths[0]
      openModal({ kind: guessKind(path), path })
    })

    return () => {
      unlisten.then((fn) => fn())
    }
  }, [openModal])
}
