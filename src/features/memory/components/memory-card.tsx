import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Clock,
  RotateCcw,
  Trash2,
  Star,
  Image as ImageIcon,
  Sparkles,
  BarChart3,
  Calendar,
  Layers,
  Award,
  ChevronRight,
  X,
  PencilLine,
} from 'lucide-react'
import { assetUrl } from '@/lib/asset-url'
import { CoverMedia } from '@/components/ui/cover-media'
import { formatPlaytimeCompact, formatRelativeDate } from '@/features/library/utils/format'
import { resolveClientCriticScores } from '@/features/hub/utils/score'
import { useAnimationSpeed } from '@/hooks/use-animation-speed'
import { playButtonClick, playCardHover } from '@/lib/sound-engine'
import { useSetGameUserRating } from '@/features/library/hooks/use-games'
import { cn } from '@/lib/utils'
import type { Game } from '@/types/models'

interface MemoryCardProps {
  game: Game
  onChangeCover: (game: Game) => void
  onEditPlaytime: (game: Game) => void
  onEditName?: (game: Game) => void
  onRestore: (game: Game) => void
  onDelete: (game: Game) => void
  isRestoring?: boolean
}

function getMilestone(seconds: number) {
  const hours = seconds / 3600
  if (hours >= 100) {
    return {
      tier: 'Legend',
      nextHours: 100,
      percent: 100,
      badgeColor: 'text-amber-500 dark:text-amber-300 border-amber-500/40 bg-amber-500/15',
      barGradient: 'from-amber-400 to-yellow-500',
    }
  }
  if (hours >= 50) {
    return {
      tier: 'Master',
      nextHours: 100,
      percent: Math.min(100, Math.round((hours / 100) * 100)),
      badgeColor: 'text-purple-500 dark:text-purple-300 border-purple-500/40 bg-purple-500/15',
      barGradient: 'from-purple-400 to-amber-400',
    }
  }
  if (hours >= 25) {
    return {
      tier: 'Veteran',
      nextHours: 50,
      percent: Math.min(100, Math.round((hours / 50) * 100)),
      badgeColor: 'text-cyan-600 dark:text-cyan-300 border-cyan-500/40 bg-cyan-500/15',
      barGradient: 'from-cyan-400 to-blue-500',
    }
  }
  if (hours >= 10) {
    return {
      tier: 'Dedicated',
      nextHours: 25,
      percent: Math.min(100, Math.round((hours / 25) * 100)),
      badgeColor: 'text-emerald-600 dark:text-emerald-300 border-emerald-500/40 bg-emerald-500/15',
      barGradient: 'from-emerald-400 to-teal-500',
    }
  }
  return {
    tier: 'Explorer',
    nextHours: 10,
    percent: Math.max(6, Math.min(100, Math.round((hours / 10) * 100))),
    badgeColor: 'text-accent border-accent/40 bg-accent/15',
    barGradient: 'from-accent to-cyan-500',
  }
}

