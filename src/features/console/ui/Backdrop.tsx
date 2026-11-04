import React, { useEffect, useRef, useState } from 'react'
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

interface ReadyBackdropLayer {
  src: string
  isPortrait: boolean
}

// Cache preloaded image aspect ratios in memory so revisiting a game morphs immediately!
const aspectCache = new Map<string, boolean>()

/**
 * Preloaded Dual-Layer Silk Morph Backdrop for Console Mode.
 * Pre-decodes incoming artwork off-screen before triggering a smooth 720ms cross-fade + scale + soft-focus morph
 * so switching between games feels fluid and organic with zero flash or stutter in both Dark and Light themes.
 */
export const ConsoleBackdrop: React.FC<ConsoleBackdropProps> = React.memo(
  ({ src, intensity = 1 }) => {
    const speed = useAnimationSpeed()
    const themeId = useConsoleStore((s) => s.theme)
    const theme = CONSOLE_THEMES[themeId] ?? CONSOLE_THEMES.cyberpunk
    const isLight = Boolean(theme.isLight)
    const bgHex = theme.bgPrimary
    const accentHex = theme.defaultAccent

    const [readyLayer, setReadyLayer] = useState<ReadyBackdropLayer | null>(() =>
      src ? { src, isPortrait: aspectCache.get(src) ?? false } : null,
    )
    const latestRequestedRef = useRef<string | null>(src)
    latestRequestedRef.current = src

    useEffect(() => {
      if (!src) {
        setReadyLayer(null)
        return
      }

      if (aspectCache.has(src)) {
        setReadyLayer({ src, isPortrait: aspectCache.get(src)! })
        return
      }

      let cancelled = false
      const probe = new Image()
      probe.decoding = 'async'
      probe.onload = () => {
        if (cancelled || latestRequestedRef.current !== src) return
        const isPortrait = probe.naturalHeight > probe.naturalWidth * 1.08
        aspectCache.set(src, isPortrait)
        setReadyLayer({ src, isPortrait })
      }
      probe.onerror = () => {
        if (cancelled) return
        // Keep previous backdrop if the new URL failed
      }
      probe.src = src

      return () => {
        cancelled = true
      }
    }, [src])

    // High-visibility opacity in Light Mode (0.90) so game hover backdrop changes are immediately vivid and dramatic
    const targetOpacity = (isLight ? 0.9 : 0.8) * intensity
    const morphDuration = Math.max(0.24, 0.72 * speed)

    return (
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <AnimatePresence initial={false} mode="sync">
          {readyLayer && (
            <motion.div
              key={readyLayer.src}
              initial={{ opacity: 0, scale: 1.04 }}
              animate={{ opacity: targetOpacity, scale: 1 }}
              exit={{ opacity: 0, scale: 0.99 }}
              transition={{
                duration: morphDuration,
                ease: [0.16, 1, 0.3, 1],
              }}
              className="absolute inset-0 will-change-[opacity,transform]"
            >
              {readyLayer.isPortrait ? (
                <>
                  <img
                    src={readyLayer.src}
                    alt=""
                    decoding="async"
                    draggable={false}
                    className={`absolute inset-0 h-full w-full object-cover scale-115 blur-2xl ${
                      isLight
                        ? 'opacity-70 saturate-[1.45] contrast-[1.08]'
                        : 'opacity-50 saturate-125'
                    }`}
                  />
                  <img
                    src={readyLayer.src}
                    alt=""
                    decoding="async"
                    draggable={false}
                    style={{
                      WebkitMaskImage:
                        'radial-gradient(ellipse 78% 84% at 68% 42%, #000 42%, transparent 92%)',
                      maskImage:
                        'radial-gradient(ellipse 78% 84% at 68% 42%, #000 42%, transparent 92%)',
                    }}
                    className={`absolute right-[5%] top-[6%] h-[78%] w-[40%] object-contain ${
                      isLight
                        ? 'opacity-95 drop-shadow-[0_24px_55px_rgba(15,23,42,0.38)]'
                        : 'opacity-90 drop-shadow-[0_24px_60px_rgba(0,0,0,0.8)]'
                    }`}
                  />
                </>
              ) : (
                <img
                  src={readyLayer.src}
                  alt=""
                  decoding="async"
                  draggable={false}
                  style={
                    isLight
                      ? {
                          WebkitMaskImage:
                            'linear-gradient(90deg, rgba(0,0,0,0.22) 0%, rgba(0,0,0,0.68) 28%, rgba(0,0,0,0.96) 50%, #000 100%)',
                          maskImage:
                            'linear-gradient(90deg, rgba(0,0,0,0.22) 0%, rgba(0,0,0,0.68) 28%, rgba(0,0,0,0.96) 50%, #000 100%)',
                        }
                      : undefined
                  }
                  className={`absolute inset-0 h-full w-full object-cover object-[68%_18%] ${
                    isLight
                      ? 'saturate-[1.18] contrast-[1.06]'
                      : 'saturate-[1.1] contrast-[1.03]'
                  }`}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {isLight ? (
          <>
            {/* Sculpted Daylight Left Frost: protects Hero text on the left while leaving the right 55-65% showcase crystal clear */}
            <div
              className="absolute inset-0 transition-[background] duration-500"
              style={{
                background: `linear-gradient(90deg, ${bgHex} 0%, color-mix(in srgb, ${bgHex} 86%, transparent) 22%, color-mix(in srgb, ${bgHex} 34%, transparent) 46%, transparent 72%)`,
              }}
            />
            {/* Sculpted Daylight Bottom Shelf Blend */}
            <div
              className="absolute inset-0 transition-[background] duration-500"
              style={{
                background: `linear-gradient(0deg, ${bgHex} 0%, color-mix(in srgb, ${bgHex} 78%, transparent) 16%, transparent 48%)`,
              }}
            />
            {/* Soft Top Navigation Header Veil */}
            <div
              className="absolute inset-x-0 top-0 h-24 transition-[background] duration-500"
              style={{
                background: `linear-gradient(180deg, color-mix(in srgb, ${bgHex} 74%, transparent) 0%, transparent 100%)`,
              }}
            />
            {/* Dynamic Ambient Color Halo that shifts with each hovered game in Light Mode */}
            <div
              className="absolute inset-0 transition-[background] duration-700"
              style={{
                background: `radial-gradient(ellipse 68% 58% at 78% 24%, color-mix(in srgb, var(--console-ambient, ${accentHex}) 26%, transparent) 0%, transparent 72%), radial-gradient(ellipse 55% 48% at 12% 88%, color-mix(in srgb, ${accentHex} 18%, transparent) 0%, transparent 70%)`,
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
