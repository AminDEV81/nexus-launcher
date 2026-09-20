import { AlertTriangle, Trash2 } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import type { Game } from '@/types/models'

interface DeleteConfirmModalProps {
  game: Game | null
  open: boolean
  onClose: () => void
  onConfirm: () => void
  isPending: boolean
}

export function DeleteConfirmModal({
  game,
  open,
  onClose,
  onConfirm,
  isPending,
}: DeleteConfirmModalProps) {
  if (!game) return null

  return (
    <Modal open={open} onClose={onClose} widthClassName="max-w-md">
      <div className="p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl border border-red-500/30 bg-red-500/10 text-red-400">
            <AlertTriangle className="size-5" />
          </div>
          <div>
            <h3 className="text-base font-black tracking-tight text-text">Permanently Delete?</h3>
            <p className="text-xs text-subtle">This action cannot be undone.</p>
          </div>
        </div>

        <p className="text-xs leading-relaxed text-muted">
          Are you sure you want to permanently delete{' '}
          <span className="font-bold text-text">{game.name}</span> from Memory? All recorded
          playtime sessions and history for this game will be erased from your stats forever.
        </p>

        <div className="mt-6 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-xl border border-border px-4 py-2 text-xs font-bold text-muted transition-colors hover:bg-surface-raised hover:text-text cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="flex items-center gap-1.5 rounded-xl bg-red-500 px-4 py-2 text-xs font-bold text-white shadow-md shadow-red-500/20 transition-all hover:bg-red-600 active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            <Trash2 className="size-3.5" />
            <span>{isPending ? 'Deleting...' : 'Delete Permanently'}</span>
          </button>
        </div>
      </div>
    </Modal>
  )
}
