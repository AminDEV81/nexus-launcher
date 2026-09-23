import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Play,
  Pause,
  Heart,
  FolderOpen,
  FolderSearch,
  Copy,
  Check,
  ExternalLink,
  Star,
  Clock,
  CalendarClock,
  HardDrive,
  Image as ImageIcon,
  Images,
  Loader2,
  Maximize2,
  Download,
  Type,
  Mountain,
  Pencil,
  Square,
  Info,
  Terminal,
  Calendar,
  ChevronDown,
  ChevronUp,
  Layers,
  Bookmark,
  CalendarDays,
  Compass,
  Sparkles,
  ArrowRight,
  X,
  RefreshCw,
} from 'lucide-react'
import { openUrl } from '@tauri-apps/plugin-opener'
import { useUiStore } from '@/store/ui-store'
import { useStartDownloadModalStore } from '@/features/downloads/store/start-download-modal-store'
import {
  useDownloads,
  usePauseDownload,
  useResumeDownload,
} from '@/features/downloads/hooks/use-downloads'
import { findActiveDownloadForGame } from '@/features/downloads/utils/match-download'
import { useWindowActive } from '@/hooks/use-window-active'
import { cn } from '@/lib/utils'
import { assetUrl } from '@/lib/asset-url'
import { CoverMedia } from '@/components/ui/cover-media'
import { Modal, ModalCloseButton } from '@/components/ui/modal'
import { toast } from 'sonner'
import { playButtonClick } from '@/lib/sound-engine'
import {
  useGame,
  useUpdateGameFlags,
  useGameScreenshots,
  useUpdateLaunchArguments,
  useUpdatePreLaunchCommand,
  useUpdatePostLaunchCommand,
  useLaunchGame,
  useStopGame,
  usePromoteWishlistGame,
  useSetGameUserRating,
  useSyncGameMetadata,
} from '../hooks/use-games'
import { useLaunchStore } from '@/store/launch-store'
import { useAnimationSpeed } from '@/hooks/use-animation-speed'
import {
  formatElapsed,
  formatExactDateTime,
  formatPlaytime,
  formatRelativeDate,
  formatReleaseDate,
  isGameUnreleased,
} from '../utils/format'
import { openGameFolder, copyGamePath } from '../utils/game-actions'
import { formatBytes } from '../utils/guess-name'
import { genreColor } from '../utils/genre-colors'
import { useTags } from '../hooks/use-tags'
import { CoverPickerModal } from './cover-picker-modal'
import { BannerPickerModal } from './banner-picker-modal'
import { LogoPickerModal } from './logo-picker-modal'
import { ArtworkEditorModal } from './artwork-editor-modal'
import { InstallationEditorModal } from './installation-editor-modal'
import { TagEditorModal } from './tag-editor-modal'
import { PlaytimeEditorModal } from './playtime-editor-modal'
import { EditGameNameModal } from '@/components/modals/edit-game-name-modal'
import { GameSaveCard } from './game-save-card'
import { SidebarSoundtrackWidget } from '@/features/soundtrack/components/sidebar/sidebar-soundtrack-widget'
import type { Game } from '@/types/models'

const PANEL_WIDTH = 450

