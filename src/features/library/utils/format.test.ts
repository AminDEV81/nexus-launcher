import { describe, expect, it } from 'vitest'
import {
  formatElapsed,
  formatPlaytime,
  formatReleaseDate,
  formatDateKey,
  parseStoredUtcDate,
  isGameUnreleased,
} from './format'

describe('parseStoredUtcDate', () => {
  it('parses RFC 3339 instants from the native app', () => {
    const date = parseStoredUtcDate('2026-08-22T14:30:00+00:00')
    expect(date?.toISOString()).toBe('2026-08-22T14:30:00.000Z')
  })

  it('treats legacy space-separated timestamps as UTC', () => {
    // Migration-era rows are `YYYY-MM-DD HH:mm:ss` with no zone — the
    // browser would read them as LOCAL time, shifting play days.
    const date = parseStoredUtcDate('2026-08-22 14:30:00')
    expect(date?.toISOString()).toBe('2026-08-22T14:30:00.000Z')
  })

  it('keeps an explicit offset instead of assuming UTC', () => {
    const date = parseStoredUtcDate('2026-08-22T14:30:00+03:30')
    expect(date?.toISOString()).toBe('2026-08-22T11:00:00.000Z')
  })

  it('rejects junk instead of returning an Invalid Date', () => {
    expect(parseStoredUtcDate('')).toBeNull()
    expect(parseStoredUtcDate('not a date')).toBeNull()
  })
})

describe('formatDateKey / formatReleaseDate (no day shift)', () => {
  it('formats a YYYY-MM-DD key without moving it a day', () => {
    // Regression guard for the timezone bug: rendering UTC-midnight in
    // a negative-offset locale used to show the previous day.
    expect(formatDateKey('2026-03-09', { weekday: 'long', day: 'numeric' })).toContain('9')
    expect(formatReleaseDate('2026-03-09')).toContain('9')
  })

  it('passes through non-date-shaped input untouched', () => {
    expect(formatDateKey('spring 2026', { day: 'numeric' })).toBe('spring 2026')
    expect(formatReleaseDate('spring 2026')).toBe('spring 2026')
    expect(formatReleaseDate(null)).toBe('Unknown')
  })
})

describe('formatPlaytime / formatElapsed', () => {
  it('formats totals as hours and minutes', () => {
    expect(formatPlaytime(0)).toBe('Never played')
    expect(formatPlaytime(600)).toBe('10 min')
    expect(formatPlaytime(7200)).toBe('2 hr')
    expect(formatPlaytime(9000)).toBe('2 hr 30 min')
  })

  it('formats the live counter as clock time', () => {
    expect(formatElapsed(0)).toBe('00:00')
    expect(formatElapsed(75)).toBe('01:15')
    expect(formatElapsed(3671)).toBe('1:01:11')
    expect(formatElapsed(-5)).toBe('00:00')
  })
})

describe('isGameUnreleased', () => {
  it('returns true for future dates', () => {
    expect(isGameUnreleased('2099-12-31')).toBe(true)
    expect(isGameUnreleased('2099')).toBe(true)
  })

  it('returns false for past dates and invalid/null', () => {
    expect(isGameUnreleased('2000-01-01')).toBe(false)
    expect(isGameUnreleased('2010')).toBe(false)
    expect(isGameUnreleased(null)).toBe(false)
    expect(isGameUnreleased('')).toBe(false)
  })
})
