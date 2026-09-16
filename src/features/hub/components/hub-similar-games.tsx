import { useRef } from 'react'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react'
import { usePersonalizedSimilarGames } from '../hooks/use-personalization'
import { HubGameCard } from './hub-game-card'
import { useGames } from '@/features/library/hooks/use-games'
import {
  buildHubLibraryMatcher,
  buildHubWishlistMatcher,
  buildHubInstalledMatcher,
} from '../utils/in-library'
import { useAnimationSpeed } from '@/hooks/use-animation-speed'
import { useAppearanceSettingsStore } from '@/store/appearance-settings-store'
import type { HubGameDetails, HubGame } from '@/types/models'

export interface HubSimilarGamesProps {
  targetGame: HubGameDetails | HubGame
}

export function HubSimilarGames({ targetGame }: HubSimilarGamesProps) {
  const { data: similarGames, isPending } = usePersonalizedSimilarGames(targetGame)
  const { data: games } = useGames()
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const speed = useAnimationSpeed()
  const reduceMotion = useAppearanceSettingsStore((s) => s.reduceMotion)

  const inLibrary = buildHubLibraryMatcher(games)
  const inWishlist = buildHubWishlistMatcher(games)
  const isInstalled = buildHubInstalledMatcher(games)

  function scroll(direction: 'left' | 'right') {
    if (!scrollContainerRef.current) return
    const offset = direction === 'left' ? -380 : 380
    scrollContainerRef.current.scrollBy({ left: offset, behavior: 'smooth' })
  }

  if (isPending) {
    return (
      <section className="flex flex-col gap-3.5 pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-xl bg-surface-raised animate-pulse" />
            <div className="flex flex-col gap-1">
              <div className="h-5 w-40 rounded-md bg-surface-raised animate-pulse" />
              <div className="h-3 w-64 rounded-md bg-surface-raised/60 animate-pulse" />
            </div>
          </div>
        </div>
        <div className="flex gap-4 overflow-hidden pt-1">
          {Array.from({ length: 5 }, (_, i) => (
            <div
              key={i}
              className="w-44 sm:w-48 lg:w-52 shrink-0 aspect-[3/4] animate-pulse rounded-2xl border border-border/80 bg-surface/80"
            />
          ))}
        </div>
      </section>
    )
  }

  // Section 44.6: If fewer than 3 meaningful matches exist, hide gracefully
  if (!similarGames || similarGames.length < 3) {
    return null
  }

  return (
    <motion.section
      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 * speed, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col gap-3.5 pt-4"
    >
      {/* Shelf Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-500/20 to-accent/10 shadow-xs text-violet-400">
            <Sparkles className="size-5 fill-current" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold tracking-tight text-text">
                You May Also Like
              </h2>
              <span className="rounded-full border border-violet-500/30 bg-violet-500/15 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-violet-300">
                Nexus Taste Match
              </span>
              <span className="rounded-full bg-surface-raised px-2 py-0.5 text-[10px] font-medium text-subtle">
                {similarGames.length} matches
              </span>
            </div>
            <p className="text-xs text-subtle">
              Curated from game mechanics & themes, ranked by your gaming taste
            </p>
          </div>
        </div>

        {/* Scroll navigation arrows */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Scroll left"
            onClick={() => scroll('left')}
            className="flex size-8 items-center justify-center rounded-xl border border-border/80 bg-surface text-subtle shadow-xs transition-all hover:border-accent/40 hover:bg-surface-raised hover:text-text active:scale-95"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Scroll right"
            onClick={() => scroll('right')}
            className="flex size-8 items-center justify-center rounded-xl border border-border/80 bg-surface text-subtle shadow-xs transition-all hover:border-accent/40 hover:bg-surface-raised hover:text-text active:scale-95"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      {/* Horizontal Carousel */}
      <div
        ref={scrollContainerRef}
        className="flex items-stretch gap-4 overflow-x-auto pb-3 pt-1 pr-1 scrollbar-none"
      >
        {similarGames.map((game) => (
          <div key={game.igdb_id} className="flex w-48 sm:w-52 shrink-0 flex-col">
            <HubGameCard
              game={game}
              inLibrary={inLibrary(game)}
              inWishlist={inWishlist ? inWishlist(game) : false}
              isInstalled={isInstalled ? isInstalled(game) : false}
              nexusMatch={game.nexusMatch}
              matchReason={game.matchReason}
              similarityReason={game.similarityReason}
              breakdownChips={game.breakdown?.highlightChips}
              className="h-full"
            />
          </div>
        ))}
      </div>
    </motion.section>
  )
}
