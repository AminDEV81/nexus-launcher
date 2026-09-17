import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowRight,
  Bookmark,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Gamepad2,
  Loader2,
  Pause,
  Play,
  Plus,
  Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useAppearanceSettingsStore } from '@/store/appearance-settings-store'
import { useWindowActive } from '@/hooks/use-window-active'
import { useAnimationSpeed } from '@/hooks/use-animation-speed'
import { formatReleaseDate, localDateKey } from '@/features/library/utils/format'
import { useStartDownloadModalStore } from '@/features/downloads/store/start-download-modal-store'
import { useAddGameFromHub, useAddGameToWishlist } from '../hooks/use-hub'
import { getGameTypeInfo } from '../utils/game-type'
import { HubScoreBadge } from './hub-score-badge'
import type { HubLibraryMatcher } from '../utils/in-library'
import type { HubGame } from '@/types/models'

const AUTO_ADVANCE_MS = 6000

export interface HubFeaturedHeroProps {
  games: HubGame[]
  inLibrary: HubLibraryMatcher
  inWishlist: HubLibraryMatcher
  isInstalled?: HubLibraryMatcher
}

export function HubFeaturedHero({
  games,
  inLibrary,
  inWishlist,
  isInstalled,
}: HubFeaturedHeroProps) {
  const [index, setIndex] = useState(0)
  const [hovering, setHovering] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const windowActive = useWindowActive()
  const reduceMotion = useAppearanceSettingsStore((s) => s.reduceMotion)
  const speed = useAnimationSpeed()
  const navigate = useNavigate()
  const addGame = useAddGameFromHub()
  const addToWishlist = useAddGameToWishlist()
  const openDownloadModal = useStartDownloadModalStore((s) => s.open)

  // Curate top 6 featured games for the interactive showcase
  const featuredGames = games.slice(0, 6)

  useEffect(() => {
    if (hovering || isPaused || !windowActive || reduceMotion || featuredGames.length < 2) return
    const timer = window.setInterval(
      () => setIndex((i) => (i + 1) % featuredGames.length),
      AUTO_ADVANCE_MS,
    )
    return () => window.clearInterval(timer)
  }, [hovering, isPaused, windowActive, reduceMotion, featuredGames.length])

  const game = featuredGames[Math.min(index, featuredGames.length - 1)]
  if (!game) return null

  const backdrop = game.backdrop_url ?? game.cover_url
  const isUnreleased = Boolean(game.release_date && game.release_date > localDateKey())
  const typeInfo = getGameTypeInfo(game.game_type)
  const installed = Boolean(isInstalled && isInstalled(game))
  const inLib = inLibrary(game)
  const inWish = inWishlist(game)

  return (
    <section
      className="relative flex flex-col gap-3 lg:grid lg:grid-cols-12 lg:gap-3.5"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      {/* Dynamic Ambient Spotlight Glow */}
      <div className="pointer-events-none absolute -inset-2 -z-10 rounded-[36px] bg-gradient-to-r from-accent/15 via-cyan-500/10 to-accent/15 opacity-60 transition-opacity duration-700" />

      {/* ── Main Hero Canvas ──────────────────────────────────────── */}
      <div className="group/hero relative h-[450px] sm:h-[490px] lg:col-span-8 lg:h-[510px] xl:col-span-9 overflow-hidden rounded-3xl border border-white/10 bg-surface/90 shadow-[0_20px_50px_rgba(0,0,0,0.6)]">
        {/* Dynamic Background Image with Smooth Cross-fade and Morph */}
        <AnimatePresence initial={false} mode="sync">
          <motion.div
            key={game.igdb_id}
            initial={{ opacity: 0, scale: 1.07 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.75 * speed, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-0 select-none"
          >
            {backdrop && (
              <img
                src={backdrop}
                alt=""
                className="size-full object-cover object-center"
                draggable={false}
              />
            )}
            {/* Cinematic Multi-layered Scrim */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/55 to-black/25" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/40 to-transparent" />
            <div className="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-3xl" />
          </motion.div>
        </AnimatePresence>

        {/* Top Header Bar inside Hero */}
        <div className="relative z-10 flex items-center justify-between p-5 sm:p-7">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-black/75 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white shadow-sm">
              <span className="size-2 rounded-full bg-accent" />
              <Sparkles className="size-3 text-accent" />
              <span>Spotlight</span>
            </span>

            {typeInfo && (
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm ring-1 ring-white/20',
                  typeInfo.bg,
                )}
              >
                {typeInfo.label}
              </span>
            )}

            {game.rating !== null && <HubScoreBadge variant="card" igdbRating={game.rating} />}
          </div>

          {/* Quick Navigation Controls */}
          <div className="flex items-center gap-1.5 rounded-2xl border border-white/15 bg-black/75 p-1">
            <button
              type="button"
              aria-label="Previous featured game"
              onClick={() => setIndex((i) => (i - 1 + featuredGames.length) % featuredGames.length)}
              className="flex size-7 items-center justify-center rounded-xl text-white/80 transition-all hover:bg-white/20 hover:text-white active:scale-95"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              aria-label={isPaused ? 'Resume autoplay' : 'Pause autoplay'}
              onClick={() => setIsPaused(!isPaused)}
              className="flex size-7 items-center justify-center rounded-xl text-white/80 transition-all hover:bg-white/20 hover:text-white active:scale-95"
            >
              {isPaused ? (
                <Play className="size-3.5 fill-current" />
              ) : (
                <Pause className="size-3.5" />
              )}
            </button>
            <button
              type="button"
              aria-label="Next featured game"
              onClick={() => setIndex((i) => (i + 1) % featuredGames.length)}
              className="flex size-7 items-center justify-center rounded-xl text-white/80 transition-all hover:bg-white/20 hover:text-white active:scale-95"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>

        {/* Bottom Hero Content with Smooth Morphing Transition */}
        <div className="absolute inset-x-0 bottom-0 z-10 p-5 sm:p-7">
          <AnimatePresence initial={false} mode="wait">
            <motion.div
              key={game.igdb_id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.38 * speed, ease: [0.16, 1, 0.3, 1] }}
              className="flex items-end gap-5"
            >
              {/* Floating Mini Cover */}
              {game.cover_url && (
                <div className="hidden sm:block shrink-0 overflow-hidden rounded-2xl border border-white/25 shadow-2xl transition-transform hover:scale-105">
                  <img
                    src={game.cover_url}
                    alt={game.name}
                    className="h-36 w-24 object-cover"
                    loading="lazy"
                  />
                </div>
              )}

              <div className="min-w-0 flex-1">
                {/* Meta Chips */}
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-white/80">
                  {game.release_date && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-0.5 text-[11px] font-medium text-white/90 backdrop-blur-sm">
                      <CalendarDays className="size-3 text-white/80" />
                      {formatReleaseDate(game.release_date)}
                    </span>
                  )}
                  {game.genres.map((genre) => (
                    <span
                      key={genre}
                      className="rounded-md border border-white/15 bg-white/10 px-2 py-0.5 text-[11px] font-medium text-white/90 backdrop-blur-sm"
                    >
                      {genre}
                    </span>
                  ))}
                  {game.platforms && game.platforms.length > 0 && (
                    <span className="rounded-md border border-white/15 bg-black/30 px-2 py-0.5 text-[10px] font-semibold text-white/70 backdrop-blur-sm">
                      {game.platforms.slice(0, 2).join(' • ')}
                    </span>
                  )}
                </div>

                {/* Title */}
                <h2 className="mt-2 text-2xl sm:text-3xl font-extrabold leading-tight tracking-tight text-white drop-shadow-md line-clamp-1">
                  {game.name}
                </h2>

                {/* Summary */}
                {game.summary && (
                  <p className="mt-2 line-clamp-2 text-xs sm:text-sm leading-relaxed text-white/75 max-w-xl drop-shadow-sm">
                    {game.summary}
                  </p>
                )}

                {/* Action Buttons Row */}
                <div className="mt-4 flex flex-wrap items-center gap-2.5">
                  {/* View Game */}
                  <button
                    type="button"
                    onClick={() => navigate(`/hub/${game.igdb_id}`)}
                    className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-xs sm:text-sm font-bold text-white shadow-[0_10px_24px_-8px_var(--nx-accent)] transition-all hover:bg-accent-hover hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <span>View Game</span>
                    <ArrowRight className="size-4" />
                  </button>

                  {/* Direct Download Action (released games that are NOT installed) */}
                  {!isUnreleased && !installed && (
                    <button
                      type="button"
                      onClick={() =>
                        openDownloadModal({
                          igdbId: game.igdb_id,
                          name: game.name,
                          coverUrl: game.cover_url,
                        })
                      }
                      className="inline-flex items-center gap-2 rounded-xl border border-white/25 bg-white/15 px-3.5 py-2 text-xs sm:text-sm font-semibold text-white backdrop-blur-md transition-all hover:bg-white/25 hover:border-white/40 active:scale-[0.98]"
                    >
                      <Download className="size-4 text-emerald-400" />
                      <span>Download</span>
                    </button>
                  )}

                  {/* Library / Wishlist / Installed Action */}
                  {installed ? (
                    <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-600/30 px-3 py-2 text-xs font-bold text-white backdrop-blur-md">
                      <Check className="size-3.5 text-emerald-400" strokeWidth={3} />
                      <span>Installed</span>
                    </span>
                  ) : inLib ? (
                    <span className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 bg-black/40 px-3 py-2 text-xs font-medium text-white backdrop-blur-md">
                      <Check className="size-3.5 text-accent" />
                      <span>In Library</span>
                    </span>
                  ) : inWish ? (
                    <span className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 bg-black/40 px-3 py-2 text-xs font-medium text-white backdrop-blur-md">
                      <Bookmark className="size-3.5 text-accent" />
                      <span>Wishlisted</span>
                    </span>
                  ) : isUnreleased ? (
                    <button
                      type="button"
                      disabled={addToWishlist.isPending}
                      onClick={() =>
                        addToWishlist.mutate(game.igdb_id, {
                          onSuccess: () =>
                            toast.success(`${game.name} was added to your wishlist.`),
                          onError: (error) => toast.error(error.message),
                        })
                      }
                      className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 bg-black/40 px-3 py-2 text-xs font-medium text-white backdrop-blur-md transition-colors hover:bg-black/60 disabled:opacity-50"
                    >
                      {addToWishlist.isPending ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Bookmark className="size-3.5" />
                      )}
                      <span>Wishlist</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={addGame.isPending}
                      onClick={() =>
                        addGame.mutate(game.igdb_id, {
                          onSuccess: () => toast.success(`${game.name} was added to your library.`),
                          onError: (error) => toast.error(error.message),
                        })
                      }
                      className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 bg-black/40 px-3 py-2 text-xs font-medium text-white backdrop-blur-md transition-colors hover:bg-black/60 disabled:opacity-50"
                    >
                      {addGame.isPending ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Plus className="size-3.5" />
                      )}
                      <span>Add to Library</span>
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* ── Interactive Preview Reel (Carousel Thumbnails) ───────── */}
      <div className="hidden lg:flex lg:col-span-4 xl:col-span-3 flex-col justify-between gap-1.5">
        {featuredGames.map((item, itemIndex) => {
          const isActive = itemIndex === index
          const itemCover = item.cover_url ?? item.backdrop_url

          return (
            <button
              key={item.igdb_id}
              type="button"
              onClick={() => setIndex(itemIndex)}
              className={cn(
                'group/item relative flex flex-1 items-center gap-3 overflow-hidden rounded-2xl border px-3 py-2 text-left transition-all',
                isActive
                  ? 'border-accent/60 bg-gradient-to-r from-accent/15 via-surface to-surface shadow-md'
                  : 'border-border/60 bg-surface/60 hover:border-border hover:bg-surface-raised/80',
              )}
            >
              {/* Morphing Active Card Highlight */}
              {isActive && (
                <motion.div
                  layoutId="active-hero-reel-highlight"
                  className="absolute inset-0 rounded-2xl border-2 border-accent bg-gradient-to-r from-accent/20 via-surface to-surface shadow-md"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}

              {/* Active Progress Bar Timer */}
              {isActive && !isPaused && !hovering && windowActive && !reduceMotion && (
                <motion.div
                  key={`progress-${item.igdb_id}-${itemIndex}`}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: AUTO_ADVANCE_MS / 1000, ease: 'linear' }}
                  className="absolute bottom-0 left-0 right-0 h-0.5 origin-left bg-accent shadow-[0_0_8px_var(--nx-accent)] z-10"
                />
              )}

              {/* Thumbnail Image */}
              <div className="relative size-11 shrink-0 overflow-hidden rounded-xl border border-border/80 bg-surface-raised z-10">
                {itemCover ? (
                  <img
                    src={itemCover}
                    alt={item.name}
                    className="size-full object-cover transition-transform group-hover/item:scale-110"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center text-subtle">
                    <Gamepad2 className="size-4" />
                  </div>
                )}
              </div>

              {/* Title & Info */}
              <div className="min-w-0 flex-1 z-10">
                <p
                  className={cn(
                    'truncate text-xs font-bold transition-colors',
                    isActive ? 'text-accent' : 'text-text group-hover/item:text-text',
                  )}
                >
                  {item.name}
                </p>
                <div className="mt-0.5 flex items-center gap-2 text-[10px] text-subtle">
                  {item.rating != null && (
                    <span className="flex items-center gap-0.5 font-semibold text-amber-400">
                      ★ {Math.round(item.rating)}%
                    </span>
                  )}
                  <span className="truncate">
                    {item.genres.length > 0 ? item.genres.join(' · ') : 'Game'}
                  </span>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Mobile/Tablet Pagination Dots */}
      <div className="flex lg:hidden items-center justify-center gap-1.5 py-1">
        {featuredGames.map((entry, entryIndex) => (
          <button
            key={entry.igdb_id}
            type="button"
            aria-label={`Show ${entry.name}`}
            onClick={() => setIndex(entryIndex)}
            className={cn(
              'h-1.5 rounded-full transition-all',
              entryIndex === index ? 'w-6 bg-accent' : 'w-1.5 bg-subtle/40 hover:bg-subtle',
            )}
          />
        ))}
      </div>
    </section>
  )
}
