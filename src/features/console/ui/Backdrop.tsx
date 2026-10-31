import React, { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useAnimationSpeed } from '@/hooks/use-animation-speed'
import { useConsoleStore } from '../store/console-store'
import { CONSOLE_THEMES } from '../theme/tokens'

export interface ConsoleBackdropProps {
  /** Resolved high-resolution widescreen image URL of the focused game. */
  src: string | null
  /** Optional fallback cover if no widescreen hero is available yet. */
  fallbackCoverSrc?: string | null
  /** 0..1 — how visible the artwork is. */
  intensity?: number
}

/**
 * High-clarity 1080p full-bleed widescreen backdrop (#8).
 * Automatically detects if an image is a low-res vertical portrait cover (`naturalHeight > naturalWidth * 1.1`)
 * and renders a sharp floating showcase + diffused ambient aura instead of stretching a 264px portrait cover
 * blurry across a 1920px screen!
 */
export const ConsoleBackdrop: React.FC<ConsoleBackdropProps> = React.memo(
  ({ src, intensity = 1 }) => {
    const speed = useAnimationSpeed()
    const themeId = useConsoleStore((s) => s.theme)
    const theme = CONSOLE_THEMES[themeId] ?? CONSOLE_THEMES.cyberpunk
    const isLight = Boolean(theme.isLight)
    const bgHex = theme.bgPrimary

    const [isPortraitMap, setIsPortraitMap] = useState<Record<string, boolean>>({})
    const [failedMap, setFailedMap] = useState<Record<string, boolean>>({})

    const activeSrc = src && !failedMap[src] ? src : null
    const isPortrait = activeSrc ? Boolean(isPortraitMap[activeSrc]) : false

    return (
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <AnimatePresence initial={false}>
          {activeSrc && (
            <motion.div
              key={activeSrc}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.48 * speed, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-0"
            >
              {isPortrait ? (
                <>
                  {/* Portrait Cover Fallback: Never stretch raw! Use an atmospheric colour wash + sharp right-aligned glass card */}
                  <img
                    src={activeSrc}
                    alt=""
                    decoding="async"
                    draggable={false}
                    className="absolute inset-0 h-full w-full object-cover scale-125 blur-[65px] opacity-40 saturate-150"
                  />
                  <img
                    src={activeSrc}
                    alt=""
                    decoding="async"
                    draggable={false}
                    style={{
                      WebkitMaskImage:
                        'radial-gradient(ellipse 75% 80% at 65% 42%, #000 35%, transparent 90%)',
                      maskImage:
                        'radial-gradient(ellipse 75% 80% at 65% 42%, #000 35%, transparent 90%)',
                    }}
                    className="absolute right-[6%] top-[6%] h-[78%] w-[38%] object-contain opacity-75 drop-shadow-[0_24px_60px_rgba(0,0,0,0.8)]"
                  />
                </>
              ) : (
                <motion.img
                  src={activeSrc}
                  alt=""
                  decoding="async"
                  draggable={false}
                  onLoad={(e) => {
                    const img = e.currentTarget
                    if (img.naturalHeight > img.naturalWidth * 1.08) {
                      setIsPortraitMap((prev) => ({ ...prev, [activeSrc]: true }))
                    }
                  }}
                  onError={() => {
                    setFailedMap((prev) => ({ ...prev, [activeSrc]: true }))
                  }}
                  className="absolute inset-0 h-full w-full object-cover object-[68%_18%] saturate-[1.12] contrast-[1.04]"
                  initial={{ scale: 1.03 }}
                  animate={{ opacity: (isLight ? 0.36 : 0.78) * intensity, scale: 1 }}
                  transition={{ duration: 0.55 * speed }}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {isLight ? (
          <>
            <div
              className="absolute inset-0"
              style={{
                background: `linear-gradient(90deg, ${bgHex} 0%, rgba(241,245,249,0.84) 32%, rgba(241,245,249,0.4) 68%, rgba(241,245,249,0.15) 100%)`,
              }}
            />
            <div
              className="absolute inset-0"
              style={{
                background: `linear-gradient(0deg, ${bgHex} 0%, rgba(241,245,249,0.82) 20%, rgba(241,245,249,0.08) 62%)`,
              }}
            />
          </>
        ) : (
          <>
            <div
              className="absolute inset-0"
              style={{
                background: `linear-gradient(90deg, ${bgHex} 0%, color-mix(in srgb, ${bgHex} 68%, transparent) 28%, color-mix(in srgb, ${bgHex} 18%, transparent) 64%, transparent 100%)`,
              }}
            />
            <div
              className="absolute inset-0"
              style={{
                background: `linear-gradient(0deg, ${bgHex} 0%, color-mix(in srgb, ${bgHex} 72%, transparent) 20%, transparent 62%)`,
              }}
            />
            <div
              className="absolute inset-x-0 top-0 h-28"
              style={{
                background: `linear-gradient(180deg, color-mix(in srgb, ${bgHex} 55%, transparent), transparent)`,
              }}
            />
          </>
        )}
      </div>
    )
  },
)
ConsoleBackdrop.displayName = 'ConsoleBackdrop'
