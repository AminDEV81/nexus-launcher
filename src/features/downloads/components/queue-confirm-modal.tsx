import { Modal } from '@/components/ui/modal'
import { PauseCircle, PlayCircle, XCircle, AlertTriangle, Check, Layers } from 'lucide-react'
import { cn } from '@/lib/utils'

export type QueueActionType = 'pause_all' | 'resume_all' | 'resume_sequential' | 'cancel_all'

interface QueueConfirmModalProps {
  action: QueueActionType | null
  count: number
  onClose: () => void
  onConfirm: (action: QueueActionType) => void
  isPending?: boolean
}

export function QueueConfirmModal({
  action,
  count,
  onClose,
  onConfirm,
  isPending = false,
}: QueueConfirmModalProps) {
  if (!action) return null

  const config = {
    pause_all: {
      title: 'Pause All Active Downloads?',
      description: `This will safely pause ${count} active download${count > 1 ? 's' : ''}. Downloaded progress will be preserved and can be resumed at any time.`,
      icon: <PauseCircle className="size-6 text-accent" />,
      iconBg: 'bg-accent/15 ring-accent/30',
      confirmText: 'Pause All',
      confirmBtnClass: 'bg-accent hover:bg-accent-hover shadow-accent/25',
    },
    resume_all: {
      title: 'Resume All at Once?',
      description: `This will resume ${count} paused or queued download${count > 1 ? 's' : ''} simultaneously and allocate network connections to all of them.`,
      icon: <PlayCircle className="size-6 text-emerald-400" />,
      iconBg: 'bg-emerald-500/15 ring-emerald-500/30',
      confirmText: 'Resume All (Simultaneous)',
      confirmBtnClass: 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/25',
    },
    resume_sequential: {
      title: 'Resume Queue One by One?',
      description: `This will queue ${count} download task${count > 1 ? 's' : ''} in sequential order. Item #1 starts now, and each following download starts automatically when its turn arrives.`,
      icon: <Layers className="size-6 text-accent" />,
      iconBg: 'bg-accent/15 ring-accent/30',
      confirmText: 'Start Queue (One by One)',
      confirmBtnClass: 'bg-accent hover:bg-accent-hover shadow-accent/25',
    },
    cancel_all: {
      title: 'Cancel & Clear All Downloads?',
      description: `Are you sure you want to cancel all ${count} download tasks in the queue? In-progress transfers will be aborted.`,
      icon: <XCircle className="size-6 text-red-400" />,
      iconBg: 'bg-red-500/15 ring-red-500/30',
      confirmText: 'Yes, Cancel All',
      confirmBtnClass: 'bg-red-600 hover:bg-red-500 shadow-red-500/25',
    },
  }[action]

  return (
    <Modal open={Boolean(action)} onClose={onClose} widthClassName="max-w-md">
      <div className="p-6">
        <div className="flex items-start gap-4">
          <div
            className={cn(
              'flex size-12 shrink-0 items-center justify-center rounded-2xl ring-1 shadow-inner',
              config.iconBg,
            )}
          >
            {config.icon}
          </div>

          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold text-text">{config.title}</h3>
            <p className="mt-1.5 text-xs leading-relaxed text-subtle">{config.description}</p>
          </div>
        </div>

        {action === 'cancel_all' && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-2.5 text-xs text-red-400">
            <AlertTriangle className="size-4 shrink-0" />
            <span>This action cannot be undone for active downloads.</span>
          </div>
        )}

        <div className="mt-6 flex items-center justify-end gap-2.5 border-t border-border/70 pt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-xl border border-border bg-surface px-4 py-2 text-xs font-semibold text-subtle transition-colors hover:bg-surface-raised hover:text-text disabled:opacity-50"
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => onConfirm(action)}
            disabled={isPending}
            className={cn(
              'flex items-center gap-1.5 rounded-xl px-5 py-2 text-xs font-bold text-white shadow-lg transition-all active:scale-95 disabled:opacity-50',
              config.confirmBtnClass,
            )}
          >
            <Check className="size-4" />
            <span>{config.confirmText}</span>
          </button>
        </div>
      </div>
    </Modal>
  )
}
