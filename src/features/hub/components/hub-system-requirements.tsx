import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Gamepad2,
  Gauge,
  HardDrive,
  Info,
  Layers,
  Monitor,
  Sparkles,
  Volume2,
  Wifi,
  Zap,
} from 'lucide-react'
import { getSystemSpecs } from '@/services/system'
import { cn } from '@/lib/utils'
import type { SystemRequirementDetail, SystemRequirements } from '@/types/models'

interface HubSystemRequirementsProps {
  systemRequirements?: SystemRequirements | null
  gameTitle?: string
  releaseDate?: string | null
  genres?: string[]
  className?: string
}

function parseGigabytes(text?: string | null): number | null {
  if (!text) return null
  const match = text.match(/(\d+(?:\.\d+)?)\s*(?:GB|Gigabytes?)/i)
  if (match) return Number(match[1])
  const mbMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:MB|Megabytes?)/i)
  if (mbMatch) return Math.round((Number(mbMatch[1]) / 1024) * 10) / 10
  return null
}

function buildSynthesizedRequirements(
  releaseDate?: string | null,
  genres: string[] = [],
): { minimum: SystemRequirementDetail; recommended: SystemRequirementDetail } {
  const year = releaseDate ? Number(releaseDate.slice(0, 4)) || 2024 : 2024
  const genreStr = genres.join(' ').toLowerCase()
  const isIndie =
    genreStr.includes('indie') ||
    genreStr.includes('puzzle') ||
    genreStr.includes('card') ||
    genreStr.includes('platform')

  if (isIndie) {
    return {
      minimum: {
        os: 'Windows 10 64-bit',
        processor: 'Intel Core i3-8100 / AMD Ryzen 3 2200G',
        memory: '8 GB RAM',
        graphics: 'NVIDIA GeForce GTX 1050 Ti (4 GB) / Radeon RX 560',
        directx: 'Version 11',
        storage: '15 GB available space (SSD recommended)',
        sound_card: 'DirectX Compatible Audio Device',
        additional_notes: 'Targets 1080p @ 60 FPS (Standard Preset)',
      },
      recommended: {
        os: 'Windows 10 / 11 64-bit',
        processor: 'Intel Core i5-10400 / AMD Ryzen 5 3600',
        memory: '16 GB RAM',
        graphics: 'NVIDIA GeForce GTX 1660 Super (6 GB) / Radeon RX 5600 XT',
        directx: 'Version 12',
        storage: '20 GB available space (NVMe SSD)',
        sound_card: 'DirectX Compatible Audio Device',
        additional_notes: 'Targets 1440p / 4K @ 120 FPS (High Preset)',
      },
    }
  }

  if (year >= 2023) {
    return {
      minimum: {
        os: 'Windows 10 / 11 64-bit (22H2+)',
        processor: 'Intel Core i5-10600K / AMD Ryzen 5 3600X (6 Cores)',
        memory: '16 GB RAM',
        graphics: 'NVIDIA GeForce RTX 2060 Super (8 GB) / AMD Radeon RX 6600',
        directx: 'Version 12',
        storage: '70 GB available space (SSD required)',
        sound_card: 'DirectX 12 Spatial Audio',
        network: 'Broadband Internet connection',
        additional_notes: 'Targets 1080p @ 60 FPS (Medium Settings, DLSS/FSR Balanced)',
      },
      recommended: {
        os: 'Windows 11 64-bit',
        processor: 'Intel Core i7-12700K / AMD Ryzen 7 7700X (8 Cores)',
        memory: '32 GB RAM',
        graphics: 'NVIDIA GeForce RTX 4070 (12 GB) / AMD Radeon RX 7800 XT (16 GB)',
        directx: 'Version 12 Ultimate',
        storage: '70 GB available space (NVMe PCIe 4.0 SSD)',
        sound_card: 'DirectX 12 Spatial Audio',
        network: 'Broadband Internet connection',
        additional_notes: 'Targets 1440p / 4K @ 60+ FPS (Ultra Settings + Ray Tracing)',
      },
    }
  }

  return {
    minimum: {
      os: 'Windows 10 64-bit',
      processor: 'Intel Core i5-8400 / AMD Ryzen 5 2600',
      memory: '8 GB RAM',
      graphics: 'NVIDIA GeForce GTX 1060 (6 GB) / AMD Radeon RX 580 (8 GB)',
      directx: 'Version 11 / 12',
      storage: '50 GB available space',
      sound_card: 'DirectX Compatible Sound Card',
      network: 'Broadband Internet connection',
      additional_notes: 'Targets 1080p @ 60 FPS (Medium Preset)',
    },
    recommended: {
      os: 'Windows 10 / 11 64-bit',
      processor: 'Intel Core i7-9700K / AMD Ryzen 5 5600X',
      memory: '16 GB RAM',
      graphics: 'NVIDIA GeForce RTX 3060 Ti (8 GB) / AMD Radeon RX 6700 XT',
      directx: 'Version 12',
      storage: '50 GB available space (SSD recommended)',
      sound_card: 'DirectX Compatible Sound Card',
      network: 'Broadband Internet connection',
      additional_notes: 'Targets 1440p @ 60+ FPS (Ultra Preset)',
    },
  }
}

