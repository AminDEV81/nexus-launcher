import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Bookmark,
  Building2,
  CalendarDays,
  Check,
  Download,
  ExternalLink,
  Gamepad2,
  Globe2,
  Layers,
  Loader2,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useAnimationSpeed } from '@/hooks/use-animation-speed'
import { useWindowActive } from '@/hooks/use-window-active'
import { formatReleaseDate } from '@/features/library/utils/format'
import { useStartDownloadModalStore } from '@/features/downloads/store/start-download-modal-store'
import { useUiStore } from '@/store/ui-store'
import { useAddGameFromHub, useAddGameToWishlist } from '../hooks/use-hub'
import { useRestoreGameFromMemory } from '@/features/library/hooks/use-games'
import { useGameAffinity } from '../hooks/use-personalization'
import { getGameTypeInfo } from '../utils/game-type'
import { buildCoverFallbackChain } from '../utils/cover-fallback'
import { HubScoreBadge } from './hub-score-badge'
import { HubSteamPriceBadge } from './hub-steam-price-badge'
import type { Game, HubGameDetails, HubVideo } from '@/types/models'

interface HubGameHeroProps {
  game: HubGameDetails
  libraryEntry?: Game
  inLibrary: boolean
  inWishlist: boolean
  isInstalled: boolean
  isMemory?: boolean
  isReleased: boolean
  allVideos: HubVideo[]
  onOpenTrailer: (index: number) => void
  onOpenRegionalPrice?: () => void
}

export function genreColor(genre: string): string {
  const hash = genre.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  const colors = [
    '#6366f1',
    '#3b82f6',
    '#10b981',
    '#f59e0b',
    '#ec4899',
    '#8b5cf6',
    '#06b6d4',
    '#f43f5e',
  ]
  return colors[hash % colors.length]
}

