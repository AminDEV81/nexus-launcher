import React, { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Search, X, Sparkles, CornerDownLeft, Delete, Gamepad2, Compass } from 'lucide-react'
import type { Game, HubGame } from '@/types/models'
import { useConsoleStore } from '../store/console-store'
import { FocusScope, useFocusable } from '../nav/FocusScope'
import { Glyph } from './Glyph'
import { resolveConsoleHighResUrl } from './Tile'

const QUICK_CHIPS = [
  'Action',
  'RPG',
  'Adventure',
  'Shooter',
  'Indie',
  'Strategy',
  'Horror',
  'Racing',
]

const KEYPAD_ROWS = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm', '1', '2', '3'],
]

const KeyCapButton: React.FC<{
  id: string
  label: React.ReactNode
  wide?: boolean
  accent?: boolean
  onPress: () => void
}> = ({ id, label, wide, accent, onPress }) => {
  const { focusProps, isFocused } = useFocusable<HTMLButtonElement>({
    id,
    scopeId: 'console-osk',
    onConfirm: onPress,
  })
  return (
    <button
      type="button"
      {...focusProps}
      className={`flex h-11 items-center justify-center rounded-xl border text-sm font-extrabold transition-all cursor-pointer ${
        wide ? 'px-4 min-w-[5.2rem]' : 'w-11'
      } ${
        isFocused
          ? 'scale-110 border-cyan-300 bg-cyan-400 text-slate-950 shadow-[0_0_20px_rgba(0,229,255,0.5)]'
          : accent
            ? 'border-cyan-400/40 bg-cyan-500/20 text-cyan-200 hover:bg-cyan-500/30'
            : 'border-white/12 bg-white/[0.06] text-slate-200 hover:bg-white/12'
      }`}
    >
      {label}
    </button>
  )
}

