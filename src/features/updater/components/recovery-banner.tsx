import { useEffect, useState } from 'react'
import { AlertTriangle, Download, X } from 'lucide-react'
import { openUrl } from '@tauri-apps/plugin-opener'
import { checkHealthStatus, markLaunchSuccessful, type HealthStatus } from '@/services/health-guard'
import { getCurrentAppVersion } from '@/services/updater'

export function RecoveryBanner() {
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    let mounted = true
    void checkHealthStatus().then((res) => {
      if (mounted) {
        setHealth(res)
      }
    })
    return () => {
      mounted = false
    }
  }, [])

  if (!health || !health.isCrashLooping || dismissed) {
    return null
  }

  const handleOpenReleases = async () => {
    const url = health.lastKnownGoodVersion
      ? `https://github.com/AminDEV81/nexus-launcher/releases/tag/v${health.lastKnownGoodVersion.replace(/^v/, '')}`
      : 'https://github.com/AminDEV81/nexus-launcher/releases'

    try {
      await openUrl(url)
    } catch {
      window.open(url, '_blank')
    }
  }

  const handleDismiss = async () => {
    setDismissed(true)
    const ver = await getCurrentAppVersion()
    await markLaunchSuccessful(ver)
  }

  return (
    <div className="relative z-[200] flex items-center justify-between gap-4 border-b border-amber-500/40 bg-amber-950/80 px-4 py-2.5 text-xs text-amber-200 backdrop-blur-md">
      <div className="flex items-center gap-2.5">
        <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-400">
          <AlertTriangle className="size-3.5" />
        </div>
        <div>
          <span className="font-semibold text-amber-300">Recovery Guard: </span>
          Nexus Launcher detected repeated startup interruptions.
          {health.lastKnownGoodVersion && (
            <span className="ml-1 text-amber-100">
              Last stable version:{' '}
              <strong className="text-white">v{health.lastKnownGoodVersion}</strong>
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleOpenReleases}
          className="flex items-center gap-1.5 rounded-md border border-amber-400/40 bg-amber-500/20 px-2.5 py-1 font-medium text-amber-200 transition hover:bg-amber-500/30 hover:text-white"
        >
          <Download className="size-3" /> Download Stable Version
        </button>
        <button
          onClick={handleDismiss}
          className="rounded p-1 text-amber-400/70 transition hover:bg-amber-500/20 hover:text-white"
          title="Dismiss and keep current version"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  )
}
