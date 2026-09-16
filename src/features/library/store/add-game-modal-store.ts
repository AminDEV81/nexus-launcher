import { create } from 'zustand'

export type DroppedPathKind = 'executable' | 'shortcut' | 'folder'

export interface DroppedPathPrefill {
  kind: DroppedPathKind
  path: string
}

interface AddGameModalState {
  isOpen: boolean
  /** Set when the modal was opened via drag & drop, so it can jump
   *  straight to the review step instead of the "choose a method" step. */
  prefill: DroppedPathPrefill | null
  open: (prefill?: DroppedPathPrefill) => void
  close: () => void
}

export const useAddGameModalStore = create<AddGameModalState>((set) => ({
  isOpen: false,
  prefill: null,
  open: (prefill) => set({ isOpen: true, prefill: prefill ?? null }),
  close: () => set({ isOpen: false, prefill: null }),
}))
