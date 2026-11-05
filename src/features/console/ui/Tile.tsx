import React, { useEffect, useMemo, useState } from 'react'
import { Clock, Sparkles, Star } from 'lucide-react'
import { convertFileSrc } from '@tauri-apps/api/core'
import type { Game, HubGame } from '@/types/models'
import { formatPlaytime, formatElapsed, isGameUnreleased } from '@/features/library/utils/format'
import {
  buildBannerFallbackChain,
  buildCoverFallbackChain,
} from '@/features/hub/utils/cover-fallback'
import { useLaunchStore } from '@/store/launch-store'
import { useFocusable } from '../nav/FocusScope'
import { useConsoleStore } from '../store/console-store'
import { CONSOLE_THEMES } from '../theme/tokens'
import { formatCompactCountdown } from './ReleaseCountdownBanner'

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
  const clean = url.trim()
  if (!clean) return null
  if (clean.startsWith('//')) {
    return `https:${clean}`
  }
  if (
    clean.startsWith('http://') ||
    clean.startsWith('https://') ||
    clean.startsWith('data:') ||
    clean.startsWith('asset:')
  ) {
    return clean
  }
  try {
    return convertFileSrc(clean)
  } catch {
    return clean
  }
}

/**
 * Upgrades IGDB artwork URLs to 1080p HD quality for full-bleed
 * widescreen Backdrops and Hero banners without mutating signed Steam CDN URLs.
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
      .replace('/t_cover_big_2x/', '/t_1080p/')
      .replace('/t_720p/', '/t_1080p/')
      .replace('/t_screenshot_med/', '/t_1080p/')
      .replace('/t_screenshot_big/', '/t_1080p/')
  }
  if (resolved.includes('steamstatic.com') && /\.\d+x\d+\.jpg/i.test(resolved)) {
    return resolved.replace(/\.\d+x\d+\.jpg/i, '.1920x1080.jpg')
  }
  return resolved
}

/**
 * Right-sized cover URL resolver for poster/square tiles (`11rem x 16rem`) so 100+ tiles
 * don't decode 1080p textures into GPU VRAM, keeping Console Mode fast and lightweight.
 */
