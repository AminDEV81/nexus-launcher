import { useState, useEffect } from 'react'
import { Modal } from '@/components/ui/modal'
import { Trash2, FileArchive, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface DeleteDownloadTarget {
  id: string
  name: string
  isCompleted: boolean
  hasArchive: boolean
}

interface DeleteDownloadModalProps {
  target: DeleteDownloadTarget | null
  onClose: () => void
  onConfirm: (id: string, deleteFile: boolean) => void
  isPending: boolean
}

export function DeleteDownloadModal({
  target,
  onClose,
  onConfirm,
  isPending,
}: DeleteDownloadModalProps) {
  const [deleteArchive, setDeleteArchive] = useState(false)

  useEffect(() => {
    if (target) {
      setDeleteArchive(false)
    }
  }, [target])

  if (!target) return null

  function handleConfirm() {
    if (!target) return
    onConfirm(target.id, deleteArchive)
  }

  return (
    <Modal open={target !== null} onClose={onClose} widthClassName="max-w-md">
      <div className="p-6">
        {/* Header with Danger Icon */}
        <div className="mb-4 flex items-center gap-3.5">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-red-500/15 text-red-400 ring-1 ring-red-500/30">
            <Trash2 className="size-5.5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-text">Remove Download</h3>
            <p className="text-xs text-subtle">Manage download entry and disk files</p>
          </div>
        </div>

        {/* Description */}
        <p className="text-sm text-muted">
          Are you sure you want to remove{' '}
          <span className="font-semibold text-text">{target.name}</span> from your download history?
        </p>

        {/* Delete Archive Checkbox Option */}
        <div
          onClick={() => setDeleteArchive(!deleteArchive)}
          className={cn(
            'mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border p-3.5 transition-all select-none',
            deleteArchive
              ? 'border-red-500/40 bg-red-500/10'
              : 'border-border bg-surface/70 hover:border-border-hover hover:bg-surface-raised',
          )}
        >
          <input
            type="checkbox"
            checked={deleteArchive}
            onChange={(e) => setDeleteArchive(e.target.checked)}
            className="mt-1 size-4 rounded border-border accent-red-500 cursor-pointer"
            onClick={(e) => e.stopPropagation()}
          />

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-xs font-bold text-text">
              <FileArchive className="size-3.5 text-accent" />
              <span>Delete compressed archive file from disk</span>
            </div>
            <p className="mt-0.5 text-[11px] leading-relaxed text-subtle">
              Frees up disk space by deleting the downloaded archive.
              {target.isCompleted && (
                <span className="mt-1 flex items-center gap-1 font-medium text-emerald-400">
                  <ShieldCheck className="size-3 shrink-0" />
                  Your installed game and library entry will remain safe and playable.
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex items-center justify-end gap-2.5 border-t border-border/70 pt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-xl border border-border bg-surface px-4 py-2 text-xs font-semibold text-subtle transition-colors hover:bg-surface-raised hover:text-text"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isPending}
            className={cn(
              'flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold text-white shadow transition-all active:scale-95',
              deleteArchive
                ? 'bg-red-500 hover:bg-red-600 shadow-red-500/20'
                : 'bg-accent hover:bg-accent-hover shadow-accent/20',
            )}
          >
            <Trash2 className="size-3.5" />
            <span>{deleteArchive ? 'Delete Archive & Remove' : 'Remove from List'}</span>
          </button>
        </div>
      </div>
    </Modal>
  )
}
