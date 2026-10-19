import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Cpu,
  Disc3,
  Film,
  Gamepad2,
  Layers,
  Monitor,
  RefreshCw,
  Sparkles,
  Trophy,
} from 'lucide-react'
import { toast } from 'sonner'
import { useHubGameDetails, useRefreshHubCatalog } from '../hooks/use-hub'
import { HubBackButton } from '../components/hub-back-button'
import { MissingKeysPanel } from '../components/missing-keys-panel'
import { HubOfflinePanel } from '../components/hub-offline-panel'
import { isMissingIgdbKeys } from '../utils/is-missing-keys'
import { useSettings } from '@/features/settings/hooks/use-settings'
import { HubRegionalPriceModal } from '../components/hub-regional-price-modal'
import { HubGameHero, genreColor } from '../components/hub-game-hero'
import { HubMediaShowcase } from '../components/hub-media-showcase'
import { HubGameSpecs } from '../components/hub-game-specs'
import { HubSystemRequirements } from '../components/hub-system-requirements'
import { HubDetailsSkeleton } from '../components/hub-game-skeleton'
import { HubSimilarGames } from '../components/hub-similar-games'
import { HubSoundtrackSection } from '@/features/soundtrack/components/hub/hub-soundtrack-section'
import { useGames } from '@/features/library/hooks/use-games'
import { findLibraryEntry } from '../utils/in-library'
import { formatReleaseDate, localDateKey } from '@/features/library/utils/format'
import { playButtonClick } from '@/lib/sound-engine'
import { cn } from '@/lib/utils'
import type { HubVideo } from '@/types/models'

function extractYouTubeId(url: string | null): string | null {
  if (!url) return null
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([\w-]{11})/)
  return match ? match[1] : null
}

