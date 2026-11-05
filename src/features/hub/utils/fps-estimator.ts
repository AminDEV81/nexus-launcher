import type { SystemRequirementDetail, SystemRequirements } from '@/types/models'
import type { SystemSpecs } from '@/services/system'

export type TargetResolution = '1080p' | '1440p' | '4k'
export type UpscalerMode = 'native' | 'quality' | 'balanced' | 'performance'
export type GraphicsPreset = 'low' | 'medium' | 'high' | 'ultra'

export interface PresetFpsEstimate {
  preset: GraphicsPreset
  label: string
  avgFps: number
  onePercentLowFps: number
  fpsRangeText: string
  estVramGb: number
  vramSpillover: boolean
  tier: 'competitive' | 'smooth' | 'playable' | 'struggling'
  tierLabel: string
  frameTimeMs: number
}

export interface ResolutionMatrixRow {
  resolution: TargetResolution
  label: string
  sublabel: string
  presets: Record<GraphicsPreset, PresetFpsEstimate>
}

export interface BottleneckAnalysis {
  limitingFactor: 'gpu' | 'cpu' | 'vram' | 'ram' | 'balanced'
  title: string
  description: string
  cpuLoadPercent: number
  gpuLoadPercent: number
  estVramUsedGb: number
  userVramGb: number
  recommendedUpscaler: UpscalerMode
}

export interface FullFpsEstimationResult {
  userCpuName: string
  userGpuName: string
  userRamGb: number
  userVramGb: number
  userCpuScore: number
  userGpuScore: number
  minGpuScore: number
  recGpuScore: number
  minCpuScore: number
  recCpuScore: number
  upscalerTechName: 'DLSS' | 'FSR' | 'XeSS'
  selectedResolution: TargetResolution
  selectedUpscaler: UpscalerMode
  activePresets: PresetFpsEstimate[]
  matrix: ResolutionMatrixRow[]
  bottleneck: BottleneckAnalysis
}

export function parseGigabytes(text?: string | null): number | null {
  if (!text) return null
  const match = text.match(/(\d+(?:\.\d+)?)\s*(?:GB|Gigabytes?)/i)
  if (match) return Number(match[1])
  const mbMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:MB|Megabytes?)/i)
  if (mbMatch) return Math.round((Number(mbMatch[1]) / 1024) * 10) / 10
  return null
}

