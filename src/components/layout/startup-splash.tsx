import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { playStartupChime } from '@/lib/sound-engine'
import { useThemeStore } from '@/store/theme-store'
import {
  GEM_FACETS,
  GEM_OUTLINE_COLOR,
  GEM_OUTLINE_POINTS,
  GEM_BELT_LINE,
  facetGradientId,
} from '@/components/brand/gem-geometry'
import { GemGradientDefs } from '@/components/brand/gem-gradient-defs'

const SPLASH_DURATION_MS = 3200
const WORDMARK = 'NEXUS'

export function StartupSplash({ onDone }: { onDone: () => void }) {
  const [visible, setVisible] = useState(true)
  const finishTimer = useRef<number | null>(null)
  const finished = useRef(false)

  const mode = useThemeStore((s) => s.mode)
  const isDark = mode === 'dark'

  const finish = useCallback(() => {
    if (finished.current) return
    finished.current = true
    setVisible(false)
    finishTimer.current = window.setTimeout(onDone, 600)
  }, [onDone])

  // Ambient floating stardust embers
  const stardust = useMemo(
    () =>
      Array.from({ length: 24 }, (_, index) => ({
        id: index,
        left: `${Math.random() * 100}%`,
        top: `${Math.random() * 100}%`,
        size: 1.5 + Math.random() * 2.5,
        delay: Math.random() * 2,
        duration: 2 + Math.random() * 2,
      })),
    [],
  )

  // Inward convergence streaks (fly toward center before impact)
  const convergenceStreaks = useMemo(
    () =>
      Array.from({ length: 8 }, (_, i) => {
        const angle = (i / 8) * Math.PI * 2
        const startDist = 320 + Math.random() * 160
        return {
          id: i,
          xStart: Math.cos(angle) * startDist,
          yStart: Math.sin(angle) * startDist,
          width: 2 + Math.random() * 2,
          length: 40 + Math.random() * 50,
          angleDeg: (angle * 180) / Math.PI + 90,
          delay: 0.15 + (i % 4) * 0.1,
        }
      }),
    [],
  )

  useEffect(() => {
    playStartupChime()
    const timer = window.setTimeout(finish, SPLASH_DURATION_MS)
    return () => {
      window.clearTimeout(timer)
      if (finishTimer.current !== null) window.clearTimeout(finishTimer.current)
    }
  }, [finish])

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="absolute inset-0 z-[200] flex cursor-pointer items-center justify-center overflow-hidden select-none"
          style={{
            backgroundColor: isDark ? '#06080e' : '#f8fafc',
          }}
          onClick={finish}
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.12, filter: 'blur(10px)', pointerEvents: 'none' }}
          transition={{ duration: 0.55, ease: [0.7, 0, 0.84, 0] }}
        >
          {/* Theme & Palette Ambient Glow Blobs */}
          <motion.div
            className="pointer-events-none absolute size-[650px] rounded-full blur-[120px]"
            style={{
              background: `radial-gradient(circle, color-mix(in srgb, var(--color-accent) 25%, transparent) 0%, transparent 70%)`,
            }}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: [0.8, 1.2, 1], opacity: [0, 0.8, 0.6] }}
            transition={{ duration: 2.2, ease: 'easeOut' }}
          />

          <motion.div
            className="pointer-events-none absolute size-[450px] translate-y-32 rounded-full blur-[100px]"
            style={{
              background: `radial-gradient(circle, color-mix(in srgb, var(--color-accent-hover) 18%, transparent) 0%, transparent 70%)`,
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.5, 0.35] }}
            transition={{ duration: 2, delay: 0.4 }}
          />

          {/* Perspective Cyber Grid (Dark mode subtle floor) */}
          {isDark && (
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 opacity-25"
              style={{
                background: `linear-gradient(to top, color-mix(in srgb, var(--color-accent) 12%, transparent), transparent), radial-gradient(circle at bottom, color-mix(in srgb, var(--color-accent) 15%, transparent) 0%, transparent 80%)`,
                maskImage: 'linear-gradient(to top, black, transparent)',
              }}
            />
          )}

          {/* Floating stardust particles */}
          {stardust.map((p) => (
            <motion.span
              key={p.id}
              className="absolute rounded-full"
              style={{
                left: p.left,
                top: p.top,
                width: p.size,
                height: p.size,
                backgroundColor: isDark ? '#ffffff' : 'var(--color-accent)',
                boxShadow: isDark
                  ? '0 0 8px var(--color-accent)'
                  : '0 0 6px color-mix(in srgb, var(--color-accent) 40%, transparent)',
              }}
              initial={{ opacity: 0, scale: 0 }}
              animate={{
                opacity: [0, isDark ? 0.85 : 0.6, 0],
                scale: [0, 1.2, 0.8],
                y: [0, -25],
              }}
              exit={{ opacity: 0 }}
              transition={{
                duration: p.duration,
                delay: p.delay,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
          ))}

          {/* Hyper-velocity convergence streaks flying inward */}
          {convergenceStreaks.map((s) => (
            <motion.div
              key={s.id}
              className="pointer-events-none absolute rounded-full"
              style={{
                width: s.width,
                height: s.length,
                transform: `rotate(${s.angleDeg}deg)`,
                background: `linear-gradient(to top, var(--color-accent), transparent)`,
              }}
              initial={{ x: s.xStart, y: s.yStart, opacity: 0, scaleY: 0 }}
              animate={{
                x: [s.xStart, 0],
                y: [s.yStart, 0],
                opacity: [0, 0.9, 0],
                scaleY: [0, 1.5, 0],
              }}
              transition={{ duration: 0.55, delay: s.delay, ease: 'easeIn' }}
            />
          ))}

          {/* Impact shockwave rings */}
          {[0, 0.12].map((delay, idx) => (
            <motion.div
              key={idx}
              className="pointer-events-none absolute size-[560px] rounded-full border"
              style={{
                borderColor: 'var(--color-accent)',
                boxShadow: '0 0 20px color-mix(in srgb, var(--color-accent) 40%, transparent)',
              }}
              initial={{ scale: 0.05, opacity: 0 }}
              animate={{ scale: 1, opacity: [0, 0.7, 0] }}
              transition={{ duration: 0.95, delay: 0.8 + delay, ease: 'easeOut' }}
            />
          ))}

          {/* Impact optical flare flash */}
          <motion.div
            className="pointer-events-none absolute size-44 rounded-full blur-xl"
            style={{ backgroundColor: 'var(--color-accent)' }}
            initial={{ opacity: 0, scale: 0.2 }}
            animate={{ opacity: [0, 1, 0], scale: [0.2, 2.8, 3.5] }}
            transition={{ duration: 0.45, delay: 0.8, ease: 'easeOut' }}
          />

          {/* Main Hero Container */}
          <div className="relative flex flex-col items-center gap-5" style={{ perspective: 900 }}>
            {/* Ambient core glow behind the gem */}
            <motion.div
              className="pointer-events-none absolute left-1/2 top-1/2 size-48 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
              style={{ backgroundColor: 'var(--color-accent)' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.6, 0.35] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.1, delay: 0.82, ease: 'easeOut' }}
            />

            {/* The Nexus Gem (assembled from 6 flying shards) */}
            <motion.svg
              width="104"
              height="104"
              viewBox="0 0 512 512"
              className="relative drop-shadow-2xl"
              initial={{ scale: 0.65, opacity: 0 }}
              animate={{
                scale: [0.65, 1.05, 1],
                opacity: 1,
                rotateY: [0, 0, -8, 8, 0],
              }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{
                scale: {
                  duration: 0.55,
                  delay: 0.78,
                  times: [0, 0.7, 1],
                  ease: [0.16, 1, 0.3, 1],
                },
                opacity: { duration: 0.2, delay: 0.78 },
                rotateY: { duration: 4.5, delay: 1.4, repeat: Infinity, ease: 'easeInOut' },
              }}
              style={{ transformStyle: 'preserve-3d' }}
            >
              <GemGradientDefs />

              {GEM_FACETS.map((facet, index) => (
                <motion.polygon
                  key={facet.id}
                  points={facet.points}
                  fill={`url(#${facetGradientId(facet)})`}
                  initial={{
                    x: facet.from.x,
                    y: facet.from.y,
                    rotate: facet.from.rotate,
                    opacity: 0,
                  }}
                  animate={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
                  exit={{
                    x: facet.from.x * 0.75,
                    y: facet.from.y * 0.75,
                    rotate: facet.from.rotate,
                    opacity: 0,
                  }}
                  transition={{
                    duration: 0.65,
                    delay: 0.08 + index * 0.05,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                />
              ))}

              {/* Glowing accent laser perimeter */}
              <motion.polygon
                points={GEM_OUTLINE_POINTS}
                fill="none"
                stroke="var(--color-accent)"
                strokeWidth={24}
                strokeLinejoin="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: [0, 0.6, 0.3] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.6, delay: 0.82, ease: 'easeInOut' }}
              />

              <motion.polygon
                points={GEM_OUTLINE_POINTS}
                fill="none"
                stroke={isDark ? GEM_OUTLINE_COLOR : '#cbd5e1'}
                strokeWidth={14}
                strokeLinejoin="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.55, delay: 0.82, ease: 'easeInOut' }}
              />

              <motion.line
                x1={GEM_BELT_LINE.x1}
                y1={GEM_BELT_LINE.y1}
                x2={GEM_BELT_LINE.x2}
                y2={GEM_BELT_LINE.y2}
                stroke={isDark ? GEM_OUTLINE_COLOR : '#cbd5e1'}
                strokeWidth={12}
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.35, delay: 1.15, ease: 'easeInOut' }}
              />
            </motion.svg>

            {/* Specular shimmer sweep across the mark */}
            <motion.div
              className="pointer-events-none absolute -inset-x-6 -inset-y-4 overflow-hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ delay: 1.9 }}
            >
              <motion.div
                className="absolute inset-y-0 w-12 -skew-x-12 bg-white/50 blur-sm"
                initial={{ x: -100 }}
                animate={{ x: 260 }}
                transition={{ duration: 1.1, delay: 1.95, ease: 'easeInOut' }}
              />
            </motion.div>

            {/* Wordmark typography */}
            <div className="flex flex-col items-center gap-2">
              <div className="flex tracking-[0.4em]">
                {WORDMARK.split('').map((letter, index) => (
                  <motion.span
                    key={index}
                    className="text-base font-black tracking-[0.45em]"
                    style={{
                      color: isDark ? '#f8fafc' : '#0f172a',
                    }}
                    initial={{ opacity: 0, y: 12, filter: 'blur(4px)' }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{
                      duration: 0.4,
                      delay: 1.45 + index * 0.07,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                  >
                    {letter}
                  </motion.span>
                ))}
              </div>

              {/* Glowing laser baseline accent */}
              <motion.div
                className="h-0.5 rounded-full"
                style={{
                  background: `linear-gradient(to right, transparent, var(--color-accent), transparent)`,
                  boxShadow: `0 0 10px var(--color-accent)`,
                }}
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 90, opacity: 0.8 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.6, delay: 2.05, ease: [0.16, 1, 0.3, 1] }}
              />

              {/* Subtitle flourish */}
              <motion.span
                className="text-[9px] font-bold tracking-[0.3em] uppercase"
                style={{
                  color: isDark ? 'rgba(255, 255, 255, 0.45)' : 'rgba(15, 23, 42, 0.5)',
                }}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4, delay: 2.25, ease: 'easeOut' }}
              >
                Next-Gen Gaming Platform
              </motion.span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
