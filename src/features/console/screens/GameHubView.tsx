import React, { useEffect, useState } from 'react'
import {
  ArrowLeft,
  Building2,
  Calendar,
  Clock,
  Compass,
  Film,
  FolderOpen,
  HardDrive,
  Heart,
  Loader2,
  Music,
  Play,
  Sparkles,
  Square,
} from 'lucide-react'
import { toast } from 'sonner'
import type { Game, HubGame, HubGameDetails } from '@/types/models'
import { formatElapsed, formatPlaytime, isGameUnreleased } from '@/features/library/utils/format'
import { useLaunchStore } from '@/store/launch-store'
import { formatBytes } from '@/features/library/utils/guess-name'
import { getGameScreenshots } from '@/services/games'
import {
  getHubGameDetails,
  resolveHubGameScores,
  searchHubGames,
} from '@/services/hub'
import { useConsoleStore } from '../store/console-store'
import { CONSOLE_THEMES } from '../theme/tokens'
import { FocusScope, useFocusable } from '../nav/FocusScope'
import { resolveConsoleHighResUrl } from '../ui/Tile'
import { Glyph } from '../ui/Glyph'
import { InlineGameSoundtrackSection } from '../ui/InlineGameSoundtrackSection'
import { ReleaseCountdownBanner } from '../ui/ReleaseCountdownBanner'
import { ConsoleTrailerShowcase } from '../ui/ConsoleTrailerShowcase'
import { ConsoleScorecardStrip } from '../ui/ConsoleScorecardStrip'
import { ConsoleFpsEstimatorSection } from '../ui/ConsoleFpsEstimatorSection'

export interface GameHubViewProps {
  game: Game
  isRunning: boolean
  onBack: () => void
  onPlayOrResume: (game: Game) => void
  onToggleFavorite: (game: Game) => void
  onOpenMusicTab: () => void
}

