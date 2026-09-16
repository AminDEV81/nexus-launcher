import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ChevronDown, ChevronUp, Film, Sparkles } from 'lucide-react'
import { useHubGameDetails } from '../hooks/use-hub'
import { HubBackButton } from '../components/hub-back-button'
import { MissingKeysPanel } from '../components/missing-keys-panel'
import { HubOfflinePanel } from '../components/hub-offline-panel'
import { isMissingIgdbKeys } from '../utils/is-missing-keys'
import { useSettings } from '@/features/settings/hooks/use-settings'
import { HubTrailerModal } from '../components/hub-trailer-modal'
import { HubRegionalPriceModal } from '../components/hub-regional-price-modal'
import { HubGameHero } from '../components/hub-game-hero'
import { HubMediaShowcase } from '../components/hub-media-showcase'
import { HubGameSpecs } from '../components/hub-game-specs'
import { HubDetailsSkeleton } from '../components/hub-game-skeleton'
import { HubSimilarGames } from '../components/hub-similar-games'
import { HubSoundtrackSection } from '@/features/soundtrack/components/hub/hub-soundtrack-section'
import { useGames } from '@/features/library/hooks/use-games'
import { findLibraryEntry } from '../utils/in-library'
import { localDateKey } from '@/features/library/utils/format'
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

  const { data: game, isPending, error } = useHubGameDetails(igdbId)
  const { data: games } = useGames()

  // Trailer & Regional Price UI States
  const [trailerModalOpen, setTrailerModalOpen] = useState(false)
  const [regionalPriceModalOpen, setRegionalPriceModalOpen] = useState(false)
  const [selectedTrailerIndex, setSelectedTrailerIndex] = useState(0)
  const [descriptionExpanded, setDescriptionExpanded] = useState(false)

  // Matches manual entries too, which have no igdb_id — see in-library.ts.
  const libraryEntry = useMemo(
    () => findLibraryEntry(games, game ?? { igdb_id: igdbId, name: '' }),
    [games, game, igdbId],
  )
  const inLibrary = libraryEntry !== undefined && !libraryEntry.is_wishlist
  const inWishlist = libraryEntry?.is_wishlist ?? false
  const isInstalled = Boolean(libraryEntry && libraryEntry.is_installed)
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

  function handleOpenTrailer(index = 0) {
    setSelectedTrailerIndex(index)
    setTrailerModalOpen(true)
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
          <HubOfflinePanel onRetry={() => window.location.reload()} message={error?.message} />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6 lg:p-8 xl:px-10">
      <div className="mx-auto flex w-full max-w-[1920px] flex-col gap-7">
        {/* Navigation Bar */}
        <div className="flex items-center justify-between">
          <HubBackButton />
          {allVideos.length > 0 && (
            <button
              type="button"
              onClick={() => handleOpenTrailer(0)}
              className="inline-flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-1.5 text-xs font-bold text-red-500 transition-all hover:bg-red-500/20 active:scale-95"
            >
              <Film className="size-3.5" />
              <span>Watch Trailers ({allVideos.length})</span>
            </button>
          )}
        </div>

        {/* ── 1. Cinematic Hero Section ──────────────────────────────── */}
        <HubGameHero
          game={game}
          libraryEntry={libraryEntry}
          inLibrary={inLibrary}
          inWishlist={inWishlist}
          isInstalled={isInstalled}
          isReleased={isReleased}
          allVideos={allVideos}
          onOpenTrailer={handleOpenTrailer}
          onOpenRegionalPrice={() => setRegionalPriceModalOpen(true)}
        />

        {/* ── 2. Media Showcase (Trailers & Screenshots) ─────────────── */}
        <HubMediaShowcase
          gameName={game.name}
          videos={allVideos}
          screenshotUrls={game.screenshot_urls}
          onPlayTrailer={handleOpenTrailer}
        />

        {/* ── 3. Information & Details Grid ──────────────────────────── */}
        <div className="grid gap-6 lg:grid-cols-[1.8fr_1fr] xl:grid-cols-[2fr_1fr]">
          {/* About / Synopsis Card */}
          <section className="flex flex-col gap-4 rounded-3xl border border-border bg-surface p-6 shadow-sm">
            <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-wider text-accent">
              <Sparkles className="size-4" />
              <span>About the Game</span>
              <span className="h-px flex-1 bg-gradient-to-r from-accent/40 to-transparent" />
            </div>

            <div className="relative">
              <p
                className={cn(
                  'whitespace-pre-line text-sm leading-relaxed text-muted transition-all',
                  !descriptionExpanded && 'line-clamp-6',
                )}
              >
                {game.summary ?? 'No synopsis available from IGDB for this title.'}
              </p>

              {(game.summary?.length ?? 0) > 360 && (
                <button
                  type="button"
                  onClick={() => setDescriptionExpanded(!descriptionExpanded)}
                  className="mt-3 flex items-center gap-1.5 text-xs font-bold text-accent transition-colors hover:text-accent-hover"
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

            {/* Platforms */}
            {game.platforms.length > 0 && (
              <div className="mt-2 border-t border-border/80 pt-4">
                <span className="text-[11px] font-bold uppercase tracking-wider text-subtle block mb-2.5">
                  Available Platforms
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
          </section>

          {/* Game Metadata Specs Card (with dual Metacritic + IGDB critics) */}
          <HubGameSpecs
            game={game}
            isReleased={isReleased}
            onOpenRegionalPrice={() => setRegionalPriceModalOpen(true)}
          />
        </div>

        {/* ── 4. Cinematic Soundtrack Experience ────────────────────── */}
        <HubSoundtrackSection game={game} />

        {/* ── 5. You May Also Like / Similar Games (Personalized) ────── */}
        <HubSimilarGames targetGame={game} />
      </div>

      {/* ── 6. Trailer Theater Modal ─────────────────────────────────── */}
      <HubTrailerModal
        open={trailerModalOpen}
        onClose={() => setTrailerModalOpen(false)}
        gameName={game.name}
        videos={allVideos}
        initialIndex={selectedTrailerIndex}
      />

      {/* ── 6. Steam Regional Price Tracker Modal (SteamDB Style) ───── */}
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
