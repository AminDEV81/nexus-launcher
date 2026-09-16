import { describe, expect, it } from 'vitest'
import { applyRadialDeadzone, applyTriggerDeadzone } from '../utils/deadzone'

describe('Radial Deadzone & Trigger Deadzone Calculations', () => {
  const DEADZONE = 0.2 // 20%

  it('returns exact zero when input is zero', () => {
    const res = applyRadialDeadzone(0, 0, DEADZONE)
    expect(res.x).toBe(0)
    expect(res.y).toBe(0)
    expect(res.magnitude).toBe(0)
  })

  it('filters out stick drift inside deadzone', () => {
    const res = applyRadialDeadzone(0.1, 0.1, DEADZONE) // magnitude = 0.1414 < 0.2
    expect(res.x).toBe(0)
    expect(res.y).toBe(0)
    expect(res.magnitude).toBe(0)
  })

  it('filters input right at the deadzone boundary', () => {
    const res = applyRadialDeadzone(0.2, 0, DEADZONE)
    expect(res.x).toBe(0)
    expect(res.y).toBe(0)
    expect(res.magnitude).toBe(0)
  })

  it('smoothly rescales inputs outside the deadzone without step jump', () => {
    // At magnitude 0.6 with deadzone 0.2:
    // scaledMagnitude should be (0.6 - 0.2) / (1 - 0.2) = 0.4 / 0.8 = 0.5
    const res = applyRadialDeadzone(0.6, 0, DEADZONE)
    expect(res.x).toBeCloseTo(0.5, 4)
    expect(res.y).toBe(0)
    expect(res.magnitude).toBeCloseTo(0.5, 4)
  })

  it('scales full deflection (magnitude 1.0) to full 1.0', () => {
    const res = applyRadialDeadzone(1.0, 0, DEADZONE)
    expect(res.x).toBeCloseTo(1.0, 4)
    expect(res.magnitude).toBeCloseTo(1.0, 4)

    const diag = applyRadialDeadzone(0.7071, 0.7071, DEADZONE)
    expect(diag.magnitude).toBeCloseTo(1.0, 2)
  })

  it('preserves negative directions correctly', () => {
    const res = applyRadialDeadzone(-0.6, 0, DEADZONE)
    expect(res.x).toBeCloseTo(-0.5, 4)
    expect(res.y).toBe(0)
  })

  it('inverts axes when requested', () => {
    const res = applyRadialDeadzone(0.6, 0.6, DEADZONE, true, true)
    expect(res.x).toBeLessThan(0)
    expect(res.y).toBeLessThan(0)
  })

  it('handles invalid NaN or Infinity defensively', () => {
    const res = applyRadialDeadzone(NaN, Infinity, DEADZONE)
    expect(res.x).toBe(0)
    expect(res.y).toBe(0)
  })

  describe('Trigger Deadzone', () => {
    it('returns 0 for resting trigger inside deadzone', () => {
      expect(applyTriggerDeadzone(0.02, 0.05)).toBe(0)
    })

    it('smoothly scales values past trigger deadzone', () => {
      // At 0.525 with deadzone 0.05 -> (0.525 - 0.05) / 0.95 = 0.475 / 0.95 = 0.5
      expect(applyTriggerDeadzone(0.525, 0.05)).toBeCloseTo(0.5, 4)
      expect(applyTriggerDeadzone(1.0, 0.05)).toBe(1.0)
    })

    it('handles legacy [-1, 1] resting triggers gracefully', () => {
      expect(applyTriggerDeadzone(-1.0, 0.05)).toBe(0)
    })
  })
})
