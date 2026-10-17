import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Sparkles, Search, ArrowUpDown, Clock, Award, Archive } from 'lucide-react'
import {
  useGames,
  useRestoreGameFromMemory,
  usePermanentlyDeleteGame,
} from '@/features/library/hooks/use-games'
import { CoverPickerModal } from '@/features/library/components/cover-picker-modal'
import { PlaytimeEditorModal } from '@/features/library/components/playtime-editor-modal'
import { EditGameNameModal } from '@/components/modals/edit-game-name-modal'
import { repairMissingCovers } from '@/services/metadata'
import { MemoryCard } from '../components/memory-card'
import { DeleteConfirmModal } from '../components/delete-confirm-modal'
import { useUiStore } from '@/store/ui-store'
import type { Game } from '@/types/models'

type SortOption = 'playtime' | 'name' | 'recent'

export function MemoryPage() {
  const { data: allGames = [], isPending } = useGames()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortOption>('playtime')

  // Modals state
  const [coverPickerGameId, setCoverPickerGameId] = useState<string | null>(null)
  const [playtimeEditorGame, setPlaytimeEditorGame] = useState<Game | null>(null)
  const [deletePendingGame, setDeletePendingGame] = useState<Game | null>(null)
  const [editNameGame, setEditNameGame] = useState<Game | null>(null)

  const restoreMutation = useRestoreGameFromMemory()
  const permanentlyDeleteMutation = usePermanentlyDeleteGame()

  // Ensure right sidebar is closed in Memory section
  useEffect(() => {
    useUiStore.getState().selectGame(null)
  }, [])

  // Proactively repair any missing covers in the background
  useEffect(() => {
    let active = true
    repairMissingCovers()
      .then((res) => {
        if (active && res.repaired_count > 0) {
          queryClient.invalidateQueries({ queryKey: ['games'] })
        }
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [queryClient])

  // Filter games that belong to Memory
  const memoryGames = useMemo(() => {
    return allGames.filter((g) => g.is_memory)
  }, [allGames])

  // Filter and sort
  const displayedGames = useMemo(() => {
    let list = memoryGames

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(
        (g) =>
          g.name.toLowerCase().includes(q) ||
          (g.developer?.toLowerCase().includes(q) ?? false) ||
          g.genres.some((genre) => genre.toLowerCase().includes(q)),
      )
    }

    return [...list].sort((a, b) => {
      if (sort === 'playtime') {
        return b.total_playtime_seconds - a.total_playtime_seconds
      }
      if (sort === 'recent') {
        const timeA = a.last_played_at ? new Date(a.last_played_at).getTime() : 0
        const timeB = b.last_played_at ? new Date(b.last_played_at).getTime() : 0
        return timeB - timeA
      }
      return a.name.localeCompare(b.name)
    })
  }, [memoryGames, search, sort])

  const totalMemoryPlaytimeHours = useMemo(() => {
    const totalSecs = memoryGames.reduce((acc, g) => acc + g.total_playtime_seconds, 0)
    return Math.round((totalSecs / 3600) * 10) / 10
  }, [memoryGames])

  const veteranOrHigherCount = useMemo(() => {
    return memoryGames.filter((g) => g.total_playtime_seconds >= 25 * 3600).length
  }, [memoryGames])

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg text-text">
      {/* Header Toolbar */}
      <div className="flex shrink-0 flex-col gap-4 border-b border-border/70 bg-surface/65 px-8 py-5 backdrop-blur-md">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3.5">
            <div className="flex size-12 items-center justify-center rounded-2xl border border-amber-500/35 bg-gradient-to-br from-amber-500/20 via-amber-500/10 to-transparent text-amber-500 shadow-sm">
              <Sparkles className="size-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl font-black tracking-tight text-text">Memory Vault</h1>
                <span className="rounded-full border border-amber-500/35 bg-amber-500/15 px-2.5 py-0.5 font-mono text-[11px] font-bold text-amber-600 dark:text-amber-300">
                  {memoryGames.length} {memoryGames.length === 1 ? 'Archived Title' : 'Archived Titles'}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted">
                Uninstalled games whose playtime history, ratings, and mastery ranks are permanently
                preserved
              </p>
            </div>
          </div>

          {/* Search & Sort Controls */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative w-52 sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-subtle" />
              <input
                type="text"
                placeholder="Search archived memories…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border border-border bg-surface py-2 pl-8.5 pr-3 text-xs text-text transition-colors placeholder:text-muted focus:border-amber-500 focus:outline-hidden"
              />
            </div>

            <div className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-2 text-xs text-muted shadow-xs">
              <ArrowUpDown className="size-3.5 text-amber-500" />
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortOption)}
                className="bg-transparent text-xs font-bold text-text focus:outline-hidden cursor-pointer"
              >
                <option value="playtime" className="bg-surface text-text">
                  Sort by Playtime
                </option>
                <option value="recent" className="bg-surface text-text">
                  Sort by Last Played
                </option>
                <option value="name" className="bg-surface text-text">
                  Sort by Name
                </option>
              </select>
            </div>
          </div>
        </div>

        {/* Summary KPI Strip */}
        {memoryGames.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="flex items-center gap-3 rounded-2xl border border-border/75 bg-surface px-4 py-2.5 shadow-xs">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-500">
                <Archive className="size-4.5" />
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted">
                  Preserved Memories
                </div>
                <div className="font-mono text-sm font-black text-text">
                  {memoryGames.length} Games Saved
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-2xl border border-border/75 bg-surface px-4 py-2.5 shadow-xs">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
                <Clock className="size-4.5" />
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted">
                  Archived Playtime
                </div>
                <div className="font-mono text-sm font-black text-text">
                  {totalMemoryPlaytimeHours} Hours Logged
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-2xl border border-border/75 bg-surface px-4 py-2.5 shadow-xs">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-purple-500/15 text-purple-500 dark:text-purple-400">
                <Award className="size-4.5" />
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted">
                  Veteran &amp; Legend Titles
                </div>
                <div className="font-mono text-sm font-black text-text">
                  {veteranOrHigherCount} High-Mastery Games
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        {isPending ? (
          <div className="flex h-64 items-center justify-center">
            <div className="size-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
          </div>
        ) : displayedGames.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center p-8 text-center">
            <div className="mb-4 flex size-16 items-center justify-center rounded-3xl border border-amber-500/25 bg-amber-500/10 text-amber-500">
              <Sparkles className="size-8" />
            </div>
            <h2 className="text-base font-black tracking-tight text-text">
              {memoryGames.length === 0 ? 'Your Memory Vault is Empty' : 'No Matching Memories'}
            </h2>
            <p className="mt-1 max-w-sm text-xs leading-relaxed text-subtle">
              {memoryGames.length === 0
                ? 'When you remove a game from your Library, it is safely preserved here along with its playtime, artwork, and mastery progress.'
                : 'No archived games match your search query.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {displayedGames.map((game) => (
              <MemoryCard
                key={game.id}
                game={game}
                onChangeCover={(g) => setCoverPickerGameId(g.id)}
                onEditPlaytime={(g) => setPlaytimeEditorGame(g)}
                onEditName={(g) => setEditNameGame(g)}
                onRestore={(g) => restoreMutation.mutate(g.id)}
                onDelete={(g) => setDeletePendingGame(g)}
                isRestoring={restoreMutation.isPending}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      <CoverPickerModal
        gameId={coverPickerGameId}
        open={Boolean(coverPickerGameId)}
        onClose={() => setCoverPickerGameId(null)}
      />

      <PlaytimeEditorModal
        game={playtimeEditorGame}
        open={Boolean(playtimeEditorGame)}
        onClose={() => setPlaytimeEditorGame(null)}
      />

      <EditGameNameModal
        game={editNameGame}
        open={Boolean(editNameGame)}
        onClose={() => setEditNameGame(null)}
      />

      <DeleteConfirmModal
        game={deletePendingGame}
        open={Boolean(deletePendingGame)}
        onClose={() => setDeletePendingGame(null)}
        onConfirm={async () => {
          if (deletePendingGame) {
            await permanentlyDeleteMutation.mutateAsync(deletePendingGame.id)
            setDeletePendingGame(null)
          }
        }}
        isPending={permanentlyDeleteMutation.isPending}
      />
    </div>
  )
}
