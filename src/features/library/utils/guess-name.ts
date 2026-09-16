/**
 * Turns a raw file/folder path into a reasonable display name — used as
 * an editable starting point when adding a game, never as a final,
 * unreviewed value (the modal always shows this in an editable field).
 *
 * "half-life_2.exe" -> "Half Life 2"
 * "C:\Games\Hollow Knight" -> "Hollow Knight"
 */
export function guessNameFromPath(path: string): string {
  const base = path.split(/[\\/]/).filter(Boolean).pop() ?? path
  const withoutExtension = base.replace(/\.(exe|lnk)$/i, '')

  return withoutExtension
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

export function getParentPath(path: string): string {
  const separator = path.includes('\\') ? '\\' : '/'
  const parts = path.split(separator).filter(Boolean)
  parts.pop()
  const prefix = path.startsWith('\\\\') ? '\\\\' : separator === '\\' ? '' : '/'
  return prefix + parts.join(separator)
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** exponent
  return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`
}
