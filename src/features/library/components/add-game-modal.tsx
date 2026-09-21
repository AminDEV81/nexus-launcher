import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQueryClient, useMutation } from '@tanstack/react-query'
import { open as openFileDialog } from '@tauri-apps/plugin-dialog'
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronRight,
  ChevronDown,
  FileCode2,
  FolderOpen,
  HardDrive,
  Link2,
  Loader2,
  Radar,
  RotateCw,
  Search,
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
import { scanAllStores, importScannedGames } from '@/services/scan'
import type { ScanResult } from '@/services/scan'
import { guessNameFromPath, getParentPath, formatBytes } from '../utils/guess-name'
import { storeLabel, storeColors } from '../utils/store-labels'
import { useAnimationSpeed } from '@/hooks/use-animation-speed'
import { playButtonClick } from '@/lib/sound-engine'

type Step = 'choose' | 'review' | 'system-scan'

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
                    {step === 'choose'
                      ? 'STAGE 01 // SOURCE'
                      : step === 'system-scan'
                        ? 'STAGE 02 // AUTO-SCAN'
                        : 'STAGE 02 // STAGING'}
                  </span>
                </div>
                <h2 className="text-xl font-black tracking-tight text-text">
                  {step === 'choose'
                    ? 'Add Game to Library'
                    : step === 'system-scan'
                      ? 'System Game Scanner'
                      : 'Configure Game Details'}
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
                    step !== 'choose'
                      ? 'bg-accent shadow-[0_0_6px_var(--nx-accent)]'
                      : 'bg-muted/40',
                  )}
                />
                <span className={step !== 'choose' ? 'text-accent' : 'text-muted'}>
                  {step === 'system-scan' ? '02 Auto-Scan' : '02 Config'}
                </span>
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
                  onAutoScan={() => {
                    playButtonClick()
                    setStep('system-scan')
                  }}
                  onExecutable={pickExecutable}
                  onShortcut={pickShortcut}
                  onFolder={pickFolder}
                  onManualEntry={startManualEntry}
                />
              </motion.div>
            ) : step === 'system-scan' ? (
              <motion.div
                key="system-scan"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.2 * speed }}
              >
                <SystemScanStep
                  onBack={() => {
                    playButtonClick()
                    setStep('choose')
                  }}
                  onComplete={close}
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
  onAutoScan: () => void
  onExecutable: () => void
  onShortcut: () => void
  onFolder: () => void
  onManualEntry: () => void
}

