import { create } from 'zustand'

export interface DownloadPrefill {
  gameId?: string
  igdbId?: number | null
  name: string
  coverUrl: string | null
}

interface StartDownloadModalState {
  isOpen: boolean
  /** Set when opened for a specific game (uninstalled card / details
   *  panel) — the modal skips straight to the URL step. */
  prefill: DownloadPrefill | null
  open: (prefill?: DownloadPrefill) => void
  close: () => void
}

export const useStartDownloadModalStore = create<StartDownloadModalState>((set) => ({
  isOpen: false,
  prefill: null,
  open: (prefill) => set({ isOpen: true, prefill: prefill ?? null }),
  close: () => set({ isOpen: false, prefill: null }),
}))
