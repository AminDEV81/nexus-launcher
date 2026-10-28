import React from 'react'
import { useConsoleStore } from '../store/console-store'
import type { ConsoleGlyphFamily } from '../theme/tokens'

export type GlyphButton =
  | 'confirm'
  | 'back'
  | 'secondary'
  | 'tertiary'
  | 'options'
  | 'lb'
  | 'rb'
  | 'lt'
  | 'rt'
  | 'guide'

interface GlyphProps {
  button: GlyphButton
  family?: ConsoleGlyphFamily
  label?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export const Glyph: React.FC<GlyphProps> = ({
  button,
  family,
  label,
  size = 'md',
  className = '',
}) => {
  const effectiveFamily = useConsoleStore((s) =>
    family ? family : s.glyphOverride === 'auto' ? s.detectedGlyphFamily : s.glyphOverride,
  )
  const confirmSwap = useConsoleStore((s) => s.confirmSwap)

  const resolvedButton: GlyphButton =
    confirmSwap && (button === 'confirm' || button === 'back')
      ? button === 'confirm'
        ? 'back'
        : 'confirm'
      : button

  const dim = size === 'sm' ? 22 : size === 'lg' ? 32 : 26

  const renderBadge = () => {
    if (effectiveFamily === 'keyboard') {
      const keyMap: Record<GlyphButton, string> = {
        confirm: 'Enter',
        back: 'Esc',
        secondary: 'X',
        tertiary: 'Y',
        options: 'Tab',
        lb: 'Q',
        rb: 'E',
        lt: 'PgUp',
        rt: 'PgDn',
        guide: 'Home',
      }
      return (
        <span className="inline-flex items-center justify-center rounded-md border border-white/30 bg-white/10 px-2 py-0.5 font-mono text-xs font-bold text-white shadow-inner">
          {keyMap[resolvedButton]}
        </span>
      )
    }

    if (effectiveFamily === 'playstation') {
      if (resolvedButton === 'confirm') {
        // Cross (Blue)
        return (
          <svg width={dim} height={dim} viewBox="0 0 28 28" className="shrink-0">
            <circle cx="14" cy="14" r="12" fill="#1e293b" stroke="#60a5fa" strokeWidth="2" />
            <path d="M9.5 9.5L18.5 18.5M18.5 9.5L9.5 18.5" stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        )
      }
      if (resolvedButton === 'back') {
        // Circle (Coral Red)
        return (
          <svg width={dim} height={dim} viewBox="0 0 28 28" className="shrink-0">
            <circle cx="14" cy="14" r="12" fill="#1e293b" stroke="#f87171" strokeWidth="2" />
            <circle cx="14" cy="14" r="5.5" fill="none" stroke="#f87171" strokeWidth="2.4" />
          </svg>
        )
      }
      if (resolvedButton === 'secondary') {
        // Square (Violet-Pink)
        return (
          <svg width={dim} height={dim} viewBox="0 0 28 28" className="shrink-0">
            <circle cx="14" cy="14" r="12" fill="#1e293b" stroke="#e879f9" strokeWidth="2" />
            <rect x="9" y="9" width="10" height="10" rx="1.5" fill="none" stroke="#e879f9" strokeWidth="2.3" />
          </svg>
        )
      }
      if (resolvedButton === 'tertiary') {
        // Triangle (Teal-Emerald)
        return (
          <svg width={dim} height={dim} viewBox="0 0 28 28" className="shrink-0">
            <circle cx="14" cy="14" r="12" fill="#1e293b" stroke="#34d399" strokeWidth="2" />
            <path d="M14 8.2L19.6 18H8.4L14 8.2Z" fill="none" stroke="#34d399" strokeWidth="2.2" strokeLinejoin="round" />
          </svg>
        )
      }
      const pillMap: Record<string, string> = {
        lb: 'L1',
        rb: 'R1',
        lt: 'L2',
        rt: 'R2',
        options: 'OPT',
        guide: 'PS',
      }
      return (
        <span className="inline-flex min-w-[30px] items-center justify-center rounded-md border border-sky-400/50 bg-slate-900/90 px-2 py-0.5 font-mono text-xs font-extrabold text-sky-300">
          {pillMap[resolvedButton] || 'PS'}
        </span>
      )
    }

    // Xbox & Switch lettered glyphs
    const isSwitch = effectiveFamily === 'switch'
    const letterMap: Record<GlyphButton, { text: string; color: string }> = {
      confirm: { text: isSwitch ? 'B' : 'A', color: '#22c55e' },
      back: { text: isSwitch ? 'A' : 'B', color: '#ef4444' },
      secondary: { text: isSwitch ? 'Y' : 'X', color: '#3b82f6' },
      tertiary: { text: isSwitch ? 'X' : 'Y', color: '#eab308' },
      options: { text: 'MENU', color: '#94a3b8' },
      lb: { text: isSwitch ? 'L' : 'LB', color: '#cbd5e1' },
      rb: { text: isSwitch ? 'R' : 'RB', color: '#cbd5e1' },
      lt: { text: isSwitch ? 'ZL' : 'LT', color: '#cbd5e1' },
      rt: { text: isSwitch ? 'ZR' : 'RT', color: '#cbd5e1' },
      guide: { text: 'GUIDE', color: '#38bdf8' },
    }
    const info = letterMap[resolvedButton]
    if (info.text.length === 1) {
      return (
        <svg width={dim} height={dim} viewBox="0 0 28 28" className="shrink-0">
          <circle cx="14" cy="14" r="12" fill="#18181b" stroke={info.color} strokeWidth="2.2" />
          <text
            x="14"
            y="18.5"
            textAnchor="middle"
            fill={info.color}
            fontSize="13"
            fontWeight="800"
            fontFamily="system-ui, sans-serif"
          >
            {info.text}
          </text>
        </svg>
      )
    }
    return (
      <span className="inline-flex min-w-[30px] items-center justify-center rounded-md border border-white/30 bg-zinc-900 px-2 py-0.5 font-mono text-xs font-extrabold text-zinc-200">
        {info.text}
      </span>
    )
  }

  return (
    <span className={`inline-flex items-center gap-2 select-none ${className}`}>
      {renderBadge()}
      {label && <span className="text-sm font-semibold tracking-wide text-slate-200">{label}</span>}
    </span>
  )
}
