import { describe, expect, it } from 'vitest'
import { isScheduleDayActive } from './use-download-scheduler'

describe('isScheduleDayActive', () => {
  // 2026-10-30 is a Friday (getDay() === 5), 2026-10-31 is a Saturday (6).
  const fridayNight = new Date(2026, 9, 30, 23, 30)
  const saturdayEarly = new Date(2026, 9, 31, 2, 0)
  const saturdayNoon = new Date(2026, 9, 31, 12, 0)

  it('counts the after-midnight part of an overnight window toward the day it started', () => {
    expect(isScheduleDayActive([5], '23:00', '07:00', fridayNight)).toBe(true)
    expect(isScheduleDayActive([5], '23:00', '07:00', saturdayEarly)).toBe(true)
    expect(isScheduleDayActive([6], '23:00', '07:00', saturdayEarly)).toBe(false)
  })

  it('uses the current day for same-day windows', () => {
    expect(isScheduleDayActive([6], '09:00', '17:00', saturdayNoon)).toBe(true)
    expect(isScheduleDayActive([5], '09:00', '17:00', saturdayNoon)).toBe(false)
  })
})
