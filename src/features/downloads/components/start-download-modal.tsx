import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Download,
  FolderOpen,
  Search,
  Loader2,
  ArrowLeft,
  Link2,
  Gamepad2,
  Sparkles,
  Star,
  Calendar,
  Clipboard,
  FileArchive,
  Network,
  Layers,
  KeyRound,
  Globe,
  ExternalLink,
  Check,
  Zap,
  Play,
} from 'lucide-react'
import { toast } from 'sonner'
import { openUrl } from '@tauri-apps/plugin-opener'
import { cn } from '@/lib/utils'
import { useHubSearch } from '@/features/hub/hooks/use-hub'
import { isMissingIgdbKeys } from '@/features/hub/utils/is-missing-keys'
import { ModalCloseButton } from '@/components/ui/modal'
import { MissingKeysPanel } from '@/features/hub/components/missing-keys-panel'
import { useSettings, useSetSetting } from '@/features/settings/hooks/use-settings'
import { useGames, useLaunchGame } from '@/features/library/hooks/use-games'
import { findLibraryEntry } from '@/features/hub/utils/in-library'
import {
  useStartGameDownload,
  useStartRawDownload,
  useStartBatchDownloads,
} from '../hooks/use-downloads'
import { useStartDownloadModalStore } from '../store/start-download-modal-store'
import { open as openDirectoryDialog } from '@tauri-apps/plugin-dialog'
import type { Game, HubGame } from '@/types/models'

const STREAM_OPTIONS = [6, 8, 12, 24, 32] as const

const SEARCH_DEBOUNCE_MS = 300
const EMPTY_FILTERS = {
  genreId: null,
  platformId: null,
  release: null,
  minRating: null,
  sort: null,
}

/**
 * Redesigned High-Performance Download Starter Modal:
 * Fully theme-adaptive: pixel-perfect contrast in both Light and Dark themes.
 * Step 1: Search & pick game for IGDB metadata + cover artwork
 * Step 2: Configure download link, community sources, folder & parallel streams
 */