export function GameDetailsPanel() {
  const selectedId = useUiStore((s) => s.selectedGameId)
  const selectGame = useUiStore((s) => s.selectGame)
  const { data: game } = useGame(selectedId ?? undefined)
  const speed = useAnimationSpeed()

  // Close panel on Escape key
  useEffect(() => {
    if (!selectedId) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') selectGame(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedId, selectGame])

  return (
    <AnimatePresence>
      {selectedId && (
        <motion.aside
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: PANEL_WIDTH, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.28 * speed, ease: [0.16, 1, 0.3, 1] }}
          className="relative z-10 flex shrink-0 flex-col overflow-hidden border-l border-border/80 bg-surface/95 shadow-2xl"
          style={{ willChange: 'width, opacity' }}
        >
          {/* Fixed inner width regardless of the animating outer width —
              content slides into view instead of reflowing/squishing as
              the panel grows, which reads as far smoother. */}
          <div style={{ width: PANEL_WIDTH }} className="flex h-full flex-col">
            <AnimatePresence mode="wait" initial={false}>
              {game ? (
                <motion.div
                  key={game.id}
                  className="h-full"
                  initial={{ opacity: 0, x: 18 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -18 }}
                  transition={{ duration: 0.22 * speed, ease: [0.16, 1, 0.3, 1] }}
                >
                  <PanelContent game={game} onClose={() => selectGame(null)} />
                </motion.div>
              ) : (
                <PanelSkeleton key="skeleton" onClose={() => selectGame(null)} />
              )}
            </AnimatePresence>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
function PanelContent({ game, onClose }: { game: Game; onClose: () => void }) {
  const openDownloadModal = useStartDownloadModalStore((s) => s.open)
  const updateFlags = useUpdateGameFlags()
  const syncMetadataMutation = useSyncGameMetadata()
  const { data: screenshots = [] } = useGameScreenshots(game.id)
  const [lightbox, setLightbox] = useState<number | null>(null)
  const [coverPickerOpen, setCoverPickerOpen] = useState(false)
  const [bannerPickerOpen, setBannerPickerOpen] = useState(false)
  const [renameModalOpen, setRenameModalOpen] = useState(false)
  const [logoPickerOpen, setLogoPickerOpen] = useState(false)
  const [logoEditorOpen, setLogoEditorOpen] = useState(false)
  const [backgroundEditorOpen, setBackgroundEditorOpen] = useState(false)
  const [installationEditorOpen, setInstallationEditorOpen] = useState(false)
  const [tagsEditorOpen, setTagsEditorOpen] = useState(false)
  const [playtimeEditorOpen, setPlaytimeEditorOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'overview' | 'saves' | 'media' | 'launch'>('overview')
  const [descriptionExpanded, setDescriptionExpanded] = useState(false)
  const [copiedFeedback, setCopiedFeedback] = useState(false)

  const { data: allTags } = useTags()
  const gameTags = (allTags ?? []).filter((tag) => game.tag_ids.includes(tag.id))

  const backgroundSrc = assetUrl(game.background_path)
  const bannerSrc = assetUrl(game.banner_path)
  const coverSrc = assetUrl(game.cover_path)
  const heroSrc = backgroundSrc ?? bannerSrc ?? coverSrc
  const heroIsCover = !game.banner_path && !game.background_path
  const logoSrc = assetUrl(game.logo_path)

  const heroRawPath = game.background_path ?? game.banner_path ?? game.cover_path
  const galleryImages = [heroRawPath, ...screenshots].filter(
    (path): path is string => path !== null,
  )

  const updatePreLaunchCommand = useUpdatePreLaunchCommand()
  const updatePostLaunchCommand = useUpdatePostLaunchCommand()

  const launchGame = useLaunchGame()
  const stopGame = useStopGame()
  const promoteWishlist = usePromoteWishlistGame()
  const isRunning = useLaunchStore((s) => s.runningGameIds.has(game.id))
  const elapsedSeconds = useLaunchStore((s) => s.elapsedSeconds[game.id])
  const speed = useAnimationSpeed()
  const navigate = useNavigate()
  const isUnreleased = isGameUnreleased(game.release_date) && !game.is_installed

  const pauseDownload = usePauseDownload()
  const resumeDownload = useResumeDownload()
  const { data: downloads } = useDownloads()
  const activeDownload = useMemo(
    () => findActiveDownloadForGame(downloads, game),
    [downloads, game],
  )
  const isDownloading = Boolean(activeDownload)
  const downloadPercent =
    activeDownload && activeDownload.total_bytes > 0
      ? Math.min(
          100,
          Math.round((activeDownload.downloaded_bytes / activeDownload.total_bytes) * 100),
        )
      : 0

  function handlePlay() {
    if (!game.is_installed) {
      setInstallationEditorOpen(true)
      return
    }
    if (isRunning) {
      if (!stopGame.isPending) stopGame.mutate(game.id)
      return
    }
    if (!launchGame.isPending) launchGame.mutate(game.id)
  }

  function handleCopyPath() {
    void copyGamePath(game)
    setCopiedFeedback(true)
    setTimeout(() => setCopiedFeedback(false), 2000)
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* ── Cinematic Hero Canvas ──────────────────────────────────── */}
      <div className="relative h-64 shrink-0 overflow-hidden bg-surface-raised">
        <button
          type="button"
          onClick={() => galleryImages.length > 0 && setLightbox(0)}
          title={heroSrc ? 'Click to view full image' : undefined}
          className="group absolute inset-0 block cursor-zoom-in overflow-hidden text-left"
        >
          {heroSrc ? (
            <CoverMedia
              src={heroSrc}
              className="size-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
              isAnimated={heroIsCover && game.cover_is_animated}
              animatedEnabled={game.animated_cover_enabled}
              alwaysLive
            />
          ) : (
            <div className="size-full bg-gradient-to-br from-surface-raised via-surface to-surface-raised" />
          )}

          {/* Gradients and Scrim for crisp text contrast */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-surface via-surface/30 to-black/60" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/60 via-transparent to-transparent" />

          {/* Zoom Overlay on Hover */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            <span className="flex size-11 items-center justify-center rounded-2xl border border-white/30 bg-black/80 text-white shadow-xl">
              <Maximize2 className="size-4.5" />
            </span>
          </div>

          {/* Game Title / Logo & Genre Badges at the bottom */}
          <div className="absolute inset-x-5 bottom-4 z-10 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              {logoSrc ? (
                <img
                  src={logoSrc}
                  alt={game.name}
                  className="max-h-16 max-w-[85%] object-contain object-left drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)]"
                />
              ) : (
                <h1 className="text-2xl font-black leading-tight tracking-tight text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
                  {game.name}
                </h1>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  playButtonClick()
                  setRenameModalOpen(true)
                }}
                title="Rename Game"
                className="rounded-xl border border-white/20 bg-black/60 p-1.5 text-white/70 hover:text-white hover:bg-black/80 hover:scale-105 active:scale-95 transition-all shadow-md backdrop-blur-md cursor-pointer"
              >
                <Pencil className="size-3.5" />
              </button>
            </div>

            {game.genres.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {game.genres.map((genre) => {
                  const color = genreColor(genre)
                  return (
                    <span
                      key={genre}
                      className="flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold text-white shadow-xs"
                      style={{ borderColor: `${color}aa`, backgroundColor: `${color}44` }}
                    >
                      <span className="size-1.5 rounded-full" style={{ backgroundColor: color }} />
                      {genre}
                    </span>
                  )
                })}
              </div>
            )}
          </div>
        </button>

        {/* Top Floating Controls */}
        <div className="absolute inset-x-4 top-4 z-20 flex items-center justify-between pointer-events-none">
          {/* Live Playing Status / Live Downloading Indicator */}
          <div>
            {isRunning ? (
              <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-emerald-500/40 bg-black/80 px-3 py-1 shadow-lg">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                </span>
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-400">
                  LIVE NOW {elapsedSeconds !== undefined && `· ${formatElapsed(elapsedSeconds)}`}
                </span>
              </div>
            ) : isDownloading && activeDownload ? (
              <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-accent/40 bg-black/85 px-3 py-1 shadow-lg backdrop-blur-md">
                <span className="relative flex size-2">
                  <span
                    className={cn(
                      'absolute inline-flex size-full rounded-full opacity-75',
                      activeDownload.status === 'downloading' && 'animate-ping bg-accent',
                      activeDownload.status === 'paused' && 'bg-amber-400',
                      activeDownload.status === 'queued' && 'bg-cyan-400',
                      activeDownload.status === 'extracting' && 'animate-ping bg-emerald-400',
                      activeDownload.status === 'failed' && 'bg-rose-500',
                    )}
                  />
                  <span
                    className={cn(
                      'relative inline-flex size-2 rounded-full',
                      activeDownload.status === 'downloading' && 'bg-accent',
                      activeDownload.status === 'paused' && 'bg-amber-400',
                      activeDownload.status === 'queued' && 'bg-cyan-400',
                      activeDownload.status === 'extracting' && 'bg-emerald-400',
                      activeDownload.status === 'failed' && 'bg-rose-500',
                    )}
                  />
                </span>
                <span
                  className={cn(
                    'text-[11px] font-extrabold uppercase tracking-wider',
                    activeDownload.status === 'downloading' && 'text-accent',
                    activeDownload.status === 'paused' && 'text-amber-400',
                    activeDownload.status === 'queued' && 'text-cyan-400',
                    activeDownload.status === 'extracting' && 'text-emerald-400',
                    activeDownload.status === 'failed' && 'text-rose-400',
                  )}
                >
                  {activeDownload.status === 'paused'
                    ? `PAUSED · ${downloadPercent}%`
                    : activeDownload.status === 'extracting'
                      ? `EXTRACTING · ${downloadPercent}%`
                      : activeDownload.status === 'queued'
                        ? `QUEUED · ${downloadPercent}%`
                        : activeDownload.status === 'failed'
                          ? `FAILED · ${downloadPercent}%`
                          : `DOWNLOADING · ${downloadPercent}%`}
                </span>
              </div>
            ) : null}
          </div>

          {/* Quick Header Actions */}
          <div className="pointer-events-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => syncMetadataMutation.mutate(game.id)}
              disabled={syncMetadataMutation.isPending}
              aria-label="Sync metadata from IGDB"
              title="Sync metadata from IGDB"
              className="flex size-8 items-center justify-center rounded-xl border border-white/20 bg-black/75 text-white/90 shadow-md transition-all hover:bg-black/90 hover:scale-105 active:scale-95 disabled:opacity-50"
            >
              <RefreshCw
                className={cn(
                  'size-4',
                  syncMetadataMutation.isPending && 'animate-spin text-accent',
                )}
              />
            </button>

            <button
              type="button"
              onClick={() => setBannerPickerOpen(true)}
              aria-label="Change banner image"
              title="Change banner"
              className="flex size-8 items-center justify-center rounded-xl border border-white/20 bg-black/75 text-white/90 shadow-md transition-all hover:bg-black/90 hover:scale-105 active:scale-95"
            >
              <Images className="size-4" />
            </button>

            <button
              type="button"
              onClick={() => {
                playButtonClick()
                setRenameModalOpen(true)
              }}
              aria-label="Rename game"
              title="Rename game"
              className="flex size-8 items-center justify-center rounded-xl border border-white/20 bg-black/75 text-white/90 shadow-md transition-all hover:bg-black/90 hover:scale-105 active:scale-95 cursor-pointer"
            >
              <Pencil className="size-4" />
            </button>

            <ModalCloseButton
              onClick={onClose}
              aria-label="Close details panel"
              className="bg-black/75 border-white/20 text-white/90"
            />
          </div>
        </div>
      </div>

      {/* ── Main Panel Content ─────────────────────────────────────── */}
      <div className="flex flex-col gap-5 p-5">
        {/* ── Primary Action Command Bar ────────────────────────────── */}
        {isDownloading && activeDownload ? (
          <div
            className={cn(
              'flex flex-col gap-3 rounded-2xl border p-4 shadow-sm',
              activeDownload.status === 'paused'
                ? 'border-amber-500/40 bg-amber-500/10'
                : activeDownload.status === 'failed'
                  ? 'border-rose-500/40 bg-rose-500/10'
                  : 'border-accent/40 bg-accent/10',
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    'flex size-9 items-center justify-center rounded-xl text-white shadow-md',
                    activeDownload.status === 'paused'
                      ? 'bg-amber-500 shadow-amber-500/20'
                      : activeDownload.status === 'failed'
                        ? 'bg-rose-500 shadow-rose-500/20'
                        : 'bg-accent shadow-accent/20',
                  )}
                >
                  {activeDownload.status === 'paused' ? (
                    <Pause className="size-4" />
                  ) : (
                    <Download className="size-4.5 animate-bounce" />
                  )}
                </div>
                <div>
                  <div className="text-xs font-bold text-text">
                    {activeDownload.status === 'extracting'
                      ? 'Extracting game files...'
                      : activeDownload.status === 'paused'
                        ? 'Download Paused'
                        : activeDownload.status === 'queued'
                          ? 'Download Queued'
                          : activeDownload.status === 'failed'
                            ? 'Download Failed'
                            : 'Downloading Game...'}
                  </div>
                  <div className="mt-0.5 text-[10px] font-medium text-subtle">
                    {activeDownload.status === 'paused' ? (
                      <span className="font-semibold text-amber-500">Paused</span>
                    ) : (
                      <span className="font-mono font-bold text-accent">
                        {formatBytes(activeDownload.speed_bps)}/s
                      </span>
                    )}
                    {activeDownload.total_bytes > 0 && (
                      <span>
                        {' '}
                        • {formatBytes(activeDownload.downloaded_bytes)} /{' '}
                        {formatBytes(activeDownload.total_bytes)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <span
                className={cn(
                  'font-mono text-base font-black tabular-nums',
                  activeDownload.status === 'paused'
                    ? 'text-amber-500'
                    : activeDownload.status === 'failed'
                      ? 'text-rose-500'
                      : 'text-accent',
                )}
              >
                {downloadPercent}%
              </span>
            </div>

            {/* High-contrast animated progress bar */}
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-raised ring-1 ring-border/60">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-300',
                  activeDownload.status === 'paused'
                    ? 'bg-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.5)]'
                    : activeDownload.status === 'failed'
                      ? 'bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.5)]'
                      : 'bg-gradient-to-r from-accent to-accent-hover shadow-[0_0_12px_var(--nx-accent)]',
                )}
                style={{ width: `${downloadPercent}%` }}
              />
            </div>

            <div className="flex items-center gap-2 pt-0.5">
              {activeDownload.status === 'paused' ? (
                <button
                  type="button"
                  onClick={() => resumeDownload.mutate(activeDownload.id)}
                  disabled={resumeDownload.isPending}
                  className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-accent to-accent-hover px-3 text-xs font-bold text-white shadow-xs transition-all hover:scale-[1.01] hover:shadow-accent/30 active:scale-[0.98] disabled:opacity-60"
                >
                  <Play className="size-3.5 fill-current" />
                  <span>Resume Download</span>
                </button>
              ) : activeDownload.status === 'downloading' ? (
                <button
                  type="button"
                  onClick={() => pauseDownload.mutate(activeDownload.id)}
                  disabled={pauseDownload.isPending}
                  className="flex h-9 items-center justify-center gap-1.5 rounded-xl border border-border/90 bg-surface px-3 text-xs font-semibold text-text shadow-xs transition-all hover:bg-surface-raised active:scale-[0.98] disabled:opacity-60"
                  title="Pause download"
                >
                  <Pause className="size-3.5" />
                  <span>Pause</span>
                </button>
              ) : activeDownload.status === 'failed' ? (
                <button
                  type="button"
                  onClick={() => resumeDownload.mutate(activeDownload.id)}
                  disabled={resumeDownload.isPending}
                  className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-rose-600 px-3 text-xs font-bold text-white shadow-xs transition-all hover:bg-rose-500 active:scale-[0.98] disabled:opacity-60"
                >
                  <Download className="size-3.5" />
                  <span>Retry Download</span>
                </button>
              ) : null}

              <button
                type="button"
                onClick={() => navigate('/downloads')}
                className={cn(
                  'flex h-9 items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-bold shadow-xs transition-all active:scale-[0.98]',
                  activeDownload.status === 'paused' || activeDownload.status === 'failed'
                    ? 'border-border/90 bg-surface text-text hover:bg-surface-raised'
                    : 'flex-1 border-accent/30 bg-surface text-accent hover:bg-accent hover:text-white',
                )}
              >
                <span>View in Downloads</span>
                <ArrowRight className="size-3.5" />
              </button>

              <IconButton
                active={game.is_favorite}
                onClick={() => updateFlags.mutate({ id: game.id, is_favorite: !game.is_favorite })}
                label={game.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
                activeClassName="border-pink-500/40 bg-pink-500/15 text-pink-500 shadow-sm shadow-pink-500/10"
              >
                <Heart className={cn('size-4', game.is_favorite && 'fill-current text-pink-500')} />
              </IconButton>
            </div>
          </div>
        ) : isUnreleased ? (
          <div className="flex flex-col gap-2.5">
            <ReleaseCountdownCard
              releaseDate={game.release_date!}
              onRelease={() => {
                if (game.is_wishlist) {
                  promoteWishlist.mutate(game.id, {
                    onSuccess: () => {
                      toast.success(
                        `🎉 ${game.name} has been released and added to your library!`,
                        { duration: 6000 },
                      )
                    },
                  })
                }
              }}
            />
            <div className="flex items-center gap-2">
              {game.igdb_id ? (
                <button
                  type="button"
                  onClick={() => navigate(`/hub/${game.igdb_id}`)}
                  className="group flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-border/90 bg-surface px-4 text-xs font-bold text-text shadow-sm transition-all hover:border-accent/40 hover:bg-surface-raised hover:text-accent active:scale-[0.98]"
                >
                  <Compass className="size-4 text-accent transition-transform group-hover:rotate-45" />
                  <span>Explore on Game Hub</span>
                </button>
              ) : null}

              <IconButton
                active={game.is_favorite}
                onClick={() => updateFlags.mutate({ id: game.id, is_favorite: !game.is_favorite })}
                label={game.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
                activeClassName="border-pink-500/40 bg-pink-500/15 text-pink-500 shadow-sm shadow-pink-500/10"
              >
                <Heart className={cn('size-4', game.is_favorite && 'fill-current text-pink-500')} />
              </IconButton>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {!game.is_installed ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    openDownloadModal({
                      gameId: game.id,
                      igdbId: game.igdb_id,
                      name: game.name,
                      coverUrl: game.cover_path ? (assetUrl(game.cover_path) ?? null) : null,
                    })
                  }}
                  className="group relative flex h-11 flex-1 items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-accent to-accent-hover px-4 text-xs font-bold text-white shadow-lg shadow-accent/20 transition-all hover:shadow-accent/30 hover:scale-[1.01] active:scale-[0.98]"
                  title="Search and download game files"
                >
                  <Download className="size-4 shrink-0 transition-transform group-hover:-translate-y-0.5" />
                  <span className="truncate">Download Game</span>
                </button>

                <button
                  type="button"
                  onClick={() => setInstallationEditorOpen(true)}
                  className="group flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-border/90 bg-surface px-3 text-xs font-semibold text-text shadow-sm transition-all hover:bg-surface-raised hover:border-border-hover active:scale-[0.98]"
                  title="Locate game installation directory or executable"
                >
                  <FolderSearch className="size-4 shrink-0 text-accent transition-transform group-hover:scale-110" />
                  <span className="truncate">Locate Files</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handlePlay}
                disabled={launchGame.isPending || stopGame.isPending}
                className={cn(
                  'relative flex h-11 flex-1 items-center justify-center gap-2.5 overflow-hidden rounded-xl px-5 text-xs font-extrabold uppercase tracking-wider text-white shadow-md transition-all active:scale-[0.98]',
                  isRunning
                    ? 'bg-gradient-to-r from-rose-600 to-red-600 shadow-rose-500/20 hover:from-rose-500 hover:to-red-500'
                    : 'bg-gradient-to-r from-accent to-accent-hover shadow-accent/25 hover:shadow-accent/40 hover:scale-[1.01] disabled:opacity-60',
                )}
              >
                <AnimatePresence mode="wait" initial={false}>
                  {isRunning ? (
                    <motion.span
                      key="playing"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ duration: 0.18 * speed }}
                      className="flex items-center gap-2"
                    >
                      {stopGame.isPending ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Square className="size-3.5 fill-current" />
                      )}
                      <span>
                        {stopGame.isPending
                          ? 'Stopping Game…'
                          : `Stop Game ${elapsedSeconds !== undefined ? `(${formatElapsed(elapsedSeconds)})` : ''}`}
                      </span>
                    </motion.span>
                  ) : launchGame.isPending ? (
                    <motion.span
                      key="launching"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ duration: 0.18 * speed }}
                      className="flex items-center gap-2"
                    >
                      <Loader2 className="size-4 animate-spin" />
                      <span>Launching…</span>
                    </motion.span>
                  ) : (
                    <motion.span
                      key="play"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ duration: 0.18 * speed }}
                      className="flex items-center gap-2"
                    >
                      <Play className="size-4 fill-current" />
                      <span>Play Now</span>
                    </motion.span>
                  )}
                </AnimatePresence>
              </button>
            )}

            {/* Favorite Toggle Button */}
            <IconButton
              active={game.is_favorite}
              onClick={() => updateFlags.mutate({ id: game.id, is_favorite: !game.is_favorite })}
              label={game.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
              activeClassName="border-pink-500/40 bg-pink-500/15 text-pink-500 shadow-sm shadow-pink-500/10"
            >
              <Heart className={cn('size-4', game.is_favorite && 'fill-current text-pink-500')} />
            </IconButton>

            {/* Open Folder & Copy Path */}
            {game.is_installed && (
              <>
                <IconButton onClick={() => void openGameFolder(game)} label="Open game folder">
                  <FolderOpen className="size-4" />
                </IconButton>
                <IconButton
                  onClick={handleCopyPath}
                  label={copiedFeedback ? 'Copied to clipboard!' : 'Copy game path'}
                >
                  {copiedFeedback ? (
                    <Check className="size-4 text-emerald-400" />
                  ) : (
                    <Copy className="size-4" />
                  )}
                </IconButton>
              </>
            )}
          </div>
        )}

        {/* ── Quick Stats Grid ──────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-2.5">
          {isDownloading && activeDownload ? (
            <>
              <StatCard
                icon={Download}
                iconColor={activeDownload.status === 'paused' ? 'text-amber-400' : 'text-accent'}
                iconBg={
                  activeDownload.status === 'paused'
                    ? 'bg-amber-500/10 border-amber-500/20'
                    : 'bg-accent/10 border-accent/20'
                }
                label="Download Status"
                value={
                  activeDownload.status === 'extracting'
                    ? 'Extracting'
                    : activeDownload.status === 'paused'
                      ? 'Paused'
                      : activeDownload.status === 'queued'
                        ? 'Queued'
                        : activeDownload.status === 'failed'
                          ? 'Failed'
                          : 'Downloading'
                }
              />
              <StatCard
                icon={Sparkles}
                iconColor={
                  activeDownload.status === 'paused' ? 'text-amber-400' : 'text-emerald-400'
                }
                iconBg={
                  activeDownload.status === 'paused'
                    ? 'bg-amber-500/10 border-amber-500/20'
                    : 'bg-emerald-500/10 border-emerald-500/20'
                }
                label="Transfer Speed"
                value={
                  activeDownload.status === 'paused'
                    ? 'Paused'
                    : `${formatBytes(activeDownload.speed_bps)}/s`
                }
              />
              <StatCard
                icon={HardDrive}
                iconColor="text-cyan-400"
                iconBg="bg-cyan-500/10 border-cyan-500/20"
                label="Downloaded Size"
                value={
                  activeDownload.total_bytes > 0
                    ? `${formatBytes(activeDownload.downloaded_bytes)} / ${formatBytes(activeDownload.total_bytes)}`
                    : formatBytes(activeDownload.downloaded_bytes)
                }
              />
              <StatCard
                icon={Clock}
                iconColor="text-violet-400"
                iconBg="bg-violet-500/10 border-violet-500/20"
                label="Progress"
                value={`${downloadPercent}%`}
              />
            </>
          ) : isUnreleased ? (
            <>
              <StatCard
                icon={Clock}
                iconColor="text-amber-400"
                iconBg="bg-amber-500/10 border-amber-500/20"
                label="Game Status"
                value="Upcoming"
              />
              <StatCard
                icon={CalendarClock}
                iconColor="text-violet-400"
                iconBg="bg-violet-500/10 border-violet-500/20"
                label="Launch Date"
                value={formatReleaseDate(game.release_date)}
              />
              <StatCard
                icon={Bookmark}
                iconColor="text-accent"
                iconBg="bg-accent/10 border-accent/20"
                label="Status"
                value="Wishlisted"
              />
              <StatCard
                icon={HardDrive}
                iconColor="text-emerald-400"
                iconBg="bg-emerald-500/10 border-emerald-500/20"
                label="Install Size"
                value="TBA"
              />
            </>
          ) : (
            <>
              <StatCard
                icon={Clock}
                iconColor="text-cyan-400"
                iconBg="bg-cyan-500/10 border-cyan-500/20"
                label="Total Playtime"
                value={formatPlaytime(game.total_playtime_seconds)}
                action={
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setPlaytimeEditorOpen(true)
                    }}
                    title="Edit playtime"
                    aria-label="Edit playtime"
                    className="flex size-6 items-center justify-center rounded-lg text-subtle opacity-0 transition-all hover:bg-surface hover:text-cyan-400 group-hover/stat:opacity-100 cursor-pointer"
                  >
                    <Pencil className="size-3" />
                  </button>
                }
              />
              <StatCard
                icon={CalendarClock}
                iconColor="text-violet-400"
                iconBg="bg-violet-500/10 border-violet-500/20"
                label="Last Played"
                value={formatRelativeDate(game.last_played_at)}
                title={formatExactDateTime(game.last_played_at)}
              />
              <StatCard
                icon={HardDrive}
                iconColor="text-emerald-400"
                iconBg="bg-emerald-500/10 border-emerald-500/20"
                label="Install Size"
                value={game.install_size_bytes ? formatBytes(game.install_size_bytes) : 'Unknown'}
              />
              {game.metacritic_score !== null ? (
                <StatCard
                  icon={Star}
                  iconColor="text-amber-400"
                  iconBg="bg-amber-500/10 border-amber-500/20"
                  label="Critic Metascore"
                  value={`${game.metacritic_score}/100`}
                />
              ) : (
                <StatCard
                  icon={Calendar}
                  iconColor="text-amber-400"
                  iconBg="bg-amber-500/10 border-amber-500/20"
                  label="Release Year"
                  value={game.release_date ? formatReleaseDate(game.release_date) : 'TBA'}
                />
              )}
            </>
          )}
        </div>

        {/* ── Segmented Navigation Tabs ─────────────────────────────── */}
        <div className="flex rounded-xl border border-border/80 bg-surface-raised/70 p-1">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold transition-all',
              activeTab === 'overview'
                ? 'bg-surface-raised text-accent shadow-xs'
                : 'text-muted hover:text-text',
            )}
          >
            <Info className="size-3.5" />
            <span>Overview</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('saves')}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold transition-all',
              activeTab === 'saves'
                ? 'bg-surface-raised text-accent shadow-xs'
                : 'text-muted hover:text-text',
            )}
          >
            <HardDrive className="size-3.5" />
            <span>Saves</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('media')}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold transition-all',
              activeTab === 'media'
                ? 'bg-surface-raised text-accent shadow-xs'
                : 'text-muted hover:text-text',
            )}
          >
            <Images className="size-3.5" />
            <span>Media & Art</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('launch')}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold transition-all',
              activeTab === 'launch'
                ? 'bg-surface-raised text-accent shadow-xs'
                : 'text-muted hover:text-text',
            )}
          >
            <Terminal className="size-3.5" />
            <span>Launch</span>
          </button>
        </div>

        {/* ── Tab 1: Overview ────────────────────────────────────────── */}
        {activeTab === 'overview' && (
          <div className="flex flex-col gap-4">
            {/* Installation Details Card */}
            {isUnreleased ? (
              <section className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 shadow-sm">
                <div className="flex items-center gap-2.5">
                  <div className="flex size-7 items-center justify-center rounded-lg bg-amber-500/15 text-amber-400">
                    <CalendarDays className="size-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-text">Upcoming Release</span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="size-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.6)]" />
                      <span className="text-[11px] font-medium text-subtle">
                        Unreleased title · Tracked in your wishlist
                      </span>
                    </div>
                  </div>
                </div>
              </section>
            ) : (
              <section className="rounded-2xl border border-border/80 bg-surface-raised/80 p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex size-7 items-center justify-center rounded-lg bg-accent/10 text-accent">
                      <HardDrive className="size-4" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-text">Installation Status</span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span
                          className={cn(
                            'size-1.5 rounded-full',
                            game.is_installed
                              ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]'
                              : 'bg-subtle',
                          )}
                        />
                        <span className="text-[11px] font-medium text-subtle">
                          {game.is_installed ? 'Installed & Ready' : 'Not installed on this PC'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setInstallationEditorOpen(true)}
                    className="flex items-center gap-1 rounded-lg border border-border bg-surface-raised px-2.5 py-1 text-xs font-semibold text-accent transition-colors hover:border-accent/40 hover:bg-accent/10 active:scale-95"
                  >
                    <Pencil className="size-3" />
                    <span>Configure</span>
                  </button>
                </div>

                {game.install_path || game.executable_path ? (
                  <div className="mt-3.5 flex flex-col gap-2 border-t border-border/60 pt-3 text-[11px]">
                    {game.install_path && <PathInfo label="Directory" value={game.install_path} />}
                    {game.executable_path && (
                      <PathInfo label="Binary" value={game.executable_path} />
                    )}
                  </div>
                ) : (
                  <p className="mt-3 border-t border-border/60 pt-2.5 text-[11px] leading-relaxed text-subtle">
                    Link an executable or game folder to launch and track your playtime.
                  </p>
                )}
              </section>
            )}

            {/* User Game Rating Card */}
            {!isUnreleased && <GameUserRatingCard game={game} />}

            {/* Soundtrack Subsystem Widget */}
            <SidebarSoundtrackWidget game={game} />

            {/* Description Card */}
            {game.description && (
              <section className="rounded-2xl border border-border/80 bg-surface-raised/80 p-4 shadow-sm">
                <span className="text-xs font-bold text-text mb-1.5 block">About the Game</span>
                <p
                  className={cn(
                    'text-xs leading-relaxed text-muted transition-all',
                    !descriptionExpanded && 'line-clamp-3',
                  )}
                >
                  {game.description}
                </p>
                {game.description.length > 180 && (
                  <button
                    type="button"
                    onClick={() => setDescriptionExpanded(!descriptionExpanded)}
                    className="mt-2 flex items-center gap-1 text-[11px] font-bold text-accent hover:text-accent-hover transition-colors"
                  >
                    <span>{descriptionExpanded ? 'Show less' : 'Read more'}</span>
                    {descriptionExpanded ? (
                      <ChevronUp className="size-3" />
                    ) : (
                      <ChevronDown className="size-3" />
                    )}
                  </button>
                )}
              </section>
            )}

            {/* Metadata Rows Card */}
            {(game.developer ?? game.publisher ?? game.release_date ?? game.version) && (
              <section className="rounded-2xl border border-border/80 bg-surface-raised/80 p-4 shadow-sm">
                <span className="text-xs font-bold text-text mb-2.5 block">Game Info</span>
                <div className="flex flex-col gap-2 text-xs">
                  {game.developer && <InfoRow label="Developer" value={game.developer} />}
                  {game.publisher && <InfoRow label="Publisher" value={game.publisher} />}
                  {game.release_date && (
                    <InfoRow label="Released" value={formatReleaseDate(game.release_date)} />
                  )}
                  {game.version && <InfoRow label="Version" value={game.version} />}
                </div>
              </section>
            )}

            {/* Tags Card */}
            <section className="rounded-2xl border border-border/80 bg-surface-raised/80 p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-text">Tags & Collections</span>
                <button
                  type="button"
                  onClick={() => setTagsEditorOpen(true)}
                  className="flex items-center gap-1 text-xs font-semibold text-accent transition-colors hover:text-accent-hover"
                >
                  <Pencil className="size-3" />
                  <span>Edit Tags</span>
                </button>
              </div>

              {gameTags.length > 0 ? (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {gameTags.map((tag) => (
                    <span
                      key={tag.id}
                      className="flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs font-medium text-text shadow-xs"
                      style={{
                        borderColor: `${tag.color}55`,
                        backgroundColor: `${tag.color}15`,
                      }}
                    >
                      <span
                        className="size-1.5 rounded-full"
                        style={{ backgroundColor: tag.color }}
                      />
                      {tag.name}
                    </span>
                  ))}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setTagsEditorOpen(true)}
                  className="mt-2.5 text-[11px] text-subtle hover:text-accent transition-colors block text-left"
                >
                  + Add custom tags to categorize this game
                </button>
              )}
            </section>

            {/* Watch Trailer Link */}
            {game.trailer_url && (
              <button
                type="button"
                onClick={() => {
                  const url = game.trailer_url
                  if (url && /^https?:\/\//i.test(url)) void openUrl(url)
                }}
                className="group flex items-center justify-center gap-2 rounded-2xl border border-border/80 bg-surface/80 p-3 text-xs font-bold text-text shadow-sm transition-all hover:bg-surface-raised hover:border-accent/40 active:scale-[0.98]"
              >
                <ExternalLink className="size-4 text-accent transition-transform group-hover:scale-110" />
                <span>Watch Official Trailer</span>
              </button>
            )}
          </div>
        )}

        {/* ── Tab: Saves ─────────────────────────────────────────────── */}
        {activeTab === 'saves' && <GameSaveCard game={game} />}

        {/* ── Tab 2: Media & Artwork ─────────────────────────────────── */}
        {activeTab === 'media' && (
          <div className="flex flex-col gap-4">
            {/* Screenshots Strip */}
            {screenshots.length > 0 && (
              <section className="rounded-2xl border border-border/80 bg-surface-raised/80 p-4 shadow-sm">
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-xs font-bold text-text">
                    Screenshots ({screenshots.length})
                  </span>
                  <span className="text-[10px] text-subtle">Click to enlarge</span>
                </div>
                <div className="flex gap-2.5 overflow-x-auto pb-1.5">
                  {screenshots.map((path, index) => {
                    const src = assetUrl(path)
                    if (!src) return null
                    return (
                      <button
                        key={path}
                        type="button"
                        onClick={() => setLightbox(index + 1)}
                        className="group relative h-20 w-32 shrink-0 overflow-hidden rounded-xl border border-border/80 bg-surface-raised transition-all hover:border-accent hover:scale-[1.03] active:scale-95 shadow-sm"
                      >
                        <CoverMedia src={src} className="size-full object-cover" />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                          <Maximize2 className="size-4 text-white" />
                        </div>
                      </button>
                    )
                  })}
                </div>
              </section>
            )}

            {/* Custom Artwork Manager Hub */}
            <section className="rounded-2xl border border-border/80 bg-surface-raised/80 p-4 shadow-sm">
              <span className="text-xs font-bold text-text mb-3 block">Artwork Customization</span>
              <div className="grid grid-cols-2 gap-2.5">
                {/* Cover Art */}
                <ArtworkActionTile
                  icon={ImageIcon}
                  title="Cover Art"
                  description="Vertical poster"
                  onClick={() => setCoverPickerOpen(true)}
                />

                {/* Game Logo */}
                <ArtworkActionTile
                  icon={Type}
                  title="Logo Text"
                  description="Transparent emblem"
                  onClick={() => setLogoPickerOpen(true)}
                />

                {/* Header Banner */}
                <ArtworkActionTile
                  icon={Images}
                  title="Header Banner"
                  description="Wide showcase"
                  onClick={() => setBannerPickerOpen(true)}
                />

                {/* Background Wallpaper */}
                <ArtworkActionTile
                  icon={Mountain}
                  title="Background"
                  description="Full scene art"
                  onClick={() => setBackgroundEditorOpen(true)}
                />
              </div>
            </section>

            {/* Background Wallpaper Preview */}
            {backgroundSrc && (
              <section className="overflow-hidden rounded-2xl border border-border/80 bg-surface-raised/80 shadow-sm">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/60">
                  <span className="text-xs font-bold text-text">Current Scene Backdrop</span>
                  <button
                    type="button"
                    onClick={() => setBackgroundEditorOpen(true)}
                    className="text-[11px] font-bold text-accent transition-colors hover:text-accent-hover"
                  >
                    Change
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => galleryImages.length > 0 && setLightbox(0)}
                  title="View full resolution"
                  className="group relative block h-32 w-full cursor-zoom-in overflow-hidden text-left"
                >
                  <img
                    src={backgroundSrc}
                    alt=""
                    className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <span className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                  <span className="absolute bottom-2.5 left-3.5 flex items-center gap-1.5 text-[11px] font-semibold text-white">
                    <Maximize2 className="size-3.5" />
                    Click to view full image
                  </span>
                </button>
              </section>
            )}
          </div>
        )}

        {/* ── Tab 3: Launch & Tweaks ─────────────────────────────────── */}
        {activeTab === 'launch' &&
          (isUnreleased ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/80 bg-surface/50 p-8 text-center">
              <div className="flex size-11 items-center justify-center rounded-2xl bg-surface-raised text-subtle shadow-inner">
                <Terminal className="size-5" />
              </div>
              <div className="max-w-xs space-y-1">
                <div className="text-xs font-bold text-text">Launch Options Unavailable</div>
                <p className="text-[11px] leading-relaxed text-subtle">
                  Launch parameters, pre-launch commands, and exit hooks can be configured once the
                  game is released and installed.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <LaunchOptionsField game={game} />

              <section className="rounded-2xl border border-border/80 bg-surface-raised/80 p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <Terminal className="size-4 text-accent" />
                  <span className="text-xs font-bold text-text">Launch Automation Hooks</span>
                </div>
                <p className="text-[11px] text-muted mb-3 leading-relaxed">
                  Configure background commands or tools that execute automatically alongside the
                  game.
                </p>

                <div className="flex flex-col gap-3">
                  <CommandField
                    label="Pre-Launch Script"
                    placeholder="e.g. discord-rpc.exe --game on"
                    value={game.pre_launch_command}
                    isPending={updatePreLaunchCommand.isPending}
                    onSave={(value) =>
                      updatePreLaunchCommand.mutate({ id: game.id, preLaunchCommand: value })
                    }
                  />
                  <CommandField
                    label="Post-Exit Script"
                    placeholder="e.g. discord-rpc.exe --game off"
                    value={game.post_launch_command}
                    isPending={updatePostLaunchCommand.isPending}
                    onSave={(value) =>
                      updatePostLaunchCommand.mutate({ id: game.id, postLaunchCommand: value })
                    }
                  />
                </div>
              </section>
            </div>
          ))}
      </div>

      {/* ── Modals ─────────────────────────────────────────────────── */}
      <CoverPickerModal
        gameId={game.id}
        open={coverPickerOpen}
        onClose={() => setCoverPickerOpen(false)}
      />

      <EditGameNameModal
        game={game}
        open={renameModalOpen}
        onClose={() => setRenameModalOpen(false)}
      />

      <BannerPickerModal
        gameId={game.id}
        open={bannerPickerOpen}
        onClose={() => setBannerPickerOpen(false)}
      />

      <InstallationEditorModal
        game={game}
        open={installationEditorOpen}
        onClose={() => setInstallationEditorOpen(false)}
      />

      <TagEditorModal game={game} open={tagsEditorOpen} onClose={() => setTagsEditorOpen(false)} />

      <PlaytimeEditorModal
        game={game}
        open={playtimeEditorOpen}
        onClose={() => setPlaytimeEditorOpen(false)}
      />

      <LogoPickerModal
        gameId={game.id}
        open={logoPickerOpen}
        onClose={() => setLogoPickerOpen(false)}
        onBrowse={() => {
          setLogoPickerOpen(false)
          setLogoEditorOpen(true)
        }}
      />

      <ArtworkEditorModal
        gameId={game.id}
        kind="logo"
        currentPath={game.logo_path}
        open={logoEditorOpen}
        onClose={() => setLogoEditorOpen(false)}
      />

      <ArtworkEditorModal
        gameId={game.id}
        kind="background"
        currentPath={game.background_path}
        open={backgroundEditorOpen}
        onClose={() => setBackgroundEditorOpen(false)}
      />

      <ScreenshotLightbox
        screenshots={galleryImages}
        index={lightbox}
        onClose={() => setLightbox(null)}
        onNavigate={setLightbox}
      />
    </div>
  )
}

