import type { LucideIcon } from 'lucide-react'
import { Plus, ScanSearch } from 'lucide-react'
import { useAddGameModalStore } from '../store/add-game-modal-store'
import { useScanModalStore } from '../store/scan-modal-store'

export function LibraryEmptyState({
  icon: Icon,
  title,
  description,
  showActions,
}: {
  icon: LucideIcon
  title: string
  description: string
  showActions?: boolean
}) {
  const openAddGame = useAddGameModalStore((s) => s.open)
  const openScan = useScanModalStore((s) => s.open)

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-surface-raised">
        <Icon className="size-6 text-subtle" strokeWidth={1.5} />
      </div>
      <div>
        <h2 className="text-sm font-medium text-text">{title}</h2>
        <p className="mt-1 max-w-xs text-xs text-muted">{description}</p>
      </div>

      {showActions && (
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => openAddGame()}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-accent-hover"
          >
            <Plus className="size-3.5" />
            Add Game
          </button>
          <button
            type="button"
            onClick={() => openScan()}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-text transition-colors hover:bg-surface-raised"
          >
            <ScanSearch className="size-3.5" />
            Scan for Games
          </button>
        </div>
      )}
    </div>
  )
}
