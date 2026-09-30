import React, { useEffect, useState } from 'react'
import { Keyboard } from 'lucide-react'
import type { HotkeyStatus } from '../types/overlay'

const CODE_NAMES: Record<string, string> = {
  Space: 'Space',
  Tab: 'Tab',
  Insert: 'Insert',
  Delete: 'Delete',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  ArrowLeft: 'Left',
  ArrowUp: 'Up',
  ArrowRight: 'Right',
  ArrowDown: 'Down',
}

/** Maps a keyboard event to the backend's `Ctrl+Shift+O` format, or `null` if it is only a modifier. */
function comboFromEvent(e: KeyboardEvent): { combo: string | null; hint?: string } {
  const code = e.code
  let key: string | null = null
  if (/^Key[A-Z]$/.test(code)) key = code.slice(3)
  else if (/^Digit[0-9]$/.test(code)) key = code.slice(5)
  else if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) key = code
  else if (CODE_NAMES[code]) key = CODE_NAMES[code]

  if (!key) return { combo: null }

  const isFunctionKey = key.startsWith('F') && key.length > 1
  if (!e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && !isFunctionKey) {
    return { combo: null, hint: 'Add Ctrl, Shift or Alt' }
  }

  const parts: string[] = []
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.shiftKey) parts.push('Shift')
  if (e.altKey) parts.push('Alt')
  if (e.metaKey) parts.push('Win')
  parts.push(key)
  return { combo: parts.join('+') }
}

interface HotkeyFieldProps {
  value: string
  status: HotkeyStatus | null
  onChange: (hotkey: string) => void
}

export const HotkeyField: React.FC<HotkeyFieldProps> = ({ value, status, onChange }) => {
  const [capturing, setCapturing] = useState(false)
  const [hint, setHint] = useState<string | null>(null)

  useEffect(() => {
    if (!capturing) return
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        setCapturing(false)
        setHint(null)
        return
      }
      const { combo, hint: nextHint } = comboFromEvent(e)
      setHint(nextHint ?? null)
      if (combo) {
        onChange(combo)
        setCapturing(false)
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [capturing, onChange])

  const failed = status && !status.registered && status.error

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-xs text-muted">
        <span className="flex items-center gap-1">
          <Keyboard className="h-3.5 w-3.5" /> Toggle Hotkey
        </span>
        <button
          type="button"
          onClick={() => {
            setHint(null)
            setCapturing((c) => !c)
          }}
          className={`rounded border px-2 py-0.5 font-mono text-[11px] font-semibold transition-colors ${
            capturing
              ? 'animate-pulse border-cyan-500 bg-cyan-500/15 text-cyan-500'
              : 'border-border bg-surface-raised text-cyan-600 hover:border-cyan-500/60 dark:text-cyan-300'
          }`}
        >
          {capturing ? 'Press keys… (Esc to cancel)' : value}
        </button>
      </div>
      {hint && <p className="text-[10px] text-amber-500">{hint}</p>}
      {failed && !capturing && (
        <p className="text-[10px] text-red-500">{status.error} — pick another combination.</p>
      )}
    </div>
  )
}
