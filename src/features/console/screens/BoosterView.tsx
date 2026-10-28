import React, { useEffect, useState } from 'react'
import { Zap, Cpu, RotateCcw, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { runGameBoost, restoreGameBoost, type BoostReport } from '@/services/booster'
import { getLiveMetrics } from '@/services/system'
import { formatBytes } from '@/features/library/utils/guess-name'
import { FocusScope, useFocusable } from '../nav/FocusScope'

export const BoosterView: React.FC = () => {
  const [cpuPct, setCpuPct] = useState(0)
  const [ramGb, setRamGb] = useState('0.0')
  const [busy, setBusy] = useState(false)
  const [lastReport, setLastReport] = useState<BoostReport | null>(null)

  const refreshMetrics = () => {
    getLiveMetrics()
      .then((m) => {
        setCpuPct(Math.round(m.cpu_usage_percent))
        setRamGb(((m.memory?.used_bytes ?? 0) / (1024 * 1024 * 1024)).toFixed(1))
      })
      .catch(() => {})
  }

  useEffect(() => {
    refreshMetrics()
  }, [])

  const handleBoost = async () => {
    if (busy) return
    setBusy(true)
    try {
      const report = await runGameBoost()
      setLastReport(report)
      toast.success('Console Game Boost applied!')
      refreshMetrics()
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
      toast.success('Default system power plan restored!')
      refreshMetrics()
    } catch {
      // Ignore
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

  return (
    <FocusScope id="console_booster_scope" orientation="vertical" className="space-y-6 pb-16">
      <div className="p-8 rounded-3xl bg-gradient-to-r from-amber-500/15 via-slate-900 to-slate-950 border border-amber-400/30 flex flex-col md:flex-row items-center justify-between gap-6">
        <div>
          <span className="text-xs font-extrabold uppercase tracking-widest text-amber-300">
            One-Button Console Optimization
          </span>
          <h1 className="text-3xl font-black text-white mt-1">System Booster & RAM Purge</h1>
          <p className="text-sm text-slate-300 mt-1">
            Trims background working sets and activates High Performance Windows power scheduling.
          </p>
        </div>

        <div className="flex items-center gap-4">
          <button
            type="button"
            {...boostBtn.focusProps}
            disabled={busy}
            className={`px-7 py-4 rounded-2xl font-extrabold text-base flex items-center gap-2.5 transition-all ${
              boostBtn.isFocused
                ? 'bg-amber-400 text-slate-950 scale-105 ring-4 ring-amber-300/60 shadow-xl'
                : 'bg-amber-500 text-slate-950'
            }`}
          >
            <Zap className="w-5 h-5 fill-current" />
            <span>{busy ? 'Optimizing...' : 'Engage Game Boost'}</span>
          </button>

          <button
            type="button"
            {...restoreBtn.focusProps}
            disabled={busy}
            className={`px-5 py-4 rounded-2xl font-bold text-sm flex items-center gap-2 border transition-all ${
              restoreBtn.isFocused
                ? 'bg-cyan-400 text-slate-950 border-cyan-300 scale-105'
                : 'bg-white/10 text-slate-200 border-white/15'
            }`}
          >
            <RotateCcw className="w-4 h-4" />
            <span>Restore Default</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="p-6 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-between">
          <span className="flex items-center gap-3 text-lg font-bold text-white">
            <Cpu className="w-6 h-6 text-cyan-400" />
            Live CPU Utilization
          </span>
          <span className="text-3xl font-black text-cyan-300">{cpuPct}%</span>
        </div>

        <div className="p-6 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-between">
          <span className="flex items-center gap-3 text-lg font-bold text-white">
            <Zap className="w-6 h-6 text-amber-400" />
            Active Memory Used
          </span>
          <span className="text-3xl font-black text-amber-300">{ramGb} GB</span>
        </div>
      </div>

      {lastReport && (
        <div className="p-6 rounded-3xl bg-emerald-500/10 border border-emerald-400/30 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-extrabold text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5" />
              Last Boost Report
            </h2>
            <span className="text-sm font-black text-white">
              Freed {formatBytes(lastReport.freed_ram_bytes)}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {lastReport.steps.map((step) => (
              <div
                key={step.id}
                className="p-3.5 rounded-2xl bg-slate-950/70 border border-white/10 flex items-center justify-between text-xs"
              >
                <span className="font-bold text-white">{step.label}</span>
                <span className="text-slate-300">{step.metric || step.detail}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </FocusScope>
  )
}
