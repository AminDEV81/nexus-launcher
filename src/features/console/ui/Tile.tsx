import React from 'react'
import { motion } from 'framer-motion'
import { useAnimationSpeed } from '@/hooks/use-animation-speed'
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

const SPRING = { type: 'spring', stiffness: 440, damping: 32, mass: 0.7 } as const

/**
 * Minimal poster tile: artwork only. Everything secondary (title, playtime, price) appears under the
 * focused tile, so a row reads as a calm strip of covers and the focused one lifts out of it.
 */
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
          : 'w-[12rem] h-[17.5rem]'

    const title = game?.name ?? hubGame?.name ?? 'Untitled'
    const rawCover =
      variant === 'landscape'
        ? (game?.banner_path ??
          game?.background_path ??
          game?.cover_path ??
          hubGame?.backdrop_url ??
          hubGame?.cover_url)
        : (game?.cover_path ?? hubGame?.cover_url)
    const imageSrc = resolveConsoleMediaUrl(rawCover)

    const caption = game
      ? game.total_playtime_seconds > 0
        ? formatPlaytime(game.total_playtime_seconds)
        : 'Not played yet'
      : hubGame?.sale_price_formatted || hubGame?.release_date || ''
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
        className={`group relative shrink-0 text-left select-none outline-none ${dims}`}
      >
        {/* Light pool under the focused cover (opacity only, so it stays on the compositor) */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-x-4 -bottom-3 h-10 rounded-full blur-2xl"
          style={{ background: 'var(--console-ambient, #7dd3fc)' }}
          initial={false}
          animate={{ opacity: isFocused ? 0.75 : 0, scale: isFocused ? 1 : 0.8 }}
          transition={{ duration: 0.32 * speed }}
        />

        <motion.div
          className="absolute inset-0 overflow-hidden rounded-[1.1rem] bg-[#10121a] shadow-[0_10px_30px_-10px_rgba(0,0,0,0.8)]"
          initial={false}
          animate={{ scale: isFocused ? 1.085 : 1, y: isFocused ? -7 : 0 }}
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
            <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_30%_20%,#1c2233,#0b0d14)] p-5">
              <span className="line-clamp-3 text-center text-lg font-semibold text-white/80">
                {title}
              </span>
            </div>
          )}

          {/* Dims unfocused covers; the focused one is shown at full brightness */}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-black"
            initial={false}
            animate={{ opacity: isFocused ? 0 : 0.38 }}
            transition={{ duration: 0.25 * speed }}
          />
          <div className="pointer-events-none absolute inset-0 rounded-[1.1rem] ring-1 ring-inset ring-white/10" />
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-[1.1rem] ring-2 ring-inset ring-white/90"
            initial={false}
            animate={{ opacity: isFocused ? 1 : 0 }}
            transition={{ duration: 0.18 * speed }}
          />

          {isRunning ? (
            <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[0.7rem] font-medium text-white backdrop-blur-sm">
              <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" />
              Playing
            </span>
          ) : tag ? (
            <span className="absolute left-3 top-3 rounded-full bg-white px-2.5 py-1 text-[0.7rem] font-semibold text-black">
              {tag}
            </span>
          ) : null}

          {downloading && (
            <div className="absolute inset-x-0 bottom-0 h-1.5 bg-white/15">
              <div
                className="h-full bg-white transition-[width] duration-300"
                style={{ width: `${Math.min(100, Math.max(0, progress ?? 0))}%` }}
              />
            </div>
          )}
        </motion.div>

        {/* Caption under the focused tile */}
        <motion.div
          aria-hidden={!isFocused}
          className="pointer-events-none absolute inset-x-0 top-full mt-4 flex flex-col gap-0.5 px-1"
          initial={false}
          animate={{ opacity: isFocused ? 1 : 0, y: isFocused ? 0 : -6 }}
          transition={{ duration: 0.22 * speed }}
        >
          <span className="truncate text-[1.02rem] font-semibold leading-tight text-white">
            {title}
          </span>
          {caption && <span className="truncate text-[0.82rem] text-white/50">{caption}</span>}
        </motion.div>
      </button>
    )
  },
)

ConsoleTile.displayName = 'ConsoleTile'
