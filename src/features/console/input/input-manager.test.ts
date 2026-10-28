import { describe, expect, it } from 'vitest'
import {
  applyStickDeadzoneAndLock,
  dedupeLogicalGamepads,
  detectGlyphFamilyFromId,
  isWithinSwallowWindow,
  mapFaceButtonAction,
  StepRepeatTimer,
} from './InputManager'

describe('Console InputManager & DualSense/ViGEm Deduplication', () => {
  it('enforces 0.35 deadzone with 0.22 release hysteresis and 45-degree axis lock', () => {
    expect(applyStickDeadzoneAndLock(0.2, 0.1, null)).toBeNull()
    expect(applyStickDeadzoneAndLock(0.6, 0.05, null)).toBe('right')
    // Hysteresis keeps direction engaged at 0.28 (> 0.22 release threshold)
    expect(applyStickDeadzoneAndLock(0.28, 0.02, 'right')).toBe('right')
    // Releases below 0.22
    expect(applyStickDeadzoneAndLock(0.15, 0.0, 'right')).toBeNull()
  })

  it('repeats at 400ms initial delay, 90ms cadence, and 45ms turbo after 1200ms', () => {
    const timer = new StepRepeatTimer()
    expect(timer.update('down', 1000)).toBe('down')
    expect(timer.update('down', 1200)).toBeNull()
    expect(timer.update('down', 1410)).toBe('down')
    expect(timer.update('down', 1460)).toBeNull()
    expect(timer.update('down', 1505)).toBe('down')
    // Turbo mode after 1200ms hold (at t = 2250)
    expect(timer.update('down', 2250)).toBe('down')
    expect(timer.update('down', 2300)).toBe('down')
  })

  it('deduplicates physical Sony DualSense when ViGEm virtual Xbox 360 emulation is active', () => {
    const rawPads = [
      { index: 0, id: 'DualSense Wireless Controller (Vendor: 054c Product: 0ce6)', connected: true },
      { index: 1, id: 'Xbox 360 Controller (XInput STANDARD GAMEPAD)', connected: true },
    ]
    const logical = dedupeLogicalGamepads(rawPads, 1, 1, 'auto')
    expect(logical).toHaveLength(2)
    expect(logical[0].isShadowedDuplicate).toBe(true)
    expect(logical[1].isShadowedDuplicate).toBe(false)
    // Preserves PlayStation glyph family even when driven via virtual XInput pad!
    expect(logical[1].glyphFamily).toBe('playstation')
  })

  it('detects PlayStation, Xbox, and Switch glyph families and honors Confirm/Back swap', () => {
    expect(detectGlyphFamilyFromId('Wireless Controller (054c:0ce6)', 1, 'auto')).toBe('playstation')
    expect(detectGlyphFamilyFromId('Nintendo Switch Pro Controller (057e:2009)', 0, 'auto')).toBe('switch')
    expect(detectGlyphFamilyFromId('Xbox Wireless Controller', 0, 'auto')).toBe('xbox')

    expect(mapFaceButtonAction(0, false)).toBe('confirm')
    expect(mapFaceButtonAction(0, true)).toBe('back')
    expect(mapFaceButtonAction(1, true)).toBe('confirm')
  })

  it('swallows residual game inputs for 400ms after regaining launcher focus', () => {
    expect(isWithinSwallowWindow(1000, 1250)).toBe(true)
    expect(isWithinSwallowWindow(1000, 1450)).toBe(false)
  })
})
