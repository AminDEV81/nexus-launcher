import { useEffect, useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useCloseFlowStore } from '@/store/close-flow-store'
import { useThemeStore } from '@/store/theme-store'
import { playCloseSound } from '@/lib/sound-engine'
import { useAnimationSpeed } from '@/hooks/use-animation-speed'
import {
  GEM_FACETS,
  GEM_OUTLINE_COLOR,
  GEM_OUTLINE_POINTS,
  GEM_BELT_LINE,
  facetGradientId,
} from '@/components/brand/gem-geometry'
import { GemGradientDefs } from '@/components/brand/gem-gradient-defs'

export function ClosingOverlay() {
  const isClosing = useCloseFlowStore((s) => s.isClosing)
  const speed = useAnimationSpeed()
  const mode = useThemeStore((s) => s.mode)
  const isDark = mode === 'dark'

  // Inward collapsing stardust particles
  const particles = useMemo(
    () =>
      Array.from({ length: 24 }, (_, i) => {
        const angle = (i / 24) * Math.PI * 2
        const distance = 160 + Math.random() * 200
        return {
          id: i,
          x: Math.cos(angle) * distance,
          y: Math.sin(angle) * distance,
          size: 2 + Math.random() * 3,
        }
      }),
    [],
  )

  useEffect(() => {
    if (isClosing) playCloseSound()
  }, [isClosing])

  return (
    <AnimatePresence>
      {isClosing && (
        <motion.div
          className="absolute inset-0 z-[300] flex items-center justify-center overflow-hidden select-none pointer-events-auto"
          style={{
            backgroundColor: isDark ? '#06080e' : '#f8fafc',
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.15 * speed, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* Radial accent aura collapsing inward */}
          <motion.div
            className="pointer-events-none absolute inset-0"
            initial={{ opacity: 0, scale: 1.4 }}
            animate={{ opacity: [0, 0.8, 0], scale: [1.4, 1, 0.2] }}
            transition={{ duration: 0.55 * speed, ease: 'easeInOut' }}
            style={{
              background: `radial-gradient(circle at center, color-mix(in srgb, var(--color-accent) 35%, transparent) 0%, transparent 70%)`,
            }}
          />

          {/* Collapsing particles toward central singularity */}
          {particles.map((p) => (
            <motion.span
              key={p.id}
              className="absolute rounded-full"
              style={{
                width: p.size,
                height: p.size,
                backgroundColor: isDark ? 'var(--color-accent)' : 'var(--color-accent-hover)',
                boxShadow: `0 0 10px var(--color-accent)`,
              }}
              initial={{ x: p.x, y: p.y, opacity: 0.9, scale: 1 }}
              animate={{ x: 0, y: 0, opacity: [0.9, 1, 0], scale: [1, 1.6, 0.1] }}
              transition={{ duration: 0.5 * speed, ease: [0.4, 0, 0.2, 1] }}
            />
          ))}

          {/* Center Implosion Container */}
          <div className="relative flex flex-col items-center gap-4">
            {/* Shockwave ring */}
            <motion.div
              className="pointer-events-none absolute size-44 -translate-x-1/2 -translate-y-1/2 left-1/2 top-1/2 rounded-full border-2"
              style={{
                borderColor: 'var(--color-accent)',
                boxShadow: '0 0 24px color-mix(in srgb, var(--color-accent) 50%, transparent)',
              }}
              initial={{ scale: 0.2, opacity: 0.9 }}
              animate={{ scale: [0.2, 2.4, 0.1], opacity: [0.9, 0.5, 0] }}
              transition={{ duration: 0.55 * speed, ease: 'easeOut' }}
            />

            {/* Core energy flash bloom */}
            <motion.div
              className="pointer-events-none absolute size-32 -translate-x-1/2 -translate-y-1/2 left-1/2 top-1/2 rounded-full blur-2xl"
              style={{ backgroundColor: 'var(--color-accent)' }}
              initial={{ scale: 0.3, opacity: 0 }}
              animate={{ scale: [0.3, 2.5, 0], opacity: [0, 1, 0] }}
              transition={{ duration: 0.45 * speed, ease: 'easeOut' }}
            />

            {/* The Gem breaking apart */}
            <motion.svg
              width="88"
              height="88"
              viewBox="0 0 512 512"
              className="relative drop-shadow-2xl"
              initial={{ scale: 1, opacity: 1 }}
              animate={{ scale: [1, 1.12, 0.2], opacity: [1, 1, 0] }}
              transition={{ duration: 0.52 * speed, ease: [0.16, 1, 0.3, 1] }}
            >
              <GemGradientDefs />

              {GEM_FACETS.map((facet, index) => (
                <motion.polygon
                  key={facet.id}
                  points={facet.points}
                  fill={`url(#${facetGradientId(facet)})`}
                  initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
                  animate={{
                    x: facet.from.x * 0.85,
                    y: facet.from.y * 0.85,
                    rotate: facet.from.rotate,
                    opacity: 0,
                  }}
                  transition={{
                    duration: 0.5 * speed,
                    delay: (0.02 + index * 0.03) * speed,
                    ease: [0.35, 0, 0.7, 0.2],
                  }}
                />
              ))}

              <motion.polygon
                points={GEM_OUTLINE_POINTS}
                fill="none"
                stroke="var(--color-accent)"
                strokeWidth={22}
                strokeLinejoin="round"
                initial={{ opacity: 0.9, scale: 1 }}
                animate={{ opacity: 0, scale: 1.25 }}
                transition={{ duration: 0.4 * speed, ease: 'easeOut' }}
              />

              <motion.polygon
                points={GEM_OUTLINE_POINTS}
                fill="none"
                stroke={isDark ? GEM_OUTLINE_COLOR : '#cbd5e1'}
                strokeWidth={12}
                strokeLinejoin="round"
                initial={{ opacity: 1 }}
                animate={{ opacity: 0 }}
                transition={{ duration: 0.35 * speed }}
              />

              <motion.line
                x1={GEM_BELT_LINE.x1}
                y1={GEM_BELT_LINE.y1}
                x2={GEM_BELT_LINE.x2}
                y2={GEM_BELT_LINE.y2}
                stroke={isDark ? GEM_OUTLINE_COLOR : '#cbd5e1'}
                strokeWidth={10}
                initial={{ opacity: 1 }}
                animate={{ opacity: 0 }}
                transition={{ duration: 0.3 * speed }}
              />
            </motion.svg>

            {/* Outro typography */}
            <motion.div
              className="flex flex-col items-center gap-1.5"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: [0, 1, 0], y: [6, 0, -10] }}
              transition={{ duration: 0.5 * speed, ease: 'easeOut' }}
            >
              <span
                className="text-xs font-black tracking-[0.45em] uppercase"
                style={{ color: isDark ? '#f8fafc' : '#0f172a' }}
              >
                NEXUS
              </span>
              <motion.div
                className="h-0.5 rounded-full"
                style={{
                  backgroundColor: 'var(--color-accent)',
                  boxShadow: '0 0 8px var(--color-accent)',
                }}
                initial={{ width: 0 }}
                animate={{ width: [0, 48, 0] }}
                transition={{ duration: 0.45 * speed, ease: 'easeInOut' }}
              />
              <span
                className="text-[9px] font-bold tracking-[0.25em] uppercase"
                style={{ color: isDark ? 'rgba(255, 255, 255, 0.4)' : 'rgba(15, 23, 42, 0.45)' }}
              >
                See you next game
              </span>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
