import { useEffect, useState } from 'react'
import { open as openFileDialog } from '@tauri-apps/plugin-dialog'
import { toast } from 'sonner'
import {
  CheckCircle2,
  FileCode2,
  FolderOpen,
  HardDrive,
  Loader2,
  RefreshCw,
  Save,
} from 'lucide-react'
import { Modal, ModalCloseButton } from '@/components/ui/modal'
import { useUpdateGameInstallation } from '../hooks/use-games'
import { computePathSize } from '@/services/import'
import { formatBytes, getParentPath } from '../utils/guess-name'
import type { Game } from '@/types/models'

interface InstallationEditorModalProps {
  game: Game
  open: boolean
  onClose: () => void
}

interface InstallationDraft {
  installPath: string
  executablePath: string
  sizeGb: string
}

function makeDraft(game: Game): InstallationDraft {
  return {
    installPath: game.install_path ?? '',
    executablePath: game.executable_path ?? '',
    sizeGb:
      game.install_size_bytes === null
        ? ''
        : String(Math.round((game.install_size_bytes / 1024 ** 3) * 100) / 100),
  }
}

function normalize(value: string): string | null {
  const trimmed = value.trim()
  return trimmed || null
}

/**
 * Manual local-install editor. The saved path is deliberately the source of
 * truth for Installed: adding either an install folder or executable puts a
 * catalog-only game in Installed; removing both returns it to the library.
 */
