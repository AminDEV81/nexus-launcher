import React, { useEffect, useMemo, useState } from 'react'
import {
  Archive,
  ArrowUpDown,
  Award,
  Clock,
  Gamepad2,
  Keyboard,
  Loader2,
  Monitor,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import type { Game } from '@/types/models'
import { formatPlaytime } from '@/features/library/utils/format'
import { buildCoverFallbackChain } from '@/features/hub/utils/cover-fallback'
import { permanentlyDeleteGame, restoreGameFromMemory } from '@/services/games'
import { repairMissingCovers } from '@/services/metadata'
import { useConsoleStore } from '../store/console-store'
import { CONSOLE_THEMES } from '../theme/tokens'
import { FocusScope, useFocusable } from '../nav/FocusScope'
import { resolveConsoleHighResUrl, resolveConsoleMediaUrl } from '../ui/Tile'

export interface MemoryViewProps {
  games: Game[]
  onOpenGameHub: (game: Game) => void
  onFocusGame?: (game: Game) => void
  onRefreshGames: () => void
  onSwitchToLegacyMode?: () => void
}

type MemorySortMode = 'playtime' | 'recent' | 'name'

interface MasteryRankInfo {
  label: string
  pillClass: string
}

function getMasteryRank(seconds: number, isLight: boolean): MasteryRankInfo {
  const hours = seconds / 3600
  if (hours >= 100) {
    return {
      label: 'Legend · 100h+',
      pillClass: 'border-amber-300/60 bg-amber-400 text-slate-950',
    }
  }
  if (hours >= 50) {
    return {
      label: 'Master · 50h+',
      pillClass: 'border-violet-400/50 bg-violet-500 text-white',
    }
  }
  if (hours >= 25) {
    return {
      label: 'Veteran · 25h+',
      pillClass: 'border-cyan-300/60 bg-cyan-400 text-slate-950',
    }
  }
  if (hours >= 5) {
    return {
      label: 'Explorer',
      pillClass: isLight
        ? 'border-emerald-300 bg-emerald-100 text-emerald-900'
        : 'border-emerald-400/40 bg-emerald-500/20 text-emerald-300',
    }
  }
  return {
    label: 'Archived',
    pillClass: isLight
      ? 'border-slate-300 bg-slate-100 text-slate-700'
      : 'border-white/20 bg-black/70 text-slate-300',
  }
}

export const MemoryView: React.FC<MemoryViewProps> = ({
  games,
  onOpenGameHub,
  onFocusGame,
  onRefreshGames,
  onSwitchToLegacyMode,
}) => {
  const themeId = useConsoleStore((s) => s.theme)
  const isLight = Boolean(CONSOLE_THEMES[themeId]?.isLight)
  const openOsk = useConsoleStore((s) => s.openOsk)

  const [query, setQuery] = useState('')
  const [sortMode, setSortMode] = useState<MemorySortMode>('playtime')
  const [busyGameId, setBusyGameId] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    repairMissingCovers()
      .then((res) => {
        if (active && res.repaired_count > 0) {
          onRefreshGames()
        }
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [onRefreshGames])

  const memoryGames = useMemo(
    () => games.filter((g) => g.is_memory && !g.is_hidden),
    [games],
  )

  const displayedGames = useMemo(() => {
    let list = [...memoryGames]
    const q = query.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (g) =>
          g.name.toLowerCase().includes(q) ||
          (g.developer ?? '').toLowerCase().includes(q) ||
          g.genres.some((gn) => gn.toLowerCase().includes(q)),
      )
    }

    if (sortMode === 'playtime') {
      list.sort((a, b) => b.total_playtime_seconds - a.total_playtime_seconds)
    } else if (sortMode === 'recent') {
      list.sort((a, b) => (b.last_played_at ?? '').localeCompare(a.last_played_at ?? ''))
    } else {
      list.sort((a, b) => a.name.localeCompare(b.name))
    }
    return list
  }, [memoryGames, query, sortMode])

  const totalPlaytimeHours = useMemo(() => {
    const secs = memoryGames.reduce((acc, g) => acc + (g.total_playtime_seconds || 0), 0)
    return Math.round((secs / 3600) * 10) / 10
  }, [memoryGames])

  const veteranCount = useMemo(
    () => memoryGames.filter((g) => g.total_playtime_seconds >= 25 * 3600).length,
    [memoryGames],
  )

  const cycleSort = () => {
    const order: MemorySortMode[] = ['playtime', 'recent', 'name']
    setSortMode((prev) => order[(order.indexOf(prev) + 1) % order.length])
  }

  const handleRestore = async (game: Game) => {
    if (busyGameId) return
    setBusyGameId(game.id)
    try {
      await restoreGameFromMemory(game.id)
      toast.success(`Restored "${game.name}" from Memory Vault to your Library!`)
      onRefreshGames()
    } catch {
      toast.error(`Could not restore "${game.name}"`)
    } finally {
      setBusyGameId(null)
    }
  }

  const handlePermanentDelete = async (game: Game) => {
    if (busyGameId) return
    setBusyGameId(game.id)
    try {
      await permanentlyDeleteGame(game.id)
      toast.success(`Permanently removed "${game.name}" from Memory Vault`)
      onRefreshGames()
    } catch {
      toast.error(`Could not delete "${game.name}"`)
    } finally {
      setBusyGameId(null)
    }
  }

  const oskBtnFocus = useFocusable<HTMLButtonElement>({
    id: 'memory_osk_btn',
    scopeId: 'console_memory_header',
    onConfirm: () => {
      openOsk('Search Memory Vault', query, (val) => setQuery(val))
    },
  })

  const sortBtnFocus = useFocusable<HTMLButtonElement>({
    id: 'memory_sort_btn',
    scopeId: 'console_memory_header',
    onConfirm: cycleSort,
  })

  const sortLabels: Record<MemorySortMode, string> = {
    playtime: 'Most Played',
    recent: 'Last Played',
    name: 'Name A–Z',
  }

  return (
    <div className="space-y-6 pb-20">
      {/* 1. Nostalgic Console Memory Vault Header & KPI Strip */}
      <FocusScope
        id="console_memory_header"
        orientation="horizontal"
        className={`flex flex-col gap-4 rounded-3xl border p-5 ${
          isLight
            ? 'border-amber-200/90 bg-gradient-to-r from-amber-50/90 via-white to-orange-50/60 shadow-[0_12px_34px_rgba(15,23,42,0.06)]'
            : 'border-amber-400/25 bg-gradient-to-r from-amber-950/35 via-[#0b1020]/95 to-[#12182d]/95 shadow-xl'
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div
              className={`flex size-12 items-center justify-center rounded-2xl border ${
                isLight
                  ? 'border-amber-300 bg-amber-100 text-amber-700'
                  : 'border-amber-400/40 bg-amber-500/20 text-amber-300'
              }`}
            >
              <Archive className="size-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1
                  className={`text-xl sm:text-2xl font-black tracking-tight ${
                    isLight ? 'text-slate-900' : 'text-white'
                  }`}
                >
                  Memory Vault &amp; Hall of Fame
                </h1>
                <span
                  className={`rounded-full border px-2.5 py-0.5 font-mono text-[11px] font-black ${
                    isLight
                      ? 'border-amber-300 bg-amber-100 text-amber-900'
                      : 'border-amber-400/35 bg-amber-500/15 text-amber-300'
                  }`}
                >
                  {memoryGames.length} Archived
                </span>
              </div>
              <p className={`text-xs ${isLight ? 'text-slate-600' : 'text-slate-300/85'}`}>
                Uninstalled games whose playtime history, ratings, and mastery ranks are permanently
                preserved
              </p>
            </div>
          </div>

          {/* Search & Sort Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <div
              className={`flex flex-1 sm:flex-initial sm:w-64 items-center gap-2 rounded-xl border px-3 py-1.5 ${
                isLight ? 'border-slate-200 bg-white' : 'border-white/10 bg-black/40'
              }`}
            >
              <Search className={`size-3.5 ${isLight ? 'text-slate-400' : 'text-slate-500'}`} />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search archived memories..."
                className={`w-full bg-transparent text-xs font-semibold outline-none ${
                  isLight
                    ? 'text-slate-900 placeholder:text-slate-400'
                    : 'text-white placeholder:text-slate-500'
                }`}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="size-3.5" />
                </button>
              )}
              <button
                type="button"
                {...oskBtnFocus.focusProps}
                title="Open On-Screen Keypad"
                className={`rounded-lg p-1 transition-all cursor-pointer ${
                  oskBtnFocus.isFocused
                    ? 'bg-amber-400 text-slate-950'
                    : isLight
                      ? 'text-slate-500 hover:text-slate-900'
                      : 'text-slate-400 hover:text-white'
                }`}
              >
                <Keyboard className="size-3.5" />
              </button>
            </div>

            <button
              type="button"
              {...sortBtnFocus.focusProps}
              className={`flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-bold transition-all cursor-pointer outline-none ${
                sortBtnFocus.isFocused
                  ? 'scale-105 border-amber-300 bg-amber-400 text-slate-950 shadow-md'
                  : isLight
                    ? 'border-slate-200 bg-white text-slate-800 hover:bg-slate-100'
                    : 'border-white/10 bg-white/[0.06] text-slate-200 hover:bg-white/10'
              }`}
            >
              <ArrowUpDown className="size-3.5 text-amber-400" />
              <span>{sortLabels[sortMode]}</span>
            </button>
          </div>
        </div>

        {/* 3 KPI Telemetry Cards */}
        {memoryGames.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            <div
              className={`flex items-center gap-3 rounded-2xl border px-4 py-2.5 ${
                isLight ? 'border-slate-200 bg-white/90' : 'border-white/10 bg-black/35'
              }`}
            >
              <Archive className="size-4 text-amber-400 shrink-0" />
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Preserved Memories
                </p>
                <p className={`font-mono text-sm font-black ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  {memoryGames.length} Titles Archived
                </p>
              </div>
            </div>

            <div
              className={`flex items-center gap-3 rounded-2xl border px-4 py-2.5 ${
                isLight ? 'border-slate-200 bg-white/90' : 'border-white/10 bg-black/35'
              }`}
            >
              <Clock className="size-4 text-cyan-400 shrink-0" />
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Archived Playtime
                </p>
                <p className={`font-mono text-sm font-black ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  {totalPlaytimeHours} Hours Logged
                </p>
              </div>
            </div>

            <div
              className={`flex items-center gap-3 rounded-2xl border px-4 py-2.5 ${
                isLight ? 'border-slate-200 bg-white/90' : 'border-white/10 bg-black/35'
              }`}
            >
              <Award className="size-4 text-violet-400 shrink-0" />
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Veteran &amp; Legend Ranks
                </p>
                <p className={`font-mono text-sm font-black ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  {veteranCount} High-Mastery Games
                </p>
              </div>
            </div>
          </div>
        )}
      </FocusScope>

      {/* 2. Memory Vault 3:4 Poster Grid */}
      {displayedGames.length === 0 ? (
        <div
          className={`flex flex-col items-center justify-center rounded-3xl border px-6 py-16 text-center ${
            isLight
              ? 'border-slate-200 bg-white/90 text-slate-700'
              : 'border-white/10 bg-[#0b1020]/75 text-slate-300'
          }`}
        >
          <div
            className={`mb-4 flex size-14 items-center justify-center rounded-2xl border ${
              isLight
                ? 'border-amber-200 bg-amber-50 text-amber-600'
                : 'border-amber-400/30 bg-amber-500/15 text-amber-300'
            }`}
          >
            <Sparkles className="size-6" />
          </div>
          <h2 className={`text-xl font-black ${isLight ? 'text-slate-900' : 'text-white'}`}>
            {memoryGames.length === 0 ? 'Your Memory Vault is Empty' : 'No Matching Memories'}
          </h2>
          <p className="mt-1.5 max-w-md text-xs text-slate-400 leading-relaxed">
            {memoryGames.length === 0
              ? 'When you archive an uninstalled game to Memory, its playtime history, ratings, and cover artwork are permanently preserved here.'
              : 'Try another search keyword to find your archived games.'}
          </p>
        </div>
      ) : (
        <FocusScope
          id="console_memory_grid"
          orientation="grid"
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4"
        >
          {displayedGames.map((game) => (
            <ConsoleMemoryPosterCard
              key={game.id}
              game={game}
              isLight={isLight}
              busy={busyGameId === game.id}
              onFocusCard={() => onFocusGame?.(game)}
              onInspect={() => onOpenGameHub(game)}
              onRestore={() => void handleRestore(game)}
              onReinstallInLegacy={onSwitchToLegacyMode}
              onDelete={() => void handlePermanentDelete(game)}
            />
          ))}
        </FocusScope>
      )}
    </div>
  )
}

