import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { open as openFileDialog } from '@tauri-apps/plugin-dialog'
import {
  ArrowLeft,
  Check,
  ChevronRight,
  ChevronDown,
  FileCode2,
  FolderOpen,
  HardDrive,
  Link2,
  Loader2,
  Sparkles,
  Terminal,
  SlidersHorizontal,
  FolderSearch,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/modal'
import { ModalCloseButton } from '@/components/ui/modal-close-button'
import { cn } from '@/lib/utils'
import { useAddGameModalStore } from '../store/add-game-modal-store'
import { useCreateGame } from '../hooks/use-games'
import { resolveShortcut, scanFolderForExecutables, computePathSize } from '@/services/import'
import type { ExecutableCandidate } from '@/services/import'
import { guessNameFromPath, getParentPath, formatBytes } from '../utils/guess-name'
import { useAnimationSpeed } from '@/hooks/use-animation-speed'

type Step = 'choose' | 'review'

interface DraftGame {
  name: string
  executablePath: string | null
  installPath: string | null
  installSizeBytes: number | null
  launchArguments: string | null
  candidates: ExecutableCandidate[]
}

const EMPTY_DRAFT: DraftGame = {
  name: '',
  executablePath: null,
  installPath: null,
  installSizeBytes: null,
  launchArguments: null,
  candidates: [],
}

export function AddGameModal() {
  const { isOpen, prefill, close } = useAddGameModalStore()
  const createGame = useCreateGame()
  const speed = useAnimationSpeed()

  const [step, setStep] = useState<Step>('choose')
  const [isResolving, setIsResolving] = useState(false)
  const [draft, setDraft] = useState<DraftGame>(EMPTY_DRAFT)
  const [showAdvanced, setShowAdvanced] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setStep('choose')
    setDraft(EMPTY_DRAFT)
    setShowAdvanced(false)

    if (prefill?.kind === 'executable') void processExecutable(prefill.path)
    else if (prefill?.kind === 'shortcut') void processShortcut(prefill.path)
    else if (prefill?.kind === 'folder') void processFolder(prefill.path)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, prefill])

  async function processExecutable(path: string) {
    setIsResolving(true)
    const installPath = getParentPath(path)
    const installSizeBytes = await computePathSize(installPath).catch(() => null)
    setDraft({
      ...EMPTY_DRAFT,
      name: guessNameFromPath(path),
      executablePath: path,
      installPath,
      installSizeBytes,
    })
    setStep('review')
    setIsResolving(false)
  }

  async function processShortcut(path: string) {
    setIsResolving(true)
    try {
      const resolved = await resolveShortcut(path)
      if (!resolved.target_path) {
        toast.error('Could not resolve that shortcut to a valid target.')
        return
      }
      const installPath = resolved.working_dir ?? getParentPath(resolved.target_path)
      const installSizeBytes = await computePathSize(installPath).catch(() => null)
      setDraft({
        ...EMPTY_DRAFT,
        name: guessNameFromPath(path),
        executablePath: resolved.target_path,
        installPath,
        installSizeBytes,
        launchArguments: resolved.arguments,
      })
      setStep('review')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not read that shortcut.')
    } finally {
      setIsResolving(false)
    }
  }

  async function processFolder(path: string) {
    setIsResolving(true)
    try {
      const candidates = await scanFolderForExecutables(path)
      if (candidates.length === 0) {
        toast.error('No executable binary (.exe) was found in that directory.')
        return
      }
      const installSizeBytes = await computePathSize(path).catch(() => null)
      setDraft({
        ...EMPTY_DRAFT,
        name: guessNameFromPath(path),
        installPath: path,
        installSizeBytes,
        executablePath: candidates.length === 1 ? candidates[0].path : null,
        candidates: candidates.length === 1 ? [] : candidates,
      })
      setStep('review')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not scan that folder.')
    } finally {
      setIsResolving(false)
    }
  }

  async function pickExecutable() {
    try {
      const path = await openFileDialog({
        multiple: false,
        filters: [
          {
            name: 'Launchable Binaries (*.exe, *.bat, *.cmd, *.lnk)',
            extensions: ['exe', 'bat', 'cmd', 'lnk'],
          },
          { name: 'All Files (*.*)', extensions: ['*'] },
        ],
      })
      if (typeof path === 'string') void processExecutable(path)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not open file picker.')
    }
  }

  async function pickShortcut() {
    try {
      const path = await openFileDialog({
        multiple: false,
        filters: [{ name: 'Windows Shortcut', extensions: ['lnk'] }],
      })
      if (typeof path === 'string') void processShortcut(path)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not open file picker.')
    }
  }

  async function pickFolder() {
    try {
      const path = await openFileDialog({ directory: true, multiple: false })
      if (typeof path === 'string') void processFolder(path)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not open folder picker.')
    }
  }

  function startManualEntry() {
    setDraft({
      ...EMPTY_DRAFT,
      name: 'Custom Game Title',
      executablePath: '',
      installPath: '',
    })
    setStep('review')
    setShowAdvanced(true)
  }

  function confirm() {
    if (!draft.executablePath?.trim() || !draft.name.trim()) return
    createGame.mutate(
      {
        name: draft.name.trim(),
        executable_path: draft.executablePath.trim(),
        install_path: draft.installPath?.trim() || null,
        install_size_bytes: draft.installSizeBytes,
        launch_arguments: draft.launchArguments?.trim() || null,
      },
      {
        onSuccess: (game) => {
          toast.success(`${game.name} has been added to your library!`)
          close()
        },
      },
    )
  }

  return (
    <Modal open={isOpen} onClose={close} hideCloseButton widthClassName="max-w-2xl">
      <div className="relative overflow-hidden bg-surface">
        {/* ── Holographic Mecha Header ──────────────────────────────────────── */}
        <div className="relative border-b border-border/80 bg-gradient-to-br from-accent/15 via-surface-raised/60 to-surface px-6 sm:px-8 py-5">
          {/* Volumetric Ambient Glow */}
          <div
            className="pointer-events-none absolute -right-12 -top-16 size-48 rounded-full blur-3xl opacity-30"
            style={{ backgroundColor: 'var(--nx-accent)' }}
          />

          {/* Micro Matrix Grid Overlay */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:14px_14px] opacity-40" />

          <div className="relative flex items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <span className="relative flex size-11 items-center justify-center rounded-2xl bg-accent text-white shadow-[0_0_16px_var(--nx-accent)]/30 ring-2 ring-accent/30">
                <Sparkles className="size-5" />
              </span>
              <div>
                <div className="flex items-center gap-2 font-mono text-[9.5px] font-bold uppercase tracking-widest text-accent">
                  <span>IMPORT ENGINE</span>
                  <span className="size-1 rounded-full bg-accent animate-ping" />
                  <span className="text-muted font-normal">
                    {step === 'choose' ? 'STAGE 01 // SOURCE' : 'STAGE 02 // STAGING'}
                  </span>
                </div>
                <h2 className="text-xl font-black tracking-tight text-text">
                  {step === 'choose' ? 'Add Game to Library' : 'Configure Game Details'}
                </h2>
              </div>
            </div>

            {/* Stepper Dots & Close Button */}
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-border/70 bg-surface/80 px-3 py-1 font-mono text-[10px] font-bold shadow-2xs">
                <span
                  className={cn(
                    'size-2 rounded-full transition-colors',
                    step === 'choose'
                      ? 'bg-accent shadow-[0_0_6px_var(--nx-accent)]'
                      : 'bg-emerald-500',
                  )}
                />
                <span className={step === 'choose' ? 'text-accent' : 'text-text'}>01 Source</span>
                <span className="h-px w-3 bg-border mx-0.5" />
                <span
                  className={cn(
                    'size-2 rounded-full transition-colors',
                    step === 'review'
                      ? 'bg-accent shadow-[0_0_6px_var(--nx-accent)]'
                      : 'bg-muted/40',
                  )}
                />
                <span className={step === 'review' ? 'text-accent' : 'text-muted'}>02 Config</span>
              </div>

              <ModalCloseButton onClick={close} />
            </div>
          </div>
        </div>

        {/* ── Main Body ──────────────────────────────────────────────────────── */}
        <div className="min-h-[380px] p-6 sm:p-7">
          <AnimatePresence mode="wait">
            {step === 'choose' ? (
              <motion.div
                key="choose"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 * speed }}
              >
                <ChooseStep
                  onExecutable={pickExecutable}
                  onShortcut={pickShortcut}
                  onFolder={pickFolder}
                  onManualEntry={startManualEntry}
                />
              </motion.div>
            ) : (
              <motion.div
                key="review"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.2 * speed }}
              >
                <ReviewStep
                  draft={draft}
                  isResolving={isResolving}
                  isSaving={createGame.isPending}
                  showAdvanced={showAdvanced}
                  setShowAdvanced={setShowAdvanced}
                  onNameChange={(name) => setDraft((current) => ({ ...current, name }))}
                  onExecutableChange={(executablePath) =>
                    setDraft((current) => ({ ...current, executablePath }))
                  }
                  onInstallPathChange={(installPath) =>
                    setDraft((current) => ({ ...current, installPath }))
                  }
                  onArgsChange={(launchArguments) =>
                    setDraft((current) => ({ ...current, launchArguments }))
                  }
                  onPickCandidate={(candidate) =>
                    setDraft((current) => ({
                      ...current,
                      executablePath: candidate.path,
                      candidates: [],
                    }))
                  }
                  onChangeExecutable={pickExecutable}
                  onBack={() => {
                    setStep('choose')
                    setDraft(EMPTY_DRAFT)
                  }}
                  onConfirm={confirm}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </Modal>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// STEP 1: CHOOSE IMPORT SOURCE
