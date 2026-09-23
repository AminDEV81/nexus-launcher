import { create } from 'zustand'
import type { Update } from '@tauri-apps/plugin-updater'
import {
  checkForUpdates,
  downloadUpdatePackage,
  installUpdateAndExit,
  getCurrentAppVersion,
  type UpdaterErrorInfo,
  type UpdaterProgress,
  classifyUpdaterError,
} from '../services/updater'
import { getSetting, setSetting } from '../services/settings'

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'ready-to-install'
  | 'installing'
  | 'completed'
  | 'error'
  | 'offline'

interface ProgressSample {
  timestamp: number
  downloaded: number
}

interface UpdaterState {
  status: UpdateStatus
  currentVersion: string
  update: Update | null
  error: UpdaterErrorInfo | null
  totalBytes: number
  downloadedBytes: number
  percentage: number
  speedBps: number
  etaSeconds: number
  isModalOpen: boolean
  isAutoCheckEnabled: boolean
  lastCheckedTimestamp: number | null
  dismissedVersion: string | null
  isLocked: boolean

  // Actions
  init: () => Promise<void>
  checkUpdates: (manual?: boolean) => Promise<void>
  startDownload: () => Promise<void>
  installAndRestart: () => Promise<void>
  dismissUpdate: () => Promise<void>
  openModal: () => void
  closeModal: () => void
  setAutoCheckEnabled: (enabled: boolean) => Promise<void>
  resetError: () => void
}

const SETTING_AUTO_CHECK = 'updater_auto_check_enabled'
const SETTING_LAST_CHECK = 'updater_last_check_timestamp'
const SETTING_DISMISSED = 'updater_dismissed_version'
const AUTO_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000 // 4 hours

