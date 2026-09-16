import React from 'react'
import type { GamepadType, StandardGamepadButtons } from '../types/gamepad'
import { cn } from '@/lib/utils'

export type LogicalButton = keyof StandardGamepadButtons | 'l2' | 'r2'

interface ControllerGlyphProps {
  button: LogicalButton
  controllerType?: GamepadType | 'playstation'
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

interface ButtonGlyphDefinition {
  label: string
  sub?: string
  colorClass?: string
}

const XBOX_GLYPHS: Record<LogicalButton, ButtonGlyphDefinition> = {
  south: { label: 'A', colorClass: 'text-emerald-400 border-emerald-500/40 bg-emerald-950/40' },
  east: { label: 'B', colorClass: 'text-rose-400 border-rose-500/40 bg-rose-950/40' },
  west: { label: 'X', colorClass: 'text-sky-400 border-sky-500/40 bg-sky-950/40' },
  north: { label: 'Y', colorClass: 'text-amber-400 border-amber-500/40 bg-amber-950/40' },
  l1: { label: 'LB' },
  r1: { label: 'RB' },
  l2: { label: 'LT' },
  r2: { label: 'RT' },
  l3: { label: 'LS' },
  r3: { label: 'RS' },
  select: { label: 'View' },
  start: { label: 'Menu' },
  dpadUp: { label: '▲' },
  dpadDown: { label: '▼' },
  dpadLeft: { label: '◀' },
  dpadRight: { label: '▶' },
  home: { label: 'Xbox' },
  touchpad: { label: 'Touch' },
}

const PLAYSTATION_GLYPHS: Record<LogicalButton, ButtonGlyphDefinition> = {
  south: { label: '✕', colorClass: 'text-sky-400 border-sky-500/40 bg-sky-950/40' },
  east: { label: '○', colorClass: 'text-rose-400 border-rose-500/40 bg-rose-950/40' },
  west: { label: '□', colorClass: 'text-pink-400 border-pink-500/40 bg-pink-950/40' },
  north: { label: '△', colorClass: 'text-emerald-400 border-emerald-500/40 bg-emerald-950/40' },
  l1: { label: 'L1' },
  r1: { label: 'R1' },
  l2: { label: 'L2' },
  r2: { label: 'R2' },
  l3: { label: 'L3' },
  r3: { label: 'R3' },
  select: { label: 'Share' },
  start: { label: 'Options' },
  dpadUp: { label: '▲' },
  dpadDown: { label: '▼' },
  dpadLeft: { label: '◀' },
  dpadRight: { label: '▶' },
  home: { label: 'PS' },
  touchpad: { label: 'Touch' },
}

const GENERIC_GLYPHS: Record<LogicalButton, ButtonGlyphDefinition> = {
  south: { label: '1' },
  east: { label: '2' },
  west: { label: '3' },
  north: { label: '4' },
  l1: { label: 'L1' },
  r1: { label: 'R1' },
  l2: { label: 'L2' },
  r2: { label: 'R2' },
  l3: { label: 'L3' },
  r3: { label: 'R3' },
  select: { label: 'Select' },
  start: { label: 'Start' },
  dpadUp: { label: '▲' },
  dpadDown: { label: '▼' },
  dpadLeft: { label: '◀' },
  dpadRight: { label: '▶' },
  home: { label: 'Home' },
  touchpad: { label: 'Touch' },
}

export function ControllerGlyph({
  button,
  controllerType = 'xbox',
  className,
  size = 'md',
}: ControllerGlyphProps): React.JSX.Element {
  const isPlayStation =
    controllerType === 'playstation' ||
    controllerType === 'dualsense' ||
    controllerType === 'dualshock4'

  const glyphMap = isPlayStation
    ? PLAYSTATION_GLYPHS
    : controllerType === 'xbox'
      ? XBOX_GLYPHS
      : GENERIC_GLYPHS

  const def = glyphMap[button] ?? { label: '?' }

  const sizeClasses = {
    sm: 'h-5 min-w-5 px-1 text-[10px]',
    md: 'h-6 min-w-6 px-1.5 text-xs',
    lg: 'h-8 min-w-8 px-2 text-sm',
  }[size]

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center font-bold font-mono rounded-md border shadow-xs transition-colors select-none',
        def.colorClass ?? 'border-border bg-surface-raised text-text',
        sizeClasses,
        className,
      )}
      title={`${controllerType} ${button}`}
    >
      {def.label}
    </span>
  )
}
