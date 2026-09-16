import { describe, expect, it } from 'vitest'
import {
  extractHardwareIds,
  identifyGamepadType,
  formatGamepadDisplayName,
  parseGamepadInfo,
} from '../utils/identification'
import { mockDualSense, mockDualShock4, mockGeneric, mockXbox, mockXboxSeries } from './fixtures'

describe('Gamepad Identification & Hardware ID Parsing', () => {
  it('extracts Vendor ID and Product ID from standard Chromium ID strings', () => {
    const raw = 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)'
    const { vendorId, productId } = extractHardwareIds(raw)
    expect(vendorId).toBe('054c')
    expect(productId).toBe('0ce6')
  })

  it('extracts dashed vendor-product ID format', () => {
    const raw = '045e-028e-Microsoft X-Box 360 pad'
    const { vendorId, productId } = extractHardwareIds(raw)
    expect(vendorId).toBe('045e')
    expect(productId).toBe('028e')
  })

  it('handles empty or malformed strings gracefully', () => {
    expect(extractHardwareIds('')).toEqual({})
    expect(extractHardwareIds('Random Bluetooth Device')).toEqual({})
  })

  it('identifies DualSense and DualSense Edge correctly', () => {
    expect(identifyGamepadType('DualSense Wireless Controller', '054c', '0ce6')).toBe('dualsense')
    expect(identifyGamepadType('Wireless Controller', '054c', '0df2')).toBe('dualsense')
    expect(identifyGamepadType('PS5 Controller')).toBe('dualsense')
  })

  it('identifies DualShock 4 correctly', () => {
    expect(identifyGamepadType('Wireless Controller', '054c', '05c4')).toBe('dualshock4')
    expect(identifyGamepadType('Wireless Controller', '054c', '09cc')).toBe('dualshock4')
    expect(identifyGamepadType('Sony DualShock 4 USB')).toBe('dualshock4')
  })

  it('identifies Xbox controllers correctly', () => {
    expect(identifyGamepadType('Xbox 360 Controller', '045e', '028e')).toBe('xbox')
    expect(identifyGamepadType('Xbox Wireless Controller', '045e', '0b12')).toBe('xbox')
    expect(identifyGamepadType('XInput STANDARD GAMEPAD')).toBe('xbox')
  })

  it('identifies generic and unknown devices', () => {
    expect(identifyGamepadType('USB Gamepad')).toBe('generic')
    expect(identifyGamepadType('Custom Flight Joystick')).toBe('generic')
    expect(identifyGamepadType('Unknown Bluetooth HID #3412')).toBe('unknown')
  })

  it('formats friendly display names without clutter', () => {
    expect(formatGamepadDisplayName('DualSense Wireless Controller', 'dualsense')).toBe(
      'PlayStation DualSense Controller',
    )
    expect(formatGamepadDisplayName('Xbox 360 Controller (XInput)', 'xbox')).toBe(
      'Xbox 360 Controller',
    )
    expect(
      formatGamepadDisplayName(
        'USB Gamepad (STANDARD GAMEPAD Vendor: 1234 Product: 5678)',
        'generic',
      ),
    ).toBe('USB Gamepad')
  })

  it('parses full GamepadInfo from browser Gamepad object', () => {
    const ds = mockDualSense()
    const info = parseGamepadInfo(ds)
    expect(info.type).toBe('dualsense')
    expect(info.vendorId).toBe('054c')
    expect(info.productId).toBe('0ce6')
    expect(info.connected).toBe(true)

    const ds4 = mockDualShock4()
    const ds4Info = parseGamepadInfo(ds4)
    expect(ds4Info.type).toBe('dualshock4')
    expect(ds4Info.vendorId).toBe('054c')

    const xb360 = mockXbox()
    const xb360Info = parseGamepadInfo(xb360)
    expect(xb360Info.type).toBe('xbox')

    const xb = mockXboxSeries()
    const xbInfo = parseGamepadInfo(xb)
    expect(xbInfo.type).toBe('xbox')
    expect(xbInfo.vendorId).toBe('045e')

    const generic = mockGeneric()
    const genericInfo = parseGamepadInfo(generic)
    expect(genericInfo.type).toBe('generic')
  })
})
