import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Clock,
  RotateCcw,
  Trash2,
  Star,
  Image as ImageIcon,
  Pencil,
  Sparkles,
  BarChart3,
  Calendar,
  Layers,
  Award,
  ChevronRight,
  X,
} from 'lucide-react'
import { assetUrl } from '@/lib/asset-url'
import { CoverMedia } from '@/components/ui/cover-media'
import { formatPlaytimeCompact, formatRelativeDate } from '@/features/library/utils/format'
import { useAnimationSpeed } from '@/hooks/use-animation-speed'
import { playButtonClick, playCardHover } from '@/lib/sound-engine'
import { useSetGameUserRating } from '@/features/library/hooks/use-games'
import { cn } from '@/lib/utils'
import type { Game } from '@/types/models'

interface MemoryCardProps {
  game: Game
  onChangeCover: (game: Game) => void
  onEditPlaytime: (game: Game) => void
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
      badgeColor: 'text-amber-300 border-amber-400/40 bg-amber-500/10',
      barGradient: 'from-amber-400 to-yellow-500',
    }
  }
  if (hours >= 50) {
    return {
      tier: 'Master',
      nextHours: 100,
      percent: Math.min(100, Math.round((hours / 100) * 100)),
      badgeColor: 'text-purple-300 border-purple-400/40 bg-purple-500/10',
      barGradient: 'from-purple-400 to-amber-400',
    }
  }
  if (hours >= 25) {
    return {
      tier: 'Veteran',
      nextHours: 50,
      percent: Math.min(100, Math.round((hours / 50) * 100)),
      badgeColor: 'text-cyan-300 border-cyan-400/40 bg-cyan-500/10',
      barGradient: 'from-cyan-400 to-blue-500',
    }
  }
  if (hours >= 10) {
    return {
      tier: 'Dedicated',
      nextHours: 25,
      percent: Math.min(100, Math.round((hours / 25) * 100)),
      badgeColor: 'text-emerald-300 border-emerald-400/40 bg-emerald-500/10',
      barGradient: 'from-emerald-400 to-teal-500',
    }
  }
  return {
    tier: 'Casual',
    nextHours: 10,
    percent: Math.min(100, Math.round((hours / 10) * 100)),
    badgeColor: 'text-blue-300 border-blue-400/40 bg-blue-500/10',
    barGradient: 'from-blue-400 to-cyan-500',
  }
}

