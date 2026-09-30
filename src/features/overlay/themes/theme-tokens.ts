import type { ThemeDefinition } from '../types/overlay'

export interface ThemeVisualTokens {
  fontFamily: string
  bgStyle: string
  borderStyle: string
  accentColor: string
  primaryTextColor: string
  secondaryTextColor: string
  warningColor: string
  dangerColor: string
  graphLineColor: string
  graphFillColor: string
  badgeStyle?: string
  glowFilter?: string
  cornerStyle?: 'rounded' | 'sharp' | 'chamfered' | 'pill'
  /** Subtle CRT scanline texture over the panel. */
  scanlines?: boolean
}

export interface FullThemeConfig {
  definition: ThemeDefinition
  tokens: ThemeVisualTokens
}
