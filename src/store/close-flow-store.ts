import { create } from 'zustand'

interface CloseFlowState {
  /** The "are you sure?" popup. */
  isConfirmOpen: boolean
  openConfirm: () => void
  closeConfirm: () => void
  /** True once the user has confirmed — shows the closing animation and
   *  lets the real window-close call through without re-triggering the
   *  confirmation popup (see `useWindowCloseIntercept`). */
  isClosing: boolean
  beginClosing: () => void
  /** True when the user chooses to keep Nexus running in the background / system tray. */
  isBackgrounding: boolean
  runInBackground: () => void
  reset: () => void
}

export const useCloseFlowStore = create<CloseFlowState>((set) => ({
  isConfirmOpen: false,
  openConfirm: () => set({ isConfirmOpen: true, isClosing: false, isBackgrounding: false }),
  closeConfirm: () => set({ isConfirmOpen: false, isBackgrounding: false }),
  isClosing: false,
  beginClosing: () => set({ isConfirmOpen: false, isClosing: true }),
  isBackgrounding: false,
  runInBackground: () => set({ isConfirmOpen: false, isBackgrounding: true }),
  reset: () => set({ isConfirmOpen: false, isClosing: false, isBackgrounding: false }),
}))
