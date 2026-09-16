import { useState } from 'react'
import {
  Download,
  Loader2,
  Upload,
  Database,
  ShieldCheck,
  Gamepad2,
  HardDrive,
  Heart,
  AlertTriangle,
} from 'lucide-react'
import { open as openFileDialog, save as saveFileDialog } from '@tauri-apps/plugin-dialog'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/modal'
import { exportBackup, importBackup, type ImportSummary } from '@/services/backup'
import { useGames } from '@/features/library/hooks/use-games'
import { StorageCleanupCard } from './storage-cleanup-card'

const BACKUP_FILTER = [{ name: 'Nexus Backup', extensions: ['json'] }]

export function BackupPanel() {
  const queryClient = useQueryClient()
  const { data: games } = useGames()
  const [pendingImport, setPendingImport] = useState<string | null>(null)

  const totalGames = games?.length ?? 0
  const installedGames = games?.filter((g) => g.is_installed).length ?? 0
  const favoriteGames = games?.filter((g) => g.is_favorite).length ?? 0

  const exportMutation = useMutation({
    mutationFn: exportBackup,
    onSuccess: (rows) => toast.success(`Backup saved — ${rows} records safely archived.`),
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Export failed.'),
  })

  const importMutation = useMutation({
    mutationFn: importBackup,
    onSuccess: (summary: ImportSummary) => {
      setPendingImport(null)
      queryClient.invalidateQueries()
      toast.success(
        `Restored ${summary.games} games, ${summary.collections} collections, and ${summary.playtime_sessions} sessions.`,
      )
    },
    onError: (error) => {
      setPendingImport(null)
      toast.error(error instanceof Error ? error.message : 'Import failed.')
    },
  })

  async function handleExport() {
    try {
      const path = await saveFileDialog({
        title: 'Save Nexus Backup',
        filters: BACKUP_FILTER,
        defaultPath: 'nexus-backup.json',
      })
      if (typeof path === 'string') exportMutation.mutate(path)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not open save dialog.')
    }
  }

  async function handlePickFile() {
    try {
      const path = await openFileDialog({
        title: 'Choose Nexus Backup File',
        multiple: false,
        filters: BACKUP_FILTER,
      })
      if (typeof path === 'string') setPendingImport(path)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not open file dialog.')
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Database Status & Integrity Card */}
      <div className="flex flex-col gap-4 rounded-2xl border border-border/80 bg-surface/60 p-5 shadow-sm">
        <div className="flex items-center justify-between border-b border-border/60 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-accent/15 text-accent shadow-xs">
              <Database className="size-4.5" />
            </span>
            <div>
              <span className="text-sm font-bold text-text">Database State</span>
              <div className="text-xs text-subtle">Local SQLite snapshot &amp; records</div>
            </div>
          </div>
          <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 font-mono text-[10px] font-bold text-emerald-400">
            <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
            <span>SQLite Verified</span>
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          <div className="flex flex-col items-center justify-center rounded-xl border border-border/60 bg-surface p-3 text-center shadow-xs">
            <Gamepad2 className="size-4 text-accent" />
            <span className="mt-1 font-mono text-xl font-black text-text">{totalGames}</span>
            <span className="text-[10px] font-bold text-subtle uppercase">Total Games</span>
          </div>

          <div className="flex flex-col items-center justify-center rounded-xl border border-border/60 bg-surface p-3 text-center shadow-xs">
            <HardDrive className="size-4 text-emerald-400" />
            <span className="mt-1 font-mono text-xl font-black text-text">{installedGames}</span>
            <span className="text-[10px] font-bold text-subtle uppercase">Installed</span>
          </div>

          <div className="flex flex-col items-center justify-center rounded-xl border border-border/60 bg-surface p-3 text-center shadow-xs">
            <Heart className="size-4 text-rose-500" />
            <span className="mt-1 font-mono text-xl font-black text-text">{favoriteGames}</span>
            <span className="text-[10px] font-bold text-subtle uppercase">Favorites</span>
          </div>
        </div>
      </div>

      {/* Storage Maintenance & Orphaned Cover Purge */}
      <StorageCleanupCard />

      {/* Export & Import Action Vault */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Export Card */}
        <div className="flex flex-col justify-between rounded-2xl border border-border/80 bg-surface/70 p-5 shadow-sm transition-all hover:bg-surface-raised">
          <div>
            <div className="flex size-10 items-center justify-center rounded-xl bg-accent/15 text-accent shadow-xs">
              <Download className="size-5" />
            </div>
            <h3 className="mt-3.5 text-sm font-bold text-text">Export Library Archive</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Package your entire library, custom tags, collection folders, and play sessions into a
              portable JSON file.
            </p>
          </div>

          <button
            type="button"
            onClick={handleExport}
            disabled={exportMutation.isPending}
            className="mt-5 flex items-center justify-center gap-2 rounded-xl border border-accent/30 bg-accent/10 py-2.5 text-xs font-bold text-accent shadow-xs transition-all hover:bg-accent hover:text-white active:scale-95 disabled:opacity-50"
          >
            {exportMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
            <span>Export Backup File</span>
          </button>
        </div>

        {/* Restore Card */}
        <div className="flex flex-col justify-between rounded-2xl border border-border/80 bg-surface/70 p-5 shadow-sm transition-all hover:bg-surface-raised">
          <div>
            <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400 shadow-xs">
              <Upload className="size-5" />
            </div>
            <h3 className="mt-3.5 text-sm font-bold text-text">Restore from Backup</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Import a verified backup. Every record is checked against the database schema before
              applying.
            </p>
          </div>

          <button
            type="button"
            onClick={handlePickFile}
            disabled={importMutation.isPending}
            className="mt-5 flex items-center justify-center gap-2 rounded-xl bg-accent py-2.5 text-xs font-bold text-white shadow-md shadow-accent/20 transition-all hover:bg-accent-hover active:scale-95 disabled:opacity-50"
          >
            <Upload className="size-4" />
            <span>Select Backup to Restore</span>
          </button>
        </div>
      </div>

      {/* Safety & Integrity Notice */}
      <div className="flex items-start gap-3 rounded-2xl border border-border/80 bg-surface/50 p-4 shadow-xs">
        <ShieldCheck className="size-5 shrink-0 text-accent" />
        <div className="text-xs leading-relaxed text-muted">
          <strong className="text-text">Transactional Safety Guaranteed:</strong> Backups are
          verified in a single atomic transaction. In the event of a damaged or incompatible file,
          the existing library is preserved with zero data loss. Missing covers and banners are
          re-fetched from official stores automatically.
        </div>
      </div>

      {/* Restore Confirmation Modal */}
      <Modal
        open={pendingImport !== null}
        onClose={() => setPendingImport(null)}
        widthClassName="max-w-md"
      >
        <div className="flex flex-col gap-4 p-6">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-500 shadow-xs">
            <AlertTriangle className="size-5.5" />
          </div>

          <div>
            <h2 className="text-base font-bold text-text">Replace Current Library?</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Restoring this backup file will overwrite your active games, collections, and settings
              with the saved archive state. Export a fresh backup first if you want a fallback.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setPendingImport(null)}
              className="rounded-xl border border-border/80 bg-surface px-4 py-2 text-xs font-bold text-text shadow-xs hover:bg-surface-raised"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => pendingImport && importMutation.mutate(pendingImport)}
              disabled={importMutation.isPending}
              className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-xs font-bold text-white shadow-md shadow-accent/25 hover:bg-accent-hover active:scale-95 disabled:opacity-50"
            >
              {importMutation.isPending && <Loader2 className="size-3.5 animate-spin" />}
              <span>Confirm &amp; Restore</span>
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
