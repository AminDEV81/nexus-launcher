import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, FolderHeart } from 'lucide-react'
import { useCollectionsWithPreviews } from '../hooks/use-collections'
import { CollectionCard } from '../components/collection-card'
import { NewCollectionModal } from '../components/new-collection-modal'
import { LibrarySkeleton } from '@/features/library/components/library-skeleton'

export function CollectionsPage() {
  const { data: collections, isPending } = useCollectionsWithPreviews()
  const [newCollectionOpen, setNewCollectionOpen] = useState(false)
  const navigate = useNavigate()

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 px-6 py-4">
        <div>
          <h1 className="text-xl font-semibold text-text">Collections</h1>
          <p className="text-xs text-subtle">
            {collections?.length ?? 0} collection{collections?.length === 1 ? '' : 's'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setNewCollectionOpen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-hover"
        >
          <Plus className="size-3.5" />
          New Collection
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
        {isPending ? (
          <LibrarySkeleton />
        ) : collections && collections.length > 0 ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-5">
            {collections.map((collection) => (
              <CollectionCard
                key={collection.id}
                collection={collection}
                onClick={() => navigate(`/collections/${collection.id}`)}
              />
            ))}
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-surface-raised">
              <FolderHeart className="size-6 text-subtle" strokeWidth={1.5} />
            </div>
            <div>
              <h2 className="text-sm font-medium text-text">No collections yet</h2>
              <p className="mt-1 max-w-xs text-xs text-muted">
                Group games however makes sense to you — by mood, by series, by who you play them
                with.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setNewCollectionOpen(true)}
              className="mt-1 flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-accent-hover"
            >
              <Plus className="size-3.5" />
              Create your first collection
            </button>
          </div>
        )}
      </div>

      <NewCollectionModal
        open={newCollectionOpen}
        onClose={() => setNewCollectionOpen(false)}
        onCreated={(collectionId) => navigate(`/collections/${collectionId}`)}
      />
    </div>
  )
}