function ReleaseCountdownCard({
  releaseDate,
  onRelease,
}: {
  releaseDate: string
  onRelease?: () => void
}) {
  const windowActive = useWindowActive()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!windowActive) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [windowActive])

  const isExactDate = /^\d{4}-\d{2}-\d{2}$/.test(releaseDate)
  let targetMs = 0
  if (isExactDate) {
    const [year, month, day] = releaseDate.split('-').map(Number)
    targetMs = new Date(year, month - 1, day).getTime()
  } else {
    const parsed = new Date(releaseDate)
    targetMs = !Number.isNaN(parsed.getTime()) ? parsed.getTime() : 0
  }

  const remaining = Math.max(0, targetMs - now)
  const totalSeconds = Math.floor(remaining / 1000)

  const days = Math.floor(totalSeconds / 86_400)
  const hours = Math.floor(totalSeconds / 3_600) % 24
  const minutes = Math.floor(totalSeconds / 60) % 60
  const seconds = totalSeconds % 60

  const hasReached = targetMs > 0 && remaining <= 0

  useEffect(() => {
    if (hasReached && onRelease) {
      onRelease()
    }
  }, [hasReached, onRelease])

  if (!isExactDate && targetMs === 0) {
    return (
      <div className="flex items-center gap-3.5 rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-surface to-surface p-4 shadow-sm">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400">
          <CalendarDays className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-widest text-amber-400">
            <span className="size-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.6)]" />
            <span>Coming Soon</span>
          </div>
          <div className="truncate text-sm font-extrabold text-text mt-0.5">
            Expected: {releaseDate}
          </div>
          <div className="text-[10px] text-subtle mt-0.5">Exact launch date to be announced</div>
        </div>
      </div>
    )
  }

  if (hasReached) {
    return (
      <div className="flex items-center gap-3.5 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 shadow-sm">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400">
          <Sparkles className="size-5 text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-black uppercase tracking-wider text-emerald-400">
            Game Released!
          </div>
          <div className="text-[11px] text-subtle mt-0.5">
            This title has launched. You can now locate installed files or search downloads.
          </div>
        </div>
      </div>
    )
  }

  const segments = [
    { label: 'Days', value: days },
    { label: 'Hours', value: hours },
    { label: 'Mins', value: minutes },
    { label: 'Secs', value: seconds },
  ]

  return (
    <div className="overflow-hidden rounded-2xl border border-accent/40 bg-gradient-to-b from-accent/15 via-surface/90 to-surface/95 p-4 shadow-lg shadow-accent/10">
      <div className="flex items-center justify-between border-b border-border/50 pb-2.5 mb-3">
        <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-wider text-accent">
          <span className="relative flex size-2 items-center justify-center">
            <span className="size-1.5 rounded-full bg-accent shadow-[0_0_6px_var(--nx-accent)]" />
          </span>
          <CalendarDays className="size-3.5" />
          <span>Releases In</span>
        </div>
        <span className="rounded-lg border border-border/70 bg-surface-raised px-2.5 py-0.5 text-[11px] font-bold text-text">
          {formatReleaseDate(releaseDate)}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-2 text-center">
        {segments.map((seg, idx) => {
          const isSec = idx === 3
          return (
            <div
              key={seg.label}
              className={cn(
                'flex flex-col items-center justify-center rounded-xl border p-2 transition-colors shadow-inner',
                isSec
                  ? 'border-accent/40 bg-accent/10 text-accent'
                  : 'border-border/80 bg-surface/80 text-text',
              )}
            >
              <span className="font-mono text-xl font-black tabular-nums leading-tight">
                {String(seg.value).padStart(2, '0')}
              </span>
              <span
                className={cn(
                  'mt-0.5 text-[9px] font-extrabold uppercase tracking-widest',
                  isSec ? 'text-accent/80' : 'text-subtle',
                )}
              >
                {seg.label}
              </span>
            </div>
          )
        })}
      </div>

      <div className="mt-3 flex items-center justify-center gap-1.5 text-[11px] font-medium text-subtle">
        <Bookmark className="size-3 text-accent fill-accent" />
        <span>Waiting in Wishlist · Unlocks on launch day</span>
      </div>
    </div>
  )
}

