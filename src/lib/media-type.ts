const VIDEO_EXTENSIONS = new Set(['webm', 'mp4', 'mov'])

function extensionOf(path: string): string {
  return (path.split('.').pop() ?? '').split(/[?#]/)[0].toLowerCase()
}

/**
 * Most animated covers (SteamGridDB "Live Covers") are animated WebP,
 * which a plain `<img>` renders and plays fine — but some are `.webm`/
 * `.mp4` video files, which `<img>` just can't display (shows blank).
 * Checked against both the SteamGridDB `mime` field (when available,
 * from the picker) and the file extension (for already-downloaded
 * covers, where we only have a local path) so either source works.
 */
export function isVideoAsset(pathOrUrl: string | null | undefined, mime?: string | null): boolean {
  if (mime?.startsWith('video/')) return true
  if (!pathOrUrl) return false
  return VIDEO_EXTENSIONS.has(extensionOf(pathOrUrl))
}