const ConsoleMemoryPosterCard: React.FC<{
  game: Game
  isLight: boolean
  busy: boolean
  onFocusCard: () => void
  onInspect: () => void
  onRestore: () => void
  onReinstallInLegacy?: () => void
  onDelete: () => void
}> = ({
  game,
  isLight,
  busy,
  onFocusCard,
  onInspect,
  onRestore,
  onReinstallInLegacy,
  onDelete,
}) => {
  const { focusProps, isFocused } = useFocusable<HTMLDivElement>({
    id: `memory_poster_${game.id}`,
    scopeId: 'console_memory_grid',
    onFocus: onFocusCard,
    onConfirm: onInspect,
    onOptions: onRestore,
  })

  const candidates = useMemo(
    () =>
      buildCoverFallbackChain(
        resolveConsoleMediaUrl(game.cover_path),
        resolveConsoleHighResUrl(game.banner_path ?? game.background_path),
        game.steam_app_id,
        game.igdb_id,
      ),
    [game.cover_path, game.banner_path, game.background_path, game.steam_app_id, game.igdb_id],
  )

  const [idx, setIdx] = useState(0)
  useEffect(() => {
    setIdx(0)
  }, [candidates])

  const coverSrc = candidates[idx] ?? null
  const rank = getMasteryRank(game.total_playtime_seconds, isLight)
  const score = game.user_rating ?? game.opencritic_score ?? game.metacritic_score ?? null

  return (
    <div
      {...focusProps}
      onMouseEnter={onFocusCard}
      onClick={onInspect}
      className={`group relative aspect-[3/4] w-full overflow-hidden rounded-2xl border text-left transition-transform duration-150 cursor-pointer select-none outline-none ${
        isFocused
          ? isLight
            ? 'z-20 -translate-y-1.5 scale-[1.03] border-amber-500 ring-3 ring-amber-400/50 shadow-xl'
            : 'z-20 -translate-y-1.5 scale-[1.03] border-amber-400 ring-3 ring-amber-400/45 shadow-2xl'
          : isLight
            ? 'border-slate-200/90 bg-slate-200 hover:border-amber-300 shadow-sm'
            : 'border-white/12 bg-[#111827] hover:border-amber-400/40 shadow-md'
      }`}
    >
      {coverSrc ? (
        <img
          src={coverSrc}
          alt={game.name}
          loading="lazy"
          onError={() => setIdx((prev) => prev + 1)}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-amber-950 via-slate-900 to-slate-950 p-4 text-center">
          <Gamepad2 className="mb-2 size-7 text-amber-400/70" />
          <span className="line-clamp-3 text-xs font-black text-white">{game.name}</span>
        </div>
      )}

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/95 via-black/35 to-black/10" />

      {/* Top Mastery Rank + Rating */}
      <div className="absolute inset-x-2.5 top-2.5 flex items-center justify-between gap-1">
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider shadow ${rank.pillClass}`}
        >
          <Award className="size-2.5" />
          {rank.label}
        </span>

        {score && score > 0 ? (
          <span className="inline-flex items-center gap-0.5 rounded-full border border-white/20 bg-black/80 px-2 py-0.5 font-mono text-[10px] font-black text-amber-300">
            ★ {score}
          </span>
        ) : null}
      </div>

      {/* Bottom Dock: Title, Preserved Playtime & Restore/Reinstall Actions */}
      <div className="absolute inset-x-0 bottom-0 flex flex-col justify-end p-3">
        <p className="line-clamp-1 text-sm font-black tracking-tight text-white drop-shadow">
          {game.name}
        </p>
        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] font-bold text-amber-300">
          <Clock className="size-3" />
          <span>{formatPlaytime(game.total_playtime_seconds)} Logged</span>
        </div>

        <div className="mt-2 flex items-center justify-between gap-1.5 border-t border-white/15 pt-2">
          <button
            type="button"
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation()
              onRestore()
            }}
            title="Restore to Library"
            className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-amber-400 px-2 py-1 text-[10px] font-black text-slate-950 hover:bg-amber-300 transition-colors cursor-pointer"
          >
            {busy ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <RotateCcw className="size-3" />
            )}
            <span>Restore</span>
          </button>

          {onReinstallInLegacy && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onReinstallInLegacy()
              }}
              title="Switch to Legacy Mode to Reinstall"
              className="flex size-6 items-center justify-center rounded-lg border border-white/20 bg-white/10 text-white hover:bg-cyan-400 hover:text-slate-950 transition-colors cursor-pointer"
            >
              <Monitor className="size-3" />
            </button>
          )}

          <button
            type="button"
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
            title="Permanently Delete Memory"
            className="flex size-6 items-center justify-center rounded-lg border border-white/15 bg-black/55 text-slate-300 hover:border-rose-400 hover:bg-rose-500 hover:text-white transition-colors cursor-pointer"
          >
            <Trash2 className="size-3" />
          </button>
        </div>
      </div>
    </div>
  )
}