const LiveResultItem: React.FC<{
  id: string
  title: string
  subtitle: string
  coverUrl: string | null
  badge: string
  onSelect: () => void
}> = ({ id, title, subtitle, coverUrl, badge, onSelect }) => {
  const { focusProps, isFocused } = useFocusable<HTMLButtonElement>({
    id,
    scopeId: 'console-osk',
    onConfirm: onSelect,
  })
  const img = resolveConsoleHighResUrl(coverUrl)

  return (
    <button
      type="button"
      {...focusProps}
      className={`flex w-full items-center gap-3.5 rounded-2xl border p-2.5 text-left transition-all cursor-pointer ${
        isFocused
          ? 'scale-[1.02] border-cyan-300 bg-cyan-400/20 text-white shadow-lg ring-2 ring-cyan-400/40'
          : 'border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]'
      }`}
    >
      <div className="h-14 w-11 shrink-0 overflow-hidden rounded-xl bg-slate-800">
        {img ? (
          <img src={img} alt={title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs font-bold text-slate-400">
            <Gamepad2 className="size-4" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-extrabold text-white">{title}</p>
        <p className="truncate text-xs text-slate-400">{subtitle}</p>
      </div>
      <span className="shrink-0 rounded-full border border-cyan-400/30 bg-cyan-400/15 px-2.5 py-0.5 text-[10px] font-extrabold uppercase text-cyan-300">
        {badge}
      </span>
    </button>
  )
}

export interface ConsoleOSKProps {
  games?: Game[]
  storeGames?: HubGame[]
}

export const ConsoleOSK: React.FC<ConsoleOSKProps> = ({ games = [], storeGames = [] }) => {
  const osk = useConsoleStore((s) => s.osk)
  const closeOsk = useConsoleStore((s) => s.closeOsk)
  const setSelectedGameId = useConsoleStore((s) => s.setSelectedGameId)
  const setSelectedStoreHubGame = useConsoleStore((s) => s.setSelectedStoreHubGame)
  const [value, setValue] = useState(osk.initialValue)

  React.useEffect(() => {
    setValue(osk.initialValue)
  }, [osk.initialValue, osk.open])

  const liveMatches = useMemo(() => {
    const q = value.trim().toLowerCase()
    if (!q) {
      return {
        lib: games.filter((g) => !g.is_hidden && !g.is_memory).slice(0, 4),
        store: storeGames.slice(0, 4),
      }
    }
    const lib = games
      .filter(
        (g) =>
          !g.is_hidden &&
          !g.is_memory &&
          (g.name.toLowerCase().includes(q) ||
            g.genres.some((gn) => gn.toLowerCase().includes(q))),
      )
      .slice(0, 5)

    const store = storeGames
      .filter(
        (hg) =>
          hg.name.toLowerCase().includes(q) ||
          hg.genres.some((gn) => gn.toLowerCase().includes(q)),
      )
      .slice(0, 5)

    return { lib, store }
  }, [value, games, storeGames])

  if (!osk.open) return null

  const handleSubmit = (finalValue = value) => {
    osk.onSubmit?.(finalValue)
    closeOsk()
  }

  return (
    <AnimatePresence>
      <motion.div
        key="console-spotlight-search"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[260] flex items-center justify-center bg-black/75 backdrop-blur-xl p-6 select-none"
      >
        <FocusScope
          id="console-osk"
          trapFocus
          className="w-full max-w-5xl rounded-3xl border border-cyan-400/35 bg-gradient-to-b from-[#111930] via-[#0c1224] to-[#080c18] p-7 shadow-[0_32px_90px_rgba(0,0,0,0.9)]"
        >
          {/* Spotlight Input Bar */}
          <div className="flex items-center gap-4 rounded-2xl border-2 border-cyan-400/50 bg-slate-950/90 px-5 py-3.5 shadow-[0_0_35px_rgba(0,229,255,0.2)]">
            <Search className="size-6 text-cyan-400 shrink-0" />
            <input
              type="text"
              value={value}
              autoFocus
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSubmit()
                if (e.key === 'Escape') closeOsk()
              }}
              placeholder="Search games, genres, or type with keyboard / controller..."
              className="w-full bg-transparent text-xl font-extrabold text-white placeholder:text-slate-500 outline-none"
            />
            {value && (
              <button
                type="button"
                onClick={() => setValue('')}
                className="rounded-xl bg-white/10 px-3 py-1 text-xs font-bold text-slate-300 hover:bg-white/20 cursor-pointer"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={() => handleSubmit()}
              className="flex items-center gap-1.5 rounded-xl bg-cyan-400 px-4 py-2 text-xs font-extrabold text-slate-950 hover:bg-cyan-300 cursor-pointer shrink-0"
            >
              <CornerDownLeft className="size-4" />
              <span>Apply</span>
            </button>
            <button
              type="button"
              onClick={closeOsk}
              className="rounded-xl border border-white/15 bg-white/5 p-2 text-slate-300 hover:bg-white/10 cursor-pointer shrink-0"
            >
              <X className="size-5" />
            </button>
          </div>

          {/* Quick Genre / Filter Pills */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="mr-1 flex items-center gap-1 text-xs font-extrabold uppercase tracking-wider text-cyan-400">
              <Sparkles className="size-3.5" />
              Quick Tags:
            </span>
            {QUICK_CHIPS.map((chip) => (
              <KeyCapButton
                key={chip}
                id={`osk_chip_${chip}`}
                label={chip}
                wide
                onPress={() => {
                  setValue(chip)
                  handleSubmit(chip)
                }}
              />
            ))}
          </div>

          {/* Two-Column Body: Compact Controller Keypad + Instant Live Results */}
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left: Compact Controller Keypad */}
            <div className="lg:col-span-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-2.5">
              <div className="flex items-center justify-between text-xs font-bold text-slate-400 pb-1">
                <span>Controller Keypad</span>
                <span>QWERTY</span>
              </div>
              {KEYPAD_ROWS.map((row, rIdx) => (
                <div key={rIdx} className="flex flex-wrap justify-center gap-1.5">
                  {row.map((ch) => (
                    <KeyCapButton
                      key={ch}
                      id={`osk_key_${ch}`}
                      label={ch.toUpperCase()}
                      onPress={() => setValue((v) => v + ch)}
                    />
                  ))}
                </div>
              ))}
              <div className="flex flex-wrap justify-center gap-2 pt-2">
                <KeyCapButton
                  id="osk_space"
                  label="Space"
                  wide
                  onPress={() => setValue((v) => `${v} `)}
                />
                <KeyCapButton
                  id="osk_backspace"
                  label={
                    <span className="flex items-center gap-1">
                      <Delete className="size-3.5" /> Del
                    </span>
                  }
                  wide
                  onPress={() => setValue((v) => v.slice(0, -1))}
                />
                <KeyCapButton
                  id="osk_clear_all"
                  label="Reset"
                  wide
                  onPress={() => setValue('')}
                />
                <KeyCapButton
                  id="osk_submit_btn"
                  label="Search"
                  wide
                  accent
                  onPress={() => handleSubmit()}
                />
              </div>
            </div>

            {/* Right: Instant Live Results (Library & Store) */}
            <div className="lg:col-span-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3 max-h-[21rem] overflow-y-auto no-scrollbar">
              <div className="flex items-center justify-between text-xs font-bold text-slate-400">
                <span className="flex items-center gap-1.5 text-cyan-300">
                  <Compass className="size-3.5" />
                  Instant Matches
                </span>
                <span>Click to open directly in Console Mode</span>
              </div>

              {liveMatches.lib.length === 0 && liveMatches.store.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-400">
                  No direct title matches for &ldquo;{value}&rdquo; — press Apply to filter grid.
                </div>
              ) : (
                <div className="space-y-2">
                  {liveMatches.lib.map((g) => (
                    <LiveResultItem
                      key={`lib_${g.id}`}
                      id={`osk_res_lib_${g.id}`}
                      title={g.name}
                      subtitle={g.genres.slice(0, 2).join(' · ') || 'In Your Library'}
                      coverUrl={g.cover_path}
                      badge="Library"
                      onSelect={() => {
                        closeOsk()
                        setSelectedGameId(g.id)
                      }}
                    />
                  ))}
                  {liveMatches.store.map((hg) => (
                    <LiveResultItem
                      key={`store_${hg.igdb_id}`}
                      id={`osk_res_store_${hg.igdb_id}`}
                      title={hg.name}
                      subtitle={
                        hg.sale_price_formatted ||
                        hg.genres.slice(0, 2).join(' · ') ||
                        'Store Catalog'
                      }
                      coverUrl={hg.cover_url}
                      badge="Store"
                      onSelect={() => {
                        closeOsk()
                        setSelectedStoreHubGame(hg)
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between border-t border-white/10 pt-4 text-xs text-slate-400">
            <span>Type directly on your physical keyboard or use the controller keypad</span>
            <div className="flex items-center gap-5">
              <Glyph button="confirm" label="Select" size="sm" />
              <Glyph button="back" label="Close" size="sm" />
            </div>
          </div>
        </FocusScope>
      </motion.div>
    </AnimatePresence>
  )
}
