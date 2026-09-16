import type { GamepadBattery, GamepadInfo } from '../types/gamepad'
import { call } from '@/services/tauri'

interface NativeBatteryResponse {
  status: string
  level?: number
  charging: boolean
  is_wired: boolean
}

/**
 * Capability-based battery provider.
 * Queries Web Gamepad API or Windows XInput native layer without fabricating data.
 */
export async function queryGamepadBattery(
  info: GamepadInfo,
  rawPad?: Gamepad | null,
): Promise<GamepadBattery> {
  // 1. Check if browser Gamepad API directly exposes battery (Chromium experimental or specific drivers)
  if (rawPad) {
    const extendedPad = rawPad as unknown as {
      battery?: { level?: number; charging?: boolean }
    }
    if (
      extendedPad.battery &&
      typeof extendedPad.battery.level === 'number' &&
      !isNaN(extendedPad.battery.level)
    ) {
      const level = Math.max(0, Math.min(1, extendedPad.battery.level))
      const charging = Boolean(extendedPad.battery.charging)
      return {
        status: charging ? 'charging' : 'percentage',
        level,
        charging,
        isWired: false,
      }
    }
  }

  // 2. If it's an Xbox or XInput controller, query our Windows XInput backend provider
  if (
    info.type === 'xbox' ||
    info.vendorId === '045e' ||
    info.id.toLowerCase().includes('xinput')
  ) {
    try {
      const res = await call<NativeBatteryResponse | null>('get_xinput_battery', {
        userIndex: info.index,
      })
      if (res) {
        if (res.status === 'wired' || res.is_wired) {
          return {
            status: 'wired',
            level: 1.0,
            charging: true,
            isWired: true,
          }
        }
        if (res.status === 'percentage' && typeof res.level === 'number') {
          return {
            status: res.charging ? 'charging' : 'percentage',
            level: res.level,
            charging: res.charging,
            isWired: false,
          }
        }
      }
    } catch {
      // Graceful fallback if Tauri IPC is unavailable or non-Windows environment
    }
  }

  // 3. Fallback: Battery information is unknown/unsupported
  return {
    status: 'unknown',
  }
}
