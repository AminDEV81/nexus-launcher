import { openPath, revealItemInDir } from '@tauri-apps/plugin-opener'
import { toast } from 'sonner'
import type { Game } from '@/types/models'

/**
 * Prefers `revealItemInDir` on the executable when we have one — it
 * opens Explorer with the exe pre-selected/highlighted, which is a
 * nicer "show me exactly where this game lives" than just opening the
 * containing folder. Falls back to plainly opening `install_path` when
 * that's all we have.
 *
 * Uses `@tauri-apps/plugin-opener`, not `@tauri-apps/plugin-shell`'s
 * `open` — the shell plugin's `open` endpoint was deprecated and had
 * its allowed-protocol validation tightened after a security advisory
 * (GHSA-c9pr-q8gx-3mgp), and no longer reliably opens bare local
 * folder paths without extra scope configuration. `opener` is the
 * maintained, purpose-built replacement.
 */
export async function openGameFolder(game: Game) {
  try {
    if (game.executable_path) {
      await revealItemInDir(game.executable_path)
      return
    }
    if (game.install_path) {
      await openPath(game.install_path)
      return
    }
    toast.error("Nexus doesn't know this game's folder.")
  } catch (error) {
    toast.error(error instanceof Error ? error.message : 'Could not open that folder.')
  }
}

export async function copyGamePath(game: Game) {
  const target = game.executable_path ?? game.install_path
  if (!target) {
    toast.error('No path to copy.')
    return
  }
  try {
    await navigator.clipboard.writeText(target)
    toast.success('Path copied.')
  } catch {
    toast.error('Could not copy the path.')
  }
}
