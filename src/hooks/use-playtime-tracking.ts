import { useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useLaunchStore } from '@/store/launch-store'
import { useLaunchBoostStore } from '@/features/booster/store/launch-boost-store'
import { getRunningGames } from '@/services/games'
import type { BoostReport } from '@/services/booster'

interface PlaytimeUpdatedPayload {
  game_id: string
  elapsed_seconds: number
}

interface GameExitedPayload {
  game_id: string
  duration_seconds: number
}

interface LaunchBoostStartPayload {
  game_id: string
  game_name: string
  cover_path: string | null
}

interface LaunchBoostProgressPayload {
  game_id: string
  step_index: number
  total_steps: number
  module_id: string
  label: string
  applied: boolean
  detail: string
  metric?: string
  percent: number
}

interface LaunchBoostCompletePayload {
  game_id: string
  report: BoostReport
}

/**
 * Mounted once at the app root (see `app-shell.tsx`, alongside
 * `useWindowCloseIntercept`). Subscribes to the three events the Rust
 * launch tracker emits and mirrors them into `useLaunchStore`, so the
 * grid card and details panel Play buttons can just read from the
 * store rather than each opening its own listener.
 *
 * Also hydrates from `get_running_games` on mount — the tracker itself
 * lives in the backend, so a frontend reload mid-session shouldn't lose
 * the "Playing…" indicator, even though the frontend obviously won't
 * recover the live elapsed-time count until the next `playtime-updated`
 * tick arrives.
 */
export function usePlaytimeTracking() {
  const queryClient = useQueryClient()

  useEffect(() => {
    let cancelled = false
    const unlisten: Array<() => void> = []

    getRunningGames()
      .then((gameIds) => {
        if (!cancelled) useLaunchStore.getState().hydrateRunning(gameIds)
      })
      .catch(() => {
        // Non-fatal — worst case the "Playing…" badge just doesn't
        // reappear for a session that was already running before this
        // reload, which the next launch/exit event corrects anyway.
      })

    listen<LaunchBoostStartPayload>('launch-boost-start', (event) => {
      const state = useLaunchBoostStore.getState()
      if (!state.isOpen) {
        state.open({
          id: event.payload.game_id,
          name: event.payload.game_name,
          cover_path: event.payload.cover_path,
        })
      }
    }).then((fn) => (cancelled ? fn() : unlisten.push(fn)))

    listen<LaunchBoostProgressPayload>('launch-boost-progress', (event) => {
      useLaunchBoostStore.getState().onProgress(event.payload)
    }).then((fn) => (cancelled ? fn() : unlisten.push(fn)))

    listen<LaunchBoostCompletePayload>('launch-boost-complete', (event) => {
      useLaunchBoostStore.getState().onComplete(event.payload.report.closed_apps)
    }).then((fn) => (cancelled ? fn() : unlisten.push(fn)))

    listen<{ game_id: string; error?: string }>('launch-boost-failed', (event) => {
      useLaunchBoostStore.getState().close()
      if (event.payload?.error) {
        toast.error(event.payload.error, { duration: 5000 })
      }
    }).then((fn) => (cancelled ? fn() : unlisten.push(fn)))

    listen<string>('game-launched', (event) => {
      useLaunchStore.getState().markLaunched(event.payload)
      useLaunchBoostStore.getState().onGameLaunched(event.payload)
    }).then((fn) => (cancelled ? fn() : unlisten.push(fn)))

    listen<PlaytimeUpdatedPayload>('playtime-updated', (event) => {
      useLaunchStore.getState().updateElapsed(event.payload.game_id, event.payload.elapsed_seconds)
    }).then((fn) => (cancelled ? fn() : unlisten.push(fn)))

    listen<GameExitedPayload>('game-exited', (event) => {
      useLaunchStore.getState().markExited(event.payload.game_id)
      useLaunchBoostStore.getState().close()
      // Refreshes total_playtime_seconds/last_played_at now that the
      // backend has written the finished session.
      queryClient.invalidateQueries({ queryKey: ['games'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      queryClient.invalidateQueries({ queryKey: ['collections'] })
    }).then((fn) => (cancelled ? fn() : unlisten.push(fn)))

    return () => {
      cancelled = true
      unlisten.forEach((fn) => fn())
    }
  }, [queryClient])
}
