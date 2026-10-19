import { useCallback, useEffect, useState } from 'react'
import {
  HardDrive,
  FolderOpen,
  History,
  RefreshCw,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Copy,
  FileCheck,
  Database,
  Archive,
  Upload,
  Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'
import type { Game, GameSaveDetails, DetectedSaveLocation } from '@/types/models'
import { useSaveManagerStore } from '@/store/save-manager-store'
import { useProfileStore } from '@/store/profile-store'
import * as saveService from '@/services/save-manager'
import { formatBytes } from '../utils/guess-name'
import { formatRelativeDate, formatExactDateTime } from '../utils/format'
import { cn } from '@/lib/utils'
import { GameSaveBackupModal } from './game-save-backup-modal'

interface GameSaveCardProps {
  game: Game
}

function normalizePathForFilter(p: string): string {
  return p
    .toLowerCase()
    .trim()
    .replace(/[/\\]+/g, '\\')
    .replace(/\\+$/, '')
}

function filterDuplicateCandidates(
  candidates: DetectedSaveLocation[],
  locations: Array<{ path: string; resolved_path?: string }>,
): DetectedSaveLocation[] {
  const trackedNormalized = new Set<string>()
  for (const loc of locations) {
    if (loc.path) trackedNormalized.add(normalizePathForFilter(loc.path))
    if (loc.resolved_path) trackedNormalized.add(normalizePathForFilter(loc.resolved_path))
  }

  return candidates.filter((c) => {
    const cNorm = normalizePathForFilter(c.path)
    if (trackedNormalized.has(cNorm)) {
      return false
    }
    for (const tracked of trackedNormalized) {
      if (cNorm.startsWith(`${tracked}\\`)) {
        return false
      }
    }
    return true
  })
}

export function GameSaveCard({ game }: GameSaveCardProps) {
  const activeProfile = useProfileStore((s) => s.activeProfile)
  const profiles = useProfileStore((s) => s.profiles)
  const openHistoryModal = useSaveManagerStore((s) => s.openHistoryModal)

  const [details, setDetails] = useState<GameSaveDetails | null>(null)
  const [detected, setDetected] = useState<DetectedSaveLocation[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isDetecting, setIsDetecting] = useState(false)
  const [customPathInput, setCustomPathInput] = useState('')
  const [showAddCustom, setShowAddCustom] = useState(false)
  const [showCloneModal, setShowCloneModal] = useState(false)
  const [selectedCloneProfile, setSelectedCloneProfile] = useState<string>('')
  const [showBackupModal, setShowBackupModal] = useState(false)
  const [backupModalTab, setBackupModalTab] = useState<'backup' | 'restore'>('backup')

  const handleOpenBackupModal = (tab: 'backup' | 'restore' = 'backup') => {
    setBackupModalTab(tab)
    setShowBackupModal(true)
  }

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true)
      const data = await saveService.getGameSaveDetails(game.id, activeProfile?.id)
      setDetails(data)

      // If no locations are configured yet, automatically run background save detection
      if (!data.locations || data.locations.length === 0) {
        const steamAppId = game.steam_app_id ? parseInt(game.steam_app_id, 10) : undefined
        const candidates = await saveService
          .detectGameSaves(game.id, game.name, steamAppId)
          .catch(() => [])
        setDetected(filterDuplicateCandidates(candidates, data.locations ?? []))
      }
    } catch (err) {
      console.error('Failed to load game save details:', err)
    } finally {
      setIsLoading(false)
    }
  }, [game.id, game.name, game.steam_app_id, activeProfile?.id])

  const handleApplyFromDatabase = async () => {
    try {
      setIsDetecting(true)
      const existingPaths = new Set(details?.locations.map((l) => l.path.toLowerCase()) ?? [])
      const prevEnabled = details?.locations.some((l) => l.is_enabled)

      const data = await saveService.applySaveLocationsFromDatabase(game.id)
      setDetails(data)

      const appliedLoc = data.locations.find((l) => l.is_enabled)
      const isSame = appliedLoc && existingPaths.has(appliedLoc.path.toLowerCase()) && prevEnabled

      if (isSame) {
        toast.info('Save location is already configured and up to date.')
      } else if (appliedLoc) {
        toast.success(`Applied verified save location: ${appliedLoc.path}`)
      } else {
        toast.success('Save locations from database applied and saved.')
      }

      const steamAppId = game.steam_app_id ? parseInt(game.steam_app_id, 10) : undefined
      const candidates = await saveService.detectGameSaves(game.id, game.name, steamAppId)
      setDetected(filterDuplicateCandidates(candidates, data.locations))
    } catch (err) {
      toast.error(typeof err === 'string' ? err : 'Failed to apply save locations from database.')
    } finally {
      setIsDetecting(false)
    }
  }

  const handleAutoDetect = async () => {
    try {
      setIsDetecting(true)
      const steamAppId = game.steam_app_id ? parseInt(game.steam_app_id, 10) : undefined
      const candidates = await saveService.detectGameSaves(game.id, game.name, steamAppId)
      const filtered = filterDuplicateCandidates(candidates, details?.locations ?? [])
      setDetected(filtered)
      if (filtered.length === 0) {
        toast.info('No additional save locations detected on disk.')
      } else {
        toast.success(`Found ${filtered.length} candidate save location(s).`)
      }
    } catch {
      toast.error('Failed to detect save locations.')
    } finally {
      setIsDetecting(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [loadData])

  const handleAddLocation = async (path: string) => {
    const trimmed = path.trim()
    if (!trimmed) return

    const trimmedNorm = normalizePathForFilter(trimmed)
    if (
      details?.locations.some(
        (l) =>
          normalizePathForFilter(l.path) === trimmedNorm ||
          (l.resolved_path && normalizePathForFilter(l.resolved_path) === trimmedNorm),
      )
    ) {
      toast.info('This save location is already tracked for this game.')
      setShowAddCustom(false)
      setCustomPathInput('')
      return
    }

    try {
      await saveService.configureSaveLocation(game.id, trimmed, 'save', true)
      toast.success('Save location added and enabled.')
      setShowAddCustom(false)
      setCustomPathInput('')
      setDetected((prev) =>
        filterDuplicateCandidates(prev, [
          ...(details?.locations ?? []),
          { path: trimmed, resolved_path: trimmed },
        ]),
      )
      await loadData()
    } catch (err) {
      toast.error(`Failed to add save location: ${String(err)}`)
    }
  }

  const handleToggleLocation = async (locationId: string, currentEnabled: boolean) => {
    try {
      await saveService.toggleSaveLocation(locationId, !currentEnabled)
      await loadData()
    } catch {
      toast.error('Failed to update location.')
    }
  }

  const handleRemoveLocation = async (locationId: string) => {
    try {
      await saveService.removeSaveLocation(locationId)
      toast.success('Save location removed.')
      await loadData()
    } catch (err) {
      toast.error(`Failed to remove location: ${String(err)}`)
    }
  }

  const handleOpenFolder = async (path?: string) => {
    try {
      const target = path || (details?.locations[0]?.resolved_path ?? '')
      if (!target) {
        toast.info('Configure or detect a save folder first.')
        return
      }
      await saveService.openSaveFolder(target)
    } catch (err) {
      toast.error(`Could not open folder: ${String(err)}`)
    }
  }

  const handleCloneSave = async () => {
    if (!selectedCloneProfile || !activeProfile) return
    try {
      await saveService.cloneProfileSave(game.id, selectedCloneProfile, activeProfile.id)
      toast.success('Save successfully cloned into current profile.')
      setShowCloneModal(false)
      await loadData()
    } catch (err) {
      toast.error(`Failed to clone save: ${String(err)}`)
    }
  }

  const otherProfiles = profiles.filter((p) => p.id !== activeProfile?.id)
  const activeLocationsCount = details?.locations?.filter((l) => l.is_enabled).length ?? 0

  return (
    <div className="flex flex-col gap-4">
      {/* ── BOX 1: Save Vault & Backup Command Center (Clean Multi-Row Layout) ── */}
      <section className="flex flex-col gap-3.5 rounded-2xl border border-border/80 bg-surface-raised/85 p-4 shadow-sm">
        {/* Row 1: Identity & Status Pill */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-accent/25 bg-accent/15 text-accent shadow-2xs">
              <HardDrive className="size-4.5" />
            </div>
            <div className="min-w-0">
              <h4 className="text-xs font-bold text-text truncate">Save Vault &amp; Backup</h4>
              <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-subtle truncate">
                <span>Profile:</span>
                <span className="font-semibold text-text truncate">
                  {activeProfile?.name || 'Default'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {details?.is_managed ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/35 bg-emerald-500/12 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-400">
                <CheckCircle2 className="size-3" />
                <span>Managed</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-amber-400">
                <AlertCircle className="size-3" />
                <span>Unmanaged</span>
              </span>
            )}

            <button
              type="button"
              onClick={() => void loadData()}
              disabled={isLoading}
              title="Refresh save status"
              className="flex size-7 items-center justify-center rounded-lg border border-border bg-surface text-muted transition-colors hover:border-accent/40 hover:text-text cursor-pointer"
            >
              <RefreshCw className={cn('size-3.5', isLoading && 'animate-spin text-accent')} />
            </button>
          </div>
        </div>

        {/* Row 2: Save Telemetry Strip (3 Equal Mini-Cards) */}
        <div className="grid grid-cols-3 gap-2">
          <div className="flex flex-col rounded-xl border border-border/70 bg-surface/80 px-3 py-2">
            <span className="text-[10px] font-medium text-subtle">Save Size</span>
            <span className="mt-0.5 font-mono text-xs font-bold text-text">
              {details && details.save_size_bytes > 0
                ? formatBytes(details.save_size_bytes)
                : '0 B'}
            </span>
          </div>

          <div className="flex flex-col rounded-xl border border-border/70 bg-surface/80 px-3 py-2">
            <span className="text-[10px] font-medium text-subtle">Tracked Files</span>
            <span className="mt-0.5 font-mono text-xs font-bold text-text">
              {details?.file_count ?? 0} files
            </span>
          </div>

          <div className="flex flex-col rounded-xl border border-border/70 bg-surface/80 px-3 py-2">
            <span className="text-[10px] font-medium text-subtle">Last Synced</span>
            <span
              className="mt-0.5 truncate text-xs font-semibold text-text"
              title={
                details?.last_synced_at ? formatExactDateTime(details.last_synced_at) : 'Not synced yet'
              }
            >
              {details?.last_synced_at ? formatRelativeDate(details.last_synced_at) : 'Ready'}
            </span>
          </div>
        </div>

        {/* Row 3: Primary Backup, Restore & Snapshots Action Bar */}
        <div className="grid grid-cols-2 gap-2 pt-0.5 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => handleOpenBackupModal('backup')}
            title="Export game saves to a compressed .zip archive"
            className="flex items-center justify-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-xs font-semibold text-white shadow-xs transition-all hover:bg-accent-hover active:scale-98 cursor-pointer"
          >
            <Archive className="size-3.5 shrink-0" />
            <span>Backup (.zip)</span>
          </button>

          <button
            type="button"
            onClick={() => handleOpenBackupModal('restore')}
            title="Restore game saves from a .zip backup archive"
            className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-2 text-xs font-semibold text-text transition-all hover:border-accent/40 hover:bg-surface-raised active:scale-98 cursor-pointer"
          >
            <Upload className="size-3.5 shrink-0 text-emerald-400" />
            <span>Restore (.zip)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (details?.is_managed) {
                openHistoryModal(game.id)
              } else {
                void handleOpenFolder()
              }
            }}
            title={details?.is_managed ? 'View automatic save snapshots' : 'Open save folder'}
            className="col-span-2 sm:col-span-1 flex items-center justify-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-2 text-xs font-semibold text-text transition-all hover:border-accent/40 hover:bg-surface-raised active:scale-98 cursor-pointer"
          >
            {details?.is_managed ? (
              <>
                <History className="size-3.5 shrink-0 text-accent" />
                <span>Snapshots</span>
              </>
            ) : (
              <>
                <FolderOpen className="size-3.5 shrink-0 text-accent" />
                <span>Open Folder</span>
              </>
            )}
          </button>
        </div>
      </section>

      {/* ── BOX 2: Save Locations & Smart Database Detector ───────────── */}
      <section className="flex flex-col gap-3 rounded-2xl border border-border/80 bg-surface-raised/85 p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <FileCheck className="size-4 text-accent shrink-0" />
            <span className="text-xs font-bold text-text truncate">Tracked Save Paths</span>
            {details?.locations && details.locations.length > 0 && (
              <span className="rounded-md border border-border/70 bg-surface px-1.5 py-0.5 font-mono text-[10px] font-semibold text-accent">
                {activeLocationsCount}/{details.locations.length}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => void handleApplyFromDatabase()}
              disabled={isDetecting}
              title="Auto-detect & apply verified save path from PC game save database"
              className="flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-1 text-[11px] font-semibold text-accent transition-colors hover:bg-accent hover:text-white cursor-pointer"
            >
              <Database className={cn('size-3', isDetecting && 'animate-spin')} />
              <span>Auto-Detect DB</span>
            </button>

            <button
              type="button"
              onClick={() => void handleAutoDetect()}
              disabled={isDetecting}
              title="Deep-scan local disk folders for save files"
              className="flex size-7 items-center justify-center rounded-lg border border-border bg-surface text-muted hover:border-accent/40 hover:text-text transition-colors cursor-pointer"
            >
              <Sparkles className={cn('size-3.5', isDetecting && 'animate-spin text-accent')} />
            </button>

            <button
              type="button"
              onClick={() => setShowAddCustom(!showAddCustom)}
              title="Add custom save directory manually"
              className={cn(
                'flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold transition-colors cursor-pointer',
                showAddCustom
                  ? 'border-accent bg-accent text-white'
                  : 'border-border bg-surface text-text hover:border-accent/40',
              )}
            >
              <Plus className="size-3" />
              <span>Custom</span>
            </button>
          </div>
        </div>

        {/* Add Custom Save Path Input */}
        {showAddCustom && (
          <div className="flex flex-col gap-2 rounded-xl border border-accent/35 bg-surface p-3">
            <span className="text-[11px] font-semibold text-text">
              Enter Save Directory or File Path:
            </span>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="%USERPROFILE%\Saved Games\..."
                value={customPathInput}
                onChange={(e) => setCustomPathInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && customPathInput.trim()) {
                    void handleAddLocation(customPathInput.trim())
                  }
                }}
                className="flex-1 rounded-lg border border-border bg-bg px-3 py-1.5 text-xs text-text placeholder:text-subtle focus:border-accent focus:outline-none"
              />
              <button
                type="button"
                onClick={() => void handleAddLocation(customPathInput.trim())}
                disabled={!customPathInput.trim()}
                className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white transition-opacity disabled:opacity-50 hover:bg-accent-hover cursor-pointer"
              >
                Add
              </button>
            </div>
            <span className="text-[10px] text-subtle">
              Supports %USERPROFILE%, %APPDATA%, %LOCALAPPDATA%, %DOCUMENTS%
            </span>
          </div>
        )}

        {/* Configured Locations List */}
        {details?.locations && details.locations.length > 0 ? (
          <div className="flex flex-col gap-2">
            {details.locations.map((loc) => (
              <div
                key={loc.id}
                className={cn(
                  'flex flex-col gap-2 rounded-xl border p-3 transition-colors',
                  loc.is_enabled
                    ? 'border-border/85 bg-surface/85'
                    : 'border-border/40 bg-surface/35 opacity-70',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span
                      className={cn(
                        'size-2 rounded-full shrink-0',
                        loc.exists
                          ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]'
                          : 'bg-amber-400',
                      )}
                      title={loc.exists ? 'Folder exists on disk' : 'Folder not created yet'}
                    />
                    <span
                      className="truncate font-mono text-xs font-semibold text-text select-all"
                      title={loc.resolved_path || loc.path}
                    >
                      {loc.path}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => void handleOpenFolder(loc.resolved_path)}
                      title="Open in Windows Explorer"
                      className="flex size-7 items-center justify-center rounded-lg border border-border/70 bg-surface-raised text-muted transition-colors hover:text-accent cursor-pointer"
                    >
                      <FolderOpen className="size-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleToggleLocation(loc.id, loc.is_enabled)}
                      className={cn(
                        'h-7 rounded-lg border px-2 text-[10px] font-semibold transition-colors cursor-pointer',
                        loc.is_enabled
                          ? 'border-emerald-500/35 bg-emerald-500/12 text-emerald-400'
                          : 'border-border bg-surface text-subtle hover:text-text',
                      )}
                    >
                      {loc.is_enabled ? 'Active' : 'Paused'}
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleRemoveLocation(loc.id)}
                      title="Remove save path"
                      className="flex size-7 items-center justify-center rounded-lg border border-border/70 bg-surface-raised text-rose-400 transition-colors hover:border-rose-500/40 hover:bg-rose-500/10 cursor-pointer"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>

                {loc.resolved_path && loc.resolved_path !== loc.path && (
                  <div className="truncate rounded-lg bg-surface-raised/60 px-2.5 py-1 font-mono text-[10px] text-subtle select-all">
                    {loc.resolved_path}
                  </div>
                )}

                <div className="flex items-center justify-between border-t border-border/40 pt-1.5 text-[10px] text-subtle">
                  <span>
                    Source:{' '}
                    <strong className="font-medium text-text/80">
                      {loc.detection_source === 'heuristic'
                        ? 'Verified Save DB'
                        : loc.detection_source}
                    </strong>
                  </span>
                  <span className={loc.exists ? 'text-emerald-400 font-medium' : 'text-amber-400'}>
                    {loc.exists ? '✓ Verified on Disk' : '⚠ Created on First Save'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border/80 bg-surface/50 p-4 text-center">
            <span className="text-xs font-semibold text-text block">
              No Save Path Configured Yet
            </span>
            <p className="mt-1 text-[11px] text-subtle leading-relaxed">
              Click <strong className="text-text">Auto-Detect DB</strong> to configure the verified
              save directory for {game.name}, or add a custom folder.
            </p>
            <div className="mt-3 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => void handleApplyFromDatabase()}
                disabled={isDetecting}
                className="flex items-center gap-1.5 rounded-xl bg-accent px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-accent-hover disabled:opacity-50 cursor-pointer"
              >
                <Database className={cn('size-3.5', isDetecting && 'animate-spin')} />
                <span>Auto-Configure Save Path</span>
              </button>
            </div>
          </div>
        )}

        {/* Detected Candidate Suggestions */}
        {detected.length > 0 && (
          <div className="border-t border-border/60 pt-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-semibold text-text">
                Detected Save Candidates ({detected.length})
              </span>
              <span className="text-[10px] text-subtle">Click Track to enable</span>
            </div>
            <div className="flex flex-col gap-1.5">
              {detected.slice(0, 5).map((d, i) => (
                <div
                  key={`${d.path}_${i}`}
                  className={cn(
                    'flex items-center justify-between gap-2 rounded-xl border p-2.5 transition-colors',
                    d.exists && d.confidence >= 90
                      ? 'border-emerald-500/40 bg-emerald-500/8'
                      : 'border-border/70 bg-surface/60',
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-[11px] font-medium text-text">
                      {d.path}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <span className="rounded bg-accent/15 px-1.5 py-0.2 font-mono text-[9px] font-semibold text-accent">
                        {d.confidence}% match
                      </span>
                      {d.exists && (
                        <span className="rounded bg-emerald-500/15 px-1.5 py-0.2 text-[9px] font-semibold text-emerald-400">
                          Found on disk
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleAddLocation(d.path)}
                    className="shrink-0 rounded-lg border border-accent/40 bg-accent/15 px-2.5 py-1 text-[10.5px] font-semibold text-accent hover:bg-accent hover:text-white transition-colors cursor-pointer"
                  >
                    Track
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quick Utility Footer: Open Folder & Clone Between Profiles */}
        <div className="flex items-center justify-between gap-2 border-t border-border/50 pt-2.5">
          <button
            type="button"
            onClick={() => void handleOpenFolder()}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-surface py-1.5 text-[11px] font-semibold text-text hover:border-accent/40 hover:text-accent transition-colors cursor-pointer"
          >
            <FolderOpen className="size-3.5 text-accent" />
            <span>Open Save Folder</span>
          </button>

          {otherProfiles.length > 0 && (
            <button
              type="button"
              onClick={() => setShowCloneModal(true)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-surface py-1.5 text-[11px] font-semibold text-text hover:border-accent/40 hover:text-accent transition-colors cursor-pointer"
            >
              <Copy className="size-3.5 text-violet-400" />
              <span>Clone From Profile</span>
            </button>
          )}
        </div>
      </section>

      {/* Clone Save Modal */}
      {showCloneModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface-raised p-5 shadow-2xl">
            <div className="flex items-center gap-2 mb-3">
              <Copy className="size-5 text-accent" />
              <h3 className="text-sm font-bold text-text">Clone Save to Current Profile</h3>
            </div>
            <p className="text-xs text-subtle mb-4 leading-relaxed">
              Copy verified save data from another profile into{' '}
              <strong className="text-text">{activeProfile?.name}</strong>. Existing saves will be
              backed up safely before replacing.
            </p>

            <div className="flex flex-col gap-2 mb-4">
              <span className="text-[11px] font-bold text-text">Select Source Profile:</span>
              <select
                value={selectedCloneProfile}
                onChange={(e) => setSelectedCloneProfile(e.target.value)}
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-text focus:border-accent focus:outline-none"
              >
                <option value="">-- Choose Profile --</option>
                {otherProfiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCloneModal(false)}
                className="rounded-xl border border-border px-4 py-1.5 text-xs font-semibold text-muted hover:text-text hover:bg-surface"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleCloneSave()}
                disabled={!selectedCloneProfile}
                className="rounded-xl bg-accent px-4 py-1.5 text-xs font-bold text-white transition-opacity disabled:opacity-50 hover:bg-accent-hover"
              >
                Clone Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Game Save Backup & Restore Modal (.zip) */}
      <GameSaveBackupModal
        game={game}
        open={showBackupModal}
        defaultTab={backupModalTab}
        onClose={() => setShowBackupModal(false)}
        onSuccess={() => void loadData()}
      />
    </div>
  )
}