export function MemoryCard({
  game,
  onChangeCover,
  onEditPlaytime,
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

  const handleRate = (stars: number) => {
    playButtonClick()
    // 5-star scale mapped to 1-10 rating
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
      whileHover={{ y: -6, scale: 1.02 }}
      transition={{ type: 'spring', stiffness: 360, damping: 25, duration: 0.25 * speed }}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-border/90 bg-surface shadow-md transition-all duration-300 hover:border-amber-500/60 hover:shadow-2xl hover:shadow-amber-500/15 dark:border-amber-500/30 dark:bg-surface-raised dark:shadow-black/50"
    >
      {/* Specular Top Border Highlight */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 h-px bg-gradient-to-r from-transparent via-amber-300/40 to-transparent" />

      {/* Main 3:4 Poster Container with Flip Support */}
      <div className="relative aspect-3/4 w-full overflow-hidden bg-surface-raised">
        <AnimatePresence mode="wait">
          {!showDossier ? (
            /* FRONT FACE: Artwork Poster View */
            <motion.div
              key="front"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 * speed }}
              className="relative size-full"
            >
              {coverSrc ? (
                <CoverMedia
                  src={coverSrc}
                  className="size-full object-cover transition-transform duration-700 ease-out group-hover:scale-106"
                  isAnimated={game.cover_is_animated}
                  animatedEnabled={game.animated_cover_enabled}
                  hovered={isHovered}
                />
              ) : (
                <div className="flex size-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-surface-raised via-surface to-surface-raised p-4 text-center">
                  <Sparkles className="size-8 text-amber-400/40" />
                  <span className="text-xs font-bold text-muted">{game.name}</span>
                </div>
              )}

              {/* Pure black-based vignette (clean in both light & dark themes) */}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/35" />

              {/* Top Badges */}
              <div className="pointer-events-none absolute inset-x-2.5 top-2.5 z-20 flex items-center justify-between gap-1.5">
                {/* Vault Badge */}
                <div className="flex items-center gap-1 rounded-full border border-amber-400/35 bg-black/65 px-2 py-0.5 text-[10px] font-bold tracking-wider text-amber-300 shadow-sm backdrop-blur-xs">
                  <Sparkles className="size-2.5 text-amber-400" />
                  <span>VAULT</span>
                </div>

                {/* Right Badges: Metacritic / User Rating */}
                <div className="flex items-center gap-1">
                  {game.metacritic_score !== null && (
                    <div
                      className={cn(
                        'rounded-md border px-1.5 py-0.5 font-mono text-[9px] font-black shadow-sm backdrop-blur-xs',
                        game.metacritic_score >= 75
                          ? 'border-emerald-400/40 bg-black/70 text-emerald-300'
                          : game.metacritic_score >= 50
                            ? 'border-amber-400/40 bg-black/70 text-amber-300'
                            : 'border-red-400/40 bg-black/70 text-red-300',
                      )}
                      title={`Metacritic: ${game.metacritic_score}`}
                    >
                      {game.metacritic_score}
                    </div>
                  )}

                  {game.user_rating !== null && (
                    <div className="flex items-center gap-0.5 rounded-full border border-amber-500/35 bg-black/65 px-1.5 py-0.5 text-[10px] font-bold text-amber-400 shadow-sm backdrop-blur-xs">
                      <Star className="size-2.5 fill-amber-400 text-amber-400" />
                      <span>{game.user_rating}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Hover Action Dock */}
              <div
                className={cn(
                  'absolute inset-0 z-20 flex flex-col justify-end bg-gradient-to-t from-black/90 via-black/55 to-black/15 p-3 transition-opacity duration-200',
                  isHovered ? 'opacity-100' : 'opacity-0 pointer-events-none',
                )}
              >
                <div className="flex flex-col gap-2">
                  {/* Quick Milestone Pill on Hover */}
                  <div className="flex items-center justify-between text-[10px] text-amber-200/90 px-1 font-semibold">
                    <span className="flex items-center gap-1">
                      <Award className="size-3 text-amber-400" />
                      {milestone.tier}
                    </span>
                    <span className="text-[9px] text-white/60">
                      {formatPlaytimeCompact(game.total_playtime_seconds)}
                    </span>
                  </div>

                  {/* Primary Actions Row */}
                  <div className="flex items-center justify-between gap-1.5 rounded-2xl border border-white/15 bg-black/70 p-1.5 shadow-lg backdrop-blur-md">
                    {/* Restore Button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        playButtonClick()
                        onRestore(game)
                      }}
                      disabled={isRestoring}
                      title="Restore to Library"
                      className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-amber-400/40 bg-amber-500/25 px-2 py-1.5 text-xs font-bold text-amber-300 transition-all hover:bg-amber-500/40 hover:scale-[1.02] active:scale-95 disabled:opacity-50 cursor-pointer"
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
                      className="flex size-7 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white transition-all hover:bg-white/20 hover:scale-105 active:scale-95 cursor-pointer"
                    >
                      <BarChart3 className="size-3.5 text-cyan-300" />
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
                      className="flex size-7 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white transition-all hover:bg-white/20 hover:scale-105 active:scale-95 cursor-pointer"
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
                      className="flex size-7 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white transition-all hover:bg-white/20 hover:scale-105 active:scale-95 cursor-pointer"
                    >
                      <Pencil className="size-3.5" />
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
                      className="flex size-7 items-center justify-center rounded-xl border border-red-500/35 bg-red-500/20 text-red-300 transition-all hover:bg-red-500/30 hover:scale-105 active:scale-95 cursor-pointer"
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
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 * speed }}
              className="relative flex size-full flex-col justify-between overflow-y-auto bg-gradient-to-b from-surface-raised via-surface to-background p-3 text-text select-none"
            >
              {/* Dossier Header */}
              <div className="flex items-center justify-between border-b border-border/60 pb-2">
                <div className="flex items-center gap-1.5 text-[10px] font-bold tracking-wider text-amber-400">
                  <Sparkles className="size-3 text-amber-400" />
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
                  className="flex size-6 items-center justify-center rounded-lg border border-border bg-surface text-muted transition-colors hover:bg-surface-raised hover:text-text cursor-pointer"
                >
                  <X className="size-3.5" />
                </button>
              </div>

              {/* Stats Body */}
              <div className="flex flex-col gap-2.5 py-2">
                {/* Total Playtime & Tier */}
                <div className="flex flex-col rounded-xl border border-amber-500/20 bg-amber-500/5 p-2">
                  <div className="flex items-center justify-between text-[10px] text-subtle font-medium">
                    <span className="flex items-center gap-1 text-cyan-400">
                      <Clock className="size-3" />
                      Total Playtime
                    </span>
                    <span
                      className={cn(
                        'rounded-full border px-1.5 py-0.2 text-[9px] font-bold',
                        milestone.badgeColor,
                      )}
                    >
                      {milestone.tier}
                    </span>
                  </div>
                  <div className="mt-1 font-mono text-base font-black text-amber-300">
                    {formatPlaytimeCompact(game.total_playtime_seconds)}
                  </div>
                </div>

                {/* Session Dates */}
                <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                  <div className="flex flex-col rounded-lg border border-border/60 bg-surface/50 p-1.5">
                    <span className="text-[9px] text-muted flex items-center gap-1">
                      <Calendar className="size-2.5" /> Last Played
                    </span>
                    <span className="truncate font-semibold text-text mt-0.5">
                      {game.last_played_at ? formatRelativeDate(game.last_played_at) : 'Never'}
                    </span>
                  </div>
                  <div className="flex flex-col rounded-lg border border-border/60 bg-surface/50 p-1.5">
                    <span className="text-[9px] text-muted flex items-center gap-1">
                      <Layers className="size-2.5" /> Source
                    </span>
                    <span className="truncate font-semibold text-text uppercase mt-0.5">
                      {game.source || 'Custom'}
                    </span>
                  </div>
                </div>

                {/* Interactive Star Rating */}
                <div className="flex flex-col rounded-lg border border-border/60 bg-surface/50 p-2">
                  <div className="flex items-center justify-between text-[9px] font-medium text-subtle">
                    <span>Your Rating</span>
                    <span className="font-mono text-amber-400 font-bold">
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
                                ? 'fill-amber-400 text-amber-400 drop-shadow-sm'
                                : 'text-muted hover:text-amber-400/60',
                            )}
                          />
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Genres Tags */}
                {game.genres.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {game.genres.slice(0, 3).map((g) => (
                      <span
                        key={g}
                        className="rounded-md border border-border/60 bg-surface/60 px-1.5 py-0.5 text-[9px] font-medium text-subtle"
                      >
                        {g}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Dossier Footer Back Action */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  playButtonClick()
                  setShowDossier(false)
                }}
                className="mt-1 flex w-full items-center justify-center gap-1 rounded-xl border border-amber-500/30 bg-amber-500/15 py-1.5 text-xs font-bold text-amber-300 transition-colors hover:bg-amber-500/25 cursor-pointer"
              >
                <span>Back to Cover</span>
                <ChevronRight className="size-3.5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Info Card Footer Panel */}
      <div className="flex flex-col gap-2 border-t border-border/80 bg-slate-50/90 p-3.5 transition-colors group-hover:bg-slate-50 dark:border-white/10 dark:bg-[#15151c]/95 dark:group-hover:bg-[#181820]">
        {/* Title & Release Year Row */}
        <div className="flex items-start justify-between gap-1.5">
          <div
            className="truncate text-xs font-black tracking-tight text-text transition-colors group-hover:text-amber-600 dark:group-hover:text-amber-400"
            title={game.name}
          >
            {game.name}
          </div>
          {releaseYear && (
            <span className="shrink-0 rounded-md border border-border/80 bg-surface px-1.5 py-0.5 font-mono text-[10px] font-bold text-muted shadow-2xs dark:border-white/10 dark:bg-white/5 dark:text-subtle">
              {releaseYear}
            </span>
          )}
        </div>

        {/* Developer Line */}
        {game.developer && (
          <div
            className="truncate text-[11px] font-semibold text-muted dark:text-subtle"
            title={game.developer}
          >
            {game.developer}
          </div>
        )}

        {/* Playtime Badge & Last Played Date Row */}
        <div className="flex items-center justify-between gap-2 pt-0.5">
          {/* High-contrast Playtime Badge */}
          <span
            className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 font-mono text-[11px] font-black text-cyan-800 shadow-2xs dark:border-cyan-400/30 dark:bg-cyan-400/10 dark:text-cyan-300"
            title={`Total Playtime: ${formatPlaytimeCompact(game.total_playtime_seconds)}`}
          >
            <Clock className="size-3 text-cyan-600 dark:text-cyan-400" />
            <span>{formatPlaytimeCompact(game.total_playtime_seconds)}</span>
          </span>

          {/* Last Played Date */}
          {game.last_played_at && (
            <span
              className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 dark:text-slate-400"
              title={`Last Played: ${new Date(game.last_played_at).toLocaleDateString()}`}
            >
              <Calendar className="size-2.5 text-slate-400 dark:text-slate-500" />
              <span>{formatRelativeDate(game.last_played_at)}</span>
            </span>
          )}
        </div>

        {/* Milestone Progress Bar */}
        <div className="flex flex-col gap-1 pt-0.5">
          <div className="flex items-center justify-between text-[9px] font-bold text-slate-500 dark:text-slate-400">
            <span>Milestone</span>
            <span className="text-amber-600 dark:text-amber-400">{milestone.tier}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full border border-slate-200 bg-slate-200/80 dark:border-white/5 dark:bg-white/10">
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
