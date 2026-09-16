import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { setSoundsEnabled } from '@/lib/sound-engine'

interface SoundState {
  enabled: boolean
  setEnabled: (enabled: boolean) => void
}

export const useSoundStore = create<SoundState>()(
  persist(
    (set) => ({
      enabled: true,
      setEnabled: (enabled) => {
        setSoundsEnabled(enabled)
        set({ enabled })
      },
    }),
    {
      name: 'nexus-sound',
      // Sync the sound engine's module-level flag with whatever was
      // persisted, right after zustand rehydrates it from disk — the
      // engine itself defaults to enabled, so silently doing nothing
      // here would ignore a saved "off" preference until the user
      // toggled the switch again.
      onRehydrateStorage: () => (state) => {
        if (state) setSoundsEnabled(state.enabled)
      },
    },
  ),
)
