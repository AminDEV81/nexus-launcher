import { getVersion } from '@tauri-apps/api/app'
import { check, type DownloadEvent, type Update } from '@tauri-apps/plugin-updater'

export type UpdaterErrorType =
  'NETWORK' | 'SIGNATURE' | 'METADATA' | 'DOWNLOAD' | 'OFFLINE' | 'INSTALL_FAILED' | 'UNKNOWN'

export interface UpdaterErrorInfo {
  type: UpdaterErrorType
  message: string
  originalError?: unknown
}

export interface UpdaterProgress {
  totalBytes: number
  downloadedBytes: number
  percent: number
  chunkLength?: number
}

/**
 * Retrieves the application's current compiled version from the Tauri runtime.
 */
export async function getCurrentAppVersion(): Promise<string> {
  try {
    return await getVersion()
  } catch (error) {
    console.warn('[Updater] Failed to get app version from runtime, falling back:', error)
    return '0.4.0'
  }
}

/**
 * Classifies updater error strings and exceptions into structured domain error types.
 */
export function classifyUpdaterError(error: unknown): UpdaterErrorInfo {
  const message = error instanceof Error ? error.message : String(error)
  const lower = message.toLowerCase()

  if (
    lower.includes('failed to install package') ||
    lower.includes('install') ||
    lower.includes('dpkg') ||
    lower.includes('apt') ||
    lower.includes('permission denied') ||
    lower.includes('elevation')
  ) {
    return {
      type: 'INSTALL_FAILED',
      message:
        'Automatic in-place installation could not complete (common on Linux .deb packages without root privileges). You can download the latest package directly from GitHub Releases.',
      originalError: error,
    }
  }

  if (
    lower.includes('offline') ||
    lower.includes('failed to fetch') ||
    lower.includes('network') ||
    lower.includes('dns') ||
    lower.includes('connection refused') ||
    lower.includes('timed out') ||
    lower.includes('timeout')
  ) {
    return {
      type: 'NETWORK',
      message: 'Network connection issue or GitHub unreachable.',
      originalError: error,
    }
  }

  if (
    lower.includes('signature') ||
    lower.includes('minisign') ||
    lower.includes('invalid signature') ||
    lower.includes('pubkey') ||
    lower.includes('untrusted')
  ) {
    return {
      type: 'SIGNATURE',
      message: 'Security validation failed: update signature is invalid or untrusted.',
      originalError: error,
    }
  }

  if (
    lower.includes('json') ||
    lower.includes('parse') ||
    lower.includes('manifest') ||
    lower.includes('metadata') ||
    lower.includes('invalid release')
  ) {
    return {
      type: 'METADATA',
      message: 'Failed to parse update manifest metadata from release server.',
      originalError: error,
    }
  }

  if (
    lower.includes('download') ||
    lower.includes('chunk') ||
    lower.includes('stream') ||
    lower.includes('payload')
  ) {
    return {
      type: 'DOWNLOAD',
      message: 'Error streaming or writing update package to disk.',
      originalError: error,
    }
  }

  return {
    type: 'UNKNOWN',
    message: message || 'An unexpected error occurred during update processing.',
    originalError: error,
  }
}

/**
 * Checks GitHub Releases for a newer version matching the Minisign signature.
 * Returns null if no update is available.
 */
export async function checkForUpdates(): Promise<{
  update: Update | null
  error: UpdaterErrorInfo | null
}> {
  // If the browser environment reports offline, return quickly without hanging
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return {
      update: null,
      error: {
        type: 'OFFLINE',
        message: 'System is currently offline. Update check skipped.',
      },
    }
  }

  try {
    const update = await check({
      timeout: 15000,
    })

    return { update, error: null }
  } catch (error) {
    console.error('[Updater] Check failed:', error)
    return {
      update: null,
      error: classifyUpdaterError(error),
    }
  }
}

/**
 * Downloads the update package with live progress callbacks.
 * Signature validation is automatically performed by Tauri upon download completion.
 */
export async function downloadUpdatePackage(
  update: Update,
  onProgress: (progress: UpdaterProgress) => void,
): Promise<void> {
  let totalBytes = 0
  let downloadedBytes = 0

  await update.download((event: DownloadEvent) => {
    switch (event.event) {
      case 'Started': {
        totalBytes = event.data.contentLength ?? 0
        onProgress({
          totalBytes,
          downloadedBytes,
          percent: totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : 0,
        })
        break
      }
      case 'Progress': {
        downloadedBytes += event.data.chunkLength
        const percent =
          totalBytes > 0 ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)) : 0
        onProgress({
          totalBytes,
          downloadedBytes,
          percent,
          chunkLength: event.data.chunkLength,
        })
        break
      }
      case 'Finished': {
        onProgress({
          totalBytes: totalBytes || downloadedBytes,
          downloadedBytes,
          percent: 100,
        })
        break
      }
    }
  })
}

/**
 * Installs the verified downloaded package and cleanly terminates Nexus launcher
 * so Windows NSIS can swap the binary in passive mode.
 */
export async function installUpdateAndExit(update: Update): Promise<void> {
  await update.install({
    restartAfterInstall: true,
  })
}