export function StartDownloadModal() {
  const open = useStartDownloadModalStore((s) => s.isOpen)
  const onClose = useStartDownloadModalStore((s) => s.close)
  const prefill = useStartDownloadModalStore((s) => s.prefill)
  const startGame = useStartGameDownload()
  const startRaw = useStartRawDownload()
  const startBatch = useStartBatchDownloads()

  const [game, setGame] = useState<HubGame | null>(null)
  const [rawMode, setRawMode] = useState(false)
  const [url, setUrl] = useState('')
  const [savePath, setSavePath] = useState('')

  const { data: settings } = useSettings()

  useEffect(() => {
    if (open) return
    setGame(null)
    setRawMode(false)
    setUrl('')
    setSavePath('')
  }, [open])

  // Opened for a known game (uninstalled library card / hub / details panel): skip the search.
  useEffect(() => {
    if (open && prefill) {
      setGame({
        igdb_id: prefill.igdbId ?? 0,
        name: prefill.name,
        summary: null,
        cover_url: prefill.coverUrl ?? null,
        backdrop_url: null,
        release_date: null,
        rating: null,
        rating_count: null,
        hypes: null,
        genres: [],
        platforms: [],
      })
    }
  }, [open, prefill])

  const showUrlStep = game !== null || rawMode
  const pending = startGame.isPending || startRaw.isPending || startBatch.isPending
  const canSubmit = url.trim().length > 0 && savePath.trim().length > 0

  function handleSubmit() {
    if (!canSubmit || pending) return
    const done = { onSuccess: onClose }

    const urls = url
      .split('\n')
      .map((u) => u.trim())
      .filter((u) => u.length > 0)

    if (urls.length === 0) return

    const isSequential = settings?.download_multi_part_mode !== 'concurrent'

    if (urls.length > 1) {
      startBatch.mutate(
        {
          igdbId: game && game.igdb_id > 0 ? game.igdb_id : undefined,
          gameId: prefill?.gameId,
          urls,
          savePath: savePath.trim(),
          sequential: isSequential,
        },
        done,
      )
    } else if (game && game.igdb_id > 0) {
      startGame.mutate({ igdbId: game.igdb_id, url: urls[0], savePath: savePath.trim() }, done)
    } else {
      startRaw.mutate({ url: urls[0], savePath: savePath.trim(), gameId: prefill?.gameId }, done)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          {/* Glass Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity dark:bg-black/80"
            onClick={onClose}
          />

          <motion.div
            className="relative z-10 flex max-h-[92vh] w-full max-w-[690px] flex-col overflow-hidden rounded-[28px] border border-border/80 bg-surface/95 shadow-2xl shadow-black/20 backdrop-blur-2xl dark:shadow-black/70"
            initial={{ scale: 0.94, y: 16, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, y: 16, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* Top Ambient Glow */}
            <div className="pointer-events-none absolute -top-28 left-1/2 h-44 w-[480px] -translate-x-1/2 rounded-full bg-accent/15 blur-3xl opacity-50 dark:opacity-100" />

            {/* Modal Header */}
            <div className="relative flex items-center justify-between border-b border-border/70 px-6 py-4">
              <div className="flex items-center gap-3.5">
                <div className="flex size-11 items-center justify-center rounded-2xl bg-accent/10 text-accent ring-1 ring-accent/25 shadow-xs">
                  <Download className="size-5" />
                </div>
                <div>
                  <h2 className="text-base font-extrabold tracking-tight text-text">
                    Start Game Download
                  </h2>
                  <p className="text-xs text-muted mt-0.5">
                    {showUrlStep
                      ? 'Configure download links, target folder and parallel streams'
                      : 'Find game on IGDB to automatically link metadata and box art'}
                  </p>
                </div>
              </div>

              {/* Step Badges & Close Button */}
              <div className="flex items-center gap-2">
                <div className="flex items-center rounded-xl border border-border/80 bg-surface-raised/90 p-1 backdrop-blur-sm">
                  <button
                    type="button"
                    onClick={() => {
                      if (showUrlStep && !prefill) {
                        setGame(null)
                        setRawMode(false)
                      }
                    }}
                    className={cn(
                      'flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition-all',
                      !showUrlStep
                        ? 'bg-accent text-white shadow-xs'
                        : 'text-muted hover:text-text cursor-pointer',
                    )}
                  >
                    <Gamepad2 className="size-3.5" />
                    <span>Target</span>
                    {game && <Check className="size-3 text-emerald-500 dark:text-emerald-400" />}
                  </button>

                  <div className="mx-1 h-3.5 w-px bg-border/80" />

                  <div
                    className={cn(
                      'flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition-all',
                      showUrlStep ? 'bg-accent text-white shadow-xs' : 'text-subtle opacity-70',
                    )}
                  >
                    <Link2 className="size-3.5" />
                    <span>Options</span>
                  </div>
                </div>

                <ModalCloseButton onClick={onClose} size="lg" aria-label="Close" />
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex flex-1 flex-col overflow-y-auto p-6 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-border/60">
              {showUrlStep ? (
                <UrlStep
                  game={game}
                  hasPrefill={prefill !== null}
                  url={url}
                  savePath={savePath}
                  pending={pending}
                  canSubmit={canSubmit}
                  onBack={() => {
                    if (game && prefill) onClose()
                    else {
                      setGame(null)
                      setRawMode(false)
                    }
                  }}
                  onUrl={setUrl}
                  onSavePath={setSavePath}
                  onSubmit={handleSubmit}
                />
              ) : (
                <SearchStep onPick={setGame} onRawMode={() => setRawMode(true)} />
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ── Step 1: Search & Pick Game ───────────────────────────────────────

function SearchStep({
  onPick,
  onRawMode,
}: {
  onPick: (game: HubGame) => void
  onRawMode: () => void
}) {
  const [input, setInput] = useState('')
  const [debounced, setDebounced] = useState('')
  const { data: games } = useGames()

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(input.trim()), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [input])

  const search = useHubSearch(debounced, EMPTY_FILTERS)

  return (
    <div className="flex h-full flex-col">
      {/* Search Input Bar */}
      <div className="relative mb-4">
        <div className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-accent">
          <Search className="size-4.5" />
        </div>
        <input
          autoFocus
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Search game title (e.g. Cyberpunk 2077, Elden Ring, GTA VI)..."
          className="w-full rounded-2xl border border-border bg-surface-raised/70 py-3.5 pl-11 pr-11 text-sm font-medium text-text placeholder:text-muted/70 backdrop-blur-md transition-all focus:border-accent focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/25 shadow-xs"
        />
        {input ? (
          <button
            type="button"
            onClick={() => setInput('')}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-subtle hover:bg-surface-raised hover:text-text transition-colors"
          >
            <X className="size-4" />
          </button>
        ) : (
          <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 rounded-md border border-border/80 bg-surface-raised px-1.5 py-0.5 text-[10px] font-bold text-muted">
            IGDB
          </span>
        )}
      </div>

      {/* Results View */}
      <div className="min-h-80 flex-1 overflow-y-auto pr-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-border/60">
        {isMissingIgdbKeys(search.error) ? (
          <MissingKeysPanel />
        ) : search.isFetching ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center text-sm text-subtle">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-accent/10 text-accent ring-1 ring-accent/30">
              <Loader2 className="size-6 animate-spin" />
            </div>
            <span className="font-semibold text-text">Searching IGDB database…</span>
            <span className="text-xs text-muted">Retrieving covers, genres and descriptions</span>
          </div>
        ) : !search.data || debounced.length < 2 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="relative mb-4 flex size-16 items-center justify-center rounded-3xl bg-accent/10 text-accent ring-1 ring-accent/25 shadow-xs">
              <Gamepad2 className="size-8" />
              <div className="absolute -bottom-1 -right-1 flex size-6 items-center justify-center rounded-full bg-accent text-white shadow-xs">
                <Sparkles className="size-3.5" />
              </div>
            </div>
            <p className="text-base font-bold text-text">Find your game on IGDB</p>
            <p className="mt-1.5 max-w-sm text-xs text-muted leading-relaxed">
              Type the game title above to auto-fetch official cover artwork, studio details,
              release dates, and community ratings.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {search.data.pages.flat().map((hit) => (
              <ResultCard key={hit.igdb_id} game={hit} games={games} onPick={onPick} />
            ))}
            {search.data.pages[0]?.length === 0 && (
              <div className="col-span-2 py-16 text-center text-sm text-muted">
                No games found matching "{debounced}".
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer Alternative Mode */}
      <div className="mt-4 flex items-center justify-between border-t border-border/70 pt-3.5">
        <div className="flex items-center gap-2 text-xs text-muted">
          <Link2 className="size-3.5 text-accent" />
          <span>Don't need official metadata from IGDB?</span>
        </div>
        <button
          type="button"
          onClick={onRawMode}
          className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3.5 py-2 text-xs font-bold text-text shadow-xs transition-all hover:border-accent/50 hover:bg-accent/10 hover:text-accent active:scale-95"
        >
          <span>Direct Download Link</span>
          <ArrowLeft className="size-3.5 rotate-180" />
        </button>
      </div>
    </div>
  )
}

function ResultCard({
  game,
  games,
  onPick,
}: {
  game: HubGame
  games?: Game[]
  onPick: (game: HubGame) => void
}) {
  const libraryEntry = useMemo(() => findLibraryEntry(games, game), [games, game])
  const isInstalled = Boolean(libraryEntry && libraryEntry.is_installed)
  const launchGame = useLaunchGame()
  const onClose = useStartDownloadModalStore((s) => s.close)
  const year = game.release_date ? game.release_date.slice(0, 4) : null

  return (
    <div
      onClick={() => {
        if (isInstalled) {
          toast.info(`"${game.name}" is already installed on your system. Click Play to launch.`)
          return
        }
        onPick(game)
      }}
      className={cn(
        'group relative flex items-center gap-3.5 rounded-2xl border p-3 text-left transition-all',
        isInstalled
          ? 'border-emerald-500/40 bg-emerald-500/5 hover:border-emerald-500/60 hover:bg-emerald-500/10 cursor-default shadow-xs'
          : 'border-border/80 bg-surface hover:border-accent/60 hover:bg-accent/5 hover:shadow-md hover:shadow-accent/5 hover:scale-[1.01] active:scale-[0.99] cursor-pointer',
      )}
    >
      {game.cover_url ? (
        <div className="relative h-20 w-15 shrink-0 overflow-hidden rounded-xl shadow-xs ring-1 ring-border group-hover:ring-accent/40 transition-all">
          <img
            src={game.cover_url}
            alt=""
            className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        </div>
      ) : (
        <div className="flex h-20 w-15 shrink-0 items-center justify-center rounded-xl bg-surface-raised text-subtle ring-1 ring-border/60">
          <Gamepad2 className="size-6 opacity-40" />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'truncate text-sm font-bold transition-colors',
            isInstalled ? 'text-text' : 'text-text group-hover:text-accent',
          )}
        >
          {game.name}
        </p>

        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {isInstalled && (
            <span className="flex items-center gap-1 rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
              <Check className="size-2.5" strokeWidth={3} />
              <span>Installed</span>
            </span>
          )}
          {year && (
            <span className="flex items-center gap-1 rounded-md bg-surface-raised px-1.5 py-0.5 text-[10px] font-semibold text-muted border border-border/60">
              <Calendar className="size-2.5" />
              {year}
            </span>
          )}
          {game.rating != null && (
            <span className="flex items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-extrabold text-amber-600 dark:text-amber-400 border border-amber-500/20">
              <Star className="size-2.5 fill-current" />
              {Math.round(game.rating)}
            </span>
          )}
        </div>

        <p className="mt-1.5 truncate text-[11px] font-medium text-subtle">
          {isInstalled
            ? 'Installed on this PC (Ready to Play)'
            : game.genres.slice(0, 2).join(' · ') || 'Action / Adventure'}
        </p>
      </div>

      {isInstalled ? (
        <div className="shrink-0">
          <button
            type="button"
            title="Launch Game"
            disabled={launchGame.isPending}
            onClick={(e) => {
              e.stopPropagation()
              if (libraryEntry) {
                launchGame.mutate(libraryEntry.id)
                onClose()
              }
            }}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition-all hover:bg-emerald-500 hover:scale-105 active:scale-95"
          >
            <Play className="size-3.5 fill-current" />
            <span>Play</span>
          </button>
        </div>
      ) : (
        <div className="opacity-0 transition-opacity group-hover:opacity-100 shrink-0">
          <span className="flex size-7 items-center justify-center rounded-xl bg-accent text-white shadow-xs">
            <ArrowLeft className="size-3.5 rotate-180" />
          </span>
        </div>
      )}
    </div>
  )
}

// ── Step 2: Download Link & Options ──────────────────────────────────

function UrlStep({
  game,
  hasPrefill,
  url,
  savePath,
  pending,
  canSubmit,
  onBack,
  onUrl,
  onSavePath,
  onSubmit,
}: {
  game: HubGame | null
  hasPrefill: boolean
  url: string
  savePath: string
  pending: boolean
  canSubmit: boolean
  onBack: () => void
  onUrl: (value: string) => void
  onSavePath: (value: string) => void
  onSubmit: () => void
}) {
  const [pasteSuccess, setPasteSuccess] = useState(false)
  const { data: settings } = useSettings()
  const setSetting = useSetSetting()

  const { data: games } = useGames()
  const libraryEntry = useMemo(
    () => (game ? findLibraryEntry(games, game) : undefined),
    [games, game],
  )
  const isInstalled = Boolean(libraryEntry && libraryEntry.is_installed)
  const launchGame = useLaunchGame()
  const onClose = useStartDownloadModalStore((s) => s.close)

  const currentStreams = Number(settings?.download_streams ?? '8')
  const activeStreams = STREAM_OPTIONS.includes(currentStreams as (typeof STREAM_OPTIONS)[number])
    ? currentStreams
    : 8

  async function handlePaste() {
    try {
      const text = await navigator.clipboard.readText()
      if (text) {
        onUrl(text.trim())
        setPasteSuccess(true)
        setTimeout(() => setPasteSuccess(false), 1500)
      }
    } catch {
      /* clipboard read unavailable */
    }
  }

  const [isBatch, setIsBatch] = useState(false)
  const [password, setPassword] = useState('')

  // Detect file extension from URL
  const detectedExt = url.split('?')[0].split('.').pop()?.toLowerCase()
  const isArchive = ['zip', 'rar', '7z', 'tar', 'gz', 'iso'].includes(detectedExt ?? '')

  return (
    <div className="flex flex-col gap-4">
      {/* Alert banner if game is already installed */}
      {isInstalled && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-3.5 text-text backdrop-blur-sm">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
              <Check className="size-5" strokeWidth={3} />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                Already Installed & Ready to Play
              </div>
              <div className="text-[11px] text-muted truncate">
                {game?.name} is already installed in your Library and cannot be re-downloaded.
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (libraryEntry) launchGame.mutate(libraryEntry.id)
              onClose()
            }}
            className="flex shrink-0 items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-500 active:scale-95"
          >
            <Play className="size-3.5 fill-current" />
            <span>Play Game</span>
          </button>
        </div>
      )}

      {/* Hero Showcase Card */}
      <div className="relative flex items-center gap-4 overflow-hidden rounded-2xl border border-accent/30 bg-gradient-to-r from-accent/10 via-surface-raised/40 to-surface-raised/70 p-4 shadow-xs backdrop-blur-md">
        <button
          type="button"
          onClick={onBack}
          aria-label={game && hasPrefill ? 'Close' : 'Back to search'}
          className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border/80 bg-surface text-subtle transition-all hover:bg-surface-raised hover:text-text active:scale-95"
          title="Change game"
        >
          <ArrowLeft className="size-4" />
        </button>

        {game?.cover_url ? (
          <div className="relative size-16 shrink-0 overflow-hidden rounded-xl shadow-xs ring-1 ring-border">
            <img src={game.cover_url} alt="" className="size-full object-cover" />
          </div>
        ) : (
          <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-accent/10 text-accent ring-1 ring-accent/25">
            <Download className="size-6" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-base font-extrabold text-text">
              {game?.name ?? 'Direct File Download'}
            </h3>
            {game && (
              <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shadow-2xs">
                <Sparkles className="size-2.5" />
                Auto-Install
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted leading-relaxed">
            {game
              ? 'Nexus will download, verify, extract, and automatically link this game in your library.'
              : 'Standalone direct download without metadata linking.'}
          </p>
        </div>
      </div>

      {/* Verified Download Sources (AnkerGames, SteamRIP, Downloadha) */}
      <div className="flex flex-col gap-2.5 rounded-2xl border border-border/80 bg-surface-raised/50 p-4 shadow-xs backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-extrabold text-text">
            <Globe className="size-4 text-accent" />
            <span>Find Download Links</span>
          </div>
          <span className="text-[11px] font-medium text-muted">
            {game?.name ? `Search community providers for "${game.name}"` : 'Browse game sources'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {/* Source 1: AnkerGames */}
          <button
            type="button"
            onClick={() => {
              const cleanName = game?.name
                ? game.name.replace(/[™®©]/g, '').replace(/[:]/g, ' ').replace(/\s+/g, ' ').trim()
                : ''
              const targetUrl = cleanName
                ? `https://ankergames.net/search/${encodeURIComponent(cleanName)}`
                : 'https://ankergames.net/'
              void openUrl(targetUrl)
            }}
            className="group relative flex items-center justify-between gap-3 overflow-hidden rounded-xl border border-border/80 bg-surface p-2.5 text-left shadow-2xs transition-all hover:border-accent/60 hover:bg-accent/10 hover:shadow-xs active:scale-[0.98]"
            title={game?.name ? `Search ${game.name} on AnkerGames` : 'Open AnkerGames'}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-raised p-1 ring-1 ring-border shadow-inner group-hover:ring-accent/40 group-hover:scale-105 transition-all overflow-hidden">
                <img
                  src="/assets/sources/ankergames.png"
                  alt="AnkerGames"
                  className="size-full object-contain"
                  onError={(e) => {
                    ;(e.target as HTMLImageElement).src =
                      'https://www.google.com/s2/favicons?domain=ankergames.net&sz=64'
                  }}
                />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-bold text-text group-hover:text-accent transition-colors truncate">
                  AnkerGames
                </span>
                <span className="text-[10px] text-muted truncate">Direct & Repack</span>
              </div>
            </div>
            <ExternalLink className="size-3.5 shrink-0 text-muted group-hover:text-accent transition-colors" />
          </button>

          {/* Source 2: SteamRIP */}
          <button
            type="button"
            onClick={() => {
              const cleanName = game?.name
                ? game.name.replace(/[™®©]/g, '').replace(/[:]/g, ' ').replace(/\s+/g, ' ').trim()
                : ''
              const targetUrl = cleanName
                ? `https://steamrip.com/?s=${encodeURIComponent(cleanName).replace(/%20/g, '+')}`
                : 'https://steamrip.com/'
              void openUrl(targetUrl)
            }}
            className="group relative flex items-center justify-between gap-3 overflow-hidden rounded-xl border border-border/80 bg-surface p-2.5 text-left shadow-2xs transition-all hover:border-emerald-500/60 hover:bg-emerald-500/10 hover:shadow-xs active:scale-[0.98]"
            title={game?.name ? `Search ${game.name} on SteamRIP` : 'Open SteamRIP'}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-raised p-1 ring-1 ring-border shadow-inner group-hover:ring-emerald-500/40 group-hover:scale-105 transition-all overflow-hidden">
                <img
                  src="/assets/sources/steamrip.png"
                  alt="SteamRIP"
                  className="size-full object-contain"
                  onError={(e) => {
                    ;(e.target as HTMLImageElement).src =
                      'https://www.google.com/s2/favicons?domain=steamrip.com&sz=64'
                  }}
                />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-bold text-text group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors truncate">
                  SteamRIP
                </span>
                <span className="text-[10px] text-muted truncate">Pre-installed</span>
              </div>
            </div>
            <ExternalLink className="size-3.5 shrink-0 text-muted group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors" />
          </button>

          {/* Source 3: Downloadha */}
          <button
            type="button"
            onClick={() => {
              const cleanName = game?.name
                ? game.name.replace(/[™®©]/g, '').replace(/[:]/g, ' ').replace(/\s+/g, ' ').trim()
                : ''
              const targetUrl = cleanName
                ? `https://www.downloadha.com/?s=${encodeURIComponent(cleanName).replace(/%20/g, '+')}`
                : 'https://www.downloadha.com/'
              void openUrl(targetUrl)
            }}
            className="group relative flex items-center justify-between gap-3 overflow-hidden rounded-xl border border-border/80 bg-surface p-2.5 text-left shadow-2xs transition-all hover:border-amber-500/60 hover:bg-amber-500/10 hover:shadow-xs active:scale-[0.98]"
            title={game?.name ? `Search ${game.name} on Downloadha` : 'Open Downloadha'}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-raised p-1 ring-1 ring-border shadow-inner group-hover:ring-amber-500/40 group-hover:scale-105 transition-all overflow-hidden">
                <img
                  src="/assets/sources/downloadha.png"
                  alt="Downloadha"
                  className="size-full object-contain"
                  onError={(e) => {
                    ;(e.target as HTMLImageElement).src =
                      'https://www.google.com/s2/favicons?domain=downloadha.com&sz=64'
                  }}
                />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-bold text-text group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors truncate">
                  Downloadha
                </span>
                <span className="text-[10px] text-muted truncate">Direct & Repacks</span>
              </div>
            </div>
            <ExternalLink className="size-3.5 shrink-0 text-muted group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors" />
          </button>

          {/* Source 4: P30Day */}
          <button
            type="button"
            onClick={() => {
              const cleanName = game?.name
                ? game.name.replace(/[™®©]/g, '').replace(/[:]/g, ' ').replace(/\s+/g, ' ').trim()
                : ''
              const targetUrl = cleanName
                ? `https://www.p30day.ir/?s=${encodeURIComponent(cleanName).replace(/%20/g, '+')}`
                : 'https://www.p30day.ir/'
              void openUrl(targetUrl)
            }}
            className="group relative flex items-center justify-between gap-3 overflow-hidden rounded-xl border border-border/80 bg-surface p-2.5 text-left shadow-2xs transition-all hover:border-sky-500/60 hover:bg-sky-500/10 hover:shadow-xs active:scale-[0.98]"
            title={game?.name ? `Search ${game.name} on P30Day` : 'Open P30Day'}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-raised p-1 ring-1 ring-border shadow-inner group-hover:ring-sky-500/40 group-hover:scale-105 transition-all overflow-hidden">
                <img
                  src="/assets/sources/p30day.png"
                  alt="P30Day"
                  className="size-full object-contain"
                  onError={(e) => {
                    ;(e.target as HTMLImageElement).src =
                      'https://www.google.com/s2/favicons?domain=p30day.ir&sz=64'
                  }}
                />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-bold text-text group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors truncate">
                  P30Day
                </span>
                <span className="text-[10px] text-muted truncate">Direct & Persian</span>
              </div>
            </div>
            <ExternalLink className="size-3.5 shrink-0 text-muted group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors" />
          </button>

          {/* Source 5: GOG Unlocked */}
          <button
            type="button"
            onClick={() => {
              const cleanName = game?.name
                ? game.name.replace(/[™®©]/g, '').replace(/[:]/g, ' ').replace(/\s+/g, ' ').trim()
                : ''
              const targetUrl = cleanName
                ? `https://gogunlocked.com/?s=${encodeURIComponent(cleanName).replace(/%20/g, '+')}`
                : 'https://gogunlocked.com/'
              void openUrl(targetUrl)
            }}
            className="group relative flex items-center justify-between gap-3 overflow-hidden rounded-xl border border-border/80 bg-surface p-2.5 text-left shadow-2xs transition-all hover:border-purple-500/60 hover:bg-purple-500/10 hover:shadow-xs active:scale-[0.98]"
            title={game?.name ? `Search ${game.name} on GOG Unlocked` : 'Open GOG Unlocked'}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-raised p-1 ring-1 ring-border shadow-inner group-hover:ring-purple-500/40 group-hover:scale-105 transition-all overflow-hidden">
                <img
                  src="/assets/sources/gogunlocked.png"
                  alt="GOG Unlocked"
                  className="size-full object-contain"
                  onError={(e) => {
                    ;(e.target as HTMLImageElement).src =
                      'https://www.google.com/s2/favicons?domain=gogunlocked.com&sz=64'
                  }}
                />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-bold text-text group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors truncate">
                  GOG Unlocked
                </span>
                <span className="text-[10px] text-muted truncate">DRM-Free / GOG</span>
              </div>
            </div>
            <ExternalLink className="size-3.5 shrink-0 text-muted group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors" />
          </button>

          {/* Source 6: GameQ */}
          <button
            type="button"
            onClick={() => {
              const cleanName = game?.name
                ? game.name.replace(/[™®©]/g, '').replace(/[:]/g, ' ').replace(/\s+/g, ' ').trim()
                : ''
              const targetUrl = cleanName
                ? `https://gameq.ir/?s=${encodeURIComponent(cleanName).replace(/%20/g, '+')}`
                : 'https://gameq.ir/'
              void openUrl(targetUrl)
            }}
            className="group relative flex items-center justify-between gap-3 overflow-hidden rounded-xl border border-border/80 bg-surface p-2.5 text-left shadow-2xs transition-all hover:border-rose-500/60 hover:bg-rose-500/10 hover:shadow-xs active:scale-[0.98]"
            title={game?.name ? `Search ${game.name} on GameQ` : 'Open GameQ'}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-raised p-1 ring-1 ring-border shadow-inner group-hover:ring-rose-500/40 group-hover:scale-105 transition-all overflow-hidden">
                <img
                  src="/assets/sources/gameq.png"
                  alt="GameQ"
                  className="size-full object-contain"
                  onError={(e) => {
                    ;(e.target as HTMLImageElement).src =
                      'https://www.google.com/s2/favicons?domain=gameq.ir&sz=64'
                  }}
                />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-bold text-text group-hover:text-rose-600 dark:group-hover:text-rose-400 transition-colors truncate">
                  GameQ
                </span>
                <span className="text-[10px] text-muted truncate">Repacks & Persian</span>
              </div>
            </div>
            <ExternalLink className="size-3.5 shrink-0 text-muted group-hover:text-rose-600 dark:group-hover:text-rose-400 transition-colors" />
          </button>
        </div>
      </div>

      {/* Download URL Input Card */}
      <div className="flex flex-col gap-2 rounded-2xl border border-border/80 bg-surface-raised/50 p-4 shadow-xs backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-extrabold text-text">
              {isBatch ? 'Multi-Part Download URLs' : 'Direct Download URL'}
            </span>

            {/* Segmented Mode Switcher */}
            <div className="flex items-center rounded-lg border border-border/80 bg-surface p-0.5 shadow-2xs">
              <button
                type="button"
                onClick={() => setIsBatch(false)}
                className={cn(
                  'rounded-md px-2 py-0.5 text-[10px] font-bold transition-all',
                  !isBatch ? 'bg-accent text-white shadow-2xs' : 'text-muted hover:text-text',
                )}
              >
                Single URL
              </button>
              <button
                type="button"
                onClick={() => setIsBatch(true)}
                className={cn(
                  'flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold transition-all',
                  isBatch ? 'bg-accent text-white shadow-2xs' : 'text-muted hover:text-text',
                )}
              >
                <Layers className="size-2.5" />
                <span>Multi-Part (Batch)</span>
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={handlePaste}
            className="flex items-center gap-1.5 text-xs font-bold text-accent transition-colors hover:text-accent-hover active:scale-95"
          >
            {pasteSuccess ? (
              <>
                <Check className="size-3.5 text-emerald-500 dark:text-emerald-400" />
                <span className="text-emerald-500 dark:text-emerald-400">Pasted!</span>
              </>
            ) : (
              <>
                <Clipboard className="size-3.5" />
                <span>Paste Link</span>
              </>
            )}
          </button>
        </div>

        <div className="relative">
          {isBatch ? (
            <textarea
              autoFocus
              rows={3}
              value={url}
              onChange={(e) => onUrl(e.target.value)}
              placeholder="https://example.com/game.part1.rar&#10;https://example.com/game.part2.rar&#10;https://example.com/game.part3.rar"
              className="w-full resize-none rounded-xl border border-border/90 bg-surface p-3 font-mono text-xs text-text placeholder:text-muted/60 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 shadow-2xs"
            />
          ) : (
            <input
              autoFocus
              type="url"
              value={url}
              onChange={(e) => onUrl(e.target.value)}
              placeholder="https://example.com/downloads/game-archive.zip"
              className="w-full rounded-xl border border-border/90 bg-surface py-2.5 pl-3.5 pr-20 text-sm font-medium text-text placeholder:text-muted/60 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 shadow-2xs"
            />
          )}

          {!isBatch && detectedExt && isArchive && (
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1 rounded-lg border border-accent/25 bg-accent/10 px-2 py-0.5 font-mono text-[10px] font-extrabold uppercase text-accent">
              <FileArchive className="size-3" />.{detectedExt}
            </span>
          )}
        </div>

        {/* Multi-Part Queue Order Option */}
        {isBatch && (
          <div className="mt-1 flex items-center justify-between rounded-xl border border-border/80 bg-surface p-2.5">
            <div>
              <div className="text-xs font-bold text-text">Multi-Part Order</div>
              <div className="text-[10px] text-muted">
                Sequential downloads avoid host IP bandwidth throttles.
              </div>
            </div>

            <div className="flex items-center gap-1 rounded-lg bg-surface-raised p-0.5 border border-border">
              <button
                type="button"
                onClick={() =>
                  setSetting.mutate({ key: 'download_multi_part_mode', value: 'sequential' })
                }
                className={cn(
                  'rounded-md px-2.5 py-1 text-[10px] font-bold transition-all',
                  settings?.download_multi_part_mode !== 'concurrent'
                    ? 'bg-accent text-white shadow-xs'
                    : 'text-muted hover:text-text',
                )}
              >
                Sequential (One by One)
              </button>
              <button
                type="button"
                onClick={() =>
                  setSetting.mutate({ key: 'download_multi_part_mode', value: 'concurrent' })
                }
                className={cn(
                  'rounded-md px-2.5 py-1 text-[10px] font-bold transition-all',
                  settings?.download_multi_part_mode === 'concurrent'
                    ? 'bg-accent text-white shadow-xs'
                    : 'text-muted hover:text-text',
                )}
              >
                Concurrent (All at Once)
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Archive Password (Optional) */}
      <div className="flex items-center gap-3 rounded-2xl border border-border/80 bg-surface-raised/50 p-3 shadow-xs backdrop-blur-sm">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface text-accent ring-1 ring-border/60">
          <KeyRound className="size-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-bold text-text">
              Archive Password <span className="text-muted font-normal">(Optional)</span>
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPassword('www.downloadha.com')}
                className="text-[10px] font-bold text-accent hover:underline"
                title="Use Downloadha password"
              >
                + downloadha
              </button>
              <button
                type="button"
                onClick={() => setPassword('www.p30day.ir')}
                className="text-[10px] font-bold text-accent hover:underline"
                title="Use P30Day password"
              >
                + p30day
              </button>
              <button
                type="button"
                onClick={() => setPassword('gameq.ir')}
                className="text-[10px] font-bold text-accent hover:underline"
                title="Use GameQ password"
              >
                + gameq
              </button>
            </div>
          </div>
          <input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password for encrypted .rar / .zip"
            className="w-full rounded-xl border border-border bg-surface py-1.5 px-3 text-xs text-text placeholder:text-muted/60 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30 shadow-2xs"
          />
        </div>
      </div>

      {/* Destination Folder Selector */}
      <div className="flex flex-col gap-1.5 rounded-2xl border border-border/80 bg-surface-raised/50 p-4 shadow-xs backdrop-blur-sm">
        <label className="text-xs font-extrabold text-text">Destination Folder</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={savePath}
            onChange={(e) => onSavePath(e.target.value)}
            placeholder="Choose folder on your PC (e.g. D:\Games)"
            className="flex-1 rounded-xl border border-border/90 bg-surface py-2.5 px-3.5 text-xs font-mono text-text placeholder:text-muted/60 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 shadow-2xs"
          />
          <button
            type="button"
            onClick={async () => {
              try {
                const selected = await openDirectoryDialog({ directory: true })
                if (selected && typeof selected === 'string') {
                  if (game?.name) {
                    const safeName = game.name.replace(/[<>:"/\\|?*]/g, '-').trim()
                    const normalized = selected.replace(/[\\/]$/, '')
                    const parts = normalized.split(/[\\/]/)
                    if (parts[parts.length - 1]?.toLowerCase() === safeName.toLowerCase()) {
                      onSavePath(normalized)
                    } else {
                      const sep = normalized.includes('/') ? '/' : '\\'
                      onSavePath(`${normalized}${sep}${safeName}`)
                    }
                  } else {
                    onSavePath(selected)
                  }
                }
              } catch {
                /* picker unavailable */
              }
            }}
            className="flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-xs font-bold text-text shadow-xs transition-all hover:border-accent/50 hover:bg-accent/10 hover:text-accent active:scale-95"
          >
            <FolderOpen className="size-4" />
            <span>Browse</span>
          </button>
        </div>
      </div>

      {/* Parallel Turbo Streams Selector */}
      <div className="flex flex-col gap-2 rounded-2xl border border-border/80 bg-surface-raised/50 p-3.5 shadow-xs backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-extrabold text-text">
            <Network className="size-3.5 text-accent" />
            <span>Multi-Thread Acceleration</span>
          </div>
          <span className="flex items-center gap-1 font-mono text-xs font-bold text-accent">
            <Zap className="size-3" />
            {activeStreams}x Parallel Streams
          </span>
        </div>

        <div className="grid grid-cols-5 gap-1.5">
          {STREAM_OPTIONS.map((num) => (
            <button
              key={num}
              type="button"
              onClick={() => setSetting.mutate({ key: 'download_streams', value: String(num) })}
              className={cn(
                'rounded-xl py-2 text-xs font-extrabold transition-all active:scale-95',
                activeStreams === num
                  ? 'bg-accent text-white shadow-xs'
                  : 'border border-border/80 bg-surface text-muted hover:border-accent/40 hover:text-text',
              )}
            >
              {num}x
            </button>
          ))}
        </div>
      </div>

      {/* Action Footer Buttons */}
      <div className="mt-1 flex items-center gap-3 border-t border-border/60 pt-3.5">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 rounded-2xl border border-border/90 bg-surface py-3 text-xs font-bold text-muted transition-all hover:bg-surface-raised hover:text-text active:scale-95"
        >
          Cancel
        </button>

        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit || pending || isInstalled}
          className={cn(
            'flex flex-[2] items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-accent to-accent-hover py-3 text-xs font-extrabold text-white shadow-md transition-all',
            canSubmit && !pending && !isInstalled
              ? 'hover:shadow-accent/25 active:scale-[0.98]'
              : 'cursor-not-allowed opacity-50',
          )}
        >
          {isInstalled ? (
            <span>Already Installed (Play from Library)</span>
          ) : pending ? (
            <>
              <Loader2 className="size-4.5 animate-spin" />
              <span>Starting download…</span>
            </>
          ) : (
            <>
              <Download className="size-4.5" />
              <span>Start Multi-Thread Download</span>
            </>
          )}
        </button>
      </div>
    </div>
  )
}
