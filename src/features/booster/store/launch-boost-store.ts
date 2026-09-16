import { create } from 'zustand'

export interface BoostProgressStep {
  id: string
  label: string
  detail?: string
  metric?: string
  applied: boolean
  percent: number
}

export interface LaunchBoostGameInfo {
  id: string
  name: string
  cover_path: string | null
  developer?: string | null
  genres?: string[]
}

interface LaunchBoostState {
  isOpen: boolean
  game: LaunchBoostGameInfo | null
  progress: number
  phase: 'idle' | 'optimizing' | 'launching' | 'ready'
  activeStepLabel: string
  steps: BoostProgressStep[]
  closedApps: string[]

  open: (game: LaunchBoostGameInfo) => void
  onProgress: (step: {
    game_id: string
    step_index: number
    total_steps: number
    module_id: string
    label: string
    applied: boolean
    detail: string
    metric?: string
    percent: number
  }) => void
  onComplete: (closedApps: string[]) => void
  onGameLaunched: (gameId: string) => void
  close: () => void
}

export const useLaunchBoostStore = create<LaunchBoostState>((set, get) => ({
  isOpen: false,
  game: null,
  progress: 0,
  phase: 'idle',
  activeStepLabel: 'INITIALIZING BOOST SEQUENCE...',
  steps: [],
  closedApps: [],

  open: (game) => {
    set({
      isOpen: true,
      game,
      progress: 5,
      phase: 'optimizing',
      activeStepLabel: 'INITIALIZING BOOST SEQUENCE...',
      steps: [
        {
          id: 'init',
          label: 'Initializing performance matrix',
          applied: true,
          percent: 5,
          metric: 'Ready',
        },
      ],
      closedApps: [],
    })
  },

  onProgress: (step) => {
    const current = get()
    if (!current.isOpen) return
    if (current.game && current.game.id !== step.game_id) return

    set((state) => {
      const existingIdx = state.steps.findIndex((s) => s.id === step.module_id)
      const nextSteps = [...state.steps]
      const stepItem: BoostProgressStep = {
        id: step.module_id,
        label: step.label,
        detail: step.detail,
        metric: step.metric,
        applied: step.applied,
        percent: step.percent,
      }

      if (existingIdx >= 0) {
        nextSteps[existingIdx] = stepItem
      } else {
        nextSteps.push(stepItem)
      }

      return {
        progress: Math.max(state.progress, step.percent),
        activeStepLabel: step.label.toUpperCase(),
        steps: nextSteps,
      }
    })
  },

  onComplete: (closedApps) => {
    set((state) => ({
      progress: Math.max(state.progress, 95),
      closedApps: closedApps || [],
      phase: 'launching',
      activeStepLabel: 'SPAWNING GAME PROCESS...',
    }))
  },

  onGameLaunched: (gameId) => {
    const current = get()
    if (!current.isOpen) return
    if (current.game && current.game.id !== gameId) return

    set({
      progress: 100,
      phase: 'ready',
      activeStepLabel: 'SYSTEM OPTIMIZED • GAME RUNNING',
    })
  },

  close: () => {
    set({
      isOpen: false,
      phase: 'idle',
      progress: 0,
      steps: [],
      closedApps: [],
      game: null,
    })
  },
}))
