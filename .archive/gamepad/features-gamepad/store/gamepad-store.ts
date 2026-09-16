import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { GamepadInfo, GamepadSettings } from '../types/gamepad'
import { DEFAULT_GAMEPAD_SETTINGS } from '../constants/standard-mappings'

interface GamepadStoreState {
  // Persistent user preferences
  settings: GamepadSettings
  updateSettings: (partial: Partial<GamepadSettings>) => void
  resetSettings: () => void

  // Ephemeral runtime state (in-memory only, NOT serialized to storage)
  controllers: GamepadInfo[]
  primaryControllerId: string | null
  lastActiveControllerId: string | null

  // Internal actions used by GamepadManager
  setControllers: (controllers: GamepadInfo[]) => void
  setPrimaryControllerId: (id: string | null) => void
  setLastActiveControllerId: (id: string | null) => void
}

const memoryFallback = new Map<string, string>()
const safeStorage = {
  getItem: (key: string) => {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key)
    }
    return memoryFallback.get(key) ?? null
  },
  setItem: (key: string, value: string) => {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value)
    } else {
      memoryFallback.set(key, value)
    }
  },
  removeItem: (key: string) => {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(key)
    } else {
      memoryFallback.delete(key)
    }
  },
}

export const useGamepadStore = create<GamepadStoreState>()(
  persist(
    (set) => ({
      settings: { ...DEFAULT_GAMEPAD_SETTINGS },
      updateSettings: (partial) =>
        set((state) => ({
          settings: { ...state.settings, ...partial },
        })),
      resetSettings: () =>
        set(() => ({
          settings: { ...DEFAULT_GAMEPAD_SETTINGS },
        })),

      controllers: [],
      primaryControllerId: null,
      lastActiveControllerId: null,

      setControllers: (controllers) => set({ controllers }),
      setPrimaryControllerId: (id) => set({ primaryControllerId: id }),
      setLastActiveControllerId: (id) => set({ lastActiveControllerId: id }),
    }),
    {
      name: 'nexus-gamepad-settings',
      storage: createJSONStorage(() => safeStorage),
      // ONLY serialize the settings object, keeping high-frequency & runtime state in memory
      partialize: (state) => ({ settings: state.settings }),
    },
  ),
)
