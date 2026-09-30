export function fmtTempValue(v: number | null | undefined): string {
  return v != null && Number.isFinite(v) ? `${Math.round(v)}` : '--'
}

/** Bytes/second → compact human string, e.g. `12.8 MB/s`. */
export function fmtRate(bps: number | null | undefined): { value: string; unit: string } {
  if (bps == null || !Number.isFinite(bps)) return { value: '--', unit: 'MB/s' }
  if (bps >= 1_000_000) {
    const mb = bps / 1_000_000
    return { value: mb >= 100 ? mb.toFixed(0) : mb.toFixed(1), unit: 'MB/s' }
  }
  return { value: (bps / 1000).toFixed(0), unit: 'KB/s' }
}

export function fmtSession(secs: number | null | undefined): string {
  if (secs == null) return '0:00'
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}
