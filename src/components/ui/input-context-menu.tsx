import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  CheckSquare,
  ClipboardPaste,
  Copy,
  CornerDownLeft,
  Scissors,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface MenuState {
  x: number
  y: number
  target: HTMLInputElement | HTMLTextAreaElement
  hasSelection: boolean
  hasValue: boolean
}

/**
 * Sets the value of a controlled React `<input>` or `<textarea>` via the native
 * prototype value setter and dispatches a bubbling `input` event so React's
 * state (`onChange`) updates synchronously.
 */
function setReactInputValue(
  el: HTMLInputElement | HTMLTextAreaElement,
  nextValue: string,
  cursorPos?: number,
) {
  const proto =
    el instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype
  const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  if (nativeSetter) {
    nativeSetter.call(el, nextValue)
  } else {
    el.value = nextValue
  }
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.focus()
  if (typeof cursorPos === 'number') {
    try {
      el.setSelectionRange(cursorPos, cursorPos)
    } catch {
      // Some input types (e.g. number) do not support setSelectionRange
    }
  }
}

export function InputContextMenu() {
  const [menu, setMenu] = useState<MenuState | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target
      if (!(target instanceof HTMLElement)) {
        setMenu(null)
        return
      }

      const inputEl = target.closest('input, textarea') as
        | HTMLInputElement
        | HTMLTextAreaElement
        | null

      if (!inputEl || inputEl.disabled || inputEl.readOnly) {
        setMenu(null)
        return
      }

      if (inputEl instanceof HTMLInputElement) {
        const allowedTypes = new Set(['text', 'search', 'url', 'tel', 'email', 'password', 'number', ''])
        if (!allowedTypes.has((inputEl.type || 'text').toLowerCase())) {
          setMenu(null)
          return
        }
      }

      e.preventDefault()
      e.stopPropagation()

      inputEl.focus()

      const start = inputEl.selectionStart ?? 0
      const end = inputEl.selectionEnd ?? 0
      const hasSelection = end > start
      const hasValue = inputEl.value.length > 0

      const menuWidth = 228
      const menuHeight = 264
      const clampedX = Math.max(12, Math.min(e.clientX, window.innerWidth - menuWidth - 12))
      const clampedY = Math.max(12, Math.min(e.clientY, window.innerHeight - menuHeight - 12))

      setMenu({
        x: clampedX,
        y: clampedY,
        target: inputEl,
        hasSelection,
        hasValue,
      })
    }

    const handlePointerDown = (e: MouseEvent) => {
      if (menuRef.current && menuRef.current.contains(e.target as Node)) {
        return
      }
      setMenu(null)
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenu(null)
      }
    }

    const handleScrollOrBlur = () => {
      setMenu(null)
    }

    window.addEventListener('contextmenu', handleContextMenu, true)
    window.addEventListener('mousedown', handlePointerDown, true)
    window.addEventListener('keydown', handleKeyDown, true)
    window.addEventListener('scroll', handleScrollOrBlur, true)
    window.addEventListener('resize', handleScrollOrBlur)

    return () => {
      window.removeEventListener('contextmenu', handleContextMenu, true)
      window.removeEventListener('mousedown', handlePointerDown, true)
      window.removeEventListener('keydown', handleKeyDown, true)
      window.removeEventListener('scroll', handleScrollOrBlur, true)
      window.removeEventListener('resize', handleScrollOrBlur)
    }
  }, [])

  if (!menu) return null

  const { target, hasSelection, hasValue } = menu

  const handlePaste = async (replaceAll = false) => {
    setMenu(null)
    try {
      const clipText = await navigator.clipboard.readText()
      if (!clipText) return
      if (replaceAll) {
        setReactInputValue(target, clipText, clipText.length)
        return
      }
      const start = target.selectionStart ?? target.value.length
      const end = target.selectionEnd ?? target.value.length
      const next = target.value.slice(0, start) + clipText + target.value.slice(end)
      setReactInputValue(target, next, start + clipText.length)
    } catch {
      target.focus()
      document.execCommand('paste')
    }
  }

  const handleCopy = async () => {
    setMenu(null)
    const start = target.selectionStart ?? 0
    const end = target.selectionEnd ?? 0
    const selectedText = end > start ? target.value.slice(start, end) : target.value
    if (!selectedText) return
    try {
      await navigator.clipboard.writeText(selectedText)
    } catch {
      target.focus()
      document.execCommand('copy')
    }
  }

  const handleCut = async () => {
    setMenu(null)
    const start = target.selectionStart ?? 0
    const end = target.selectionEnd ?? 0
    if (end <= start) return
    const selectedText = target.value.slice(start, end)
    try {
      await navigator.clipboard.writeText(selectedText)
    } catch {
      // Fallthrough
    }
    const next = target.value.slice(0, start) + target.value.slice(end)
    setReactInputValue(target, next, start)
  }

  const handleSelectAll = () => {
    setMenu(null)
    target.focus()
    target.select()
  }

  const handleClear = () => {
    setMenu(null)
    setReactInputValue(target, '', 0)
  }

  return (
    <AnimatePresence>
      <motion.div
        ref={menuRef}
        initial={{ opacity: 0, scale: 0.94, y: -4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -4 }}
        transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
        style={{ left: menu.x, top: menu.y }}
        className="solid-panel fixed z-[99999] w-56 select-none overflow-hidden rounded-2xl border border-border bg-surface/98 p-1.5 text-text shadow-2xl ring-1 ring-border/60 backdrop-blur-xl"
      >
        <div className="mb-1 flex items-center justify-between border-b border-border/60 px-2.5 py-1.5">
          <span className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-subtle">
            <Sparkles className="size-3 text-accent" />
            <span>Text Actions</span>
          </span>
          <span className="rounded-md bg-accent/12 px-1.5 py-0.2 font-mono text-[9px] font-bold text-accent">
            EDIT
          </span>
        </div>

        <div className="flex flex-col gap-0.5">
          <button
            type="button"
            onClick={() => void handlePaste(false)}
            className="group flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs font-semibold text-text transition-colors hover:bg-accent/15 hover:text-accent cursor-pointer"
          >
            <span className="flex items-center gap-2.5">
              <ClipboardPaste className="size-3.5 text-accent transition-transform group-hover:scale-110" />
              <span>Paste</span>
            </span>
            <kbd className="rounded border border-border/80 bg-surface-raised px-1.5 py-0.5 font-mono text-[9px] font-bold text-subtle">
              Ctrl+V
            </kbd>
          </button>

          <button
            type="button"
            onClick={() => void handlePaste(true)}
            className="group flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs font-semibold text-text transition-colors hover:bg-accent/15 hover:text-accent cursor-pointer"
          >
            <span className="flex items-center gap-2.5">
              <CornerDownLeft className="size-3.5 text-emerald-400 transition-transform group-hover:scale-110" />
              <span>Paste &amp; Replace</span>
            </span>
            <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[9px] font-bold text-emerald-400">
              FAST
            </span>
          </button>

          <button
            type="button"
            disabled={!hasValue}
            onClick={() => void handleCopy()}
            className={cn(
              'group flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs font-semibold transition-colors',
              hasValue
                ? 'text-text hover:bg-surface-raised cursor-pointer'
                : 'opacity-40 cursor-not-allowed text-muted',
            )}
          >
            <span className="flex items-center gap-2.5">
              <Copy className="size-3.5 text-subtle group-hover:text-text" />
              <span>{hasSelection ? 'Copy Selection' : 'Copy All'}</span>
            </span>
            <kbd className="rounded border border-border/80 bg-surface-raised px-1.5 py-0.5 font-mono text-[9px] font-bold text-subtle">
              Ctrl+C
            </kbd>
          </button>

          <button
            type="button"
            disabled={!hasSelection}
            onClick={() => void handleCut()}
            className={cn(
              'group flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs font-semibold transition-colors',
              hasSelection
                ? 'text-text hover:bg-surface-raised cursor-pointer'
                : 'opacity-40 cursor-not-allowed text-muted',
            )}
          >
            <span className="flex items-center gap-2.5">
              <Scissors className="size-3.5 text-subtle group-hover:text-text" />
              <span>Cut Selection</span>
            </span>
            <kbd className="rounded border border-border/80 bg-surface-raised px-1.5 py-0.5 font-mono text-[9px] font-bold text-subtle">
              Ctrl+X
            </kbd>
          </button>

          <div className="my-0.5 h-px bg-border/60" />

          <button
            type="button"
            disabled={!hasValue}
            onClick={handleSelectAll}
            className={cn(
              'group flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs font-semibold transition-colors',
              hasValue
                ? 'text-text hover:bg-surface-raised cursor-pointer'
                : 'opacity-40 cursor-not-allowed text-muted',
            )}
          >
            <span className="flex items-center gap-2.5">
              <CheckSquare className="size-3.5 text-subtle group-hover:text-text" />
              <span>Select All</span>
            </span>
            <kbd className="rounded border border-border/80 bg-surface-raised px-1.5 py-0.5 font-mono text-[9px] font-bold text-subtle">
              Ctrl+A
            </kbd>
          </button>

          <button
            type="button"
            disabled={!hasValue}
            onClick={handleClear}
            className={cn(
              'group flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs font-semibold transition-colors',
              hasValue
                ? 'text-rose-400 hover:bg-rose-500/12 cursor-pointer'
                : 'opacity-40 cursor-not-allowed text-muted',
            )}
          >
            <span className="flex items-center gap-2.5">
              <Trash2 className="size-3.5" />
              <span>Clear Field</span>
            </span>
            <span className="font-mono text-[9px] font-bold opacity-75">DEL</span>
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
