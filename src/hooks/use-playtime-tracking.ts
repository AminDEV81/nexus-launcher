import { useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useLaunchStore } from '@/store/launch-store'
import { useLaunchBoostStore } from '@/features/booster/store/launch-boost-store'
import { getRunningGames } from '@/services/games'
import type { BoostReport } from '@/services/booster'
import type { Game } from '@/types/models'

interface PlaytimeUpdatedPayload {
  game_id: string
  elapsed_seconds: number
}

interface GameExitedPayload {
  game_id: string
  duration_seconds: number
}

interface ExternalGameDetectedPayload {
  game_id: string
  game_name: string
  pid: number
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
 * `useWindowCloseIntercept`). Subscribes to the events the Rust
 * launch tracker and external game detector emit and mirrors them into
 * `useLaunchStore`, so grid cards, the details panel, and the TitleBar
 * reflect both launcher-started and externally-started games in real time.
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
        // Non-fatal
      })

    listen<LaunchBoostStartPayload>('launch-boost-start', (event) => {
      const state = useLaunchBoostStore.getState()
      let g: Game | undefined
      const queries = queryClient.getQueriesData<Game[]>({ queryKey: ['games'] })
      for (const [, list] of queries) {
        if (Array.isArray(list)) {
          const found = list.find((x) => x.id === event.payload.game_id)
          if (found) {
            g = found
            break
          }
        }
      }

      if (!state.isOpen) {
        state.open({
          id: event.payload.game_id,
          name: event.payload.game_name || g?.name || 'Game',
          cover_path: event.payload.cover_path ?? g?.cover_path ?? null,
          banner_path: g?.banner_path,
          background_path: g?.background_path,
          logo_path: g?.logo_path,
          developer: g?.developer,
          genres: g?.genres,
        })
      } else if (state.game) {
        useLaunchBoostStore.setState({
          game: {
            ...state.game,
            name:
              state.game.name === 'Game' && event.payload.game_name
                ? event.payload.game_name
                : state.game.name,
            cover_path: state.game.cover_path ?? event.payload.cover_path ?? g?.cover_path ?? null,
            banner_path: state.game.banner_path ?? g?.banner_path,
            background_path: state.game.background_path ?? g?.background_path,
            logo_path: state.game.logo_path ?? g?.logo_path,
            developer: state.game.developer ?? g?.developer,
            genres: state.game.genres ?? g?.genres,
          },
        })
      }
    }).then((fn) => (cancelled ? fn() : unlisten.push(fn))).catch(() => {})

    listen<LaunchBoostProgressPayload>('launch-boost-progress', (event) => {
      useLaunchBoostStore.getState().onProgress(event.payload)
    }).then((fn) => (cancelled ? fn() : unlisten.push(fn))).catch(() => {})

    listen<LaunchBoostCompletePayload>('launch-boost-complete', (event) => {
      useLaunchBoostStore.getState().onComplete(event.payload.report.closed_apps)
    }).then((fn) => (cancelled ? fn() : unlisten.push(fn))).catch(() => {})

    listen<{ game_id: string; error?: string }>('launch-boost-failed', (event) => {
      useLaunchBoostStore.getState().close()
      if (event.payload?.error) {
        toast.error(event.payload.error, { duration: 5000 })
      }
    }).then((fn) => (cancelled ? fn() : unlisten.push(fn))).catch(() => {})

    listen<ExternalGameDetectedPayload>('external-game-detected', (event) => {
      useLaunchStore.getState().markLaunched(event.payload.game_id)
      toast.success(
        `Detected "${event.payload.game_name}" running externally — tracking playtime & saves automatically!`,
      )
    }).then((fn) => (cancelled ? fn() : unlisten.push(fn))).catch(() => {})

    listen<string>('game-launched', (event) => {
      useLaunchStore.getState().markLaunched(event.payload)
      useLaunchBoostStore.getState().onGameLaunched(event.payload)
    }).then((fn) => (cancelled ? fn() : unlisten.push(fn))).catch(() => {})

    listen<PlaytimeUpdatedPayload>('playtime-updated', (event) => {
      useLaunchStore.getState().updateElapsed(event.payload.game_id, event.payload.elapsed_seconds)
    }).then((fn) => (cancelled ? fn() : unlisten.push(fn))).catch(() => {})

    listen<GameExitedPayload>('game-exited', (event) => {
      useLaunchStore.getState().markExited(event.payload.game_id)
      useLaunchBoostStore.getState().close()
      queryClient.invalidateQueries({ queryKey: ['games'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      queryClient.invalidateQueries({ queryKey: ['collections'] })
    }).then((fn) => (cancelled ? fn() : unlisten.push(fn))).catch(() => {})

    return () => {
      cancelled = true
      unlisten.forEach((fn) => fn())
    }
  }, [queryClient])
}
