import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemeMode = 'dark' | 'light'
export type PaletteId =
  | 'violet'
  | 'ocean'
  | 'emerald'
  | 'crimson'
  | 'amber'
  | 'cyberpunk'
  | 'solaris'
  | 'toxic'
  | 'aquamarine'
  | 'amethyst'
  | 'inferno'

export const PALETTES: { id: PaletteId; label: string }[] = [
  { id: 'violet', label: 'Violet' },
  { id: 'ocean', label: 'Ocean' },
  { id: 'emerald', label: 'Emerald' },
  { id: 'crimson', label: 'Crimson' },
  { id: 'amber', label: 'Amber' },
  { id: 'cyberpunk', label: 'Cyberpunk' },
  { id: 'solaris', label: 'Solaris' },
  { id: 'toxic', label: 'Toxic' },
  { id: 'aquamarine', label: 'Aquamarine' },
  { id: 'amethyst', label: 'Amethyst' },
  { id: 'inferno', label: 'Inferno' },
]

interface ThemeState {
  mode: ThemeMode
  setMode: (mode: ThemeMode) => void
  toggleMode: () => void

  /** Dark and light each remember their own palette choice
   *  independently — picking Emerald in dark mode doesn't touch
   *  whatever palette light mode is set to, and vice versa. */
  darkPalette: PaletteId
  lightPalette: PaletteId
  /** Sets the palette for whichever mode is currently active. */
  setPalette: (palette: PaletteId) => void
}

/**
 * `mode` drives the `data-theme` attribute on <html>, and the active
 * mode's palette drives `data-palette` (see `App.tsx`) — together they
 * select which CSS variable block in `styles/theme.css` applies.
 * Surface/border/text tokens stay identical across all 5 palettes;
 * only the accent color changes, so switching palettes never looks
 * like a different app, just a different accent.
 */
export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      mode: 'dark',
      setMode: (mode) => set({ mode }),
      toggleMode: () => set({ mode: get().mode === 'dark' ? 'light' : 'dark' }),

      darkPalette: 'violet',
      lightPalette: 'violet',
      setPalette: (palette) =>
        set((state) =>
          state.mode === 'dark' ? { darkPalette: palette } : { lightPalette: palette },
        ),
    }),
    { name: 'nexus-theme' },
  ),
)

/** Convenience selector for "whichever palette is active right now". */
export function useActivePalette(): PaletteId {
  return useThemeStore((s) => (s.mode === 'dark' ? s.darkPalette : s.lightPalette))
}
