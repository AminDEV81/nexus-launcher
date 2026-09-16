import type { GamepadBattery, GamepadInfo, GamepadType } from '../types/gamepad'
import {
  SONY_DUALSENSE_PRODUCTS,
  SONY_DUALSHOCK4_PRODUCTS,
  VENDOR_MICROSOFT,
  VENDOR_SONY,
  XBOX_360_PRODUCTS,
  XBOX_ONE_SERIES_PRODUCTS,
} from '../constants/vendor-ids'

interface ParsedHardwareId {
  vendorId?: string
  productId?: string
}

/**
 * Extracts 4-character hex Vendor ID and Product ID from standard browser Gamepad IDs.
 * Handles formats:
 * - "Vendor: 054c Product: 0ce6"
 * - "045e-028e-..."
 * - "vendor:045e, product:02d1"
 */
export function extractHardwareIds(idString: string): ParsedHardwareId {
  if (!idString || typeof idString !== 'string') return {}

  // Format: "Vendor: 054c Product: 0ce6" (case-insensitive)
  const vendorMatch = idString.match(/vendor[:\s]+([0-9a-fA-F]{4})/i)
  const productMatch = idString.match(/product[:\s]+([0-9a-fA-F]{4})/i)

  if (vendorMatch && productMatch) {
    return {
      vendorId: vendorMatch[1].toLowerCase(),
      productId: productMatch[1].toLowerCase(),
    }
  }

  // Format: "045e-028e-..."
  const dashMatch = idString.match(/^([0-9a-fA-F]{4})-([0-9a-fA-F]{4})/)
  if (dashMatch) {
    return {
      vendorId: dashMatch[1].toLowerCase(),
      productId: dashMatch[2].toLowerCase(),
    }
  }

  return {}
}

/**
 * Identifies the GamepadType based on hardware IDs and string heuristics.
 */
export function identifyGamepadType(
  idString: string,
  vendorId?: string,
  productId?: string,
): GamepadType {
  const lower = (idString || '').toLowerCase()

  // 1. Precise check via extracted Vendor and Product IDs
  if (vendorId === VENDOR_SONY) {
    if (productId && SONY_DUALSENSE_PRODUCTS.has(productId)) {
      return 'dualsense'
    }
    if (productId && SONY_DUALSHOCK4_PRODUCTS.has(productId)) {
      return 'dualshock4'
    }
    // Fallback if Sony vendor but unknown product
    if (
      lower.includes('dualsense') ||
      lower.includes('ps5') ||
      lower.includes('0ce6') ||
      lower.includes('0df2')
    ) {
      return 'dualsense'
    }
    return 'dualshock4'
  }

  if (vendorId === VENDOR_MICROSOFT) {
    return 'xbox'
  }

  // 2. Name heuristics
  if (
    lower.includes('dualsense') ||
    lower.includes('ps5 controller') ||
    lower.includes('0ce6') ||
    lower.includes('0df2')
  ) {
    return 'dualsense'
  }

  if (
    lower.includes('dualshock') ||
    lower.includes('ps4 controller') ||
    lower.includes('05c4') ||
    lower.includes('09cc') ||
    (lower.includes('sony') && lower.includes('wireless controller'))
  ) {
    return 'dualshock4'
  }

  if (
    lower.includes('xbox') ||
    lower.includes('xinput') ||
    lower.includes('x-box') ||
    lower.includes('microsoft')
  ) {
    return 'xbox'
  }

  // 3. Generic vs Unknown
  if (
    lower.includes('gamepad') ||
    lower.includes('joystick') ||
    lower.includes('controller') ||
    lower.includes('usb')
  ) {
    return 'generic'
  }

  return 'unknown'
}

/**
 * Produces a human-friendly display name for the controller.
 */
export function formatGamepadDisplayName(
  rawId: string,
  type: GamepadType,
  _vendorId?: string,
  productId?: string,
): string {
  if (type === 'dualsense') {
    if (productId === '0df2') return 'PlayStation DualSense Edge'
    return 'PlayStation DualSense Controller'
  }

  if (type === 'dualshock4') {
    return 'PlayStation DualShock 4 Controller'
  }

  if (type === 'xbox') {
    if (productId && XBOX_360_PRODUCTS.has(productId)) return 'Xbox 360 Controller'
    if (productId && XBOX_ONE_SERIES_PRODUCTS.has(productId)) return 'Xbox Wireless Controller'
    if (rawId.toLowerCase().includes('360')) return 'Xbox 360 Controller'
    if (rawId.toLowerCase().includes('one')) return 'Xbox One Controller'
    if (rawId.toLowerCase().includes('series')) return 'Xbox Series X|S Controller'
    return 'Xbox Controller'
  }

  // Clean up noisy browser strings like "... (STANDARD GAMEPAD Vendor: xxxx Product: yyyy)"
  const cleaned = (rawId || '')
    .replace(/\s*\([^)]*standard\s*gamepad[^)]*\)/gi, '')
    .replace(/\s*vendor:\s*[0-9a-f]{4}\s*product:\s*[0-9a-f]{4}/gi, '')
    .trim()

  if (cleaned.length > 0) {
    return cleaned
  }

  return type === 'generic' ? 'Generic Gamepad' : 'Controller'
}

/**
 * Inspects a browser Gamepad object and constructs a rich GamepadInfo record.
 */
export function parseGamepadInfo(gamepad: Gamepad): GamepadInfo {
  const { vendorId, productId } = extractHardwareIds(gamepad.id)
  const type = identifyGamepadType(gamepad.id, vendorId, productId)
  const displayName = formatGamepadDisplayName(gamepad.id, type, vendorId, productId)

  // Detect vibration capability
  const g = gamepad as unknown as {
    vibrationActuator?: unknown
    hapticActuators?: unknown[]
    battery?: { level?: number; charging?: boolean }
  }

  const hasRumble = Boolean(
    g.vibrationActuator || (Array.isArray(g.hapticActuators) && g.hapticActuators.length > 0),
  )

  let battery: GamepadBattery | undefined
  if (g.battery && typeof g.battery.level === 'number') {
    battery = {
      level: g.battery.level,
      charging: g.battery.charging,
      status: g.battery.charging ? 'charging' : 'percentage',
    }
  }

  return {
    id: gamepad.id,
    index: gamepad.index,
    connected: gamepad.connected,
    displayName,
    type,
    mapping: gamepad.mapping,
    vendorId,
    productId,
    hasRumble,
    battery,
  }
}
