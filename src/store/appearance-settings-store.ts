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

  /** `backdrop-filter: blur()` radius (px) on `.glass-panel` — the
   *  title bar, sidebar, and every modal's acrylic surface. Range
   *  0-40; 0 effectively turns the glass effect into a flat panel. */
  blurIntensity: number
  setBlurIntensity: (value: number) => void

  /** Toggle ambient background blobs in the background to save GPU fill rate. */
  ambientBackground: boolean
  setAmbientBackground: (value: boolean) => void

  /** Multiplies every interaction animation's Framer Motion `duration`
   *  (modals, sidebar collapse, page transitions, card hovers, the
   *  details panel). 0.5 = twice as snappy, 2 = noticeably more
   *  relaxed. Deliberately does NOT touch the startup splash's
   *  internal choreography — see `useAnimationSpeed`'s doc comment for
   *  why. */
  animationSpeed: number
  setAnimationSpeed: (value: number) => void

  /** Minimum card width (px) the library grid targets before wrapping
   *  to another column — same role as `CARD_MIN_WIDTH` in
   *  `game-grid.tsx`, just made adjustable. Lower = denser grid, more
   *  columns; higher = fewer, bigger cards. */
  cardMinWidth: number
  setCardMinWidth: (value: number) => void

  /** Shrinks the root font size, which (since nearly every spacing and
   *  type-size utility in this app is rem-based) proportionally
   *  tightens padding and text everywhere at once, rather than needing
   *  a parallel "compact" variant of every component. */
  compactMode: boolean
  setCompactMode: (value: boolean) => void

  /** Hard override, independent of the speed slider above and of the
   *  OS's `prefers-reduced-motion` — forces every animation in the app
   *  (including ones the speed slider doesn't touch, like the splash)
   *  to complete instantly. For low-power hardware or anyone who'd
   *  simply rather nothing move. */
  reduceMotion: boolean
  setReduceMotion: (value: boolean) => void

  /** High-efficiency GPU power saving mode: disables blurs, heavy shaders,
   *  and ambient background fills to keep GPU utilization at absolute zero (< 1%). */
  gpuEcoMode: boolean
  setGpuEcoMode: (value: boolean) => void

  /** Lock animation and UI rendering to 60 FPS to prevent high GPU usage on high-refresh monitors. */
  fpsLimit60: boolean
  setFpsLimit60: (value: boolean) => void
}

export const useAppearanceSettingsStore = create<AppearanceSettingsState>()(
  persist(
    (set) => ({
      fontFamily: 'sora',
      setFontFamily: (fontFamily) => set({ fontFamily }),

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

      gpuEcoMode: false,
      setGpuEcoMode: (gpuEcoMode) => set({ gpuEcoMode }),

      fpsLimit60: true,
      setFpsLimit60: (fpsLimit60) => set({ fpsLimit60 }),
    }),
    { name: 'nexus-appearance-settings' },
  ),
)
