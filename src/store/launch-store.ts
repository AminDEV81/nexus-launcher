import { create } from 'zustand'

interface LaunchState {
  runningGameIds: Set<string>
  elapsedSeconds: Record<string, number>
  markLaunched: (gameId: string) => void
  updateElapsed: (gameId: string, seconds: number) => void
  markExited: (gameId: string) => void
  hydrateRunning: (gameIds: string[]) => void
}

/**
 * Mirrors the Rust launch tracker's state on the frontend. Nothing here
 * writes back to the backend — this is purely a projection of the
 * `game-launched` / `playtime-updated` / `game-exited` events (wired up
 * once, at the app root, by `usePlaytimeTracking`) plus a one-time
 * `get_running_games` hydration on startup, so any component can read
 * "is this game running / for how long" without opening its own event
 * listener.
 */
export const useLaunchStore = create<LaunchState>((set) => ({
  runningGameIds: new Set(),
  elapsedSeconds: {},

  markLaunched: (gameId) =>
    set((state) => ({ runningGameIds: new Set(state.runningGameIds).add(gameId) })),

  updateElapsed: (gameId, seconds) =>
    set((state) => ({ elapsedSeconds: { ...state.elapsedSeconds, [gameId]: seconds } })),

  markExited: (gameId) =>
    set((state) => {
      const runningGameIds = new Set(state.runningGameIds)
      runningGameIds.delete(gameId)
      const elapsedSeconds = { ...state.elapsedSeconds }
      delete elapsedSeconds[gameId]
      return { runningGameIds, elapsedSeconds }
    }),

  hydrateRunning: (gameIds) => set({ runningGameIds: new Set(gameIds) }),
}))
