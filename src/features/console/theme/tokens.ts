export type ConsoleThemeId = 'cyberpunk' | 'oled' | 'light'
export type ConsoleGlyphFamily = 'playstation' | 'xbox' | 'switch' | 'keyboard'
export type ConsoleGlyphOverride = 'auto' | ConsoleGlyphFamily
export type ConsoleLanguage = 'en' | 'fa'

export interface ConsoleThemeTokens {
  id: ConsoleThemeId
  name: string
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
}

export const CONSOLE_THEMES: Record<ConsoleThemeId, ConsoleThemeTokens> = {
  cyberpunk: {
    id: 'cyberpunk',
    name: 'Nexus Cyan (Default)',
    bgPrimary: '#070913',
    bgSecondary: '#0d1224',
    surface: 'rgba(17, 24, 43, 0.78)',
    surfaceElevated: 'rgba(26, 36, 64, 0.92)',
    textPrimary: '#f8fafc',
    textSecondary: '#cbd5e1',
    textMuted: '#64748b',
    border: 'rgba(148, 163, 184, 0.18)',
    defaultAccent: '#00e5ff',
    focusRing: '#00e5ff',
  },
  oled: {
    id: 'oled',
    name: 'OLED Pure Black',
    bgPrimary: '#000000',
    bgSecondary: '#050508',
    surface: 'rgba(12, 12, 18, 0.88)',
    surfaceElevated: 'rgba(22, 22, 32, 0.96)',
    textPrimary: '#ffffff',
    textSecondary: '#d4d4d8',
    textMuted: '#71717a',
    border: 'rgba(255, 255, 255, 0.16)',
    defaultAccent: '#7c5cff',
    focusRing: '#38bdf8',
  },
  light: {
    id: 'light',
    name: 'Daylight Living Room',
    bgPrimary: '#eef2f9',
    bgSecondary: '#e2e8f0',
    surface: 'rgba(255, 255, 255, 0.86)',
    surfaceElevated: 'rgba(255, 255, 255, 0.98)',
    textPrimary: '#0f172a',
    textSecondary: '#334155',
    textMuted: '#64748b',
    border: 'rgba(15, 23, 42, 0.15)',
    defaultAccent: '#4f46e5',
    focusRing: '#2563eb',
  },
}

export const CONSOLE_MOTION = {
  focusDurationSec: 0.16,
  pageDurationSec: 0.22,
  ambientCrossfadeSec: 0.3,
  easeOutExpo: [0.16, 1, 0.3, 1] as const,
}