function resolveConsoleTileCoverUrl(
  url: string | null | undefined,
  variant: 'poster' | 'landscape' | 'square',
): string | null {
  if (variant === 'landscape') {
    return resolveConsoleHighResUrl(url)
  }
  const resolved = resolveConsoleMediaUrl(url)
  if (!resolved) return null
  if (resolved.includes('images.igdb.com/igdb/image/upload/')) {
    return resolved
      .replace('/t_thumb/', '/t_cover_big/')
      .replace('/t_micro/', '/t_cover_big/')
      .replace('/t_cover_small/', '/t_cover_big/')
  }
  return resolved
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
        ? 'w-[16.5rem] h-[9.4rem]'
        : variant === 'square'
          ? 'w-[10.5rem] h-[10.5rem]'
          : 'w-[11rem] h-[16rem]'

    const title = game?.name ?? hubGame?.name ?? 'Untitled'
    const normTitle = title.trim().toLowerCase()
    const isGta6 =
      normTitle === 'grand theft auto vi' ||
      normTitle === 'grand theft auto 6' ||
      normTitle === 'gta 6' ||
      normTitle === 'gta vi'
    const primaryCover = isGta6
      ? variant === 'landscape'
        ? 'https://images.igdb.com/igdb/image/upload/t_1080p/scq3y1.jpg'
        : 'https://images.igdb.com/igdb/image/upload/t_cover_big_2x/co9rwo.jpg'
      : variant === 'landscape'
        ? (game?.banner_path ??
          game?.background_path ??
          game?.cover_path ??
          hubGame?.backdrop_url ??
          hubGame?.cover_url)
        : (game?.cover_path ?? hubGame?.cover_url ?? hubGame?.backdrop_url)
    const secondaryBackdrop = isGta6
      ? 'https://images.igdb.com/igdb/image/upload/t_1080p/scq3y1.jpg'
      : (game?.background_path ?? game?.banner_path ?? hubGame?.backdrop_url ?? hubGame?.cover_url)
    const steamAppId = isGta6 ? null : (game?.steam_app_id ?? hubGame?.steam_app_id)
    const igdbId = game?.igdb_id ?? hubGame?.igdb_id

    const coverCandidates = useMemo(() => {
      const chain =
        variant === 'landscape'
          ? buildBannerFallbackChain(
              resolveConsoleTileCoverUrl(primaryCover, variant),
              resolveConsoleTileCoverUrl(secondaryBackdrop, variant),
              steamAppId,
              igdbId,
            )
          : buildCoverFallbackChain(
              resolveConsoleTileCoverUrl(primaryCover, variant),
              resolveConsoleTileCoverUrl(secondaryBackdrop, variant),
              steamAppId,
              igdbId,
            )
      const rawResolved = resolveConsoleMediaUrl(primaryCover)
      if (rawResolved && !chain.includes(rawResolved)) {
        chain.splice(1, 0, rawResolved)
      }
      return chain
    }, [primaryCover, secondaryBackdrop, steamAppId, igdbId, variant])

    const [coverIdx, setCoverIdx] = useState(0)
    useEffect(() => {
      setCoverIdx(0)
    }, [primaryCover, secondaryBackdrop, steamAppId, igdbId])

    const imageSrc = coverCandidates[coverIdx] ?? null

    const releaseDate = game?.release_date ?? hubGame?.release_date ?? null
    const unreleased = isGameUnreleased(releaseDate)
    const countdownLabel = useMemo(
      () => (unreleased ? formatCompactCountdown(releaseDate) : null),
      [unreleased, releaseDate],
    )

    const score =
      game?.opencritic_score ??
      game?.metacritic_score ??
      hubGame?.opencritic_score ??
      hubGame?.metacritic_score ??
      (hubGame?.rating ? Math.round(hubGame.rating) : null)

    const caption = countdownLabel
      ? `Releases in ${countdownLabel}`
      : game
        ? game.total_playtime_seconds > 0
          ? formatPlaytime(game.total_playtime_seconds)
          : game.is_wishlist
            ? releaseDate || 'Wishlisted'
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
        {/* Only mount the ambient light pool when this tile is actually focused to save GPU blur layers! */}
        {isFocused && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-3 -bottom-3 h-8 rounded-full opacity-80 blur-xl"
            style={{ background: 'var(--console-ambient, #00e5ff)' }}
          />
        )}

        <div
          className={`absolute inset-0 overflow-hidden rounded-[1.15rem] transition-transform duration-150 ease-out ${
            isLight
              ? 'bg-slate-200 shadow-[0_12px_26px_-8px_rgba(15,23,42,0.28)]'
              : 'bg-[#141b2d] shadow-[0_10px_28px_-8px_rgba(0,0,0,0.75)]'
          } ${
            isFocused
              ? isLight
                ? 'z-20 -translate-y-1.5 scale-[1.07] ring-[3px] ring-indigo-600 shadow-[0_18px_40px_rgba(79,70,229,0.35)]'
                : 'z-20 -translate-y-1.5 scale-[1.07] ring-[3px] ring-cyan-400 shadow-[0_16px_38px_rgba(0,229,255,0.34)]'
              : isLight
                ? 'z-1 ring-1 ring-slate-300/90'
                : 'z-1 ring-1 ring-white/15'
          }`}
        >
          {imageSrc ? (
            <img
              src={imageSrc}
              alt={title}
              loading="lazy"
              decoding="async"
              draggable={false}
              onError={() => setCoverIdx((prev) => prev + 1)}
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
            ) : countdownLabel ? (
              <span className="flex items-center gap-1 rounded-full bg-amber-400/95 px-2.5 py-0.5 text-[0.68rem] font-extrabold text-slate-950 shadow tabular-nums">
                <Clock className="size-2.5" />
                {countdownLabel}
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

            {score && score > 0 && !unreleased ? (
              <span className="flex items-center gap-1 rounded-lg border border-white/20 bg-black/80 px-2 py-0.5 text-[0.7rem] font-extrabold text-emerald-300">
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
        </div>

        {/* Caption under the tile */}
        <div
          className={`pointer-events-none absolute inset-x-0 -bottom-[3.6rem] flex flex-col gap-0.5 px-1 transition-opacity duration-150 ${
            isFocused ? 'opacity-100' : isLight ? 'opacity-85' : 'opacity-65'
          }`}
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
                  ? 'text-indigo-700 font-bold'
                  : 'text-cyan-300'
                : countdownLabel
                  ? isLight
                    ? 'text-amber-700 font-bold'
                    : 'text-amber-300 font-bold'
                  : isLight
                    ? 'text-slate-600'
                    : 'text-slate-400'
            }`}
          >
            {caption}
          </div>
        </div>
      </button>
    )
  },
)

ConsoleTile.displayName = 'ConsoleTile'