function StatCard({
  icon: Icon,
  iconColor,
  iconBg,
  label,
  value,
  title,
  action,
}: {
  icon: typeof Clock
  iconColor: string
  iconBg: string
  label: string
  value: string
  title?: string
  action?: React.ReactNode
}) {
  return (
    <div
      title={title}
      className="group/stat flex items-center gap-3 rounded-2xl border border-border/80 bg-surface-raised/80 p-3 shadow-sm transition-all hover:bg-surface-raised"
    >
      <div
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-xl border shadow-inner',
          iconBg,
        )}
      >
        <Icon className={cn('size-4', iconColor)} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-extrabold text-text">{value}</div>
        <div className="text-[10px] font-medium text-subtle truncate">{label}</div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

function ArtworkActionTile({
  icon: Icon,
  title,
  description,
  onClick,
}: {
  icon: typeof ImageIcon
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col items-start gap-1 rounded-xl border border-border/80 bg-surface-raised/80 p-3 text-left shadow-xs transition-all hover:border-accent/40 hover:bg-surface-raised hover:scale-[1.02] active:scale-[0.98]"
    >
      <div className="flex size-7 items-center justify-center rounded-lg bg-surface text-accent group-hover:bg-accent/15 transition-colors">
        <Icon className="size-3.5" />
      </div>
      <span className="text-xs font-bold text-text group-hover:text-accent transition-colors">
        {title}
      </span>
      <span className="text-[10px] text-subtle truncate w-full">{description}</span>
    </button>
  )
}

