import { convertFileSrc } from '@tauri-apps/api/core'
import { readFile } from '@tauri-apps/plugin-fs'

/**
 * Cover/banner/logo paths coming back from the Rust backend are raw
 * Windows filesystem paths (e.g. `C:\Users\...\artwork\{id}\cover.jpg`)
 * — a webview can't load those directly as an `<img src>`. This routes
 * them through Tauri's asset protocol instead, which is scoped to
 * `$APPDATA/artwork/**` in tauri.conf.json (see the security config
 * there) so only our own downloaded artwork is servable this way, not
 * arbitrary files on disk.
 */
export function assetUrl(path: string | null | undefined): string | null {
  if (!path) return null
  if (
    path.startsWith('http://') ||
    path.startsWith('https://') ||
    path.startsWith('asset:') ||
    path.startsWith('blob:') ||
    path.startsWith('data:')
  ) {
    return path
  }
  if (typeof window === 'undefined') {
    return `asset://localhost/${encodeURIComponent(path)}`
  }
  return convertFileSrc(path)
}

/**
 * Previews an arbitrary file the user just picked via the native file
 * dialog (Epic 10's crop editor) — these live anywhere on disk, not
 * under `$APPDATA/artwork/**`, so `assetUrl`/`convertFileSrc` can't
 * serve them (blocked by `security.assetProtocol.scope` in
 * `tauri.conf.json`, deliberately, so the asset protocol can't be used
 * to read arbitrary files off disk). Reading the bytes through
 * `@tauri-apps/plugin-fs` instead works because Tauri v2's file dialog
 * grants temporary fs read scope to whatever the user just selected.
 * Caller is responsible for revoking the returned URL with
 * `URL.revokeObjectURL` once it's no longer displayed.
 */
export async function blobUrlForLocalFile(path: string): Promise<string> {
  const bytes = await readFile(path)
  const blob = new Blob([bytes])
  return URL.createObjectURL(blob)
}