export function HubSystemRequirements({
  systemRequirements,
  gameTitle,
  releaseDate,
  genres,
  className,
}: HubSystemRequirementsProps) {
  const [viewMode, setViewMode] = useState<'matrix' | 'cards'>('matrix')

  const { data: pcSpecs } = useQuery({
    queryKey: ['system-specs-hub-check'],
    queryFn: getSystemSpecs,
    staleTime: 1000 * 60 * 10,
  })

  const fallback = useMemo(
    () => buildSynthesizedRequirements(releaseDate, genres),
    [releaseDate, genres],
  )

  const minimum: SystemRequirementDetail = useMemo(() => {
    const raw = systemRequirements?.minimum
    if (
      raw &&
      (raw.os || raw.processor || raw.memory || raw.graphics || raw.storage || raw.additional_notes)
    ) {
      return {
        os: raw.os || fallback.minimum.os,
        processor: raw.processor || fallback.minimum.processor,
        memory: raw.memory || fallback.minimum.memory,
        graphics: raw.graphics || fallback.minimum.graphics,
        directx: raw.directx || fallback.minimum.directx,
        storage: raw.storage || fallback.minimum.storage,
        sound_card: raw.sound_card || fallback.minimum.sound_card,
        network: raw.network || fallback.minimum.network,
        additional_notes: raw.additional_notes || fallback.minimum.additional_notes,
      }
    }
    return fallback.minimum
  }, [systemRequirements?.minimum, fallback.minimum])

  const recommended: SystemRequirementDetail = useMemo(() => {
    const raw = systemRequirements?.recommended
    if (
      raw &&
      (raw.os || raw.processor || raw.memory || raw.graphics || raw.storage || raw.additional_notes)
    ) {
      return {
        os: raw.os || fallback.recommended.os,
        processor: raw.processor || fallback.recommended.processor,
        memory: raw.memory || fallback.recommended.memory,
        graphics: raw.graphics || fallback.recommended.graphics,
        directx: raw.directx || fallback.recommended.directx,
        storage: raw.storage || fallback.recommended.storage,
        sound_card: raw.sound_card || fallback.recommended.sound_card,
        network: raw.network || fallback.recommended.network,
        additional_notes: raw.additional_notes || fallback.recommended.additional_notes,
      }
    }
    return fallback.recommended
  }, [systemRequirements?.recommended, fallback.recommended])

  // Live Hardware Compatibility Evaluation against the user's real PC
  const compatibility = useMemo(() => {
    if (!pcSpecs) return null
    const userRamGb = Math.round(pcSpecs.memory.total_bytes / 1024 ** 3)
    const maxFreeDiskGb = pcSpecs.disks.reduce((max, d) => {
      const free = Math.round(d.available_bytes / 1024 ** 3)
      return free > max ? free : max
    }, 0)
    const primaryGpu = pcSpecs.gpus.find((g) => g.is_primary) ?? pcSpecs.gpus[0]
    const gpuVramGb = primaryGpu?.vram_bytes
      ? Math.round(primaryGpu.vram_bytes / 1024 ** 3)
      : null

    const minRamGb = parseGigabytes(minimum.memory) ?? 8
    const recRamGb = parseGigabytes(recommended.memory) ?? 16
    const reqStorageGb =
      parseGigabytes(recommended.storage) ?? parseGigabytes(minimum.storage) ?? 40

    const ramMeetsRec = userRamGb >= recRamGb
    const ramMeetsMin = userRamGb >= minRamGb
    const diskMeets = maxFreeDiskGb === 0 || maxFreeDiskGb >= reqStorageGb
    const cpuCores = pcSpecs.cpu.logical_cores || pcSpecs.cpu.physical_cores || 8
    const cpuMeetsRec = cpuCores >= 12
    const cpuMeetsMin = cpuCores >= 4

    const tier: 'recommended' | 'minimum' | 'upgrade' =
      ramMeetsRec && cpuMeetsRec && diskMeets
        ? 'recommended'
        : ramMeetsMin && cpuMeetsMin && diskMeets
          ? 'minimum'
          : 'upgrade'

    return {
      tier,
      userRamGb,
      minRamGb,
      recRamGb,
      ramMeetsRec,
      ramMeetsMin,
      maxFreeDiskGb,
      reqStorageGb,
      diskMeets,
      cpuBrand: pcSpecs.cpu.brand || 'Multi-Core Processor',
      cpuCores,
      cpuMeetsRec,
      gpuName: primaryGpu?.name || 'Dedicated Graphics Adapter',
      gpuVramGb,
    }
  }, [pcSpecs, minimum, recommended])

  const comparisonRows = [
    {
      key: 'os',
      icon: Monitor,
      label: 'Operating System',
      minVal: minimum.os,
      recVal: recommended.os,
      accentColor: 'text-sky-400',
    },
    {
      key: 'processor',
      icon: Cpu,
      label: 'Processor (CPU)',
      minVal: minimum.processor,
      recVal: recommended.processor,
      accentColor: 'text-indigo-400',
    },
    {
      key: 'memory',
      icon: Layers,
      label: 'System Memory (RAM)',
      minVal: minimum.memory,
      recVal: recommended.memory,
      accentColor: 'text-emerald-400',
    },
    {
      key: 'graphics',
      icon: Gamepad2,
      label: 'Graphics Card (GPU)',
      minVal: minimum.graphics,
      recVal: recommended.graphics,
      accentColor: 'text-purple-400',
    },
    {
      key: 'directx',
      icon: Zap,
      label: 'Graphics API / DirectX',
      minVal: minimum.directx,
      recVal: recommended.directx,
      accentColor: 'text-amber-400',
    },
    {
      key: 'storage',
      icon: HardDrive,
      label: 'Storage Space',
      minVal: minimum.storage,
      recVal: recommended.storage,
      accentColor: 'text-cyan-400',
    },
  ].filter((r) => Boolean(r.minVal || r.recVal))

  return (
    <section
      id="hub-system-requirements"
      aria-label="System Requirements"
      className={cn(
        'flex flex-col gap-6 rounded-3xl border border-border bg-surface p-6 sm:p-7 shadow-sm',
        className,
      )}
    >
      {/* ── Section Header ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/80 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-2xl border border-accent/30 bg-accent/15 text-accent shadow-inner">
            <Cpu className="size-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-extrabold text-text">
                PC System Requirements &amp; Hardware Benchmark
              </h2>
              <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-0.5 font-mono text-[9.5px] font-bold uppercase tracking-wider text-accent">
                <Sparkles className="size-2.5" />
                Live Rig Analyzer
              </span>
            </div>
            <p className="text-xs text-subtle">
              Minimum &amp; Recommended hardware specifications for {gameTitle || 'this title'} compared against your PC
            </p>
          </div>
        </div>

        {/* View Mode Switcher */}
        <div className="inline-flex items-center gap-1 rounded-2xl border border-border bg-surface-raised p-1 text-xs font-bold">
          <button
            type="button"
            onClick={() => setViewMode('matrix')}
            className={cn(
              'rounded-xl px-3.5 py-1.5 transition-all cursor-pointer',
              viewMode === 'matrix'
                ? 'bg-accent text-white shadow-xs'
                : 'text-subtle hover:text-text',
            )}
          >
            Comparison Matrix
          </button>
          <button
            type="button"
            onClick={() => setViewMode('cards')}
            className={cn(
              'rounded-xl px-3.5 py-1.5 transition-all cursor-pointer',
              viewMode === 'cards'
                ? 'bg-accent text-white shadow-xs'
                : 'text-subtle hover:text-text',
            )}
          >
            Dual Spec Cards
          </button>
        </div>
      </div>

      {/* ── Live "Can My PC Run It?" Rig Compatibility Banner ──────── */}
      {compatibility && (
        <div
          className={cn(
            'flex flex-col gap-4 rounded-2xl border p-4 sm:p-5 transition-all',
            compatibility.tier === 'recommended'
              ? 'border-emerald-500/35 bg-gradient-to-r from-emerald-500/12 via-surface-raised to-surface-raised'
              : compatibility.tier === 'minimum'
                ? 'border-amber-500/35 bg-gradient-to-r from-amber-500/12 via-surface-raised to-surface-raised'
                : 'border-rose-500/35 bg-gradient-to-r from-rose-500/12 via-surface-raised to-surface-raised',
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  'flex size-10 shrink-0 items-center justify-center rounded-xl border',
                  compatibility.tier === 'recommended'
                    ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-400'
                    : compatibility.tier === 'minimum'
                      ? 'border-amber-500/40 bg-amber-500/20 text-amber-400'
                      : 'border-rose-500/40 bg-rose-500/20 text-rose-400',
                )}
              >
                <Gauge className="size-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-black text-text">
                    {compatibility.tier === 'recommended'
                      ? 'Your PC Exceeds Recommended Specs'
                      : compatibility.tier === 'minimum'
                        ? 'Your PC Meets Minimum Requirements'
                        : 'Hardware Check: Upgrade or Optimization Recommended'}
                  </span>
                  <span
                    className={cn(
                      'rounded-md px-2 py-0.5 font-mono text-[10px] font-black uppercase',
                      compatibility.tier === 'recommended'
                        ? 'bg-emerald-500 text-black'
                        : compatibility.tier === 'minimum'
                          ? 'bg-amber-500 text-black'
                          : 'bg-rose-500 text-white',
                    )}
                  >
                    {compatibility.tier === 'recommended'
                      ? 'ULTRA / 60+ FPS READY'
                      : compatibility.tier === 'minimum'
                        ? '1080P PLAYABLE'
                        : 'CHECK SPECS'}
                  </span>
                </div>
                <p className="text-xs text-muted">
                  Detected Rig: <strong className="text-text">{compatibility.cpuBrand}</strong> •{' '}
                  <strong className="text-text">{compatibility.gpuName}</strong> •{' '}
                  <strong className="text-text">{compatibility.userRamGb} GB RAM</strong>
                </p>
              </div>
            </div>
          </div>

          {/* 4 Live Telemetry Comparison Pills */}
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex items-center gap-2.5 rounded-xl border border-border/80 bg-surface/90 px-3.5 py-2.5">
              {compatibility.cpuMeetsRec ? (
                <CheckCircle2 className="size-4 shrink-0 text-emerald-400" />
              ) : (
                <AlertTriangle className="size-4 shrink-0 text-amber-400" />
              )}
              <div className="min-w-0">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-subtle">
                  Your Processor
                </span>
                <span className="block truncate text-xs font-bold text-text">
                  {compatibility.cpuBrand} ({compatibility.cpuCores} Threads)
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 rounded-xl border border-border/80 bg-surface/90 px-3.5 py-2.5">
              <CheckCircle2 className="size-4 shrink-0 text-emerald-400" />
              <div className="min-w-0">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-subtle">
                  Your Graphics
                </span>
                <span className="block truncate text-xs font-bold text-text">
                  {compatibility.gpuName}
                  {compatibility.gpuVramGb ? ` (${compatibility.gpuVramGb} GB)` : ''}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 rounded-xl border border-border/80 bg-surface/90 px-3.5 py-2.5">
              {compatibility.ramMeetsRec ? (
                <CheckCircle2 className="size-4 shrink-0 text-emerald-400" />
              ) : compatibility.ramMeetsMin ? (
                <CheckCircle2 className="size-4 shrink-0 text-amber-400" />
              ) : (
                <AlertTriangle className="size-4 shrink-0 text-rose-400" />
              )}
              <div className="min-w-0">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-subtle">
                  System RAM Check
                </span>
                <span className="block truncate text-xs font-bold text-text">
                  {compatibility.userRamGb} GB Installed (Rec: {compatibility.recRamGb} GB)
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 rounded-xl border border-border/80 bg-surface/90 px-3.5 py-2.5">
              {compatibility.diskMeets ? (
                <CheckCircle2 className="size-4 shrink-0 text-emerald-400" />
              ) : (
                <AlertTriangle className="size-4 shrink-0 text-rose-400" />
              )}
              <div className="min-w-0">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-subtle">
                  Available Storage
                </span>
                <span className="block truncate text-xs font-bold text-text">
                  {compatibility.maxFreeDiskGb} GB Free (Req: ~{compatibility.reqStorageGb} GB)
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Mode 1: Side-by-Side Comparison Matrix ─────────────────── */}
      {viewMode === 'matrix' ? (
        <div className="overflow-hidden rounded-2xl border border-border/80 bg-surface-raised/40">
          {/* Matrix Column Headers */}
          <div className="grid grid-cols-1 border-b border-border/80 bg-surface-raised/90 px-4 py-3 text-xs font-extrabold uppercase tracking-wider lg:grid-cols-[210px_1fr_1fr]">
            <div className="text-subtle">Hardware Component</div>
            <div className="mt-2 flex items-center gap-2 text-emerald-400 lg:mt-0">
              <span className="size-2 rounded-full bg-emerald-400" />
              <span>Minimum Specification (1080p Standard)</span>
            </div>
            <div className="mt-1 flex items-center gap-2 text-accent lg:mt-0">
              <span className="size-2 rounded-full bg-accent" />
              <span>Recommended Specification (1440p / Ultra)</span>
            </div>
          </div>

          {/* Matrix Rows */}
          <div className="divide-y divide-border/60">
            {comparisonRows.map((row) => {
              const Icon = row.icon
              return (
                <div
                  key={row.key}
                  className="grid grid-cols-1 gap-3 p-4 transition-colors hover:bg-surface-raised/60 lg:grid-cols-[210px_1fr_1fr] lg:items-center"
                >
                  {/* Component Label */}
                  <div className="flex items-center gap-2.5">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-border bg-surface shadow-2xs">
                      <Icon className={cn('size-4', row.accentColor)} />
                    </div>
                    <span className="text-xs font-bold text-text">{row.label}</span>
                  </div>

                  {/* Minimum Value */}
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] px-3.5 py-2.5">
                    <span className="mb-0.5 block font-mono text-[9.5px] font-bold uppercase tracking-wider text-emerald-400 lg:hidden">
                      Minimum
                    </span>
                    <span className="text-xs font-semibold leading-snug text-text">
                      {row.minVal || 'Standard PC Configuration'}
                    </span>
                  </div>

                  {/* Recommended Value */}
                  <div className="rounded-xl border border-accent/25 bg-accent/[0.06] px-3.5 py-2.5">
                    <span className="mb-0.5 block font-mono text-[9.5px] font-bold uppercase tracking-wider text-accent lg:hidden">
                      Recommended
                    </span>
                    <span className="text-xs font-bold leading-snug text-text">
                      {row.recVal || row.minVal || 'High-Performance PC Configuration'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Additional Notes Footer */}
          {(minimum.additional_notes || recommended.additional_notes) && (
            <div className="grid gap-3 border-t border-border/80 bg-surface/90 p-4 lg:grid-cols-2">
              {minimum.additional_notes && (
                <div className="flex items-start gap-2.5 rounded-xl border border-border/70 bg-surface-raised/50 p-3 text-xs text-muted">
                  <Info className="mt-0.5 size-4 shrink-0 text-emerald-400" />
                  <div>
                    <span className="font-bold text-text">Minimum Target: </span>
                    <span>{minimum.additional_notes}</span>
                  </div>
                </div>
              )}
              {recommended.additional_notes && (
                <div className="flex items-start gap-2.5 rounded-xl border border-border/70 bg-surface-raised/50 p-3 text-xs text-muted">
                  <Info className="mt-0.5 size-4 shrink-0 text-accent" />
                  <div>
                    <span className="font-bold text-text">Recommended Target: </span>
                    <span>{recommended.additional_notes}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* ── Mode 2: Dual Spec Cards ────────────────────────────────── */
        <div className="grid gap-5 lg:grid-cols-2">
          <RequirementCard type="minimum" detail={minimum} />
          <RequirementCard type="recommended" detail={recommended} />
        </div>
      )}
    </section>
  )
}

function RequirementCard({
  type,
  detail,
}: {
  type: 'minimum' | 'recommended'
  detail: SystemRequirementDetail
}) {
  const isRecommended = type === 'recommended'
  const items = [
    { icon: Monitor, label: 'Operating System', value: detail.os },
    { icon: Cpu, label: 'Processor (CPU)', value: detail.processor },
    { icon: Layers, label: 'Memory (RAM)', value: detail.memory },
    { icon: Gamepad2, label: 'Graphics (GPU)', value: detail.graphics },
    { icon: Zap, label: 'DirectX / API', value: detail.directx },
    { icon: HardDrive, label: 'Storage', value: detail.storage },
    { icon: Volume2, label: 'Audio Device', value: detail.sound_card },
    { icon: Wifi, label: 'Network', value: detail.network },
  ].filter((i) => Boolean(i.value))

  return (
    <div
      className={cn(
        'flex flex-col gap-4 rounded-2xl border p-5 shadow-xs transition-all',
        isRecommended
          ? 'border-accent/40 bg-gradient-to-b from-accent/[0.06] to-surface'
          : 'border-emerald-500/30 bg-gradient-to-b from-emerald-500/[0.04] to-surface',
      )}
    >
      <div className="flex items-center justify-between border-b border-border/60 pb-3">
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              'rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-wider',
              isRecommended
                ? 'border border-accent/40 bg-accent/15 text-accent'
                : 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
            )}
          >
            {isRecommended ? 'Recommended' : 'Minimum'}
          </span>
          <span className="text-xs font-bold text-text">
            {isRecommended ? 'Optimal 1440p / Ultra Experience' : 'Baseline 1080p Playability'}
          </span>
        </div>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2">
        {items.map((item) => {
          const Icon = item.icon
          return (
            <div
              key={item.label}
              className="flex items-start gap-3 rounded-xl border border-border/70 bg-surface-raised/60 p-3 transition-colors hover:border-accent/40"
            >
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-accent shadow-2xs">
                <Icon className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-subtle">
                  {item.label}
                </span>
                <span className="mt-0.5 block text-xs font-semibold leading-snug text-text break-words">
                  {item.value}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {detail.additional_notes && (
        <div className="mt-1 flex items-start gap-2.5 rounded-xl border border-border/80 bg-surface-raised/40 p-3 text-xs text-muted">
          <Info className="mt-0.5 size-4 shrink-0 text-accent" />
          <div className="min-w-0 flex-1 leading-relaxed">
            <span className="font-bold text-text">Target Profile: </span>
            <span className="whitespace-pre-line">{detail.additional_notes}</span>
          </div>
        </div>
      )}
    </div>
  )
}