function LaunchOptionsField({ game }: { game: Game }) {
  const updateLaunchArguments = useUpdateLaunchArguments()

  return (
    <section className="rounded-2xl border border-border/80 bg-surface-raised/80 p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-1.5">
        <Layers className="size-4 text-accent" />
        <span className="text-xs font-bold text-text">Launch Parameters</span>
      </div>
      <p className="text-[11px] text-muted mb-3 leading-relaxed">
        Pass arguments directly to the game binary on startup.
      </p>

      <CommandField
        label="Parameters"
        placeholder="e.g. -fullscreen -novid -high"
        value={game.launch_arguments}
        isPending={updateLaunchArguments.isPending}
        onSave={(value) => updateLaunchArguments.mutate({ id: game.id, launchArguments: value })}
      />

      {/* Preset Quick Chips */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-semibold text-subtle mr-1">Presets:</span>
        {['-fullscreen', '-windowed', '-novid', '-high', '-dx11', '-vulkan'].map((flag) => (
          <button
            key={flag}
            type="button"
            onClick={() => {
              const current = game.launch_arguments ?? ''
              if (!current.includes(flag)) {
                const updated = current ? `${current} ${flag}` : flag
                updateLaunchArguments.mutate({ id: game.id, launchArguments: updated })
              }
            }}
            className="rounded-md border border-border/60 bg-surface-raised px-1.5 py-0.5 font-mono text-[10px] font-medium text-subtle transition-colors hover:border-accent/40 hover:text-accent"
          >
            +{flag}
          </button>
        ))}
      </div>
    </section>
  )
}

function CommandField({
  label,
  placeholder,
  value,
  isPending,
  onSave,
}: {
  label: string
  placeholder: string
  value: string | null
  isPending: boolean
  onSave: (value: string | null) => void
}) {
  const [draft, setDraft] = useState(value ?? '')

  useEffect(() => {
    setDraft(value ?? '')
  }, [value])

  const isDirty = draft !== (value ?? '')

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-bold text-subtle uppercase tracking-wider">{label}</span>
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={placeholder}
          className="min-w-0 flex-1 rounded-xl border border-border/80 bg-surface px-3 py-2 font-mono text-xs text-text outline-none transition-all focus:border-accent focus:ring-2 focus:ring-accent/20 placeholder:text-muted/60"
        />
        {isDirty && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => onSave(draft || null)}
            className="shrink-0 rounded-xl bg-accent px-3 py-1.5 text-xs font-bold text-white shadow-sm transition-all hover:bg-accent-hover disabled:opacity-50 active:scale-95"
          >
            Save
          </button>
        )}
      </div>
    </div>
  )
}

