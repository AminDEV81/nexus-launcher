import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Trash2, FolderHeart } from 'lucide-react'
import { useCollections, useDeleteCollection } from '../hooks/use-collections'
import { useFilteredCollectionGames } from '../hooks/use-filtered-collection-games'
import { LibraryView } from '@/features/library/components/library-view'
import { Modal } from '@/components/ui/modal'

export function CollectionDetailPage() {
  const { collectionId } = useParams<{ collectionId: string }>()
  const navigate = useNavigate()
  const { data: collections } = useCollections()
  const collection = collections?.find((c) => c.id === collectionId)
  const { games, isPending } = useFilteredCollectionGames(collectionId)
  const deleteCollection = useDeleteCollection()
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  function handleDelete() {
    if (!collectionId) return
    deleteCollection.mutate(collectionId, {
      onSuccess: () => navigate('/collections'),
    })
  }

  return (
    <>
      <LibraryView
        games={games}
        isPending={isPending}
        title={collection?.name ?? 'Collection'}
        emptyIcon={FolderHeart}
        emptyTitle="No games in this collection yet"
        emptyDescription='Right-click any game in your library and choose "Add to Collection" to put it here.'
        onBack={() => navigate('/collections')}
        toolbarActions={
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            aria-label="Delete Collection"
            title="Delete Collection"
            className="flex size-8 items-center justify-center rounded-lg text-subtle transition-colors hover:bg-red-500/10 hover:text-red-500"
          >
            <Trash2 className="size-4" />
          </button>
        }
      />

      <Modal
        open={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        widthClassName="max-w-sm"
      >
        <div className="p-5">
          <h2 className="text-base font-semibold text-text">Delete "{collection?.name}"?</h2>
          <p className="mt-1 text-sm text-muted">
            This only removes the collection — the games in it stay in your library.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              className="rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-raised hover:text-text"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="rounded-lg bg-red-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600"
            >
              Delete
            </button>
          </div>
        </div>
      </Modal>
    </>
  )
}
