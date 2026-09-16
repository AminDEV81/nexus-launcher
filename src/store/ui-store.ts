import { create } from 'zustand'

interface UiState {
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  selectedGameId: string | null
  selectGame: (id: string | null) => void
}

/**
 * Transient UI state that has no business living in the database:
 * whether the sidebar is collapsed, which game card is currently
 * selected (drives the details panel in Epic 8), etc.
 */
export const useUiStore = create<UiState>((set) => ({
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  selectedGameId: null,
  selectGame: (id) => set({ selectedGameId: id }),
}))
