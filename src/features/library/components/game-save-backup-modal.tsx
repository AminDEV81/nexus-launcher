import { useCallback, useEffect, useState } from 'react'
import {
  Archive,
  Upload,
  FolderOpen,
  FileArchive,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  User,
  HardDrive,
  Calendar,
  Layers,
  Check,
} from 'lucide-react'
import { open as openFileDialog, save as saveFileDialog } from '@tauri-apps/plugin-dialog'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/modal'
import { useProfileStore } from '@/store/profile-store'
import * as saveService from '@/services/save-manager'
import { formatBytes } from '../utils/guess-name'
import { formatExactDateTime } from '../utils/format'
import { cn } from '@/lib/utils'
import type { Game, GameSaveDetails, SaveArchiveManifest } from '@/types/models'

interface GameSaveBackupModalProps {
  game: Game
  open: boolean
  onClose: () => void
  defaultTab?: 'backup' | 'restore'
  onSuccess?: () => void
}

export function GameSaveBackupModal({
  game,
  open,
  onClose,
  defaultTab = 'backup',
  onSuccess,
}: GameSaveBackupModalProps) {
  const [activeTab, setActiveTab] = useState<'backup' | 'restore'>(defaultTab)

  const profiles = useProfileStore((s) => s.profiles)
  const activeProfile = useProfileStore((s) => s.activeProfile)

  // Selected profile for backup/restore (defaults to active user profile)
  const [selectedProfileId, setSelectedProfileId] = useState<string>('')

  // Backup State
  const [destinationPath, setDestinationPath] = useState<string>('')
  const [saveDetails, setSaveDetails] = useState<GameSaveDetails | null>(null)
  const [isLoadingDetails, setIsLoadingDetails] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

  // Restore State
  const [restoreFilePath, setRestoreFilePath] = useState<string>('')
  const [inspectedManifest, setInspectedManifest] = useState<SaveArchiveManifest | null>(null)
  const [isInspecting, setIsInspecting] = useState(false)
  const [isRestoring, setIsRestoring] = useState(false)

  // Reset or initialize on open
  useEffect(() => {
    if (open) {
      setActiveTab(defaultTab)
      const initialProfileId = activeProfile?.id || (profiles[0]?.id ?? '')
      setSelectedProfileId(initialProfileId)
      setRestoreFilePath('')
      setInspectedManifest(null)
    }
  }, [open, defaultTab, activeProfile?.id, profiles])

  // Fetch save details and default backup path whenever selected profile changes
  const fetchBackupData = useCallback(async () => {
    if (!open || !game.id) return
    try {
      setIsLoadingDetails(true)
      const [details, defaultPath] = await Promise.all([
        saveService.getGameSaveDetails(game.id, selectedProfileId || undefined),
        saveService.getDefaultSaveBackupPath(game.id, selectedProfileId || undefined),
      ])
      setSaveDetails(details)
      setDestinationPath(defaultPath)
    } catch (err) {
      console.error('Failed to load save details for backup:', err)
    } finally {
      setIsLoadingDetails(false)
    }
  }, [open, game.id, selectedProfileId])

  useEffect(() => {
    if (open && activeTab === 'backup') {
      void fetchBackupData()
    }
  }, [open, activeTab, fetchBackupData])

  // Browse destination for backup
  const handleBrowseDestination = async () => {
    try {
      const chosen = await saveFileDialog({
        title: 'Choose Save Backup Archive Location',
        defaultPath: destinationPath || undefined,
        filters: [{ name: 'Game Save Archive (*.zip)', extensions: ['zip'] }],
      })
      if (typeof chosen === 'string') {
        setDestinationPath(chosen)
      }
    } catch (err) {
      toast.error(`Could not choose save path: ${String(err)}`)
    }
  }

  // Execute backup
  const handleExecuteBackup = async () => {
    if (!destinationPath.trim()) {
      toast.error('Please specify a backup destination path.')
      return
    }

    try {
      setIsExporting(true)
      const result = await saveService.exportGameSaveZip(
        game.id,
        destinationPath.trim(),
        selectedProfileId || undefined,
      )
      toast.success(
        `Save backup created successfully! (${result.file_count} files, ${formatBytes(
          result.archive_size_bytes,
        )})`,
      )
      onSuccess?.()
      onClose()
    } catch (err) {
      toast.error(`Failed to export save backup: ${String(err)}`)
    } finally {
      setIsExporting(false)
    }
  }

  // Browse archive for restore
  const handleBrowseRestoreFile = async () => {
    try {
      const selected = await openFileDialog({
        title: 'Select Game Save Archive (.zip)',
        multiple: false,
        filters: [{ name: 'Game Save Archive (*.zip)', extensions: ['zip'] }],
      })

      if (typeof selected === 'string') {
        setRestoreFilePath(selected)
        setIsInspecting(true)
        setInspectedManifest(null)
        try {
          const manifest = await saveService.inspectGameSaveZip(selected)
          setInspectedManifest(manifest)
        } catch (err) {
          toast.error(`Invalid save archive: ${String(err)}`)
        } finally {
          setIsInspecting(false)
        }
      }
    } catch (err) {
      toast.error(`Could not open file: ${String(err)}`)
    }
  }

  // Execute restore
  const handleExecuteRestore = async () => {
    if (!restoreFilePath.trim()) {
      toast.error('Please select a .zip archive to restore.')
      return
    }

    try {
      setIsRestoring(true)
      const result = await saveService.restoreGameSaveZip(
        game.id,
        restoreFilePath.trim(),
        selectedProfileId || undefined,
      )
      toast.success(
        `Restored ${result.restored_files} save files (${formatBytes(
          result.restored_bytes,
        )}) successfully! A safety snapshot was also taken.`,
      )
      onSuccess?.()
      onClose()
    } catch (err) {
      toast.error(`Failed to restore save: ${String(err)}`)
    } finally {
      setIsRestoring(false)
    }
  }

  const selectedProfileObj = profiles.find((p) => p.id === selectedProfileId)
  const isGameMismatch = inspectedManifest && inspectedManifest.game_id !== game.id

  return (
    <Modal open={open} onClose={onClose} widthClassName="max-w-xl">
      <div className="flex flex-col bg-surface-raised p-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-border/80">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent border border-accent/20">
              <FileArchive className="size-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-text">Game Save Backup &amp; Restore</h3>
              <p className="text-xs text-subtle truncate max-w-sm" title={game.name}>
                {game.name}
              </p>
            </div>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="mt-4 flex rounded-xl bg-surface/80 p-1 border border-border/60">
          <button
            type="button"
            onClick={() => setActiveTab('backup')}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-xs font-bold transition-all cursor-pointer',
              activeTab === 'backup'
                ? 'bg-accent text-white shadow-sm'
                : 'text-muted hover:text-text hover:bg-surface-raised/60',
            )}
          >
            <Archive className="size-3.5" />
            <span>Backup Saves (.zip)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('restore')}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-xs font-bold transition-all cursor-pointer',
              activeTab === 'restore'
                ? 'bg-accent text-white shadow-sm'
                : 'text-muted hover:text-text hover:bg-surface-raised/60',
            )}
          >
            <Upload className="size-3.5" />
            <span>Restore Saves</span>
          </button>
        </div>

        {/* Profile Selector (Required for each user to backup their own saves) */}
        <div className="mt-4 rounded-xl border border-border/70 bg-surface/50 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <User className="size-4 text-accent shrink-0" />
              <div className="min-w-0">
                <span className="text-xs font-bold text-text block">User Profile</span>
                <span className="text-[11px] text-subtle truncate block">
                  {activeTab === 'backup'
                    ? 'Export save files belonging to this profile'
                    : 'Restore save archive into this profile'}
                </span>
              </div>
            </div>

            <select
              value={selectedProfileId}
              onChange={(e) => setSelectedProfileId(e.target.value)}
              className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text focus:border-accent focus:outline-none max-w-[180px] cursor-pointer"
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.id === activeProfile?.id ? '(Active)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* ── BACKUP TAB ────────────────────────────────────────── */}
        {activeTab === 'backup' && (
          <div className="mt-4 flex flex-col gap-4">
            {/* Save Status Summary */}
            <div className="rounded-xl border border-border/70 bg-surface/40 p-3.5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-text flex items-center gap-1.5">
                  <HardDrive className="size-3.5 text-accent" />
                  Save Data to Archive
                </span>
                {saveDetails?.is_managed ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                    <Check className="size-3" />
                    Managed ({saveDetails.locations.filter((l) => l.is_enabled).length} locations)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5 text-[10px] font-medium text-subtle">
                    Unmanaged
                  </span>
                )}
              </div>

              {isLoadingDetails ? (
                <div className="flex items-center gap-2 py-3 justify-center text-xs text-subtle">
                  <Loader2 className="size-4 animate-spin text-accent" />
                  <span>Scanning save data...</span>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2 pt-1 border-t border-border/40 mt-2">
                  <div>
                    <span className="text-[10px] text-subtle block">Files Found</span>
                    <span className="text-xs font-bold text-text">
                      {saveDetails?.file_count ?? 0} files
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-subtle block">Uncompressed Size</span>
                    <span className="text-xs font-bold text-text">
                      {saveDetails?.save_size_bytes
                        ? formatBytes(saveDetails.save_size_bytes)
                        : '0 B'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-subtle block">Format</span>
                    <span className="text-xs font-bold text-accent">.zip Archive</span>
                  </div>
                </div>
              )}

              {saveDetails && saveDetails.file_count === 0 && !isLoadingDetails && (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-300">
                  <AlertCircle className="size-4 shrink-0 mt-0.5 text-amber-400" />
                  <span>
                    No existing save files were found in the configured folders for this profile
                    yet. An archive can still be generated if saves are created later.
                  </span>
                </div>
              )}
            </div>

            {/* Destination Path Selector */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-text flex items-center justify-between">
                <span>Backup Destination Location:</span>
                <span className="text-[11px] font-normal text-subtle">Compressed .zip</span>
              </label>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={destinationPath}
                  onChange={(e) => setDestinationPath(e.target.value)}
                  placeholder="Select or enter .zip backup path..."
                  className="flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-xs text-text placeholder:text-subtle focus:border-accent focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => void handleBrowseDestination()}
                  className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-2 text-xs font-semibold text-text transition-colors hover:bg-surface-raised hover:border-accent/40 cursor-pointer shrink-0"
                >
                  <FolderOpen className="size-4 text-accent" />
                  <span>Browse...</span>
                </button>
              </div>

              <span className="text-[11px] text-subtle">
                Saves are compressed into an isolated .zip archive including file hierarchy and
                manifest metadata.
              </span>
            </div>

            {/* Footer Buttons */}
            <div className="mt-2 flex items-center justify-end gap-2.5 pt-3 border-t border-border/80">
              <button
                type="button"
                onClick={onClose}
                disabled={isExporting}
                className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-muted transition-colors hover:bg-surface hover:text-text cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleExecuteBackup()}
                disabled={isExporting || isLoadingDetails || !destinationPath.trim()}
                className="flex items-center gap-2 rounded-xl bg-accent px-5 py-2 text-xs font-bold text-white transition-all hover:bg-accent-hover disabled:opacity-50 cursor-pointer shadow-sm"
              >
                {isExporting ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    <span>Compressing &amp; Archiving...</span>
                  </>
                ) : (
                  <>
                    <Archive className="size-3.5" />
                    <span>Export Save Backup (.zip)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ── RESTORE TAB ───────────────────────────────────────── */}
        {activeTab === 'restore' && (
          <div className="mt-4 flex flex-col gap-4">
            {/* Archive File Selector */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-text">Choose Backup Archive (.zip):</label>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={restoreFilePath}
                  placeholder="Select a previously exported .zip save archive..."
                  className="flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-xs text-text placeholder:text-subtle focus:border-accent focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => void handleBrowseRestoreFile()}
                  className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-2 text-xs font-semibold text-text transition-colors hover:bg-surface-raised hover:border-accent/40 cursor-pointer shrink-0"
                >
                  <FolderOpen className="size-4 text-accent" />
                  <span>Choose File...</span>
                </button>
              </div>
            </div>

            {/* Inspection Preview */}
            {isInspecting && (
              <div className="flex items-center justify-center gap-2 py-6 rounded-xl border border-border/70 bg-surface/40 text-xs text-subtle">
                <Loader2 className="size-4 animate-spin text-accent" />
                <span>Reading archive contents and verifying manifest...</span>
              </div>
            )}

            {inspectedManifest && !isInspecting && (
              <div className="rounded-xl border border-border/70 bg-surface/50 p-4">
                <div className="flex items-center justify-between mb-3 border-b border-border/40 pb-2.5">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-emerald-400" />
                    <span className="text-xs font-bold text-text">Valid Save Archive</span>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/20">
                    Version {inspectedManifest.version}
                  </span>
                </div>

                {isGameMismatch && (
                  <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-300">
                    <AlertCircle className="size-4 shrink-0 mt-0.5 text-amber-400" />
                    <span>
                      Notice: This backup was exported for{' '}
                      <strong>{inspectedManifest.game_name}</strong> (Game ID:{' '}
                      {inspectedManifest.game_id}), which differs from the current game ID.
                    </span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-[10px] text-subtle block">Source Game</span>
                    <span className="font-bold text-text">{inspectedManifest.game_name}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-subtle block">Source User</span>
                    <span className="font-bold text-text">{inspectedManifest.profile_name}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-subtle block flex items-center gap-1">
                      <Calendar className="size-3" />
                      Created At
                    </span>
                    <span className="font-bold text-text truncate block">
                      {formatExactDateTime(inspectedManifest.created_at)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-subtle block flex items-center gap-1">
                      <Layers className="size-3" />
                      Restorable Content
                    </span>
                    <span className="font-bold text-text">
                      {inspectedManifest.file_count} files (
                      {formatBytes(inspectedManifest.total_uncompressed_bytes)})
                    </span>
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-border/40 flex items-center gap-2 text-[11px] text-emerald-400">
                  <ShieldCheck className="size-4 shrink-0" />
                  <span>
                    Safe restore: An automatic snapshot of current saves in{' '}
                    <strong>{selectedProfileObj?.name || 'this profile'}</strong> will be recorded
                    before extraction.
                  </span>
                </div>
              </div>
            )}

            {/* Footer Buttons */}
            <div className="mt-2 flex items-center justify-end gap-2.5 pt-3 border-t border-border/80">
              <button
                type="button"
                onClick={onClose}
                disabled={isRestoring}
                className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-muted transition-colors hover:bg-surface hover:text-text cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleExecuteRestore()}
                disabled={isRestoring || isInspecting || !inspectedManifest}
                className="flex items-center gap-2 rounded-xl bg-accent px-5 py-2 text-xs font-bold text-white transition-all hover:bg-accent-hover disabled:opacity-50 cursor-pointer shadow-sm"
              >
                {isRestoring ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    <span>Restoring Files...</span>
                  </>
                ) : (
                  <>
                    <Upload className="size-3.5" />
                    <span>Restore Save Archive</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
