export type ConsoleThemeId =
  | 'cyberpunk'
  | 'ps5'
  | 'emerald'
  | 'crimson'
  | 'synthwave'
  | 'oled'
  | 'light'

export type ConsoleGlyphFamily = 'playstation' | 'xbox' | 'switch' | 'keyboard'
export type ConsoleGlyphOverride = 'auto' | ConsoleGlyphFamily
export type ConsoleLanguage = 'en' | 'fa'

export interface ConsoleThemeTokens {
  id: ConsoleThemeId
  name: string
  subtitle: string
  isLight?: boolean
  bgPrimary: string
  bgSecondary: string
  surface: string
  surfaceElevated: string
  textPrimary: string
  textSecondary: string
  textMuted: string
  border: string
  defaultAccent: string
  focusRing: string
  previewSwatches: [string, string, string]
}

export const CONSOLE_THEME_ORDER: ConsoleThemeId[] = [
  'cyberpunk',
  'ps5',
  'emerald',
  'crimson',
  'synthwave',
  'oled',
  'light',
]

export const CONSOLE_THEMES: Record<ConsoleThemeId, ConsoleThemeTokens> = {
  cyberpunk: {
    id: 'cyberpunk',
    name: 'Nexus Cyan',
    subtitle: 'Luminous Deep Navy & Electric Cyan',
    isLight: false,
    bgPrimary: '#0e1528',
    bgSecondary: '#15203b',
    surface: 'rgba(24, 35, 64, 0.78)',
    surfaceElevated: 'rgba(33, 48, 86, 0.92)',
    textPrimary: '#f8fafc',
    textSecondary: '#e2e8f0',
    textMuted: '#94a3b8',
    border: 'rgba(148, 163, 184, 0.24)',
    defaultAccent: '#00e5ff',
    focusRing: '#00e5ff',
    previewSwatches: ['#0e1528', '#00e5ff', '#7c5cff'],
  },
  ps5: {
    id: 'ps5',
    name: 'PlayStation Cobalt',
    subtitle: 'Sapphire Horizon & Astro Blue Glow',
    isLight: false,
    bgPrimary: '#0b1630',
    bgSecondary: '#13254c',
    surface: 'rgba(20, 39, 78, 0.78)',
    surfaceElevated: 'rgba(30, 56, 108, 0.92)',
    textPrimary: '#ffffff',
    textSecondary: '#dbeafe',
    textMuted: '#93c5fd',
    border: 'rgba(96, 165, 250, 0.28)',
    defaultAccent: '#3b82f6',
    focusRing: '#60a5fa',
    previewSwatches: ['#0b1630', '#3b82f6', '#ffffff'],
  },
  emerald: {
    id: 'emerald',
    name: 'Xbox Aurora Green',
    subtitle: 'Verdant Carbon & Velocity Neon Green',
    isLight: false,
    bgPrimary: '#0a1c17',
    bgSecondary: '#112e26',
    surface: 'rgba(18, 48, 40, 0.78)',
    surfaceElevated: 'rgba(24, 66, 54, 0.92)',
    textPrimary: '#f0fdf4',
    textSecondary: '#d1fae5',
    textMuted: '#6ee7b7',
    border: 'rgba(52, 211, 153, 0.26)',
    defaultAccent: '#10b981',
    focusRing: '#34d399',
    previewSwatches: ['#0a1c17', '#10b981', '#34d399'],
  },
  crimson: {
    id: 'crimson',
    name: 'Crimson Ember',
    subtitle: 'Obsidian Wine & Scarlet Valkyrie',
    isLight: false,
    bgPrimary: '#1c0c14',
    bgSecondary: '#2d1220',
    surface: 'rgba(48, 20, 34, 0.78)',
    surfaceElevated: 'rgba(68, 28, 48, 0.92)',
    textPrimary: '#fff1f2',
    textSecondary: '#ffe4e6',
    textMuted: '#fda4af',
    border: 'rgba(251, 113, 133, 0.26)',
    defaultAccent: '#f43f5e',
    focusRing: '#fb7185',
    previewSwatches: ['#1c0c14', '#f43f5e', '#fb923c'],
  },
  synthwave: {
    id: 'synthwave',
    name: 'Neon Sunset',
    subtitle: 'Outrun Violet, Laser Pink & Cyber Gold',
    isLight: false,
    bgPrimary: '#170e2c',
    bgSecondary: '#251646',
    surface: 'rgba(40, 24, 74, 0.78)',
    surfaceElevated: 'rgba(56, 33, 102, 0.92)',
    textPrimary: '#fdf4ff',
    textSecondary: '#f5d0fe',
    textMuted: '#e879f9',
    border: 'rgba(232, 121, 249, 0.28)',
    defaultAccent: '#ec4899',
    focusRing: '#22d3ee',
    previewSwatches: ['#170e2c', '#ec4899', '#22d3ee'],
  },
  oled: {
    id: 'oled',
    name: 'OLED Pure Black',
    subtitle: 'True Zero-Nit Black with High-Contrast Neon',
    isLight: false,
    bgPrimary: '#030408',
    bgSecondary: '#0a0d16',
    surface: 'rgba(16, 20, 32, 0.85)',
    surfaceElevated: 'rgba(26, 32, 50, 0.96)',
    textPrimary: '#ffffff',
    textSecondary: '#e4e4e7',
    textMuted: '#a1a1aa',
    border: 'rgba(255, 255, 255, 0.2)',
    defaultAccent: '#8b5cf6',
    focusRing: '#38bdf8',
    previewSwatches: ['#000000', '#8b5cf6', '#38bdf8'],
  },
  light: {
    id: 'light',
    name: 'Alabaster Daylight',
    subtitle: 'Crisp Pearl White, Frosted Glass & Royal Indigo',
    isLight: true,
    bgPrimary: '#f1f5f9',
    bgSecondary: '#e2e8f0',
    surface: 'rgba(255, 255, 255, 0.88)',
    surfaceElevated: 'rgba(255, 255, 255, 0.98)',
    textPrimary: '#0f172a',
    textSecondary: '#334155',
    textMuted: '#64748b',
    border: 'rgba(15, 23, 42, 0.14)',
    defaultAccent: '#4f46e5',
    focusRing: '#0284c7',
    previewSwatches: ['#f8fafc', '#4f46e5', '#0284c7'],
  },
}

export const CONSOLE_MOTION = {
  focusDurationSec: 0.16,
  pageDurationSec: 0.22,
  ambientCrossfadeSec: 0.3,
  easeOutExpo: [0.16, 1, 0.3, 1] as const,
}
