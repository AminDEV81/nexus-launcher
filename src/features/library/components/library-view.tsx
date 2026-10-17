import { useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Dices } from 'lucide-react'
import { motion } from 'framer-motion'
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
import { SmartRouletteModal } from '../components/smart-roulette-modal'
import { playButtonClick } from '@/lib/sound-engine'
import type { Game } from '@/types/models'

interface LibraryViewProps {
  games: Game[]
  isPending: boolean
  title: string
  emptyIcon: LucideIcon
  emptyTitle: string
  emptyDescription: string
  showEmptyActions?: boolean
  onBack?: () => void
  toolbarActions?: ReactNode
}

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
  const [rouletteOpen, setRouletteOpen] = useState(false)

  const [contextMenu, setContextMenu] = useState<{
    gameId: string
    position: { x: number; y: number }
  } | null>(null)

  const contextMenuGame = contextMenu
    ? (games.find((game) => game.id === contextMenu.gameId) ?? null)
    : null

  const speed = useAnimationSpeed()

  function handleContextMenu(game: Game, event: MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
    setContextMenu({ gameId: game.id, position: { x: event.clientX, y: event.clientY } })
  }

  const combinedActions = (
    <div className="flex items-center gap-2">
      {games.length > 0 && (
        <button
          type="button"
          onClick={() => {
            playButtonClick()
            setRouletteOpen(true)
          }}
          title="Smart Game Roulette & Mood Matcher — Let Nexus pick what to play tonight"
          className="inline-flex items-center gap-1.5 rounded-xl border border-accent/40 bg-accent/12 px-3 py-1.5 text-xs font-extrabold text-accent shadow-2xs transition-all hover:bg-accent hover:text-white active:scale-95 cursor-pointer"
        >
          <Dices className="size-3.5" />
          <span className="hidden sm:inline">Game Roulette</span>
        </button>
      )}
      {toolbarActions}
    </div>
  )

  return (
    <div className="flex h-full flex-col">
      <LibraryToolbar
        title={title}
        count={games.length}
        onBack={onBack}
        filtersSlot={<AdvancedFiltersPanel />}
        actions={combinedActions}
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
        ) : viewMode === 'grid' ? (
          <motion.div
            key="grid"
            initial={{ opacity: 0.9, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.14 * speed, ease: 'easeOut' }}
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
            initial={{ opacity: 0.9, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.14 * speed, ease: 'easeOut' }}
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
      </div>

      <GameContextMenu
        game={contextMenuGame}
        position={contextMenu?.position ?? null}
        onClose={() => setContextMenu(null)}
      />

      <SmartRouletteModal
        open={rouletteOpen}
        onClose={() => setRouletteOpen(false)}
        games={games}
      />
    </div>
  )
}
