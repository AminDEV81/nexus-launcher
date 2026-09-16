import { useEffect, useState } from 'react'
import {
  History,
  RotateCcw,
  Trash2,
  Lock,
  Clock,
  HardDrive,
  CheckCircle2,
  AlertTriangle,
  User,
} from 'lucide-react'
import { toast } from 'sonner'
import { useSaveManagerStore } from '@/store/save-manager-store'
import { useProfileStore } from '@/store/profile-store'
import { useGame } from '../hooks/use-games'
import { formatBytes } from '../utils/guess-name'
import { formatExactDateTime, formatRelativeDate } from '../utils/format'
import { ModalCloseButton } from '@/components/ui/modal'

export function SaveHistoryModal() {
  const isOpen = useSaveManagerStore((s) => s.isHistoryModalOpen)
  const gameId = useSaveManagerStore((s) => s.historyModalGameId)
  const closeModal = useSaveManagerStore((s) => s.closeHistoryModal)
  const snapshotsByGame = useSaveManagerStore((s) => s.snapshotsByGame)
  const loadSnapshots = useSaveManagerStore((s) => s.loadSnapshots)
  const restoreSnapshot = useSaveManagerStore((s) => s.restoreSnapshot)
  const deleteSnapshot = useSaveManagerStore((s) => s.deleteSnapshot)

  const activeProfile = useProfileStore((s) => s.activeProfile)
  const profiles = useProfileStore((s) => s.profiles)
  const { data: game } = useGame(gameId ?? undefined)

  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [confirmRestoreId, setConfirmRestoreId] = useState<string | null>(null)

  const snapshots = (gameId ? snapshotsByGame[gameId] : []) ?? []

  useEffect(() => {
    if (isOpen && gameId) {
      void loadSnapshots(gameId)
    }
  }, [isOpen, gameId, loadSnapshots])

  if (!isOpen || !gameId) return null

  const handleRestore = async (snapshotId: string) => {
    try {
      setRestoringId(snapshotId)
      await restoreSnapshot(gameId, snapshotId, activeProfile?.id)
      toast.success(`Snapshot restored successfully to profile ${activeProfile?.name ?? ''}!`)
      setConfirmRestoreId(null)
    } catch (err) {
      toast.error(`Failed to restore snapshot: ${String(err)}`)
    } finally {
      setRestoringId(null)
    }
  }

  const handleDelete = async (snapshotId: string) => {
    try {
      await deleteSnapshot(gameId, snapshotId, activeProfile?.id)
      toast.success('Snapshot deleted.')
    } catch (err) {
      toast.error(`Failed to delete snapshot: ${String(err)}`)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
      <div className="flex max-h-[85vh] w-full max-w-xl flex-col rounded-2xl border border-border bg-surface-raised shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-accent/15 text-accent border border-accent/20">
              <History className="size-4.5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-text">Save Snapshots &amp; Rollback Points</h2>
              <p className="text-[11px] text-subtle">
                {game?.name} &bull; Active Profile:{' '}
                <strong className="text-text">{activeProfile?.name}</strong>
              </p>
            </div>
          </div>
          <ModalCloseButton onClick={closeModal} />
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {confirmRestoreId && (
            <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5 flex items-start gap-3">
              <AlertTriangle className="size-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="text-xs font-bold text-amber-300 block mb-1">
                  Confirm Snapshot Restoration
                </span>
                <p className="text-[11px] text-muted leading-relaxed mb-3">
                  Restoring will apply this snapshot into your currently active profile{' '}
                  <strong className="text-text">{activeProfile?.name}</strong> and update game files
                  on your computer. An automated safety backup will be created first.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleRestore(confirmRestoreId)}
                    disabled={restoringId !== null}
                    className="rounded-lg bg-amber-500 px-3 py-1 text-xs font-bold text-black hover:bg-amber-400 transition-colors"
                  >
                    {restoringId === confirmRestoreId ? 'Restoring...' : 'Yes, Restore'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmRestoreId(null)}
                    className="rounded-lg border border-border px-3 py-1 text-xs font-semibold text-muted hover:text-text hover:bg-surface"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {snapshots.length > 0 ? (
            <div className="flex flex-col gap-2.5">
              {snapshots.map((snap) => {
                const snapProfile = profiles.find((p) => p.id === snap.profile_id)
                const isCurrentProfile = snap.profile_id === activeProfile?.id
                return (
                  <div
                    key={snap.id}
                    className="flex flex-col gap-2 rounded-xl border border-border/80 bg-surface/70 p-3 transition-colors hover:border-accent/40"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-text">{snap.label}</span>
                        <span
                          className={`flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[9px] font-semibold border ${
                            isCurrentProfile
                              ? 'bg-accent/15 text-accent border-accent/30'
                              : 'bg-surface-raised text-subtle border-border'
                          }`}
                        >
                          <User className="size-2.5" />
                          {snapProfile?.name ?? snap.profile_id}
                        </span>
                        {snap.is_permanent && (
                          <span className="flex items-center gap-1 rounded-sm bg-purple-500/15 border border-purple-500/30 px-1.5 py-0.5 text-[9px] font-bold text-purple-400">
                            <Lock className="size-2.5" /> Permanent
                          </span>
                        )}
                      </div>
                      <span
                        className="text-[10px] text-subtle"
                        title={formatExactDateTime(snap.created_at)}
                      >
                        {formatRelativeDate(snap.created_at)}
                      </span>
                    </div>

                    <div className="flex items-center gap-4 text-[11px] text-muted">
                      <span className="flex items-center gap-1">
                        <HardDrive className="size-3 text-subtle" />
                        {formatBytes(snap.total_size_bytes)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="size-3 text-subtle" />
                        {snap.locations.length}{' '}
                        {snap.locations.length === 1 ? 'location' : 'locations'}
                      </span>
                      <span className="font-mono text-[10px] text-subtle">
                        SHA: {snap.tree_hash.slice(0, 12)}...
                      </span>
                    </div>

                    <div className="flex items-center justify-end gap-2 border-t border-border/50 pt-2 mt-1">
                      {!snap.is_permanent && (
                        <button
                          type="button"
                          onClick={() => handleDelete(snap.id)}
                          className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 transition-colors"
                        >
                          <Trash2 className="size-3" />
                          <span>Delete</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setConfirmRestoreId(snap.id)}
                        className="flex items-center gap-1.5 rounded-lg bg-accent/20 border border-accent/30 px-3 py-1 text-xs font-bold text-accent hover:bg-accent hover:text-white transition-colors"
                      >
                        <RotateCcw className="size-3.5" />
                        <span>Restore</span>
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/80 bg-surface/40 p-8 text-center">
              <CheckCircle2 className="size-8 text-subtle mb-1" />
              <span className="text-xs font-bold text-text">No Snapshots Recorded</span>
              <p className="text-[11px] text-subtle max-w-xs leading-relaxed">
                Nexus Launcher automatically creates safety snapshots before launch and on game exit
                when save files are modified.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border/70 px-5 py-3 flex items-center justify-between bg-surface/50 text-[11px] text-subtle">
          <span>Configured Retention: 10 snapshots + 1 permanent</span>
          <button
            type="button"
            onClick={closeModal}
            className="rounded-xl border border-border bg-surface px-4 py-1.5 text-xs font-semibold text-text hover:bg-surface-raised"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
