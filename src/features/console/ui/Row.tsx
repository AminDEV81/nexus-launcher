import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { Game, HubGame } from '@/types/models'
import type { SmartRowItem } from '../utils/smart-rows'
import { FocusScope } from '../nav/FocusScope'
import { animateScrollTo } from '../nav/smooth-scroll'
import { ConsoleTile } from './Tile'
import { useConsoleStore } from '../store/console-store'
import { CONSOLE_THEMES } from '../theme/tokens'

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
    const scrollRef = useRef<HTMLDivElement | null>(null)
    const themeId = useConsoleStore((s) => s.theme)
    const isLight = Boolean(CONSOLE_THEMES[themeId]?.isLight)

    const [canScrollLeft, setCanScrollLeft] = useState(false)
    const [canScrollRight, setCanScrollRight] = useState(items.length > 4)

    const updateScrollArrows = useCallback(() => {
      const el = scrollRef.current
      if (!el) return
      setCanScrollLeft(el.scrollLeft > 12)
      setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 12)
    }, [])

    useEffect(() => {
      updateScrollArrows()
      const el = scrollRef.current
      if (!el) return
      el.addEventListener('scroll', updateScrollArrows, { passive: true })
      window.addEventListener('resize', updateScrollArrows)
      return () => {
        el.removeEventListener('scroll', updateScrollArrows)
        window.removeEventListener('resize', updateScrollArrows)
      }
    }, [items.length, updateScrollArrows])

    const scrollByStep = (dir: -1 | 1) => {
      const el = scrollRef.current
      if (!el) return
      const delta = Math.max(420, Math.round(el.clientWidth * 0.72)) * dir
      animateScrollTo(el, 'x', el.scrollLeft + delta)
    }

    if (items.length === 0) return null

    const scopeId = `row_${rowId}`

    return (
      <section className="group/row relative flex flex-col gap-1 py-1">
        <div className="flex items-center justify-between px-3">
          <div className="flex items-baseline gap-3">
            <h2
              className={`text-[1.22rem] font-extrabold tracking-tight ${
                isLight ? 'text-slate-900' : 'text-white/95'
              }`}
            >
              {title}
            </h2>
            {subtitle && (
              <span
                className={`text-[0.92rem] font-semibold ${
                  isLight ? 'text-indigo-600' : 'text-cyan-300/90'
                }`}
              >
                {subtitle}
              </span>
            )}
          </div>

          {/* Horizontal Scroll Controls + Count Badge (#4) */}
          <div className="flex items-center gap-2.5">
            <span
              className={`mr-1 text-[0.75rem] font-bold uppercase tracking-widest ${
                isLight ? 'text-slate-500' : 'text-slate-400'
              }`}
            >
              {items.length} {items.length === 1 ? 'Title' : 'Titles'}
            </span>

            <button
              type="button"
              onClick={() => scrollByStep(-1)}
              disabled={!canScrollLeft}
              aria-label="Scroll row left"
              title="Scroll Left"
              className={`flex size-9 items-center justify-center rounded-full border transition-all cursor-pointer ${
                canScrollLeft
                  ? isLight
                    ? 'border-slate-300 bg-white text-slate-900 hover:bg-indigo-600 hover:text-white shadow-sm'
                    : 'border-white/20 bg-white/10 text-white hover:bg-cyan-400 hover:text-slate-950 hover:border-cyan-300 shadow'
                  : 'opacity-25 cursor-default border-white/10 bg-white/5 text-slate-500'
              }`}
            >
              <ChevronLeft className="size-5" />
            </button>

            <button
              type="button"
              onClick={() => scrollByStep(1)}
              disabled={!canScrollRight}
              aria-label="Scroll row right"
              title="Scroll Right"
              className={`flex size-9 items-center justify-center rounded-full border transition-all cursor-pointer ${
                canScrollRight
                  ? isLight
                    ? 'border-slate-300 bg-white text-slate-900 hover:bg-indigo-600 hover:text-white shadow-sm'
                    : 'border-white/20 bg-white/10 text-white hover:bg-cyan-400 hover:text-slate-950 hover:border-cyan-300 shadow'
                  : 'opacity-25 cursor-default border-white/10 bg-white/5 text-slate-500'
              }`}
            >
              <ChevronRight className="size-5" />
            </button>
          </div>
        </div>

        {/* Floating Side Arrow Overlays on Row Hover (#4) */}
        <div className="relative">
          {canScrollLeft && (
            <button
              type="button"
              onClick={() => scrollByStep(-1)}
              aria-label="Scroll left"
              className="absolute left-1 top-1/2 -translate-y-1/2 z-30 flex size-12 items-center justify-center rounded-full border border-cyan-300/50 bg-slate-950/85 text-cyan-300 opacity-0 group-hover/row:opacity-100 hover:bg-cyan-400 hover:text-slate-950 transition-all shadow-2xl cursor-pointer"
            >
              <ChevronLeft className="size-6 stroke-[2.5]" />
            </button>
          )}

          {canScrollRight && (
            <button
              type="button"
              onClick={() => scrollByStep(1)}
              aria-label="Scroll right"
              className="absolute right-1 top-1/2 -translate-y-1/2 z-30 flex size-12 items-center justify-center rounded-full border border-cyan-300/50 bg-slate-950/85 text-cyan-300 opacity-0 group-hover/row:opacity-100 hover:bg-cyan-400 hover:text-slate-950 transition-all shadow-2xl cursor-pointer"
            >
              <ChevronRight className="size-6 stroke-[2.5]" />
            </button>
          )}

          {/* Requirement #9: pt-9 (2.25rem) top padding ensures scaled-up covers never clip at the top! */}
          <div
            ref={scrollRef}
            onWheel={(e) => {
              if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey) {
                if (scrollRef.current) {
                  scrollRef.current.scrollLeft += e.deltaX || e.deltaY
                }
              }
            }}
            className="overflow-x-auto no-scrollbar px-4 pb-[4.5rem] pt-9"
          >
            <FocusScope
              id={scopeId}
              orientation="horizontal"
              memory
              className="flex items-start gap-6"
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
          </div>
        </div>
      </section>
    )
  },
)

ConsoleRow.displayName = 'ConsoleRow'