export function HubGamePage() {
  const params = useParams()
  const igdbId = Number(params.igdbId)

  const { data: game, isPending, isFetching, error, refetch } = useHubGameDetails(igdbId)
  const refreshCatalog = useRefreshHubCatalog()
  const { data: games } = useGames()

  // Inline Trailer & Regional Price UI States (Zero Trailer Modal — plays directly in-page!)
  const [activeTrailerIndex, setActiveTrailerIndex] = useState<number | null>(null)
  const [regionalPriceModalOpen, setRegionalPriceModalOpen] = useState(false)
  const [descriptionExpanded, setDescriptionExpanded] = useState(false)

  // Matches manual entries too, which have no igdb_id — see in-library.ts.
  const libraryEntry = useMemo(
    () => findLibraryEntry(games, game ?? { igdb_id: igdbId, name: '' }),
    [games, game, igdbId],
  )
  const isMemory = Boolean(libraryEntry?.is_memory)
  const inLibrary =
    libraryEntry !== undefined && !libraryEntry.is_wishlist && !libraryEntry.is_memory
  const inWishlist = (libraryEntry?.is_wishlist ?? false) && !libraryEntry?.is_memory
  const isInstalled = Boolean(libraryEntry && libraryEntry.is_installed && !libraryEntry.is_memory)
  const isReleased = !game?.release_date || game.release_date <= localDateKey()

  // Aggregate all available videos (both from `game.videos` and fallback `game.trailer_url`)
  const allVideos: HubVideo[] = useMemo(() => {
    if (game?.videos && game.videos.length > 0) {
      return game.videos
    }
    const fallbackId = extractYouTubeId(game?.trailer_url ?? null)
    if (fallbackId) {
      return [{ name: 'Official Trailer', video_id: fallbackId }]
    }
    return []
  }, [game?.videos, game?.trailer_url])

  function handlePlayInlineTrailer(index = 0) {
    playButtonClick()
    setActiveTrailerIndex(index)
    const el = document.getElementById('hub-media-showcase')
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  function scrollToSection(id: string) {
    playButtonClick()
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  async function handleLiveRefreshGame() {
    playButtonClick()
    try {
      await refreshCatalog.mutateAsync()
      await refetch()
      toast.success(`Synced latest screenshots, trailers & hardware specs for ${game?.name || 'game'}`)
    } catch {
      void refetch()
    }
  }

  const { data: settings } = useSettings()
  const providerMode = settings?.metadata_provider_mode ?? 'public'

  if (isPending) {
    return <HubDetailsSkeleton />
  }

  if (isMissingIgdbKeys(error, providerMode)) {
    return (
      <div className="h-full overflow-y-auto p-4 sm:p-6 lg:p-8 xl:px-10">
        <div className="mx-auto flex w-full max-w-[1920px] flex-col gap-7">
          <HubBackButton />
          <MissingKeysPanel />
        </div>
      </div>
    )
  }

  if (error || !game) {
    return (
      <div className="h-full overflow-y-auto p-4 sm:p-6 lg:p-8 xl:px-10">
        <div className="mx-auto flex w-full max-w-[1920px] flex-col gap-7">
          <HubBackButton />
          <HubOfflinePanel onRetry={() => void refetch()} message={error?.message} />
        </div>
      </div>
    )
  }

  const isSyncing = isFetching || refreshCatalog.isPending
  const bestScore =
    game.metacritic_score ??
    game.opencritic_score ??
    libraryEntry?.metacritic_score ??
    libraryEntry?.opencritic_score ??
    game.rating ??
    null

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6 lg:p-8 xl:px-10">
      <div className="mx-auto flex w-full max-w-[1920px] flex-col gap-6">
        {/* ── Top Action & Quick-Jump Navigation Bar ───────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <HubBackButton />

          {/* Section Quick-Jump Pills */}
          <div className="hidden xl:flex items-center gap-1.5 rounded-2xl border border-border bg-surface p-1 shadow-2xs">
            <button
              type="button"
              onClick={() => scrollToSection('hub-media-showcase')}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold text-subtle transition-colors hover:bg-surface-raised hover:text-text cursor-pointer"
            >
              <Film className="size-3.5 text-accent" />
              <span>Media &amp; Trailers</span>
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('hub-about-section')}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold text-subtle transition-colors hover:bg-surface-raised hover:text-text cursor-pointer"
            >
              <Sparkles className="size-3.5 text-accent" />
              <span>Overview &amp; Specs</span>
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('hub-system-requirements')}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold text-subtle transition-colors hover:bg-surface-raised hover:text-text cursor-pointer"
            >
              <Cpu className="size-3.5 text-accent" />
              <span>System Requirements</span>
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('hub-soundtrack-anchor')}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold text-subtle transition-colors hover:bg-surface-raised hover:text-text cursor-pointer"
            >
              <Disc3 className="size-3.5 text-accent" />
              <span>Soundtrack</span>
            </button>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => void handleLiveRefreshGame()}
              disabled={isSyncing}
              title="Re-sync latest screenshots, trailers, genres & scores"
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3.5 py-1.5 text-xs font-semibold text-text shadow-2xs transition-all hover:border-accent/40 hover:text-accent active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={cn('size-3.5 text-accent', isSyncing && 'animate-spin')} />
              <span>{isSyncing ? 'Syncing Live...' : 'Sync Live Data'}</span>
            </button>

            {allVideos.length > 0 && (
              <button
                type="button"
                onClick={() => handlePlayInlineTrailer(0)}
                className="inline-flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-1.5 text-xs font-bold text-red-400 transition-all hover:bg-red-500/20 active:scale-95 cursor-pointer"
              >
                <Film className="size-3.5" />
                <span>Play 18+ Trailer Inline ({allVideos.length})</span>
              </button>
            )}
          </div>
        </div>

        {/* ── 1. Cinematic Hero Section ──────────────────────────────── */}
        <HubGameHero
          game={game}
          libraryEntry={libraryEntry}
          inLibrary={inLibrary}
          inWishlist={inWishlist}
          isInstalled={isInstalled}
          isMemory={isMemory}
          isReleased={isReleased}
          allVideos={allVideos}
          onOpenTrailer={handlePlayInlineTrailer}
          onOpenRegionalPrice={() => setRegionalPriceModalOpen(true)}
        />

        {/* ── 1.5 Telemetry Quick-Glance Strip ───────────────────────── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-2xs">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-accent/30 bg-accent/10 text-accent">
              <CalendarDays className="size-5" />
            </div>
            <div className="min-w-0">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-subtle">
                Release Date
              </span>
              <span className="truncate block text-sm font-extrabold text-text">
                {game.release_date ? formatReleaseDate(game.release_date) : 'TBA'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-2xs">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
              <Building2 className="size-5" />
            </div>
            <div className="min-w-0">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-subtle">
                Lead Studio
              </span>
              <span className="truncate block text-sm font-extrabold text-text">
                {game.developer || game.publisher || 'Official Studio'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-2xs">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-400">
              <Trophy className="size-5" />
            </div>
            <div className="min-w-0">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-subtle">
                Critic Consensus
              </span>
              <span className="truncate block text-sm font-extrabold text-text">
                {bestScore ? `${bestScore} / 100 Rated` : 'Awaiting Reviews'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-2xs">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-purple-500/30 bg-purple-500/10 text-purple-400">
              <Gamepad2 className="size-5" />
            </div>
            <div className="min-w-0">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-subtle">
                Media &amp; Captures
              </span>
              <span className="truncate block text-sm font-extrabold text-text">
                {allVideos.length} Trailers • {game.screenshot_urls.length} Shots
              </span>
            </div>
          </div>
        </div>

        {/* ── 2. Media Showcase (Direct In-Page 18+ Trailers & Screenshots) ── */}
        <HubMediaShowcase
          gameName={game.name}
          steamAppId={game.steam_app_id}
          videos={allVideos}
          screenshotUrls={game.screenshot_urls}
          activeTrailerIndex={activeTrailerIndex}
          onSelectTrailer={setActiveTrailerIndex}
        />

        {/* ── 3. Information & Details Grid ──────────────────────────── */}
        <div
          id="hub-about-section"
          className="grid gap-6 lg:grid-cols-[1.75fr_1fr] xl:grid-cols-[1.95fr_1fr]"
        >
          {/* About / Synopsis & Genres/Platforms Card */}
          <section className="flex flex-col justify-between gap-5 rounded-3xl border border-border bg-surface p-6 sm:p-7 shadow-sm">
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-wider text-accent">
                <Sparkles className="size-4" />
                <span>About {game.name}</span>
                <span className="h-px flex-1 bg-gradient-to-r from-accent/40 to-transparent" />
              </div>

              <div className="relative">
                <p
                  className={cn(
                    'whitespace-pre-line text-sm leading-relaxed text-muted transition-all',
                    !descriptionExpanded && 'line-clamp-7',
                  )}
                >
                  {game.summary ?? 'No synopsis available from IGDB or Steam for this title.'}
                </p>

                {(game.summary?.length ?? 0) > 360 && (
                  <button
                    type="button"
                    onClick={() => setDescriptionExpanded(!descriptionExpanded)}
                    className="mt-3 flex items-center gap-1.5 text-xs font-bold text-accent transition-colors hover:text-accent-hover cursor-pointer"
                  >
                    <span>{descriptionExpanded ? 'Read less' : 'Read full summary'}</span>
                    {descriptionExpanded ? (
                      <ChevronUp className="size-3.5" />
                    ) : (
                      <ChevronDown className="size-3.5" />
                    )}
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-4 border-t border-border/80 pt-5">
              {/* Complete Genres & Themes Breakdown */}
              {game.genres.length > 0 && (
                <div>
                  <span className="mb-2.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-subtle">
                    <Layers className="size-3.5 text-accent" />
                    <span>Genres &amp; Gameplay Themes ({game.genres.length})</span>
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {game.genres.map((genre) => {
                      const color = genreColor(genre)
                      return (
                        <span
                          key={genre}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface-raised px-3 py-1 text-xs font-semibold text-text shadow-2xs"
                          style={{ borderColor: `${color}55` }}
                        >
                          <span
                            className="size-2 rounded-full shrink-0"
                            style={{ backgroundColor: color }}
                          />
                          <span>{genre}</span>
                        </span>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Supported Platforms */}
              {game.platforms.length > 0 && (
                <div>
                  <span className="mb-2.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-subtle">
                    <Monitor className="size-3.5 text-accent" />
                    <span>Available Platforms ({game.platforms.length})</span>
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {game.platforms.map((platform) => (
                      <span
                        key={platform}
                        className="rounded-xl border border-border bg-surface-raised px-3 py-1 text-xs font-medium text-text shadow-xs"
                      >
                        {platform}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Game Metadata Specs Card */}
          <HubGameSpecs
            game={game}
            isReleased={isReleased}
            onOpenRegionalPrice={() => setRegionalPriceModalOpen(true)}
          />
        </div>

        {/* ── 4. PC System Requirements (Minimum & Recommended + Live PC Check) ── */}
        <HubSystemRequirements
          systemRequirements={game.system_requirements}
          gameTitle={game.name}
          releaseDate={game.release_date}
          genres={game.genres}
        />

        {/* ── 5. Cinematic Soundtrack Experience ────────────────────── */}
        <div id="hub-soundtrack-anchor">
          <HubSoundtrackSection game={game} />
        </div>

        {/* ── 6. You May Also Like / Similar Games (Personalized) ────── */}
        <HubSimilarGames targetGame={game} />
      </div>

      {/* ── Steam Regional Price Tracker Modal (SteamDB Style) ───── */}
      <HubRegionalPriceModal
        open={regionalPriceModalOpen}
        onClose={() => setRegionalPriceModalOpen(false)}
        steamAppId={game.steam_app_id}
        gameName={game.name}
        coverUrl={game.cover_url}
      />
    </div>
  )
}
