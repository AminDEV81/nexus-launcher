import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const BLUR_DEFAULT = 12
const CARD_WIDTH_DEFAULT = 220

export type FontFamilyId =
  | 'sora'
  | 'rajdhani'
  | 'orbitron'
  | 'chakra'
  | 'jakarta'
  | 'jetbrains'
  | 'outfit'
  | 'russo'
  | 'audiowide'
  | 'teko'

export type FontWeightPreset = 'light' | 'regular' | 'bold' | 'extrabold'

export const AVAILABLE_FONT_WEIGHTS: {
  id: FontWeightPreset
  label: string
  shortLabel: string
  numericLabel: string
  description: string
}[] = [
  {
    id: 'light',
    label: 'Light',
    shortLabel: 'Light (300)',
    numericLabel: '300',
    description: 'Sleek, airy strokes for a minimalist precision look.',
  },
  {
    id: 'regular',
    label: 'Regular',
    shortLabel: 'Regular (400)',
    numericLabel: '400',
    description: 'Balanced default weight for everyday readability.',
  },
  {
    id: 'bold',
    label: 'Bold',
    shortLabel: 'Bold (600)',
    numericLabel: '600',
    description: 'Crisp, high-contrast gaming UI emphasis.',
  },
  {
    id: 'extrabold',
    label: 'Extra Bold',
    shortLabel: 'Extra Bold (800)',
    numericLabel: '800',
    description: 'Maximum visual impact across titles, badges & menus.',
  },
]

export const AVAILABLE_FONTS: {
  id: FontFamilyId
  name: string
  category: string
  description: string
}[] = [
  {
    id: 'sora',
    name: 'Sora',
    category: 'Default Modern',
    description: 'Crisp geometric typography with balanced proportions.',
  },
  {
    id: 'rajdhani',
    name: 'Rajdhani',
    category: 'Cyber Gaming',
    description: 'Squared, tactical HUD style with intense gamer character.',
  },
  {
    id: 'orbitron',
    name: 'Orbitron',
    category: 'Sci-Fi Space',
    description: 'Futuristic wide lettering inspired by spacecraft displays.',
  },
  {
    id: 'chakra',
    name: 'Chakra Petch',
    category: 'Mecha Esports',
    description: 'Sharp angular cuts perfect for modern action gaming.',
  },
  {
    id: 'jakarta',
    name: 'Plus Jakarta Sans',
    category: 'Clean Minimalist',
    description: 'Ultra-refined contemporary UI font with supreme readability.',
  },
  {
    id: 'jetbrains',
    name: 'JetBrains Mono',
    category: 'High-Tech Code',
    description: 'Developer terminal monospaced aesthetic.',
  },
  {
    id: 'outfit',
    name: 'Outfit',
    category: 'Bold Display',
    description: 'Punchy, confident headers for high-impact storefronts.',
  },
  {
    id: 'russo',
    name: 'Russo One',
    category: 'Heavy Armor',
    description: 'Thick, bold military gaming font with raw impact.',
  },
  {
    id: 'audiowide',
    name: 'Audiowide',
    category: 'Cyber Synthwave',
    description: 'Techno-futuristic typeface with distinctive synthwave curves.',
  },
  {
    id: 'teko',
    name: 'Teko',
    category: 'Esports Broadcast',
    description: 'Tall, condensed competitive gaming and tournament style.',
  },
]

interface AppearanceSettingsState {
  /** Selected UI font family. */
  fontFamily: FontFamilyId
  setFontFamily: (font: FontFamilyId) => void

  /** 4-level UI font boldness preset (`light`, `regular`, `bold`, `extrabold`). */
  fontWeight: FontWeightPreset
  setFontWeight: (weight: FontWeightPreset) => void

  /** `backdrop-filter: blur()` radius (px) on `.glass-panel` — the
   *  title bar, sidebar, and every modal's acrylic surface. Range
   *  0-40; 0 effectively turns the glass effect into a flat panel. */
  blurIntensity: number
  setBlurIntensity: (value: number) => void

  /** Toggle ambient background blobs in the background to save GPU fill rate. */
  ambientBackground: boolean
  setAmbientBackground: (value: boolean) => void

  /** Multiplies every interaction animation's Framer Motion `duration`. */
  animationSpeed: number
  setAnimationSpeed: (value: number) => void

  /** Minimum card width (px) the library grid targets before wrapping. */
  cardMinWidth: number
  setCardMinWidth: (value: number) => void

  /** Shrinks the root font size proportionally. */
  compactMode: boolean
  setCompactMode: (value: boolean) => void

  /** Hard override that forces every animation to complete instantly. */
  reduceMotion: boolean
  setReduceMotion: (value: boolean) => void

  /** High-efficiency GPU power saving mode. */
  gpuEcoMode: boolean
  setGpuEcoMode: (value: boolean) => void

  /** Lock animation and UI rendering to 60 FPS. */
  fpsLimit60: boolean
  setFpsLimit60: (value: boolean) => void
}

export const useAppearanceSettingsStore = create<AppearanceSettingsState>()(
  persist(
    (set) => ({
      fontFamily: 'sora',
      setFontFamily: (fontFamily) => set({ fontFamily }),

      fontWeight: 'regular',
      setFontWeight: (fontWeight) => set({ fontWeight }),

      blurIntensity: BLUR_DEFAULT,
      setBlurIntensity: (blurIntensity) => set({ blurIntensity }),

      ambientBackground: true,
      setAmbientBackground: (ambientBackground) => set({ ambientBackground }),

      animationSpeed: 1,
      setAnimationSpeed: (animationSpeed) => set({ animationSpeed }),

      cardMinWidth: CARD_WIDTH_DEFAULT,
      setCardMinWidth: (cardMinWidth) => set({ cardMinWidth }),

      compactMode: false,
      setCompactMode: (compactMode) => set({ compactMode }),

      reduceMotion: false,
      setReduceMotion: (reduceMotion) => set({ reduceMotion }),

      gpuEcoMode:
        typeof navigator !== 'undefined' &&
        ((typeof navigator.hardwareConcurrency === 'number' &&
          navigator.hardwareConcurrency > 0 &&
          navigator.hardwareConcurrency <= 4) ||
          (typeof (navigator as { deviceMemory?: number }).deviceMemory === 'number' &&
            ((navigator as { deviceMemory?: number }).deviceMemory ?? 8) <= 4)),
      setGpuEcoMode: (gpuEcoMode) => set({ gpuEcoMode }),

      fpsLimit60: true,
      setFpsLimit60: (fpsLimit60) => set({ fpsLimit60 }),
    }),
    { name: 'nexus-appearance-settings' },
  ),
)
