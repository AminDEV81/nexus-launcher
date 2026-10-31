import React from 'react'
import { motion } from 'framer-motion'
import { Sparkles, Star } from 'lucide-react'
import { useAnimationSpeed } from '@/hooks/use-animation-speed'
import { convertFileSrc } from '@tauri-apps/api/core'
import type { Game, HubGame } from '@/types/models'
import { formatPlaytime, formatElapsed } from '@/features/library/utils/format'
import { useLaunchStore } from '@/store/launch-store'
import { useFocusable } from '../nav/FocusScope'
import { useConsoleStore } from '../store/console-store'
import { CONSOLE_THEMES } from '../theme/tokens'

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

/**
 * Upgrades IGDB & Steam artwork URLs to maximum 1080p HD quality (#8) so hovering/focusing a game
 * never displays a blurry low-resolution thumbnail in the backdrop or hero banner.
 */
export function resolveConsoleHighResUrl(url: string | null | undefined): string | null {
  const resolved = resolveConsoleMediaUrl(url)
  if (!resolved) return null
  if (resolved.includes('images.igdb.com/igdb/image/upload/')) {
    return resolved
      .replace('/t_thumb/', '/t_1080p/')
      .replace('/t_micro/', '/t_1080p/')
      .replace('/t_cover_small/', '/t_1080p/')
      .replace('/t_cover_big/', '/t_1080p/')
      .replace('/t_720p/', '/t_1080p/')
      .replace('/t_screenshot_med/', '/t_1080p/')
      .replace('/t_screenshot_big/', '/t_1080p/')
  }
  if (resolved.includes('shared.akamai.steamstatic.com') || resolved.includes('steamcdn-a.akamaihd.net')) {
    return resolved.replace('/capsule_616x353.jpg', '/library_hero.jpg')
  }
  return resolved
}