export function HubGameHero({
  game,
  libraryEntry,
  inLibrary,
  inWishlist,
  isInstalled,
  isMemory,
  isReleased,
  allVideos,
  onOpenTrailer,
  onOpenRegionalPrice,
}: HubGameHeroProps) {
  const navigate = useNavigate()
  const speed = useAnimationSpeed()
  const selectGame = useUiStore((s) => s.selectGame)
  const openDownloadModal = useStartDownloadModalStore((s) => s.open)
  const addGame = useAddGameFromHub()
  const addToWishlist = useAddGameToWishlist()
  const restoreMutation = useRestoreGameFromMemory()
  const affinity = useGameAffinity(game)

  const coverCandidates = useMemo(
    () => buildCoverFallbackChain(game.cover_url, game.backdrop_url, game.steam_app_id),
    [game.cover_url, game.backdrop_url, game.steam_app_id],
  )
  const [coverIdx, setCoverIdx] = useState(0)
  useEffect(() => {
    setCoverIdx(0)
  }, [game.igdb_id, game.cover_url, game.backdrop_url, game.steam_app_id])
  const activeCoverUrl = coverCandidates[coverIdx] ?? null

  const inMem = Boolean(isMemory || libraryEntry?.is_memory)
  const backdrop = game.backdrop_url ?? game.screenshot_urls[0] ?? activeCoverUrl ?? game.cover_url
  const typeInfo = getGameTypeInfo(game.game_type)

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28 * speed, ease: [0.16, 1, 0.3, 1] }}
      className="relative overflow-hidden rounded-3xl border border-border shadow-elevated"
    >
      <div className="relative flex min-h-[460px] flex-col justify-end pt-24 sm:min-h-[500px] lg:min-h-[540px]">
        {/* Backdrop Image */}
        {backdrop && (
          <img
            src={backdrop}
            alt=""
            className="nx-hero-zoom absolute inset-0 size-full scale-100 object-cover"
            draggable={false}
          />
        )}

        {/* Cinematic Multilayer Vignettes */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/95 via-black/70 to-black/25" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/90 via-black/50 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent opacity-70" />

        {/* Foreground Details Content (Flex-aligned so content never clips on tall titles/genre lists) */}
        <div className="relative z-10 flex flex-col gap-6 p-6 sm:flex-row sm:items-end sm:p-8 lg:p-10">
          {/* Cover Art Poster */}
          <div className="group relative w-36 shrink-0 overflow-hidden rounded-2xl border border-white/20 bg-black/50 shadow-2xl shadow-black/80 transition-transform duration-300 sm:w-48 lg:w-56">
            {activeCoverUrl ? (
              <img
                src={activeCoverUrl}
                alt={game.name}
                onError={() => setCoverIdx((prev) => prev + 1)}
                className="aspect-[3/4] w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
            ) : (
              <span className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-2 bg-surface-raised p-4 text-center">
                <Gamepad2 className="size-10 text-accent" />
                <span className="line-clamp-3 text-xs font-extrabold text-text">{game.name}</span>
              </span>
            )}

            {/* Cover Top Badges */}
            <div className="pointer-events-none absolute inset-x-2.5 top-2.5 flex items-center justify-between">
              {inMem ? (
                <span className="rounded-md border border-amber-400/40 bg-amber-500/95 px-2 py-0.5 text-[9px] font-bold tracking-wider text-black uppercase shadow-sm">
                  In Memory
                </span>
              ) : isInstalled ? (
                <span className="rounded-md bg-emerald-600 px-2 py-0.5 text-[9px] font-bold tracking-wider text-white uppercase shadow-sm">
                  Installed
                </span>
              ) : isReleased ? (
                <span className="rounded-md bg-blue-600/95 px-2 py-0.5 text-[9px] font-bold tracking-wider text-white uppercase shadow-sm">
                  Released
                </span>
              ) : (
                <span className="rounded-md bg-amber-500 px-2 py-0.5 text-[9px] font-bold tracking-wider text-black uppercase shadow-sm">
                  Upcoming
                </span>
              )}

              {allVideos.length > 0 && (
                <button
                  type="button"
                  onClick={() => onOpenTrailer(0)}
                  className="pointer-events-auto flex size-7 items-center justify-center rounded-lg bg-red-600 text-white shadow-md transition-transform hover:scale-110 active:scale-95 cursor-pointer"
                  title="Play Trailer"
                  aria-label="Play Trailer"
                >
                  <Play className="size-3.5 fill-current ml-0.5" />
                </button>
              )}
            </div>
          </div>

          {/* Game Text, Genres & Actions */}
          <div className="min-w-0 flex-1 space-y-3.5">
            {/* Title & Game Edition/Type Badge */}
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-black leading-tight tracking-tight text-white drop-shadow-md sm:text-4xl lg:text-5xl">
                {game.name}
              </h1>
              {typeInfo && (
                <span
                  className={cn(
                    'rounded-xl px-3 py-1 text-xs font-bold uppercase tracking-wider text-white shadow-md ring-1 ring-white/20',
                    typeInfo.bg,
                  )}
                >
                  {typeInfo.label}
                </span>
              )}
            </div>

            {/* Row 1: Release Date, Studio & Live Steam Price */}
            <div className="flex flex-wrap items-center gap-2.5 text-xs text-white/85">
              {game.release_date && (
                <span className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-black/45 px-3 py-1 font-medium backdrop-blur-md">
                  <CalendarDays className="size-3.5 text-accent" />
                  <span>{formatReleaseDate(game.release_date)}</span>
                </span>
              )}

              {game.developer && (
                <span className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-black/45 px-3 py-1 font-medium backdrop-blur-md">
                  <Building2 className="size-3.5 text-white/70" />
                  <span>{game.developer}</span>
                </span>
              )}

              {/* Steam Real-Time Regional Price Badge */}
              {game.steam_app_id && onOpenRegionalPrice && (
                <HubSteamPriceBadge
                  steamAppId={game.steam_app_id}
                  gameName={game.name}
                  onOpenRegionalModal={onOpenRegionalPrice}
                />
              )}
            </div>

            {/* Row 2: Critic Scores (Metacritic + OpenCritic + IGDB) & Nexus Match */}
            <div className="flex flex-wrap items-center gap-2.5">
              <HubScoreBadge
                variant="hero"
                metacriticScore={game.metacritic_score ?? libraryEntry?.metacritic_score}
                opencriticScore={game.opencritic_score ?? libraryEntry?.opencritic_score}
                igdbRating={game.rating}
                igdbRatingCount={game.rating_count}
                gameName={game.name}
                releaseDate={game.release_date}
              />

              {affinity && (
                <div
                  title={
                    affinity.breakdown?.highlightChips?.length
                      ? `${affinity.matchPercentage}% Match • ${affinity.breakdown.highlightChips.join(' • ')}`
                      : affinity.reason
                  }
                  className="inline-flex flex-wrap items-center gap-2 rounded-xl border border-violet-500/40 bg-gradient-to-r from-violet-600/35 via-violet-500/20 to-accent/15 px-3 py-1 text-xs shadow-xs backdrop-blur-md"
                >
                  <div className="flex items-center gap-1 text-violet-300">
                    <Sparkles className="size-3.5 fill-current" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">
                      Nexus Match
                    </span>
                  </div>
                  <span className="font-mono text-xs font-black text-white">
                    {affinity.matchPercentage}%
                  </span>
                  {affinity.breakdown?.highlightChips?.slice(0, 2).map((chip) => (
                    <span
                      key={chip}
                      className="hidden sm:inline-flex items-center rounded-md border border-violet-400/30 bg-violet-500/20 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-violet-200"
                    >
                      {chip}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Row 3: Complete & Organized Genres Strip */}
            {game.genres.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                <span className="mr-1 inline-flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-wider text-white/65">
                  <Layers className="size-3 text-accent" />
                  <span>Genres:</span>
                </span>
                {game.genres.map((genre) => {
                  const color = genreColor(genre)
                  return (
                    <span
                      key={genre}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white shadow-xs backdrop-blur-md transition-transform hover:scale-103"
                      style={{ borderColor: `${color}55` }}
                    >
                      <span
                        className="size-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }}
                      />
                      <span>{genre}</span>
                    </span>
                  )
                })}
              </div>
            )}

            {/* Countdown for Unreleased Titles */}
            {!isReleased && game.release_date && (
              <ReleaseCountdown releaseDate={game.release_date} />
            )}

            {/* Action Buttons Strip */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              {/* Primary Watch Trailer Button */}
              {allVideos.length > 0 && (
                <button
                  type="button"
                  onClick={() => onOpenTrailer(0)}
                  className="glow-pulse inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-red-600/30 transition-all hover:bg-red-500 hover:scale-105 active:scale-95 cursor-pointer"
                >
                  <Play className="size-4 fill-current" />
                  <span>Watch Trailer</span>
                  {allVideos.length > 1 && (
                    <span className="rounded bg-black/30 px-1.5 py-0.2 text-[10px] font-bold text-white/90">
                      {allVideos.length}
                    </span>
                  )}
                </button>
              )}

              {/* Download Game Button (released games that are not already installed) */}
              {isReleased && !isInstalled && (
                <button
                  type="button"
                  onClick={() => {
                    openDownloadModal({
                      gameId: libraryEntry?.id,
                      igdbId: game.igdb_id,
                      name: game.name,
                      coverUrl: activeCoverUrl ?? game.cover_url,
                    })
                  }}
                  className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-accent/25 transition-all hover:bg-accent-hover hover:scale-105 active:scale-95 cursor-pointer"
                >
                  <Download className="size-4" />
                  <span>Download Game</span>
                </button>
              )}

              {/* In Memory Restore / In Library / Play Button */}
              {inMem && libraryEntry ? (
                <button
                  type="button"
                  disabled={restoreMutation.isPending}
                  onClick={() => restoreMutation.mutate(libraryEntry.id)}
                  className="inline-flex items-center gap-2 rounded-xl border border-amber-400/50 bg-gradient-to-r from-amber-500/30 to-amber-600/30 px-5 py-2.5 text-sm font-bold text-amber-200 shadow-lg shadow-amber-500/20 transition-all hover:bg-amber-500/50 hover:text-white hover:scale-105 active:scale-95 cursor-pointer"
                >
                  {restoreMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <RotateCcw className="size-4" />
                  )}
                  <span>Restore to Library</span>
                </button>
              ) : inLibrary ? (
                <button
                  type="button"
                  onClick={() => {
                    if (libraryEntry) selectGame(libraryEntry.id)
                    navigate('/')
                  }}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition-all hover:scale-105 active:scale-95 cursor-pointer',
                    isInstalled
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/25'
                      : 'border border-emerald-500/40 bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30',
                  )}
                >
                  {isInstalled ? <Gamepad2 className="size-4" /> : <Check className="size-4" />}
                  <span>{isInstalled ? 'Installed — Play' : 'In Library'}</span>
                </button>
              ) : isReleased ? (
                <button
                  type="button"
                  disabled={addGame.isPending}
                  onClick={() =>
                    addGame.mutate(game.igdb_id, {
                      onSuccess: () => toast.success(`${game.name} was added to your library.`),
                      onError: (mutationError) => toast.error(mutationError.message),
                    })
                  }
                  className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-black/60 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-black/80 hover:scale-105 active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  {addGame.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Plus className="size-4" />
                  )}
                  <span>{addGame.isPending ? 'Adding…' : 'Add to Library'}</span>
                </button>
              ) : null}

              {/* Wishlist Button */}
              {inWishlist ? (
                <button
                  type="button"
                  onClick={() => navigate('/wishlist')}
                  className="inline-flex items-center gap-2 rounded-xl border border-accent/40 bg-accent/20 px-4 py-2.5 text-sm font-bold text-accent transition-colors hover:bg-accent/30 cursor-pointer"
                >
                  <Bookmark className="size-4 fill-current" />
                  <span>In Wishlist</span>
                </button>
              ) : (
                !inLibrary && (
                  <button
                    type="button"
                    disabled={addToWishlist.isPending}
                    onClick={() =>
                      addToWishlist.mutate(game.igdb_id, {
                        onSuccess: () => toast.success(`${game.name} was added to your wishlist.`),
                        onError: (mutationError) => toast.error(mutationError.message),
                      })
                    }
                    className={cn(
                      'inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all hover:scale-105 active:scale-95 disabled:opacity-50 cursor-pointer',
                      isReleased
                        ? 'border border-white/20 bg-black/60 text-white hover:bg-black/80'
                        : 'bg-accent text-white shadow-lg shadow-accent/25 hover:bg-accent-hover',
                    )}
                  >
                    {addToWishlist.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Bookmark className="size-4" />
                    )}
                    <span>{addToWishlist.isPending ? 'Adding…' : 'Add to Wishlist'}</span>
                  </button>
                )
              )}

              {/* SteamDB Regional Prices Button */}
              {game.steam_app_id && onOpenRegionalPrice && (
                <button
                  type="button"
                  onClick={onOpenRegionalPrice}
                  title="Compare Steam regional prices & discounts (SteamDB style)"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-black/60 px-4 py-2.5 text-sm font-semibold text-white shadow-md backdrop-blur-md transition-all hover:bg-black/80 hover:border-accent hover:scale-105 active:scale-95 cursor-pointer"
                >
                  <Globe2 className="size-4 text-accent" />
                  <span>Regional Prices</span>
                </button>
              )}

              {/* Steam Store external link (if resolved) */}
              {game.steam_app_id && (
                <a
                  href={`https://store.steampowered.com/app/${game.steam_app_id}/`}
                  target="_blank"
                  rel="noreferrer"
                  title="View on Steam Store"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-black/40 px-3.5 py-2.5 text-xs font-semibold text-white/80 transition-all hover:bg-black/60 hover:text-white"
                >
                  <span>Steam</span>
                  <ExternalLink className="size-3 text-white/60" />
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.section>
  )
}

