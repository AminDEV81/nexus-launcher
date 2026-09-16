import { describe, expect, it } from 'vitest'
import { normalizeStandardGamepad } from '../utils/input-normalizer'
import { DEFAULT_GAMEPAD_SETTINGS } from '../constants/standard-mappings'
import { createMockGamepad } from './fixtures'

describe('Input Normalization to StandardGamepadInput', () => {
  it('maps standard buttons to logical buttons correctly', () => {
    const buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }))
    // Simulate pressing South (A / Cross), L1, and D-Pad Down
    buttons[0] = { pressed: true, touched: true, value: 1 }
    buttons[4] = { pressed: true, touched: true, value: 1 }
    buttons[13] = { pressed: true, touched: true, value: 1 }

    const pad = createMockGamepad({ buttons })
    const norm = normalizeStandardGamepad(pad, DEFAULT_GAMEPAD_SETTINGS)

    expect(norm.buttons.south).toBe(true)
    expect(norm.buttons.east).toBe(false)
    expect(norm.buttons.l1).toBe(true)
    expect(norm.buttons.dpadDown).toBe(true)
    expect(norm.buttons.dpadUp).toBe(false)
  })

  it('normalizes analog triggers and stick values', () => {
    const buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }))
    // Trigger LT half-pressed (0.5)
    buttons[6] = { pressed: true, touched: true, value: 0.5 }

    // Left stick deflected right (0.8)
    const axes = [0.8, 0.0, 0, 0]

    const pad = createMockGamepad({ buttons, axes })
    const norm = normalizeStandardGamepad(pad, DEFAULT_GAMEPAD_SETTINGS)

    expect(norm.analog.l2).toBeGreaterThan(0.4)
    expect(norm.analog.leftX).toBeGreaterThan(0.7)
    expect(norm.analog.leftY).toBe(0)
  })

  it('safely handles missing buttons or axes without throwing exceptions', () => {
    // Truncated gamepad with only 4 buttons and 0 axes
    const truncatedPad = {
      id: 'Truncated Pad',
      index: 0,
      connected: true,
      mapping: 'standard',
      buttons: [
        { pressed: true, value: 1 },
        { pressed: false, value: 0 },
      ],
      axes: [],
    } as unknown as Gamepad

    expect(() => {
      const norm = normalizeStandardGamepad(truncatedPad, DEFAULT_GAMEPAD_SETTINGS)
      expect(norm.buttons.south).toBe(true)
      expect(norm.buttons.east).toBe(false)
      expect(norm.buttons.r1).toBe(false)
      expect(norm.analog.leftX).toBe(0)
      expect(norm.analog.l2).toBe(0)
    }).not.toThrow()
  })
})