export const GameHubView: React.FC<GameHubViewProps> = ({
  game,
  isRunning,
  onBack,
  onPlayOrResume,
  onToggleFavorite,
  onOpenMusicTab: _onOpenMusicTab,
}) => {
  const themeId = useConsoleStore((s) => s.theme)
  const isLight = Boolean(CONSOLE_THEMES[themeId]?.isLight)
  const setSelectedStoreHubGame = useConsoleStore((s) => s.setSelectedStoreHubGame)
  const setSelectedGameId = useConsoleStore((s) => s.setSelectedGameId)
  const elapsedSeconds = useLaunchStore((s) => s.elapsedSeconds[game.id] ?? 0)

  const [screenshots, setScreenshots] = useState<string[]>([])
  const [hubDetails, setHubDetails] = useState<HubGameDetails | null>(null)
  const [openingStore, setOpeningStore] = useState(false)
  const [scores, setScores] = useState<{ metacritic: number | null; opencritic: number | null }>({
    metacritic: game.metacritic_score,
    opencritic: game.opencritic_score,
  })

  useEffect(() => {
    let cancelled = false
    setScores({
      metacritic: game.metacritic_score,
      opencritic: game.opencritic_score,
    })

    // Load local + IGDB screenshots & supplemental metadata (even if game.igdb_id is null, search by name!)
    const fetchIgdbDetails = async (): Promise<HubGameDetails | null> => {
      if (game.igdb_id) {
        return getHubGameDetails(game.igdb_id, game.name).catch(() => null)
      }
      try {
        const searchHits = await searchHubGames(game.name, 0)
        if (searchHits && searchHits[0]?.igdb_id) {
          return await getHubGameDetails(searchHits[0].igdb_id, game.name)
        }
      } catch {
        // Ignore
      }
      return null
    }

    Promise.all([
      getGameScreenshots(game.id).catch(() => [] as string[]),
      fetchIgdbDetails(),
    ]).then(([localShots, igdbData]) => {
      if (cancelled) return
      if (igdbData) {
        setHubDetails(igdbData)
        setScores((prev) => ({
          metacritic: prev.metacritic ?? igdbData.metacritic_score ?? null,
          opencritic: prev.opencritic ?? igdbData.opencritic_score ?? null,
        }))
      }
      const merged = [
        ...localShots,
        ...(igdbData?.screenshot_urls ?? []),
      ]
        .map((u) => resolveConsoleHighResUrl(u))
        .filter((u): u is string => Boolean(u))
      setScreenshots(Array.from(new Set(merged)))

      if (!game.metacritic_score && !game.opencritic_score) {
        resolveHubGameScores({
          gameName: game.name,
          releaseDate: game.release_date ?? igdbData?.release_date,
          metacriticScore: igdbData?.metacritic_score ?? null,
          opencriticScore: igdbData?.opencritic_score ?? null,
          igdbRating: igdbData?.rating ?? null,
        })
          .then((sc) => {
            if (!cancelled) {
              setScores((prev) => ({
                metacritic: sc.metacritic ?? prev.metacritic,
                opencritic: sc.opencritic ?? prev.opencritic,
              }))
            }
          })
          .catch(() => {})
      }
    })

    return () => {
      cancelled = true
    }
  }, [game])

  const handleOpenGameOst = () => {
    const el = document.getElementById('game-page-inline-soundtrack')
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  const handleWatchTrailer = () => {
    window.dispatchEvent(new CustomEvent('nexus:console-play-trailer'))
    const el = document.getElementById('console-inline-trailer-section')
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  const handleViewInStore = async () => {
    if (openingStore) return
    if (hubDetails) {
      setSelectedGameId(null)
      setSelectedStoreHubGame(hubDetails)
      return
    }
    if (game.igdb_id) {
      setOpeningStore(true)
      try {
        const d = await getHubGameDetails(game.igdb_id, game.name)
        setSelectedGameId(null)
        setSelectedStoreHubGame(d)
        return
      } catch {
        // Fallback to search below
      } finally {
        setOpeningStore(false)
      }
    }
    setOpeningStore(true)
    try {
      const results: HubGame[] = await searchHubGames(game.name, 0)
      if (results.length > 0) {
        setSelectedGameId(null)
        setSelectedStoreHubGame(results[0])
      } else {
        toast.info(`Could not find a Store page for "${game.name}"`)
      }
    } catch {
      toast.error('Could not open Store page right now')
    } finally {
      setOpeningStore(false)
    }
  }

  const playBtn = useFocusable<HTMLButtonElement>({
    id: 'hub_action_play',
    scopeId: 'console_game_hub',
    onConfirm: () => onPlayOrResume(game),
  })

  const viewInStoreBtn = useFocusable<HTMLButtonElement>({
    id: 'hub_action_view_in_store',
    scopeId: 'console_game_hub',
    onConfirm: () => {
      void handleViewInStore()
    },
  })

  const favBtn = useFocusable<HTMLButtonElement>({
    id: 'hub_action_fav',
    scopeId: 'console_game_hub',
    onConfirm: () => onToggleFavorite(game),
  })

  const ostBtn = useFocusable<HTMLButtonElement>({
    id: 'hub_action_ost',
    scopeId: 'console_game_hub',
    onConfirm: handleOpenGameOst,
  })

  const trailerBtn = useFocusable<HTMLButtonElement>({
    id: 'hub_action_trailer',
    scopeId: 'console_game_hub',
    onConfirm: handleWatchTrailer,
  })

  const backBtn = useFocusable<HTMLButtonElement>({
    id: 'hub_action_back',
    scopeId: 'console_game_hub',
    onConfirm: onBack,
  })



  const backdrop = resolveConsoleHighResUrl(
    game.background_path ??
      game.banner_path ??
      screenshots[0] ??
      hubDetails?.backdrop_url ??
      game.cover_path,
  )
  const cover = resolveConsoleHighResUrl(game.cover_path ?? hubDetails?.cover_url)
  const logoSrc = resolveConsoleHighResUrl(game.logo_path)
  const descriptionText = game.description || hubDetails?.summary
  const developerText = game.developer || hubDetails?.developer
  const publisherText = game.publisher || hubDetails?.publisher
  const releaseText = game.release_date || hubDetails?.release_date
  const unreleased = isGameUnreleased(releaseText ?? null)

  return (
    <FocusScope id="console_game_hub" orientation="vertical" className="space-y-6 pb-20">
      {/* High-Clarity 1080p Hero Showcase Card */}
      <div
        className={`relative overflow-hidden rounded-[1.75rem] border shadow-2xl ${
          isLight ? 'border-slate-300 bg-white' : 'border-white/15 bg-[#0d1426]'
        }`}
      >
        {backdrop && (
          <img
            src={backdrop}
            alt={game.name}
            className="absolute inset-0 h-full w-full object-cover object-center opacity-50 saturate-110"
          />
        )}
        <div
          className="absolute inset-0"
          style={{
            background: isLight
              ? 'linear-gradient(to top, #ffffff 10%, rgba(255,255,255,0.84) 55%, rgba(255,255,255,0.45) 100%)'
              : 'linear-gradient(to top, #0d1426 12%, rgba(13,20,38,0.82) 55%, rgba(13,20,38,0.4) 100%)',
          }}
        />

        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-end gap-6 p-6 md:p-8">
          {cover && (
            <img
              src={cover}
              alt={game.name}
              className="h-52 w-36 shrink-0 rounded-2xl border-2 border-white/20 object-cover shadow-2xl"
            />
          )}

          <div className="flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {isRunning && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400 px-3 py-1 text-xs font-black uppercase text-slate-950">
                  <span className="size-2 rounded-full bg-slate-950 animate-ping" />
                  Running Now
                </span>
              )}
              <span
                className={`rounded-full border px-3 py-1 text-xs font-extrabold uppercase ${
                  isLight
                    ? 'bg-indigo-50 border-indigo-200 text-indigo-800'
                    : 'bg-cyan-500/20 border-cyan-400/40 text-cyan-300'
                }`}
              >
                {game.is_wishlist ? 'Wishlist' : game.source || 'PC Library'}
              </span>
              {scores.metacritic && scores.metacritic > 0 ? (
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-extrabold ${
                    isLight
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                      : 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300'
                  }`}
                >
                  <Sparkles className="size-3.5" />
                  Metacritic {scores.metacritic}
                </span>
              ) : null}
              {scores.opencritic && scores.opencritic > 0 ? (
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-extrabold ${
                    isLight
                      ? 'bg-amber-50 border-amber-300 text-amber-800'
                      : 'bg-amber-500/20 border-amber-400/40 text-amber-300'
                  }`}
                >
                  <Sparkles className="size-3.5" />
                  OpenCritic {scores.opencritic}
                </span>
              ) : null}
              {hubDetails?.rating && hubDetails.rating > 0 ? (
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-extrabold ${
                    isLight
                      ? 'bg-indigo-50 border-indigo-200 text-indigo-800'
                      : 'bg-cyan-500/20 border-cyan-400/40 text-cyan-300'
                  }`}
                >
                  <Sparkles className="size-3.5" />
                  IGDB {Math.round(hubDetails.rating)}%
                </span>
              ) : null}
              {(game.genres.length > 0 ? game.genres : (hubDetails?.genres ?? [])).map((gn) => (
                <span
                  key={gn}
                  className={`rounded-full px-3 py-1 text-xs font-bold ${
                    isLight ? 'bg-slate-200 text-slate-800' : 'bg-white/10 text-slate-200'
                  }`}
                >
                  {gn}
                </span>
              ))}
            </div>

            {logoSrc ? (
              <img
                src={logoSrc}
                alt={game.name}
                className="max-h-16 max-w-md object-contain object-left drop-shadow-2xl"
              />
            ) : (
              <h1
                className={`text-3xl md:text-4xl font-black tracking-tight ${
                  isLight ? 'text-slate-900' : 'text-white'
                }`}
              >
                {game.name}
              </h1>
            )}

            {/* Key Game Telemetry Strip */}
            <div
              className={`flex flex-wrap items-center gap-5 text-sm font-semibold ${
                isLight ? 'text-slate-600' : 'text-slate-300'
              }`}
            >
              <span className="flex items-center gap-2">
                <Clock className="size-4 text-cyan-400" />
                {formatPlaytime(game.total_playtime_seconds)}
              </span>
              {developerText && (
                <span className="flex items-center gap-2">
                  <Building2 className="size-4 text-violet-400" />
                  {developerText}
                  {publisherText && publisherText !== developerText ? ` / ${publisherText}` : ''}
                </span>
              )}
              {releaseText && (
                <span className="flex items-center gap-2">
                  <Calendar className="size-4 text-amber-400" />
                  {releaseText}
                </span>
              )}
              {game.install_size_bytes && game.install_size_bytes > 0 ? (
                <span className="flex items-center gap-2">
                  <HardDrive className="size-4 text-emerald-400" />
                  {formatBytes(game.install_size_bytes)}
                </span>
              ) : null}
              {game.install_path && (
                <span className="flex items-center gap-1.5 text-xs opacity-75 truncate max-w-xs">
                  <FolderOpen className="size-3.5 text-cyan-400 shrink-0" />
                  {game.install_path}
                </span>
              )}
            </div>

            {descriptionText && (
              <p
                className={`max-w-3xl text-sm leading-relaxed line-clamp-3 ${
                  isLight ? 'text-slate-700' : 'text-slate-200/90'
                }`}
              >
                {descriptionText}
              </p>
            )}

            {/* Primary Action Buttons */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              {game.is_installed && (
                <button
                  type="button"
                  {...playBtn.focusProps}
                  className={`flex items-center gap-2.5 px-7 py-3 rounded-2xl font-extrabold text-sm transition-all cursor-pointer tabular-nums ${
                    isRunning
                      ? playBtn.isFocused
                        ? 'bg-rose-500 text-white scale-105 ring-4 ring-rose-300/60 shadow-[0_0_35px_rgba(244,63,94,0.65)]'
                        : 'bg-rose-600/90 text-white hover:bg-rose-500'
                      : playBtn.isFocused
                        ? 'bg-cyan-400 text-slate-950 scale-105 ring-4 ring-cyan-300/60 shadow-[0_0_35px_rgba(0,229,255,0.65)]'
                        : 'bg-cyan-500/90 text-slate-950 hover:bg-cyan-400'
                  }`}
                >
                  {isRunning ? (
                    <Square className="w-4 h-4 fill-current" />
                  ) : (
                    <Play className="w-4 h-4 fill-current" />
                  )}
                  <span>
                    {isRunning ? `Stop · ${formatElapsed(elapsedSeconds)}` : 'Play Now'}
                  </span>
                  <Glyph button="confirm" size="sm" />
                </button>
              )}

              <button
                type="button"
                {...viewInStoreBtn.focusProps}
                disabled={openingStore}
                className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-extrabold text-sm border transition-all cursor-pointer ${
                  viewInStoreBtn.isFocused
                    ? 'scale-105 border-cyan-300 bg-cyan-400 text-slate-950 shadow-xl'
                    : isLight
                      ? 'border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                      : 'border-cyan-400/40 bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25'
                }`}
              >
                {openingStore ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Compass className="w-4 h-4" />
                )}
                <span>View in Store</span>
              </button>

              <button
                type="button"
                {...favBtn.focusProps}
                className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-sm border transition-all cursor-pointer ${
                  favBtn.isFocused
                    ? 'bg-amber-400 text-slate-950 border-amber-300 scale-105'
                    : game.is_favorite
                      ? isLight
                        ? 'bg-amber-50 text-amber-800 border-amber-300'
                        : 'bg-amber-500/20 text-amber-300 border-amber-400/40'
                      : isLight
                        ? 'bg-slate-100 text-slate-800 border-slate-300'
                        : 'bg-white/10 text-white border-white/15'
                }`}
              >
                <Heart className={`w-4 h-4 ${game.is_favorite ? 'fill-current' : ''}`} />
                <span>{game.is_favorite ? 'Favorited' : 'Favorite'}</span>
              </button>

              <button
                type="button"
                {...trailerBtn.focusProps}
                className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-sm border transition-all cursor-pointer ${
                  trailerBtn.isFocused
                    ? 'bg-rose-400 text-slate-950 border-rose-300 scale-105'
                    : isLight
                      ? 'bg-slate-100 text-slate-800 border-slate-300'
                      : 'bg-rose-500/15 text-rose-300 border-rose-400/35'
                }`}
              >
                <Film className="w-4 h-4" />
                <span>Media &amp; Trailers</span>
              </button>

              <button
                type="button"
                {...ostBtn.focusProps}
                className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-sm border transition-all cursor-pointer ${
                  ostBtn.isFocused
                    ? 'bg-violet-400 text-slate-950 border-violet-300 scale-105'
                    : isLight
                      ? 'bg-slate-100 text-slate-800 border-slate-300'
                      : 'bg-white/10 text-white border-white/15'
                }`}
              >
                <Music className="w-4 h-4" />
                <span>Soundtrack (OST)</span>
              </button>

              <button
                type="button"
                {...backBtn.focusProps}
                className={`flex items-center gap-2 px-4 py-3 rounded-2xl font-bold text-sm border transition-all cursor-pointer ${
                  backBtn.isFocused
                    ? 'bg-white text-slate-950 border-cyan-300 scale-105'
                    : isLight
                      ? 'bg-white text-slate-700 border-slate-300'
                      : 'bg-white/5 text-slate-300 border-white/15'
                }`}
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Live Release Countdown Banner for Unreleased or Wishlisted Games */}
      <ReleaseCountdownBanner
        releaseDate={releaseText}
        isWishlist={game.is_wishlist}
        isLight={isLight}
      />

      {/* Item #2: Dedicated Critic & Community Ratings Scorecard on Console Game Page */}
      <ConsoleScorecardStrip
        metacriticScore={scores.metacritic}
        opencriticScore={scores.opencritic}
        igdbRating={hubDetails?.rating ?? null}
        userRating={game.user_rating}
        isUnreleased={unreleased}
        isLight={isLight}
      />

      {/* Item #1: Unified Switchable Media Showcase (Trailers + Screenshots in one player like Game Hub) */}
      <ConsoleTrailerShowcase
        scopeId="console_game_hub"
        gameName={game.name}
        steamAppId={game.steam_app_id ?? hubDetails?.steam_app_id}
        videos={hubDetails?.videos}
        trailerUrl={game.trailer_url ?? hubDetails?.trailer_url}
        screenshots={screenshots}
        isLight={isLight}
      />

      {/* Live FPS & Resolution Estimator + PC System Requirements */}
      <ConsoleFpsEstimatorSection
        scopeId="console_game_hub"
        gameName={game.name}
        releaseDate={releaseText}
        genres={game.genres.length > 0 ? game.genres : (hubDetails?.genres ?? [])}
        systemRequirements={hubDetails?.system_requirements}
        isLight={isLight}
      />

      {/* Inline Game Soundtrack Player & Tracklist Section */}
      <div id="game-page-inline-soundtrack">
        <InlineGameSoundtrackSection
          scopeId="console_game_hub"
          gameId={game.id}
          gameName={game.name}
          coverUrl={game.cover_path}
          steamAppId={game.steam_app_id}
          igdbId={game.igdb_id}
          isLight={isLight}
        />
      </div>
    </FocusScope>
  )
}

