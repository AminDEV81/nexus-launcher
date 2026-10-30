import React from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useAnimationSpeed } from '@/hooks/use-animation-speed'
import { Play, Info, Heart } from 'lucide-react'
import type { Game } from '@/types/models'
import { formatPlaytime } from '@/features/library/utils/format'
import { FocusScope, useFocusable } from '../nav/FocusScope'
import { resolveConsoleMediaUrl } from './Tile'

export interface ConsoleHeroProps {
  game: Game | null
  isRunning?: boolean
  playLabel: string
  resumeLabel: string
  detailsLabel: string
  onPlayOrResume: (game: Game) => void
  onOpenHub: (game: Game) => void
  onToggleFavorite?: (game: Game) => void
}

const SPRING = { type: 'spring', stiffness: 460, damping: 30, mass: 0.7 } as const

/**
 * Minimal hero: no card, no border. The full-bleed artwork lives in `ConsoleBackdrop`; this is just
 * a caption, a large title and the primary actions, left-aligned over the dissolved artwork.
 */
export const ConsoleHero: React.FC<ConsoleHeroProps> = ({
  game,
  isRunning = false,
  playLabel,
  resumeLabel,
  detailsLabel,
  onPlayOrResume,
  onOpenHub,
  onToggleFavorite,
}) => {
  const speed = useAnimationSpeed()
  const playFocus = useFocusable<HTMLButtonElement>({
    id: 'hero_primary_play',
    scopeId: 'console_hero_scope',
    onConfirm: () => {
      if (game) onPlayOrResume(game)
    },
  })
  const detailsFocus = useFocusable<HTMLButtonElement>({
    id: 'hero_secondary_details',
    scopeId: 'console_hero_scope',
    onConfirm: () => {
      if (game) onOpenHub(game)
    },
  })
  const favFocus = useFocusable<HTMLButtonElement>({
    id: 'hero_tertiary_fav',
    scopeId: 'console_hero_scope',
    onConfirm: () => {
      if (game) onToggleFavorite?.(game)
    },
  })

  if (!game) {
    return (
      <div className="flex h-[18.5rem] flex-col justify-end pb-6">
        <h1 className="text-[3.2rem] font-semibold leading-none tracking-tight text-white">
          Your library is empty
        </h1>
        <p className="mt-3 text-lg text-white/50">Add games from the desktop to get started.</p>
      </div>
    )
  }

  const logoSrc = resolveConsoleMediaUrl(game.logo_path)
  const meta = [game.genres.slice(0, 2).join(' · '), formatPlaytime(game.total_playtime_seconds)]
    .filter(Boolean)
    .join('   ·   ')

  return (
    <div className="flex h-[18.5rem] max-w-[46rem] select-none flex-col justify-end pb-4">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={`info_${game.id}`}
          className="flex flex-col gap-4"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.34 * speed, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="flex items-center gap-3 text-[0.95rem] font-medium tracking-wide text-white/55">
            {isRunning && (
              <span className="flex items-center gap-2 text-emerald-300">
                <span className="size-2 animate-pulse rounded-full bg-emerald-400" />
                Playing now
              </span>
            )}
            <span>{meta}</span>
          </div>

          {logoSrc ? (
            <img
              src={logoSrc}
              alt={game.name}
              className="max-h-[5.5rem] max-w-[28rem] object-contain object-left drop-shadow-2xl"
            />
          ) : (
            <h1 className="line-clamp-2 text-[4.1rem] font-semibold leading-[0.98] tracking-[-0.025em] text-white [text-shadow:0_4px_40px_rgba(0,0,0,0.45)]">
              {game.name}
            </h1>
          )}
        </motion.div>
      </AnimatePresence>

      <FocusScope
        id="console_hero_scope"
        orientation="horizontal"
        className="mt-7 flex items-center gap-4"
      >
        <motion.button
          type="button"
          {...playFocus.focusProps}
          animate={{ scale: playFocus.isFocused ? 1.07 : 1 }}
          transition={speed === 0 ? { duration: 0 } : SPRING}
          className={`flex items-center gap-3 rounded-full px-9 py-4 text-[1.15rem] font-semibold outline-none transition-[background-color,box-shadow] duration-200 ${
            playFocus.isFocused
              ? 'bg-white text-black shadow-[0_0_0_4px_rgba(255,255,255,0.28),0_18px_50px_-8px_var(--console-ambient,#7dd3fc)]'
              : 'bg-white/92 text-black/90'
          }`}
        >
          <Play className="size-[1.15rem] fill-current" />
          <span>{isRunning ? resumeLabel : playLabel}</span>
        </motion.button>

        <motion.button
          type="button"
          {...detailsFocus.focusProps}
          aria-label={detailsLabel}
          title={detailsLabel}
          animate={{ scale: detailsFocus.isFocused ? 1.1 : 1 }}
          transition={speed === 0 ? { duration: 0 } : SPRING}
          className={`flex size-[3.7rem] items-center justify-center rounded-full outline-none transition-colors duration-200 ${
            detailsFocus.isFocused
              ? 'bg-white text-black'
              : 'bg-white/12 text-white backdrop-blur-sm'
          }`}
        >
          <Info className="size-[1.35rem]" />
        </motion.button>

        {onToggleFavorite && (
          <motion.button
            type="button"
            {...favFocus.focusProps}
            aria-label="Favorite"
            title="Favorite"
            animate={{ scale: favFocus.isFocused ? 1.1 : 1 }}
            transition={speed === 0 ? { duration: 0 } : SPRING}
            className={`flex size-[3.7rem] items-center justify-center rounded-full outline-none transition-colors duration-200 ${
              favFocus.isFocused ? 'bg-white text-black' : 'bg-white/12 text-white backdrop-blur-sm'
            }`}
          >
            <Heart className={`size-[1.35rem] ${game.is_favorite ? 'fill-current' : ''}`} />
          </motion.button>
        )}
      </FocusScope>
    </div>
  )
}
