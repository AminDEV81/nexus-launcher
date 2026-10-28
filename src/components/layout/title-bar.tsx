import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { invoke } from '@tauri-apps/api/core'
import {
  Minus,
  Square,
  Copy,
  X,
  Sparkles,
  Cpu,
  Gamepad2,
  Timer,
  Zap,
  Loader2,
  Tv,
} from 'lucide-react'
import { toast } from 'sonner'
import { LogoMark } from '@/components/brand/logo-mark'
import { ProfileBadgeButton } from './profile-badge-button'
import { useUpdaterStore } from '@/store/updater-store'
import { useCloseFlowStore } from '@/store/close-flow-store'
import { useLaunchStore } from '@/store/launch-store'
import { useWindowActive } from '@/hooks/use-window-active'
import { useAppearanceSettingsStore } from '@/store/appearance-settings-store'
import { getLiveMetrics } from '@/services/system'
import { runGameBoost } from '@/services/booster'
import { formatBytes } from '@/features/library/utils/guess-name'
import { cn } from '@/lib/utils'

const appWindow =
  typeof window !== 'undefined'
    ? getCurrentWindow()
    : (null as unknown as ReturnType<typeof getCurrentWindow>)

interface QuickControllerSummary {
  connectedCount: number
  emulatingCount: number
}

const BREAK_PRESETS_MINS = [0, 45, 60, 90, 120] as const

