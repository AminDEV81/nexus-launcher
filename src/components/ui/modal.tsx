import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import { useAnimationSpeed } from '@/hooks/use-animation-speed'
import { ModalCloseButton } from './modal-close-button'

export { ModalCloseButton } from './modal-close-button'
export type { ModalCloseButtonProps } from './modal-close-button'

interface ModalProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  widthClassName?: string
  /** Set when the dialog renders its own close affordance and a second
   *  one would sit right next to it (e.g. the installation editor). */
  hideCloseButton?: boolean
}

/**
 * Generic modal shell, reused by every dialog-style feature (Add Game
 * here, the artwork cropper in Epic 10, "New Collection" in Epic 12,
 * ...). The dialog is portaled to AppShell's in-window `#modal-host`.
 * That gives a dialog opened from a narrow nested layout (such as the
 * details panel) the full window width, while the host remains inside
 * AppShell's rounded clipping rather than escaping to `document.body`.
 *
 * The shell owns two things every dialog needs: `overflow-hidden` so
 * full-bleed headers don't paint over the rounded corners, and a
 * corner ✕ so closing never depends on clicking the backdrop alone.
 */
export function Modal({
  open,
  onClose,
  children,
  widthClassName = 'max-w-md',
  hideCloseButton = false,
}: ModalProps) {
  const speed = useAnimationSpeed()

  useEffect(() => {
    if (!open) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  const content = (
    <AnimatePresence>
      {open && (
        <motion.div
          className="pointer-events-auto absolute inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 * speed }}
          onClick={onClose}
        >
          <motion.div
            className={`solid-panel relative w-full overflow-hidden rounded-2xl border border-border shadow-elevated ${widthClassName}`}
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.2 * speed, ease: [0.16, 1, 0.3, 1] }}
            onClick={(event) => event.stopPropagation()}
          >
            {children}
            {!hideCloseButton && (
              <ModalCloseButton
                onClick={onClose}
                className="absolute right-3.5 top-3.5 z-20"
                aria-label="Close dialog"
              />
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )

  const host = typeof document === 'undefined' ? null : document.getElementById('modal-host')
  return host ? createPortal(content, host) : content
}
