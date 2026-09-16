import { FolderHeart, Layers } from 'lucide-react'
import { motion } from 'framer-motion'
import { assetUrl } from '@/lib/asset-url'
import type { CollectionSummary } from '@/types/models'

interface CollectionCardProps {
  collection: CollectionSummary
  onClick: () => void
}

/**
 * The cover is a 2x2 mosaic of up to 4 games in the collection.
 * Redesigned with rounded-2xl geometry, smooth spring hover, and
 * elegant glassmorphic metadata badges.
 */
export function CollectionCard({ collection, onClick }: CollectionCardProps) {
  const covers = collection.preview_covers.map((path) => assetUrl(path))
  const cells = Array.from({ length: 4 }, (_, index) => covers[index] ?? null)

  return (
    <button type="button" onClick={onClick} className="group flex flex-col gap-2.5 text-left">
      <motion.div
        whileHover={{ y: -6, scale: 1.02 }}
        transition={{ type: 'spring', stiffness: 350, damping: 24 }}
        className="relative grid aspect-square grid-cols-2 grid-rows-2 gap-1 overflow-hidden rounded-2xl border border-border/80 bg-surface-raised p-1 shadow-md transition-all duration-300 group-hover:border-accent/50 group-hover:shadow-xl group-hover:shadow-black/30"
      >
        {cells.map((cover, index) => (
          <div key={index} className="relative overflow-hidden rounded-xl bg-surface">
            {cover ? (
              <img
                src={cover}
                alt=""
                className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                loading="lazy"
              />
            ) : (
              <div className="flex size-full items-center justify-center bg-surface-raised/50">
                <FolderHeart className="size-4 text-muted/60" strokeWidth={1.5} />
              </div>
            )}
          </div>
        ))}

        {/* Game Count Badge */}
        <div className="absolute bottom-2.5 right-2.5 flex items-center gap-1 rounded-full border border-white/15 bg-black/75 px-2.5 py-0.5 text-[10px] font-bold text-white shadow-xs">
          <Layers className="size-2.5 text-accent" />
          <span>{collection.game_count}</span>
        </div>
      </motion.div>

      <div className="px-0.5">
        <h3 className="truncate text-xs font-bold text-text transition-colors group-hover:text-accent">
          {collection.name}
        </h3>
        <p className="text-[11px] text-muted">
          {collection.game_count} {collection.game_count === 1 ? 'game' : 'games'}
        </p>
      </div>
    </button>
  )
}