export function InstallationEditorModal({ game, open, onClose }: InstallationEditorModalProps) {
  const updateInstallation = useUpdateGameInstallation()
  const [draft, setDraft] = useState<InstallationDraft>(() => makeDraft(game))
  const [measuring, setMeasuring] = useState(false)

  useEffect(() => {
    if (open) setDraft(makeDraft(game))
  }, [game, open])

  const hasLocation = Boolean(normalize(draft.installPath) || normalize(draft.executablePath))

  async function measure(path: string) {
    if (!path.trim()) return
    setMeasuring(true)
    try {
      const bytes = await computePathSize(path)
      setDraft((current) => ({
        ...current,
        sizeGb: String(Math.round((bytes / 1024 ** 3) * 100) / 100),
      }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not measure that path.')
    } finally {
      setMeasuring(false)
    }
  }

  async function pickFolder() {
    let selected: string | string[] | null
    try {
      selected = await openFileDialog({ directory: true, multiple: false })
    } catch {
      return
    }
    if (typeof selected !== 'string') return
    setDraft((current) => ({ ...current, installPath: selected }))
    await measure(selected)
  }

  async function pickExecutable() {
    let selected: string | string[] | null
    try {
      selected = await openFileDialog({
        multiple: false,
        filters: [
          {
            name: 'Launchable Files (*.exe, *.bat, *.cmd, *.lnk)',
            extensions: ['exe', 'bat', 'cmd', 'lnk'],
          },
          { name: 'All Files (*.*)', extensions: ['*'] },
        ],
      })
    } catch {
      return
    }
    if (typeof selected !== 'string') return
    const parentPath = getParentPath(selected)
    setDraft((current) => ({
      ...current,
      executablePath: selected,
      installPath: current.installPath || parentPath,
    }))
    await measure(parentPath)
  }

  function save() {
    const size = draft.sizeGb.trim() === '' ? null : Number(draft.sizeGb)
    if (size !== null && (!Number.isFinite(size) || size < 0)) return

    updateInstallation.mutate(
      {
        id: game.id,
        install_path: normalize(draft.installPath),
        executable_path: normalize(draft.executablePath),
        install_size_bytes: size === null ? null : Math.round(size * 1024 ** 3),
      },
      { onSuccess: onClose },
    )
  }

  return (
    <Modal open={open} onClose={onClose} widthClassName="max-w-xl" hideCloseButton>
      <div className="overflow-hidden">
        <div className="border-b border-border bg-gradient-to-br from-accent/15 via-surface to-surface px-6 py-5">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-white shadow-[0_10px_24px_-10px_var(--nx-accent)]">
              <HardDrive className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-accent">
                Local installation
              </div>
              <h2 className="mt-1 text-lg font-semibold text-text">Edit installation details</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                A saved folder or executable automatically places this game in Installed.
              </p>
            </div>
            <ModalCloseButton onClick={onClose} aria-label="Close" />
          </div>
        </div>

        <div className="flex flex-col gap-4 p-6">
          <div
            className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs ${hasLocation ? 'border-emerald-500/25 bg-emerald-500/8 text-emerald-500' : 'border-border bg-surface-raised text-subtle'}`}
          >
            <CheckCircle2 className="size-4" />
            {hasLocation
              ? 'This game will appear in Installed after saving.'
              : 'No local path saved — this game stays outside Installed.'}
          </div>

          <PathField
            label="Installation folder"
            value={draft.installPath}
            placeholder="C:\\Games\\Example Game"
            icon={FolderOpen}
            onChange={(installPath) => setDraft((current) => ({ ...current, installPath }))}
            onBrowse={() => void pickFolder()}
          />
          <PathField
            label="Game executable"
            value={draft.executablePath}
            placeholder="C:\\Games\\Example Game\\Game.exe"
            icon={FileCode2}
            onChange={(executablePath) => setDraft((current) => ({ ...current, executablePath }))}
            onBrowse={() => void pickExecutable()}
          />

          <div className="rounded-xl border border-border bg-surface/60 p-3.5">
            <div className="flex items-center justify-between gap-3">
              <label className="min-w-0 flex-1">
                <span className="text-xs font-medium text-text">Installation size</span>
                <div className="mt-2 flex items-center rounded-lg border border-border bg-surface px-3 focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/10">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={draft.sizeGb}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, sizeGb: event.target.value }))
                    }
                    placeholder="0"
                    className="h-9 min-w-0 flex-1 bg-transparent text-sm text-text outline-none"
                  />
                  <span className="text-xs text-subtle">GB</span>
                </div>
              </label>
              <button
                type="button"
                onClick={() => void measure(draft.installPath || draft.executablePath)}
                disabled={measuring || !hasLocation}
                className="mt-5 flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-muted transition-colors hover:bg-surface-raised hover:text-text disabled:cursor-not-allowed disabled:opacity-50"
              >
                {measuring ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="size-3.5" />
                )}{' '}
                Measure
              </button>
            </div>
            <p className="mt-2 text-[11px] text-subtle">
              Enter a value manually or calculate it from the selected local folder.
            </p>
          </div>

          {(game.is_installed || hasLocation) && (
            <button
              type="button"
              onClick={() => setDraft({ installPath: '', executablePath: '', sizeGb: '' })}
              className="w-fit text-xs font-medium text-subtle transition-colors hover:text-rose-400"
            >
              Remove local installation record
            </button>
          )}

          <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
            <span className="text-xs text-subtle">
              {draft.sizeGb && Number.isFinite(Number(draft.sizeGb))
                ? `Saved size: ${formatBytes(Math.round(Number(draft.sizeGb) * 1024 ** 3))}`
                : 'Size is optional'}
            </span>
            <button
              type="button"
              onClick={save}
              disabled={updateInstallation.isPending || measuring}
              className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {updateInstallation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}{' '}
              Save installation
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

function PathField({
  label,
  value,
  placeholder,
  icon: Icon,
  onChange,
  onBrowse,
}: {
  label: string
  value: string
  placeholder: string
  icon: typeof FolderOpen
  onChange: (value: string) => void
  onBrowse: () => void
}) {
  return (
    <label className="block rounded-xl border border-border bg-surface/60 p-3.5">
      <span className="flex items-center gap-2 text-xs font-medium text-text">
        <Icon className="size-3.5 text-accent" />
        {label}
      </span>
      <div className="mt-2 flex gap-2">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 font-mono text-xs text-text outline-none transition-colors placeholder:font-sans placeholder:text-subtle focus:border-accent focus:ring-4 focus:ring-accent/10"
        />
        <button
          type="button"
          onClick={onBrowse}
          className="rounded-lg border border-border px-3 text-xs font-medium text-muted transition-colors hover:bg-surface-raised hover:text-text"
        >
          Browse
        </button>
      </div>
    </label>
  )
}
