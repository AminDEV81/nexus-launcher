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
} from 'lucide-react'
import { toast } from 'sonner'
import type { Game, GameSaveDetails, DetectedSaveLocation } from '@/types/models'
import { useSaveManagerStore } from '@/store/save-manager-store'
import { useProfileStore } from '@/store/profile-store'
import * as saveService from '@/services/save-manager'
import { formatBytes } from '../utils/guess-name'
import { formatRelativeDate, formatExactDateTime } from '../utils/format'
import { cn } from '@/lib/utils'

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

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true)
      const data = await saveService.getGameSaveDetails(game.id, activeProfile?.id)
      setDetails(data)
    } catch (err) {
      console.error('Failed to load game save details:', err)
    } finally {
      setIsLoading(false)
    }
  }, [game.id, activeProfile?.id])

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
        toast.info('No new save locations detected automatically.')
      } else {
        toast.success(`Found ${filtered.length} candidate save locations.`)
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
      toast.info('This save location is already added for this game.')
      setShowAddCustom(false)
      setCustomPathInput('')
      return
    }

    try {
      await saveService.configureSaveLocation(game.id, trimmed, 'save', true)
      toast.success('Save location added successfully.')
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
      if (!target) return
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

  return (
    <div className="flex flex-col gap-4">
      {/* ── Status Header Card ────────────────────────────────────────── */}
      <section className="rounded-2xl border border-border/80 bg-surface-raised/80 p-4 shadow-sm">
        <div className="flex items-start justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent border border-accent/20">
              <HardDrive className="size-4.5" />
            </div>
            <div className="min-w-0">
              <h4 className="text-xs font-bold text-text">Save Data Isolation</h4>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <span
                  className="text-[11px] text-subtle truncate max-w-[140px]"
                  title={activeProfile?.name}
                >
                  Profile:{' '}
                  <span className="font-semibold text-text">
                    {activeProfile?.name || 'Default'}
                  </span>
                </span>
                <span className="text-subtle text-[10px]">•</span>
                {details?.is_managed ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                    <CheckCircle2 className="size-3" />
                    Managed
                  </span>
                ) : (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5 text-[10px] font-medium text-subtle">
                    <AlertCircle className="size-3" />
                    Unmanaged
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
            <button
              type="button"
              onClick={() => void loadData()}
              disabled={isLoading}
              title="Refresh save status"
              className="flex size-8 items-center justify-center rounded-xl border border-border bg-surface text-muted transition-colors hover:text-text hover:bg-surface-raised cursor-pointer"
            >
              <RefreshCw className={cn('size-3.5', isLoading && 'animate-spin')} />
            </button>

            {details?.is_managed && (
              <button
                type="button"
                onClick={() => openHistoryModal(game.id)}
                title="View save snapshots"
                className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-2.5 py-1.5 text-xs font-semibold text-text transition-colors hover:bg-surface-raised hover:border-accent/40 cursor-pointer"
              >
                <History className="size-3.5 text-accent" />
                <span>Snapshots</span>
              </button>
            )}
          </div>
        </div>

        {/* Save Metrics */}
        {details?.is_managed && (
          <div className="mt-3.5 grid grid-cols-3 gap-2 border-t border-border/60 pt-3">
            <div className="flex flex-col">
              <span className="text-[10px] font-medium text-subtle">Save Size</span>
              <span className="text-xs font-bold text-text">
                {details.save_size_bytes > 0 ? formatBytes(details.save_size_bytes) : '0 B'}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-medium text-subtle">Total Files</span>
              <span className="text-xs font-bold text-text">{details.file_count} files</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-medium text-subtle">Last Synchronized</span>
              <span
                className="text-xs font-bold text-text truncate"
                title={
                  details.last_synced_at ? formatExactDateTime(details.last_synced_at) : 'Never'
                }
              >
                {details.last_synced_at ? formatRelativeDate(details.last_synced_at) : 'Never'}
              </span>
            </div>
          </div>
        )}
      </section>

      {/* ── Managed Save Locations ────────────────────────────────────── */}
      <section className="rounded-2xl border border-border/80 bg-surface-raised/80 p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <FileCheck className="size-4 text-accent shrink-0" />
            <span className="text-xs font-bold text-text truncate">Save Locations</span>
            {details?.locations && details.locations.length > 0 && (
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md bg-surface text-muted border border-border/60">
                {details.locations.filter((l) => l.is_enabled).length}/{details.locations.length}
              </span>
            )}
          </div>

          {/* Clean, un-cramped toolbar that fits sidebar width */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleApplyFromDatabase}
              disabled={isDetecting}
              title="Apply verified save path from 19,000+ PC games database"
              className="flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-1 text-[11px] font-semibold text-accent transition-colors hover:bg-accent hover:text-white cursor-pointer"
            >
              <Database className={cn('size-3.5', isDetecting && 'animate-spin')} />
              <span>Database</span>
            </button>

            <button
              type="button"
              onClick={handleAutoDetect}
              disabled={isDetecting}
              title="Scan disk for candidate save folders"
              className="flex size-7 items-center justify-center rounded-lg border border-border bg-surface text-text hover:bg-surface-raised hover:border-accent/40 transition-colors cursor-pointer"
            >
              <RefreshCw className={cn('size-3.5', isDetecting && 'animate-spin')} />
            </button>

            <button
              type="button"
              onClick={() => setShowAddCustom(!showAddCustom)}
              title="Add custom save folder or file path manually"
              className={cn(
                'flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold transition-colors cursor-pointer',
                showAddCustom
                  ? 'border-accent bg-accent text-white'
                  : 'border-border bg-surface text-text hover:bg-surface-raised hover:border-accent/40',
              )}
            >
              <Plus className="size-3.5" />
              <span>Path</span>
            </button>
          </div>
        </div>

        {/* Add custom path input */}
        {showAddCustom && (
          <div className="mb-3 flex flex-col gap-2 rounded-xl border border-accent/30 bg-surface/80 p-3 animate-in fade-in duration-150">
            <span className="text-[11px] font-bold text-text">
              Enter Save Directory or File Path:
            </span>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="%USERPROFILE%\Saved Games\..."
                value={customPathInput}
                onChange={(e) => setCustomPathInput(e.target.value)}
                className="flex-1 rounded-lg border border-border bg-bg px-3 py-1.5 text-xs text-text placeholder:text-subtle focus:border-accent focus:outline-none"
              />
              <button
                type="button"
                onClick={() => void handleAddLocation(customPathInput.trim())}
                disabled={!customPathInput.trim()}
                className="rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-white transition-opacity disabled:opacity-50 hover:bg-accent-hover cursor-pointer"
              >
                Save
              </button>
            </div>
            <span className="text-[10px] text-subtle">
              Supports %USERPROFILE%, %APPDATA%, %LOCALAPPDATA%, %DOCUMENTS%
            </span>
          </div>
        )}

        {/* Locations List */}
        {details?.locations && details.locations.length > 0 ? (
          <div className="flex flex-col gap-2">
            {details.locations.map((loc) => (
              <div
                key={loc.id}
                className={cn(
                  'flex flex-col gap-1.5 rounded-xl border p-2.5 transition-colors',
                  loc.is_enabled
                    ? 'border-border/80 bg-surface/70'
                    : 'border-border/40 bg-surface/30 opacity-70',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span
                        className={cn(
                          'size-2 rounded-full shrink-0',
                          loc.exists
                            ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]'
                            : 'bg-amber-500',
                        )}
                        title={loc.exists ? 'Folder exists on disk' : 'Folder not created yet'}
                      />
                      <span className="text-xs font-mono font-bold text-text truncate select-all">
                        {loc.path}
                      </span>
                    </div>
                    <span className="text-[10px] text-subtle truncate block font-mono pl-4">
                      {loc.resolved_path}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => void handleOpenFolder(loc.resolved_path)}
                      title="Open in Windows Explorer"
                      className="flex size-7 items-center justify-center rounded-lg border border-border/60 bg-surface text-muted transition-colors hover:text-text hover:bg-surface-raised cursor-pointer"
                    >
                      <FolderOpen className="size-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleToggleLocation(loc.id, loc.is_enabled)}
                      title={
                        loc.is_enabled
                          ? 'Tracking active — click to disable'
                          : 'Tracking disabled — click to enable'
                      }
                      className={cn(
                        'h-7 px-2.5 rounded-lg text-[10px] font-bold border transition-colors cursor-pointer',
                        loc.is_enabled
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20'
                          : 'border-border bg-surface text-subtle hover:text-text',
                      )}
                    >
                      {loc.is_enabled ? 'Active' : 'Disabled'}
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleRemoveLocation(loc.id)}
                      title="Remove location"
                      className="flex size-7 items-center justify-center rounded-lg border border-border/60 bg-surface text-rose-400 transition-colors hover:bg-rose-500/10 hover:border-rose-500/30 cursor-pointer"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1 text-[10px] text-subtle border-t border-border/40 pl-4">
                  <span>
                    Source:{' '}
                    {loc.detection_source === 'heuristic'
                      ? 'Database Heuristic'
                      : loc.detection_source}
                  </span>
                  <span>{loc.exists ? '✓ Exists on disk' : '⚠ Waiting for creation'}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border/80 bg-surface/40 p-5 text-center">
            <span className="text-xs font-semibold text-text block mb-1">
              No Save Locations Configured
            </span>
            <p className="text-[11px] text-subtle leading-relaxed mb-4 max-w-md mx-auto">
              Save locations for this game are not currently configured. You can automatically set
              them from the database of 19,000+ PC games or add a custom folder manually.
            </p>
            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={handleApplyFromDatabase}
                disabled={isDetecting}
                className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-1.5 text-xs font-bold text-white shadow-sm transition-opacity hover:bg-accent-hover disabled:opacity-50"
              >
                <Database className={cn('size-3.5', isDetecting && 'animate-spin')} />
                <span>Apply from Database</span>
              </button>
              <button
                type="button"
                onClick={() => setShowAddCustom(true)}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3.5 py-1.5 text-xs font-semibold text-text hover:bg-surface-raised"
              >
                <Plus className="size-3.5" />
                <span>Add Custom Path</span>
              </button>
            </div>
          </div>
        )}

        {/* Detected Suggestions */}
        {detected.length > 0 && (
          <div className="mt-3 border-t border-border/60 pt-3">
            <span className="text-[11px] font-bold text-text mb-2 block">
              Detected Suggestions:
            </span>
            <div className="flex flex-col gap-1.5">
              {detected.map((d, i) => (
                <div
                  key={i}
                  className={cn(
                    'flex items-center justify-between gap-2 rounded-lg border p-2 transition-colors',
                    d.exists && d.confidence >= 90
                      ? 'border-emerald-500/40 bg-emerald-500/5'
                      : 'border-border/60 bg-surface/40',
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-text font-medium truncate">{d.path}</span>
                      <span className="rounded-sm bg-accent/15 px-1 py-0.2 text-[9px] font-bold text-accent">
                        {d.confidence}% match
                      </span>
                      {d.exists && (
                        <span className="rounded-sm bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold text-emerald-400">
                          Found on disk
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleAddLocation(d.path)}
                    className="rounded-md bg-accent/20 border border-accent/30 px-2 py-1 text-[10px] font-bold text-accent hover:bg-accent hover:text-white transition-colors"
                  >
                    Track
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ── Profile Save Actions ──────────────────────────────────────── */}
      {details?.is_managed && (
        <section className="rounded-2xl border border-border/80 bg-surface-raised/80 p-4 shadow-sm">
          <span className="text-xs font-bold text-text mb-3 block">Profile Save Actions</span>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => void handleOpenFolder()}
              className="flex items-center justify-center gap-2 rounded-xl border border-border bg-surface p-2.5 text-xs font-bold text-text transition-all hover:bg-surface-raised hover:border-accent/40"
            >
              <FolderOpen className="size-4 text-accent" />
              <span>Open Save Folder</span>
            </button>

            <button
              type="button"
              onClick={() => setShowCloneModal(true)}
              disabled={otherProfiles.length === 0}
              className="flex items-center justify-center gap-2 rounded-xl border border-border bg-surface p-2.5 text-xs font-bold text-text transition-all hover:bg-surface-raised hover:border-accent/40 disabled:opacity-50"
            >
              <Copy className="size-4 text-violet-400" />
              <span>Copy from Profile</span>
            </button>
          </div>
        </section>
      )}

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
    </div>
  )
}