export function snapPhysicalRamGb(totalBytes: number): number {
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

export function snapGpuVramGb(vramBytes?: number | null, gpuName?: string | null): number {
  if (vramBytes && vramBytes > 0) {
    const rawGb = vramBytes / 1024 ** 3
    const standardVram = [2, 3, 4, 6, 8, 10, 12, 16, 20, 24, 32]
    for (const tier of standardVram) {
      if (rawGb >= tier * 0.85 && rawGb <= tier * 1.08) {
        return tier
      }
    }
    if (rawGb >= 1.5) return Math.round(rawGb)
  }
  // Infer VRAM from GPU model name if OS/driver did not report dedicated bytes
  const s = (gpuName || '').toLowerCase()
  if (/5090/.test(s)) return 32
  if (/4090|3090|7900\s*xtx/.test(s)) return 24
  if (/7900\s*xt/.test(s)) return 20
  if (
    /5080|4080|4070\s*ti\s*super|5070\s*ti|7900\s*gre|7800\s*xt|6950|6900|6800|9070|a770|7600\s*xt|4060\s*ti\s*16/.test(
      s,
    )
  )
    return 16
  if (/5070|4070|3080\s*12|3060\s*12|7700\s*xt|6750|6700\s*xt|b580/.test(s)) return 12
  if (/3080|2080\s*ti|6700/.test(s)) return 10
  if (
    /5060|4060|3070|3060\s*ti|2080|2070|2060\s*super|1080|1070|7600|6650|6600|5700|580\s*8|a750|a580/.test(
      s,
    )
  )
    return 8
  if (/4050|3060|2060|1660|1060|5600/.test(s)) return 6
  if (/3050|1650|1050\s*ti|970|960|580|570|5500|6500/.test(s)) return 4
  return 8
}

export function detectUpscalerTech(gpuName?: string | null): 'DLSS' | 'FSR' | 'XeSS' {
  const s = (gpuName || '').toLowerCase()
  if (/rtx\s*(?:20|30|40|50)/.test(s)) return 'DLSS'
  if (/arc\s*[ab]\d+|iris\s*xe/.test(s)) return 'XeSS'
  return 'FSR'
}

export function estimateGpuPerformanceScore(
  gpuText?: string | null,
  vramGb?: number | null,
): number {
  if (!gpuText) return vramGb ? Math.min(85, vramGb * 6) : 52
  const s = gpuText.toLowerCase()
  const isLaptop = /laptop|mobile|max-q/i.test(s)
  const laptopPenalty = isLaptop ? 0.84 : 1.0

  let base = 55
  // NVIDIA GeForce RTX 50 / 40 / 30 / 20 & GTX series
  if (/rtx\s*5090/.test(s)) base = 132
  else if (/rtx\s*4090|rtx\s*5080/.test(s)) base = 118
  else if (/rtx\s*5070\s*ti|rtx\s*4080/.test(s)) base = 104
  else if (/rtx\s*5070|rtx\s*4070\s*ti\s*super/.test(s)) base = 96
  else if (/rtx\s*4070\s*(?:ti|super)|rtx\s*3090\s*ti|rtx\s*3090/.test(s)) base = 91
  else if (/rtx\s*4070|rtx\s*3080\s*ti|rtx\s*3080/.test(s)) base = 84
  else if (/rtx\s*5060\s*ti|rtx\s*4060\s*ti|rtx\s*3070\s*ti|rtx\s*3070|rtx\s*2080\s*ti/.test(s))
    base = 76
  else if (/rtx\s*5060|rtx\s*4060|rtx\s*3060\s*ti|rtx\s*2080\s*super|rtx\s*2080/.test(s)) base = 69
  else if (/rtx\s*3060|rtx\s*2070\s*super|rtx\s*2070|rtx\s*4050|gtx\s*1080\s*ti/.test(s)) base = 62
  else if (/rtx\s*2060\s*super|rtx\s*2060|rtx\s*3050|gtx\s*1080|gtx\s*1660\s*(?:ti|super)/.test(s))
    base = 53
  else if (/gtx\s*1660|gtx\s*1070\s*ti|gtx\s*1070/.test(s)) base = 47
  else if (/gtx\s*1650\s*super|gtx\s*1060/.test(s)) base = 41
  else if (/gtx\s*1650|gtx\s*970|gtx\s*1050\s*ti/.test(s)) base = 33
  else if (/gtx\s*1050|gtx\s*960|gtx\s*950|gtx\s*750/.test(s)) base = 24
  // AMD Radeon RX 9000 / 7000 / 6000 / 5000 / 500
  else if (/rx\s*7900\s*xtx|rx\s*9070\s*xt/.test(s)) base = 105
  else if (/rx\s*7900\s*xt|rx\s*9070|rx\s*6950\s*xt/.test(s)) base = 93
  else if (/rx\s*7900\s*gre|rx\s*7800\s*xt|rx\s*6900\s*xt|rx\s*6800\s*xt/.test(s)) base = 84
  else if (/rx\s*7700\s*xt|rx\s*6800|rx\s*6750\s*xt|rx\s*6700\s*xt/.test(s)) base = 74
  else if (/rx\s*7600\s*xt|rx\s*7600|rx\s*6650\s*xt|rx\s*6600\s*xt|rx\s*5700\s*xt/.test(s))
    base = 64
  else if (/rx\s*6600|rx\s*5700|rx\s*5600\s*xt/.test(s)) base = 56
  else if (/rx\s*5500\s*xt|rx\s*6500\s*xt|rx\s*590|rx\s*580/.test(s)) base = 42
  else if (/rx\s*570|rx\s*480|rx\s*470|radeon\s*780m|radeon\s*890m/.test(s)) base = 35
  else if (/rx\s*560|rx\s*550|vega|radeon\s*680m/.test(s)) base = 26
  // Intel Arc & Integrated
  else if (/arc\s*b580|arc\s*a770/.test(s)) base = 66
  else if (/arc\s*b570|arc\s*a750/.test(s)) base = 59
  else if (/arc\s*a580|arc\s*a380/.test(s)) base = 42
  else if (/iris\s*xe|uhd\s*graphics|intel\(r\)\s*graphics/.test(s)) base = 20
  else if (vramGb) {
    if (vramGb >= 16) base = 86
    else if (vramGb >= 12) base = 75
    else if (vramGb >= 8) base = 64
    else if (vramGb >= 6) base = 52
    else if (vramGb >= 4) base = 36
    else base = 22
  }

  return Math.round(base * laptopPenalty)
}

export function estimateCpuPerformanceScore(
  cpuText?: string | null,
  logicalCores?: number | null,
  physicalCores?: number | null,
): number {
  const s = (cpuText || '').toLowerCase()
  const threads = logicalCores || (physicalCores ? physicalCores * 2 : 8)

  if (/9800x3d|9950x3d|7800x3d|7950x3d/.test(s)) return 105
  if (/9950x|9900x|7950x|14900k|13900k|ultra\s*9/.test(s)) return 98
  if (/9700x|7900x|7700x|5800x3d|5700x3d|14700k|13700k|12900k|ultra\s*7/.test(s)) return 90
  if (/9600x|7600x|7600|7500f|14600k|13600k|12700k|12700|5950x|5900x|ultra\s*5/.test(s)) return 83
  if (/14500|14400|13500|13400|12600k|12600|12400|11900k|11700k|5800x|5700x|5600x|5600/.test(s))
    return 74
  if (
    /11600|11400|10900k|10700k|10700|10600k|10400|9900k|9700k|3900x|3800x|3700x|3600x|3600|5500/.test(
      s,
    )
  )
    return 63
  if (/13100|12100|10100|9600k|9400|8700k|8700|8400|2700x|2600x|2600|3300x|3100/.test(s)) return 52
  if (/7700k|7700|6700k|6700|4790k|1800x|1700|1600|1500x|2400g|2200g|8100/.test(s)) return 38

  if (threads >= 20) return 90
  if (threads >= 16) return 82
  if (threads >= 12) return 72
  if (threads >= 8) return 58
  if (threads >= 6) return 48
  return 35
}

export function buildSynthesizedRequirements(
  releaseDate?: string | null,
  genres: string[] = [],
  gameTitle?: string | null,
): { minimum: SystemRequirementDetail; recommended: SystemRequirementDetail } {
  const titleLower = (gameTitle || '').toLowerCase()
  const year = releaseDate ? Number(releaseDate.slice(0, 4)) || 2024 : 2024
  const genreStr = genres.join(' ').toLowerCase()

  const isHeavyAAA =
    /cyberpunk|alan wake 2|wukong|grand theft auto vi|gta 6|gta vi|starfield|stalker 2|indiana jones|monster hunter wilds|avatar|flight simulator|senua/i.test(
      titleLower,
    )
  const isEsportsOrLight =
    /counter-strike|valorant|league of legends|dota 2|overwatch|rocket league|hades|hollow knight|celeste|undertale|stardew|cuphead|dead cells|terraria|balatro/i.test(
      titleLower,
    )
  const isIndie =
    isEsportsOrLight ||
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

  if (isHeavyAAA || year >= 2024) {
    return {
      minimum: {
        os: 'Windows 10 / 11 64-bit (22H2+)',
        processor: 'Intel Core i5-10400 / AMD Ryzen 5 3600 (6 Cores)',
        memory: '16 GB RAM',
        graphics: 'NVIDIA GeForce RTX 2060 (6 GB) / AMD Radeon RX 6600 (8 GB)',
        directx: 'Version 12',
        storage: '80 GB available space (SSD required)',
        sound_card: 'DirectX 12 Spatial Audio',
        network: 'Broadband Internet connection',
        additional_notes: 'Targets 1080p @ 45–60 FPS (Low/Medium Settings, DLSS/FSR Quality)',
      },
      recommended: {
        os: 'Windows 11 64-bit',
        processor: 'Intel Core i7-12700K / AMD Ryzen 7 5800X3D (8 Cores)',
        memory: '16 GB RAM',
        graphics: 'NVIDIA GeForce RTX 4070 (12 GB) / AMD Radeon RX 7800 XT (16 GB)',
        directx: 'Version 12 Ultimate',
        storage: '80 GB available space (NVMe PCIe 4.0 SSD)',
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

export function estimateGameFpsMatrix(params: {
  pcSpecs?: SystemSpecs | null
  systemRequirements?: SystemRequirements | null
  gameTitle?: string | null
  releaseDate?: string | null
  genres?: string[]
  selectedResolution: TargetResolution
  selectedUpscaler: UpscalerMode
}): FullFpsEstimationResult {
  const {
    pcSpecs,
    systemRequirements,
    gameTitle,
    releaseDate,
    genres = [],
    selectedResolution,
    selectedUpscaler,
  } = params

  const fallback = buildSynthesizedRequirements(releaseDate, genres, gameTitle)
  const minSpec = systemRequirements?.minimum || fallback.minimum
  const recSpec = systemRequirements?.recommended || fallback.recommended

  const primaryGpu = pcSpecs?.gpus.find((g) => g.is_primary) ?? pcSpecs?.gpus[0]
  const userGpuName = primaryGpu?.name || 'NVIDIA GeForce RTX 3060 (Detected Profile)'
  const userCpuName = pcSpecs?.cpu.brand || '8-Core Gaming Processor'
  const userRamGb = pcSpecs ? snapPhysicalRamGb(pcSpecs.memory.total_bytes) : 16
  const userVramGb = snapGpuVramGb(primaryGpu?.vram_bytes, userGpuName)

  const userGpuScore = estimateGpuPerformanceScore(userGpuName, userVramGb)
  const userCpuScore = estimateCpuPerformanceScore(
    userCpuName,
    pcSpecs?.cpu.logical_cores,
    pcSpecs?.cpu.physical_cores,
  )

  const minGpuScore = Math.max(
    24,
    Math.min(58, estimateGpuPerformanceScore(minSpec.graphics || fallback.minimum.graphics, 6)),
  )
  const recGpuScore = Math.max(
    minGpuScore + 14,
    Math.min(92, estimateGpuPerformanceScore(recSpec.graphics || fallback.recommended.graphics, 8)),
  )

  const minCpuScore = Math.max(
    32,
    Math.min(
      60,
      estimateCpuPerformanceScore(minSpec.processor || fallback.minimum.processor, 6, 4),
    ),
  )
  const recCpuScore = Math.max(
    minCpuScore + 12,
    Math.min(
      86,
      estimateCpuPerformanceScore(recSpec.processor || fallback.recommended.processor, 12, 6),
    ),
  )

  const minRamGb = Math.min(16, parseGigabytes(minSpec.memory) ?? 8)
  const recRamGb = Math.max(minRamGb, parseGigabytes(recSpec.memory) ?? 16)

  // Baseline VRAM demand at 1080p High based on game weight
  const base1080pHighVramGb = recGpuScore >= 80 ? 7.2 : recGpuScore >= 65 ? 5.8 : 3.8

  // Compute Base 1080p High GPU FPS:
  // If userGpuScore === recGpuScore -> ~65 FPS at 1080p High Native
  // If userGpuScore === minGpuScore -> ~38 FPS at 1080p High Native (~52 FPS on Low)
  let gpuBase1080pHighFps: number
  if (userGpuScore >= recGpuScore) {
    const ratioAbove = userGpuScore / recGpuScore
    gpuBase1080pHighFps = 65 * Math.pow(ratioAbove, 1.08)
  } else if (userGpuScore >= minGpuScore) {
    const t = (userGpuScore - minGpuScore) / Math.max(1, recGpuScore - minGpuScore)
    gpuBase1080pHighFps = 38 + t * (65 - 38)
  } else {
    const ratioBelow = userGpuScore / Math.max(1, minGpuScore)
    gpuBase1080pHighFps = 38 * Math.pow(ratioBelow, 1.25)
  }

  // CPU Ceiling FPS (CPU limits how fast frames can be prepared regardless of resolution)
  let cpuCeilingBaseFps: number
  if (userCpuScore >= recCpuScore) {
    cpuCeilingBaseFps = 95 * Math.pow(userCpuScore / recCpuScore, 1.15)
  } else if (userCpuScore >= minCpuScore) {
    const t = (userCpuScore - minCpuScore) / Math.max(1, recCpuScore - minCpuScore)
    cpuCeilingBaseFps = 55 + t * (95 - 55)
  } else {
    cpuCeilingBaseFps = 55 * Math.pow(userCpuScore / Math.max(1, minCpuScore), 1.2)
  }

  // RAM factor: 16 GB is 1.0x for gaming; < minRamGb incurs stutter penalty
  const ramFactor =
    userRamGb >= recRamGb
      ? 1.03
      : userRamGb >= 16 && minRamGb <= 16
        ? 1.0
        : userRamGb >= minRamGb
          ? 0.94
          : 0.76

  const resConfig: Record<
    TargetResolution,
    { label: string; sublabel: string; gpuMult: number; vramAddGb: number }
  > = {
    '1080p': { label: '1080p FHD', sublabel: '1920 × 1080', gpuMult: 1.0, vramAddGb: 0 },
    '1440p': { label: '1440p QHD', sublabel: '2560 × 1440', gpuMult: 0.68, vramAddGb: 1.4 },
    '4k': { label: '4K Ultra HD', sublabel: '3840 × 2160', gpuMult: 0.39, vramAddGb: 3.2 },
  }

  const presetConfig: Record<
    GraphicsPreset,
    { label: string; gpuMult: number; cpuMult: number; vramDeltaGb: number }
  > = {
    low: { label: 'Low', gpuMult: 1.38, cpuMult: 1.15, vramDeltaGb: -1.4 },
    medium: { label: 'Medium', gpuMult: 1.16, cpuMult: 1.06, vramDeltaGb: -0.6 },
    high: { label: 'High', gpuMult: 1.0, cpuMult: 1.0, vramDeltaGb: 0 },
    ultra: { label: 'Ultra / RT', gpuMult: 0.74, cpuMult: 0.88, vramDeltaGb: 1.6 },
  }

  const upscalerConfig: Record<
    UpscalerMode,
    { gpuBoost1080: number; gpuBoost1440: number; gpuBoost4k: number; vramSaveGb: number }
  > = {
    native: { gpuBoost1080: 1.0, gpuBoost1440: 1.0, gpuBoost4k: 1.0, vramSaveGb: 0 },
    quality: { gpuBoost1080: 1.24, gpuBoost1440: 1.34, gpuBoost4k: 1.42, vramSaveGb: 0.5 },
    balanced: { gpuBoost1080: 1.36, gpuBoost1440: 1.48, gpuBoost4k: 1.62, vramSaveGb: 0.8 },
    performance: { gpuBoost1080: 1.5, gpuBoost1440: 1.66, gpuBoost4k: 1.85, vramSaveGb: 1.1 },
  }

  const computeCell = (
    res: TargetResolution,
    preset: GraphicsPreset,
    upscaler: UpscalerMode,
  ): PresetFpsEstimate => {
    const rc = resConfig[res]
    const pc = presetConfig[preset]
    const uc = upscalerConfig[upscaler]

    const upBoost =
      res === '1080p' ? uc.gpuBoost1080 : res === '1440p' ? uc.gpuBoost1440 : uc.gpuBoost4k

    const estVramGb = Math.max(
      2.0,
      Math.round((base1080pHighVramGb + rc.vramAddGb + pc.vramDeltaGb - uc.vramSaveGb) * 10) / 10,
    )
    const vramSpillover = estVramGb > userVramGb + 0.3
    const vramPenalty = vramSpillover ? Math.max(0.52, 1 - (estVramGb - userVramGb) * 0.14) : 1.0

    const rawGpuFps = gpuBase1080pHighFps * rc.gpuMult * pc.gpuMult * upBoost * vramPenalty
    const rawCpuFps = cpuCeilingBaseFps * pc.cpuMult

    // Soft harmonic blend between GPU-bound and CPU-bound FPS so whichever is lower dominates realistically
    const combinedFps =
      ((rawGpuFps * rawCpuFps) /
        Math.pow(Math.pow(rawGpuFps, 2.6) + Math.pow(rawCpuFps, 2.6), 1 / 2.6)) *
      ramFactor

    const avgFps = Math.max(12, Math.min(240, Math.round(combinedFps)))
    const lowRatio = vramSpillover ? 0.64 : ramFactor < 0.9 ? 0.68 : 0.78
    const onePercentLowFps = Math.max(8, Math.round(avgFps * lowRatio))

    const spread = Math.max(4, Math.round(avgFps * 0.09))
    const fpsRangeText = `${Math.max(10, avgFps - spread)}–${avgFps + spread} FPS`
    const frameTimeMs = Math.round((1000 / avgFps) * 10) / 10

    let tier: PresetFpsEstimate['tier'] = 'playable'
    let tierLabel = 'Playable (35–59 FPS)'
    if (avgFps >= 100) {
      tier = 'competitive'
      tierLabel = 'High-Refresh (100+ FPS)'
    } else if (avgFps >= 60) {
      tier = 'smooth'
      tierLabel = 'Smooth 60+ FPS'
    } else if (avgFps >= 35) {
      tier = 'playable'
      tierLabel = 'Console Smooth (35–59 FPS)'
    } else {
      tier = 'struggling'
      tierLabel = 'Heavy Load (<35 FPS)'
    }

    return {
      preset,
      label: pc.label,
      avgFps,
      onePercentLowFps,
      fpsRangeText,
      estVramGb,
      vramSpillover,
      tier,
      tierLabel,
      frameTimeMs,
    }
  }

  const resolutions: TargetResolution[] = ['1080p', '1440p', '4k']
  const presetsList: GraphicsPreset[] = ['low', 'medium', 'high', 'ultra']

  const matrix: ResolutionMatrixRow[] = resolutions.map((res) => {
    const rc = resConfig[res]
    const rowPresets = {
      low: computeCell(res, 'low', selectedUpscaler),
      medium: computeCell(res, 'medium', selectedUpscaler),
      high: computeCell(res, 'high', selectedUpscaler),
      ultra: computeCell(res, 'ultra', selectedUpscaler),
    }
    return {
      resolution: res,
      label: rc.label,
      sublabel: rc.sublabel,
      presets: rowPresets,
    }
  })

  const activeRow = matrix.find((r) => r.resolution === selectedResolution) ?? matrix[0]
  const activePresets = presetsList.map((p) => activeRow.presets[p])

  // Bottleneck analysis at the selected resolution (High preset)
  const highCell = activeRow.presets.high
  const rcSel = resConfig[selectedResolution]
  const ucSel = upscalerConfig[selectedUpscaler]
  const upBoostSel =
    selectedResolution === '1080p'
      ? ucSel.gpuBoost1080
      : selectedResolution === '1440p'
        ? ucSel.gpuBoost1440
        : ucSel.gpuBoost4k

  const rawGpuAtHigh = gpuBase1080pHighFps * rcSel.gpuMult * upBoostSel
  const rawCpuAtHigh = cpuCeilingBaseFps

  const upscalerTechName = detectUpscalerTech(userGpuName)

  let limitingFactor: BottleneckAnalysis['limitingFactor'] = 'balanced'
  let bnTitle = 'Well-Balanced Gaming Configuration'
  let bnDesc = `Your CPU and GPU work in harmony at ${rcSel.label}. GPU utilization will stay near 95–99% with stable frame pacing.`
  let cpuLoadPercent = Math.min(99, Math.max(35, Math.round((highCell.avgFps / rawCpuAtHigh) * 92)))
  let gpuLoadPercent = Math.min(99, Math.max(45, Math.round((highCell.avgFps / rawGpuAtHigh) * 98)))

  if (highCell.vramSpillover) {
    limitingFactor = 'vram'
    gpuLoadPercent = 99
    bnTitle = `VRAM Capacity Limit at ${rcSel.label} (${highCell.estVramGb} GB Needed vs ${userVramGb} GB)`
    bnDesc = `High/Ultra textures at ${rcSel.label} exceed your ${userVramGb} GB VRAM buffer. Lower Texture Quality to Medium or enable ${upscalerTechName} Balanced/Performance to prevent frame-time stutter.`
  } else if (userRamGb < minRamGb) {
    limitingFactor = 'ram'
    bnTitle = `System RAM Bottleneck (${userRamGb} GB Installed vs ${minRamGb} GB Minimum)`
    bnDesc = `Close background browsers and apps before launching to avoid pagefile disk swapping.`
  } else if (rawCpuAtHigh < rawGpuAtHigh * 0.85) {
    limitingFactor = 'cpu'
    cpuLoadPercent = 96
    gpuLoadPercent = Math.min(90, Math.max(55, Math.round((rawCpuAtHigh / rawGpuAtHigh) * 92)))
    bnTitle = `CPU-Bound Scenario at ${rcSel.label}`
    bnDesc = `Your ${userGpuName} is fast enough that frame rate at ${rcSel.label} is primarily paced by your processor (${userCpuName}). Increasing resolution or visual quality to High/Ultra will barely reduce FPS.`
  } else if (rawGpuAtHigh < rawCpuAtHigh * 0.82) {
    limitingFactor = 'gpu'
    gpuLoadPercent = 99
    cpuLoadPercent = Math.min(85, Math.max(38, Math.round((rawGpuAtHigh / rawCpuAtHigh) * 85)))
    bnTitle = `GPU-Bound at ${rcSel.label} (Normal Gaming Load)`
    bnDesc = `Performance at ${rcSel.label} is driven directly by your ${userGpuName}. Enabling ${upscalerTechName} Quality/Balanced boosts FPS by ~30–45% with near-native clarity.`
  }

  const recommendedUpscaler: UpscalerMode =
    selectedResolution === '4k'
      ? 'balanced'
      : selectedResolution === '1440p' || highCell.avgFps < 60
        ? 'quality'
        : 'native'

  return {
    userCpuName,
    userGpuName,
    userRamGb,
    userVramGb,
    userCpuScore,
    userGpuScore,
    minGpuScore,
    recGpuScore,
    minCpuScore,
    recCpuScore,
    upscalerTechName,
    selectedResolution,
    selectedUpscaler,
    activePresets,
    matrix,
    bottleneck: {
      limitingFactor,
      title: bnTitle,
      description: bnDesc,
      cpuLoadPercent,
      gpuLoadPercent,
      estVramUsedGb: highCell.estVramGb,
      userVramGb,
      recommendedUpscaler,
    },
  }
}
