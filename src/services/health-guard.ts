import { getSetting, setSetting } from './settings'

const SETTING_FAILED_LAUNCHES = 'updater_failed_launches_count'
const SETTING_LAST_KNOWN_GOOD = 'updater_last_known_good_version'
const CRASH_LOOP_THRESHOLD = 3

export interface HealthStatus {
  isCrashLooping: boolean
  failedCount: number
  lastKnownGoodVersion: string | null
}

/**
 * Checks the crash guard status by inspecting consecutive failed launch records in the local database.
 */
export async function checkHealthStatus(): Promise<HealthStatus> {
  try {
    const failedCountStr = await getSetting(SETTING_FAILED_LAUNCHES)
    const failedCount = failedCountStr ? parseInt(failedCountStr, 10) || 0 : 0
    const lastKnownGoodVersion = await getSetting(SETTING_LAST_KNOWN_GOOD)

    return {
      isCrashLooping: failedCount >= CRASH_LOOP_THRESHOLD,
      failedCount,
      lastKnownGoodVersion,
    }
  } catch (err) {
    console.warn('[HealthGuard] Failed to read health status from settings:', err)
    return {
      isCrashLooping: false,
      failedCount: 0,
      lastKnownGoodVersion: null,
    }
  }
}

/**
 * Called once the main application UI successfully mounts and stabilizes.
 * Clears consecutive failure counters and marks the current running version as stable.
 */
export async function markLaunchSuccessful(currentVersion: string): Promise<void> {
  try {
    await setSetting(SETTING_FAILED_LAUNCHES, '0')
    if (currentVersion) {
      await setSetting(SETTING_LAST_KNOWN_GOOD, currentVersion)
    }
  } catch (err) {
    console.warn('[HealthGuard] Failed to mark launch as successful:', err)
  }
}

/**
 * Increments the failure counter before launch stabilizes.
 */
export async function registerEarlyLaunch(): Promise<void> {
  try {
    const failedCountStr = await getSetting(SETTING_FAILED_LAUNCHES)
    const failedCount = failedCountStr ? parseInt(failedCountStr, 10) || 0 : 0
    await setSetting(SETTING_FAILED_LAUNCHES, String(failedCount + 1))
  } catch (err) {
    console.warn('[HealthGuard] Failed to register launch attempt:', err)
  }
}
