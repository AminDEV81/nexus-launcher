import React from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useAnimationSpeed } from '@/hooks/use-animation-speed'
import { Play, Square, Info, Heart, Music, Sparkles } from 'lucide-react'
import type { Game } from '@/types/models'
import { formatElapsed, formatPlaytime } from '@/features/library/utils/format'
import { useLaunchStore } from '@/store/launch-store'
import { FocusScope, useFocusable } from '../nav/FocusScope'
import { resolveConsoleHighResUrl } from './Tile'
import { useConsoleStore } from '../store/console-store'
import { CONSOLE_THEMES } from '../theme/tokens'

export interface ConsoleHeroProps {
  game: Game | null
  isRunning?: boolean
  playLabel: string
  resumeLabel: string
  detailsLabel: string
  onPlayOrResume: (game: Game) => void
  onOpenHub: (game: Game) => void
  onToggleFavorite?: (game: Game) => void
  onOpenSoundtrack?: (game: Game) => void
}

const SPRING = { type: 'spring', stiffness: 460, damping: 30, mass: 0.7 } as const

export const ConsoleHero: React.FC<ConsoleHeroProps> = ({
  game,
  isRunning = false,
  playLabel,
  resumeLabel: _resumeLabel,
  detailsLabel,
  onPlayOrResume,
  onOpenHub,
  onToggleFavorite,
  onOpenSoundtrack,
}) => {
  const speed = useAnimationSpeed()
  const themeId = useConsoleStore((s) => s.theme)
  const isLight = Boolean(CONSOLE_THEMES[themeId]?.isLight)
  const elapsedSeconds = useLaunchStore((s) => (game ? (s.elapsedSeconds[game.id] ?? 0) : 0))

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
  const ostFocus = useFocusable<HTMLButtonElement>({
    id: 'hero_Soundtrack_btn',
    scopeId: 'console_hero_scope',
    onConfirm: () => {
      if (game) {
        if (onOpenSoundtrack) onOpenSoundtrack(game)
        else useConsoleStore.getState().openGameSoundtrackInConsole({
          id: game.id,
          name: game.name,
          coverUrl: game.cover_path,
          steamAppId: game.steam_app_id,
          igdbId: game.igdb_id,
        })
      }
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
        <h1
          className={`text-[3.2rem] font-extrabold leading-none tracking-tight ${
            isLight ? 'text-slate-900' : 'text-white'
          }`}
        >
          Your library is empty
        </h1>
        <p className={`mt-3 text-lg ${isLight ? 'text-slate-600' : 'text-white/65'}`}>
          Add games from the desktop or browse the Store tab to get started.
        </p>
      </div>
    )
  }

  const logoSrc = resolveConsoleHighResUrl(game.logo_path)
  const score = game.opencritic_score ?? game.metacritic_score
  const meta = [game.genres.slice(0, 3).join(' · '), formatPlaytime(game.total_playtime_seconds)]
    .filter(Boolean)
    .join('   ·   ')

  return (
    <div className="flex min-h-[19rem] max-w-[50rem] select-none flex-col justify-end pb-4">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={`info_${game.id}`}
          className="flex flex-col gap-3.5"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.3 * speed, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="flex flex-wrap items-center gap-3 text-[0.95rem] font-semibold tracking-wide">
            {isRunning && (
              <span className="flex items-center gap-2 rounded-full bg-emerald-500/20 border border-emerald-400/40 px-3 py-0.5 text-emerald-300">
                <span className="size-2 animate-pulse rounded-full bg-emerald-400" />
                Playing now
              </span>
            )}
            {score && score > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 border border-emerald-400/40 px-3 py-0.5 text-xs font-extrabold text-emerald-300">
                <Sparkles className="size-3.5" />
                Critic {score}
              </span>
            ) : null}
            <span className={isLight ? 'text-slate-700' : 'text-slate-200/85'}>{meta}</span>
          </div>

          {logoSrc ? (
            <img
              src={logoSrc}
              alt={game.name}
              className="max-h-[5.8rem] max-w-[28rem] object-contain object-left drop-shadow-2xl"
            />
          ) : (
            <h1
              className={`line-clamp-2 text-[3.8rem] font-black leading-[1.02] tracking-tight ${
                isLight
                  ? 'text-slate-900'
                  : 'text-white [text-shadow:0_4px_36px_rgba(0,0,0,0.55)]'
              }`}
            >
              {game.name}
            </h1>
          )}

          {game.description && (
            <p
              className={`line-clamp-2 max-w-2xl text-[0.98rem] leading-relaxed ${
                isLight ? 'text-slate-700' : 'text-slate-200/85'
              }`}
            >
              {game.description.replace(/<[^>]+>/g, '')}
            </p>
          )}
        </motion.div>
      </AnimatePresence>

      <FocusScope
        id="console_hero_scope"
        orientation="horizontal"
        className="mt-6 flex flex-wrap items-center gap-3.5"
      >
        <motion.button
          type="button"
          {...playFocus.focusProps}
          animate={{ scale: playFocus.isFocused ? 1.06 : 1 }}
          transition={speed === 0 ? { duration: 0 } : SPRING}
          className={`flex items-center gap-3 rounded-full px-8 py-3.5 text-[1.08rem] font-extrabold outline-none transition-colors cursor-pointer ${
            isRunning
              ? playFocus.isFocused
                ? 'bg-rose-500 text-white shadow-[0_12px_40px_-6px_rgba(244,63,94,0.65)] ring-4 ring-rose-300/50'
                : 'bg-rose-500/90 text-white hover:bg-rose-500'
              : playFocus.isFocused
                ? 'bg-cyan-400 text-slate-950 shadow-[0_12px_40px_-6px_rgba(0,229,255,0.65)] ring-4 ring-cyan-300/50'
                : isLight
                  ? 'bg-slate-900 text-white hover:bg-slate-800'
                  : 'bg-white text-slate-950 hover:bg-cyan-300'
          }`}
        >
          {isRunning ? (
            <>
              <Square className="size-4 fill-current" />
              <span>Stop · {formatElapsed(elapsedSeconds)}</span>
            </>
          ) : (
            <>
              <Play className="size-5 fill-current" />
              <span>{playLabel}</span>
            </>
          )}
        </motion.button>

        <motion.button
          type="button"
          {...detailsFocus.focusProps}
          animate={{ scale: detailsFocus.isFocused ? 1.06 : 1 }}
          transition={speed === 0 ? { duration: 0 } : SPRING}
          className={`flex items-center gap-2.5 rounded-full px-6 py-3.5 text-[1.02rem] font-bold outline-none backdrop-blur-md transition-colors cursor-pointer ${
            detailsFocus.isFocused
              ? 'bg-cyan-400 text-slate-950 ring-4 ring-cyan-300/50'
              : isLight
                ? 'bg-white/90 text-slate-800 border border-slate-300 hover:bg-white'
                : 'bg-white/15 text-white border border-white/15 hover:bg-white/25'
          }`}
        >
          <Info className="size-5" />
          <span>{detailsLabel}</span>
        </motion.button>

        <motion.button
          type="button"
          {...ostFocus.focusProps}
          animate={{ scale: ostFocus.isFocused ? 1.06 : 1 }}
          transition={speed === 0 ? { duration: 0 } : SPRING}
          className={`flex items-center gap-2 rounded-full px-5 py-3.5 text-[1rem] font-bold outline-none backdrop-blur-md transition-colors cursor-pointer ${
            ostFocus.isFocused
              ? 'bg-violet-400 text-slate-950 ring-4 ring-violet-300/50'
              : isLight
                ? 'bg-white/90 text-slate-800 border border-slate-300 hover:bg-white'
                : 'bg-white/15 text-white border border-white/15 hover:bg-white/25'
          }`}
        >
          <Music className="size-4" />
          <span>Soundtrack</span>
        </motion.button>

        {onToggleFavorite && (
          <motion.button
            type="button"
            {...favFocus.focusProps}
            aria-label={game.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
            animate={{ scale: favFocus.isFocused ? 1.08 : 1 }}
            transition={speed === 0 ? { duration: 0 } : SPRING}
            className={`flex size-[3.3rem] items-center justify-center rounded-full outline-none backdrop-blur-md transition-colors cursor-pointer ${
              favFocus.isFocused
                ? 'bg-amber-400 text-slate-950 ring-4 ring-amber-300/50'
                : isLight
                  ? 'bg-white/90 text-slate-800 border border-slate-300'
                  : 'bg-white/15 text-white border border-white/15'
            }`}
          >
            <Heart
              className={`size-5 ${
                game.is_favorite ? 'fill-amber-400 text-amber-400' : ''
              }`}
            />
          </motion.button>
        )}
      </FocusScope>
    </div>
  )
}
