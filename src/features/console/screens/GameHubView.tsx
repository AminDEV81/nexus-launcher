import React, { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Play,
  Square,
  Heart,
  ShieldCheck,
  Music,
  RotateCcw,
  Sparkles,
  Clock,
  Calendar,
  Building2,
  ArrowLeft,
  HardDrive,
  Maximize2,
  Film,
  X,
  FolderOpen,
} from 'lucide-react'
import { toast } from 'sonner'
import type { Game, HubGameDetails, SaveSnapshot } from '@/types/models'
import { formatElapsed, formatPlaytime } from '@/features/library/utils/format'
import { useLaunchStore } from '@/store/launch-store'
import { formatBytes } from '@/features/library/utils/guess-name'
import { getGameScreenshots } from '@/services/games'
import { getHubGameDetails, openTrailerWindow, resolveHubGameScores } from '@/services/hub'
import { listSaveSnapshots, restoreSaveSnapshot } from '@/services/save-manager'
import { useConsoleStore } from '../store/console-store'
import { CONSOLE_THEMES } from '../theme/tokens'
import { FocusScope, useFocusable } from '../nav/FocusScope'
import { resolveConsoleHighResUrl } from '../ui/Tile'
import { Glyph } from '../ui/Glyph'
import { InlineGameSoundtrackSection } from '../ui/InlineGameSoundtrackSection'

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
  const elapsedSeconds = useLaunchStore((s) => s.elapsedSeconds[game.id] ?? 0)

  const [snapshots, setSnapshots] = useState<SaveSnapshot[]>([])
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [screenshots, setScreenshots] = useState<string[]>([])
  const [hubDetails, setHubDetails] = useState<HubGameDetails | null>(null)
  const [lightboxImg, setLightboxImg] = useState<string | null>(null)
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

    // 1. Load Save Guardian snapshots
    listSaveSnapshots(game.id)
      .then((list) => {
        if (!cancelled) setSnapshots(list.slice(0, 6))
      })
      .catch(() => {
        if (!cancelled) setSnapshots([])
      })

    // 2. Load local + IGDB screenshots & supplemental metadata (#15)
    Promise.all([
      getGameScreenshots(game.id).catch(() => [] as string[]),
      game.igdb_id
        ? getHubGameDetails(game.igdb_id, game.name).catch(() => null)
        : Promise.resolve(null),
    ]).then(([localShots, igdbData]) => {
      if (cancelled) return
      if (igdbData) setHubDetails(igdbData)
      const merged = [
        ...localShots,
        ...(igdbData?.screenshot_urls ?? []),
      ]
        .map((u) => resolveConsoleHighResUrl(u))
        .filter((u): u is string => Boolean(u))
      setScreenshots(Array.from(new Set(merged)))
    })

    // 3. Resolve critic scores if not stored yet
    if (!game.metacritic_score && !game.opencritic_score) {
      resolveHubGameScores({
        gameName: game.name,
        releaseDate: game.release_date,
      })
        .then((sc) => {
          if (!cancelled) setScores(sc)
        })
        .catch(() => {})
    }

    return () => {
      cancelled = true
    }
  }, [game])

  const handleOpenGameOst = () => {
    // Requirement #12: Stay right inside the Game Page and scroll smoothly to the inline OST section!
    const el = document.getElementById('game-page-inline-soundtrack')
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  const handleWatchTrailer = () => {
    const vid = hubDetails?.videos?.[0]?.video_id
    if (vid) {
      void openTrailerWindow(vid, `${game.name} — Trailer`).catch(() => {})
    } else if (game.trailer_url || hubDetails?.trailer_url) {
      window.open(game.trailer_url || hubDetails?.trailer_url || '', '_blank')
    } else {
      toast.info('No trailer video available for this game')
    }
  }

  const playBtn = useFocusable<HTMLButtonElement>({
    id: 'hub_action_play',
    scopeId: 'console_game_hub',
    onConfirm: () => onPlayOrResume(game),
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

  const handleRestoreSnapshot = async (snap: SaveSnapshot) => {
    if (restoringId) return
    setRestoringId(snap.id)
    try {
      await restoreSaveSnapshot(game.id, snap.id)
      toast.success('Save snapshot restored safely via Save Guardian!')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to restore snapshot')
    } finally {
      setRestoringId(null)
    }
  }

  const backdrop = resolveConsoleHighResUrl(
    game.background_path ??
      game.banner_path ??
      screenshots[0] ??
      hubDetails?.backdrop_url ??
      game.cover_path,
  )
  const cover = resolveConsoleHighResUrl(game.cover_path)
  const logoSrc = resolveConsoleHighResUrl(game.logo_path)
  const descriptionText = game.description || hubDetails?.summary
  const developerText = game.developer || hubDetails?.developer
  const publisherText = game.publisher || hubDetails?.publisher
  const releaseText = game.release_date || hubDetails?.release_date

  return (
    <FocusScope id="console_game_hub" orientation="vertical" className="space-y-8 pb-20">
      {/* High-Clarity 1080p Hero Showcase Card */}
      <div
        className={`relative overflow-hidden rounded-[2rem] border shadow-2xl ${
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

        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-end gap-8 p-8 md:p-10">
          {cover && (
            <img
              src={cover}
              alt={game.name}
              className="h-64 w-44 shrink-0 rounded-2xl border-2 border-white/20 object-cover shadow-2xl"
            />
          )}

          <div className="flex-1 space-y-4">
            <div className="flex flex-wrap items-center gap-2.5">
              {isRunning && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400 px-3 py-1 text-xs font-black uppercase text-slate-950">
                  <span className="size-2 rounded-full bg-slate-950 animate-ping" />
                  Running Now
                </span>
              )}
              <span className="rounded-full bg-cyan-500/20 border border-cyan-400/40 px-3 py-1 text-xs font-extrabold uppercase text-cyan-300">
                {game.source || 'PC Library'}
              </span>
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
              {game.genres.map((gn) => (
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
                className="max-h-20 max-w-md object-contain object-left drop-shadow-2xl"
              />
            ) : (
              <h1
                className={`text-4xl md:text-5xl font-black tracking-tight ${
                  isLight ? 'text-slate-900' : 'text-white'
                }`}
              >
                {game.name}
              </h1>
            )}

            {/* Key Game Telemetry Strip */}
            <div
              className={`flex flex-wrap items-center gap-6 text-sm font-semibold ${
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
                className={`max-w-3xl text-sm md:text-base leading-relaxed line-clamp-4 ${
                  isLight ? 'text-slate-700' : 'text-slate-200/90'
                }`}
              >
                {descriptionText.replace(/<[^>]+>/g, '')}
              </p>
            )}

            {/* Primary Action Bar */}
            <div className="flex flex-wrap items-center gap-3.5 pt-3">
              <button
                type="button"
                {...playBtn.focusProps}
                className={`flex items-center gap-3 rounded-2xl px-8 py-4 text-base font-extrabold transition-all cursor-pointer ${
                  isRunning
                    ? playBtn.isFocused
                      ? 'scale-105 bg-rose-500 text-white ring-4 ring-rose-300/60 shadow-[0_0_35px_rgba(244,63,94,0.65)]'
                      : 'bg-rose-500/90 text-white hover:bg-rose-500'
                    : playBtn.isFocused
                      ? 'scale-105 bg-cyan-400 text-slate-950 ring-4 ring-cyan-300/60 shadow-[0_0_35px_rgba(0,229,255,0.65)]'
                      : 'bg-cyan-500 text-slate-950 hover:bg-cyan-400'
                }`}
              >
                {isRunning ? (
                  <>
                    <Square className="size-4 fill-current" />
                    <span>Stop · {formatElapsed(elapsedSeconds)}</span>
                  </>
                ) : (
                  <>
                    <Play className="size-5 fill-current" />
                    <span>Play Now</span>
                  </>
                )}
                <Glyph button="confirm" size="sm" />
              </button>

              <button
                type="button"
                {...ostBtn.focusProps}
                className={`flex items-center gap-2.5 rounded-2xl border px-6 py-4 text-sm font-bold transition-all cursor-pointer ${
                  ostBtn.isFocused
                    ? 'scale-105 border-violet-300 bg-violet-400 text-slate-950 shadow-lg'
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
                {...favBtn.focusProps}
                className={`flex items-center gap-2.5 rounded-2xl border px-6 py-4 text-sm font-bold transition-all cursor-pointer ${
                  favBtn.isFocused
                    ? 'scale-105 border-amber-300 bg-amber-400 text-slate-950 shadow-lg'
                    : isLight
                      ? 'border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200'
                      : 'border-white/15 bg-white/10 text-white hover:bg-white/15'
                }`}
              >
                <Heart className={`size-4 ${game.is_favorite ? 'fill-current text-amber-400' : ''}`} />
                <span>{game.is_favorite ? 'Favorited' : 'Favorite'}</span>
              </button>

              {(game.trailer_url || hubDetails?.videos?.length || hubDetails?.trailer_url) ? (
                <button
                  type="button"
                  {...trailerBtn.focusProps}
                  className={`flex items-center gap-2 rounded-2xl border px-5 py-4 text-sm font-bold transition-all cursor-pointer ${
                    trailerBtn.isFocused
                      ? 'scale-105 border-rose-300 bg-rose-400 text-slate-950'
                      : isLight
                        ? 'border-slate-300 bg-slate-100 text-slate-800'
                        : 'border-white/15 bg-white/10 text-white'
                  }`}
                >
                  <Film className="size-4" />
                  <span>Trailer</span>
                </button>
              ) : null}

              <button
                type="button"
                {...backBtn.focusProps}
                className={`flex items-center gap-2 rounded-2xl border px-5 py-4 text-sm font-bold transition-all cursor-pointer ${
                  backBtn.isFocused
                    ? 'scale-105 border-cyan-300 bg-white text-slate-950'
                    : isLight
                      ? 'border-slate-300 bg-white text-slate-700'
                      : 'border-white/15 bg-white/5 text-slate-300'
                }`}
              >
                <ArrowLeft className="size-4" />
                <span>Back</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive HD Screenshot Showcase (#15) */}
      {screenshots.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-2">
            <h2 className={`text-xl font-extrabold ${isLight ? 'text-slate-900' : 'text-white'}`}>
              Screenshots & Visual Showcase ({screenshots.length})
            </h2>
            <span className="text-xs font-semibold text-slate-400">
              Press Enter or Click to enlarge
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {screenshots.slice(0, 6).map((url, idx) => (
              <HubScreenshotCard
                key={url}
                id={`hub_shot_${idx}`}
                url={url}
                onOpen={() => setLightboxImg(url)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Inline Game Soundtrack Section (#12: Shows & plays OST right inside the Game Page!) */}
      <InlineGameSoundtrackSection
        scopeId="console_game_hub"
        gameId={game.id}
        gameName={game.name}
        coverUrl={game.cover_path}
        steamAppId={game.steam_app_id}
        igdbId={game.igdb_id}
        isLight={isLight}
      />

      {/* Save Guardian Snapshots Section */}
      <div
        className={`rounded-3xl border p-6 space-y-4 ${
          isLight
            ? 'border-slate-300 bg-white/85 shadow-xs'
            : 'border-white/12 bg-white/[0.04]'
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="size-5 text-cyan-400" />
            <h2 className={`text-xl font-extrabold ${isLight ? 'text-slate-900' : 'text-white'}`}>
              Save Guardian Vault & Checkpoints
            </h2>
          </div>
          <span className="text-xs font-bold text-cyan-400">
            {snapshots.length} Isolated Save Checkpoints
          </span>
        </div>

        {snapshots.length === 0 ? (
          <p className={`text-sm ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
            Save snapshots are captured automatically each time you exit the game.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {snapshots.map((snap) => (
              <SnapshotCard
                key={snap.id}
                snap={snap}
                busy={restoringId === snap.id}
                isLight={isLight}
                onRestore={() => {
                  void handleRestoreSnapshot(snap)
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Fullscreen Screenshot Lightbox */}
      <AnimatePresence>
        {lightboxImg && (
          <motion.div
            key="game-hub-lightbox"
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

const HubScreenshotCard: React.FC<{
  id: string
  url: string
  onOpen: () => void
}> = ({ id, url, onOpen }) => {
  const { focusProps, isFocused } = useFocusable<HTMLButtonElement>({
    id,
    scopeId: 'console_game_hub',
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

const SnapshotCard: React.FC<{
  snap: SaveSnapshot
  busy: boolean
  isLight: boolean
  onRestore: () => void
}> = ({ snap, busy, isLight, onRestore }) => {
  const { focusProps, isFocused } = useFocusable<HTMLButtonElement>({
    id: `hub_snap_${snap.id}`,
    scopeId: 'console_game_hub',
    onConfirm: onRestore,
  })
  return (
    <button
      type="button"
      {...focusProps}
      disabled={busy}
      className={`flex items-center justify-between rounded-2xl border p-4 text-left transition-all cursor-pointer ${
        isFocused
          ? 'scale-[1.03] border-cyan-300 bg-cyan-400 text-slate-950 shadow-lg'
          : isLight
            ? 'border-slate-200 bg-slate-50 text-slate-900'
            : 'border-white/10 bg-slate-900/70 text-white'
      }`}
    >
      <div className="min-w-0 pr-3">
        <p className="truncate text-sm font-extrabold">
          {snap.note || `Checkpoint ${snap.id.slice(0, 6)}`}
        </p>
        <p className={`mt-1 text-xs ${isFocused ? 'text-slate-800' : 'text-slate-400'}`}>
          {snap.created_at}
        </p>
      </div>
      <span
        className={`inline-flex shrink-0 items-center gap-1.5 text-xs font-extrabold ${
          isFocused ? 'text-slate-950' : 'text-cyan-400'
        }`}
      >
        <RotateCcw className="size-4" />
        Restore
      </span>
    </button>
  )
}
