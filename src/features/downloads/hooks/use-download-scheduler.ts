import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useSettings } from '@/features/settings/hooks/use-settings'
import { useDownloads, usePauseDownload, useResumeDownload } from './use-downloads'
import { call } from '@/services/tauri'

function isTimeInWindow(startTime: string, endTime: string, now: Date): boolean {
  const [sH, sM] = startTime.split(':').map(Number)
  const [eH, eM] = endTime.split(':').map(Number)
  if (isNaN(sH) || isNaN(sM) || isNaN(eH) || isNaN(eM)) return true

  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const startMinutes = sH * 60 + sM
  const endMinutes = eH * 60 + eM

  if (startMinutes <= endMinutes) {
    return nowMinutes >= startMinutes && nowMinutes < endMinutes
  }
  // Crosses midnight (e.g. 23:00 to 07:00)
  return nowMinutes >= startMinutes || nowMinutes < endMinutes
}

export function useDownloadScheduler() {
  const { data: settings } = useSettings()
  const { data: downloads = [] } = useDownloads()
  const pause = usePauseDownload()
  const resume = useResumeDownload()
  const hasTriggeredShutdown = useRef(false)
  const hadActiveDownloads = useRef(false)

  useEffect(() => {
    if (!settings || settings.download_scheduler_enabled !== 'true') {
      return
    }

    const startTime = settings.download_scheduler_start_time || '02:00'
    const endTime = settings.download_scheduler_end_time || '07:00'
    let selectedDays: number[] = [0, 1, 2, 3, 4, 5, 6]
    try {
      if (settings.download_scheduler_days) {
        selectedDays = JSON.parse(settings.download_scheduler_days)
      }
    } catch {
      selectedDays = [0, 1, 2, 3, 4, 5, 6]
    }

    const autoShutdown = settings.download_scheduler_auto_shutdown === 'true'
    const action = settings.download_scheduler_action || 'shutdown'

    const checkSchedule = () => {
      const now = new Date()
      const dayOfWeek = now.getDay()

      const isDayActive = selectedDays.includes(dayOfWeek)
      const isWindowActive = isDayActive && isTimeInWindow(startTime, endTime, now)

      const activeDownloads = downloads.filter(
        (d) => d.status === 'downloading' || d.status === 'extracting',
      )
      const pausedDownloads = downloads.filter((d) => d.status === 'paused')

      if (activeDownloads.length > 0) {
        hadActiveDownloads.current = true
      }

      if (isWindowActive) {
        // Inside active schedule: resume any paused downloads
        for (const d of pausedDownloads) {
          if (!resume.isPending) {
            resume.mutate(d.id)
          }
        }
      } else {
        // Outside schedule: pause active downloads
        for (const d of activeDownloads) {
          if (!pause.isPending) {
            pause.mutate(d.id)
          }
        }
      }

      // Check auto power action
      if (
        autoShutdown &&
        hadActiveDownloads.current &&
        activeDownloads.length === 0 &&
        pausedDownloads.length === 0 &&
        downloads.length > 0 &&
        !hasTriggeredShutdown.current
      ) {
        hasTriggeredShutdown.current = true
        toast.warning(`Downloads completed. System will ${action} in 30 seconds.`)
        call('shutdown_system', { action }).catch(() => undefined)
      }
    }

    checkSchedule()
    const interval = setInterval(checkSchedule, 15000)
    return () => clearInterval(interval)
  }, [settings, downloads, pause, resume])
}
