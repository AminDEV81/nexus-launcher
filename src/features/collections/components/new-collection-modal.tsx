import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { useCreateCollection } from '../hooks/use-collections'

interface NewCollectionModalProps {
  open: boolean
  onClose: () => void
  /** Fired with the newly created collection's id — lets the caller
   *  navigate straight to it (e.g. from the empty state's "Create your
   *  first collection" button) without a second round trip to find it. */
  onCreated?: (collectionId: string) => void
}

export function NewCollectionModal({ open, onClose, onCreated }: NewCollectionModalProps) {
  const [name, setName] = useState('')
  const createCollection = useCreateCollection()

  useEffect(() => {
    if (open) setName('')
  }, [open])

  function handleSubmit() {
    const trimmed = name.trim()
    if (!trimmed || createCollection.isPending) return
    createCollection.mutate(trimmed, {
      onSuccess: (collection) => {
        onClose()
        onCreated?.(collection.id)
      },
    })
  }

  return (
    <Modal open={open} onClose={onClose} widthClassName="max-w-sm">
      <div className="p-5">
        <h2 className="text-base font-semibold text-text">New Collection</h2>
        <p className="mt-1 text-sm text-muted">Give it a name — you can add games to it after.</p>

        <input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') handleSubmit()
          }}
          placeholder="e.g. Cozy Weekend Games"
          className="mt-4 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-accent-border"
        />

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-raised hover:text-text"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!name.trim() || createCollection.isPending}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {createCollection.isPending && <Loader2 className="size-3.5 animate-spin" />}
            Create
          </button>
        </div>
      </div>
    </Modal>
  )
}
