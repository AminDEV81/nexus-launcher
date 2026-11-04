import React, { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Gamepad2,
  Gauge,
  Monitor,
  Sparkles,
  Zap,
} from "lucide-react"
import { getSystemSpecs } from "@/services/system"
import type { SystemRequirements } from "@/types/models"
import {
  buildSynthesizedRequirements,
  estimateGameFpsMatrix,
  type TargetResolution,
  type UpscalerMode,
} from "@/features/hub/utils/fps-estimator"
import { useFocusable } from "../nav/FocusScope"

export interface ConsoleFpsEstimatorSectionProps {
  scopeId: string
  gameName: string
  releaseDate?: string | null
  genres?: string[]
  systemRequirements?: SystemRequirements | null
  isLight?: boolean
}

const ResFocusPill: React.FC<{
  id: string
  scopeId: string
  label: string
  sublabel: string
  active: boolean
  isLight: boolean
  onSelect: () => void
}> = ({ id, scopeId, label, sublabel, active, isLight, onSelect }) => {
  const focus = useFocusable<HTMLButtonElement>({
    id,
    scopeId,
    onConfirm: onSelect,
  })
  return (
    <button
      type="button"
      {...focus.focusProps}
      className={`flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-extrabold transition-all cursor-pointer outline-none ${
        focus.isFocused
          ? "scale-105 border-cyan-300 bg-cyan-400 text-slate-950 ring-2 ring-cyan-300/60 shadow-lg"
          : active
            ? isLight
              ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
              : "border-cyan-400/60 bg-cyan-500/25 text-cyan-200 shadow-sm"
            : isLight
              ? "border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200"
              : "border-white/12 bg-white/5 text-slate-300 hover:bg-white/10"
      }`}
    >
      <Monitor className="size-3.5 shrink-0" />
      <span>{label}</span>
      <span className="font-mono text-[10px] opacity-75">({sublabel})</span>
    </button>
  )
}

