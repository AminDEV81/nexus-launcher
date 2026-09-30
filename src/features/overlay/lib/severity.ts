import type { ThemeVisualTokens } from '../themes/theme-tokens'

export type Severity = 'ok' | 'warn' | 'danger'
export type TempKind = 'gpu' | 'hotspot' | 'memory' | 'cpu'

/** [warn, danger] thresholds in °C per sensor type. */
const TEMP_LIMITS: Record<TempKind, [number, number]> = {
  gpu: [80, 90],
  hotspot: [90, 105],
  memory: [90, 100],
  cpu: [80, 92],
}

const WARN_COLOR = '#fbbf24'

export function tempSeverity(value: number | null | undefined, kind: TempKind): Severity {
  if (value == null) return 'ok'
  const [warn, danger] = TEMP_LIMITS[kind]
  if (value >= danger) return 'danger'
  if (value >= warn) return 'warn'
  return 'ok'
}

export function loadSeverity(percent: number | null | undefined): Severity {
  if (percent == null) return 'ok'
  if (percent >= 95) return 'danger'
  if (percent >= 85) return 'warn'
  return 'ok'
}

/** Inline colour override for warn/danger; `undefined` keeps the theme colour. */
export function severityColor(severity: Severity, tokens: ThemeVisualTokens): string | undefined {
  if (severity === 'danger') return tokens.dangerColor
  if (severity === 'warn') return WARN_COLOR
  return undefined
}

export function formatBytesGb(bytes: number | null | undefined, digits = 1): string {
  if (bytes == null) return '--'
  return (bytes / 1_073_741_824).toFixed(digits)
}
