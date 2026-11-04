import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Activity,
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
import {
  estimateGameFpsMatrix,
  type TargetResolution,
  type UpscalerMode,
} from '@/features/hub/utils/fps-estimator'

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

/**
 * Windows reports usable physical RAM after BIOS / iGPU hardware reservation
 * (e.g. 15.2–15.9 GB for a 16 GB kit, 31.1–31.9 GB for a 32 GB kit).
 * Snaps raw byte counts to the actual installed physical DIMM tier so a 16 GB PC
 * is never misclassified as 15 GB.
 */
function snapPhysicalRamGb(totalBytes: number): number {
  const rawGb = totalBytes / 1024 ** 3
  if (rawGb <= 0) return 16
  const standardTiers = [4, 6, 8, 12, 16, 24, 32, 48, 64, 96, 128, 192, 256]
  for (const tier of standardTiers) {
    if (rawGb >= tier * 0.88 && rawGb <= tier * 1.06) {
      return tier
    }
  }
  return Math.round(rawGb)
}

/**
 * Snaps GPU VRAM bytes (which often report 7.8 GB for 8 GB or 11.7 GB for 12 GB)
 * to standard GDDR tiers.
 */
function snapGpuVramGb(vramBytes?: number | null): number | null {
  if (!vramBytes || vramBytes <= 0) return null
  const rawGb = vramBytes / 1024 ** 3
  const standardVram = [2, 3, 4, 6, 8, 10, 12, 16, 20, 24, 32]
  for (const tier of standardVram) {
    if (rawGb >= tier * 0.86 && rawGb <= tier * 1.08) {
      return tier
    }
  }
  return Math.max(1, Math.round(rawGb))
}

/**
 * Estimates a normalized GPU performance index (10–100) from a GPU model string and VRAM.
 */
function estimateGpuPerformanceScore(gpuText?: string | null, vramGb?: number | null): number {
  if (!gpuText) return vramGb ? Math.min(85, vramGb * 6) : 50
  const s = gpuText.toLowerCase()

  // NVIDIA RTX 50 / 40 / 30 / 20 & GTX series
  if (/rtx\s*5090/.test(s)) return 100
  if (/rtx\s*5080|rtx\s*4090/.test(s)) return 98
  if (/rtx\s*5070\s*ti|rtx\s*4080/.test(s)) return 93
  if (/rtx\s*5070|rtx\s*4070\s*(?:ti|super)|rtx\s*3090/.test(s)) return 88
  if (/rtx\s*4070|rtx\s*3080/.test(s)) return 83
  if (/rtx\s*5060\s*ti|rtx\s*4060\s*ti|rtx\s*3070/.test(s)) return 76
  if (/rtx\s*5060|rtx\s*4060|rtx\s*3060\s*ti|rtx\s*2080/.test(s)) return 70
  if (/rtx\s*3060|rtx\s*2070|rtx\s*4050/.test(s)) return 63
  if (/rtx\s*2060|rtx\s*3050|gtx\s*1080|gtx\s*1660/.test(s)) return 54
  if (/gtx\s*1070|gtx\s*1650|gtx\s*1060/.test(s)) return 44
  if (/gtx\s*1050|gtx\s*970|gtx\s*960/.test(s)) return 34

  // AMD Radeon RX 9000 / 7000 / 6000 / 5000 / 500 series
  if (/rx\s*7900\s*xtx|rx\s*9070\s*xt/.test(s)) return 94
  if (/rx\s*7900\s*xt|rx\s*9070|rx\s*6950/.test(s)) return 88
  if (/rx\s*7900\s*gre|rx\s*7800\s*xt|rx\s*6900|rx\s*6800\s*xt/.test(s)) return 82
  if (/rx\s*7700\s*xt|rx\s*6800|rx\s*6750\s*xt|rx\s*6700\s*xt/.test(s)) return 73
  if (/rx\s*7600\s*xt|rx\s*7600|rx\s*6650\s*xt|rx\s*6600\s*xt/.test(s)) return 64
  if (/rx\s*6600|rx\s*5700\s*xt|rx\s*5700|rx\s*5600\s*xt/.test(s)) return 56
  if (/rx\s*580|rx\s*570|rx\s*5500|rx\s*6500/.test(s)) return 43
  if (/rx\s*560|rx\s*460|vega/.test(s)) return 32

  // Intel Arc
  if (/arc\s*b580|arc\s*a770/.test(s)) return 66
  if (/arc\s*b570|arc\s*a750|arc\s*a580/.test(s)) return 58

  if (vramGb) {
    if (vramGb >= 16) return 85
    if (vramGb >= 12) return 75
    if (vramGb >= 8) return 64
    if (vramGb >= 6) return 52
    if (vramGb >= 4) return 38
    return 25
  }
  return 58
}

