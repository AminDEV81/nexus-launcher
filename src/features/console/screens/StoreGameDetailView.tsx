import React, { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  Plus,
  Heart,
  Music,
  Film,
  Sparkles,
  Calendar,
  Building2,
  Cpu,
  HardDrive,
  Maximize2,
  X,
  Check,
  Tag,
} from 'lucide-react'
import { toast } from 'sonner'
import type { HubGame, HubGameDetails } from '@/types/models'
import {
  getHubGameDetails,
  getHubSimilarGames,
  addGameFromHub,
  addGameToWishlist,
  openTrailerWindow,
  resolveHubGameScores,
} from '@/services/hub'
import { useConsoleStore } from '../store/console-store'
import { CONSOLE_THEMES } from '../theme/tokens'
import { FocusScope, useFocusable } from '../nav/FocusScope'
import { resolveConsoleHighResUrl } from '../ui/Tile'
import { ConsoleRow } from '../ui/Row'
import { InlineGameSoundtrackSection } from '../ui/InlineGameSoundtrackSection'

export interface StoreGameDetailViewProps {
  hubGame: HubGame
  onBack: () => void
  onSelectSimilarHubGame: (hg: HubGame) => void
  onGameAddedToLibrary: () => void
}

export const StoreGameDetailView: React.FC<StoreGameDetailViewProps> = ({
  hubGame,
  onBack,
  onSelectSimilarHubGame,
  onGameAddedToLibrary,
}) => {
  const themeId = useConsoleStore((s) => s.theme)
  const isLight = Boolean(CONSOLE_THEMES[themeId]?.isLight)

  const [details, setDetails] = useState<HubGameDetails | null>(null)
  const [similar, setSimilar] = useState<HubGame[]>([])
  const [loading, setLoading] = useState(true)
  const [addingLib, setAddingLib] = useState(false)
  const [addingWish, setAddingWish] = useState(false)
  const [addedLib, setAddedLib] = useState(false)
  const [addedWish, setAddedWish] = useState(false)
  const [lightboxImg, setLightboxImg] = useState<string | null>(null)
  const [scores, setScores] = useState<{ metacritic: number | null; opencritic: number | null }>({
    metacritic: hubGame.metacritic_score ?? null,
    opencritic: hubGame.opencritic_score ?? null,
  })

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setAddedLib(false)
    setAddedWish(false)

    getHubGameDetails(hubGame.igdb_id, hubGame.name)
      .then((d) => {
        if (cancelled) return
        setDetails(d)
        setScores({
          metacritic: d.metacritic_score ?? hubGame.metacritic_score ?? null,
          opencritic: d.opencritic_score ?? hubGame.opencritic_score ?? null,
        })
        if (!d.metacritic_score && !d.opencritic_score) {
          resolveHubGameScores({
            gameName: d.name,
            releaseDate: d.release_date,
            igdbRating: d.rating,
          })
            .then((sc) => {
              if (!cancelled) setScores(sc)
            })
            .catch(() => {})
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
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

  const handleAddLibrary = async () => {
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
    if (addingWish || addedWish) return
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
    const vid = details?.videos?.[0]?.video_id
    if (vid) {
      void openTrailerWindow(vid, `${hubGame.name} — Trailer`).catch(() => {})
    } else if (details?.trailer_url) {
      window.open(details.trailer_url, '_blank')
    } else {
      toast.info('No trailer video found for this title')
    }
  }

  const addLibBtn = useFocusable<HTMLButtonElement>({
    id: 'store_detail_add_lib',
    scopeId: 'console_store_detail_scope',
    onConfirm: () => {
      void handleAddLibrary()
    },
  })

  const wishBtn = useFocusable<HTMLButtonElement>({
    id: 'store_detail_wishlist',
    scopeId: 'console_store_detail_scope',
    onConfirm: () => {
      void handleAddWishlist()
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

  return (
    <FocusScope id="console_store_detail_scope" orientation="vertical" className="space-y-8 pb-20">
      {/* Hero Banner Card */}
      <div
        className={`relative overflow-hidden rounded-[2rem] border shadow-2xl ${
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

        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-end gap-8 p-8 md:p-10">
          {coverImg && (
            <img
              src={coverImg}
              alt={hubGame.name}
              className="h-64 w-44 shrink-0 rounded-2xl border-2 border-white/20 object-cover shadow-2xl"
            />
          )}

          <div className="flex-1 space-y-4">
            {/* Badges Row */}
            <div className="flex flex-wrap items-center gap-2.5">
              {hubGame.discount_percent && hubGame.discount_percent > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400 px-3 py-1 text-xs font-black text-slate-950 shadow">
                  <Tag className="size-3.5" />-{hubGame.discount_percent}% OFF
                </span>
              ) : null}
              {hubGame.sale_price_formatted && (
                <span className="rounded-full bg-cyan-400/20 border border-cyan-400/40 px-3 py-1 text-xs font-extrabold text-cyan-300">
                  {hubGame.sale_price_formatted}
                </span>
              )}
              {scores.metacritic && scores.metacritic > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 border border-emerald-400/40 px-3 py-1 text-xs font-extrabold text-emerald-300">
                  <Sparkles className="size-3.5" />
                  Metacritic {scores.metacritic}
                </span>
              ) : null}
              {scores.opencritic && scores.opencritic > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 border border-amber-400/40 px-3 py-1 text-xs font-extrabold text-amber-300">
                  <Sparkles className="size-3.5" />
                  OpenCritic {scores.opencritic}
                </span>
              ) : null}
              {genres.slice(0, 4).map((gn) => (
                <span
                  key={gn}
                  className={`rounded-full px-3 py-1 text-xs font-bold ${
                    isLight
                      ? 'bg-slate-200 text-slate-800'
                      : 'bg-white/10 text-slate-200 backdrop-blur-md'
                  }`}
                >
                  {gn}
                </span>
              ))}
            </div>

            <h1
              className={`text-4xl md:text-5xl font-black tracking-tight ${
                isLight ? 'text-slate-900' : 'text-white'
              }`}
            >
              {hubGame.name}
            </h1>

            <div
              className={`flex flex-wrap items-center gap-6 text-sm font-semibold ${
                isLight ? 'text-slate-600' : 'text-slate-300'
              }`}
            >
              {details?.developer && (
                <span className="flex items-center gap-1.5">
                  <Building2 className="size-4 text-cyan-400" />
                  {details.developer}
                </span>
              )}
              {(details?.release_date || hubGame.release_date) && (
                <span className="flex items-center gap-1.5">
                  <Calendar className="size-4 text-amber-400" />
                  {details?.release_date || hubGame.release_date}
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
                className={`max-w-3xl text-sm md:text-base leading-relaxed line-clamp-4 ${
                  isLight ? 'text-slate-700' : 'text-slate-200/90'
                }`}
              >
                {summaryText}
              </p>
            )}

            {/* Primary Action Buttons */}
            <div className="flex flex-wrap items-center gap-3.5 pt-3">
              <button
                type="button"
                {...addLibBtn.focusProps}
                disabled={addingLib}
                className={`flex items-center gap-2.5 rounded-2xl px-7 py-3.5 text-sm font-extrabold transition-all cursor-pointer ${
                  addLibBtn.isFocused
                    ? 'scale-105 bg-cyan-400 text-slate-950 ring-4 ring-cyan-300/60 shadow-[0_0_35px_rgba(0,229,255,0.65)]'
                    : addedLib
                      ? 'bg-emerald-500 text-slate-950'
                      : 'bg-cyan-500 text-slate-950 hover:bg-cyan-400'
                }`}
              >
                {addedLib ? <Check className="size-5 stroke-[3]" /> : <Plus className="size-5 stroke-[3]" />}
                <span>
                  {addedLib ? 'Added to Library' : addingLib ? 'Adding...' : 'Add to Library'}
                </span>
              </button>

              <button
                type="button"
                {...wishBtn.focusProps}
                disabled={addingWish}
                className={`flex items-center gap-2 rounded-2xl border px-6 py-3.5 text-sm font-bold transition-all cursor-pointer ${
                  wishBtn.isFocused
                    ? 'scale-105 border-amber-300 bg-amber-400 text-slate-950'
                    : addedWish
                      ? 'border-amber-400/50 bg-amber-500/20 text-amber-300'
                      : isLight
                        ? 'border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200'
                        : 'border-white/15 bg-white/10 text-white hover:bg-white/15'
                }`}
              >
                <Heart className={`size-4 ${addedWish ? 'fill-current' : ''}`} />
                <span>{addedWish ? 'Wishlisted' : 'Add to Wishlist'}</span>
              </button>

              <button
                type="button"
                {...ostBtn.focusProps}
                className={`flex items-center gap-2 rounded-2xl border px-6 py-3.5 text-sm font-bold transition-all cursor-pointer ${
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

              {(details?.videos?.length || details?.trailer_url) ? (
                <button
                  type="button"
                  {...trailerBtn.focusProps}
                  className={`flex items-center gap-2 rounded-2xl border px-6 py-3.5 text-sm font-bold transition-all cursor-pointer ${
                    trailerBtn.isFocused
                      ? 'scale-105 border-rose-300 bg-rose-400 text-slate-950'
                      : isLight
                        ? 'border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200'
                        : 'border-white/15 bg-white/10 text-white hover:bg-white/15'
                  }`}
                >
                  <Film className="size-4" />
                  <span>Watch Trailer</span>
                </button>
              ) : null}

              <button
                type="button"
                {...backBtn.focusProps}
                className={`flex items-center gap-2 rounded-2xl border px-5 py-3.5 text-sm font-bold transition-all cursor-pointer ${
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

      {/* HD Screenshots Gallery */}
      {loading ? (
        <div className="p-8 text-center text-sm text-slate-400 animate-pulse">
          Loading screenshots & system specifications...
        </div>
      ) : screenshots.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-2">
            <h2
              className={`text-xl font-extrabold ${isLight ? 'text-slate-900' : 'text-white'}`}
            >
              HD Screenshots & Media ({screenshots.length})
            </h2>
            <span className="text-xs font-semibold text-slate-400">
              Select any screenshot to view fullscreen
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {screenshots.slice(0, 6).map((url, idx) => (
              <StoreScreenshotTile
                key={url}
                id={`store_shot_${idx}`}
                url={url}
                onOpen={() => setLightboxImg(url)}
              />
            ))}
          </div>
        </div>
      ) : null}

      {/* PC System Requirements */}
      {(sysReq?.minimum || sysReq?.recommended) && (
        <div
          className={`rounded-3xl border p-6 space-y-4 ${
            isLight
              ? 'border-slate-300 bg-white/85'
              : 'border-white/12 bg-white/[0.04]'
          }`}
        >
          <h2
            className={`flex items-center gap-2 text-xl font-extrabold ${
              isLight ? 'text-slate-900' : 'text-white'
            }`}
          >
            <Cpu className="size-5 text-cyan-400" />
            PC System Requirements
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
            {sysReq.minimum && (
              <div
                className={`rounded-2xl border p-4 space-y-2 ${
                  isLight ? 'border-slate-200 bg-slate-50' : 'border-white/10 bg-slate-950/60'
                }`}
              >
                <p className="text-sm font-black uppercase text-cyan-400">Minimum Specs</p>
                {sysReq.minimum.os && <p><strong>OS:</strong> {sysReq.minimum.os}</p>}
                {sysReq.minimum.processor && <p><strong>CPU:</strong> {sysReq.minimum.processor}</p>}
                {sysReq.minimum.memory && <p><strong>RAM:</strong> {sysReq.minimum.memory}</p>}
                {sysReq.minimum.graphics && <p><strong>GPU:</strong> {sysReq.minimum.graphics}</p>}
                {sysReq.minimum.storage && <p><strong>Storage:</strong> {sysReq.minimum.storage}</p>}
              </div>
            )}
            {sysReq.recommended && (
              <div
                className={`rounded-2xl border p-4 space-y-2 ${
                  isLight ? 'border-slate-200 bg-slate-50' : 'border-white/10 bg-slate-950/60'
                }`}
              >
                <p className="text-sm font-black uppercase text-emerald-400">Recommended Specs</p>
                {sysReq.recommended.os && <p><strong>OS:</strong> {sysReq.recommended.os}</p>}
                {sysReq.recommended.processor && <p><strong>CPU:</strong> {sysReq.recommended.processor}</p>}
                {sysReq.recommended.memory && <p><strong>RAM:</strong> {sysReq.recommended.memory}</p>}
                {sysReq.recommended.graphics && <p><strong>GPU:</strong> {sysReq.recommended.graphics}</p>}
                {sysReq.recommended.storage && <p><strong>Storage:</strong> {sysReq.recommended.storage}</p>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Inline Store Game Soundtrack Section (#12) */}
      <InlineGameSoundtrackSection
        scopeId="console_store_detail_scope"
        gameId={`hub_${hubGame.igdb_id}`}
        gameName={hubGame.name}
        coverUrl={details?.cover_url ?? hubGame.cover_url}
        steamAppId={details?.steam_app_id ?? hubGame.steam_app_id}
        igdbId={hubGame.igdb_id}
        isLight={isLight}
      />

      {/* Similar Games Shelf */}
      {similar.length > 0 && (
        <ConsoleRow
          rowId="store_detail_similar"
          title="More Like This"
          subtitle="Stay in Console Mode & explore similar titles"
          items={similar.slice(0, 12).map((hg) => ({
            id: `sim_${hg.igdb_id}`,
            hubGame: hg,
          }))}
          onSelectGame={() => {}}
          onSelectHubGame={onSelectSimilarHubGame}
        />
      )}

      {/* Fullscreen Screenshot Lightbox */}
      <AnimatePresence>
        {lightboxImg && (
          <motion.div
            key="store-shot-lightbox"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLightboxImg(null)}
            className="fixed inset-0 z-[280] flex items-center justify-center bg-black/90 backdrop-blur-xl p-8 cursor-pointer"
          >
            <img
              src={lightboxImg}
              alt="Screenshot Fullscreen"
              className="max-h-[88vh] max-w-[92vw] rounded-3xl border border-white/20 object-contain shadow-2xl"
            />
            <button
              type="button"
              onClick={() => setLightboxImg(null)}
              className="absolute right-8 top-8 rounded-full bg-white/15 p-3 text-white hover:bg-white/25"
            >
              <X className="size-6" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </FocusScope>
  )
}

const StoreScreenshotTile: React.FC<{
  id: string
  url: string
  onOpen: () => void
}> = ({ id, url, onOpen }) => {
  const { focusProps, isFocused } = useFocusable<HTMLButtonElement>({
    id,
    scopeId: 'console_store_detail_scope',
    onConfirm: onOpen,
  })
  return (
    <button
      type="button"
      {...focusProps}
      className={`group relative aspect-video w-full overflow-hidden rounded-2xl border transition-all cursor-pointer ${
        isFocused
          ? 'scale-[1.03] border-cyan-300 ring-4 ring-cyan-400/50 shadow-2xl z-10'
          : 'border-white/15 opacity-90 hover:opacity-100'
      }`}
    >
      <img
        src={url}
        alt=""
        loading="lazy"
        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-end p-3">
        <span className="rounded-xl bg-black/70 p-2 text-white">
          <Maximize2 className="size-4" />
        </span>
      </div>
    </button>
  )
}
