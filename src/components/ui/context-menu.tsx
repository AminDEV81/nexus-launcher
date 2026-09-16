import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { useAnimationSpeed } from '@/hooks/use-animation-speed'

interface ContextMenuProps {
  position: { x: number; y: number } | null
  onClose: () => void
  children: ReactNode
}

/**
 * Cursor-anchored floating menu (right-click or a "⋮" trigger both use
 * this). Not a native browser context menu — the design brief calls
 * for "beautiful modern context menu", which means owning the visuals
 * ourselves — and not a portal to `document.body` for the same reason
 * every other overlay in this app avoids that (see `Modal`'s comment):
 * it would escape the rounded, clipped window shape.
 */
export function ContextMenu({ position, onClose, children }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [adjusted, setAdjusted] = useState<{ x: number; y: number } | null>(null)
  const speed = useAnimationSpeed()

  useEffect(() => {
    if (!position) {
      setAdjusted(null)
      return
    }
    // Clamp so the menu never renders partly off-screen near the right
    // or bottom edge of the window.
    const el = menuRef.current
    if (!el) {
      setAdjusted(position)
      return
    }
    const { offsetWidth, offsetHeight } = el
    const x = Math.min(position.x, window.innerWidth - offsetWidth - 8)
    const y = Math.min(position.y, window.innerHeight - offsetHeight - 8)
    setAdjusted({ x: Math.max(8, x), y: Math.max(8, y) })
  }, [position])

  useEffect(() => {
    if (!position) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [position, onClose])

  return (
    <AnimatePresence>
      {position && (
        <>
          <div
            className="absolute inset-0 z-40"
            onClick={onClose}
            onContextMenu={(e) => e.preventDefault()}
          />
          <motion.div
            ref={menuRef}
            className={cn(
              'solid-panel absolute z-50 min-w-44 overflow-hidden rounded-xl border border-border p-1 shadow-elevated',
            )}
            style={{ left: (adjusted ?? position).x, top: (adjusted ?? position).y }}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.12 * speed }}
          >
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

export function ContextMenuItem({
  icon: Icon,
  label,
  onClick,
  danger,
  disabled,
  title,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick: () => void
  danger?: boolean
  disabled?: boolean
  title?: string
  /** Right-aligned, subtle annotation (e.g. a count) — never the only
   *  place a value lives, just an at-a-glance extra. */
  hint?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors',
        disabled
          ? 'cursor-not-allowed text-subtle'
          : danger
            ? 'text-red-400 hover:bg-red-500/10'
            : // Accent tint instead of bg-surface-raised: raised is
              // near-identical to the solid panel underneath in dark
              // mode and *identical* (#fff) in light mode, so that
              // hover read as "nothing happens". The accent tint is
              // visible in both themes and follows the active palette.
              'text-text hover:bg-accent/15',
      )}
    >
      <Icon
        className={cn(
          'size-4 shrink-0 transition-colors',
          !disabled && !danger && 'group-hover:text-accent',
        )}
      />
      <span className="flex-1">{label}</span>
      {hint && <span className="shrink-0 text-xs text-subtle">{hint}</span>}
    </button>
  )
}

export function ContextMenuSeparator() {
  return <div className="my-1 border-t border-border" />
}
