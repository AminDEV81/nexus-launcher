import { create } from 'zustand'

interface ScanModalState {
  isOpen: boolean
  open: () => void
  close: () => void
}

export const useScanModalStore = create<ScanModalState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}))
