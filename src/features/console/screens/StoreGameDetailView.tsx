import React, { useEffect, useMemo, useState } from 'react'
import {
  Archive,
  ArrowLeft,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  Film,
  Gamepad2,
  HardDrive,
  Heart,
  Monitor,
  Music,
  Play,
  Plus,
  Sparkles,
  Tag,
  Wrench,
} from 'lucide-react'
import { toast } from 'sonner'
import type { Game, HubGame, HubGameDetails } from '@/types/models'
import { formatPlaytime, isGameUnreleased } from '@/features/library/utils/format'
import { promoteWishlistGame, restoreGameFromMemory } from '@/services/games'
import {
  addGameFromHub,
  addGameToWishlist,
  getHubGameDetails,
  getHubSimilarGames,
  resolveHubGameScores,
} from '@/services/hub'
import { useConsoleStore } from '../store/console-store'
import { CONSOLE_THEMES } from '../theme/tokens'
import { FocusScope, useFocusable } from '../nav/FocusScope'
import { resolveConsoleHighResUrl } from '../ui/Tile'
import { ConsoleRow } from '../ui/Row'
import { InlineGameSoundtrackSection } from '../ui/InlineGameSoundtrackSection'
import { ReleaseCountdownBanner } from '../ui/ReleaseCountdownBanner'
import { ConsoleTrailerShowcase } from '../ui/ConsoleTrailerShowcase'
import { ConsoleScorecardStrip } from '../ui/ConsoleScorecardStrip'
import { ConsoleFpsEstimatorSection } from '../ui/ConsoleFpsEstimatorSection'
import { normalizeCanonicalStoreTitle } from './StoreView'

export interface StoreGameDetailViewProps {
  hubGame: HubGame
  games?: Game[]
  onBack: () => void
  onSelectSimilarHubGame: (hg: HubGame) => void
  onGameAddedToLibrary: () => void
  onPlayGame?: (game: Game) => void
  onOpenGameHub?: (game: Game) => void
  onOpenMemoryTab?: () => void
  onSwitchToLegacyMode?: () => void
}