// ══════════════════════════════════════════════════════════════════════════════

interface ChooseStepProps {
  onExecutable: () => void
  onShortcut: () => void
  onFolder: () => void
  onManualEntry: () => void
}

function ChooseStep({ onExecutable, onShortcut, onFolder, onManualEntry }: ChooseStepProps) {
  return (
    <div className="flex flex-col gap-5">
      {/* 1. Quick Dropzone Banner */}
      <div
        onClick={onExecutable}
        className="group relative flex flex-col items-center justify-center gap-2.5 rounded-2xl border-2 border-dashed border-border/90 bg-surface-raised/40 p-5 text-center transition-all cursor-pointer hover:border-accent hover:bg-accent/5 shadow-2xs"
      >
        <span className="flex size-10 items-center justify-center rounded-xl bg-accent/10 text-accent transition-transform group-hover:scale-110 shadow-xs">
          <FolderSearch className="size-5" />
        </span>
        <div>
          <div className="text-sm font-bold text-text group-hover:text-accent transition-colors">
            Drop Executable or Folder to Auto-Import
          </div>
          <p className="mt-0.5 text-xs text-muted">
            Drag any <strong className="text-text">.exe</strong>,{' '}
            <strong className="text-text">.lnk</strong>, or directory here, or click to browse files
          </p>
        </div>
        <span className="rounded-full border border-border/80 bg-surface px-2.5 py-0.5 font-mono text-[9.5px] font-bold text-subtle">
          AUTODETECT ENGINE // ACTIVE
        </span>
      </div>

      {/* 2. Source Cards Grid */}
      <div className="grid gap-3.5 sm:grid-cols-3">
        <SourceCard
          icon={FileCode2}
          label="Direct Executable"
          badge="Instant Link"
          detail="Point directly to a game .exe, .bat, or .cmd binary file"
          onClick={onExecutable}
          primary
        />
        <SourceCard
          icon={Link2}
          label="Desktop Shortcut"
          badge="Param Extract"
          detail="Extract target path, working folder, and flags from a .lnk"
          onClick={onShortcut}
        />
        <SourceCard
          icon={FolderOpen}
          label="Game Folder"
          badge="Deep Scan"
          detail="Scan directory, identify main game binary & calculate disk size"
          onClick={onFolder}
        />
      </div>

      {/* 3. Manual Entry & Telemetry Footer */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 rounded-2xl border border-border/70 bg-surface-raised/30 px-4 py-3 text-xs text-muted">
        <div className="flex items-center gap-2">
          <HardDrive className="size-4 text-accent shrink-0" />
          <span>Need custom launch arguments, emulators, or wine prefixes?</span>
        </div>
        <button
          type="button"
          onClick={onManualEntry}
          className="whitespace-nowrap font-bold text-accent hover:underline cursor-pointer flex items-center gap-1 text-xs"
        >
          <span>Manual Setup</span>
          <ChevronRight className="size-3.5" />
        </button>
      </div>
    </div>
  )
}

function SourceCard({
  icon: Icon,
  label,
  badge,
  detail,
  onClick,
  primary = false,
}: {
  icon: typeof FileCode2
  label: string
  badge: string
  detail: string
  onClick: () => void
  primary?: boolean
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.98 }}
      className={cn(
        'group relative flex min-h-[168px] flex-col items-start justify-between rounded-2xl border p-4.5 text-left transition-all cursor-pointer shadow-2xs overflow-hidden',
        primary
          ? 'border-accent/40 bg-gradient-to-b from-accent/10 to-surface-raised hover:border-accent hover:shadow-[0_0_16px_var(--nx-accent)]/15'
          : 'border-border/80 bg-surface/70 hover:border-accent/40 hover:bg-surface-raised',
      )}
    >
      <div className="w-full flex items-start justify-between">
        <span
          className={cn(
            'flex size-10 items-center justify-center rounded-xl transition-transform group-hover:scale-110 shadow-xs',
            primary ? 'bg-accent text-white shadow-accent/30' : 'bg-accent/10 text-accent',
          )}
        >
          <Icon className="size-5" />
        </span>
        <span className="rounded-full border border-border/60 bg-surface px-2 py-0.5 font-mono text-[9px] font-bold text-subtle uppercase">
          {badge}
        </span>
      </div>

      <div className="mt-3 w-full">
        <div className="flex items-center justify-between text-sm font-bold text-text group-hover:text-accent transition-colors">
          <span>{label}</span>
          <ChevronRight className="size-3.5 text-subtle transition-transform group-hover:translate-x-1" />
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-muted">{detail}</p>
      </div>
    </motion.button>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// STEP 2: REVIEW & METADATA CONFIGURATION
// ══════════════════════════════════════════════════════════════════════════════

interface ReviewStepProps {
  draft: DraftGame
  isResolving: boolean
  isSaving: boolean
  showAdvanced: boolean
  setShowAdvanced: (val: boolean | ((prev: boolean) => boolean)) => void
  onNameChange: (name: string) => void
  onExecutableChange: (path: string) => void
  onInstallPathChange: (path: string) => void
  onArgsChange: (args: string) => void
  onPickCandidate: (candidate: ExecutableCandidate) => void
  onChangeExecutable: () => void
  onBack: () => void
  onConfirm: () => void
}

function ReviewStep({
  draft,
  isResolving,
  isSaving,
  showAdvanced,
  setShowAdvanced,
  onNameChange,
  onExecutableChange,
  onInstallPathChange,
  onArgsChange,
  onPickCandidate,
  onChangeExecutable,
  onBack,
  onConfirm,
}: ReviewStepProps) {
  if (isResolving) {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 text-center">
        <div className="relative flex size-16 items-center justify-center rounded-2xl bg-accent/10 text-accent shadow-[0_0_24px_var(--nx-accent)]/20">
          <Loader2 className="size-7 animate-spin" />
        </div>
        <div>
          <h3 className="text-base font-bold text-text">Scanning Target Game Files</h3>
          <p className="mt-1 text-xs text-muted max-w-sm">
            Detecting executable entry points, resolving symbolic targets, and calculating disk
            footprint…
          </p>
        </div>
      </div>
    )
  }

  const needsExecutable = draft.candidates.length > 0
  const canSubmit = Boolean(draft.executablePath?.trim() && draft.name.trim()) && !isSaving

  return (
    <div className="flex flex-col gap-4.5">
      {/* 1. Game Title Input */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold uppercase tracking-wider text-text font-mono">
            Game Name
          </label>
          <span className="font-mono text-[10px] text-muted">IGDB MATCH READY</span>
        </div>
        <div className="relative">
          <input
            value={draft.name}
            onChange={(e) => onNameChange(e.target.value)}
            className="h-11 w-full rounded-xl border border-border/90 bg-surface px-4 text-sm font-semibold text-text shadow-2xs outline-none transition-all placeholder:text-muted/60 focus:border-accent focus:ring-2 focus:ring-accent/20"
            placeholder="e.g. Cyberpunk 2077, Hades, Elden Ring..."
            autoFocus
          />
          {draft.name && (
            <button
              type="button"
              onClick={() => onNameChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-text cursor-pointer p-1"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 2. Executable Candidates Selection OR Single Target */}
      {needsExecutable ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-text font-mono">
              Select Primary Launch Executable
            </span>
            <span className="text-[10px] font-mono text-accent">
              {draft.candidates.length} Detected
            </span>
          </div>
          <div className="flex max-h-40 flex-col gap-1.5 overflow-y-auto pr-1 scrollbar-thin">
            {draft.candidates.map((candidate, idx) => {
              const isMainCandidate = idx === 0
              return (
                <button
                  key={candidate.path}
                  type="button"
                  onClick={() => onPickCandidate(candidate)}
                  className="group flex items-center justify-between rounded-xl border border-border/80 bg-surface p-3 text-left transition-all hover:border-accent/60 hover:bg-accent/10 cursor-pointer shadow-2xs"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <FileCode2 className="size-4 shrink-0 text-accent" />
                    <div className="truncate">
                      <div className="text-xs font-bold text-text truncate">
                        {candidate.file_name}
                      </div>
                      <div className="text-[10px] text-muted truncate font-mono">
                        {candidate.path}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    {isMainCandidate && (
                      <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.2 text-[9px] font-mono font-bold text-emerald-400">
                        PRIMARY
                      </span>
                    )}
                    <span className="text-[10px] font-mono font-semibold text-subtle">
                      {formatBytes(candidate.size_bytes)}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2">
          {/* Target Executable */}
          <div className="rounded-xl border border-border/80 bg-surface/80 p-3.5 shadow-2xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-xs font-semibold text-subtle mb-1.5">
                <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase font-bold text-accent">
                  <FileCode2 className="size-3.5" />
                  Launch Binary
                </span>
                <button
                  type="button"
                  onClick={onChangeExecutable}
                  className="text-[10px] font-bold text-accent hover:underline cursor-pointer"
                >
                  Change
                </button>
              </div>
              <div
                className="truncate text-xs font-mono text-text"
                title={draft.executablePath ?? undefined}
              >
                {draft.executablePath || 'None specified'}
              </div>
            </div>
          </div>

          {/* Install Size & Location */}
          <div className="rounded-xl border border-border/80 bg-surface/80 p-3.5 shadow-2xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-xs font-semibold text-subtle mb-1.5">
                <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase font-bold text-accent">
                  <HardDrive className="size-3.5" />
                  Disk Footprint
                </span>
                <span className="font-mono text-[10px] text-muted">
                  {draft.installSizeBytes ? formatBytes(draft.installSizeBytes) : 'Calculating…'}
                </span>
              </div>
              <div
                className="truncate text-xs font-mono text-text"
                title={draft.installPath ?? undefined}
              >
                {draft.installPath || 'Not set'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. Collapsible Advanced Launch Settings */}
      <div className="rounded-xl border border-border/80 bg-surface/50 overflow-hidden shadow-2xs">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex w-full items-center justify-between p-3 text-xs font-bold text-text hover:bg-surface-raised transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="size-3.5 text-accent" />
            <span>Advanced Launch Parameters</span>
          </div>
          <ChevronDown
            className={cn(
              'size-4 text-muted transition-transform duration-200',
              showAdvanced && 'rotate-180 text-accent',
            )}
          />
        </button>

        <AnimatePresence>
          {showAdvanced && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="border-t border-border/70 p-3.5 flex flex-col gap-3"
            >
              {/* Custom Launch Arguments */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-text font-mono flex items-center gap-1.5">
                  <Terminal className="size-3 text-accent" />
                  Command Arguments
                </label>
                <input
                  type="text"
                  value={draft.launchArguments ?? ''}
                  onChange={(e) => onArgsChange(e.target.value)}
                  placeholder="e.g. -fullscreen -novid +fps_max 0"
                  className="h-8.5 rounded-lg border border-border bg-surface px-3 font-mono text-xs text-text placeholder:text-muted/60 focus:border-accent focus:outline-none"
                />
              </div>

              {/* Custom Executable Override if manual */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-text font-mono">
                  Executable Path Override
                </label>
                <input
                  type="text"
                  value={draft.executablePath ?? ''}
                  onChange={(e) => onExecutableChange(e.target.value)}
                  placeholder="C:\Games\GameTitle\game.exe"
                  className="h-8.5 rounded-lg border border-border bg-surface px-3 font-mono text-xs text-text placeholder:text-muted/60 focus:border-accent focus:outline-none"
                />
              </div>

              {/* Custom Install Directory Override */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-text font-mono">
                  Installation Directory Override
                </label>
                <input
                  type="text"
                  value={draft.installPath ?? ''}
                  onChange={(e) => onInstallPathChange(e.target.value)}
                  placeholder="C:\Games\GameTitle"
                  className="h-8.5 rounded-lg border border-border bg-surface px-3 font-mono text-xs text-text placeholder:text-muted/60 focus:border-accent focus:outline-none"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 4. Action Command Bar Footer */}
      <div className="mt-2 flex items-center justify-between border-t border-border/70 pt-4">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-muted hover:text-text hover:bg-surface-raised transition-colors cursor-pointer"
        >
          <ArrowLeft className="size-3.5" />
          <span>Change Source</span>
        </button>

        <button
          type="button"
          onClick={onConfirm}
          disabled={!canSubmit}
          className={cn(
            'flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-bold transition-all cursor-pointer shadow-xs select-none',
            canSubmit
              ? 'bg-accent text-white shadow-[0_0_16px_var(--nx-accent)]/25 hover:bg-accent-hover hover:scale-102 active:scale-98'
              : 'bg-surface-raised text-muted border border-border/80 cursor-not-allowed opacity-60',
          )}
        >
          {isSaving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          <span>{isSaving ? 'Importing Game…' : 'Add to Library'}</span>
        </button>
      </div>
    </div>
  )
}
