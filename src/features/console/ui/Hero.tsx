import React from 'react'
import { Play, Info, Sparkles, Clock, Disc3, Heart } from 'lucide-react'
import type { Game } from '@/types/models'
import { formatPlaytime } from '@/features/library/utils/format'
import { FocusScope, useFocusable } from '../nav/FocusScope'
import { Glyph } from './Glyph'
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
      <div className="relative w-full h-[300px] rounded-3xl overflow-hidden border border-white/10 bg-slate-900/60 flex items-center justify-center p-10">
        <div className="text-center max-w-md">
          <Disc3 className="w-12 h-12 text-cyan-400 mx-auto mb-3 animate-spin" />
          <h2 className="text-2xl font-extrabold text-white">Your Console Library Awaits</h2>
          <p className="text-sm text-slate-400 mt-2">
            Scan your PC drives or browse the Store tab to populate your Big Picture dashboard.
          </p>
        </div>
      </div>
    )
  }

  const backdrop = resolveConsoleMediaUrl(
    game.banner_path ?? game.background_path ?? game.cover_path,
  )
  const logoSrc = resolveConsoleMediaUrl(game.logo_path)
  const score = game.opencritic_score ?? game.metacritic_score

  return (
    <div className="relative w-full h-[350px] rounded-3xl overflow-hidden border border-white/15 shadow-2xl select-none">
      {backdrop ? (
        <img
          src={backdrop}
          alt={game.name}
          className="absolute inset-0 w-full h-full object-cover object-center scale-105 filter brightness-90 transition-all duration-700"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-950 via-slate-900 to-black" />
      )}

      <div className="absolute inset-0 bg-gradient-to-r from-slate-950/95 via-slate-950/75 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-black/30" />

      <div className="relative z-10 h-full flex flex-col justify-end p-8 md:p-10 max-w-3xl gap-3.5">
        <div className="flex flex-wrap items-center gap-2.5">
          {isRunning && (
            <span className="px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/50 text-emerald-300 text-xs font-extrabold uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              Running Now
            </span>
          )}
          {game.genres[0] && (
            <span className="px-3 py-1 rounded-full bg-white/10 backdrop-blur-md text-xs font-bold text-slate-200">
              {game.genres[0]}
            </span>
          )}
          {score && score > 0 ? (
            <span className="px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-xs font-bold flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" />
              Critic {score}
            </span>
          ) : null}
          <span className="px-3 py-1 rounded-full bg-white/10 backdrop-blur-md text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            {formatPlaytime(game.total_playtime_seconds)}
          </span>
        </div>

        {logoSrc ? (
          <img
            src={logoSrc}
            alt={game.name}
            className="max-h-16 max-w-sm object-contain object-left drop-shadow-xl"
          />
        ) : (
          <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight leading-none drop-shadow-lg line-clamp-1">
            {game.name}
          </h1>
        )}

        {game.description && (
          <p className="text-sm md:text-base text-slate-300/90 line-clamp-2 max-w-2xl leading-relaxed">
            {game.description.replace(/<[^>]+>/g, '')}
          </p>
        )}

        <FocusScope
          id="console_hero_scope"
          orientation="horizontal"
          className="flex items-center gap-4 pt-2"
        >
          <button
            type="button"
            {...playFocus.focusProps}
            className={`px-7 py-3.5 rounded-2xl font-extrabold text-base flex items-center gap-3 transition-all ${
              playFocus.isFocused
                ? 'bg-cyan-400 text-slate-950 scale-105 ring-4 ring-cyan-300/60 shadow-[0_0_35px_rgba(0,229,255,0.65)]'
                : 'bg-cyan-500/90 text-slate-950 hover:bg-cyan-400'
            }`}
          >
            <Play className="w-5 h-5 fill-current" />
            <span>{isRunning ? resumeLabel : playLabel}</span>
            <Glyph button="confirm" size="sm" />
          </button>

          <button
            type="button"
            {...detailsFocus.focusProps}
            className={`px-6 py-3.5 rounded-2xl font-bold text-base flex items-center gap-2.5 transition-all border ${
              detailsFocus.isFocused
                ? 'bg-white/20 text-white border-cyan-400 scale-105 ring-4 ring-cyan-400/40'
                : 'bg-white/10 text-slate-200 border-white/15 hover:bg-white/15'
            }`}
          >
            <Info className="w-5 h-5 text-cyan-300" />
            <span>{detailsLabel}</span>
          </button>

          {onToggleFavorite && (
            <button
              type="button"
              {...favFocus.focusProps}
              className={`p-3.5 rounded-2xl border transition-all ${
                favFocus.isFocused
                  ? 'bg-amber-400/25 border-amber-300 text-amber-300 scale-105 ring-4 ring-amber-400/30'
                  : 'bg-white/10 border-white/15 text-slate-300'
              }`}
            >
              <Heart className={`w-5 h-5 ${game.is_favorite ? 'fill-amber-400 text-amber-400' : ''}`} />
            </button>
          )}
        </FocusScope>
      </div>
    </div>
  )
}
