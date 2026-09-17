import { useEffect, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useVirtualizer } from '@tanstack/react-virtual'
import { GameCard } from './game-card'
import { useAppearanceSettingsStore } from '@/store/appearance-settings-store'
import { useDragReorder } from '../hooks/use-drag-reorder'
import { useAnimationSpeed } from '@/hooks/use-animation-speed'
import { cn } from '@/lib/utils'
import type { Game } from '@/types/models'

const MAX_COLUMNS = 4
const CARD_GAP = 20
const CARD_META_HEIGHT = 56
/** Cover aspect ratio is 3:4 (width:height), so height = width * (4/3). */
const COVER_ASPECT = 4 / 3
const VIRTUALIZE_THRESHOLD = 48

interface GameGridProps {
  games: Game[]
  selectedId: string | null
  onSelect: (id: string) => void
  onContextMenu: (game: Game, event: MouseEvent) => void
}

/**
 * Renders the game cards in a responsive grid. Virtualizes collections
 * over 48 items to keep DOM small and GPU compositor completely free
 * of unnecessary off-screen compositing layers.
 * Supports smooth Left-Click Hold & Drag reordering.
 */
export function GameGrid({ games, selectedId, onSelect, onContextMenu }: GameGridProps) {
  const parentRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth - 280 : 0,
  )
  const cardMinWidth = useAppearanceSettingsStore((s) => s.cardMinWidth)
  const speed = useAnimationSpeed()
  const { draggedId, handlePointerDown, handleClick } = useDragReorder(games, onSelect)

  useEffect(() => {
    const el = parentRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      setContainerWidth(entries[0].contentRect.width)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const calculatedColumns = Math.floor((containerWidth + CARD_GAP) / (cardMinWidth + CARD_GAP))
  const columnCount = Math.min(MAX_COLUMNS, Math.max(1, calculatedColumns))
  const cardWidth =
    columnCount > 0 && containerWidth > 0
      ? (containerWidth - CARD_GAP * (columnCount - 1)) / columnCount
      : cardMinWidth
  const rowHeight = cardWidth * COVER_ASPECT + CARD_META_HEIGHT
  const rowCount = Math.ceil(games.length / columnCount)

  const shouldVirtualize = games.length > VIRTUALIZE_THRESHOLD

  const rowVirtualizer = useVirtualizer({
    count: shouldVirtualize ? rowCount : 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight + CARD_GAP,
    overscan: 3,
    enabled: shouldVirtualize,
  })

  useEffect(() => {
    if (shouldVirtualize) {
      rowVirtualizer.measure()
    }
  }, [rowHeight, rowVirtualizer, shouldVirtualize])

  return (
    <div ref={parentRef} className="h-full overflow-y-auto px-6 pb-6 pt-3">
      {shouldVirtualize ? (
        <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
          {containerWidth > 0 &&
            rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const startIndex = virtualRow.index * columnCount
              const rowGames = games.slice(startIndex, startIndex + columnCount)

              return (
                <div
                  key={virtualRow.key}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                    display: 'grid',
                    gridTemplateColumns: `repeat(${columnCount}, 1fr)`,
                    gap: CARD_GAP,
                  }}
                >
                  {rowGames.map((game) => (
                    <GameCard
                      key={game.id}
                      game={game}
                      selected={game.id === selectedId}
                      onSelect={onSelect}
                      onContextMenu={onContextMenu}
                    />
                  ))}
                </div>
              )
            })}
        </div>
      ) : (
        <motion.div
          layout
          className="w-full"
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
            gap: CARD_GAP,
          }}
          transition={{
            layout: { type: 'spring', stiffness: 320, damping: 28 },
          }}
        >
          <AnimatePresence initial={false} mode="popLayout">
            {games.map((game) => (
              <motion.div
                layout={draggedId !== null}
                key={game.id}
                data-game-id={game.id}
                className={cn(
                  'transition-opacity select-none',
                  draggedId === game.id && 'opacity-40 scale-[0.98] z-20 cursor-grabbing',
                )}
                exit={{
                  opacity: 0,
                  scale: 0.85,
                  y: -6,
                  transition: { duration: 0.2 * speed, ease: [0.16, 1, 0.3, 1] },
                }}
                transition={{
                  layout: { type: 'spring', stiffness: 320, damping: 28 },
                  opacity: { duration: 0.2 * speed },
                }}
              >
                <div onPointerDown={(e) => handlePointerDown(game.id, e)} className="size-full">
                  <GameCard
                    game={game}
                    selected={game.id === selectedId}
                    onSelect={() => handleClick(game.id)}
                    onContextMenu={onContextMenu}
                  />
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  )
}