const UpscalerFocusPill: React.FC<{
  id: string
  scopeId: string
  label: string
  badge: string
  active: boolean
  isLight: boolean
  onSelect: () => void
}> = ({ id, scopeId, label, badge, active, isLight, onSelect }) => {
  const focus = useFocusable<HTMLButtonElement>({
    id,
    scopeId,
    onConfirm: onSelect,
  })
  return (
    <button
      type="button"
      {...focus.focusProps}
      className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-extrabold transition-all cursor-pointer outline-none ${
        focus.isFocused
          ? "scale-105 border-amber-300 bg-amber-400 text-slate-950 ring-2 ring-amber-300/60 shadow-lg"
          : active
            ? isLight
              ? "border-emerald-600 bg-emerald-600 text-white shadow-sm"
              : "border-emerald-400/60 bg-emerald-500/25 text-emerald-200 shadow-sm"
            : isLight
              ? "border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200"
              : "border-white/12 bg-white/5 text-slate-300 hover:bg-white/10"
      }`}
    >
      <Zap className="size-3 shrink-0" />
      <span>{label}</span>
      <span className="rounded bg-black/20 px-1.5 py-0.5 font-mono text-[9.5px]">{badge}</span>
    </button>
  )
}

export const ConsoleFpsEstimatorSection: React.FC<ConsoleFpsEstimatorSectionProps> = ({
  scopeId,
  gameName,
  releaseDate,
  genres = [],
  systemRequirements,
  isLight = false,
}) => {
  const [resolution, setResolution] = useState<TargetResolution>("1080p")
  const [upscaler, setUpscaler] = useState<UpscalerMode>("native")

  const { data: pcSpecs } = useQuery({
    queryKey: ["system-specs-hub-check"],
    queryFn: getSystemSpecs,
    staleTime: 1000 * 60 * 10,
  })

  const fallbackReqs = useMemo(
    () => buildSynthesizedRequirements(releaseDate, genres, gameName),
    [releaseDate, genres, gameName],
  )

  const minSpec = useMemo(() => {
    const raw = systemRequirements?.minimum
    if (raw && (raw.processor || raw.graphics || raw.memory)) {
      return {
        os: raw.os || fallbackReqs.minimum.os,
        processor: raw.processor || fallbackReqs.minimum.processor,
        memory: raw.memory || fallbackReqs.minimum.memory,
        graphics: raw.graphics || fallbackReqs.minimum.graphics,
        storage: raw.storage || fallbackReqs.minimum.storage,
      }
    }
    return fallbackReqs.minimum
  }, [systemRequirements?.minimum, fallbackReqs.minimum])

  const recSpec = useMemo(() => {
    const raw = systemRequirements?.recommended
    if (raw && (raw.processor || raw.graphics || raw.memory)) {
      return {
        os: raw.os || fallbackReqs.recommended.os,
        processor: raw.processor || fallbackReqs.recommended.processor,
        memory: raw.memory || fallbackReqs.recommended.memory,
        graphics: raw.graphics || fallbackReqs.recommended.graphics,
        storage: raw.storage || fallbackReqs.recommended.storage,
      }
    }
    return fallbackReqs.recommended
  }, [systemRequirements?.recommended, fallbackReqs.recommended])

  const estimation = useMemo(
    () =>
      estimateGameFpsMatrix({
        pcSpecs,
        systemRequirements: { minimum: minSpec, recommended: recSpec },
        gameTitle: gameName,
        releaseDate,
        genres,
        selectedResolution: resolution,
        selectedUpscaler: upscaler,
      }),
    [pcSpecs, minSpec, recSpec, gameName, releaseDate, genres, resolution, upscaler],
  )

  return (
    <div
      className={`rounded-3xl border p-6 space-y-6 ${
        isLight
          ? "border-slate-300 bg-white/90 shadow-lg"
          : "border-white/12 bg-white/[0.04] shadow-2xl"
      }`}
    >
      {/* Top Header & Detected Rig Summary */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4 border-white/10">
        <div className="flex items-center gap-3">
          <div
            className={`flex size-11 items-center justify-center rounded-2xl border ${
              isLight
                ? "border-indigo-200 bg-indigo-50 text-indigo-600"
                : "border-cyan-400/35 bg-cyan-500/15 text-cyan-300"
            }`}
          >
            <Gauge className="size-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2
                className={`text-lg font-black tracking-tight ${
                  isLight ? "text-slate-900" : "text-white"
                }`}
              >
                Live FPS &amp; Resolution Estimator
              </h2>
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase ${
                  isLight
                    ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                    : "border-emerald-400/35 bg-emerald-500/15 text-emerald-300"
                }`}
              >
                <Sparkles className="size-3" />
                Hardware-Calibrated
              </span>
            </div>
            <p className={`text-xs ${isLight ? "text-slate-600" : "text-slate-400"}`}>
              Simulated frame rate for <strong>{gameName}</strong> on your{" "}
              <span className="font-bold">{estimation.userGpuName}</span> ({estimation.userVramGb} GB VRAM) &amp;{" "}
              <span className="font-bold">{estimation.userCpuName}</span> ({estimation.userRamGb} GB RAM)
            </p>
          </div>
        </div>
      </div>

      {/* Interactive Resolution & Upscaler Controls */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`mr-1 font-mono text-[10px] font-black uppercase tracking-wider ${
              isLight ? "text-slate-500" : "text-slate-400"
            }`}
          >
            Resolution:
          </span>
          <ResFocusPill
            id={`${scopeId}_fps_res_1080p`}
            scopeId={scopeId}
            label="1080p FHD"
            sublabel="1920×1080"
            active={resolution === "1080p"}
            isLight={isLight}
            onSelect={() => setResolution("1080p")}
          />
          <ResFocusPill
            id={`${scopeId}_fps_res_1440p`}
            scopeId={scopeId}
            label="1440p QHD"
            sublabel="2560×1440"
            active={resolution === "1440p"}
            isLight={isLight}
            onSelect={() => setResolution("1440p")}
          />
          <ResFocusPill
            id={`${scopeId}_fps_res_4k`}
            scopeId={scopeId}
            label="4K UHD"
            sublabel="3840×2160"
            active={resolution === "4k"}
            isLight={isLight}
            onSelect={() => setResolution("4k")}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`mr-1 font-mono text-[10px] font-black uppercase tracking-wider ${
              isLight ? "text-slate-500" : "text-slate-400"
            }`}
          >
            {estimation.upscalerTechName} Mode:
          </span>
          <UpscalerFocusPill
            id={`${scopeId}_fps_up_native`}
            scopeId={scopeId}
            label="Native TAA"
            badge="100%"
            active={upscaler === "native"}
            isLight={isLight}
            onSelect={() => setUpscaler("native")}
          />
          <UpscalerFocusPill
            id={`${scopeId}_fps_up_quality`}
            scopeId={scopeId}
            label={`${estimation.upscalerTechName} Quality`}
            badge="+32%"
            active={upscaler === "quality"}
            isLight={isLight}
            onSelect={() => setUpscaler("quality")}
          />
          <UpscalerFocusPill
            id={`${scopeId}_fps_up_balanced`}
            scopeId={scopeId}
            label="Balanced"
            badge="+48%"
            active={upscaler === "balanced"}
            isLight={isLight}
            onSelect={() => setUpscaler("balanced")}
          />
          <UpscalerFocusPill
            id={`${scopeId}_fps_up_perf`}
            scopeId={scopeId}
            label="Performance"
            badge="+68%"
            active={upscaler === "performance"}
            isLight={isLight}
            onSelect={() => setUpscaler("performance")}
          />
        </div>
      </div>

      {/* 4 Preset Live FPS Gauge Cards (Low / Medium / High / Ultra) */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {estimation.activePresets.map((cell) => {
          const barWidth = Math.min(100, Math.max(10, Math.round((cell.avgFps / 144) * 100)))
          const isEmerald = cell.avgFps >= 60
          const isCyan = cell.avgFps >= 40 && cell.avgFps < 60
          return (
            <div
              key={cell.preset}
              className={`relative overflow-hidden rounded-2xl border p-4 transition-all ${
                isLight
                  ? "border-slate-200 bg-slate-50/90"
                  : "border-white/10 bg-black/35"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`font-mono text-xs font-black uppercase tracking-wider ${
                    isLight ? "text-slate-700" : "text-slate-200"
                  }`}
                >
                  {cell.label} Preset
                </span>
                <span
                  className={`rounded-md px-2 py-0.5 font-mono text-[9.5px] font-black uppercase ${
                    isEmerald
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                      : isCyan
                        ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                        : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                  }`}
                >
                  {cell.avgFps >= 100
                    ? "100+ Hz"
                    : cell.avgFps >= 60
                      ? "60+ Smooth"
                      : cell.avgFps >= 35
                        ? "Playable"
                        : "Low FPS"}
                </span>
              </div>

              <div className="mt-3 flex items-baseline gap-2">
                <span
                  className={`font-mono text-3xl font-black tabular-nums ${
                    isEmerald
                      ? isLight
                        ? "text-emerald-600"
                        : "text-emerald-400"
                      : isCyan
                        ? isLight
                          ? "text-cyan-600"
                          : "text-cyan-300"
                        : isLight
                          ? "text-amber-600"
                          : "text-amber-400"
                  }`}
                >
                  ~{cell.avgFps}
                </span>
                <span className={`font-mono text-xs font-bold ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                  FPS Avg
                </span>
                <span className={`ml-auto font-mono text-[10px] ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                  {cell.fpsRangeText}
                </span>
              </div>

              {/* Progress bar */}
              <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-slate-500/20">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    isEmerald
                      ? "bg-gradient-to-r from-emerald-500 to-teal-400"
                      : isCyan
                        ? "bg-gradient-to-r from-cyan-500 to-sky-400"
                        : "bg-gradient-to-r from-amber-500 to-orange-400"
                  }`}
                  style={{ width: `${barWidth}%` }}
                />
              </div>

              <div
                className={`mt-3 flex items-center justify-between border-t pt-2.5 font-mono text-[10px] ${
                  isLight ? "border-slate-200 text-slate-600" : "border-white/10 text-slate-400"
                }`}
              >
                <span>1% Low: <strong>{cell.onePercentLowFps} FPS</strong></span>
                <span className={cell.vramSpillover ? "text-amber-400 font-bold" : ""}>
                  VRAM: {cell.estVramGb}/{estimation.userVramGb} GB
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Full 3x4 Multi-Resolution Overview Table + Bottleneck Detector */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.35fr_1fr]">
        {/* 3x4 Resolution Matrix */}
        <div
          className={`overflow-hidden rounded-2xl border ${
            isLight ? "border-slate-200 bg-slate-50" : "border-white/10 bg-black/30"
          }`}
        >
          <div
            className={`grid grid-cols-5 border-b px-4 py-2.5 font-mono text-[10px] font-black uppercase tracking-wider ${
              isLight
                ? "border-slate-200 bg-slate-100 text-slate-600"
                : "border-white/10 bg-white/[0.04] text-slate-400"
            }`}
          >
            <div>Resolution</div>
            <div className="text-center">Low</div>
            <div className="text-center">Medium</div>
            <div className="text-center">High</div>
            <div className="text-center">Ultra / RT</div>
          </div>
          <div className="divide-y divide-white/5">
            {estimation.matrix.map((row) => {
              const isSelected = row.resolution === resolution
              return (
                <div
                  key={row.resolution}
                  onClick={() => setResolution(row.resolution)}
                  className={`grid grid-cols-5 items-center px-4 py-2.5 text-xs transition-colors cursor-pointer ${
                    isSelected
                      ? isLight
                        ? "bg-indigo-50/90 font-bold"
                        : "bg-cyan-500/12 font-bold"
                      : ""
                  }`}
                >
                  <div>
                    <span className={`block font-bold ${isLight ? "text-slate-900" : "text-white"}`}>
                      {row.label}
                    </span>
                    <span className="font-mono text-[9.5px] opacity-65">{row.sublabel}</span>
                  </div>
                  {(["low", "medium", "high", "ultra"] as const).map((pKey) => {
                    const c = row.presets[pKey]
                    return (
                      <div key={pKey} className="text-center font-mono">
                        <span
                          className={`inline-block rounded-lg px-2 py-0.5 text-xs font-black ${
                            c.avgFps >= 60
                              ? isLight
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-emerald-500/20 text-emerald-300"
                              : c.avgFps >= 40
                                ? isLight
                                  ? "bg-cyan-100 text-cyan-800"
                                  : "bg-cyan-500/20 text-cyan-300"
                                : isLight
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-amber-500/20 text-amber-300"
                          }`}
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
        <div
          className={`flex flex-col justify-between rounded-2xl border p-4 ${
            isLight ? "border-slate-200 bg-slate-50" : "border-white/10 bg-black/30"
          }`}
        >
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-black uppercase tracking-wider text-cyan-400">
                <Activity className="size-3.5" />
                Bottleneck &amp; Hardware Load Analysis
              </span>
              {estimation.bottleneck.limitingFactor === "vram" ||
              estimation.bottleneck.limitingFactor === "ram" ? (
                <AlertTriangle className="size-4 text-amber-400" />
              ) : (
                <CheckCircle2 className="size-4 text-emerald-400" />
              )}
            </div>
            <h3 className={`text-sm font-black ${isLight ? "text-slate-900" : "text-white"}`}>
              {estimation.bottleneck.title}
            </h3>
            <p className={`text-xs leading-relaxed ${isLight ? "text-slate-600" : "text-slate-300"}`}>
              {estimation.bottleneck.description}
            </p>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2 pt-3 border-t border-white/10 font-mono text-[10px]">
            <div className={`rounded-xl p-2 ${isLight ? "bg-white border border-slate-200" : "bg-white/5"}`}>
              <span className="block opacity-70">CPU Load</span>
              <strong className={`text-xs ${isLight ? "text-slate-900" : "text-cyan-300"}`}>
                ~{estimation.bottleneck.cpuLoadPercent}%
              </strong>
            </div>
            <div className={`rounded-xl p-2 ${isLight ? "bg-white border border-slate-200" : "bg-white/5"}`}>
              <span className="block opacity-70">GPU Load</span>
              <strong className={`text-xs ${isLight ? "text-slate-900" : "text-emerald-300"}`}>
                ~{estimation.bottleneck.gpuLoadPercent}%
              </strong>
            </div>
            <div className={`rounded-xl p-2 ${isLight ? "bg-white border border-slate-200" : "bg-white/5"}`}>
              <span className="block opacity-70">Est. VRAM</span>
              <strong
                className={`text-xs ${
                  estimation.bottleneck.estVramUsedGb > estimation.userVramGb
                    ? "text-amber-400"
                    : isLight
                      ? "text-slate-900"
                      : "text-purple-300"
                }`}
              >
                {estimation.bottleneck.estVramUsedGb}/{estimation.userVramGb}G
              </strong>
            </div>
          </div>
        </div>
      </div>

      {/* Minimum vs Recommended Spec Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs pt-2 border-t border-white/10">
        <div
          className={`rounded-2xl border p-4 space-y-1.5 ${
            isLight
              ? "border-slate-200 bg-slate-50 text-slate-700"
              : "border-white/10 bg-black/30 text-slate-300"
          }`}
        >
          <p className="font-black uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
            <Cpu className="size-3.5" /> Minimum (1080p Playable)
          </p>
          {minSpec.os && <p><strong>OS:</strong> {minSpec.os}</p>}
          {minSpec.processor && <p><strong>CPU:</strong> {minSpec.processor}</p>}
          {minSpec.memory && <p><strong>RAM:</strong> {minSpec.memory}</p>}
          {minSpec.graphics && <p><strong>GPU:</strong> {minSpec.graphics}</p>}
          {minSpec.storage && <p><strong>Storage:</strong> {minSpec.storage}</p>}
        </div>

        <div
          className={`rounded-2xl border p-4 space-y-1.5 ${
            isLight
              ? "border-slate-200 bg-slate-50 text-slate-700"
              : "border-white/10 bg-black/30 text-slate-300"
          }`}
        >
          <p className="font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
            <Gamepad2 className="size-3.5" /> Recommended (1080p / 1440p High–Ultra)
          </p>
          {recSpec.os && <p><strong>OS:</strong> {recSpec.os}</p>}
          {recSpec.processor && <p><strong>CPU:</strong> {recSpec.processor}</p>}
          {recSpec.memory && <p><strong>RAM:</strong> {recSpec.memory}</p>}
          {recSpec.graphics && <p><strong>GPU:</strong> {recSpec.graphics}</p>}
          {recSpec.storage && <p><strong>Storage:</strong> {recSpec.storage}</p>}
        </div>
      </div>
    </div>
  )
}
