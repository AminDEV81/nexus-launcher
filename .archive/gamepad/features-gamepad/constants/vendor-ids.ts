export const VENDOR_SONY = '054c'
export const VENDOR_MICROSOFT = '045e'
export const VENDOR_NINTENDO = '057e'
export const VENDOR_LOGITECH = '046d'

/** Known Sony Product IDs */
export const SONY_DUALSHOCK4_PRODUCTS = new Set([
  '05c4', // DualShock 4 (v1)
  '09cc', // DualShock 4 (v2)
  '0ba0', // DualShock 4 USB Wireless Adapter
])

export const SONY_DUALSENSE_PRODUCTS = new Set([
  '0ce6', // DualSense Wireless Controller
  '0df2', // DualSense Edge Wireless Controller
])

/** Known Microsoft Xbox Product IDs */
export const XBOX_360_PRODUCTS = new Set([
  '028e', // Xbox 360 Controller (wired)
  '028f', // Xbox 360 Wireless Controller
  '02a1', // Xbox 360 Wireless Receiver
  '0719', // Xbox 360 Wireless Adapter
])

export const XBOX_ONE_SERIES_PRODUCTS = new Set([
  '02d1', // Xbox One Controller
  '02dd', // Xbox One Controller (2015)
  '02e3', // Xbox One Elite Controller
  '02ea', // Xbox One S Controller (USB)
  '02fd', // Xbox One S Controller (Bluetooth)
  '0b00', // Xbox Elite Series 2 (USB)
  '0b05', // Xbox Elite Series 2 (Bluetooth)
  '0b12', // Xbox Series X|S Controller (USB)
  '0b13', // Xbox Series X|S Controller (Bluetooth)
  '0b20', // Xbox Wireless Controller
  '0b22', // Xbox Wireless Controller
])