const SPRING = { type: 'spring', stiffness: 440, damping: 32, mass: 0.7 } as const

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
    const speed = useAnimationSpeed()
    const themeId = useConsoleStore((s) => s.theme)
    const elapsedSeconds = useLaunchStore((s) =>
      isRunning && game?.id ? (s.elapsedSeconds[game.id] ?? 0) : 0,
    )
    const isLight = Boolean(CONSOLE_THEMES[themeId]?.isLight)

    const { focusProps, isFocused } = useFocusable<HTMLButtonElement>({
      id,
      scopeId,
      onFocus: onFocusTile,
      onConfirm: onSelect,
      onOptions: onOptionsTile,
    })

    const dims =
      variant === 'landscape'
        ? 'w-[18.5rem] h-[10.5rem]'
        : variant === 'square'
          ? 'w-[11.5rem] h-[11.5rem]'
          : 'w-[12.2rem] h-[17.6rem]'

    const title = game?.name ?? hubGame?.name ?? 'Untitled'
    const rawCover =
      variant === 'landscape'
        ? (game?.banner_path ??
          game?.background_path ??
          game?.cover_path ??
          hubGame?.backdrop_url ??
          hubGame?.cover_url)
        : (game?.cover_path ?? hubGame?.cover_url)
    const imageSrc = resolveConsoleHighResUrl(rawCover)

    const score =
      game?.opencritic_score ??
      game?.metacritic_score ??
      hubGame?.opencritic_score ??
      hubGame?.metacritic_score ??
      (hubGame?.rating ? Math.round(hubGame.rating) : null)

    const caption = game
      ? game.total_playtime_seconds > 0
        ? formatPlaytime(game.total_playtime_seconds)
        : 'Ready to play'
      : hubGame?.sale_price_formatted || hubGame?.release_date || 'Store'
    const tag = badge ?? (hubGame?.discount_percent ? `-${hubGame.discount_percent}%` : undefined)
    const downloading = typeof progress === 'number' && progress >= 0

    return (
      <button
        type="button"
        {...focusProps}
        onContextMenu={(e) => {
          e.preventDefault()
          onOptionsTile?.()
        }}
        className={`group relative shrink-0 text-left select-none outline-none cursor-pointer ${dims}`}
      >
        {/* Light pool under the focused cover */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-x-3 -bottom-3 h-10 rounded-full blur-2xl"
          style={{ background: 'var(--console-ambient, #00e5ff)' }}
          initial={false}
          animate={{ opacity: isFocused ? 0.85 : 0, scale: isFocused ? 1.05 : 0.8 }}
          transition={{ duration: 0.28 * speed }}
        />

        <motion.div
          className={`absolute inset-0 overflow-hidden rounded-[1.15rem] transition-shadow ${
            isLight ? 'bg-slate-200 shadow-lg' : 'bg-[#141b2d] shadow-[0_12px_34px_-8px_rgba(0,0,0,0.75)]'
          } ${
            isFocused
              ? 'ring-[3px] ring-cyan-400 shadow-[0_18px_45px_rgba(0,229,255,0.38)]'
              : isLight
                ? 'ring-1 ring-slate-300'
                : 'ring-1 ring-white/15'
          }`}
          initial={false}
          animate={{ scale: isFocused ? 1.08 : 1, y: isFocused ? -7 : 0 }}
          transition={speed === 0 ? { duration: 0 } : SPRING}
          style={{ zIndex: isFocused ? 20 : 1 }}
        >
          {imageSrc ? (
            <img
              src={imageSrc}
              alt={title}
              decoding="async"
              draggable={false}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-end bg-gradient-to-br from-slate-700 via-slate-800 to-slate-950 p-4">
              <span className="line-clamp-3 text-[1.05rem] font-bold leading-snug text-white">
                {title}
              </span>
            </div>
          )}

          {/* Subtle bottom gradient for contrast */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />

          {/* Top-left & Top-right status pills */}
          <div className="pointer-events-none absolute inset-x-2.5 top-2.5 flex items-center justify-between gap-1">
            {isRunning ? (
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-400 px-2.5 py-0.5 text-[0.68rem] font-extrabold uppercase tracking-wider text-slate-950 shadow tabular-nums">
                <span className="size-1.5 rounded-full bg-slate-950 animate-ping" />
                Playing · {formatElapsed(elapsedSeconds)}
              </span>
            ) : tag ? (
              <span className="rounded-full bg-cyan-400 px-2.5 py-0.5 text-[0.7rem] font-extrabold text-slate-950 shadow">
                {tag}
              </span>
            ) : game?.is_favorite ? (
              <span className="rounded-full bg-amber-400/95 p-1.5 text-slate-950 shadow">
                <Star className="size-3 fill-current" />
              </span>
            ) : (
              <span />
            )}

            {score && score > 0 ? (
              <span className="flex items-center gap-1 rounded-lg border border-white/20 bg-black/75 px-2 py-0.5 text-[0.7rem] font-extrabold text-emerald-300 backdrop-blur-md">
                <Sparkles className="size-2.5" />
                {score}
              </span>
            ) : null}
          </div>

          {downloading && (
            <div className="absolute inset-x-3 bottom-3 h-1.5 overflow-hidden rounded-full bg-black/60">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-400 transition-[width] duration-300"
                style={{ width: `${Math.min(100, Math.max(0, progress ?? 0))}%` }}
              />
            </div>
          )}
        </motion.div>

        {/* Caption under the tile */}
        <motion.div
          className="pointer-events-none absolute inset-x-0 -bottom-[3.6rem] flex flex-col gap-0.5 px-1"
          initial={false}
          animate={{
            opacity: isFocused ? 1 : 0.65,
            y: isFocused ? 0 : -3,
          }}
          transition={{ duration: 0.18 * speed }}
        >
          <div
            className={`truncate text-[0.98rem] font-bold tracking-tight ${
              isLight ? 'text-slate-900' : 'text-white'
            }`}
          >
            {title}
          </div>
          <div
            className={`truncate text-[0.78rem] font-medium ${
              isFocused
                ? isLight
                  ? 'text-indigo-600'
                  : 'text-cyan-300'
                : isLight
                  ? 'text-slate-500'
                  : 'text-slate-400'
            }`}
          >
            {caption}
          </div>
        </motion.div>
      </button>
    )
  },
)

ConsoleTile.displayName = 'ConsoleTile'
