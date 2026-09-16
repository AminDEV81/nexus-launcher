import { useEffect, useState } from 'react'
import { Check, Plus, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/modal'
import { cn } from '@/lib/utils'
import {
  useCollections,
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

/**
 * There's no submenu support in the app's `ContextMenu` component, so
 * rather than build one just for this, "Add to Collection" in the game
 * context menu opens this modal — the same hand-off pattern the menu
 * already uses for "Change Cover".
 *
 * Checking a box here only updates local state — nothing is written
 * until "Save" is pressed. The first version applied each checkbox
 * click immediately, which meant there was no way to check three boxes
 * and change your mind about one before anything happened; buffering
 * the selection and diffing it against what the game was actually in
 * when the modal opened is what makes Save (and Cancel) mean something.
 */
export function AddToCollectionModal({ gameId, open, onClose }: AddToCollectionModalProps) {
  const { data: collections } = useCollections()
  const { data: memberIds } = useCollectionIdsForGame(gameId ?? undefined, open)
  const addToCollection = useAddGameToCollection()
  const removeFromCollection = useRemoveGameFromCollection()
  const createCollection = useCreateCollection()

  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [selected, setSelected] = useState<Set<string> | null>(null)
  const [saving, setSaving] = useState(false)

  // Seed local selection from the game's actual membership once it's
  // loaded, but only once per time the modal opens — re-syncing on
  // every background refetch would silently discard whatever the
  // person had already checked/unchecked but not saved yet.
  useEffect(() => {
    if (open && memberIds && selected === null) {
      setSelected(new Set(memberIds))
    }
    if (!open) {
      setSelected(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, memberIds])

  function handleToggle(collectionId: string) {
    setSelected((current) => {
      const next = new Set(current ?? [])
      if (next.has(collectionId)) next.delete(collectionId)
      else next.add(collectionId)
      return next
    })
  }

  function handleCreate() {
    const trimmed = newName.trim()
    if (!trimmed) return
    createCollection.mutate(trimmed, {
      onSuccess: (collection) => {
        setSelected((current) => new Set(current).add(collection.id))
        setNewName('')
        setCreating(false)
      },
    })
  }

  function handleClose() {
    setCreating(false)
    setNewName('')
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

  return (
    <Modal open={open} onClose={handleClose} widthClassName="max-w-sm">
      <div className="flex max-h-[26rem] flex-col p-5">
        <h2 className="shrink-0 text-base font-semibold text-text">Add to Collection</h2>

        <div className="mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto">
          {collections && collections.length > 0 ? (
            collections.map((collection) => {
              const checked = selected?.has(collection.id) ?? false
              return (
                <button
                  key={collection.id}
                  type="button"
                  onClick={() => handleToggle(collection.id)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm text-text transition-colors hover:bg-surface-raised"
                >
                  <span
                    className={cn(
                      'flex size-4 shrink-0 items-center justify-center rounded border transition-colors',
                      checked ? 'border-accent bg-accent' : 'border-border',
                    )}
                  >
                    {checked && <Check className="size-3 text-white" strokeWidth={3} />}
                  </span>
                  <span className="truncate">{collection.name}</span>
                </button>
              )
            })
          ) : (
            <p className="px-2 py-2 text-xs text-subtle">You don't have any collections yet.</p>
          )}
        </div>

        <div className="mt-2 shrink-0 border-t border-border pt-3">
          {creating ? (
            <div className="flex gap-2">
              <input
                autoFocus
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') handleCreate()
                  if (event.key === 'Escape') setCreating(false)
                }}
                placeholder="Collection name"
                className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text outline-none focus:border-accent-border"
              />
              <button
                type="button"
                onClick={handleCreate}
                disabled={!newName.trim() || createCollection.isPending}
                className="flex shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
              >
                {createCollection.isPending && <Loader2 className="size-3.5 animate-spin" />}
                Create
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex items-center gap-1.5 text-sm font-medium text-accent transition-colors hover:text-accent-hover"
              >
                <Plus className="size-3.5" />
                New Collection
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface-raised hover:text-text"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || !isDirty}
                  className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
                >
                  {saving && <Loader2 className="size-3.5 animate-spin" />}
                  Save
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
