import { useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAnimationSpeed } from '@/hooks/use-animation-speed'
import { useUiStore } from '@/store/ui-store'
import { useLibraryUiStore } from '../store/library-ui-store'
import { LibraryToolbar } from '../components/library-toolbar'
import { AdvancedFiltersPanel } from '../components/advanced-filters-panel'
import { GameGrid } from '../components/game-grid'
import { GameList } from '../components/game-list'
import { GameContextMenu } from '../components/game-context-menu'
import { LibraryEmptyState } from '../components/library-empty-state'
import { LibrarySkeleton } from '../components/library-skeleton'
import type { Game } from '@/types/models'

interface LibraryViewProps {
  games: Game[]
  isPending: boolean
  title: string
  emptyIcon: LucideIcon
  emptyTitle: string
  emptyDescription: string
  /** Only the main "Library" view offers Add Game / Scan shortcuts from
   *  its empty state — an empty Favorites/Hidden/collection view isn't
   *  "you have no games", it's "none of your games match this filter
   *  yet". */
  showEmptyActions?: boolean
  onBack?: () => void
  toolbarActions?: ReactNode
}

/**
 * The actual toolbar + grid/list + context-menu body shared by every
 * library-shaped view — the five scoped `LibraryPage` routes and the
 * collection detail page alike. Takes `games`/`isPending` as props
 * rather than fetching them itself so each caller can source that list
 * however makes sense for it (`useFilteredGames(scope)` vs.
 * `useFilteredCollectionGames(collectionId)`) while sharing everything
 * else — the toolbar, advanced filters, empty state, grid/list toggle,
 * and right-click menu, which would otherwise have to be duplicated
 * and would inevitably drift between the two.
 */
export function LibraryView({
  games,
  isPending,
  title,
  emptyIcon,
  emptyTitle,
  emptyDescription,
  showEmptyActions,
  onBack,
  toolbarActions,
}: LibraryViewProps) {
  const selectedId = useUiStore((s) => s.selectedGameId)
  const selectGame = useUiStore((s) => s.selectGame)
  const viewMode = useLibraryUiStore((s) => s.viewMode)

  const [contextMenu, setContextMenu] = useState<{
    gameId: string
    position: { x: number; y: number }
  } | null>(null)

  // Look the game up live from `games` on every render instead of
  // freezing the object clicked at menu-open time — otherwise a
  // mutation (e.g. toggling Live Cover) doesn't reflect in the menu
  // until it's closed and reopened, making "Enable"/"Disable" look
  // like they do nothing or the same thing.
  const contextMenuGame = contextMenu
    ? (games.find((game) => game.id === contextMenu.gameId) ?? null)
    : null

  const speed = useAnimationSpeed()

  function handleContextMenu(game: Game, event: MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
    setContextMenu({ gameId: game.id, position: { x: event.clientX, y: event.clientY } })
  }

  return (
    <div className="flex h-full flex-col">
      <LibraryToolbar
        title={title}
        count={games.length}
        onBack={onBack}
        filtersSlot={<AdvancedFiltersPanel />}
        actions={toolbarActions}
      />

      <div className="min-h-0 flex-1">
        {isPending ? (
          <LibrarySkeleton />
        ) : games.length === 0 ? (
          <LibraryEmptyState
            icon={emptyIcon}
            title={emptyTitle}
            description={emptyDescription}
            showActions={showEmptyActions}
          />
        ) : (
          <AnimatePresence mode="wait" initial={false}>
            {viewMode === 'grid' ? (
              <motion.div
                key="grid"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 * speed, ease: [0.16, 1, 0.3, 1] }}
                className="h-full"
              >
                <GameGrid
                  games={games}
                  selectedId={selectedId}
                  onSelect={selectGame}
                  onContextMenu={handleContextMenu}
                />
              </motion.div>
            ) : (
              <motion.div
                key="list"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 * speed, ease: [0.16, 1, 0.3, 1] }}
                className="h-full"
              >
                <GameList
                  games={games}
                  selectedId={selectedId}
                  onSelect={selectGame}
                  onContextMenu={handleContextMenu}
                />
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>

      <GameContextMenu
        game={contextMenuGame}
        position={contextMenu?.position ?? null}
        onClose={() => setContextMenu(null)}
      />
    </div>
  )
}
