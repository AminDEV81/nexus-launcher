import { describe, expect, it } from 'vitest'
import {
  dedupeLogicalGamepads,
  detectGlyphFamilyFromId,
  describeGlyphFamily,
  isSonyGamepadId,
  isUsableBrowserPad,
  nativeSlotToPadFrame,
  shouldUseNativePads,
  type NativePadSlotFrame,
} from './InputManager'

const DS_ID = 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)'
const XBOX_BT_ID = 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 02fd)'
const XINPUT_ID = 'Xbox 360 Controller (XInput STANDARD GAMEPAD)'
const SWITCH_ID = 'Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)'

describe('controller family detection', () => {
  it('recognises DualSense / DualShock and never mistakes Xbox Wireless for Sony', () => {
    expect(isSonyGamepadId(DS_ID)).toBe(true)
    expect(isSonyGamepadId('054c-0ce6-Wireless Controller')).toBe(true)
    expect(isSonyGamepadId(XBOX_BT_ID)).toBe(false)
    expect(isSonyGamepadId(XINPUT_ID)).toBe(false)
  })

  it('maps ids to the right glyph family and switches to Xbox glyphs when ViGEm Xbox mode is active', () => {
    expect(detectGlyphFamilyFromId(DS_ID, 0)).toBe('playstation')
    expect(detectGlyphFamilyFromId(DS_ID, 1)).toBe('xbox') // ViGEm Xbox mode enabled on DualSense
    expect(detectGlyphFamilyFromId(XBOX_BT_ID)).toBe('xbox')
    expect(detectGlyphFamilyFromId(SWITCH_ID)).toBe('switch')
    expect(detectGlyphFamilyFromId(XINPUT_ID, 1)).toBe('xbox') // ViGEm virtual Xbox 360 controller
    expect(detectGlyphFamilyFromId(XINPUT_ID, 0)).toBe('xbox')
    expect(detectGlyphFamilyFromId(DS_ID, 0, 'xbox')).toBe('xbox') // manual override wins
  })

  it('has readable names for the connection toast', () => {
    expect(describeGlyphFamily('playstation')).toBe('PlayStation controller')
    expect(describeGlyphFamily('xbox')).toBe('Xbox controller')
  })
})

describe('dedupeLogicalGamepads', () => {
  it('shadows the physical DualSense (not a real Xbox pad) when emulation is active', () => {
    const out = dedupeLogicalGamepads(
      [
        { index: 0, id: DS_ID, connected: true },
        { index: 1, id: XINPUT_ID, connected: true },
      ],
      1,
      1,
    )
    expect(out.find((p) => p.index === 0)?.isShadowedDuplicate).toBe(true)
    expect(out.find((p) => p.index === 1)?.isShadowedDuplicate).toBe(false)
    expect(out.find((p) => p.index === 1)?.glyphFamily).toBe('xbox')
  })

  it('keeps a genuine Xbox Wireless pad even while a DualSense is emulating', () => {
    const out = dedupeLogicalGamepads(
      [
        { index: 0, id: XBOX_BT_ID, connected: true },
        { index: 1, id: XINPUT_ID, connected: true },
      ],
      1,
      1,
    )
    expect(out.every((p) => !p.isShadowedDuplicate)).toBe(true)
  })
})

describe('native DualSense input source', () => {
  const slot: NativePadSlotFrame = {
    slotIndex: 1,
    cross: true,
    circle: false,
    square: false,
    triangle: true,
    l1: false,
    r1: true,
    l2: false,
    r2: false,
    create: false,
    options: true,
    ps: true,
    dpadUp: false,
    dpadDown: true,
    dpadLeft: false,
    dpadRight: false,
    lx: 0.5,
    ly: -0.25,
  }

  it('converts a native slot into the standard button layout', () => {
    const frame = nativeSlotToPadFrame(slot)
    expect(frame.key).toBe('native:1')
    expect(frame.glyphFamily).toBe('playstation')
    expect(frame.buttons[0]).toBe(true) // cross -> confirm
    expect(frame.buttons[3]).toBe(true) // triangle
    expect(frame.buttons[5]).toBe(true) // R1 -> tab next
    expect(frame.buttons[9]).toBe(true) // options
    expect(frame.buttons[13]).toBe(true) // d-pad down
    expect(frame.buttons[16]).toBe(true) // PS button -> guide
    expect(frame.buttons[12]).toBe(false)
    expect(frame.lx).toBe(0.5)
  })

  it('uses native DualSense HID whenever ViGEm is disabled or no usable browser pad exists', () => {
    expect(shouldUseNativePads(0, 1, 0)).toBe(true)
    expect(shouldUseNativePads(1, 1, 0)).toBe(true) // ViGEm disabled -> native DualSense stays active
    expect(shouldUseNativePads(1, 1, 1)).toBe(false) // ViGEm enabled -> XInput browser pad used
    expect(shouldUseNativePads(0, 0, 0)).toBe(false)
  })

  it('distrusts Sony pads that Chromium exposes without the standard mapping', () => {
    expect(isUsableBrowserPad(DS_ID, 'standard')).toBe(true)
    expect(isUsableBrowserPad(DS_ID, '')).toBe(false)
    expect(isUsableBrowserPad(XINPUT_ID, '')).toBe(true)
  })
})
