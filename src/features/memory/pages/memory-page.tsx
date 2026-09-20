import { useEffect, useMemo, useState } from 'react'
import { Sparkles, Search, ArrowUpDown, Clock } from 'lucide-react'
import {
  useGames,
  useRestoreGameFromMemory,
  usePermanentlyDeleteGame,
} from '@/features/library/hooks/use-games'
import { CoverPickerModal } from '@/features/library/components/cover-picker-modal'
import { PlaytimeEditorModal } from '@/features/library/components/playtime-editor-modal'
import { MemoryCard } from '../components/memory-card'
import { DeleteConfirmModal } from '../components/delete-confirm-modal'
import { useUiStore } from '@/store/ui-store'
import type { Game } from '@/types/models'

type SortOption = 'playtime' | 'name' | 'recent'

export function MemoryPage() {
  const { data: allGames = [], isPending } = useGames()
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortOption>('playtime')

  // Modals state
  const [coverPickerGameId, setCoverPickerGameId] = useState<string | null>(null)
  const [playtimeEditorGame, setPlaytimeEditorGame] = useState<Game | null>(null)
  const [deletePendingGame, setDeletePendingGame] = useState<Game | null>(null)

  const restoreMutation = useRestoreGameFromMemory()
  const permanentlyDeleteMutation = usePermanentlyDeleteGame()

  // Ensure right sidebar is closed in Memory section
  useEffect(() => {
    useUiStore.getState().selectGame(null)
  }, [])

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

  // Total recorded playtime across all memory games
  const totalMemoryPlaytimeHours = useMemo(() => {
    const totalSecs = memoryGames.reduce((acc, g) => acc + g.total_playtime_seconds, 0)
    return Math.round(totalSecs / 3600)
  }, [memoryGames])

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Header Toolbar */}
      <div className="flex shrink-0 flex-col gap-4 border-b border-border/70 bg-surface/50 px-6 py-5 backdrop-blur-md">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="flex size-9 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-400 shadow-sm shadow-amber-500/10">
                <Sparkles className="size-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-black tracking-tight text-text">Memory Vault</h1>
                  <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 font-mono text-[11px] font-bold text-amber-300">
                    {memoryGames.length} {memoryGames.length === 1 ? 'game' : 'games'}
                  </span>
                </div>
                <p className="text-xs font-medium text-subtle">
                  Games and playtime history permanently preserved from your library
                </p>
              </div>
            </div>
          </div>

          {/* Quick stats & Search */}
          <div className="flex items-center gap-3">
            {memoryGames.length > 0 && (
              <div className="hidden items-center gap-2 rounded-xl border border-border/80 bg-surface-raised/60 px-3 py-1.5 text-xs text-subtle sm:flex">
                <Clock className="size-3.5 text-cyan-400" />
                <span>
                  Archived Playtime:{' '}
                  <strong className="font-mono text-text">{totalMemoryPlaytimeHours}h</strong>
                </span>
              </div>
            )}

            {/* Search Input */}
            <div className="relative w-48 sm:w-60">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-subtle" />
              <input
                type="text"
                placeholder="Search memories..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border border-border bg-surface py-1.5 pl-8 pr-3 text-xs text-text transition-colors placeholder:text-subtle focus:border-amber-400 focus:outline-hidden"
              />
            </div>

            {/* Sort Selector */}
            <div className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-2.5 py-1.5 text-xs text-muted">
              <ArrowUpDown className="size-3.5 text-subtle" />
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortOption)}
                className="bg-transparent text-xs font-bold text-text focus:outline-hidden cursor-pointer"
              >
                <option value="playtime">Playtime</option>
                <option value="recent">Recently Played</option>
                <option value="name">Name</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {isPending ? (
          <div className="flex h-64 items-center justify-center">
            <div className="size-8 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
          </div>
        ) : displayedGames.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center p-8 text-center">
            <div className="mb-4 flex size-16 items-center justify-center rounded-3xl border border-amber-500/20 bg-amber-500/10 text-amber-400">
              <Sparkles className="size-8" />
            </div>
            <h2 className="text-base font-black tracking-tight text-text">
              {memoryGames.length === 0 ? 'Your Memory Vault is Empty' : 'No Matching Memories'}
            </h2>
            <p className="mt-1 max-w-sm text-xs leading-relaxed text-subtle">
              {memoryGames.length === 0
                ? 'When you remove a game from your library, it is safely preserved here along with its playtime, artwork, and telemetry.'
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
