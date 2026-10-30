import React, { useEffect, useState } from 'react'
import { Zap, RotateCcw, CheckCircle2 } from 'lucide-react'
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
      <div className="flex items-center justify-between gap-6 px-6 pb-2 pt-2">
        <h1 className="text-[2.6rem] font-semibold tracking-tight text-white">Booster</h1>

        <div className="flex items-center gap-4">
          <button
            type="button"
            {...boostBtn.focusProps}
            disabled={busy}
            className={`px-7 py-4 rounded-2xl font-semibold text-base flex items-center gap-2.5 transition-all ${
              boostBtn.isFocused
                ? 'bg-white text-black scale-105 shadow-[0_18px_50px_-8px_var(--console-ambient,#7dd3fc)]'
                : 'bg-white/92 text-black/90'
            }`}
          >
            <Zap className="w-5 h-5 fill-current" />
            <span>{busy ? 'Optimizing…' : 'Boost'}</span>
          </button>

          <button
            type="button"
            {...restoreBtn.focusProps}
            disabled={busy}
            className={`px-5 py-4 rounded-2xl font-bold text-sm flex items-center gap-2 border transition-all ${
              restoreBtn.isFocused
                ? 'bg-white text-black border-transparent scale-105'
                : 'bg-white/10 text-slate-200 border-transparent'
            }`}
          >
            <RotateCcw className="w-4 h-4" />
            <span>Restore</span>
          </button>
        </div>
      </div>

      <div className="flex gap-16 px-6 pt-6">
        <div>
          <p className="text-[0.95rem] text-white/45">CPU</p>
          <p className="text-[3.6rem] font-semibold leading-none tracking-tight text-white">
            {cpuPct}
            <span className="ml-1 text-[1.4rem] text-white/45">%</span>
          </p>
        </div>
        <div>
          <p className="text-[0.95rem] text-white/45">Memory</p>
          <p className="text-[3.6rem] font-semibold leading-none tracking-tight text-white">
            {ramGb}
            <span className="ml-1 text-[1.4rem] text-white/45">GB</span>
          </p>
        </div>
      </div>

      {lastReport && (
        <div className="space-y-3 rounded-3xl bg-white/[0.06] p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5" />
              Last boost
            </h2>
            <span className="text-sm font-semibold text-white">
              Freed {formatBytes(lastReport.freed_ram_bytes)}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {lastReport.steps.map((step) => (
              <div
                key={step.id}
                className="p-3.5 rounded-2xl bg-slate-950/70 border border-transparent flex items-center justify-between text-xs"
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