export const useUpdaterStore = create<UpdaterState>((set, get) => {
  let progressSamples: ProgressSample[] = []

  return {
    status: 'idle',
    currentVersion: '0.3.5',
    update: null,
    error: null,
    totalBytes: 0,
    downloadedBytes: 0,
    percentage: 0,
    speedBps: 0,
    etaSeconds: 0,
    isModalOpen: false,
    isAutoCheckEnabled: true,
    lastCheckedTimestamp: null,
    dismissedVersion: null,
    isLocked: false,

    init: async () => {
      try {
        const [version, autoCheckSetting, lastCheckSetting, dismissedSetting] = await Promise.all([
          getCurrentAppVersion(),
          getSetting(SETTING_AUTO_CHECK),
          getSetting(SETTING_LAST_CHECK),
          getSetting(SETTING_DISMISSED),
        ])

        const isAutoCheckEnabled = autoCheckSetting !== null ? autoCheckSetting === 'true' : true
        const lastCheckedTimestamp = lastCheckSetting
          ? parseInt(lastCheckSetting, 10) || null
          : null

        set({
          currentVersion: version,
          isAutoCheckEnabled,
          lastCheckedTimestamp,
          dismissedVersion: dismissedSetting || null,
        })
      } catch (err) {
        console.warn('[UpdaterStore] Init failed to read settings:', err)
      }
    },

    checkUpdates: async (manual = false) => {
      const state = get()
      if (state.isLocked || state.status === 'downloading' || state.status === 'installing') {
        return
      }

      // Check auto-check cooldown unless manually requested
      if (!manual) {
        if (!state.isAutoCheckEnabled) {
          return
        }
        if (
          state.lastCheckedTimestamp &&
          Date.now() - state.lastCheckedTimestamp < AUTO_CHECK_INTERVAL_MS
        ) {
          return
        }
      }

      set({ isLocked: true, status: 'checking', error: null })

      try {
        const { update, error } = await checkForUpdates()
        const now = Date.now()
        await setSetting(SETTING_LAST_CHECK, String(now)).catch(() => {})

        if (error) {
          set({
            isLocked: false,
            status: error.type === 'OFFLINE' ? 'offline' : 'error',
            error,
            lastCheckedTimestamp: now,
          })
          if (manual) {
            set({ isModalOpen: true })
          }
          return
        }

        if (update) {
          const isDismissed = !manual && state.dismissedVersion === update.version

          set({
            isLocked: false,
            status: 'available',
            update,
            error: null,
            lastCheckedTimestamp: now,
            isModalOpen: manual || !isDismissed,
          })
        } else {
          set({
            isLocked: false,
            status: 'up-to-date',
            update: null,
            error: null,
            lastCheckedTimestamp: now,
          })
          if (manual) {
            set({ isModalOpen: true })
          }
        }
      } catch (err) {
        const error = classifyUpdaterError(err)
        set({
          isLocked: false,
          status: 'error',
          error,
        })
        if (manual) {
          set({ isModalOpen: true })
        }
      }
    },

    startDownload: async () => {
      const { update, isLocked, status } = get()
      if (!update || isLocked || status === 'downloading' || status === 'installing') {
        return
      }

      set({
        isLocked: true,
        status: 'downloading',
        error: null,
        totalBytes: 0,
        downloadedBytes: 0,
        percentage: 0,
        speedBps: 0,
        etaSeconds: 0,
      })

      progressSamples = [{ timestamp: Date.now(), downloaded: 0 }]

      try {
        await downloadUpdatePackage(update, (progress: UpdaterProgress) => {
          const now = Date.now()
          progressSamples.push({ timestamp: now, downloaded: progress.downloadedBytes })

          // Keep samples within the last 2 seconds for a responsive rolling window
          const cutoff = now - 2000
          progressSamples = progressSamples.filter((s) => s.timestamp >= cutoff)

          let speedBps = 0
          if (progressSamples.length >= 2) {
            const oldest = progressSamples[0]
            const timeDelta = (now - oldest.timestamp) / 1000
            const byteDelta = progress.downloadedBytes - oldest.downloaded
            if (timeDelta > 0 && byteDelta >= 0) {
              speedBps = Math.round(byteDelta / timeDelta)
            }
          }

          let etaSeconds = 0
          if (speedBps > 0 && progress.totalBytes > progress.downloadedBytes) {
            etaSeconds = Math.max(
              1,
              Math.round((progress.totalBytes - progress.downloadedBytes) / speedBps),
            )
          }

          set({
            totalBytes: progress.totalBytes,
            downloadedBytes: progress.downloadedBytes,
            percentage: progress.percent,
            speedBps,
            etaSeconds,
          })
        })

        set({
          isLocked: false,
          status: 'ready-to-install',
          percentage: 100,
        })
      } catch (err) {
        console.error('[UpdaterStore] Download failed:', err)
        const error = classifyUpdaterError(err)
        set({
          isLocked: false,
          status: 'error',
          error,
        })
      }
    },

    installAndRestart: async () => {
      const { update, status } = get()
      if (!update || status !== 'ready-to-install') {
        return
      }

      set({ isLocked: true, status: 'installing' })

      try {
        await installUpdateAndExit(update)
      } catch (err) {
        console.error('[UpdaterStore] Install failed:', err)
        const error = classifyUpdaterError(err)
        set({
          isLocked: false,
          status: 'error',
          error,
        })
      }
    },

    dismissUpdate: async () => {
      const { update } = get()
      if (update) {
        await setSetting(SETTING_DISMISSED, update.version).catch(() => {})
        set({
          dismissedVersion: update.version,
          isModalOpen: false,
        })
      } else {
        set({ isModalOpen: false })
      }
    },

    openModal: () => set({ isModalOpen: true }),
    closeModal: () => set({ isModalOpen: false }),

    setAutoCheckEnabled: async (enabled: boolean) => {
      await setSetting(SETTING_AUTO_CHECK, String(enabled)).catch(() => {})
      set({ isAutoCheckEnabled: enabled })
    },

    resetError: () => set({ error: null, status: 'idle' }),
  }
})
