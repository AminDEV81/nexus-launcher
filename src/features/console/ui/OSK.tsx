import React, { useState } from 'react'
import { useConsoleStore } from '../store/console-store'
import { FocusScope, useFocusable } from '../nav/FocusScope'
import { Glyph } from './Glyph'

const EN_ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', '-'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm', '.', '_', '/'],
]

const FA_ROWS = [
  ['۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹', '۰'],
  ['ض', 'ص', 'ث', 'ق', 'ف', 'غ', 'ع', 'ه', 'خ', 'ح'],
  ['ش', 'س', 'ی', 'ب', 'ل', 'ا', 'ت', 'ن', 'م', 'ک'],
  ['ظ', 'ط', 'ز', 'ر', 'ذ', 'د', 'پ', 'و', 'گ', 'چ'],
]

const SYM_ROWS = [
  ['!', '@', '#', '$', '%', '^', '&', '*', '(', ')'],
  ['+', '=', '[', ']', '{', '}', ':', ';', '"', "'"],
  ['<', '>', '?', '/', '\\', '|', '~', '`', ',', '.'],
]

const KeyButton: React.FC<{
  id: string
  label: string
  wide?: boolean
  accent?: boolean
  onPress: () => void
}> = ({ id, label, wide, accent, onPress }) => {
  const { focusProps, isFocused } = useFocusable<HTMLButtonElement>({
    id,
    onConfirm: onPress,
  })
  return (
    <button
      type="button"
      {...focusProps}
      className={`flex h-14 items-center justify-center rounded-xl border text-lg font-bold transition-transform duration-150 ${
        wide ? 'px-6 min-w-[120px]' : 'w-14'
      } ${
        isFocused
          ? 'scale-110 border-cyan-300 bg-cyan-500/30 text-white shadow-[0_0_20px_rgba(0,229,255,0.45)]'
          : accent
            ? 'border-cyan-500/40 bg-cyan-500/15 text-cyan-200'
            : 'border-white/15 bg-slate-900/85 text-slate-200'
      }`}
    >
      {label}
    </button>
  )
}

export const ConsoleOSK: React.FC = () => {
  const osk = useConsoleStore((s) => s.osk)
  const closeOsk = useConsoleStore((s) => s.closeOsk)
  const [value, setValue] = useState(osk.initialValue)
  const [layout, setLayout] = useState<'en' | 'fa' | 'sym'>('en')
  const [shifted, setShifted] = useState(false)

  React.useEffect(() => {
    setValue(osk.initialValue)
  }, [osk.initialValue, osk.open])

  if (!osk.open) return null

  const rows = layout === 'en' ? EN_ROWS : layout === 'fa' ? FA_ROWS : SYM_ROWS

  const handleSubmit = () => {
    osk.onSubmit?.(value)
    closeOsk()
  }

  return (
    <div className="fixed inset-0 z-[260] flex items-center justify-center bg-black/80 backdrop-blur-md p-6">
      <FocusScope
        id="console-osk"
        trapFocus
        className="w-full max-w-4xl rounded-3xl border border-cyan-400/30 bg-slate-950/95 p-8 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-2xl font-extrabold text-white">
            {osk.title || 'On-Screen Keyboard'}
          </h3>
          <span className="rounded-full border border-cyan-400/40 bg-cyan-500/15 px-3 py-1 text-xs font-bold uppercase text-cyan-300">
            {layout === 'en' ? 'English (QWERTY)' : layout === 'fa' ? 'فارسی (Persian)' : 'Symbols'}
          </span>
        </div>

        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit()
            if (e.key === 'Escape') closeOsk()
          }}
          dir={layout === 'fa' ? 'rtl' : 'ltr'}
          placeholder="Type with controller or physical keyboard..."
          className="mb-6 w-full rounded-2xl border-2 border-cyan-400/50 bg-slate-900 px-5 py-4 text-2xl font-bold text-white outline-none"
        />

        <div className="flex flex-col items-center gap-3">
          {rows.map((row, rIdx) => (
            <div key={rIdx} className="flex flex-wrap justify-center gap-2.5">
              {row.map((ch, cIdx) => {
                const rendered = shifted && layout === 'en' ? ch.toUpperCase() : ch
                return (
                  <KeyButton
                    key={`${rIdx}_${cIdx}`}
                    id={`osk_key_${rIdx}_${cIdx}`}
                    label={rendered}
                    onPress={() => setValue((v) => v + rendered)}
                  />
                )
              })}
            </div>
          ))}

          <div className="mt-3 flex flex-wrap justify-center gap-3">
            <KeyButton
              id="osk_layout"
              label={layout === 'en' ? '🌐 فارسی' : layout === 'fa' ? '🌐 #!=' : '🌐 EN'}
              wide
              onPress={() =>
                setLayout((l) => (l === 'en' ? 'fa' : l === 'fa' ? 'sym' : 'en'))
              }
            />
            <KeyButton
              id="osk_shift"
              label={shifted ? '⇧ SHIFT ON' : '⇧ Shift'}
              wide
              onPress={() => setShifted((s) => !s)}
            />
            <KeyButton
              id="osk_space"
              label="␣ Space"
              wide
              onPress={() => setValue((v) => `${v} `)}
            />
            <KeyButton
              id="osk_backspace"
              label="⌫ Backspace"
              wide
              onPress={() => setValue((v) => v.slice(0, -1))}
            />
            <KeyButton
              id="osk_clear"
              label="Clear"
              wide
              onPress={() => setValue('')}
            />
            <KeyButton
              id="osk_done"
              label="✓ Done"
              wide
              accent
              onPress={handleSubmit}
            />
            <KeyButton
              id="osk_cancel"
              label="✕ Cancel"
              wide
              onPress={closeOsk}
            />
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-6 border-t border-white/10 pt-4 text-sm text-slate-400">
          <Glyph button="confirm" label="Type Key" />
          <Glyph button="secondary" label="Backspace" />
          <Glyph button="tertiary" label="Space" />
          <Glyph button="lt" label="Switch Language (EN/FA)" />
          <Glyph button="back" label="Close" />
        </div>
      </FocusScope>
    </div>
  )
}
