import React from 'react'
import { Activity, CheckCircle2, CircleAlert, Cpu, Tv, Thermometer } from 'lucide-react'
import { useOverlayStore } from '../store/overlay-store'

interface RowProps {
  icon: React.ReactNode
  title: string
  ok: boolean
  detail: string
  hint?: string
}

const Row: React.FC<RowProps> = ({ icon, title, ok, detail, hint }) => (
  <div className="flex items-start gap-3 rounded-xl border border-border bg-surface-raised p-3.5 shadow-2xs">
    <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-cyan-500/25 bg-cyan-500/10 text-cyan-500 dark:text-cyan-400">
      {icon}
    </div>
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-1.5 text-xs font-bold text-text">
        <span>{title}</span>
        {ok ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
        ) : (
          <CircleAlert className="h-3.5 w-3.5 text-amber-500 shrink-0" />
        )}
      </div>
      <div className="mt-0.5 text-[11px] font-medium text-muted">{detail}</div>
      {!ok && hint && (
        <div className="mt-1 text-[10px] leading-relaxed text-amber-500">{hint}</div>
      )}
    </div>
  </div>
)

/** Explains, per sensor, whether it works and what source is providing the telemetry. */
export const SensorStatusPanel: React.FC = () => {
  const status = useOverlayStore((s) => s.providerStatus)
  const metrics = useOverlayStore((s) => s.metrics)
  if (!status) return null

  const fpsOk = status.frame_timing
  const cpuOk = status.cpu_temp_source != null || metrics.cpu_temp != null
  const gpuOk = status.gpu && (metrics.gpu_name != null || metrics.gpu_usage != null)

  return (
    <div className="space-y-3 border-t border-border pt-4">
      <h2 className="flex items-center gap-2 text-base font-bold text-text">
        <Activity className="h-4 w-4 text-cyan-500 dark:text-cyan-400" />
        Hardware Sensor Telemetry Status
      </h2>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Row
          icon={<Activity className="h-4 w-4" />}
          title="FPS & Frame Pacing (ETW)"
          ok={fpsOk}
          detail={
            fpsOk
              ? 'Active — PresentMon ETW Kernel Stream'
              : (status.frame_timing_error ?? 'Awaiting active 3D game window…')
          }
          hint="Run Nexus as administrator for sub-millisecond DirectX/Vulkan Present() frame timing."
        />
        <Row
          icon={<Thermometer className="h-4 w-4" />}
          title="CPU Thermal & Power"
          ok={cpuOk}
          detail={
            cpuOk
              ? `Active — ${status.cpu_temp_source ?? 'Multi-Layer Thermal Engine'}${
                  metrics.cpu_temp != null ? ` (${metrics.cpu_temp.toFixed(1)}°C)` : ''
                }`
              : 'Initializing CPU thermal provider…'
          }
          hint="Supports LibreHardwareMonitor/OpenHardwareMonitor (HTTP & WMI), Windows ACPI Thermal Zones, and Smart Thermal Telemetry across all Intel & AMD CPUs."
        />
        <Row
          icon={<Tv className="h-4 w-4" />}
          title="Multi-Vendor GPU Engine"
          ok={gpuOk}
          detail={
            metrics.gpu_name
              ? `Active — ${metrics.gpu_name}`
              : 'Active — Universal WDDM 3D/VRAM Telemetry'
          }
          hint="Supports NVIDIA (NVML), AMD Radeon (ADL2 PMLog), and Intel Arc / Iris / UHD (Windows PDH GPU Engine & Adapter Memory)."
        />
      </div>
    </div>
  )
}
