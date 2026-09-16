export function formatPlaytime(totalSeconds: number): string {
  if (totalSeconds <= 0) return 'Never played'
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)

  if (hours === 0) return `${Math.max(1, minutes)} min`
  if (minutes === 0) return `${hours} hr`
  return `${hours} hr ${minutes} min`
}

/** Short form (e.g. "25m", "2h") for compact card badges and metadata chips. */
export function formatPlaytimeCompact(totalSeconds: number): string {
  if (totalSeconds <= 0) return '0h'
  const hours = totalSeconds / 3600
  if (hours < 1) {
    return `${Math.max(1, Math.round(totalSeconds / 60))}m`
  }
  return `${Math.round(hours)}h`
}

/** MM:SS (or H:MM:SS past an hour) for the live "Playing…" counter —
 *  distinct from `formatPlaytime` above, which is for totals and reads
 *  fine as "3 hr 12 min" but would be a jarring, constantly-reflowing
 *  label for a number that ticks up every few seconds. */
export function formatElapsed(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  const pad = (value: number) => value.toString().padStart(2, '0')
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${pad(minutes)}:${pad(secs)}`
}

/**
 * Dates written by earlier SQLite migrations use `YYYY-MM-DD HH:mm:ss`,
 * while play sessions written by the native app are UTC instants. Browsers
 * interpret the former as *local* time, which shifted dates by the user's
 * UTC offset. Normalize both forms explicitly before displaying them.
 */
export function parseStoredUtcDate(value: string): Date | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  const normalized = trimmed
    .replace(/\sUTC$/i, 'Z')
    .replace(/^([0-9]{4}-[0-9]{2}-[0-9]{2})\s/, '$1T')
  const hasTimezone = /(?:Z|[+-][0-9]{2}:?[0-9]{2})$/i.test(normalized)
  const date = new Date(
    hasTimezone || /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : `${normalized}Z`,
  )

  return Number.isNaN(date.getTime()) ? null : date
}

/** Formats a date-only database key without accidentally shifting it a day. */
export function formatDateKey(dateKey: string, options: Intl.DateTimeFormatOptions): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return dateKey
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Intl.DateTimeFormat(undefined, { ...options, timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, month - 1, day)),
  )
}

/** Local (not UTC) YYYY-MM-DD key for a Date, the same format the
 *  backend's SQLite `'localtime'` bucketing produces for stat days. */
export function localDateKey(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function formatRelativeDate(isoDate: string | null): string {
  if (!isoDate) return 'Never'

  const date = parseStoredUtcDate(isoDate)
  if (!date) return isoDate

  const today = new Date()
  const localDay = (value: Date) => Date.UTC(value.getFullYear(), value.getMonth(), value.getDate())
  const diffDays = Math.floor((localDay(today) - localDay(date)) / (1000 * 60 * 60 * 24))

  if (diffDays <= 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${diffDays >= 14 ? 's' : ''} ago`

  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function formatExactDateTime(isoDate: string | null): string {
  if (!isoDate) return 'Never'
  const date = parseStoredUtcDate(isoDate)
  if (!date) return isoDate
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  })
}

/** Formats a `YYYY-MM-DD` release date as a calendar date in the user's
 *  locale without shifting it a day for negative-UTC-offset timezones —
 *  `formatDateKey` formats with `timeZone: 'UTC'` for exactly this. */
export function formatReleaseDate(isoDate: string | null): string {
  if (!isoDate) return 'Unknown'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate
  return formatDateKey(isoDate, { year: 'numeric', month: 'long', day: 'numeric' })
}

/** Checks if a game release date is in the future */
export function isGameUnreleased(releaseDate: string | null): boolean {
  if (!releaseDate) return false
  const trimmed = releaseDate.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed > localDateKey()
  }
  if (/^\d{4}$/.test(trimmed)) {
    const currentYear = new Date().getFullYear()
    return Number(trimmed) > currentYear
  }
  const date = parseStoredUtcDate(trimmed)
  return date ? date.getTime() > Date.now() : false
}
