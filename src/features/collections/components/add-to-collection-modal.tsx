import { useEffect, useMemo, useState } from 'react'
import {
  Check,
  FolderPlus,
  Gamepad2,
  Layers,
  Loader2,
  Plus,
  Search,
  Sparkles,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Modal, ModalCloseButton } from '@/components/ui/modal'
import { cn } from '@/lib/utils'
import { assetUrl } from '@/lib/asset-url'
import { useGame } from '@/features/library/hooks/use-games'
import {
  useCollectionsWithPreviews,
  useCollectionIdsForGame,
  useCreateCollection,
  useAddGameToCollection,
  useRemoveGameFromCollection,
} from '../hooks/use-collections'

interface AddToCollectionModalProps {
  gameId: string | null
  open: boolean
  onClose: () => void
}

const PRESET_SUGGESTIONS = ['Favorites & Must-Play', 'Currently Playing', 'Completed 100%', 'Backlog']

export function AddToCollectionModal({ gameId, open, onClose }: AddToCollectionModalProps) {
  const { data: game } = useGame(open && gameId ? gameId : undefined)
  const { data: collections } = useCollectionsWithPreviews()
  const { data: memberIds } = useCollectionIdsForGame(gameId ?? undefined, open)
  const addToCollection = useAddGameToCollection()
  const removeFromCollection = useRemoveGameFromCollection()
  const createCollection = useCreateCollection()

  const [newName, setNewName] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selected, setSelected] = useState<Set<string> | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open && memberIds && selected === null) {
      setSelected(new Set(memberIds))
    }
    if (!open) {
      setSelected(null)
      setSearchQuery('')
      setNewName('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, memberIds])

  const filteredCollections = useMemo(() => {
    if (!collections) return []
    const q = searchQuery.trim().toLowerCase()
    if (!q) return collections
    return collections.filter((c) => c.name.toLowerCase().includes(q))
  }, [collections, searchQuery])

  function handleToggle(collectionId: string) {
    setSelected((current) => {
      const next = new Set(current ?? [])
      if (next.has(collectionId)) next.delete(collectionId)
      else next.add(collectionId)
      return next
    })
  }

  function handleCreate(customName?: string) {
    const trimmed = (customName ?? newName).trim()
    if (!trimmed) return
    createCollection.mutate(trimmed, {
      onSuccess: (collection) => {
        setSelected((current) => new Set(current ?? []).add(collection.id))
        setNewName('')
        toast.success(`Created collection "${collection.name}"`)
      },
    })
  }

  function handleClose() {
    setNewName('')
    setSearchQuery('')
    onClose()
  }

  async function handleSave() {
    if (!gameId || !selected || !memberIds) return
    const original = new Set(memberIds)
    const toAdd = [...selected].filter((id) => !original.has(id))
    const toRemove = [...original].filter((id) => !selected.has(id))
    if (toAdd.length === 0 && toRemove.length === 0) {
      handleClose()
      return
    }

    setSaving(true)
    try {
      await Promise.all([
        ...toAdd.map((collectionId) => addToCollection.mutateAsync({ collectionId, gameId })),
        ...toRemove.map((collectionId) =>
          removeFromCollection.mutateAsync({ collectionId, gameId }),
        ),
      ])
      toast.success(
        `Updated collections for ${game?.name || 'game'} (${selected.size} assigned)`,
      )
      handleClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update collections.')
    } finally {
      setSaving(false)
    }
  }

  const isDirty =
    selected !== null &&
    memberIds !== undefined &&
    (selected.size !== memberIds.length || memberIds.some((id) => !selected.has(id)))

  const coverUrl = game?.cover_path ? assetUrl(game.cover_path) : null
  const selectedCount = selected?.size ?? 0

  return (
    <Modal open={open} onClose={handleClose} widthClassName="max-w-lg" hideCloseButton>
      <div className="flex max-h-[85vh] flex-col overflow-hidden rounded-3xl bg-surface text-text">
        {/* 1. Header with Game Preview Card */}
        <div className="relative border-b border-border/80 bg-gradient-to-br from-surface-raised via-surface to-surface px-5 pt-5 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3.5">
              {coverUrl ? (
                <img
                  src={coverUrl}
                  alt={game?.name || 'Game'}
                  className="h-14 w-10.5 shrink-0 rounded-xl object-cover shadow-md ring-1 ring-border"
                />
              ) : (
                <div className="flex h-14 w-10.5 shrink-0 items-center justify-center rounded-xl border border-accent/30 bg-accent/10 text-accent">
                  <Gamepad2 className="size-5" />
                </div>
              )}

              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 rounded-full bg-accent/12 px-2 py-0.5 font-mono text-[9.5px] font-extrabold uppercase tracking-wider text-accent">
                    <Layers className="size-2.5" />
                    <span>Organize Library</span>
                  </span>
                  {selectedCount > 0 && (
                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-mono text-[9.5px] font-bold text-emerald-500 dark:text-emerald-300">
                      {selectedCount} Selected
                    </span>
                  )}
                </div>
                <h2 className="mt-1 truncate text-base font-black tracking-tight text-text sm:text-lg">
                  {game?.name ? `Collections for ${game.name}` : 'Add to Collection'}
                </h2>
                <p className="text-[11px] text-muted">
                  Assign this game to one or more custom library shelves.
                </p>
              </div>
            </div>

            <ModalCloseButton onClick={handleClose} aria-label="Close modal" />
          </div>

          {/* Inline Create New Collection Bar */}
          <div className="mt-4 flex items-center gap-2">
            <div className="relative flex flex-1 items-center">
              <FolderPlus className="pointer-events-none absolute left-3 size-4 text-accent" />
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newName.trim()) {
                    e.preventDefault()
                    handleCreate()
                  }
                }}
                placeholder="Create a new collection (e.g. Souls-like, Co-op Night)…"
                className="h-9 w-full rounded-xl border border-border bg-surface pl-9 pr-3 text-xs font-medium text-text placeholder:text-subtle outline-none transition-colors focus:border-accent"
              />
            </div>
            <button
              type="button"
              onClick={() => handleCreate()}
              disabled={!newName.trim() || createCollection.isPending}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-accent px-3.5 text-xs font-extrabold text-white shadow-xs transition-all hover:bg-accent-hover active:scale-95 disabled:opacity-45 cursor-pointer"
            >
              {createCollection.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Plus className="size-3.5" />
              )}
              <span>Create</span>
            </button>
          </div>
        </div>

        {/* 2. Search & Selection Toolbar (shown when >= 4 collections exist) */}
        {collections && collections.length >= 4 && (
          <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-surface-raised/40 px-5 py-2.5">
            <div className="relative flex flex-1 items-center">
              <Search className="pointer-events-none absolute left-2.5 size-3.5 text-subtle" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter collections…"
                className="h-7 w-full rounded-lg border border-border/80 bg-surface pl-8 pr-6 text-xs text-text placeholder:text-subtle outline-none focus:border-accent"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 text-subtle hover:text-text cursor-pointer"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 text-[11px] font-bold">
              <button
                type="button"
                onClick={() =>
                  setSelected(new Set((collections ?? []).map((c) => c.id)))
                }
                className="text-accent hover:underline cursor-pointer"
              >
                Select All
              </button>
              <span className="text-border">•</span>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="text-subtle hover:text-text cursor-pointer"
              >
                Clear
              </button>
            </div>
          </div>
        )}

        {/* 3. Collections List */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {filteredCollections.length > 0 ? (
            <div className="grid grid-cols-1 gap-2">
              {filteredCollections.map((collection) => {
                const checked = selected?.has(collection.id) ?? false
                const previews = (collection.preview_covers ?? [])
                  .slice(0, 3)
                  .map((p) => assetUrl(p))
                  .filter((u): u is string => Boolean(u))

                return (
                  <button
                    key={collection.id}
                    type="button"
                    onClick={() => handleToggle(collection.id)}
                    className={cn(
                      'group flex w-full items-center justify-between gap-3 rounded-2xl border p-3 text-left transition-all duration-150 cursor-pointer',
                      checked
                        ? 'border-accent bg-accent/12 shadow-xs'
                        : 'border-border/80 bg-surface-raised/50 hover:border-accent/40 hover:bg-surface-raised',
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className={cn(
                          'flex size-5 shrink-0 items-center justify-center rounded-lg border transition-all',
                          checked
                            ? 'border-accent bg-accent text-white shadow-xs scale-105'
                            : 'border-border bg-surface group-hover:border-accent/50',
                        )}
                      >
                        {checked && <Check className="size-3.5" strokeWidth={3} />}
                      </span>

                      {/* Mini Cover Stack */}
                      {previews.length > 0 ? (
                        <div className="flex -space-x-2 overflow-hidden py-0.5">
                          {previews.map((src, idx) => (
                            <img
                              key={`${collection.id}-${idx}`}
                              src={src}
                              alt=""
                              className="h-8 w-6 rounded-md object-cover ring-2 ring-surface"
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-surface text-subtle">
                          <Layers className="size-4" />
                        </div>
                      )}

                      <div className="min-w-0">
                        <span
                          className={cn(
                            'block truncate text-sm font-bold transition-colors',
                            checked ? 'text-accent' : 'text-text group-hover:text-accent',
                          )}
                        >
                          {collection.name}
                        </span>
                        <span className="text-[11px] font-medium text-subtle">
                          {collection.game_count}{' '}
                          {collection.game_count === 1 ? 'game' : 'games'}
                        </span>
                      </div>
                    </div>

                    <span
                      className={cn(
                        'shrink-0 rounded-lg px-2 py-0.5 font-mono text-[10px] font-bold transition-colors',
                        checked
                          ? 'bg-accent text-white'
                          : 'bg-surface border border-border/70 text-subtle',
                      )}
                    >
                      {checked ? 'Assigned' : 'Add'}
                    </span>
                  </button>
                )
              })}
            </div>
          ) : collections && collections.length > 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <p className="text-xs font-semibold text-muted">
                No collections match &ldquo;{searchQuery}&rdquo;
              </p>
              <button
                type="button"
                onClick={() => {
                  handleCreate(searchQuery)
                  setSearchQuery('')
                }}
                className="mt-2.5 inline-flex items-center gap-1.5 rounded-xl bg-accent/15 px-3 py-1.5 text-xs font-bold text-accent hover:bg-accent hover:text-white transition-colors cursor-pointer"
              >
                <Plus className="size-3.5" />
                <span>Create &ldquo;{searchQuery.trim()}&rdquo;</span>
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface-raised/30 p-6 text-center">
              <div className="flex size-10 items-center justify-center rounded-2xl bg-accent/12 text-accent">
                <Sparkles className="size-5" />
              </div>
              <p className="mt-2.5 text-xs font-bold text-text">
                No collections created yet
              </p>
              <p className="mt-0.5 text-[11px] text-muted">
                Type a name above or click a quick preset below to start organizing:
              </p>
              <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                {PRESET_SUGGESTIONS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handleCreate(preset)}
                    disabled={createCollection.isPending}
                    className="inline-flex items-center gap-1 rounded-xl border border-border bg-surface px-2.5 py-1 text-[11px] font-semibold text-text hover:border-accent hover:text-accent transition-all cursor-pointer"
                  >
                    <Plus className="size-3 text-accent" />
                    <span>{preset}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 4. Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-border/80 bg-surface-raised/60 px-5 py-3.5">
          <span className="text-xs font-medium text-subtle">
            {isDirty ? 'Unsaved changes ready' : `${selectedCount} collection(s) linked`}
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-xl border border-border bg-surface px-4 py-2 text-xs font-bold text-muted transition-colors hover:bg-surface-raised hover:text-text cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || !isDirty}
              className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-5 py-2 text-xs font-extrabold text-white shadow-sm transition-all hover:bg-accent-hover active:scale-95 disabled:opacity-45 cursor-pointer"
            >
              {saving && <Loader2 className="size-3.5 animate-spin" />}
              <span>Save Changes</span>
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