function ScreenshotLightbox({
  screenshots,
  index,
  onClose,
  onNavigate,
}: {
  screenshots: string[]
  index: number | null
  onClose: () => void
  onNavigate: (index: number) => void
}) {
  const open = index !== null
  const src = index !== null ? assetUrl(screenshots[index]) : null

  useEffect(() => {
    if (!open) return
    function handleKeyDown(event: KeyboardEvent) {
      if (index === null || screenshots.length < 2) return
      if (event.key === 'ArrowLeft') {
        onNavigate((index - 1 + screenshots.length) % screenshots.length)
      } else if (event.key === 'ArrowRight') {
        onNavigate((index + 1) % screenshots.length)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [index, onNavigate, open, screenshots.length])

  return (
    <Modal open={open} onClose={onClose} widthClassName="max-w-[min(92vw,1200px)]">
      <div className="relative flex min-h-[min(70vh,760px)] items-center justify-center p-5">
        {src && (
          <CoverMedia src={src} className="max-h-[78vh] max-w-full rounded-2xl object-contain" />
        )}
        {index !== null && screenshots.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => onNavigate((index - 1 + screenshots.length) % screenshots.length)}
              aria-label="Previous screenshot"
              className="absolute left-4 flex size-10 items-center justify-center rounded-2xl bg-black/80 text-2xl text-white shadow-md transition-all hover:bg-black/95 hover:scale-105"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => onNavigate((index + 1) % screenshots.length)}
              aria-label="Next screenshot"
              className="absolute right-4 flex size-10 items-center justify-center rounded-2xl bg-black/80 text-2xl text-white shadow-md transition-all hover:bg-black/95 hover:scale-105"
            >
              ›
            </button>
          </>
        )}
        <span className="absolute bottom-4 right-6 rounded-full bg-black/80 px-3 py-1 text-xs tabular-nums font-bold text-white shadow-md">
          {index !== null ? `${index + 1} / ${screenshots.length}` : ''}
        </span>
        {index !== null && screenshots.length > 1 && (
          <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center justify-center gap-2">
            {screenshots.map((_, dotIndex) => (
              <button
                key={dotIndex}
                type="button"
                onClick={() => onNavigate(dotIndex)}
                aria-label={`Screenshot ${dotIndex + 1}`}
                className={cn(
                  'size-2 rounded-full transition-all',
                  dotIndex === index ? 'bg-accent w-4' : 'bg-white/40',
                )}
              />
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}

function PanelSkeleton({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className="relative h-64 shrink-0 animate-pulse bg-surface-raised">
        <ModalCloseButton
          onClick={onClose}
          className="absolute right-4 top-4 bg-black/50 text-white"
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="size-6 animate-spin text-subtle" />
        </div>
      </div>
      <div className="flex flex-col gap-4 p-5">
        <div className="h-11 animate-pulse rounded-xl bg-surface-raised" />
        <div className="grid grid-cols-2 gap-2.5">
          <div className="h-16 animate-pulse rounded-2xl bg-surface-raised" />
          <div className="h-16 animate-pulse rounded-2xl bg-surface-raised" />
        </div>
        <div className="h-28 animate-pulse rounded-2xl bg-surface-raised" />
      </div>
    </div>
  )
}

function IconButton({
  children,
  onClick,
  label,
  active,
  activeClassName,
}: {
  children: React.ReactNode
  onClick: () => void
  label: string
  active?: boolean
  activeClassName?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'flex size-11 shrink-0 items-center justify-center rounded-xl border border-border/80 bg-surface shadow-xs transition-all hover:bg-surface-raised hover:border-border-hover hover:scale-105 active:scale-95',
        active
          ? activeClassName || 'border-accent/40 bg-accent/15 text-accent shadow-xs'
          : 'text-muted hover:text-text',
      )}
    >
      {children}
    </button>
  )
}

function PathInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-baseline gap-2">
      <span className="w-16 shrink-0 text-subtle font-medium">{label}</span>
      <span
        className="truncate font-mono text-text bg-surface-raised px-2 py-0.5 rounded-md"
        title={value}
      >
        {value}
      </span>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-border/40 pb-1.5 last:border-b-0 last:pb-0">
      <span className="text-subtle font-medium">{label}</span>
      <span className="truncate text-text font-semibold" title={value}>
        {value}
      </span>
    </div>
  )
}

const RATING_TIERS: Record<number, { label: string; color: string; desc: string }> = {
  1: { label: 'Abysmal', color: 'text-rose-500', desc: 'Unplayable / Broken' },
  2: { label: 'Terrible', color: 'text-rose-400', desc: 'Major issues' },
  3: { label: 'Bad', color: 'text-orange-400', desc: 'Very disappointing' },
  4: { label: 'Mediocre', color: 'text-amber-500', desc: 'Forgettable' },
  5: { label: 'Average', color: 'text-amber-400', desc: 'Decent time-killer' },
  6: { label: 'Decent', color: 'text-yellow-400', desc: 'Worth playing' },
  7: { label: 'Good', color: 'text-lime-400', desc: 'Solid experience' },
  8: { label: 'Great', color: 'text-emerald-400', desc: 'Highly recommended' },
  9: { label: 'Superb', color: 'text-cyan-400', desc: 'Exceptional craft' },
  10: { label: 'Masterpiece', color: 'text-amber-300', desc: 'Legendary / GOAT' },
}

function GameUserRatingCard({ game }: { game: Game }) {
  const setRating = useSetGameUserRating()
  const [hoveredScore, setHoveredScore] = useState<number | null>(null)
  const currentRating = game.user_rating

  const activeDisplay = hoveredScore ?? currentRating
  const activeTier = activeDisplay ? RATING_TIERS[activeDisplay] : null

  function handleSelect(score: number) {
    playButtonClick()
    const next = score === currentRating ? null : score
    setRating.mutate(
      { id: game.id, rating: next },
      {
        onSuccess: () => {
          if (next) {
            toast.success(`Rated ${game.name}: ${next}/10 (${RATING_TIERS[next]?.label})`)
          } else {
            toast.info(`Cleared rating for ${game.name}`)
          }
        },
      },
    )
  }

  return (
    <section className="relative overflow-hidden rounded-2xl border border-border/80 bg-surface-raised/80 p-4 shadow-sm">
      {/* Ambient rating glow */}
      {currentRating && currentRating >= 8 && (
        <div
          className="pointer-events-none absolute -right-8 -top-8 size-28 rounded-full blur-2xl opacity-20"
          style={{ backgroundColor: 'var(--nx-accent)' }}
        />
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-amber-500/15 text-amber-400 shadow-xs">
            <Star className="size-4 fill-amber-400" />
          </div>
          <div>
            <span className="text-xs font-bold text-text">Player Rating</span>
            <p className="text-[10px] text-muted">Your personal score for this game (1–10)</p>
          </div>
        </div>

        {currentRating ? (
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-0.5 font-mono text-xs font-black text-amber-400 shadow-xs">
              <Star className="size-3 fill-amber-400" />
              <span>{currentRating} / 10</span>
            </span>
            <button
              type="button"
              onClick={() => handleSelect(currentRating)}
              disabled={setRating.isPending}
              title="Clear rating"
              aria-label="Clear rating"
              className="flex size-6 items-center justify-center rounded-full text-subtle hover:bg-surface hover:text-text active:scale-95 transition-colors cursor-pointer"
            >
              <X className="size-3" />
            </button>
          </div>
        ) : (
          <span className="font-mono text-[10px] font-semibold text-subtle uppercase tracking-wider">
            Unrated
          </span>
        )}
      </div>

      {/* 1-10 Segmented Rating Grid */}
      <div className="mt-3.5 flex items-center gap-1" onMouseLeave={() => setHoveredScore(null)}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((score) => {
          const isFilled = activeDisplay !== null && score <= activeDisplay
          const isSelected = currentRating === score

          return (
            <button
              key={score}
              type="button"
              onMouseEnter={() => setHoveredScore(score)}
              onClick={() => handleSelect(score)}
              disabled={setRating.isPending}
              title={`Rate ${score}/10 — ${RATING_TIERS[score]?.label}`}
              className={cn(
                'group relative flex h-8 flex-1 flex-col items-center justify-center rounded-lg border text-[11px] font-mono font-bold transition-all duration-150 active:scale-90 cursor-pointer select-none',
                isSelected
                  ? 'border-accent bg-accent text-white shadow-md shadow-accent/30 scale-105 z-10'
                  : isFilled
                    ? 'border-amber-400/50 bg-amber-400/20 text-amber-300'
                    : 'border-border/70 bg-surface/60 text-muted hover:border-border hover:bg-surface hover:text-text',
              )}
            >
              <span>{score}</span>
            </button>
          )
        })}
      </div>

      {/* Interactive Score Feedback Strip */}
      <div className="mt-2.5 flex items-center justify-between text-[11px]">
        {activeTier ? (
          <div className="flex items-center gap-1.5 font-bold">
            <span className={cn('font-black uppercase tracking-wider', activeTier.color)}>
              {activeTier.label}
            </span>
            <span className="text-subtle">•</span>
            <span className="text-muted font-normal">{activeTier.desc}</span>
          </div>
        ) : (
          <span className="text-[10px] text-subtle italic">Click a score (1–10) to rate</span>
        )}

        {currentRating && (
          <span className="font-mono text-[10px] text-subtle">
            {currentRating >= 9 ? '🏆 Masterpiece' : currentRating >= 7 ? '✨ Recommended' : ''}
          </span>
        )}
      </div>
    </section>
  )
}
