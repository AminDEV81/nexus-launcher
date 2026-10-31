import React, { useEffect, useState } from 'react'
import {
  Zap,
  Cpu,
  RotateCcw,
  CheckCircle2,
  Activity,
  ShieldCheck,
  Trash2,
  RefreshCw,
  HardDrive,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  runGameBoost,
  restoreGameBoost,
  scanBoostableApps,
  killSelectedApps,
  type BoostReport,
  type BoostableApp,
} from '@/services/booster'
import { getLiveMetrics } from '@/services/system'
import { formatBytes } from '@/features/library/utils/guess-name'
import { useConsoleStore } from '../store/console-store'
import { CONSOLE_THEMES } from '../theme/tokens'
import { FocusScope, useFocusable } from '../nav/FocusScope'

export const BoosterView: React.FC = () => {
  const themeId = useConsoleStore((s) => s.theme)
  const isLight = Boolean(CONSOLE_THEMES[themeId]?.isLight)

  const [cpuPct, setCpuPct] = useState(0)
  const [cpuFreq, setCpuFreq] = useState(0)
  const [ramUsedBytes, setRamUsedBytes] = useState(0)
  const [ramTotalBytes, setRamTotalBytes] = useState(16 * 1024 * 1024 * 1024)
  const [busy, setBusy] = useState(false)
  const [lastReport, setLastReport] = useState<BoostReport | null>(null)
  const [apps, setApps] = useState<BoostableApp[]>([])
  const [selectedApps, setSelectedApps] = useState<Set<string>>(new Set())

  const refreshTelemetryAndApps = () => {
    getLiveMetrics()
      .then((m) => {
        setCpuPct(Math.round(m.cpu_usage_percent))
        setCpuFreq(m.cpu_frequency_mhz || 0)
        setRamUsedBytes(m.memory?.used_bytes ?? 0)
        setRamTotalBytes(Math.max(1, m.memory?.total_bytes ?? 16 * 1024 * 1024 * 1024))
      })
      .catch(() => {})

    scanBoostableApps()
      .then((list) => {
        setApps(list)
        setSelectedApps(new Set(list.map((a) => a.name)))
      })
      .catch(() => {})
  }

  useEffect(() => {
    refreshTelemetryAndApps()
    const id = window.setInterval(() => {
      getLiveMetrics()
        .then((m) => {
          setCpuPct(Math.round(m.cpu_usage_percent))
          setCpuFreq(m.cpu_frequency_mhz || 0)
          setRamUsedBytes(m.memory?.used_bytes ?? 0)
          setRamTotalBytes(Math.max(1, m.memory?.total_bytes ?? 16 * 1024 * 1024 * 1024))
        })
        .catch(() => {})
    }, 3500)
    return () => window.clearInterval(id)
  }, [])

  const handleBoost = async () => {
    if (busy) return
    setBusy(true)
    try {
      const report = await runGameBoost()
      setLastReport(report)
      toast.success(
        `Turbo Game Boost engaged! Freed ${formatBytes(report.freed_ram_bytes)}`,
      )
      refreshTelemetryAndApps()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Boost failed')
    } finally {
      setBusy(false)
    }
  }

  const handleRestore = async () => {
    if (busy) return
    setBusy(true)
    try {
      await restoreGameBoost()
      toast.success('Default Windows power plan & priorities restored!')
      refreshTelemetryAndApps()
    } catch {
      // Ignore
    } finally {
      setBusy(false)
    }
  }

  const handleKillSelected = async () => {
    if (busy || selectedApps.size === 0) return
    setBusy(true)
    try {
      const res = await killSelectedApps(Array.from(selectedApps))
      toast.success(res.detail || `Closed ${selectedApps.size} background apps`)
      refreshTelemetryAndApps()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not close selected apps')
    } finally {
      setBusy(false)
    }
  }

  const boostBtn = useFocusable<HTMLButtonElement>({
    id: 'booster_run_btn',
    scopeId: 'console_booster_scope',
    onConfirm: () => {
      void handleBoost()
    },
  })

  const restoreBtn = useFocusable<HTMLButtonElement>({
    id: 'booster_restore_btn',
    scopeId: 'console_booster_scope',
    onConfirm: () => {
      void handleRestore()
    },
  })

  const rescanBtn = useFocusable<HTMLButtonElement>({
    id: 'booster_rescan_btn',
    scopeId: 'console_booster_scope',
    onConfirm: refreshTelemetryAndApps,
  })

  const killAppsBtn = useFocusable<HTMLButtonElement>({
    id: 'booster_kill_apps_btn',
    scopeId: 'console_booster_scope',
    onConfirm: () => {
      void handleKillSelected()
    },
  })

  const ramPct = Math.min(100, Math.round((ramUsedBytes / ramTotalBytes) * 100))
  const reclaimableBytes = apps
    .filter((a) => selectedApps.has(a.name))
    .reduce((acc, a) => acc + a.memory_bytes, 0)

  return (
    <FocusScope id="console_booster_scope" orientation="vertical" className="space-y-7 pb-20">
      {/* Hero Turbo Optimizer Deck */}
      <div
        className={`relative overflow-hidden rounded-[2rem] border p-8 shadow-2xl ${
          isLight
            ? 'border-amber-300 bg-white'
            : 'border-amber-400/35 bg-gradient-to-r from-[#24160e] via-[#10182b] to-[#0c1324]'
        }`}
      >
        <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-amber-400/20 border border-amber-400/40 px-3.5 py-1 text-xs font-extrabold uppercase tracking-wider text-amber-300">
              <Zap className="size-3.5 fill-current" />
              Real-Time Kernel Working-Set & Power Optimizer
            </div>
            <h1
              className={`text-3xl md:text-4xl font-black tracking-tight ${
                isLight ? 'text-slate-900' : 'text-white'
              }`}
            >
              Nexus System Booster & RAM Purge
            </h1>
            <p className={`text-sm leading-relaxed ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>
              Reclaims background memory via Win32 EmptyWorkingSet, switches Windows into High
              Performance scheduling, and suspends non-essential desktop bloatware before launch.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3.5 shrink-0">
            <button
              type="button"
              {...boostBtn.focusProps}
              disabled={busy}
              className={`flex items-center gap-2.5 rounded-2xl px-8 py-4 text-base font-extrabold transition-all cursor-pointer ${
                boostBtn.isFocused
                  ? 'scale-105 bg-amber-400 text-slate-950 ring-4 ring-amber-300/60 shadow-[0_0_35px_rgba(251,191,36,0.65)]'
                  : 'bg-amber-500 text-slate-950 hover:bg-amber-400'
              }`}
            >
              <Zap className="size-5 fill-current" />
              <span>{busy ? 'Optimizing System...' : 'Engage Turbo Boost'}</span>
            </button>

            <button
              type="button"
              {...restoreBtn.focusProps}
              disabled={busy}
              className={`flex items-center gap-2 rounded-2xl border px-5 py-4 text-sm font-bold transition-all cursor-pointer ${
                restoreBtn.isFocused
                  ? 'scale-105 border-cyan-300 bg-cyan-400 text-slate-950'
                  : isLight
                    ? 'border-slate-300 bg-slate-100 text-slate-800'
                    : 'border-white/15 bg-white/10 text-white'
              }`}
            >
              <RotateCcw className="size-4" />
              <span>Restore Default</span>
            </button>

            <button
              type="button"
              {...rescanBtn.focusProps}
              className={`flex items-center gap-2 rounded-2xl border p-4 text-sm font-bold transition-all cursor-pointer ${
                rescanBtn.isFocused
                  ? 'scale-105 border-cyan-300 bg-cyan-400 text-slate-950'
                  : isLight
                    ? 'border-slate-300 bg-slate-100 text-slate-800'
                    : 'border-white/15 bg-white/10 text-white'
              }`}
            >
              <RefreshCw className="size-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Live Telemetry Gauges */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div
          className={`rounded-3xl border p-6 space-y-3 ${
            isLight ? 'border-slate-300 bg-white/90' : 'border-white/15 bg-white/[0.04]'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-extrabold text-cyan-400 uppercase tracking-wider">
              <Cpu className="size-5" />
              CPU Utilization
            </span>
            <span className={`text-3xl font-black ${isLight ? 'text-slate-900' : 'text-white'}`}>
              {cpuPct}%
            </span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-sky-500 transition-all duration-500"
              style={{ width: `${Math.min(100, cpuPct)}%` }}
            />
          </div>
          <p className="text-xs text-slate-400 font-semibold">
            Clock Frequency: {cpuFreq > 0 ? `${cpuFreq} MHz` : 'Dynamic Boost Active'}
          </p>
        </div>

        <div
          className={`rounded-3xl border p-6 space-y-3 ${
            isLight ? 'border-slate-300 bg-white/90' : 'border-white/15 bg-white/[0.04]'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-extrabold text-amber-400 uppercase tracking-wider">
              <HardDrive className="size-5" />
              System Memory
            </span>
            <span className={`text-3xl font-black ${isLight ? 'text-slate-900' : 'text-white'}`}>
              {ramPct}%
            </span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-400 to-rose-500 transition-all duration-500"
              style={{ width: `${ramPct}%` }}
            />
          </div>
          <p className="text-xs text-slate-400 font-semibold">
            {formatBytes(ramUsedBytes)} used of {formatBytes(ramTotalBytes)}
          </p>
        </div>

        <div
          className={`rounded-3xl border p-6 space-y-3 ${
            isLight ? 'border-slate-300 bg-white/90' : 'border-white/15 bg-white/[0.04]'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-extrabold text-emerald-400 uppercase tracking-wider">
              <Activity className="size-5" />
              Reclaimable RAM
            </span>
            <span className="text-3xl font-black text-emerald-400">
              {reclaimableBytes > 0 ? formatBytes(reclaimableBytes) : 'Optimized'}
            </span>
          </div>
          <p className="text-xs text-slate-400 font-semibold pt-2">
            {apps.length} non-essential background processes detected
          </p>
        </div>
      </div>

      {/* Last Boost Report */}
      {lastReport && (
        <div className="rounded-3xl border border-emerald-400/40 bg-emerald-500/10 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-extrabold text-emerald-300">
              <CheckCircle2 className="size-5" />
              Turbo Optimization Complete
            </h2>
            <span className="rounded-full bg-emerald-400 px-3 py-1 text-xs font-black text-slate-950">
              Freed {formatBytes(lastReport.freed_ram_bytes)}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {lastReport.steps.map((step) => (
              <div
                key={step.id}
                className="rounded-2xl border border-white/10 bg-slate-950/70 p-3.5 text-xs space-y-1"
              >
                <p className="font-extrabold text-white">{step.label}</p>
                <p className="text-emerald-300 font-semibold">{step.metric || step.detail}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Interactive Background Process Scanner */}
      <div
        className={`rounded-3xl border p-6 space-y-4 ${
          isLight ? 'border-slate-300 bg-white/90' : 'border-white/15 bg-white/[0.04]'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="size-5 text-cyan-400" />
            <div>
              <h2 className={`text-xl font-extrabold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                Background Process Manager ({apps.length})
              </h2>
              <p className="text-xs text-slate-400">
                Toggle apps below or close selected apps to free extra RAM before gaming
              </p>
            </div>
          </div>

          {apps.length > 0 && (
            <button
              type="button"
              {...killAppsBtn.focusProps}
              disabled={busy || selectedApps.size === 0}
              className={`flex items-center gap-2 rounded-2xl border px-5 py-3 text-xs font-extrabold transition-all cursor-pointer ${
                killAppsBtn.isFocused
                  ? 'scale-105 border-rose-300 bg-rose-500 text-white shadow-lg'
                  : 'border-rose-500/40 bg-rose-500/15 text-rose-300'
              }`}
            >
              <Trash2 className="size-4" />
              <span>
                Close {selectedApps.size} Selected ({formatBytes(reclaimableBytes)})
              </span>
            </button>
          )}
        </div>

        {apps.length === 0 ? (
          <p className="py-6 text-center text-sm text-emerald-400 font-bold">
            No heavy background bloatware detected — your system is clean!
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {apps.map((app) => {
              const checked = selectedApps.has(app.name)
              return (
                <BoostAppCard
                  key={app.name}
                  app={app}
                  checked={checked}
                  isLight={isLight}
                  onToggle={() => {
                    setSelectedApps((prev) => {
                      const next = new Set(prev)
                      if (next.has(app.name)) next.delete(app.name)
                      else next.add(app.name)
                      return next
                    })
                  }}
                />
              )
            })}
          </div>
        )}
      </div>
    </FocusScope>
  )
}

const BoostAppCard: React.FC<{
  app: BoostableApp
  checked: boolean
  isLight: boolean
  onToggle: () => void
}> = ({ app, checked, isLight, onToggle }) => {
  const { focusProps, isFocused } = useFocusable<HTMLButtonElement>({
    id: `boost_app_${app.name.replace(/[^a-zA-Z0-9]/g, '_')}`,
    scopeId: 'console_booster_scope',
    onConfirm: onToggle,
  })
  return (
    <button
      type="button"
      {...focusProps}
      className={`flex items-center justify-between rounded-2xl border p-4 text-left transition-all cursor-pointer ${
        isFocused
          ? 'scale-[1.02] border-cyan-300 bg-cyan-400 text-slate-950 shadow-lg'
          : checked
            ? isLight
              ? 'border-amber-400 bg-amber-50 text-slate-900'
              : 'border-amber-400/40 bg-amber-500/10 text-white'
            : isLight
              ? 'border-slate-200 bg-slate-50 text-slate-700'
              : 'border-white/10 bg-slate-950/60 text-slate-300'
      }`}
    >
      <div className="min-w-0 pr-3">
        <p className="truncate text-sm font-extrabold">{app.name}</p>
        <p className={`text-xs ${isFocused ? 'text-slate-800' : 'text-slate-400'}`}>
          {app.instance_count} {app.instance_count === 1 ? 'process' : 'processes'} · {app.category}
        </p>
      </div>
      <span
        className={`shrink-0 rounded-xl px-3 py-1 text-xs font-black ${
          isFocused
            ? 'bg-slate-950 text-cyan-300'
            : checked
              ? 'bg-amber-400 text-slate-950'
              : 'bg-white/10 text-slate-300'
        }`}
      >
        {formatBytes(app.memory_bytes)}
      </span>
    </button>
  )
}
