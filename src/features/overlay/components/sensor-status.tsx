import React from 'react'
import { Activity, CheckCircle2, CircleAlert, Thermometer } from 'lucide-react'
import { useOverlayStore } from '../store/overlay-store'

interface RowProps {
  icon: React.ReactNode
  title: string
  ok: boolean
  detail: string
  hint?: string
}

const Row: React.FC<RowProps> = ({ icon, title, ok, detail, hint }) => (
  <div className="flex items-start gap-3 rounded-xl border border-border bg-surface-raised p-3">
    <div className="mt-0.5 text-cyan-500">{icon}</div>
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-text">
        {title}
        {ok ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
        ) : (
          <CircleAlert className="h-3.5 w-3.5 text-amber-500" />
        )}
      </div>
      <div className="text-[11px] text-muted">{detail}</div>
      {!ok && hint && <div className="mt-1 text-[10px] leading-relaxed text-amber-500">{hint}</div>}
    </div>
  </div>
)

/** Explains, per sensor, whether it works and what to do when it does not. */
export const SensorStatusPanel: React.FC = () => {
  const status = useOverlayStore((s) => s.providerStatus)
  if (!status) return null

  const fpsOk = status.frame_timing
  const cpuOk = status.cpu_temp_source != null

  return (
    <div className="space-y-3 border-t border-border pt-4">
      <h2 className="flex items-center gap-2 text-base font-bold text-text">
        <Activity className="h-4 w-4 text-cyan-500 dark:text-cyan-400" />
        Sensor Status
      </h2>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Row
          icon={<Activity className="h-4 w-4" />}
          title="FPS / Frame time"
          ok={fpsOk}
          detail={
            fpsOk
              ? 'Measured from Present events (ETW)'
              : (status.frame_timing_error ?? 'Starting…')
          }
          hint="Run Nexus as administrator. FPS is measured for DirectX 9/10/11/12 games."
        />
        <Row
          icon={<Thermometer className="h-4 w-4" />}
          title="CPU temperature"
          ok={cpuOk}
          detail={cpuOk ? `Source: ${status.cpu_temp_source}` : 'No temperature sensor available'}
          hint="Windows exposes no CPU sensor without a driver. Start LibreHardwareMonitor and enable Options → Remote Web Server (port 8085); Nexus reads it automatically."
        />
      </div>
      <p className="text-[10px] leading-relaxed text-muted">
        GPU hotspot is read directly on AMD cards. On NVIDIA it needs the same LibreHardwareMonitor
        web server.
      </p>
    </div>
  )
}
