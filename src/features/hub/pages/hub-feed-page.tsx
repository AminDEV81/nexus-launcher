import { useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChevronDown, Compass, Gamepad2, Loader2 } from 'lucide-react'
import { useHubFeed } from '../hooks/use-hub'
import { HUB_FEEDS, isHubFeedId } from '../feeds'
import { HubBackButton } from '../components/hub-back-button'
import { MissingKeysPanel } from '../components/missing-keys-panel'
import { isMissingIgdbKeys } from '../utils/is-missing-keys'
import { HubGameCard } from '../components/hub-game-card'
import { useGames } from '@/features/library/hooks/use-games'
import {
  buildHubLibraryMatcher,
  buildHubWishlistMatcher,
  buildHubInstalledMatcher,
} from '../utils/in-library'
import { useAnimationSpeed } from '@/hooks/use-animation-speed'

/**
 * The full listing behind a shelf's "More" button: the same feed the
 * hub row previews, as a grid with pagination — identical in spirit to
 * the search results page.
 */
export function HubFeedPage() {
  const params = useParams()
  const feedParam = params.feed ?? ''
  const feed = isHubFeedId(feedParam) ? feedParam : null
  const meta = feed ? HUB_FEEDS[feed] : null

  const browse = useHubFeed(feedParam, feed !== null)
  const { data: games } = useGames()
  const inLibrary = buildHubLibraryMatcher(games)
  const inWishlist = buildHubWishlistMatcher(games)
  const isInstalled = buildHubInstalledMatcher(games)
  const speed = useAnimationSpeed()

  const results = browse.data?.pages.flat() ?? []

  return (
    <div className="h-full overflow-y-auto p-5 sm:p-8">
      <div className="flex flex-col gap-6">
        <HubBackButton />

        {feed && meta ? (
          <motion.header
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24 * speed, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold tracking-[0.16em] text-accent">
              <Compass className="size-3.5" /> GAME HUB
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-text">{meta.title}</h1>
            <p className="mt-1 text-sm text-muted">{meta.subtitle}</p>
          </motion.header>
        ) : (
          <section className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-surface px-8 py-16 text-center">
            <Gamepad2 className="size-6 text-accent" />
            <p className="text-sm text-muted">This collection doesn't exist.</p>
          </section>
        )}

        {feed && isMissingIgdbKeys(browse.error) && <MissingKeysPanel />}

        {feed && browse.error && !isMissingIgdbKeys(browse.error) && (
          <section className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-surface px-8 py-16 text-center">
            <p className="text-sm text-muted">{browse.error.message}</p>
          </section>
        )}

        {feed && browse.isPending && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {Array.from({ length: 12 }, (_, index) => (
              <div
                key={index}
                className="aspect-[3/4] w-full animate-pulse rounded-xl border border-border bg-surface"
              />
            ))}
          </div>
        )}

        {feed && !browse.isPending && !browse.error && results.length === 0 && (
          <section className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-surface px-8 py-16 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-surface-raised">
              <Gamepad2 className="size-5 text-accent" />
            </span>
            <div>
              <div className="text-sm font-medium text-text">Nothing here right now</div>
              <p className="mt-1 text-xs text-muted">
                {feed === 'recommended'
                  ? 'Play a few games with genre tags and picks based on your taste will appear here.'
                  : 'IGDB has no games for this list yet — check back soon.'}
              </p>
            </div>
          </section>
        )}

        {feed && results.length > 0 && (
          <section>
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-subtle">{results.length} games</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 items-stretch">
              {results.map((game) => (
                <HubGameCard
                  key={game.igdb_id}
                  game={game}
                  inLibrary={inLibrary(game)}
                  inWishlist={inWishlist(game)}
                  isInstalled={isInstalled(game)}
                  className="h-full"
                />
              ))}
            </div>
            {browse.hasNextPage && (
              <button
                type="button"
                onClick={() => browse.fetchNextPage()}
                disabled={browse.isFetchingNextPage}
                className="mx-auto mt-6 flex items-center gap-2 rounded-xl border border-border bg-surface px-5 py-2.5 text-sm font-medium text-muted shadow-card transition-colors hover:border-accent/45 hover:text-text disabled:opacity-50"
              >
                {browse.isFetchingNextPage ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ChevronDown className="size-4" />
                )}
                {browse.isFetchingNextPage ? 'Loading…' : 'Load more'}
              </button>
            )}
          </section>
        )}
      </div>
    </div>
  )
}