function ChooseStep({
  onAutoScan,
  onExecutable,
  onShortcut,
  onFolder,
  onManualEntry,
}: ChooseStepProps) {
  return (
    <div className="flex flex-col gap-4">
      {/* 1. Hero Auto-Scan Card with Cybernetic Radar Pulse */}
      <motion.div
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        onClick={onAutoScan}
        className="group relative flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-accent/40 bg-gradient-to-r from-accent/15 via-surface-raised/90 to-cyan-500/10 p-4.5 cursor-pointer shadow-[0_0_24px_rgba(124,92,255,0.12)] hover:border-accent hover:shadow-[0_0_32px_rgba(124,92,255,0.25)] transition-all overflow-hidden"
      >
        <div className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full bg-cyan-400/10 blur-2xl group-hover:bg-cyan-400/20 transition-colors" />

        <div className="flex items-center gap-3.5 relative z-10">
          <div className="relative flex size-12 shrink-0 items-center justify-center rounded-2xl bg-accent text-white shadow-[0_0_16px_var(--nx-accent)]/30 ring-2 ring-accent/30 group-hover:scale-105 transition-transform">
            <Radar className="size-6" />
            <span className="absolute -top-1 -right-1 size-3 rounded-full bg-cyan-400 animate-ping" />
            <span className="absolute -top-1 -right-1 size-3 rounded-full bg-cyan-400" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-black tracking-tight text-text group-hover:text-accent transition-colors">
                Scan System for Installed Games
              </h3>
              <span className="rounded-full border border-accent/40 bg-accent/20 px-2 py-0.5 font-mono text-[9px] font-extrabold uppercase text-accent">
                RECOMMENDED
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted leading-relaxed">
              Automatically detect games from Steam, Epic, GOG, EA, Ubisoft, Battle.net, Xbox &
              Amazon
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 font-bold text-xs text-accent group-hover:translate-x-1 transition-transform shrink-0 relative z-10">
          <span>Start Auto-Scan</span>
          <ChevronRight className="size-4" />
        </div>
      </motion.div>

      {/* 2. Quick Dropzone Banner */}
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

      {/* 3. Source Cards Grid */}
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

      {/* 4. Manual Entry & Telemetry Footer */}
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

// ══════════════════════════════════════════════════════════════════════════════
// STEP 1.5: SYSTEM GAME SCANNER
// ══════════════════════════════════════════════════════════════════════════════

interface SystemScanStepProps {
  onBack: () => void
  onComplete: () => void
}

function SystemScanStep({ onBack, onComplete }: SystemScanStepProps) {
  const queryClient = useQueryClient()
  const speed = useAnimationSpeed()

  const [result, setResult] = useState<ScanResult | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [search, setSearch] = useState('')
  const [activeStore, setActiveStore] = useState<string>('all')

  const scanMutation = useMutation({
    mutationFn: scanAllStores,
    onSuccess: (data) => {
      setResult(data)
      setSelected(new Set(data.games.map((_, idx) => idx)))
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to scan system for games.')
    },
  })

  const importMutation = useMutation({
    mutationFn: importScannedGames,
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['games'] })
      toast.success(`Added ${count} game${count === 1 ? '' : 's'} to your library!`)
      onComplete()
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to import games.')
    },
  })

  useEffect(() => {
    scanMutation.mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const stores = useMemo(() => {
    if (!result) return []
    const storeMap = new Map<string, number>()
    result.games.forEach((g) => {
      storeMap.set(g.source, (storeMap.get(g.source) ?? 0) + 1)
    })
    return Array.from(storeMap.entries()).map(([source, count]) => ({ source, count }))
  }, [result])

  const filteredGames = useMemo(() => {
    if (!result) return []
    return result.games
      .map((game, originalIndex) => ({ game, originalIndex }))
      .filter(({ game }) => {
        const matchesStore =
          activeStore === 'all' || game.source.toLowerCase() === activeStore.toLowerCase()
        const matchesSearch =
          !search.trim() || game.name.toLowerCase().includes(search.toLowerCase().trim())
        return matchesStore && matchesSearch
      })
  }, [result, activeStore, search])

  function toggleGame(index: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  function toggleAllVisible() {
    const visibleIndices = filteredGames.map((item) => item.originalIndex)
    const allSelected = visibleIndices.every((idx) => selected.has(idx))
    setSelected((prev) => {
      const next = new Set(prev)
      if (allSelected) {
        visibleIndices.forEach((idx) => next.delete(idx))
      } else {
        visibleIndices.forEach((idx) => next.add(idx))
      }
      return next
    })
  }

  function handleImport() {
    if (!result) return
    const chosen = result.games.filter((_, idx) => selected.has(idx))
    if (chosen.length === 0) return
    playButtonClick()
    importMutation.mutate(chosen)
  }

  return (
    <div className="flex flex-col min-h-[380px]">
      <AnimatePresence mode="wait">
        {scanMutation.isPending && (
          <motion.div
            key="scanning-radar"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3 * speed }}
            className="flex min-h-[360px] flex-col items-center justify-center text-center p-4"
          >
            {/* Holographic Circular Radar HUD */}
            <div className="relative flex size-44 items-center justify-center">
              {/* Concentric rings */}
              <div className="absolute inset-0 rounded-full border border-accent/20 [border-style:dashed]" />
              <div className="absolute inset-4 rounded-full border border-cyan-500/20" />
              <div className="absolute inset-10 rounded-full border border-accent/30" />
              <div className="absolute inset-16 rounded-full border border-cyan-400/40" />

              {/* Crosshairs */}
              <div className="absolute h-full w-px bg-gradient-to-b from-transparent via-accent/30 to-transparent" />
              <div className="absolute w-full h-px bg-gradient-to-r from-transparent via-accent/30 to-transparent" />

              {/* Rotating Radar Sweep Beam */}
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 2.5 / speed, ease: 'linear' }}
                className="absolute inset-0 rounded-full"
                style={{
                  background:
                    'conic-gradient(from 0deg, rgba(124, 92, 255, 0.45) 0deg, rgba(0, 240, 255, 0.15) 45deg, transparent 90deg, transparent 360deg)',
                }}
              />

              {/* Center Radar Core */}
              <div className="relative z-10 flex size-12 items-center justify-center rounded-2xl bg-surface border border-accent/50 shadow-[0_0_20px_var(--nx-accent)]/40 text-accent">
                <Radar className="size-6 animate-pulse" />
              </div>

              {/* Orbiting blips */}
              <motion.div
                animate={{ scale: [1, 1.4, 1], opacity: [0.4, 1, 0.4] }}
                transition={{ repeat: Infinity, duration: 1.8 / speed, ease: 'easeInOut' }}
                className="absolute top-8 right-10 size-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#00f0ff]"
              />
              <motion.div
                animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0.9, 0.3] }}
                transition={{
                  repeat: Infinity,
                  duration: 2.2 / speed,
                  delay: 0.5,
                  ease: 'easeInOut',
                }}
                className="absolute bottom-9 left-11 size-2.5 rounded-full bg-accent shadow-[0_0_8px_var(--nx-accent)]"
              />
            </div>

            {/* Scan Status & Telemetry */}
            <div className="mt-5 space-y-1">
              <div className="flex items-center justify-center gap-2 font-mono text-xs font-bold uppercase tracking-wider text-accent">
                <span className="size-2 rounded-full bg-cyan-400 animate-ping" />
                <span>Deep Scanning Installed Stores & Registries</span>
              </div>
              <p className="text-xs text-muted max-w-md mx-auto">
                Querying Steam, Epic Games, GOG, EA App, Ubisoft Connect, Battle.net, Xbox & Amazon
                Games...
              </p>
            </div>

            {/* Active Platform Indicators */}
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2 max-w-lg">
              {[
                { name: 'Steam', color: 'border-sky-500/30 text-sky-400 bg-sky-500/10' },
                { name: 'Epic Games', color: 'border-zinc-500/30 text-zinc-300 bg-zinc-500/10' },
                {
                  name: 'GOG Galaxy',
                  color: 'border-purple-500/30 text-purple-400 bg-purple-500/10',
                },
                { name: 'EA App', color: 'border-orange-500/30 text-orange-400 bg-orange-500/10' },
                { name: 'Ubisoft', color: 'border-blue-500/30 text-blue-400 bg-blue-500/10' },
                { name: 'Battle.net', color: 'border-cyan-500/30 text-cyan-400 bg-cyan-500/10' },
                { name: 'Xbox', color: 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10' },
                { name: 'Amazon', color: 'border-amber-500/30 text-amber-400 bg-amber-500/10' },
              ].map((p, idx) => (
                <span
                  key={p.name}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold font-mono transition-all',
                    p.color,
                  )}
                >
                  <span
                    className="size-1.5 rounded-full bg-current animate-pulse"
                    style={{ animationDelay: `${idx * 150}ms` }}
                  />
                  {p.name}
                </span>
              ))}
            </div>
          </motion.div>
        )}

        {result && !scanMutation.isPending && (
          <motion.div
            key="scan-results"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 * speed }}
            className="flex flex-col gap-3.5"
          >
            {result.games.length === 0 ? (
              <div className="flex min-h-[300px] flex-col items-center justify-center p-6 text-center">
                <div className="mb-3.5 flex size-14 items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 shadow-inner">
                  <CheckCircle2 className="size-7" />
                </div>
                <h3 className="text-base font-bold text-text">Library Fully Synchronized</h3>
                <p className="mt-1 max-w-sm text-xs text-muted leading-relaxed">
                  All games detected across your installed stores (Steam, Epic, GOG, EA, Ubisoft,
                  Battle.net, Xbox & Amazon) are already in your Nexus library.
                </p>
                <div className="mt-5 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      playButtonClick()
                      scanMutation.mutate()
                    }}
                    className="flex items-center gap-1.5 rounded-xl border border-border bg-surface-raised px-4 py-2 text-xs font-bold text-text hover:bg-surface transition-colors cursor-pointer"
                  >
                    <RotateCw className="size-3.5" />
                    <span>Rescan</span>
                  </button>
                  <button
                    type="button"
                    onClick={onBack}
                    className="rounded-xl bg-accent px-4 py-2 text-xs font-bold text-white hover:bg-accent-hover transition-colors cursor-pointer"
                  >
                    Choose Other Source
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Discovered Games Controls & Filters */}
                <div className="flex flex-col gap-2.5">
                  {/* Top Status & Search Bar */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2">
                      <span className="flex size-7 items-center justify-center rounded-lg bg-accent/15 text-accent">
                        <Radar className="size-4" />
                      </span>
                      <div>
                        <span className="text-xs font-bold text-text">
                          Discovered {result.games.length} New Game
                          {result.games.length === 1 ? '' : 's'}
                        </span>
                        <span className="text-[11px] text-muted ml-2">
                          ({selected.size} selected)
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Search input */}
                      <div className="relative w-44 sm:w-52">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle" />
                        <input
                          type="text"
                          placeholder="Filter scanned..."
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          className="h-8 w-full rounded-lg border border-border/80 bg-surface pl-8 pr-3 text-xs text-text placeholder:text-muted/60 focus:border-accent focus:outline-none"
                        />
                        {search && (
                          <button
                            type="button"
                            onClick={() => setSearch('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-subtle hover:text-text cursor-pointer p-0.5"
                          >
                            <X className="size-3" />
                          </button>
                        )}
                      </div>

                      {/* Toggle all */}
                      <button
                        type="button"
                        onClick={toggleAllVisible}
                        className="h-8 rounded-lg border border-border/80 bg-surface-raised px-2.5 text-[11px] font-bold text-subtle hover:text-text hover:bg-surface transition-colors cursor-pointer whitespace-nowrap"
                      >
                        {filteredGames.every((g) => selected.has(g.originalIndex))
                          ? 'Deselect All'
                          : 'Select All'}
                      </button>

                      {/* Rescan button */}
                      <button
                        type="button"
                        onClick={() => {
                          playButtonClick()
                          scanMutation.mutate()
                        }}
                        disabled={scanMutation.isPending}
                        title="Rescan System"
                        className="flex size-8 items-center justify-center rounded-lg border border-border/80 bg-surface-raised text-subtle hover:text-text hover:bg-surface transition-colors cursor-pointer"
                      >
                        <RotateCw className="size-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Store Filter Pills */}
                  {stores.length > 1 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() => setActiveStore('all')}
                        className={cn(
                          'rounded-full px-2.5 py-1 text-[11px] font-bold transition-all cursor-pointer border',
                          activeStore === 'all'
                            ? 'border-accent bg-accent text-white shadow-xs'
                            : 'border-border/70 bg-surface text-subtle hover:text-text hover:bg-surface-raised',
                        )}
                      >
                        All ({result.games.length})
                      </button>
                      {stores.map(({ source, count }) => {
                        const colors = storeColors(source)
                        const isCurrent = activeStore === source.toLowerCase()
                        return (
                          <button
                            key={source}
                            type="button"
                            onClick={() => setActiveStore(source.toLowerCase())}
                            className={cn(
                              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold transition-all cursor-pointer border',
                              isCurrent
                                ? 'border-accent bg-accent text-white shadow-xs'
                                : `${colors.border} ${colors.bg} ${colors.text} hover:opacity-90`,
                            )}
                          >
                            <span>{storeLabel(source)}</span>
                            <span className="font-mono text-[10px] opacity-80">({count})</span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Scrollable Game Rows */}
                <div className="flex max-h-[260px] flex-col gap-1.5 overflow-y-auto pr-1 scrollbar-thin rounded-xl border border-border/70 bg-surface/40 p-1.5">
                  {filteredGames.length === 0 ? (
                    <div className="p-8 text-center text-xs text-muted">
                      No games match your search query.
                    </div>
                  ) : (
                    filteredGames.map(({ game, originalIndex }) => {
                      const isChecked = selected.has(originalIndex)
                      const colors = storeColors(game.source)
                      return (
                        <button
                          key={`${game.source}-${game.executable_path ?? game.install_path ?? game.name}-${originalIndex}`}
                          type="button"
                          onClick={() => toggleGame(originalIndex)}
                          className={cn(
                            'group flex items-center gap-3 rounded-xl border p-2.5 text-left transition-all cursor-pointer select-none',
                            isChecked
                              ? 'border-accent/40 bg-accent/5 shadow-2xs'
                              : 'border-border/60 bg-surface/80 hover:bg-surface-raised/80 hover:border-border',
                          )}
                        >
                          {/* Custom Checkbox */}
                          <span
                            className={cn(
                              'flex size-5 shrink-0 items-center justify-center rounded-lg border transition-all',
                              isChecked
                                ? 'border-accent bg-accent text-white shadow-xs'
                                : 'border-border/80 bg-surface group-hover:border-accent/50',
                            )}
                          >
                            {isChecked && <Check className="size-3.5" strokeWidth={3} />}
                          </span>

                          {/* Game Details */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-text truncate">
                                {game.name}
                              </span>
                              <span
                                className={cn(
                                  'shrink-0 rounded-md border px-1.5 py-0.2 font-mono text-[9px] font-bold uppercase',
                                  colors.bg,
                                  colors.text,
                                  colors.border,
                                )}
                              >
                                {storeLabel(game.source)}
                              </span>
                            </div>
                            <div
                              className="truncate text-[10px] font-mono text-subtle mt-0.5"
                              title={game.install_path ?? game.executable_path ?? undefined}
                            >
                              {game.install_path ?? game.executable_path}
                            </div>
                          </div>

                          {/* Size footprint if available */}
                          {game.install_size_bytes ? (
                            <span className="shrink-0 font-mono text-[10px] font-semibold text-muted">
                              {formatBytes(game.install_size_bytes)}
                            </span>
                          ) : null}
                        </button>
                      )
                    })
                  )}
                </div>

                {/* Footer Actions */}
                <div className="mt-1 flex items-center justify-between border-t border-border/70 pt-3.5">
                  <button
                    type="button"
                    onClick={() => {
                      playButtonClick()
                      onBack()
                    }}
                    className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-muted hover:text-text hover:bg-surface-raised transition-colors cursor-pointer"
                  >
                    <ArrowLeft className="size-3.5" />
                    <span>Back to Sources</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleImport}
                    disabled={selected.size === 0 || importMutation.isPending}
                    className={cn(
                      'flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-bold transition-all cursor-pointer shadow-xs select-none',
                      selected.size > 0 && !importMutation.isPending
                        ? 'bg-accent text-white shadow-[0_0_16px_var(--nx-accent)]/25 hover:bg-accent-hover hover:scale-102 active:scale-98'
                        : 'bg-surface-raised text-muted border border-border/80 cursor-not-allowed opacity-60',
                    )}
                  >
                    {importMutation.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Check className="size-4" />
                    )}
                    <span>
                      {importMutation.isPending
                        ? 'Adding to Library…'
                        : `Add ${selected.size} Game${selected.size === 1 ? '' : 's'} to Library`}
                    </span>
                  </button>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
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