function ReleaseCountdown({ releaseDate }: { releaseDate: string }) {
  const windowActive = useWindowActive()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!windowActive) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [windowActive])

  const [year, month, day] = releaseDate.split('-').map(Number)
  const target = new Date(year, month - 1, day).getTime()
  const remaining = Math.max(0, target - now)
  const totalSeconds = Math.floor(remaining / 1000)
  const segments = [
    { label: 'Days', value: Math.floor(totalSeconds / 86_400) },
    { label: 'Hours', value: Math.floor(totalSeconds / 3_600) % 24 },
    { label: 'Mins', value: Math.floor(totalSeconds / 60) % 60 },
    { label: 'Secs', value: totalSeconds % 60 },
  ]

  return (
    <div className="mt-2 flex flex-col gap-1.5">
      <div className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-widest text-amber-400">
        <CalendarDays className="size-3.5 text-amber-400" />
        <span>Releases In</span>
      </div>
      <div className="flex items-stretch gap-2">
        {segments.map((segment, index) => (
          <div key={segment.label} className="flex items-center gap-2">
            <div className="flex min-w-16 flex-col items-center rounded-xl border border-white/20 bg-black/65 px-3 py-2 shadow-xs">
              <span className="font-mono text-2xl font-black tabular-nums leading-none text-white">
                {String(segment.value).padStart(2, '0')}
              </span>
              <span className="mt-1 text-[9px] font-extrabold uppercase tracking-wider text-white/60">
                {segment.label}
              </span>
            </div>
            {index < segments.length - 1 && (
              <span className="text-xl font-black text-white/40">:</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
