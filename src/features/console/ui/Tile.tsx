import React from 'react'
import { Play, Star, Download, Sparkles, Clock } from 'lucide-react'
import { convertFileSrc } from '@tauri-apps/api/core'
import type { Game, HubGame } from '@/types/models'
import { formatPlaytime } from '@/features/library/utils/format'
import { useFocusable } from '../nav/FocusScope'

export interface ConsoleTileProps {
  id: string
  scopeId?: string
  game?: Game
  hubGame?: HubGame
  variant?: 'poster' | 'landscape' | 'square'
  badge?: string
  progress?: number
  isRunning?: boolean
  onSelect: () => void
  onFocusTile?: () => void
  onOptionsTile?: () => void
}

export function resolveConsoleMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null
  if (
    url.startsWith('http://') ||
    url.startsWith('https://') ||
    url.startsWith('data:') ||
    url.startsWith('asset:')
  ) {
    return url
  }
  try {
    return convertFileSrc(url)
  } catch {
    return url
  }
}

export const ConsoleTile: React.FC<ConsoleTileProps> = React.memo(
  ({
    id,
    scopeId,
    game,
    hubGame,
    variant = 'poster',
    badge,
    progress,
    isRunning,
    onSelect,
    onFocusTile,
    onOptionsTile,
  }) => {
    const { focusProps, isFocused } = useFocusable<HTMLButtonElement>({
      id,
      scopeId,
      onFocus: onFocusTile,
      onConfirm: onSelect,
      onOptions: onOptionsTile,
    })

    const dims =
      variant === 'landscape'
        ? 'w-[330px] h-[188px]'
        : variant === 'square'
          ? 'w-[205px] h-[205px]'
          : 'w-[215px] h-[312px]'

    const title = game?.name ?? hubGame?.name ?? 'Untitled'
    const rawCover =
      variant === 'landscape'
        ? (game?.banner_path ?? game?.background_path ?? game?.cover_path ?? hubGame?.backdrop_url ?? hubGame?.cover_url)
        : (game?.cover_path ?? hubGame?.cover_url)
    const imageSrc = resolveConsoleMediaUrl(rawCover)

    const score =
      game?.opencritic_score ??
      game?.metacritic_score ??
      hubGame?.opencritic_score ??
      hubGame?.metacritic_score ??
      (hubGame?.rating ? Math.round(hubGame.rating) : null)

    const playtimeSeconds = game?.total_playtime_seconds ?? 0

    return (
      <button
        type="button"
        {...focusProps}
        onContextMenu={(e) => {
          e.preventDefault()
          onOptionsTile?.()
        }}
        className={`group relative shrink-0 rounded-2xl overflow-hidden text-left transition-all duration-200 select-none outline-none ${dims} ${
          isFocused
            ? 'scale-[1.08] z-20 ring-[3px] ring-cyan-400 shadow-[0_18px_45px_rgba(0,229,255,0.42)]'
            : 'scale-100 opacity-85 hover:opacity-100 ring-1 ring-white/10'
        }`}
      >
        {imageSrc ? (
          <img
            src={imageSrc}
            alt={title}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-slate-800 via-slate-900 to-black flex items-center justify-center p-5">
            <span className="text-lg font-bold text-white/85 text-center line-clamp-3">
              {title}
            </span>
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/30 to-transparent" />

        {/* Top badges */}
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-1.5 pointer-events-none">
          {isRunning ? (
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-400 text-slate-950 text-[11px] font-extrabold uppercase tracking-wider shadow">
              Running
            </span>
          ) : badge ? (
            <span className="px-2.5 py-0.5 rounded-full bg-cyan-400 text-slate-950 text-[11px] font-extrabold uppercase tracking-wider shadow">
              {badge}
            </span>
          ) : game?.is_favorite ? (
            <span className="p-1.5 rounded-full bg-amber-400/90 text-slate-950 shadow">
              <Star className="w-3.5 h-3.5 fill-current" />
            </span>
          ) : hubGame?.discount_percent ? (
            <span className="px-2 py-0.5 rounded-full bg-emerald-400 text-slate-950 text-[11px] font-extrabold">
              -{hubGame.discount_percent}%
            </span>
          ) : (
            <span />
          )}

          {score && score > 0 ? (
            <span className="px-2 py-0.5 rounded-lg bg-black/75 backdrop-blur-md border border-white/15 text-emerald-300 text-xs font-bold flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              {score}
            </span>
          ) : null}
        </div>

        {/* Bottom info */}
        <div className="absolute bottom-0 inset-x-0 p-3.5 flex flex-col gap-1">
          <div className="text-base font-extrabold text-white leading-tight line-clamp-1 drop-shadow">
            {title}
          </div>
          <div className="flex items-center justify-between text-xs text-slate-300/90">
            {game ? (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-cyan-400" />
                {formatPlaytime(playtimeSeconds)}
              </span>
            ) : (
              <span className="text-cyan-300 font-semibold">
                {hubGame?.sale_price_formatted || hubGame?.release_date || 'Store'}
              </span>
            )}
            {isFocused && (
              <span className="inline-flex items-center gap-1 text-cyan-300 font-bold">
                <Play className="w-3 h-3 fill-current" />
                Open
              </span>
            )}
          </div>

          {typeof progress === 'number' && progress >= 0 && (
            <div className="mt-1.5 w-full h-1.5 bg-white/15 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-400 to-violet-500 transition-all duration-300"
                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
              />
            </div>
          )}
        </div>

        {typeof progress === 'number' && (
          <div className="absolute top-3 right-3 p-1.5 rounded-full bg-cyan-400 text-slate-950">
            <Download className="w-3.5 h-3.5" />
          </div>
        )}
      </button>
    )
  },
)

ConsoleTile.displayName = 'ConsoleTile'
