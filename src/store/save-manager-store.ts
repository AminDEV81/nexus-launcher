import { create } from 'zustand'
import type { GameSaveDetails, SaveSnapshot } from '@/types/models'
import * as saveService from '@/services/save-manager'

interface SaveManagerState {
  saveDetailsByGame: Record<string, GameSaveDetails>
  snapshotsByGame: Record<string, SaveSnapshot[]>
  historyModalGameId: string | null
  isHistoryModalOpen: boolean

  // Actions
  loadGameSaveDetails: (gameId: string, profileId?: string) => Promise<GameSaveDetails>
  loadSnapshots: (gameId: string, profileId?: string) => Promise<SaveSnapshot[]>
  openHistoryModal: (gameId: string) => void
  closeHistoryModal: () => void
  restoreSnapshot: (gameId: string, snapshotId: string, profileId?: string) => Promise<void>
  deleteSnapshot: (gameId: string, snapshotId: string, profileId?: string) => Promise<void>
}

export const useSaveManagerStore = create<SaveManagerState>((set, get) => ({
  saveDetailsByGame: {},
  snapshotsByGame: {},
  historyModalGameId: null,
  isHistoryModalOpen: false,

  loadGameSaveDetails: async (gameId: string, profileId?: string) => {
    const details = await saveService.getGameSaveDetails(gameId, profileId)
    set((s) => ({
      saveDetailsByGame: {
        ...s.saveDetailsByGame,
        [gameId]: details,
      },
    }))
    return details
  },

  loadSnapshots: async (gameId: string, profileId?: string) => {
    const snapshots = await saveService.listSaveSnapshots(gameId, profileId)
    set((s) => ({
      snapshotsByGame: {
        ...s.snapshotsByGame,
        [gameId]: snapshots,
      },
    }))
    return snapshots
  },

  openHistoryModal: (gameId: string) => {
    set({ historyModalGameId: gameId, isHistoryModalOpen: true })
    void get().loadSnapshots(gameId)
  },

  closeHistoryModal: () => {
    set({ historyModalGameId: null, isHistoryModalOpen: false })
  },

  restoreSnapshot: async (gameId: string, snapshotId: string, profileId?: string) => {
    await saveService.restoreSaveSnapshot(gameId, snapshotId, profileId)
    await get().loadGameSaveDetails(gameId, profileId)
    await get().loadSnapshots(gameId, profileId)
  },

  deleteSnapshot: async (gameId: string, snapshotId: string, profileId?: string) => {
    await saveService.deleteSaveSnapshot(gameId, snapshotId, profileId)
    await get().loadSnapshots(gameId, profileId)
  },
}))
