import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  CheckCircle2,
  Cpu,
  Globe,
  HardDrive,
  Layers,
  Lock,
  RefreshCw,
  RotateCcw,
  Shield,
  Sparkles,
  Timer,
  Trash2,
  Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Switch } from '@/features/settings/components/appearance-panel'
import { useAnimationSpeed } from '@/hooks/use-animation-speed'
import {
  useCleanShaderCaches,
  useCreateRestorePoint,
  useSystemTweakStatus,
  useToggleBcdTweaks,
  useToggleGpuMsiMode,
  useToggleNetworkTweaks,
  useToggleTelemetryDebloat,
} from '../hooks/use-system-tweaks'

export function SystemTweaksTab() {
  const speed = useAnimationSpeed()
  const { data: status, isLoading, refetch, isFetching } = useSystemTweakStatus()

  const createRestorePoint = useCreateRestorePoint()
  const toggleNetwork = useToggleNetworkTweaks()
  const toggleGpuMsi = useToggleGpuMsiMode()
  const toggleBcd = useToggleBcdTweaks()
  const toggleTelemetry = useToggleTelemetryDebloat()
  const cleanShader = useCleanShaderCaches()

  const [applyingAll, setApplyingAll] = useState(false)

  const isPendingAny =
    createRestorePoint.isPending ||
    toggleNetwork.isPending ||
    toggleGpuMsi.isPending ||
    toggleBcd.isPending ||
    toggleTelemetry.isPending ||
    cleanShader.isPending ||
    applyingAll

  async function handleApplyAll() {
    setApplyingAll(true)
    try {
      await toggleNetwork.mutateAsync(true)
      await toggleGpuMsi.mutateAsync(true)
      await toggleBcd.mutateAsync(true)
      await toggleTelemetry.mutateAsync(true)
      await refetch()
    } finally {
      setApplyingAll(false)
    }
  }

  async function handleRevertAll() {
    setApplyingAll(true)
    try {
      await toggleNetwork.mutateAsync(false)
      await toggleGpuMsi.mutateAsync(false)
      await toggleBcd.mutateAsync(false)
      await toggleTelemetry.mutateAsync(false)
      await refetch()
    } finally {
      setApplyingAll(false)
    }
  }

  const score = status?.optimization_score ?? 0
  const isElevated = status?.is_elevated ?? false
  const detectedGpu = status?.detected_gpus[0] ?? 'Discrete GPU'

  return (
    <div className="space-y-6">
      {/* Overview & Optimization Score Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-surface/80 p-5 backdrop-blur-sm sm:p-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-lg bg-accent/15 text-accent">
                <Sparkles className="size-4" />
              </span>
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-accent">
                Nexus OS Tuner
              </span>
            </div>
            <h3 className="text-xl font-bold text-text">Deep Windows Gaming Optimization</h3>
            <p className="max-w-xl text-xs leading-relaxed text-muted sm:text-sm">
              Persistent, low-level OS tweaks reverse-engineered from competitive gaming suites.
              Reduces DPC latency, eliminates input delay, and unchains hardware performance.
            </p>
          </div>

          {/* Radial / Score Box */}
          <div className="flex shrink-0 items-center gap-4 rounded-xl border border-border/70 bg-surface-raised/70 p-4">
            <div className="relative flex size-16 items-center justify-center">
              <svg className="size-full -rotate-90" viewBox="0 0 36 36">
                <path
                  className="text-border"
                  strokeWidth="3.2"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <motion.path
                  className={cn(
                    score >= 75
                      ? 'text-emerald-400'
                      : score >= 50
                        ? 'text-amber-400'
                        : 'text-accent',
                  )}
                  strokeDasharray={`${score}, 100`}
                  strokeWidth="3.2"
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="none"
                  initial={{ strokeDasharray: '0, 100' }}
                  animate={{ strokeDasharray: `${score}, 100` }}
                  transition={{ duration: 0.8 * speed }}
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-mono text-lg font-black text-text">{score}%</span>
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold text-text">Tuning Score</div>
              <div className="text-[11px] text-muted">
                {status
                  ? `${status.applied_tweaks} of ${status.total_tweaks} Active`
                  : 'Scanning...'}
              </div>
            </div>
          </div>
        </div>

        {/* Global Action Strip */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium border',
                isElevated
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                  : 'border-amber-500/30 bg-amber-500/10 text-amber-400',
              )}
            >
              {isElevated ? (
                <>
                  <CheckCircle2 className="size-3" />
                  Elevated (Administrator)
                </>
              ) : (
                <>
                  <Lock className="size-3" />
                  Standard User (UAC prompts on toggle)
                </>
              )}
            </span>

            <button
              type="button"
              onClick={() => void refetch()}
              disabled={isLoading || isFetching}
              title="Rescan system status"
              className="flex size-7 items-center justify-center rounded-lg border border-border/80 bg-surface text-muted transition hover:bg-surface-raised hover:text-text active:scale-95"
            >
              <RefreshCw className={cn('size-3.5', isFetching && 'animate-spin text-accent')} />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRevertAll}
              disabled={isPendingAny}
              className="flex h-8 items-center gap-1.5 rounded-xl border border-border/80 bg-surface px-3 text-xs font-medium text-subtle transition hover:bg-surface-raised hover:text-text active:scale-95 disabled:opacity-50"
            >
              <RotateCcw className="size-3.5" />
              <span>Restore Defaults</span>
            </button>

            <button
              type="button"
              onClick={handleApplyAll}
              disabled={isPendingAny || score === 100}
              className="flex h-8 items-center gap-1.5 rounded-xl bg-accent px-4 text-xs font-bold text-white shadow-sm transition hover:bg-accent-hover active:scale-95 disabled:opacity-50"
            >
              <Zap className="size-3.5" />
              <span>{applyingAll ? 'Tuning OS...' : '1-Click Full Optimize'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Safety Net: System Restore Point Banner */}
      <div className="flex flex-col gap-3 rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-400">
            <Shield className="size-4" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-text">Windows System Restore Point</h4>
            <p className="text-xs text-muted">
              Create an instant Windows safety backup before making low-level system modifications.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => createRestorePoint.mutate()}
          disabled={createRestorePoint.isPending}
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3.5 text-xs font-semibold text-cyan-300 transition hover:bg-cyan-500/20 active:scale-95 disabled:opacity-60"
        >
          {createRestorePoint.isPending ? (
            <RefreshCw className="size-3.5 animate-spin" />
          ) : (
            <CheckCircle2 className="size-3.5" />
          )}
          <span>
            {createRestorePoint.isPending ? 'Creating Snapshot...' : 'Create Restore Point'}
          </span>
        </button>
      </div>

      {/* Grid of Optimization Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* 1. Low-Latency Network & Ping */}
        <div className="flex flex-col justify-between rounded-xl border border-border/70 bg-surface/60 p-4 transition hover:border-border">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex size-8 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-400">
                  <Globe className="size-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-text">Gaming Network & Ping</h4>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-muted">
                    TCP NoDelay · AckFrequency
                  </span>
                </div>
              </div>
              <div className={cn(toggleNetwork.isPending && 'opacity-50 pointer-events-none')}>
                <Switch
                  checked={status?.network_tweaks_applied ?? false}
                  onChange={(val: boolean) => toggleNetwork.mutate(val)}
                  ariaLabel="Toggle Gaming Network & Ping"
                />
              </div>
            </div>
            <p className="text-xs text-muted leading-relaxed">
              Disables Nagle's algorithm and packet bundling delay on all network adapters. Sends
              game input packets immediately for lower in-game ping and jitter.
            </p>
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-border/40 pt-2.5 text-[11px] text-subtle">
            <span>Status:</span>
            <span
              className={cn(
                'font-mono font-semibold',
                status?.network_tweaks_applied ? 'text-emerald-400' : 'text-subtle',
              )}
            >
              {status?.network_tweaks_applied ? 'ACTIVE (Zero-Delay)' : 'Windows Default'}
            </span>
          </div>
        </div>

        {/* 2. GPU MSI Mode (Interrupts) */}
        <div className="flex flex-col justify-between rounded-xl border border-border/70 bg-surface/60 p-4 transition hover:border-border">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
                  <Cpu className="size-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-text">GPU MSI Interrupt Mode</h4>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-muted">
                    Message Signaled Interrupts
                  </span>
                </div>
              </div>
              <div className={cn(toggleGpuMsi.isPending && 'opacity-50 pointer-events-none')}>
                <Switch
                  checked={status?.gpu_msi_applied ?? false}
                  onChange={(val: boolean) => toggleGpuMsi.mutate(val)}
                  ariaLabel="Toggle GPU MSI Mode"
                />
              </div>
            </div>
            <p className="text-xs text-muted leading-relaxed">
              Switches {detectedGpu} from line-based interrupts to MSI Mode with High device
              priority. Eliminates IRQ bus contention and DPC frame stutter.
            </p>
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-border/40 pt-2.5 text-[11px] text-subtle">
            <span>Device:</span>
            <span
              className={cn(
                'font-mono font-semibold truncate max-w-[200px]',
                status?.gpu_msi_applied ? 'text-emerald-400' : 'text-subtle',
              )}
            >
              {status?.gpu_msi_applied ? 'MSI High Priority' : 'Legacy Line Interrupt'}
            </span>
          </div>
        </div>

        {/* 3. BCD Timer & Frame Pacing */}
        <div className="flex flex-col justify-between rounded-xl border border-border/70 bg-surface/60 p-4 transition hover:border-border">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex size-8 items-center justify-center rounded-lg bg-amber-500/15 text-amber-400">
                  <Timer className="size-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-text">BCD Timer & Frame Pacing</h4>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-muted">
                    Disable Dynamic Tick
                  </span>
                </div>
              </div>
              <div className={cn(toggleBcd.isPending && 'opacity-50 pointer-events-none')}>
                <Switch
                  checked={status?.bcd_tweaks_applied ?? false}
                  onChange={(val: boolean) => toggleBcd.mutate(val)}
                  ariaLabel="Toggle BCD Dynamic Tick"
                />
              </div>
            </div>
            <p className="text-xs text-muted leading-relaxed">
              Disables power-saving timer tick variations and synchronizes Time Stamp Counters (TSC)
              across CPU cores to stabilize framerate pacing in high-FPS games.
            </p>
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-border/40 pt-2.5 text-[11px] text-subtle">
            <span>Boot Config:</span>
            <span
              className={cn(
                'font-mono font-semibold',
                status?.bcd_tweaks_applied ? 'text-emerald-400' : 'text-subtle',
              )}
            >
              {status?.bcd_tweaks_applied ? 'Enhanced Steady Tick' : 'Variable Power Tick'}
            </span>
          </div>
        </div>

        {/* 4. Telemetry & Bloat Services */}
        <div className="flex flex-col justify-between rounded-xl border border-border/70 bg-surface/60 p-4 transition hover:border-border">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex size-8 items-center justify-center rounded-lg bg-rose-500/15 text-rose-400">
                  <Layers className="size-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-text">Telemetry & Bloat Services</h4>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-muted">
                    DiagTrack · WerSvc · DoSvc
                  </span>
                </div>
              </div>
              <div className={cn(toggleTelemetry.isPending && 'opacity-50 pointer-events-none')}>
                <Switch
                  checked={status?.telemetry_debloated ?? false}
                  onChange={(val: boolean) => toggleTelemetry.mutate(val)}
                  ariaLabel="Toggle Telemetry Services"
                />
              </div>
            </div>
            <p className="text-xs text-muted leading-relaxed">
              Disables Microsoft Connected User Experiences and Telemetry, Error Reporting, and P2P
              Delivery Optimization so they don't consume CPU cycles during matches.
            </p>
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-border/40 pt-2.5 text-[11px] text-subtle">
            <span>Background Telemetry:</span>
            <span
              className={cn(
                'font-mono font-semibold',
                status?.telemetry_debloated ? 'text-emerald-400' : 'text-subtle',
              )}
            >
              {status?.telemetry_debloated ? 'Disabled (Quiet OS)' : 'Active (Reporting)'}
            </span>
          </div>
        </div>
      </div>

      {/* Deep Shader Cache Cleaner Card */}
      <div className="flex flex-col gap-4 rounded-xl border border-border/70 bg-surface/60 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-purple-500/15 text-purple-400">
            <Trash2 className="size-4" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-text">DirectX & GPU Shader Cache Purge</h4>
            <p className="text-xs text-muted">
              Deletes corrupted or bloated shader caches in DirectX (D3DSCache), NVIDIA (DXCache),
              and AMD driver directories. Resolves shader compilation stutter.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => cleanShader.mutate()}
          disabled={cleanShader.isPending}
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border/80 bg-surface px-3.5 text-xs font-semibold text-text transition hover:bg-surface-raised hover:border-accent/40 active:scale-95 disabled:opacity-50"
        >
          {cleanShader.isPending ? (
            <RefreshCw className="size-3.5 animate-spin text-accent" />
          ) : (
            <HardDrive className="size-3.5 text-purple-400" />
          )}
          <span>{cleanShader.isPending ? 'Purging Cache...' : 'Purge Shader Cache'}</span>
        </button>
      </div>
    </div>
  )
}