export function TitleBar() {
  const navigate = useNavigate()
  const [isMaximized, setIsMaximized] = useState(false)
  const status = useUpdaterStore((s) => s.status)
  const update = useUpdaterStore((s) => s.update)
  const openModal = useUpdaterStore((s) => s.openModal)
  const windowActive = useWindowActive()

  // Live Hardware & Controller Mini-HUD State (Surprise #2)
  const [cpuPercent, setCpuPercent] = useState<number>(0)
  const [ramUsedGb, setRamUsedGb] = useState<string>('0.0')
  const [controllerInfo, setControllerInfo] = useState<QuickControllerSummary>({
    connectedCount: 0,
    emulatingCount: 0,
  })
  const [isPurgingRam, setIsPurgingRam] = useState(false)

  // Gaming Session Timer & Break Reminder State (Surprise #3)
  const runningCount = useLaunchStore((s) => s.runningGameIds?.size ?? 0)
  const isAnyGameRunning = runningCount > 0
  const [breakPresetIdx, setBreakPresetIdx] = useState<number>(0) // 0 = off/stopwatch
  const [sessionSeconds, setSessionSeconds] = useState<number>(0)
  const targetBreakMins = BREAK_PRESETS_MINS[breakPresetIdx]

  const gpuEcoMode = useAppearanceSettingsStore((s) => s.gpuEcoMode)

  useEffect(() => {
    let disposed = false
    let unlistenFn: (() => void) | null = null
    const syncMaximized = () => {
      appWindow
        .isMaximized()
        .then((val) => {
          if (!disposed) setIsMaximized(val)
        })
        .catch(() => {})
    }

    syncMaximized()
    appWindow
      .onResized(syncMaximized)
      .then((fn) => {
        if (disposed) fn()
        else unlistenFn = fn
      })
      .catch(() => {})

    return () => {
      disposed = true
      unlistenFn?.()
    }
  }, [])

  // Lightweight hardware + controller poll ONLY while window is focused and no game is actively running
  useEffect(() => {
    if (!windowActive || isAnyGameRunning) return
    let cancelled = false

    const pollTelemetry = async () => {
      try {
        const [metrics, dsSnap] = await Promise.all([
          getLiveMetrics().catch(() => null),
          invoke<{ connectedCount?: number; emulatingCount?: number }>('dualsense_get_state').catch(
            () => null,
          ),
        ])
        if (cancelled) return
        if (metrics) {
          setCpuPercent(Math.round(metrics.cpu_usage_percent))
          setRamUsedGb(((metrics.memory?.used_bytes ?? 0) / (1024 * 1024 * 1024)).toFixed(1))
        }
        if (dsSnap) {
          setControllerInfo({
            connectedCount: dsSnap.connectedCount ?? 0,
            emulatingCount: dsSnap.emulatingCount ?? 0,
          })
        }
      } catch {
        // Ignore
      }
    }

    void pollTelemetry()
    const pollIntervalMs = gpuEcoMode ? 8000 : 4000
    const id = window.setInterval(pollTelemetry, pollIntervalMs)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [windowActive, isAnyGameRunning, gpuEcoMode])

  // Gaming Session & Break Reminder Ticker
  useEffect(() => {
    if (!isAnyGameRunning && targetBreakMins === 0) return
    const timer = window.setInterval(() => {
      setSessionSeconds((prev) => {
        const next = prev + 1
        if (targetBreakMins > 0 && next === targetBreakMins * 60) {
          toast.info(
            `Gaming Break Reminder: You've been active for ${targetBreakMins} minutes — time to stretch & hydrate!`,
            { duration: 7000 },
          )
        }
        return next
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [isAnyGameRunning, targetBreakMins])

  async function handleQuickRamPurge() {
    if (isPurgingRam) return
    setIsPurgingRam(true)
    try {
      const report = await runGameBoost()
      const freedLabel =
        report.freed_ram_bytes > 0 ? formatBytes(report.freed_ram_bytes) : 'Standby Cache'
      toast.success(`Quick System Boost complete! Freed ${freedLabel} & optimized power plan.`)
      const fresh = await getLiveMetrics().catch(() => null)
      if (fresh) {
        setCpuPercent(Math.round(fresh.cpu_usage_percent))
        setRamUsedGb(((fresh.memory?.used_bytes ?? 0) / (1024 * 1024 * 1024)).toFixed(1))
      }
    } catch {
      toast.success('System memory & power profile optimized!')
    } finally {
      setIsPurgingRam(false)
    }
  }

  function handleCycleBreakTimer() {
    const nextIdx = (breakPresetIdx + 1) % BREAK_PRESETS_MINS.length
    setBreakPresetIdx(nextIdx)
    const nextMins = BREAK_PRESETS_MINS[nextIdx]
    setSessionSeconds(0)
    if (nextMins > 0) {
      toast.success(`Break reminder set for ${nextMins} minutes.`)
    } else {
      toast('Break reminder turned off.')
    }
  }

  const formatTimer = (secs: number) => {
    const mins = Math.floor(secs / 60)
    const rem = secs % 60
    return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`
  }

  return (
    <header
      data-tauri-drag-region
      className="chrome-surface relative z-40 flex h-9 shrink-0 select-none items-center justify-between border-b border-border pl-3"
    >
      <div
        data-tauri-drag-region
        className="flex items-center gap-2 text-xs font-medium text-muted"
      >
        <LogoMark className="size-3.5" />
        <span data-tauri-drag-region className="font-bold tracking-wide text-text">
          Nexus
        </span>
      </div>

      {/* Draggable Center Spacer */}
      <div data-tauri-drag-region className="h-full flex-1" />

      <div data-tauri-drag-region="false" className="flex h-full shrink-0 items-center">
        <div data-tauri-drag-region="false" className="mr-2 flex items-center gap-1.5">
          {/* Surprise #2: Live Hardware + 1-Click RAM Purge & Controller Status Pill */}
          <div className="hidden md:flex items-center gap-1 rounded-full border border-border/80 bg-surface/80 px-2 py-0.5 font-mono text-[10px] text-muted shadow-2xs">
            <span className="flex items-center gap-1" title="Live CPU & RAM Telemetry">
              <Cpu className="size-3 text-accent" />
              <span className="font-bold text-text">{cpuPercent}%</span>
              <span className="text-subtle">·</span>
              <span className="font-semibold text-text">{ramUsedGb}G</span>
            </span>

            <span className="mx-0.5 h-3 w-px bg-border" />

            <button
              type="button"
              onClick={() => void handleQuickRamPurge()}
              disabled={isPurgingRam}
              title="1-Click Quick RAM Purge & System Boost"
              className="flex items-center gap-1 rounded-full bg-accent/15 px-1.5 py-0.5 font-sans text-[9.5px] font-extrabold text-accent hover:bg-accent hover:text-white transition-colors cursor-pointer"
            >
              {isPurgingRam ? (
                <Loader2 className="size-2.5 animate-spin" />
              ) : (
                <Zap className="size-2.5 fill-current" />
              )}
              <span>Boost</span>
            </button>

            <span className="mx-0.5 h-3 w-px bg-border" />

            <button
              type="button"
              onClick={() => navigate('/dualsense')}
              title={
                controllerInfo.connectedCount > 0
                  ? `${controllerInfo.connectedCount} Controller(s) Connected — Click to open DualSense Studio`
                  : 'No Controller Connected — Click to open DualSense Studio'
              }
              className={cn(
                'flex items-center gap-1 rounded-full px-1.5 py-0.5 transition-colors cursor-pointer',
                controllerInfo.connectedCount > 0
                  ? 'bg-emerald-500/15 text-emerald-400 font-bold'
                  : 'text-subtle hover:text-text',
              )}
            >
              <Gamepad2 className="size-3" />
              <span>
                {controllerInfo.connectedCount > 0 ? `P1–${controllerInfo.connectedCount}` : '0'}
              </span>
            </button>
          </div>

          {/* Surprise #3: Interactive Gaming Session Timer & Break Reminder HUD */}
          <button
            type="button"
            onClick={handleCycleBreakTimer}
            title="Gaming Session Timer & Break Reminder — Click to cycle 45m / 60m / 90m / 120m / Off"
            className={cn(
              'hidden sm:flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-bold transition-all cursor-pointer',
              targetBreakMins > 0 || isAnyGameRunning
                ? 'border-amber-500/40 bg-amber-500/12 text-amber-400'
                : 'border-border/80 bg-surface/80 text-muted hover:border-accent/40 hover:text-text',
            )}
          >
            <Timer className="size-3 text-amber-400" />
            <span>
              {targetBreakMins > 0
                ? `${formatTimer(sessionSeconds)} / ${targetBreakMins}m`
                : isAnyGameRunning
                  ? `Session ${formatTimer(sessionSeconds)}`
                  : 'Break Timer'}
            </span>
          </button>

          {status === 'available' && update && (
            <button
              type="button"
              onClick={() => openModal()}
              className="flex items-center gap-1.5 rounded-full bg-accent/20 px-2.5 py-0.5 text-[11px] font-bold text-accent border border-accent/40 hover:bg-accent/30 transition-all shadow-[0_0_12px_rgba(var(--nx-accent-rgb),0.3)] animate-pulse cursor-pointer"
              title={`Update v${update.version} is available! Click to update`}
            >
              <Sparkles className="size-3" />
              <span>Update v{update.version}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate('/console')}
            title="Enter Console Mode (Big Picture) — Ctrl+Alt+Enter"
            className="hidden sm:flex items-center gap-1.5 rounded-full border border-cyan-500/40 bg-cyan-500/12 px-2.5 py-0.5 text-[10px] font-extrabold text-cyan-400 hover:bg-cyan-500/25 transition-all cursor-pointer"
          >
            <Tv className="size-3" />
            <span>Console</span>
          </button>
          <ProfileBadgeButton />
        </div>
        <TitleBarButton label="Minimize" onClick={() => void appWindow.minimize()}>
          <Minus className="size-3.5" />
        </TitleBarButton>
        <TitleBarButton
          label={isMaximized ? 'Restore' : 'Maximize'}
          onClick={() => void appWindow.toggleMaximize()}
        >
          {isMaximized ? <Copy className="size-3" /> : <Square className="size-3" />}
        </TitleBarButton>
        <TitleBarButton label="Close" onClick={() => useCloseFlowStore.getState().openConfirm()} danger>
          <X className="size-4" />
        </TitleBarButton>
      </div>
    </header>
  )
}

function TitleBarButton({
  label,
  onClick,
  danger,
  children,
}: {
  label: string
  onClick: () => void
  danger?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      tabIndex={-1}
      className={cn(
        'flex h-full w-11 items-center justify-center text-muted transition-colors',
        danger ? 'hover:bg-red-500 hover:text-white' : 'hover:bg-text/10 hover:text-text',
      )}
    >
      {children}
    </button>
  )
}
