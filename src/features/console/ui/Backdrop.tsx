import React from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useAnimationSpeed } from '@/hooks/use-animation-speed'

export interface ConsoleBackdropProps {
  /** Resolved image URL of the focused game; null shows only the ambient colour wash. */
  src: string | null
  /** 0..1 — how visible the artwork is (Home is bold, Library is calmer). */
  intensity?: number
}

/**
 * Full-bleed, scroll-independent artwork behind the whole UI. Crossfades (and gently settles) when
 * the focused game changes. The image is dissolved into the page colour with gradients, so the
 * foreground never needs cards or borders to stay readable.
 */
export const ConsoleBackdrop: React.FC<ConsoleBackdropProps> = React.memo(
  ({ src, intensity = 1 }) => {
    const speed = useAnimationSpeed()
    return (
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <AnimatePresence initial={false}>
          {src && (
            <motion.img
              key={src}
              src={src}
              alt=""
              decoding="async"
              draggable={false}
              className="absolute inset-0 h-full w-full object-cover object-[70%_20%]"
              initial={{ opacity: 0, scale: 1.07 }}
              animate={{ opacity: 0.88 * intensity, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.85 * speed, ease: [0.22, 1, 0.36, 1] }}
            />
          )}
        </AnimatePresence>
        {/* Dissolve into the page: strong on the left (text side) and at the bottom (rows). */}
        <div className="absolute inset-0 bg-[linear-gradient(90deg,#06070b_0%,rgba(6,7,11,0.82)_28%,rgba(6,7,11,0.25)_62%,rgba(6,7,11,0.05)_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(0deg,#06070b_0%,rgba(6,7,11,0.9)_24%,rgba(6,7,11,0)_62%)]" />
        <div className="absolute inset-x-0 top-0 h-40 bg-[linear-gradient(180deg,rgba(6,7,11,0.7),rgba(6,7,11,0))]" />
      </div>
    )
  },
)
ConsoleBackdrop.displayName = 'ConsoleBackdrop'
