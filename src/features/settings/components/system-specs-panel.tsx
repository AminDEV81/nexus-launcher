import { useState } from 'react'
import {
  Cpu,
  HardDrive,
  Monitor,
  Activity,
  RefreshCw,
  Copy,
  Check,
  Layers,
  Sparkles,
  Server,
  Clock,
  Laptop,
  Zap,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { useSystemSpecs, useLiveSystemMetrics, useBoostRam } from '../hooks/use-system-specs'
import { cn } from '@/lib/utils'

function formatBytes(bytes?: number | null): string {
  if (bytes == null || isNaN(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const idx = Math.min(i, units.length - 1)
  const val = bytes / Math.pow(1024, idx)
  return `${val.toFixed(val >= 100 || idx < 3 ? 0 : 1)} ${units[idx]}`
}

function formatFrequency(mhz: number): string {
  if (!mhz) return 'Unknown'
  if (mhz >= 1000) {
    return `${(mhz / 1000).toFixed(2)} GHz`
  }
  return `${mhz} MHz`
}

function formatUptime(seconds: number): string {
  if (!seconds) return 'Just started'
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const parts: string[] = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0 || days > 0) parts.push(`${hours}h`)
  parts.push(`${minutes}m`)
  return parts.join(' ')
}

export function SystemSpecsPanel() {
  const { data: specs, isLoading, isError, error, refetch, isFetching } = useSystemSpecs()
  const { data: liveMetrics } = useLiveSystemMetrics()
  const boostRamMutation = useBoostRam()
  const [copied, setCopied] = useState(false)

  const memory = liveMetrics?.memory ?? specs?.memory
  const cpuLoad = liveMetrics?.cpu_usage_percent ?? specs?.cpu.usage_percent ?? 0
  const cpuFreq = liveMetrics?.cpu_frequency_mhz ?? specs?.cpu.frequency_mhz ?? 0

  const handleCopy = () => {
    if (!specs) return
    const report = [
      `### 🎮 Nexus Launcher — System Specifications`,
      `- **OS:** ${specs.os_name} ${specs.cpu_arch} (Kernel: ${specs.kernel_version}${specs.os_build ? `, Build: ${specs.os_build}` : ''})`,
      `- **Host:** ${specs.host_name}`,
      `- **Motherboard:** ${[specs.motherboard.manufacturer, specs.motherboard.product].filter(Boolean).join(' ') || 'Standard PC'} (BIOS: ${specs.motherboard.bios_version || 'Default'})`,
      `- **Processor:** ${specs.cpu.brand} (${specs.cpu.physical_cores} Cores, ${specs.cpu.logical_cores} Threads @ ${formatFrequency(cpuFreq)})`,
      `- **Memory:** ${formatBytes(memory?.total_bytes)} Total (${formatBytes(memory?.used_bytes)} used, ${formatBytes(memory?.free_bytes)} free)`,
      `- **Graphics:** ${
        specs.gpus.length > 0
          ? specs.gpus
              .map(
                (g) =>
                  `${g.name}${g.vram_bytes ? ` (${formatBytes(g.vram_bytes)} VRAM)` : ''} [Driver: ${g.driver_version}]`,
              )
              .join(' | ')
          : 'Integrated Graphics'
      }`,
      `- **Storage:** ${specs.disks.map((d) => `${d.mount_point} [${d.kind || 'Disk'}] ${formatBytes(d.available_bytes)} free of ${formatBytes(d.total_bytes)} (${d.file_system})`).join(' | ')}`,
      `- **Displays:** ${specs.displays.length > 0 ? specs.displays.map((m) => `${m.width}x${m.height} (${Math.round(m.scale_factor * 100)}% scale)${m.is_primary ? ' [Primary]' : ''}`).join(' | ') : 'Built-in Display'}`,
      `- **Uptime:** ${formatUptime(specs.uptime_seconds)}`,
    ].join('\n')

    navigator.clipboard.writeText(report)
    setCopied(true)
    toast.success('System specifications report copied to clipboard!')
    setTimeout(() => setCopied(false), 2200)
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 animate-pulse">
        <div className="h-28 rounded-2xl bg-surface/40 border border-border/50" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="h-44 rounded-2xl bg-surface/40 border border-border/50" />
          <div className="h-44 rounded-2xl bg-surface/40 border border-border/50" />
          <div className="h-44 rounded-2xl bg-surface/40 border border-border/50" />
          <div className="h-44 rounded-2xl bg-surface/40 border border-border/50" />
        </div>
      </div>
    )
  }

  if (isError || !specs) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-3xl border border-rose-500/20 bg-rose-500/5 p-12 text-center">
        <div className="size-12 rounded-2xl bg-rose-500/10 flex items-center justify-center text-rose-400">
          <Activity className="size-6" />
        </div>
        <h3 className="text-lg font-semibold text-text">Failed to inspect system specifications</h3>
        <p className="max-w-md text-sm text-subtle">
          {error instanceof Error ? error.message : 'Could not query native hardware info.'}
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          className="mt-2 inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white shadow-lg transition-transform hover:scale-[1.02] active:scale-[0.98]"
        >
          <RefreshCw className="size-4" /> Try Again
        </button>
      </div>
    )
  }

  const memPercent = memory
    ? Math.min(100, Math.max(0, Math.round((memory.used_bytes / (memory.total_bytes || 1)) * 100)))
    : 0

  const swapPercent =
    memory && memory.total_swap_bytes
      ? Math.min(
          100,
          Math.max(0, Math.round((memory.used_swap_bytes / memory.total_swap_bytes) * 100)),
        )
      : 0

  return (
    <div className="flex flex-col gap-6">
      {/* Overview Rig Card */}
      <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-surface/80 via-surface/40 to-surface/20 p-6 shadow-sm">
        <div className="pointer-events-none absolute -right-12 -top-12 size-48 rounded-full bg-accent/10 blur-3xl" />
        <div className="relative flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div className="flex items-start gap-4">
            <div className="flex size-13 shrink-0 items-center justify-center rounded-2xl bg-accent/15 border border-accent/25 text-accent shadow-[0_0_24px_color-mix(in_srgb,var(--color-accent)_20%,transparent)]">
              <Laptop className="size-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-accent flex items-center gap-1.5">
                  <Sparkles className="size-3.5" /> Hardware Identity
                </span>
                <span className="rounded-full bg-surface-raised px-2 py-0.5 text-[10px] font-medium text-subtle border border-border/50">
                  {specs.cpu_arch}
                </span>
              </div>
              <h3 className="text-xl font-bold tracking-tight text-text mt-1">
                {specs.motherboard.product || specs.host_name}
              </h3>
              <p className="text-xs text-muted mt-0.5">
                {specs.motherboard.manufacturer ? `${specs.motherboard.manufacturer} • ` : ''}
                {specs.os_name}
                {specs.os_build ? ` (Build ${specs.os_build})` : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 self-end sm:self-center">
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              title="Refresh hardware stats"
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-3.5 py-2 text-xs font-medium text-muted hover:border-accent/40 hover:bg-surface-raised hover:text-text transition-all active:scale-95"
            >
              <RefreshCw className={cn('size-3.5', isFetching && 'animate-spin text-accent')} />
              <span>Refresh</span>
            </button>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-white shadow-md transition-all hover:bg-accent/90 active:scale-95"
            >
              {copied ? (
                <Check className="size-3.5 text-emerald-300" />
              ) : (
                <Copy className="size-3.5" />
              )}
              <span>{copied ? 'Copied!' : 'Copy Specs'}</span>
            </button>
          </div>
        </div>

        {/* Quick specs ribbon */}
        <div className="mt-5 grid grid-cols-2 gap-2 border-t border-border/60 pt-4 sm:grid-cols-4">
          <div className="flex flex-col">
            <span className="text-[11px] font-medium text-subtle">Device Name</span>
            <span
              className="truncate text-xs font-semibold text-text mt-0.5"
              title={specs.host_name}
            >
              {specs.host_name}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-[11px] font-medium text-subtle">System Uptime</span>
            <span className="text-xs font-semibold text-text mt-0.5 flex items-center gap-1.5">
              <Clock className="size-3 text-accent" />
              {formatUptime(specs.uptime_seconds)}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-[11px] font-medium text-subtle">Kernel Version</span>
            <span
              className="truncate text-xs font-semibold text-text mt-0.5"
              title={specs.kernel_version}
            >
              {specs.kernel_version}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-[11px] font-medium text-subtle">BIOS Version</span>
            <span
              className="truncate text-xs font-semibold text-text mt-0.5"
              title={specs.motherboard.bios_version || 'Default'}
            >
              {specs.motherboard.bios_version || 'Standard'}
            </span>
          </div>
        </div>
      </div>

      {/* Grid of Spec Cards */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* CPU Card */}
        <div className="flex flex-col rounded-3xl border border-border/80 bg-surface/60 p-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-border/60 pb-3.5">
            <div className="flex items-center gap-2.5">
              <div className="flex size-9 items-center justify-center rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
                <Cpu className="size-5" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-text">Processor (CPU)</h4>
                <p className="text-[11px] text-subtle">{specs.cpu.vendor_id || 'CPU'}</p>
              </div>
            </div>
            <span className="rounded-full bg-sky-500/10 border border-sky-500/20 px-2.5 py-0.5 text-xs font-semibold text-sky-400">
              {formatFrequency(cpuFreq)}
            </span>
          </div>

          <div className="mt-4 flex flex-col gap-3">
            <div className="rounded-2xl border border-border/60 bg-surface-raised/60 p-3.5">
              <div className="text-xs font-bold text-text tracking-wide leading-relaxed">
                {specs.cpu.brand}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div className="rounded-xl border border-border/50 bg-surface/50 p-2.5">
                <span className="text-[11px] text-subtle block">Physical Cores</span>
                <span className="text-sm font-bold text-text mt-0.5 block">
                  {specs.cpu.physical_cores} Cores
                </span>
              </div>
              <div className="rounded-xl border border-border/50 bg-surface/50 p-2.5">
                <span className="text-[11px] text-subtle block">Logical Threads</span>
                <span className="text-sm font-bold text-text mt-0.5 block">
                  {specs.cpu.logical_cores} Threads
                </span>
              </div>
            </div>

            {/* CPU usage bar */}
            <div className="mt-1 flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-subtle flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-sky-400 animate-pulse shadow-[0_0_6px_rgb(56_189_248)]" />
                  Current CPU Load
                </span>
                <span className="font-semibold text-text">{cpuLoad}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-surface-raised border border-border/40">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-sky-500 to-accent transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(2, cpuLoad))}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* GPU & Displays Card */}
        <div className="flex flex-col rounded-3xl border border-border/80 bg-surface/60 p-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-border/60 pb-3.5">
            <div className="flex items-center gap-2.5">
              <div className="flex size-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <Monitor className="size-5" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-text">Graphics & Display</h4>
                <p className="text-[11px] text-subtle">
                  {specs.gpus.length} Adapter{specs.gpus.length !== 1 ? 's' : ''} detected
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3">
            {specs.gpus.length > 0 ? (
              specs.gpus.map((gpu, index) => (
                <div
                  key={`${gpu.name}-${index}`}
                  className="rounded-2xl border border-border/60 bg-surface-raised/60 p-3.5 flex flex-col gap-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-text truncate" title={gpu.name}>
                      {gpu.name}
                    </span>
                    {gpu.vram_bytes ? (
                      <span className="shrink-0 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                        {formatBytes(gpu.vram_bytes)} VRAM
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-full bg-surface-raised border border-border/50 px-2 py-0.5 text-[10px] font-medium text-subtle">
                        Integrated
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-subtle pt-1 border-t border-border/40">
                    <span>Driver {gpu.driver_version}</span>
                    <span className="truncate max-w-[160px]" title={gpu.vendor}>
                      {gpu.vendor}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-border/60 bg-surface-raised/40 p-4 text-xs text-subtle text-center">
                Generic Display Adapter
              </div>
            )}

            {/* Connected Displays */}
            {specs.displays.length > 0 && (
              <div className="mt-1 flex flex-col gap-1.5 border-t border-border/50 pt-2.5">
                <span className="text-[11px] font-medium text-subtle">Connected Displays</span>
                <div className="flex flex-wrap gap-2">
                  {specs.displays.map((disp, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-1.5 rounded-xl border border-border/60 bg-surface/70 px-2.5 py-1 text-[11px] text-text"
                    >
                      <span className="font-semibold">
                        {disp.width} × {disp.height}
                      </span>
                      <span className="text-subtle text-[10px]">
                        ({Math.round(disp.scale_factor * 100)}%)
                      </span>
                      {disp.is_primary && (
                        <span className="rounded bg-accent/20 px-1 text-[9px] font-bold text-accent">
                          Primary
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Memory (RAM) Card */}
        <div className="flex flex-col rounded-3xl border border-border/80 bg-surface/60 p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3.5">
            <div className="flex items-center gap-2.5">
              <div className="flex size-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <Layers className="size-5" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-text">System Memory (RAM)</h4>
                <p className="text-[11px] text-subtle">
                  {formatBytes(memory?.total_bytes)} Total Physical RAM
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgb(52_211_153)]" />
                Live
              </span>
              <span className="rounded-full bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 text-xs font-semibold text-amber-400">
                {memPercent}% Used
              </span>
              <button
                type="button"
                onClick={() => boostRamMutation.mutate()}
                disabled={boostRamMutation.isPending}
                title="Trim background working sets and free up RAM"
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-3 py-1 text-xs font-bold text-white shadow-[0_0_14px_color-mix(in_srgb,rgb(245_158_11)_35%,transparent)] hover:from-amber-400 hover:to-amber-500 transition-all active:scale-95 disabled:opacity-50"
              >
                {boostRamMutation.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Zap className="size-3.5 fill-white" />
                )}
                <span>{boostRamMutation.isPending ? 'Optimizing...' : 'Boost RAM'}</span>
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div className="rounded-xl border border-border/50 bg-surface/50 p-2.5">
                <span className="text-[11px] text-subtle block">In Use</span>
                <span className="text-sm font-bold text-text mt-0.5 block">
                  {formatBytes(memory?.used_bytes)}
                </span>
              </div>
              <div className="rounded-xl border border-border/50 bg-surface/50 p-2.5">
                <span className="text-[11px] text-subtle block">Available</span>
                <span className="text-sm font-bold text-emerald-400 mt-0.5 block">
                  {formatBytes(memory?.free_bytes)}
                </span>
              </div>
            </div>

            {/* RAM Bar */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-subtle">Physical RAM Allocation</span>
                <span className="font-semibold text-text">
                  {formatBytes(memory?.used_bytes)} / {formatBytes(memory?.total_bytes)}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-surface-raised border border-border/40">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all duration-500"
                  style={{ width: `${memPercent}%` }}
                />
              </div>
            </div>

            {/* Swap / Pagefile */}
            {memory && memory.total_swap_bytes > 0 && (
              <div className="flex flex-col gap-1.5 border-t border-border/50 pt-2.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-subtle">Pagefile / Virtual Memory</span>
                  <span className="font-medium text-text">
                    {formatBytes(memory.used_swap_bytes)} of {formatBytes(memory.total_swap_bytes)}{' '}
                    ({swapPercent}%)
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-raised">
                  <div
                    className="h-full rounded-full bg-subtle/50 transition-all duration-500"
                    style={{ width: `${swapPercent}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Motherboard & Firmware Card */}
        <div className="flex flex-col rounded-3xl border border-border/80 bg-surface/60 p-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-border/60 pb-3.5">
            <div className="flex items-center gap-2.5">
              <div className="flex size-9 items-center justify-center rounded-xl bg-violet-500/10 text-violet-400 border border-violet-500/20">
                <Server className="size-5" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-text">Motherboard & BIOS</h4>
                <p className="text-[11px] text-subtle">Firmware & Platform</p>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3">
            <div className="rounded-2xl border border-border/60 bg-surface-raised/60 p-3.5">
              <span className="text-[11px] text-subtle block">Motherboard Model</span>
              <span className="text-sm font-bold text-text mt-0.5 block">
                {[specs.motherboard.manufacturer, specs.motherboard.product]
                  .filter(Boolean)
                  .join(' ') || 'Standard PC Board'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div className="rounded-xl border border-border/50 bg-surface/50 p-2.5">
                <span className="text-[11px] text-subtle block">BIOS Version</span>
                <span
                  className="text-xs font-semibold text-text mt-0.5 block truncate"
                  title={specs.motherboard.bios_version || 'Default'}
                >
                  {specs.motherboard.bios_version || 'Default'}
                </span>
              </div>
              <div className="rounded-xl border border-border/50 bg-surface/50 p-2.5">
                <span className="text-[11px] text-subtle block">BIOS Release Date</span>
                <span
                  className="text-xs font-semibold text-text mt-0.5 block truncate"
                  title={specs.motherboard.bios_date || 'Unknown'}
                >
                  {specs.motherboard.bios_date || 'Unknown'}
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-border/50 bg-surface/50 p-2.5 text-xs">
              <span className="text-[11px] text-subtle block">Operating System Platform</span>
              <span className="text-xs font-semibold text-text mt-0.5 block">
                {specs.os_name} • {specs.cpu_arch}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Storage & Disks Card (Full Width) */}
      <div className="flex flex-col rounded-3xl border border-border/80 bg-surface/60 p-5 shadow-sm">
        <div className="flex items-center justify-between border-b border-border/60 pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <HardDrive className="size-5" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-text">Storage Volumes & Drives</h4>
              <p className="text-[11px] text-subtle">
                {specs.disks.length} Partition{specs.disks.length !== 1 ? 's' : ''} mounted
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {specs.disks.map((disk) => {
            const usedBytes = disk.total_bytes - disk.available_bytes
            const percentUsed = Math.min(
              100,
              Math.max(0, Math.round((usedBytes / (disk.total_bytes || 1)) * 100)),
            )
            const freePercent = 100 - percentUsed
            const isLow = freePercent < 15

            return (
              <div
                key={disk.mount_point}
                className="flex flex-col justify-between rounded-2xl border border-border/60 bg-surface-raised/50 p-3.5 gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-text">{disk.mount_point}</span>
                      {disk.name && disk.name !== disk.mount_point && (
                        <span className="truncate text-xs text-subtle" title={disk.name}>
                          ({disk.name})
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-subtle">
                      {disk.file_system || 'Drive'} • {disk.kind || 'Disk'}
                    </span>
                  </div>
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold border',
                      isLow
                        ? 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                        : 'bg-surface border-border text-subtle',
                    )}
                  >
                    {percentUsed}% Used
                  </span>
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-surface border border-border/30">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all duration-500',
                        isLow ? 'bg-rose-500' : percentUsed > 75 ? 'bg-amber-500' : 'bg-accent',
                      )}
                      style={{ width: `${percentUsed}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-subtle">
                    <span>{formatBytes(disk.available_bytes)} free</span>
                    <span>Total {formatBytes(disk.total_bytes)}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