export function MemoryCard({
  game,
  onChangeCover,
  onEditPlaytime,
  onEditName,
  onRestore,
  onDelete,
  isRestoring = false,
}: MemoryCardProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [showDossier, setShowDossier] = useState(false)
  const [ratingHover, setRatingHover] = useState<number | null>(null)

  const speed = useAnimationSpeed()
  const setRating = useSetGameUserRating()
  const coverSrc = assetUrl(game.cover_path)
  const milestone = useMemo(
    () => getMilestone(game.total_playtime_seconds),
    [game.total_playtime_seconds],
  )
  const releaseYear = game.release_date ? game.release_date.split('-')[0] : null
  const criticScores = useMemo(
    () =>
      resolveClientCriticScores(
        game.name,
        game.release_date,
        game.metacritic_score,
        game.opencritic_score,
        null,
      ),
    [game.name, game.release_date, game.metacritic_score, game.opencritic_score],
  )

  const handleRate = (stars: number) => {
    playButtonClick()
    const score = stars * 2
    const newRating = game.user_rating === score ? null : score
    setRating.mutate({ id: game.id, rating: newRating })
  }

  return (
    <motion.div
      onMouseEnter={() => {
        setIsHovered(true)
        playCardHover()
      }}
      onMouseLeave={() => {
        setIsHovered(false)
        setRatingHover(null)
      }}
      whileHover={{ y: -5 }}
      transition={{ type: 'spring', stiffness: 380, damping: 26, duration: 0.22 * speed }}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-border/85 bg-surface shadow-sm transition-all duration-200 hover:border-amber-500/60 hover:shadow-xl"
    >
      {/* Specular Top Border Highlight */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 h-px bg-gradient-to-r from-transparent via-amber-400/45 to-transparent" />

      {/* Main 3:4 Poster Container with Flip Support */}
      <div className="relative aspect-[3/4] w-full overflow-hidden bg-surface-raised">
        <AnimatePresence mode="wait">
          {!showDossier ? (
            /* FRONT FACE: Artwork Poster View */
            <motion.div
              key="front"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 * speed }}
              className="relative size-full"
            >
              {(() => {
                const fallbackPlaceholder = (
                  <div className="flex size-full flex-col items-center justify-center gap-2.5 bg-gradient-to-br from-surface-raised via-surface to-surface-raised p-4 text-center">
                    <div className="flex size-12 items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-500 shadow-xs">
                      <Sparkles className="size-6" />
                    </div>
                    <span className="line-clamp-2 px-1 text-xs font-extrabold text-text">
                      {game.name}
                    </span>
                    <span className="text-[10px] text-subtle">
                      {game.genres.length > 0 ? game.genres.slice(0, 2).join(' • ') : 'Memory Vault'}
                    </span>
                  </div>
                )

                return coverSrc ? (
                  <CoverMedia
                    src={coverSrc}
                    className="size-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                    isAnimated={game.cover_is_animated}
                    animatedEnabled={game.animated_cover_enabled}
                    hovered={isHovered}
                    fallback={fallbackPlaceholder}
                  />
                ) : (
                  fallbackPlaceholder
                )
              })()}

              {/* Contrast Vignettes */}
              <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/75 via-black/25 to-transparent" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />

              {/* Top Badges */}
              <div className="pointer-events-none absolute inset-x-2.5 top-2.5 z-20 flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-1 rounded-full border border-amber-400/40 bg-black/75 px-2 py-0.5 text-[10px] font-bold tracking-wider text-amber-300 shadow-xs">
                  <Award className="size-2.5 text-amber-400" />
                  <span>{milestone.tier}</span>
                </div>

                <div className="flex items-center gap-1">
                  {criticScores.metacritic && (
                    <div
                      className={cn(
                        'rounded-md px-1.5 py-0.5 font-mono text-[9px] font-black text-white shadow-xs',
                        criticScores.metacritic >= 75
                          ? 'bg-emerald-600'
                          : criticScores.metacritic >= 50
                            ? 'bg-amber-600'
                            : 'bg-rose-600',
                      )}
                      title={`Metacritic: ${criticScores.metacritic}`}
                    >
                      MC {criticScores.metacritic}
                    </div>
                  )}

                  {game.user_rating !== null && (
                    <div className="flex items-center gap-0.5 rounded-full border border-amber-400/40 bg-black/75 px-1.5 py-0.5 text-[10px] font-bold text-amber-300 shadow-xs">
                      <Star className="size-2.5 fill-amber-400 text-amber-400" />
                      <span>{game.user_rating}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Hover Action Dock */}
              <div
                className={cn(
                  'absolute inset-0 z-20 flex flex-col justify-end bg-gradient-to-t from-black/90 via-black/50 to-transparent p-3 transition-opacity duration-200',
                  isHovered ? 'opacity-100' : 'opacity-0 pointer-events-none',
                )}
              >
                <div className="flex flex-col gap-2">
                  {/* Primary Actions Row */}
                  <div className="flex items-center justify-between gap-1.5 rounded-xl border border-white/15 bg-black/80 p-1.5 shadow-lg">
                    {/* Restore Button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        playButtonClick()
                        onRestore(game)
                      }}
                      disabled={isRestoring}
                      title="Restore to Active Library"
                      className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-amber-500 px-2 py-1.5 text-xs font-extrabold text-black transition-all hover:bg-amber-400 active:scale-95 disabled:opacity-50 cursor-pointer"
                    >
                      <RotateCcw className="size-3" />
                      <span>Restore</span>
                    </button>

                    {/* Flip / Dossier Button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        playButtonClick()
                        setShowDossier(true)
                      }}
                      title="Archive Dossier & Stats"
                      className="flex size-7 items-center justify-center rounded-lg border border-white/15 bg-white/10 text-cyan-300 transition-all hover:bg-white/20 active:scale-95 cursor-pointer"
                    >
                      <BarChart3 className="size-3.5" />
                    </button>

                    {/* Change Cover Art Button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        playButtonClick()
                        onChangeCover(game)
                      }}
                      title="Change Cover Art"
                      className="flex size-7 items-center justify-center rounded-lg border border-white/15 bg-white/10 text-white transition-all hover:bg-white/20 active:scale-95 cursor-pointer"
                    >
                      <ImageIcon className="size-3.5" />
                    </button>

                    {/* Edit Playtime Button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        playButtonClick()
                        onEditPlaytime(game)
                      }}
                      title="Edit Playtime"
                      className="flex size-7 items-center justify-center rounded-lg border border-white/15 bg-white/10 text-white transition-all hover:bg-white/20 active:scale-95 cursor-pointer"
                    >
                      <Clock className="size-3.5" />
                    </button>

                    {/* Delete Permanently Button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        playButtonClick()
                        onDelete(game)
                      }}
                      title="Permanently Delete"
                      className="flex size-7 items-center justify-center rounded-lg border border-rose-500/40 bg-rose-500/20 text-rose-300 transition-all hover:bg-rose-500/35 active:scale-95 cursor-pointer"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
            /* BACK FACE: Archive Dossier & Stats View */
            <motion.div
              key="back"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.18 * speed }}
              className="relative flex size-full flex-col justify-between overflow-y-auto bg-surface p-3 text-text select-none"
            >
              {/* Dossier Header */}
              <div className="flex items-center justify-between border-b border-border/70 pb-2">
                <div className="flex items-center gap-1.5 text-[10px] font-extrabold tracking-wider text-amber-500 dark:text-amber-400">
                  <Sparkles className="size-3" />
                  <span>MEMORY DOSSIER</span>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    playButtonClick()
                    setShowDossier(false)
                  }}
                  title="Close Dossier"
                  className="flex size-6 items-center justify-center rounded-lg border border-border bg-surface-raised text-muted transition-colors hover:text-text cursor-pointer"
                >
                  <X className="size-3.5" />
                </button>
              </div>

              {/* Stats Body */}
              <div className="flex flex-col gap-2.5 py-2">
                <div className="flex flex-col rounded-xl border border-amber-500/25 bg-amber-500/10 p-2.5">
                  <div className="flex items-center justify-between text-[10px] text-subtle font-semibold">
                    <span className="flex items-center gap-1 text-text">
                      <Clock className="size-3 text-amber-500" />
                      Total Playtime
                    </span>
                    <span
                      className={cn(
                        'rounded-full border px-1.5 py-0.5 text-[9px] font-bold',
                        milestone.badgeColor,
                      )}
                    >
                      {milestone.tier}
                    </span>
                  </div>
                  <div className="mt-1 font-mono text-base font-black text-text">
                    {formatPlaytimeCompact(game.total_playtime_seconds)}
                  </div>
                </div>

                {/* Session Dates */}
                <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                  <div className="flex flex-col rounded-lg border border-border/70 bg-surface-raised p-2">
                    <span className="text-[9px] text-muted flex items-center gap-1">
                      <Calendar className="size-2.5" /> Last Played
                    </span>
                    <span className="truncate font-bold text-text mt-0.5">
                      {game.last_played_at ? formatRelativeDate(game.last_played_at) : 'Never'}
                    </span>
                  </div>
                  <div className="flex flex-col rounded-lg border border-border/70 bg-surface-raised p-2">
                    <span className="text-[9px] text-muted flex items-center gap-1">
                      <Layers className="size-2.5" /> Source
                    </span>
                    <span className="truncate font-bold text-text uppercase mt-0.5">
                      {game.source || 'Custom'}
                    </span>
                  </div>
                </div>

                {/* Interactive Star Rating */}
                <div className="flex flex-col rounded-lg border border-border/70 bg-surface-raised p-2">
                  <div className="flex items-center justify-between text-[9px] font-bold text-subtle">
                    <span>Your Rating</span>
                    <span className="font-mono text-amber-500 dark:text-amber-400 font-bold">
                      {ratingHover !== null
                        ? `${ratingHover * 2}/10`
                        : game.user_rating !== null
                          ? `${game.user_rating}/10`
                          : 'Unrated'}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-center gap-1.5">
                    {[1, 2, 3, 4, 5].map((star) => {
                      const starValue = star * 2
                      const active =
                        ratingHover !== null
                          ? ratingHover >= star
                          : (game.user_rating ?? 0) >= starValue
                      return (
                        <button
                          key={star}
                          type="button"
                          onMouseEnter={() => setRatingHover(star)}
                          onMouseLeave={() => setRatingHover(null)}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleRate(star)
                          }}
                          className="p-0.5 transition-transform hover:scale-125 cursor-pointer"
                        >
                          <Star
                            className={cn(
                              'size-4 transition-colors',
                              active
                                ? 'fill-amber-400 text-amber-400'
                                : 'text-muted hover:text-amber-400/60',
                            )}
                          />
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Dossier Footer Back Action */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  playButtonClick()
                  setShowDossier(false)
                }}
                className="mt-1 flex w-full items-center justify-center gap-1 rounded-xl border border-amber-500/35 bg-amber-500/15 py-1.5 text-xs font-bold text-amber-600 dark:text-amber-300 transition-colors hover:bg-amber-500/25 cursor-pointer"
              >
                <span>Back to Cover</span>
                <ChevronRight className="size-3.5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Redesigned Theme-Adaptive Card Footer Pedestal */}
      <div className="flex flex-col gap-2 border-t border-border/75 bg-surface p-3 transition-colors">
        <div className="flex items-start justify-between gap-1.5">
          <div className="flex min-w-0 items-center gap-1.5 flex-1">
            <span
              className="truncate text-xs font-extrabold tracking-tight text-text transition-colors group-hover:text-amber-500"
              title={game.name}
            >
              {game.name}
            </span>
            {onEditName && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  playButtonClick()
                  onEditName(game)
                }}
                title="Rename Game"
                className="opacity-0 group-hover:opacity-100 text-muted hover:text-amber-500 transition-opacity p-0.5 rounded shrink-0 cursor-pointer"
              >
                <PencilLine className="size-3" />
              </button>
            )}
          </div>
          {releaseYear && (
            <span className="shrink-0 rounded-md border border-border/80 bg-surface-raised px-1.5 py-0.5 font-mono text-[9px] font-bold text-subtle">
              {releaseYear}
            </span>
          )}
        </div>

        {/* Playtime & Quick Restore Row */}
        <div className="flex items-center justify-between gap-2">
          <span
            className="inline-flex items-center gap-1 rounded-md border border-accent/25 bg-accent/10 px-2 py-0.5 font-mono text-[10px] font-bold text-accent"
            title={`Total Playtime: ${formatPlaytimeCompact(game.total_playtime_seconds)}`}
          >
            <Clock className="size-2.5" />
            <span>{formatPlaytimeCompact(game.total_playtime_seconds)}</span>
          </span>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              playButtonClick()
              onRestore(game)
            }}
            disabled={isRestoring}
            title="Restore game to active Library"
            className="inline-flex items-center gap-1 rounded-md border border-amber-500/35 bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-300 transition-colors hover:bg-amber-500/25 cursor-pointer"
          >
            <RotateCcw className="size-2.5" />
            <span>Restore</span>
          </button>
        </div>

        {/* Milestone Progress Bar */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-[9px] font-bold text-muted">
            <span>Mastery Rank</span>
            <span className="text-amber-600 dark:text-amber-400">{milestone.tier}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-raised border border-border/60">
            <div
              className={cn(
                'h-full rounded-full bg-gradient-to-r transition-all duration-500',
                milestone.barGradient,
              )}
              style={{ width: `${milestone.percent}%` }}
            />
          </div>
        </div>
      </div>
    </motion.div>
  )
}
