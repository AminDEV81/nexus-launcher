import { useEffect, useState } from 'react'
import { Check, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Modal } from '@/components/ui/modal'
import {
  useTags,
  useCreateTag,
  useUpdateTag,
  useDeleteTag,
  useSetGameTags,
} from '../hooks/use-tags'
import type { Game } from '@/types/models'

/** Same palette the backend accepts as `#rrggbb` — a fixed swatch row
 *  instead of a full color picker keeps the dialog compact and every
 *  color guaranteed readable against both themes. */
const SWATCHES = [
  '#7c5cff',
  '#3b82f6',
  '#06b6d4',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#ec4899',
  '#94a3b8',
] as const

interface TagEditorModalProps {
  game: Game | null
  open: boolean
  onClose: () => void
}

/**
 * Per-game tag picker plus the tag manager in one dialog. Membership
 * (which tags this game has) is buffered local state saved with one
 * `set_game_tags` call — the same "Save means something" contract as the
 * Add to Collection picker. Tag CRUD (create/rename/recolor/delete) is
 * immediate instead: it's global library data, not this game's state.
 *
 * The selection seeds from `game.tag_ids` each time the dialog opens
 * (not on every `game` identity change, so a background playtime refresh
 * can't wipe buffered checks mid-edit).
 */
export function TagEditorModal({ game, open, onClose }: TagEditorModalProps) {
  const { data: tags } = useTags()
  const createTag = useCreateTag()
  const updateTag = useUpdateTag()
  const deleteTag = useDeleteTag()
  const setGameTags = useSetGameTags()

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState<string>(SWATCHES[0])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState<string>(SWATCHES[0])
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setSelected(new Set(game?.tag_ids ?? []))
    setNewName('')
    setNewColor(SWATCHES[0])
    setEditingId(null)
    setConfirmingDeleteId(null)
    // Deliberately keyed on `open` only — see the doc comment above.
  }, [open, game?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!game) return null

  const original = new Set(game.tag_ids)
  const isDirty = selected.size !== original.size || [...selected].some((id) => !original.has(id))

  function toggleTag(id: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleCreate() {
    const name = newName.trim()
    if (!name || createTag.isPending) return
    createTag.mutate(
      { name, color: newColor },
      {
        onSuccess: (tag) => {
          // Creating a tag from inside this game's picker means the user
          // wants it applied — pre-check it in the buffered selection.
          setSelected((current) => new Set(current).add(tag.id))
          setNewName('')
        },
      },
    )
  }

  function startEdit(id: string, name: string, color: string) {
    setEditingId(id)
    setEditName(name)
    setEditColor(color)
    setConfirmingDeleteId(null)
  }

  function handleUpdate() {
    if (!editingId || !editName.trim() || updateTag.isPending) return
    updateTag.mutate(
      { id: editingId, name: editName.trim(), color: editColor },
      { onSuccess: () => setEditingId(null) },
    )
  }

  function handleDelete(id: string) {
    deleteTag.mutate(id, {
      onSuccess: () => {
        setSelected((current) => {
          const next = new Set(current)
          next.delete(id)
          return next
        })
        setConfirmingDeleteId(null)
        if (editingId === id) setEditingId(null)
      },
    })
  }

  function save() {
    if (!isDirty || setGameTags.isPending) return
    setGameTags.mutate({ gameId: game!.id, tagIds: [...selected] }, { onSuccess: () => onClose() })
  }

  return (
    <Modal open={open} onClose={onClose} widthClassName="max-w-sm">
      <div className="flex max-h-[30rem] flex-col p-5">
        <h2 className="shrink-0 text-base font-semibold text-text">
          Tags
          <span className="ml-1.5 text-sm font-normal text-muted">— {game.name}</span>
        </h2>

        <div className="mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
          {(tags ?? []).length === 0 ? (
            <p className="py-4 text-center text-sm text-subtle">
              No tags yet — create the first one below.
            </p>
          ) : (
            (tags ?? []).map((tag) =>
              editingId === tag.id ? (
                <div
                  key={tag.id}
                  className="flex flex-col gap-2 rounded-lg border border-border bg-surface/60 p-2"
                >
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      value={editName}
                      onChange={(event) => setEditName(event.target.value)}
                      onKeyDown={(event) => event.key === 'Enter' && handleUpdate()}
                      className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-surface px-2.5 text-sm text-text outline-none focus:border-accent"
                      placeholder="Tag name"
                    />
                    <button
                      type="button"
                      onClick={handleUpdate}
                      disabled={!editName.trim() || updateTag.isPending}
                      aria-label="Save tag"
                      className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
                    >
                      {updateTag.isPending ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Check className="size-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      aria-label="Cancel editing"
                      className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-raised hover:text-text"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                  <SwatchPicker value={editColor} onChange={setEditColor} />
                </div>
              ) : (
                <div key={tag.id} className="group/row flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => toggleTag(tag.id)}
                    className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm text-text transition-colors hover:bg-surface-raised"
                  >
                    <span
                      className={cn(
                        'flex size-4 shrink-0 items-center justify-center rounded border transition-colors',
                        selected.has(tag.id) ? '' : 'border-border',
                      )}
                      style={
                        selected.has(tag.id)
                          ? { backgroundColor: tag.color, borderColor: tag.color }
                          : undefined
                      }
                    >
                      {selected.has(tag.id) && <Check className="size-3 text-white" />}
                    </span>
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: tag.color }}
                    />
                    <span className="truncate">{tag.name}</span>
                  </button>

                  {confirmingDeleteId === tag.id ? (
                    <div className="flex shrink-0 items-center">
                      <button
                        type="button"
                        onClick={() => handleDelete(tag.id)}
                        disabled={deleteTag.isPending}
                        className="flex items-center gap-1 rounded-lg bg-red-500 px-2 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-600 disabled:opacity-50"
                      >
                        {deleteTag.isPending ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="size-3.5" />
                        )}
                        Delete?
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingDeleteId(null)}
                        aria-label="Cancel delete"
                        className="flex size-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-raised hover:text-text"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/row:opacity-100 focus-within:opacity-100">
                      <button
                        type="button"
                        onClick={() => startEdit(tag.id, tag.name, tag.color)}
                        aria-label={`Edit ${tag.name}`}
                        className="flex size-7 items-center justify-center rounded-md text-subtle transition-colors hover:bg-surface-raised hover:text-text"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingDeleteId(tag.id)}
                        aria-label={`Delete ${tag.name}`}
                        className="flex size-7 items-center justify-center rounded-md text-subtle transition-colors hover:bg-red-500/15 hover:text-red-500"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ),
            )
          )}
        </div>

        {/* Create — always visible so adding a tag never depends on an
            empty state being rendered first. */}
        <div className="mt-3 shrink-0 rounded-xl border border-border bg-surface/60 p-3">
          <div className="flex items-center gap-2">
            <input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && handleCreate()}
              className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-surface px-2.5 text-sm text-text outline-none focus:border-accent"
              placeholder="New tag name"
            />
            <button
              type="button"
              onClick={handleCreate}
              disabled={!newName.trim() || createTag.isPending}
              className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {createTag.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Plus className="size-3.5" />
              )}
              Add
            </button>
          </div>
          <div className="mt-2">
            <SwatchPicker value={newColor} onChange={setNewColor} />
          </div>
        </div>

        <div className="mt-4 flex shrink-0 justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-raised hover:text-text"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!isDirty || setGameTags.isPending}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {setGameTags.isPending && <Loader2 className="size-3.5 animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </Modal>
  )
}

function SwatchPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {SWATCHES.map((swatch) => (
        <button
          key={swatch}
          type="button"
          onClick={() => onChange(swatch)}
          aria-label={`Color ${swatch}`}
          className={cn(
            'flex size-5 items-center justify-center rounded-full border transition-transform hover:scale-110',
            value === swatch ? 'border-text' : 'border-transparent',
          )}
          style={{ backgroundColor: swatch }}
        >
          {value === swatch && <Check className="size-3 text-white" />}
        </button>
      ))}
    </div>
  )
}
