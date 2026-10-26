import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useSettings } from '@/features/settings/hooks/use-settings'
import { useDownloads, usePauseDownload, useResumeDownload } from './use-downloads'
import { call } from '@/services/tauri'

export function isTimeInWindow(startTime: string, endTime: string, now: Date): boolean {
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
  const pausedByScheduler = useRef<Set<string>>(new Set())
  const wasWindowActive = useRef<boolean | null>(null)

  const downloadsRef = useRef(downloads)
  downloadsRef.current = downloads
  const pauseMutateRef = useRef(pause.mutate)
  pauseMutateRef.current = pause.mutate
  const resumeMutateRef = useRef(resume.mutate)
  resumeMutateRef.current = resume.mutate

  useEffect(() => {
    if (!settings || settings.download_scheduler_enabled !== 'true') {
      wasWindowActive.current = null
      pausedByScheduler.current.clear()
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
      const currentDownloads = downloadsRef.current
      const now = new Date()
      const dayOfWeek = now.getDay()

      const isDayActive = selectedDays.includes(dayOfWeek)
      const isWindowActive = isDayActive && isTimeInWindow(startTime, endTime, now)
      const transitionedToActive = wasWindowActive.current !== true && isWindowActive
      wasWindowActive.current = isWindowActive

      const activeDownloads = currentDownloads.filter(
        (d) => d.status === 'downloading' || d.status === 'extracting',
      )
      const pausedDownloads = currentDownloads.filter((d) => d.status === 'paused')
      const queuedDownloads = currentDownloads.filter((d) => d.status === 'queued')

      if (activeDownloads.length > 0 || queuedDownloads.length > 0) {
        hadActiveDownloads.current = true
        hasTriggeredShutdown.current = false
      }

      if (isWindowActive) {
        // Resume downloads that were paused by the scheduler, or all paused downloads when first entering the window
        for (const d of pausedDownloads) {
          if (transitionedToActive || pausedByScheduler.current.has(d.id)) {
            pausedByScheduler.current.delete(d.id)
            resumeMutateRef.current(d.id)
          }
        }
      } else {
        // Outside schedule: pause active downloads and remember we paused them
        for (const d of activeDownloads) {
          pausedByScheduler.current.add(d.id)
          pauseMutateRef.current(d.id)
        }
      }

      // Check auto power action only when all active, paused, and queued downloads are done
      if (
        autoShutdown &&
        hadActiveDownloads.current &&
        activeDownloads.length === 0 &&
        pausedDownloads.length === 0 &&
        queuedDownloads.length === 0 &&
        currentDownloads.length > 0 &&
        !hasTriggeredShutdown.current
      ) {
        hasTriggeredShutdown.current = true
        hadActiveDownloads.current = false
        if (action === 'shutdown') {
          toast.warning('Downloads completed. System will shut down in 30 seconds.', {
            duration: 30000,
            action: {
              label: 'Cancel Shutdown',
              onClick: () => {
                call('cancel_shutdown')
                  .then(() => toast.info('Scheduled system shutdown cancelled.'))
                  .catch(() => undefined)
              },
            },
          })
        } else {
          toast.warning(`Downloads completed. System will enter ${action} mode now.`)
        }
        call('shutdown_system', { action }).catch((err) => {
          toast.error(`Scheduled power action failed: ${String(err)}`)
        })
      }
    }

    checkSchedule()
    const interval = setInterval(checkSchedule, 15000)
    return () => clearInterval(interval)
  }, [settings])
}
