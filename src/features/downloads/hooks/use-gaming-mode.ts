import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useLaunchStore } from '@/store/launch-store'
import { useSettings } from '@/features/settings/hooks/use-settings'
import { useDownloads, usePauseDownload, useResumeDownload } from './use-downloads'

export function useGamingMode() {
  const { data: settings } = useSettings()
  const { data: downloads = [] } = useDownloads()
  const runningGameIds = useLaunchStore((s) => s.runningGameIds)
  const pause = usePauseDownload()
  const resume = useResumeDownload()

  const pausedByGamingMode = useRef<Set<string>>(new Set())
  const prevRunningCount = useRef(0)

  const isGamingModeEnabled = settings?.download_gaming_mode !== 'false'

  useEffect(() => {
    if (!isGamingModeEnabled) return

    const runningCount = runningGameIds.size

    // Game just started running
    if (runningCount > 0 && prevRunningCount.current === 0) {
      const active = downloads.filter(
        (d) => d.status === 'downloading' || d.status === 'extracting',
      )
      if (active.length > 0) {
        for (const d of active) {
          pausedByGamingMode.current.add(d.id)
          pause.mutate(d.id)
        }
        toast.info('Gaming Mode: Downloads paused to reduce latency.', { duration: 3000 })
      }
    }

    // All games exited
    if (runningCount === 0 && prevRunningCount.current > 0) {
      if (pausedByGamingMode.current.size > 0) {
        const idsToResume = Array.from(pausedByGamingMode.current)
        pausedByGamingMode.current.clear()

        for (const id of idsToResume) {
          resume.mutate(id)
        }
        toast.success('Gaming Mode: Game closed. Resuming downloads.', { duration: 3000 })
      }
    }

    prevRunningCount.current = runningCount
  }, [runningGameIds, isGamingModeEnabled, downloads, pause, resume])
}
