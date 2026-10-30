import React from 'react'
import type { Game, HubGame } from '@/types/models'
import type { SmartRowItem } from '../utils/smart-rows'
import { FocusScope } from '../nav/FocusScope'
import { ConsoleTile } from './Tile'

export interface ConsoleRowProps {
  rowId: string
  title: string
  subtitle?: string
  items: SmartRowItem[]
  variant?: 'poster' | 'landscape' | 'square'
  onSelectGame: (game: Game) => void
  onSelectHubGame?: (hubGame: HubGame) => void
  onFocusGame?: (game: Game) => void
  onOptionsGame?: (game: Game) => void
}

export const ConsoleRow: React.FC<ConsoleRowProps> = React.memo(
  ({
    rowId,
    title,
    subtitle,
    items,
    variant = 'poster',
    onSelectGame,
    onSelectHubGame,
    onFocusGame,
    onOptionsGame,
  }) => {
    if (items.length === 0) return null

    const scopeId = `row_${rowId}`

    return (
      <section className="flex flex-col gap-1 py-1">
        <h2 className="px-2 text-[1.1rem] font-medium tracking-wide text-white/65">
          {title}
          {subtitle && <span className="ml-3 text-[0.95rem] text-white/35">{subtitle}</span>}
        </h2>

        <FocusScope
          id={scopeId}
          orientation="horizontal"
          memory
          className="flex items-start gap-6 overflow-x-auto no-scrollbar px-2 pb-[4.25rem] pt-5"
        >
          {items.map((item) => {
            const pct =
              item.download && item.download.total_bytes > 0
                ? Math.round((item.download.downloaded_bytes / item.download.total_bytes) * 100)
                : undefined

            return (
              <ConsoleTile
                key={`${rowId}_${item.id}`}
                id={`tile_${rowId}_${item.id}`}
                scopeId={scopeId}
                game={item.game}
                hubGame={item.hubGame}
                variant={variant}
                progress={pct}
                isRunning={item.isRunning}
                onSelect={() => {
                  if (item.game) onSelectGame(item.game)
                  else if (item.hubGame) onSelectHubGame?.(item.hubGame)
                }}
                onFocusTile={() => {
                  if (item.game) onFocusGame?.(item.game)
                }}
                onOptionsTile={() => {
                  if (item.game) onOptionsGame?.(item.game)
                }}
              />
            )
          })}
        </FocusScope>
      </section>
    )
  },
)

ConsoleRow.displayName = 'ConsoleRow'