export const StoreGameDetailView: React.FC<StoreGameDetailViewProps> = ({
  hubGame,
  games = [],
  onBack,
  onSelectSimilarHubGame,
  onGameAddedToLibrary,
  onPlayGame,
  onOpenGameHub,
  onOpenMemoryTab,
  onSwitchToLegacyMode,
}) => {
  const themeId = useConsoleStore((s) => s.theme)
  const isLight = Boolean(CONSOLE_THEMES[themeId]?.isLight)

  const [details, setDetails] = useState<HubGameDetails | null>(null)
  const [similar, setSimilar] = useState<HubGame[]>([])
  const [addingLib, setAddingLib] = useState(false)
  const [addingWish, setAddingWish] = useState(false)
  const [addedLib, setAddedLib] = useState(false)
  const [addedWish, setAddedWish] = useState(false)
  const [scores, setScores] = useState<{ metacritic: number | null; opencritic: number | null }>({
    metacritic: hubGame.metacritic_score ?? null,
    opencritic: hubGame.opencritic_score ?? null,
  })

  // Match this Store game against the user's Library, Wishlist, or Memory Vault
  const matchedLibraryGame = useMemo(() => {
    const targetCanon = normalizeCanonicalStoreTitle(hubGame.name)
    const targetSteam = hubGame.steam_app_id ? String(hubGame.steam_app_id).trim() : ''

    return (
      games.find((g) => {
        if (g.igdb_id && hubGame.igdb_id && g.igdb_id === hubGame.igdb_id) return true
        if (targetSteam && g.steam_app_id && String(g.steam_app_id).trim() === targetSteam) {
          return true
        }
        return targetCanon.length > 0 && normalizeCanonicalStoreTitle(g.name) === targetCanon
      }) ?? null
    )
  }, [games, hubGame])

  useEffect(() => {
    let cancelled = false
    setAddedLib(false)
    setAddedWish(false)
    setScores({
      metacritic: hubGame.metacritic_score ?? null,
      opencritic: hubGame.opencritic_score ?? null,
    })

    getHubGameDetails(hubGame.igdb_id, hubGame.name)
      .then((d) => {
        if (cancelled) return
        setDetails(d)
        const mc = d.metacritic_score ?? hubGame.metacritic_score ?? null
        const oc = d.opencritic_score ?? hubGame.opencritic_score ?? null
        setScores({ metacritic: mc, opencritic: oc })
        if (!mc || !oc) {
          resolveHubGameScores({
            gameName: d.name || hubGame.name,
            releaseDate: d.release_date ?? hubGame.release_date,
            metacriticScore: mc,
            opencriticScore: oc,
            igdbRating: d.rating ?? hubGame.rating,
          })
            .then((sc) => {
              if (!cancelled) {
                setScores({
                  metacritic: sc.metacritic ?? mc,
                  opencritic: sc.opencritic ?? oc,
                })
              }
            })
            .catch(() => {})
        }
      })
      .catch(() => {
        resolveHubGameScores({
          gameName: hubGame.name,
          releaseDate: hubGame.release_date,
          metacriticScore: hubGame.metacritic_score,
          opencriticScore: hubGame.opencritic_score,
          igdbRating: hubGame.rating,
        })
          .then((sc) => {
            if (!cancelled) setScores(sc)
          })
          .catch(() => {})
      })

    getHubSimilarGames(hubGame.igdb_id)
      .then((list) => {
        if (!cancelled) setSimilar(list)
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [hubGame])

  const handlePrimaryLibraryAction = async () => {
    if (matchedLibraryGame) {
      if (matchedLibraryGame.is_memory) {
        if (onOpenMemoryTab) {
          onOpenMemoryTab()
          return
        }
        try {
          await restoreGameFromMemory(matchedLibraryGame.id)
          onGameAddedToLibrary()
          toast.success(`Restored "${matchedLibraryGame.name}" from Memory Vault to Library!`)
        } catch {
          toast.error('Could not restore from Memory')
        }
        return
      }
      if (matchedLibraryGame.is_wishlist) {
        try {
          await promoteWishlistGame(matchedLibraryGame.id)
          onGameAddedToLibrary()
          toast.success(`Moved "${matchedLibraryGame.name}" from Wishlist to Library!`)
        } catch {
          toast.error('Could not move to Library')
        }
        return
      }
      if (matchedLibraryGame.is_installed) {
        if (onPlayGame) {
          onPlayGame(matchedLibraryGame)
          return
        }
        if (onOpenGameHub) {
          onOpenGameHub(matchedLibraryGame)
          return
        }
      } else {
        // In Library, but not installed -> guide to Legacy Mode to install/link executable
        if (onSwitchToLegacyMode) {
          toast.info(`Switching to Legacy Mode to install "${matchedLibraryGame.name}"`)
          onSwitchToLegacyMode()
          return
        }
      }
    }

    if (addingLib || addedLib) return
    setAddingLib(true)
    try {
      await addGameFromHub(hubGame.igdb_id)
      setAddedLib(true)
      onGameAddedToLibrary()
      toast.success(`Added ${hubGame.name} to your Library!`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not add game to Library')
    } finally {
      setAddingLib(false)
    }
  }

  const handleAddWishlist = async () => {
    if (addingWish || addedWish || matchedLibraryGame) return
    setAddingWish(true)
    try {
      await addGameToWishlist(hubGame.igdb_id)
      setAddedWish(true)
      onGameAddedToLibrary()
      toast.success(`Added ${hubGame.name} to your Wishlist!`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not add to Wishlist')
    } finally {
      setAddingWish(false)
    }
  }

  const handleOpenOst = () => {
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

  const primaryActionBtn = useFocusable<HTMLButtonElement>({
    id: 'store_detail_add_lib',
    scopeId: 'console_store_detail_scope',
    onConfirm: () => {
      void handlePrimaryLibraryAction()
    },
  })

  const secondaryStatusBtn = useFocusable<HTMLButtonElement>({
    id: 'store_detail_secondary_status',
    scopeId: 'console_store_detail_scope',
    onConfirm: () => {
      if (matchedLibraryGame?.is_memory && onSwitchToLegacyMode) {
        onSwitchToLegacyMode()
      } else if (matchedLibraryGame && onOpenGameHub) {
        onOpenGameHub(matchedLibraryGame)
      } else {
        void handleAddWishlist()
      }
    },
  })

  const ostBtn = useFocusable<HTMLButtonElement>({
    id: 'store_detail_ost',
    scopeId: 'console_store_detail_scope',
    onConfirm: handleOpenOst,
  })

  const trailerBtn = useFocusable<HTMLButtonElement>({
    id: 'store_detail_trailer',
    scopeId: 'console_store_detail_scope',
    onConfirm: handleWatchTrailer,
  })

  const backBtn = useFocusable<HTMLButtonElement>({
    id: 'store_detail_back',
    scopeId: 'console_store_detail_scope',
    onConfirm: onBack,
  })

  const heroImg = resolveConsoleHighResUrl(
    details?.backdrop_url ??
      hubGame.backdrop_url ??
      details?.screenshot_urls?.[0] ??
      hubGame.cover_url,
  )
  const coverImg = resolveConsoleHighResUrl(details?.cover_url ?? hubGame.cover_url)
  const screenshots = (details?.screenshot_urls ?? [])
    .map((u) => resolveConsoleHighResUrl(u))
    .filter((u): u is string => Boolean(u))

  const genres = details?.genres?.length ? details.genres : hubGame.genres
  const platforms = details?.platforms?.length ? details.platforms : hubGame.platforms
  const summaryText = details?.summary ?? hubGame.summary
  const sysReq = details?.system_requirements
  const effectiveReleaseDate = details?.release_date ?? hubGame.release_date
  const effectiveIgdbRating = details?.rating ?? hubGame.rating
  const unreleased = isGameUnreleased(effectiveReleaseDate)

  const statusKind: 'installed' | 'uninstalled' | 'memory' | 'wishlist' | 'none' =
    matchedLibraryGame
      ? matchedLibraryGame.is_memory
        ? 'memory'
        : matchedLibraryGame.is_wishlist
          ? 'wishlist'
          : matchedLibraryGame.is_installed
            ? 'installed'
            : 'uninstalled'
      : addedLib
        ? 'uninstalled'
        : addedWish
          ? 'wishlist'
          : 'none'

  return (
    <FocusScope id="console_store_detail_scope" orientation="vertical" className="space-y-6 pb-20">
      {/* Hero Banner Card */}
      <div
        className={`relative overflow-hidden rounded-[1.75rem] border shadow-2xl ${
          isLight ? 'border-slate-300 bg-white' : 'border-white/15 bg-[#0d1426]'
        }`}
      >
        {heroImg && (
          <img
            src={heroImg}
            alt={hubGame.name}
            className="absolute inset-0 h-full w-full object-cover object-center opacity-45 saturate-110"
          />
        )}
        <div
          className="absolute inset-0"
          style={{
            background: isLight
              ? 'linear-gradient(to top, #ffffff 10%, rgba(255,255,255,0.84) 55%, rgba(255,255,255,0.5) 100%)'
              : 'linear-gradient(to top, #0d1426 12%, rgba(13,20,38,0.82) 58%, rgba(13,20,38,0.45) 100%)',
          }}
        />

        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-end gap-6 p-6 md:p-8">
          {coverImg && (
            <img
              src={coverImg}
              alt={hubGame.name}
              className="h-52 w-36 shrink-0 rounded-2xl border-2 border-white/20 object-cover shadow-2xl"
            />
          )}

          <div className="flex-1 space-y-3">
            {/* Badges Row */}
            <div className="flex flex-wrap items-center gap-2">
              {statusKind === 'installed' && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400 px-3 py-1 text-xs font-black uppercase text-slate-950 shadow">
                  <CheckCircle2 className="size-3.5" />
                  Installed &amp; Ready to Play
                </span>
              )}
              {statusKind === 'uninstalled' && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400 px-3 py-1 text-xs font-black uppercase text-slate-950 shadow">
                  <Wrench className="size-3.5" />
                  In Library · Not Installed
                </span>
              )}
              {statusKind === 'memory' && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-3 py-1 text-xs font-black uppercase text-slate-950 shadow">
                  <Archive className="size-3.5" />
                  Saved in Memory Vault
                </span>
              )}
              {statusKind === 'wishlist' && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500 px-3 py-1 text-xs font-black uppercase text-white shadow">
                  <Heart className="size-3.5 fill-current" />
                  In Your Wishlist
                </span>
              )}

              {hubGame.discount_percent && hubGame.discount_percent > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400 px-3 py-1 text-xs font-black text-slate-950 shadow">
                  <Tag className="size-3.5" />-{hubGame.discount_percent}% OFF
                </span>
              ) : null}
              {hubGame.sale_price_formatted && (
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-extrabold ${
                    isLight
                      ? 'bg-indigo-50 border-indigo-200 text-indigo-800'
                      : 'bg-cyan-400/20 border-cyan-400/40 text-cyan-300'
                  }`}
                >
                  {hubGame.sale_price_formatted}
                </span>
              )}
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
              {genres.slice(0, 4).map((gn) => (
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

            <h1
              className={`text-3xl md:text-4xl font-black tracking-tight ${
                isLight ? 'text-slate-900' : 'text-white'
              }`}
            >
              {hubGame.name}
            </h1>

            <div
              className={`flex flex-wrap items-center gap-5 text-sm font-semibold ${
                isLight ? 'text-slate-600' : 'text-slate-300'
              }`}
            >
              {details?.developer && (
                <span className="flex items-center gap-1.5">
                  <Building2 className="size-4 text-cyan-400" />
                  {details.developer}
                </span>
              )}
              {effectiveReleaseDate && (
                <span className="flex items-center gap-1.5">
                  <Calendar className="size-4 text-amber-400" />
                  {effectiveReleaseDate}
                </span>
              )}
              {details?.download_size && (
                <span className="flex items-center gap-1.5">
                  <HardDrive className="size-4 text-violet-400" />
                  {details.download_size}
                </span>
              )}
              {platforms.length > 0 && (
                <span className="text-xs opacity-80">
                  Platforms: {platforms.slice(0, 4).join(', ')}
                </span>
              )}
            </div>

            {summaryText && (
              <p
                className={`max-w-3xl text-sm leading-relaxed line-clamp-3 ${
                  isLight ? 'text-slate-700' : 'text-slate-200/90'
                }`}
              >
                {summaryText}
              </p>
            )}

            {/* Detailed Ownership / Installation / Memory Status Banner */}
            {statusKind !== 'none' && (
              <div
                className={`rounded-2xl border p-3.5 text-xs leading-relaxed ${
                  statusKind === 'installed'
                    ? isLight
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                      : 'border-emerald-400/35 bg-emerald-500/12 text-emerald-200'
                    : statusKind === 'uninstalled'
                      ? isLight
                        ? 'border-amber-300 bg-amber-50 text-amber-900'
                        : 'border-amber-400/40 bg-amber-500/15 text-amber-200'
                      : statusKind === 'memory'
                        ? isLight
                          ? 'border-amber-300 bg-amber-50/90 text-amber-900'
                          : 'border-amber-400/40 bg-amber-500/15 text-amber-200'
                        : isLight
                          ? 'border-rose-200 bg-rose-50 text-rose-900'
                          : 'border-rose-400/35 bg-rose-500/12 text-rose-200'
                }`}
              >
                {statusKind === 'installed' && (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold">
                      ✓ Installed in your Library (
                      {formatPlaytime(matchedLibraryGame?.total_playtime_seconds ?? 0)} played) —
                      Ready to launch immediately.
                    </span>
                  </div>
                )}
                {statusKind === 'uninstalled' && (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold">
                      ⚠ In Your Library (Not Installed Yet): Switch to Legacy (Desktop) Mode to
                      install or configure the game executable on your PC.
                    </span>
                  </div>
                )}
                {statusKind === 'memory' && (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold">
                      ★ Saved in Your Memory Vault (
                      {formatPlaytime(matchedLibraryGame?.total_playtime_seconds ?? 0)} preserved):
                      Open the Memories tab to inspect or restore, or switch to Legacy Mode to
                      reinstall.
                    </span>
                  </div>
                )}
                {statusKind === 'wishlist' && (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold">
                      ♥ Currently in your Wishlist — Promote to your Library anytime or switch to
                      Legacy Mode to install.
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Primary Action Buttons */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                {...primaryActionBtn.focusProps}
                disabled={addingLib}
                className={`flex items-center gap-2 rounded-2xl px-6 py-3 text-sm font-extrabold transition-all cursor-pointer outline-none ${
                  primaryActionBtn.isFocused
                    ? 'scale-105 bg-cyan-400 text-slate-950 ring-4 ring-cyan-300/60 shadow-[0_0_35px_rgba(0,229,255,0.65)]'
                    : statusKind === 'installed'
                      ? 'bg-emerald-400 text-slate-950 hover:bg-emerald-300'
                      : statusKind === 'uninstalled'
                        ? 'bg-amber-400 text-slate-950 hover:bg-amber-300'
                        : statusKind === 'memory'
                          ? 'bg-amber-400 text-slate-950 hover:bg-amber-300'
                          : 'bg-cyan-500 text-slate-950 hover:bg-cyan-400'
                }`}
              >
                {statusKind === 'installed' ? (
                  <>
                    <Play className="size-4 fill-current" />
                    <span>Play Now</span>
                  </>
                ) : statusKind === 'uninstalled' ? (
                  <>
                    <Monitor className="size-4" />
                    <span>Install in Legacy Mode</span>
                  </>
                ) : statusKind === 'memory' ? (
                  <>
                    <Archive className="size-4" />
                    <span>Open in Memories Tab</span>
                  </>
                ) : statusKind === 'wishlist' ? (
                  <>
                    <Check className="size-4 stroke-[3]" />
                    <span>Move to Library</span>
                  </>
                ) : (
                  <>
                    <Plus className="size-4 stroke-[3]" />
                    <span>{addingLib ? 'Adding...' : 'Add to Library'}</span>
                  </>
                )}
              </button>

              <button
                type="button"
                {...secondaryStatusBtn.focusProps}
                disabled={addingWish}
                className={`flex items-center gap-2 rounded-2xl border px-5 py-3 text-sm font-bold transition-all cursor-pointer outline-none ${
                  secondaryStatusBtn.isFocused
                    ? 'scale-105 border-amber-300 bg-amber-400 text-slate-950'
                    : isLight
                      ? 'border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200'
                      : 'border-white/15 bg-white/10 text-white hover:bg-white/15'
                }`}
              >
                {matchedLibraryGame?.is_memory ? (
                  <>
                    <Monitor className="size-4" />
                    <span>Reinstall in Legacy Mode</span>
                  </>
                ) : matchedLibraryGame ? (
                  <>
                    <Gamepad2 className="size-4" />
                    <span>Open Library Page</span>
                  </>
                ) : (
                  <>
                    <Heart className={`size-4 ${addedWish ? 'fill-current text-rose-400' : ''}`} />
                    <span>{addedWish ? 'Wishlisted' : 'Add to Wishlist'}</span>
                  </>
                )}
              </button>

              <button
                type="button"
                {...trailerBtn.focusProps}
                className={`flex items-center gap-2 rounded-2xl border px-5 py-3 text-sm font-bold transition-all cursor-pointer outline-none ${
                  trailerBtn.isFocused
                    ? 'scale-105 border-rose-300 bg-rose-400 text-slate-950'
                    : isLight
                      ? 'border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200'
                      : 'border-rose-400/35 bg-rose-500/15 text-rose-300 hover:bg-rose-500/25'
                }`}
              >
                <Film className="size-4" />
                <span>Screenshots &amp; Trailers</span>
              </button>

              <button
                type="button"
                {...ostBtn.focusProps}
                className={`flex items-center gap-2 rounded-2xl border px-5 py-3 text-sm font-bold transition-all cursor-pointer outline-none ${
                  ostBtn.isFocused
                    ? 'scale-105 border-violet-300 bg-violet-400 text-slate-950'
                    : isLight
                      ? 'border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200'
                      : 'border-white/15 bg-white/10 text-white hover:bg-white/15'
                }`}
              >
                <Music className="size-4" />
                <span>Soundtrack (OST)</span>
              </button>

              <button
                type="button"
                {...backBtn.focusProps}
                className={`flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-bold transition-all cursor-pointer outline-none ${
                  backBtn.isFocused
                    ? 'scale-105 border-cyan-300 bg-white text-slate-950'
                    : isLight
                      ? 'border-slate-300 bg-white text-slate-700'
                      : 'border-white/15 bg-white/5 text-slate-300'
                }`}
              >
                <ArrowLeft className="size-4" />
                <span>Back to Store</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Live Release Countdown Banner for Unreleased or Wishlisted Store Games */}
      <ReleaseCountdownBanner
        releaseDate={effectiveReleaseDate}
        isWishlist={statusKind === 'wishlist'}
        isLight={isLight}
      />

      {/* Dedicated Critic & Community Ratings Scorecard */}
      <ConsoleScorecardStrip
        metacriticScore={scores.metacritic}
        opencriticScore={scores.opencritic}
        igdbRating={effectiveIgdbRating}
        isUnreleased={unreleased}
        isLight={isLight}
      />

      {/* Unified Switchable Media Showcase (Screenshots FIRST, then Trailers) */}
      <ConsoleTrailerShowcase
        scopeId="console_store_detail_scope"
        gameName={hubGame.name}
        steamAppId={details?.steam_app_id ?? hubGame.steam_app_id}
        videos={details?.videos}
        trailerUrl={details?.trailer_url}
        screenshots={screenshots}
        isLight={isLight}
      />

      {/* Live FPS & Resolution Estimator + PC System Requirements */}
      <ConsoleFpsEstimatorSection
        scopeId="console_store_detail_scope"
        gameName={hubGame.name}
        releaseDate={effectiveReleaseDate}
        genres={genres}
        systemRequirements={sysReq}
        isLight={isLight}
      />

      {/* Inline Game Soundtrack Player & Tracklist Section */}
      <div id="game-page-inline-soundtrack">
        <InlineGameSoundtrackSection
          scopeId="console_store_detail_scope"
          gameId={`hub_${hubGame.igdb_id}`}
          gameName={hubGame.name}
          coverUrl={coverImg}
          steamAppId={details?.steam_app_id ?? hubGame.steam_app_id}
          igdbId={hubGame.igdb_id}
          isLight={isLight}
        />
      </div>

      {/* Similar Games Shelf */}
      {similar.length > 0 && (
        <ConsoleRow
          rowId="store_similar_games"
          title="Similar Games You Might Like"
          subtitle="Recommendations"
          items={similar.map((hg) => ({ id: `sim_${hg.igdb_id}`, hubGame: hg }))}
          onSelectGame={() => {}}
          onSelectHubGame={onSelectSimilarHubGame}
        />
      )}
    </FocusScope>
  )
}