/**
 * Estimates a normalized CPU performance index (20–100) from CPU brand/model and core count.
 */
function estimateCpuPerformanceScore(
  cpuText?: string | null,
  logicalCores?: number | null,
  physicalCores?: number | null,
): number {
  const s = (cpuText || '').toLowerCase()
  const threads = logicalCores || (physicalCores ? physicalCores * 2 : 8)

  if (/9800x3d|9950x|7950x3d|7800x3d|14900k|13900k|ultra\s*9/.test(s)) return 98
  if (/9700x|7900x|7700x|14700k|13700k|12900k|5800x3d|ultra\s*7/.test(s)) return 90
  if (/9600x|7600x|7600|7500f|14600k|13600k|12700|5900x|5700x3d|ultra\s*5/.test(s)) return 82
  if (/14400|13400|12600|12400|11700|5800x|5700x|5600x|5600/.test(s)) return 73
  if (/11400|10700|10600|10400|9900k|9700k|3700x|3600x|3600|5500/.test(s)) return 62
  if (/9600k|9400|8700|8400|2700x|2600|3300x|12100|13100/.test(s)) return 50
  if (/7700|6700|4790|1600|1500x|2200g|8100/.test(s)) return 38

  if (threads >= 20) return 90
  if (threads >= 16) return 82
  if (threads >= 12) return 72
  if (threads >= 8) return 58
  if (threads >= 6) return 48
  return 35
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
        processor: 'Intel Core i5-10400 / AMD Ryzen 5 3600 (6 Cores)',
        memory: '16 GB RAM',
        graphics: 'NVIDIA GeForce RTX 2060 (6 GB) / AMD Radeon RX 6600 (8 GB)',
        directx: 'Version 12',
        storage: '70 GB available space (SSD required)',
        sound_card: 'DirectX 12 Spatial Audio',
        network: 'Broadband Internet connection',
        additional_notes: 'Targets 1080p @ 60 FPS (Medium Settings, DLSS/FSR Quality)',
      },
      recommended: {
        os: 'Windows 11 64-bit',
        processor: 'Intel Core i7-12700K / AMD Ryzen 7 5800X3D (8 Cores)',
        memory: '16 GB RAM',
        graphics: 'NVIDIA GeForce RTX 4070 (12 GB) / AMD Radeon RX 7800 XT (16 GB)',
        directx: 'Version 12 Ultimate',
        storage: '70 GB available space (NVMe PCIe 4.0 SSD)',
        sound_card: 'DirectX 12 Spatial Audio',
        network: 'Broadband Internet connection',
        additional_notes: 'Targets 1440p / 4K @ 60+ FPS (High / Ultra Settings)',
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
  const [selectedResolution, setSelectedResolution] = useState<TargetResolution>('1080p')
  const [selectedUpscaler, setSelectedUpscaler] = useState<UpscalerMode>('native')

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

  // Intelligent Multi-Component Hardware Evaluation against the user's real PC
  const compatibility = useMemo(() => {
    if (!pcSpecs) return null
    const userRamGb = snapPhysicalRamGb(pcSpecs.memory.total_bytes)
    const maxFreeDiskGb = pcSpecs.disks.reduce((max, d) => {
      const free = Math.round(d.available_bytes / 1024 ** 3)
      return free > max ? free : max
    }, 0)
    const primaryGpu = pcSpecs.gpus.find((g) => g.is_primary) ?? pcSpecs.gpus[0]
    const gpuVramGb = snapGpuVramGb(primaryGpu?.vram_bytes)

    const parsedMinRam = parseGigabytes(minimum.memory) ?? 8
    const parsedRecRam = parseGigabytes(recommended.memory) ?? 16
    // Guard against games that list 32GB in minimum by mistake; cap realistic minimum at 16GB
    const minRamGb = Math.min(parsedMinRam, 16)
    const recRamGb = Math.max(minRamGb, parsedRecRam)

    const reqStorageGb =
      parseGigabytes(recommended.storage) ?? parseGigabytes(minimum.storage) ?? 40

    const cpuCores = pcSpecs.cpu.logical_cores || pcSpecs.cpu.physical_cores || 8
    const userCpuScore = estimateCpuPerformanceScore(
      pcSpecs.cpu.brand,
      pcSpecs.cpu.logical_cores,
      pcSpecs.cpu.physical_cores,
    )
    const minCpuScore = Math.min(55, estimateCpuPerformanceScore(minimum.processor, 6, 4))
    const recCpuScore = Math.min(82, estimateCpuPerformanceScore(recommended.processor, 12, 6))

    const userGpuScore = estimateGpuPerformanceScore(primaryGpu?.name, gpuVramGb)
    const minGpuScore = Math.min(54, estimateGpuPerformanceScore(minimum.graphics, 6))
    const recGpuScore = Math.min(82, estimateGpuPerformanceScore(recommended.graphics, 8))

    const cpuMeetsRec = userCpuScore >= recCpuScore - 5 || cpuCores >= 12
    const cpuMeetsMin = userCpuScore >= minCpuScore - 6 || cpuCores >= 6

    const gpuMeetsRec = userGpuScore >= recGpuScore - 5
    const gpuMeetsMin = userGpuScore >= minGpuScore - 6

    const ramMeetsRec = userRamGb >= recRamGb
    // 16 GB RAM is sufficient to play virtually all modern PC titles smoothly at High settings
    // even when a game lists 32 GB for 4K Ultra / heavy multitasking
    const ramPracticalHigh = userRamGb >= 16 && minRamGb <= 16
    const ramMeetsMin = userRamGb >= minRamGb

    const diskMeets = maxFreeDiskGb === 0 || maxFreeDiskGb >= reqStorageGb

    type RigTier = 'ultra' | 'high' | 'medium' | 'below'
    let tier: RigTier = 'high'
    let headline = 'Your PC Runs This Game Smoothly (High / Ultra Ready)'
    let badgeText = 'HIGH / ULTRA READY'
    let subtext = ''

    if (gpuMeetsRec && cpuMeetsRec && ramMeetsRec) {
      tier = 'ultra'
      headline = 'Your PC Exceeds Recommended Specifications'
      badgeText = 'ULTRA / 1440P–4K READY'
      subtext =
        'All core components (CPU, GPU, and RAM) meet or exceed the official Recommended target for maximum visual settings.'
    } else if (gpuMeetsMin && cpuMeetsMin && (ramMeetsRec || ramPracticalHigh)) {
      tier = 'high'
      headline =
        !ramMeetsRec && ramPracticalHigh
          ? 'Your PC Runs This Game Great (16 GB RAM Meets Gaming Target)'
          : 'Your PC Is Well Above Minimum & Ready for High Settings'
      badgeText = '1080P / 1440P HIGH READY'
      subtext =
        !ramMeetsRec && ramPracticalHigh
          ? `Your ${userRamGb} GB RAM easily handles this game at 1080p/1440p High. The ${recRamGb} GB recommendation is only for heavy 4K Ultra textures or background apps.`
          : 'Your processor, graphics card, and memory comfortably exceed the baseline requirements for smooth 60+ FPS gameplay.'
    } else if (gpuMeetsMin && cpuMeetsMin && ramMeetsMin) {
      tier = 'medium'
      headline = 'Your PC Meets Official Minimum Requirements'
      badgeText = '1080P PLAYABLE'
      subtext =
        'Expect smooth 1080p gameplay using Medium/Balanced graphics presets and DLSS/FSR upscaling where supported.'
    } else {
      tier = 'below'
      headline = 'Hardware Notice: Below Official Minimum on One or More Components'
      badgeText = 'BELOW MINIMUM'
      const bottlenecks: string[] = []
      if (!ramMeetsMin) bottlenecks.push(`RAM (${userRamGb} GB vs ${minRamGb} GB min)`)
      if (!gpuMeetsMin) bottlenecks.push('Graphics Card')
      if (!cpuMeetsMin) bottlenecks.push('Processor')
      subtext =
        bottlenecks.length > 0
          ? `Potential bottleneck detected in: ${bottlenecks.join(', ')}. Lower resolution (720p/1080p Low) or FSR/DLSS Performance mode is advised.`
          : 'Check component breakdown below for optimal graphics settings.'
    }

    const readinessScore = Math.min(
      100,
      Math.max(
        25,
        Math.round(
          (Math.min(1.15, userGpuScore / Math.max(1, recGpuScore)) * 45 +
            Math.min(1.15, userCpuScore / Math.max(1, recCpuScore)) * 30 +
            Math.min(1.15, userRamGb / Math.max(1, Math.min(recRamGb, 24))) * 25),
        ),
      ),
    )

    return {
      tier,
      headline,
      badgeText,
      subtext,
      readinessScore,
      userRamGb,
      minRamGb,
      recRamGb,
      ramMeetsRec,
      ramPracticalHigh,
      ramMeetsMin,
      maxFreeDiskGb,
      reqStorageGb,
      diskMeets,
      cpuBrand: pcSpecs.cpu.brand || 'Multi-Core Processor',
      cpuCores,
      cpuMeetsRec,
      cpuMeetsMin,
      gpuName: primaryGpu?.name || 'Dedicated Graphics Adapter',
      gpuVramGb,
      gpuMeetsRec,
      gpuMeetsMin,
    }
  }, [pcSpecs, minimum, recommended])

  const fpsEstimation = useMemo(
    () =>
      estimateGameFpsMatrix({
        pcSpecs,
        systemRequirements: { minimum, recommended },
        gameTitle,
        releaseDate,
        genres,
        selectedResolution,
        selectedUpscaler,
      }),
    [pcSpecs, minimum, recommended, gameTitle, releaseDate, genres, selectedResolution, selectedUpscaler],
  )

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
                PC System Requirements &amp; Smart Hardware Benchmark
              </h2>
              <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-0.5 font-mono text-[9.5px] font-bold uppercase tracking-wider text-accent">
                <Sparkles className="size-2.5" />
                Live Rig Analyzer v2
              </span>
            </div>
            <p className="text-xs text-subtle">
              Intelligent component-by-component evaluation for {gameTitle || 'this title'} against your PC
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
            compatibility.tier === 'ultra' || compatibility.tier === 'high'
              ? 'border-emerald-500/35 bg-gradient-to-r from-emerald-500/12 via-surface-raised to-surface-raised'
              : compatibility.tier === 'medium'
                ? 'border-cyan-500/35 bg-gradient-to-r from-cyan-500/12 via-surface-raised to-surface-raised'
                : 'border-amber-500/35 bg-gradient-to-r from-amber-500/12 via-surface-raised to-surface-raised',
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3.5">
              <div
                className={cn(
                  'flex size-12 shrink-0 flex-col items-center justify-center rounded-2xl border font-mono',
                  compatibility.tier === 'ultra' || compatibility.tier === 'high'
                    ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-400'
                    : compatibility.tier === 'medium'
                      ? 'border-cyan-500/40 bg-cyan-500/20 text-cyan-400'
                      : 'border-amber-500/40 bg-amber-500/20 text-amber-400',
                )}
              >
                <span className="text-sm font-black leading-none">
                  {compatibility.readinessScore}%
                </span>
                <span className="mt-0.5 text-[8px] font-bold uppercase tracking-wider opacity-80">
                  Match
                </span>
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm sm:text-base font-black text-text">
                    {compatibility.headline}
                  </span>
                  <span
                    className={cn(
                      'rounded-md px-2 py-0.5 font-mono text-[10px] font-black uppercase',
                      compatibility.tier === 'ultra' || compatibility.tier === 'high'
                        ? 'bg-emerald-500 text-black'
                        : compatibility.tier === 'medium'
                          ? 'bg-cyan-400 text-black'
                          : 'bg-amber-500 text-black',
                    )}
                  >
                    {compatibility.badgeText}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted">{compatibility.subtext}</p>
              </div>
            </div>
          </div>

          {/* 4 Live Component Diagnostic Cards */}
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {/* CPU Card */}
            <div className="flex items-start gap-2.5 rounded-xl border border-border/80 bg-surface/90 p-3">
              {compatibility.cpuMeetsRec ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" />
              ) : compatibility.cpuMeetsMin ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-cyan-400" />
              ) : (
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-subtle">
                    Processor (CPU)
                  </span>
                  <span
                    className={cn(
                      'font-mono text-[9px] font-black uppercase',
                      compatibility.cpuMeetsRec
                        ? 'text-emerald-400'
                        : compatibility.cpuMeetsMin
                          ? 'text-cyan-400'
                          : 'text-amber-400',
                    )}
                  >
                    {compatibility.cpuMeetsRec
                      ? 'Optimal'
                      : compatibility.cpuMeetsMin
                        ? 'Good'
                        : 'Below Min'}
                  </span>
                </div>
                <span className="mt-0.5 block truncate text-xs font-bold text-text">
                  {compatibility.cpuBrand}
                </span>
                <span className="block text-[10px] text-muted">
                  {compatibility.cpuCores} Logical Threads
                </span>
              </div>
            </div>

            {/* GPU Card */}
            <div className="flex items-start gap-2.5 rounded-xl border border-border/80 bg-surface/90 p-3">
              {compatibility.gpuMeetsRec ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" />
              ) : compatibility.gpuMeetsMin ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-cyan-400" />
              ) : (
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-subtle">
                    Graphics (GPU)
                  </span>
                  <span
                    className={cn(
                      'font-mono text-[9px] font-black uppercase',
                      compatibility.gpuMeetsRec
                        ? 'text-emerald-400'
                        : compatibility.gpuMeetsMin
                          ? 'text-cyan-400'
                          : 'text-amber-400',
                    )}
                  >
                    {compatibility.gpuMeetsRec
                      ? 'Optimal'
                      : compatibility.gpuMeetsMin
                        ? 'Playable'
                        : 'Below Min'}
                  </span>
                </div>
                <span className="mt-0.5 block truncate text-xs font-bold text-text">
                  {compatibility.gpuName}
                </span>
                <span className="block text-[10px] text-muted">
                  {compatibility.gpuVramGb
                    ? `${compatibility.gpuVramGb} GB Dedicated VRAM`
                    : 'DirectX 12 Compatible'}
                </span>
              </div>
            </div>

            {/* RAM Card */}
            <div className="flex items-start gap-2.5 rounded-xl border border-border/80 bg-surface/90 p-3">
              {compatibility.ramMeetsRec || compatibility.ramPracticalHigh ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" />
              ) : compatibility.ramMeetsMin ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-cyan-400" />
              ) : (
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-subtle">
                    System Memory
                  </span>
                  <span
                    className={cn(
                      'font-mono text-[9px] font-black uppercase',
                      compatibility.ramMeetsRec
                        ? 'text-emerald-400'
                        : compatibility.ramPracticalHigh
                          ? 'text-emerald-400'
                          : compatibility.ramMeetsMin
                            ? 'text-cyan-400'
                            : 'text-amber-400',
                    )}
                  >
                    {compatibility.ramMeetsRec
                      ? 'Optimal'
                      : compatibility.ramPracticalHigh
                        ? 'High Ready'
                        : compatibility.ramMeetsMin
                          ? 'Meets Min'
                          : 'Upgrade'}
                  </span>
                </div>
                <span className="mt-0.5 block truncate text-xs font-bold text-text">
                  {compatibility.userRamGb} GB RAM Installed
                </span>
                <span className="block text-[10px] text-muted">
                  Min: {compatibility.minRamGb} GB · Rec: {compatibility.recRamGb} GB
                </span>
              </div>
            </div>

            {/* Storage Card */}
            <div className="flex items-start gap-2.5 rounded-xl border border-border/80 bg-surface/90 p-3">
              {compatibility.diskMeets ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" />
              ) : (
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-subtle">
                    Storage Space
                  </span>
                  <span
                    className={cn(
                      'font-mono text-[9px] font-black uppercase',
                      compatibility.diskMeets ? 'text-emerald-400' : 'text-amber-400',
                    )}
                  >
                    {compatibility.diskMeets ? 'Ready' : 'Low Space'}
                  </span>
                </div>
                <span className="mt-0.5 block truncate text-xs font-bold text-text">
                  {compatibility.maxFreeDiskGb} GB Free on Drive
                </span>
                <span className="block text-[10px] text-muted">
                  Requires ~{compatibility.reqStorageGb} GB
                </span>
              </div>
            </div>
          </div>

          {/* ── Interactive FPS & Resolution Simulator (1080p / 1440p / 4K × Low / Med / High / Ultra) ── */}
          <div className="mt-1 flex flex-col gap-4 rounded-2xl border border-border/80 bg-surface/95 p-4 shadow-inner">
            <div className="flex flex-col gap-3 border-b border-border/70 pb-3.5 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex size-8 items-center justify-center rounded-xl border border-accent/30 bg-accent/15 text-accent">
                  <Gauge className="size-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-text">
                      Interactive Frame Rate (FPS) &amp; Resolution Estimator
                    </h3>
                    <span className="rounded-md border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 font-mono text-[9px] font-bold uppercase text-emerald-400">
                      {fpsEstimation.upscalerTechName} Ready
                    </span>
                  </div>
                  <p className="text-[11px] text-muted">
                    Select resolution and upscaling mode to simulate estimated Average FPS, 1% Low FPS, and VRAM usage on your rig
                  </p>
                </div>
              </div>

              {/* Resolution & Upscaler Selectors */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-surface-raised p-1">
                  {([
                    { id: '1080p', label: '1080p FHD' },
                    { id: '1440p', label: '1440p QHD' },
                    { id: '4k', label: '4K UHD' },
                  ] as const).map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setSelectedResolution(r.id)}
                      className={cn(
                        'rounded-lg px-2.5 py-1 font-mono text-[10.5px] font-extrabold transition-all cursor-pointer',
                        selectedResolution === r.id
                          ? 'bg-accent text-white shadow-2xs'
                          : 'text-subtle hover:text-text',
                      )}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>

                <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-surface-raised p-1">
                  {([
                    { id: 'native', label: 'Native' },
                    { id: 'quality', label: `${fpsEstimation.upscalerTechName} Quality` },
                    { id: 'balanced', label: 'Balanced' },
                    { id: 'performance', label: 'Perf' },
                  ] as const).map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => setSelectedUpscaler(u.id)}
                      className={cn(
                        'rounded-lg px-2.5 py-1 font-mono text-[10.5px] font-extrabold transition-all cursor-pointer',
                        selectedUpscaler === u.id
                          ? 'bg-emerald-500 text-black shadow-2xs'
                          : 'text-subtle hover:text-text',
                      )}
                    >
                      {u.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 4 Preset Live FPS Gauge Cards */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {fpsEstimation.activePresets.map((cell) => {
                const barPct = Math.min(100, Math.max(10, Math.round((cell.avgFps / 144) * 100)))
                const isSmooth = cell.avgFps >= 60
                const isPlayable = cell.avgFps >= 38 && cell.avgFps < 60
                return (
                  <div
                    key={cell.preset}
                    className="flex flex-col justify-between rounded-xl border border-border/80 bg-surface-raised/60 p-3.5"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px] font-black uppercase tracking-wider text-text">
                          {cell.label} Preset
                        </span>
                        <span
                          className={cn(
                            'rounded px-1.5 py-0.5 font-mono text-[9px] font-black uppercase',
                            isSmooth
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : isPlayable
                                ? 'bg-cyan-500/20 text-cyan-400'
                                : 'bg-amber-500/20 text-amber-400',
                          )}
                        >
                          {cell.avgFps >= 100
                            ? '100+ Hz'
                            : isSmooth
                              ? '60+ Smooth'
                              : isPlayable
                                ? 'Playable'
                                : 'Heavy Load'}
                        </span>
                      </div>

                      <div className="mt-2.5 flex items-baseline gap-1.5">
                        <span
                          className={cn(
                            'font-mono text-2xl sm:text-3xl font-black tabular-nums',
                            isSmooth
                              ? 'text-emerald-400'
                              : isPlayable
                                ? 'text-cyan-400'
                                : 'text-amber-400',
                          )}
                        >
                          ~{cell.avgFps}
                        </span>
                        <span className="font-mono text-xs font-bold text-subtle">FPS</span>
                        <span className="ml-auto font-mono text-[10px] text-muted">
                          {cell.fpsRangeText}
                        </span>
                      </div>

                      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-border/60">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all duration-300',
                            isSmooth
                              ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                              : isPlayable
                                ? 'bg-gradient-to-r from-cyan-500 to-sky-400'
                                : 'bg-gradient-to-r from-amber-500 to-orange-400',
                          )}
                          style={{ width: `${barPct}%` }}
                        />
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2 font-mono text-[10px] text-muted">
                      <span>
                        1% Low: <strong className="text-text">{cell.onePercentLowFps} FPS</strong>
                      </span>
                      <span className={cell.vramSpillover ? 'font-bold text-amber-400' : ''}>
                        VRAM: {cell.estVramGb}/{fpsEstimation.userVramGb} GB
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* 3x4 All-Resolutions Overview Table + Bottleneck Detector */}
            <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[1.35fr_1fr]">
              <div className="overflow-hidden rounded-xl border border-border/80 bg-surface-raised/35">
                <div className="grid grid-cols-5 border-b border-border/70 bg-surface-raised/80 px-3.5 py-2 font-mono text-[10px] font-black uppercase tracking-wider text-subtle">
                  <div>Resolution</div>
                  <div className="text-center">Low</div>
                  <div className="text-center">Medium</div>
                  <div className="text-center">High</div>
                  <div className="text-center">Ultra / RT</div>
                </div>
                <div className="divide-y divide-border/50">
                  {fpsEstimation.matrix.map((row) => {
                    const isSel = row.resolution === selectedResolution
                    return (
                      <div
                        key={row.resolution}
                        onClick={() => setSelectedResolution(row.resolution)}
                        className={cn(
                          'grid grid-cols-5 items-center px-3.5 py-2 text-xs transition-colors cursor-pointer',
                          isSel ? 'bg-accent/10 font-bold' : 'hover:bg-surface-raised/60',
                        )}
                      >
                        <div>
                          <span className="block font-bold text-text">{row.label}</span>
                          <span className="font-mono text-[9.5px] text-subtle">{row.sublabel}</span>
                        </div>
                        {(['low', 'medium', 'high', 'ultra'] as const).map((pKey) => {
                          const c = row.presets[pKey]
                          return (
                            <div key={pKey} className="text-center font-mono">
                              <span
                                className={cn(
                                  'inline-block rounded-md px-2 py-0.5 text-[11px] font-black',
                                  c.avgFps >= 60
                                    ? 'bg-emerald-500/15 text-emerald-400'
                                    : c.avgFps >= 38
                                      ? 'bg-cyan-500/15 text-cyan-400'
                                      : 'bg-amber-500/15 text-amber-400',
                                )}
                              >
                                {c.avgFps} FPS
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Bottleneck & Load Diagnostic Card */}
              <div className="flex flex-col justify-between rounded-xl border border-border/80 bg-surface-raised/40 p-3.5">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-black uppercase tracking-wider text-accent">
                      <Activity className="size-3.5" />
                      Bottleneck &amp; Hardware Load Detector
                    </span>
                    {fpsEstimation.bottleneck.limitingFactor === 'vram' ||
                    fpsEstimation.bottleneck.limitingFactor === 'ram' ? (
                      <AlertTriangle className="size-4 text-amber-400" />
                    ) : (
                      <CheckCircle2 className="size-4 text-emerald-400" />
                    )}
                  </div>
                  <h4 className="text-xs sm:text-sm font-extrabold text-text">
                    {fpsEstimation.bottleneck.title}
                  </h4>
                  <p className="text-[11px] leading-relaxed text-muted">
                    {fpsEstimation.bottleneck.description}
                  </p>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border/60 pt-2.5 font-mono text-[10px]">
                  <div className="rounded-lg border border-border/60 bg-surface p-2">
                    <span className="block text-subtle">CPU Load</span>
                    <strong className="text-xs text-cyan-400">
                      ~{fpsEstimation.bottleneck.cpuLoadPercent}%
                    </strong>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-surface p-2">
                    <span className="block text-subtle">GPU Load</span>
                    <strong className="text-xs text-emerald-400">
                      ~{fpsEstimation.bottleneck.gpuLoadPercent}%
                    </strong>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-surface p-2">
                    <span className="block text-subtle">VRAM Est.</span>
                    <strong
                      className={cn(
                        'text-xs',
                        fpsEstimation.bottleneck.estVramUsedGb > fpsEstimation.userVramGb
                          ? 'text-amber-400'
                          : 'text-purple-300',
                      )}
                    >
                      {fpsEstimation.bottleneck.estVramUsedGb}/{fpsEstimation.userVramGb}G
                    </strong>
                  </div>
                </div>
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
              <span>Recommended Specification (1440p / High–Ultra)</span>
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
      <div className="flex items-center justify-between border-b border-border/70 pb-3">
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              'size-2.5 rounded-full',
              isRecommended
                ? 'bg-accent shadow-[0_0_10px_var(--nx-accent)]'
                : 'bg-emerald-400',
            )}
          />
          <h3 className="text-sm font-extrabold uppercase tracking-wider text-text">
            {isRecommended ? 'Recommended Configuration' : 'Minimum Configuration'}
          </h3>
        </div>
        <span
          className={cn(
            'rounded-lg px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase',
            isRecommended
              ? 'border border-accent/30 bg-accent/15 text-accent'
              : 'border border-emerald-500/30 bg-emerald-500/15 text-emerald-400',
          )}
        >
          {isRecommended ? '1440p / High–Ultra' : '1080p / 60 FPS'}
        </span>
      </div>

      <div className="grid gap-3">
        {items.map((item) => {
          const Icon = item.icon
          return (
            <div
              key={item.label}
              className="flex items-start gap-3 rounded-xl border border-border/60 bg-surface-raised/50 p-3"
            >
              <Icon
                className={cn(
                  'mt-0.5 size-4 shrink-0',
                  isRecommended ? 'text-accent' : 'text-emerald-400',
                )}
              />
              <div className="min-w-0 flex-1">
                <span className="block font-mono text-[10px] font-bold uppercase tracking-wider text-subtle">
                  {item.label}
                </span>
                <span className="mt-0.5 block text-xs font-semibold leading-snug text-text">
                  {item.value}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {detail.additional_notes && (
        <div className="mt-auto flex items-start gap-2 rounded-xl border border-border/60 bg-surface p-3 text-xs text-muted">
          <Info className="mt-0.5 size-3.5 shrink-0 text-subtle" />
          <span>{detail.additional_notes}</span>
        </div>
      )}
    </div>
  )
}
