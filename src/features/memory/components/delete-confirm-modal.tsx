import { AlertTriangle, Clock, Gamepad2, Trash2 } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { assetUrl } from '@/lib/asset-url'
import { formatPlaytime } from '@/features/library/utils/format'
import { playButtonClick } from '@/lib/sound-engine'
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
        <div className="flex items-center gap-3.5 mb-4">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-400 shadow-inner">
            <AlertTriangle className="size-5.5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-text">Remove from Memory?</h3>
            <p className="text-xs text-subtle">
              This game will be permanently deleted from Memory.
            </p>
          </div>
        </div>

        {/* Preview of game being removed */}
        <div className="mb-5 flex items-center gap-3.5 rounded-2xl border border-border/80 bg-surface/80 p-3 shadow-xs">
          {game.cover_path ? (
            <img
              src={assetUrl(game.cover_path) ?? ''}
              alt={game.name}
              className="h-16 w-12 rounded-xl object-cover border border-white/10 shrink-0 shadow-sm"
            />
          ) : (
            <div className="flex h-16 w-12 shrink-0 items-center justify-center rounded-xl bg-surface-raised text-subtle border border-white/10">
              <Gamepad2 className="size-6" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h4 className="font-bold text-sm text-text truncate">{game.name}</h4>
            <p className="text-xs text-subtle truncate">{game.developer ?? 'Unknown Studio'}</p>
            <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted">
              <Clock className="size-3 shrink-0 text-amber-400" />
              <span>{formatPlaytime(game.total_playtime_seconds)}</span>
            </div>
          </div>
        </div>

        <p className="mb-6 text-xs text-subtle leading-relaxed">
          Are you sure you want to permanently delete{' '}
          <strong className="text-text font-bold">{game.name}</strong> from Memory? All recorded
          playtime sessions and history for this game will be erased from your stats forever.
        </p>

        {/* Action buttons */}
        <div className="flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={() => {
              playButtonClick()
              onClose()
            }}
            disabled={isPending}
            className="rounded-xl border border-border/80 bg-surface-raised px-4 py-2 text-xs font-semibold text-subtle transition-all hover:bg-surface hover:text-text active:scale-95 cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              playButtonClick()
              onConfirm()
            }}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-rose-600/20 transition-all hover:bg-rose-500 hover:scale-102 active:scale-95 disabled:opacity-60 cursor-pointer"
          >
            <Trash2 className="size-3.5" />
            <span>{isPending ? 'Deleting...' : 'Delete from Memory'}</span>
          </button>
        </div>
      </div>
    </Modal>
  )
}
