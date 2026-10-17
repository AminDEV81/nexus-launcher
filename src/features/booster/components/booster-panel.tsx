import { useEffect, useMemo, useState, useTransition } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Activity,
  Check,
  Cpu,
  Crosshair,
  Flame,
  Gauge,
  Globe,
  Headphones,
  Layers,
  Loader2,
  MemoryStick,
  Radar,
  RefreshCw,
  Rocket,
  RotateCcw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  Trash2,
  Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Switch } from '@/features/settings/components/appearance-panel'
import { useAppearanceSettingsStore } from '@/store/appearance-settings-store'
import { useAnimationSpeed } from '@/hooks/use-animation-speed'
import {
  BOOSTER_MODULE_IDS,
  useAutoBoost,
  useBoostableApps,
  useBoosterExcludedApps,
  useBoosterModules,
  useKillSelectedApps,
  useRestoreGameBoost,
  useRunGameBoost,
  type BoosterModuleId,
  type BoosterPresetId,
} from '@/features/booster/hooks/use-game-boost'
import {
  BOOSTER_CATEGORY_LABELS,
  BOOSTER_MODULES,
  type BoosterModuleCategory,
} from '@/features/booster/utils/module-meta'
import { useSystemTweakStatus } from '@/features/booster/hooks/use-system-tweaks'
import {
  useBoostRam,
  useLiveSystemMetrics,
  useSystemSpecs,
} from '@/features/settings/hooks/use-system-specs'
import { BoosterScanDial, HudCorners, ReactorTelemetryPills } from './booster-scan-dial'
import { SystemTweaksTab } from './system-tweaks-tab'
import { playBoostCharge, playBoostComplete, playButtonClick } from '@/lib/sound-engine'
import type { BoostReport } from '@/services/booster'

type BoosterPhase = 'idle' | 'boosting' | 'done'
type BoosterTab = 'reactor' | 'processes' | 'tweaks'

function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes <= 0 || isNaN(bytes)) return '0 MB'
  const gb = bytes / (1024 * 1024 * 1024)
  if (gb >= 1) return `${gb.toFixed(2)} GB`
  const mb = bytes / (1024 * 1024)
  if (mb >= 1) return `${mb.toFixed(0)} MB`
  return `${Math.round(bytes / 1024)} KB`
}

const PRESETS: Array<{
  id: BoosterPresetId
  label: string
  badge: string
  description: string
  icon: typeof Rocket
  modules: readonly BoosterModuleId[]
  whitelistVoice: boolean
}> = [
  {
    id: 'esports_max',
    label: 'Esports Overdrive',
    badge: 'MAX FPS',
    description: 'Arms all 10 kernel & memory modules and closes every background bloat app.',
    icon: Flame,
    modules: BOOSTER_MODULE_IDS,
    whitelistVoice: false,
  },
  {
    id: 'streamer_safe',
    label: 'Voice & Stream Safe',
    badge: 'DISCORD SAFE',
    description: 'Full CPU/RAM/1ms Timer boost while protecting Discord, Spotify & Overwolf.',
    icon: Headphones,
    modules: BOOSTER_MODULE_IDS,
    whitelistVoice: true,
  },
  {
    id: 'memory_stutter',
    label: 'Zero-Stutter & RAM',
    badge: 'KEEP APPS OPEN',
    description: 'Purges Standby RAM, locks 1.0ms timer & MMCSS without closing open apps.',
    icon: MemoryStick,
    modules: [
      'ram',
      'cpu',
      'gaming_priority',
      'timer_res',
      'power_plan',
      'game_mode',
      'indexer_pause',
      'temp',
    ],
    whitelistVoice: false,
  },
]

const VOICE_SAFE_APPS = ['Discord', 'Spotify', 'Overwolf Overlay', 'Telegram Desktop']

const CATEGORY_BADGES: Record<string, { label: string; color: string; icon: typeof Globe }> = {
  browser: {
    label: 'Web Browser',
    color: 'border-sky-500/30 bg-sky-500/10 text-sky-400',
    icon: Globe,
  },
  chat_media: {
    label: 'Chat & Media',
    color: 'border-purple-500/30 bg-purple-500/10 text-purple-400',
    icon: Headphones,
  },
  cloud_sync: {
    label: 'Cloud Sync',
    color: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
    icon: Layers,
  },
  utility: {
    label: 'Background Utility',
    color: 'border-rose-500/30 bg-rose-500/10 text-rose-400',
    icon: Cpu,
  },
}

export function BoosterPanel({ standalonePage = false }: { standalonePage?: boolean }) {
  const speed = useAnimationSpeed()
  const { data: boostableApps, refetch: refetchApps, isFetching: isScanning } = useBoostableApps()
  const { data: specs } = useSystemSpecs()
  const { data: liveMetrics } = useLiveSystemMetrics()
  const { data: tweakStatus } = useSystemTweakStatus()

  const runBoost = useRunGameBoost()
  const restoreBoost = useRestoreGameBoost()
  const killApps = useKillSelectedApps()
  const boostRamOnly = useBoostRam()

  const { enabled: autoBoost, setEnabled: setAutoBoost } = useAutoBoost()
  const { enabledIds, isEnabled: isModuleEnabled, toggle: toggleModule, setModules } =
    useBoosterModules()
  const { excludedNames, isExcluded, toggleExclude, setExcluded } = useBoosterExcludedApps()
  const reduceMotion = useAppearanceSettingsStore((s) => s.reduceMotion)
  const [, startTransition] = useTransition()

  const [activeTab, setActiveTab] = useState<BoosterTab>('reactor')
  const [phase, setPhase] = useState<BoosterPhase>('idle')
  const [revealedCount, setRevealedCount] = useState(0)
  const [report, setReport] = useState<BoostReport | null>(null)
  const [procCategoryFilter, setProcCategoryFilter] = useState<string>('all')

  // Live Hardware Telemetry
  const memory = liveMetrics?.memory ?? specs?.memory
  const totalRam = memory?.total_bytes ?? 0
  const usedRam = memory?.used_bytes ?? 0
  const ramPercent = totalRam > 0 ? Math.min(100, Math.round((usedRam / totalRam) * 100)) : 0
  const cpuLoad = liveMetrics?.cpu_usage_percent ?? specs?.cpu.usage_percent ?? 0
  const cpuFreqMhz = liveMetrics?.cpu_frequency_mhz ?? specs?.cpu.frequency_mhz ?? 0
  const cpuGhz = cpuFreqMhz > 0 ? `${(cpuFreqMhz / 1000).toFixed(2)} GHz` : 'Turbo'

  const apps = useMemo(() => boostableApps ?? [], [boostableApps])
  const targetApps = useMemo(
    () => apps.filter((a) => !isExcluded(a.name)),
    [apps, excludedNames],
  )
  const protectedAppsCount = apps.length - targetApps.length
  const reclaimableRamBytes = useMemo(
    () => targetApps.reduce((acc, a) => acc + (a.memory_bytes || 0), 0),
    [targetApps],
  )
  const totalProcessInstances = useMemo(
    () => targetApps.reduce((acc, a) => acc + (a.instance_count || 1), 0),
    [targetApps],
  )

  // Determine active preset
  const activePreset = useMemo<BoosterPresetId>(() => {
    const allEnabled = BOOSTER_MODULE_IDS.every((id) => enabledIds.includes(id))
    const hasVoiceExcluded = VOICE_SAFE_APPS.every((name) =>
      excludedNames.some((ex) => ex.toLowerCase() === name.toLowerCase()),
    )
    if (allEnabled && hasVoiceExcluded) return 'streamer_safe'
    if (allEnabled && excludedNames.length === 0) return 'esports_max'
    const memSet = PRESETS[2].modules
    if (
      !enabledIds.includes('close_apps') &&
      memSet.every((id) => enabledIds.includes(id))
    ) {
      return 'memory_stutter'
    }
    return 'custom'
  }, [enabledIds, excludedNames])

  function applyPreset(presetId: BoosterPresetId) {
    playButtonClick()
    const preset = PRESETS.find((p) => p.id === presetId)
    if (!preset) return
    setModules(preset.modules)
    if (preset.whitelistVoice) {
      setExcluded(VOICE_SAFE_APPS)
    } else if (presetId === 'esports_max') {
      setExcluded([])
    }
  }

  useEffect(() => {
    if (phase !== 'boosting' || !report) return
    if (revealedCount >= report.steps.length) {
      const timeout = setTimeout(() => {
        setPhase('done')
        playBoostComplete()
      }, 320)
      return () => clearTimeout(timeout)
    }
    const timeout = setTimeout(() => {
      startTransition(() => {
        setRevealedCount((c) => c + 1)
      })
    }, 280)
    return () => clearTimeout(timeout)
  }, [phase, report, revealedCount])

  async function handleBoost() {
    if (phase === 'boosting') return
    playBoostCharge()
    setPhase('boosting')
    setRevealedCount(0)
    setReport(null)
    try {
      const result = await runBoost.mutateAsync()
      setReport(result)
    } catch {
      setPhase('idle')
    }
  }

  async function handleRestore() {
    playButtonClick()
    await restoreBoost.mutateAsync()
    setPhase('idle')
    setReport(null)
  }

  async function handleKillTargetApps() {
    if (targetApps.length === 0 || killApps.isPending) return
    playButtonClick()
    await killApps.mutateAsync(targetApps.map((a) => a.name))
  }

  const progress =
    report && report.steps.length > 0
      ? Math.min(100, (revealedCount / report.steps.length) * 100)
      : 0
  const moduleCount = enabledIds.length
  const animatePct = phase === 'done' ? 100 : progress
  const activeStep = report?.steps[Math.min(revealedCount, (report?.steps.length ?? 1) - 1)]

  const filteredApps = useMemo(() => {
    if (procCategoryFilter === 'all') return apps
    return apps.filter((a) => a.category === procCategoryFilter)
  }, [apps, procCategoryFilter])

  return (
    <div
      className={cn(
        'relative w-full',
        standalonePage
          ? 'h-full overflow-y-auto overflow-x-hidden px-6 pb-12 pt-6 lg:px-8'
          : 'px-6 pb-8 pt-6 lg:px-8',
      )}
    >
      <div className="mx-auto flex w-full max-w-[1920px] flex-col gap-6">
      {/* ── Top Command Header ──────────────────────────────────────────── */}
      <div className="relative shrink-0 overflow-hidden rounded-3xl border border-accent/25 bg-gradient-to-br from-surface-raised/90 via-surface/90 to-bg p-6 shadow-card">
        <div
          className="pointer-events-none absolute -right-20 -top-24 size-80 rounded-full opacity-50 blur-3xl"
          style={{
            background:
              'radial-gradient(circle, color-mix(in srgb, var(--color-accent) 32%, transparent) 0%, transparent 70%)',
          }}
        />

        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 font-mono text-[10px] font-black uppercase tracking-[0.25em] text-accent">
              <Crosshair className="size-3.5" />
              <span>Nexus Overdrive Engine // Hardware &amp; Kernel Optimizer</span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-black tracking-tight text-text sm:text-3xl">
                Game Booster &amp; System Tuner
              </h1>
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[10px] font-black tracking-[0.16em]',
                  phase === 'done'
                    ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.25)]'
                    : phase === 'boosting'
                      ? 'border-accent/50 bg-accent/15 text-accent'
                      : 'border-border/80 bg-surface-raised text-subtle',
                )}
              >
                <span
                  className={cn(
                    'size-2 rounded-full',
                    phase === 'done'
                      ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                      : phase === 'boosting'
                        ? 'bg-accent animate-ping'
                        : 'bg-emerald-400',
                  )}
                />
                <span>
                  {phase === 'done'
                    ? 'PEAK GAMING STATE'
                    : phase === 'boosting'
                      ? 'OPTIMIZING KERNEL...'
                      : 'READY TO ENGAGE'}
                </span>
              </span>
            </div>
            <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-muted sm:text-sm">
              Purge Working Set &amp; Standby RAM, lock kernel timer resolution to 1.0ms, elevate
              MMCSS thread scheduling, and silence background memory hogs before entering a match.
            </p>
          </div>

          {/* Quick Header Actions */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => void refetchApps()}
              disabled={isScanning}
              className="flex h-9 items-center gap-1.5 rounded-xl border border-border/90 bg-surface px-3.5 text-xs font-bold text-text shadow-xs transition-all hover:border-accent/40 hover:bg-surface-raised active:scale-95 disabled:opacity-60"
            >
              <RefreshCw className={cn('size-3.5 text-accent', isScanning && 'animate-spin')} />
              <span>{isScanning ? 'Scanning...' : 'Scan Processes'}</span>
            </button>

            <button
              type="button"
              onClick={() => void handleRestore()}
              disabled={restoreBoost.isPending}
              title="Restore balanced power plan, release 1.0ms timer lock, and resume services"
              className="flex h-9 items-center gap-1.5 rounded-xl border border-border/90 bg-surface px-3.5 text-xs font-bold text-muted shadow-xs transition-all hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-400 active:scale-95 disabled:opacity-50"
            >
              {restoreBoost.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RotateCcw className="size-3.5" />
              )}
              <span>Restore Normal Mode</span>
            </button>
          </div>
        </div>

        {/* ── Live Hardware Telemetry Strip (4 Cards) ─────────────────────── */}
        <div className="relative mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {/* 1. Live CPU Telemetry */}
          <div className="flex flex-col justify-between rounded-2xl border border-border/80 bg-surface/80 p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="flex size-9 items-center justify-center rounded-xl bg-accent/15 text-accent">
                  <Cpu className="size-4.5" />
                </span>
                <div>
                  <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-subtle">
                    CPU Load &amp; Clock
                  </div>
                  <div className="truncate max-w-[160px] text-xs font-semibold text-text">
                    {specs?.cpu.brand?.replace(/\(R\)|\(TM\)|Processor/gi, '').trim() || 'Processor'}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-xl font-black tabular-nums text-text">
                  {cpuLoad.toFixed(0)}%
                </div>
                <div className="font-mono text-[10px] font-bold text-accent">{cpuGhz}</div>
              </div>
            </div>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-raised">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500',
                  cpuLoad > 80
                    ? 'bg-rose-500'
                    : cpuLoad > 50
                      ? 'bg-amber-400'
                      : 'bg-gradient-to-r from-accent to-cyan-400',
                )}
                style={{ width: `${Math.max(4, Math.min(100, cpuLoad))}%` }}
              />
            </div>
          </div>

          {/* 2. Live Physical RAM + 1-Click Flush */}
          <div className="flex flex-col justify-between rounded-2xl border border-border/80 bg-surface/80 p-4 shadow-xs">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span className="flex size-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
                  <MemoryStick className="size-4.5" />
                </span>
                <div>
                  <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-subtle">
                    Physical Memory
                  </div>
                  <div className="font-mono text-xs font-semibold text-text">
                    {formatBytes(usedRam)} / {formatBytes(totalRam)}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  playButtonClick()
                  boostRamOnly.mutate()
                }}
                disabled={boostRamOnly.isPending}
                title="Purge process working sets & Windows Standby memory cache"
                className="flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 font-mono text-[10px] font-bold text-emerald-400 transition-all hover:bg-emerald-500 hover:text-white active:scale-95 disabled:opacity-50"
              >
                {boostRamOnly.isPending ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Zap className="size-3 fill-current" />
                )}
                <span>Flush RAM</span>
              </button>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-raised">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-500',
                    ramPercent > 85
                      ? 'bg-rose-500'
                      : ramPercent > 65
                        ? 'bg-amber-400'
                        : 'bg-emerald-400',
                  )}
                  style={{ width: `${Math.max(4, ramPercent)}%` }}
                />
              </div>
              <span className="font-mono text-[11px] font-bold text-muted">{ramPercent}%</span>
            </div>
          </div>

          {/* 3. Reclaimable Background Bloat */}
          <div
            onClick={() => setActiveTab('processes')}
            className="group cursor-pointer flex flex-col justify-between rounded-2xl border border-border/80 bg-surface/80 p-4 shadow-xs transition-all hover:border-accent/50"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="flex size-9 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400">
                  <Radar className="size-4.5" />
                </span>
                <div>
                  <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-subtle">
                    Reclaimable Bloat
                  </div>
                  <div className="text-xs font-semibold text-text group-hover:text-accent transition-colors">
                    {targetApps.length} Apps ({totalProcessInstances} procs)
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-lg font-black text-amber-400">
                  {reclaimableRamBytes > 0 ? formatBytes(reclaimableRamBytes) : 'Clean'}
                </div>
                {protectedAppsCount > 0 && (
                  <div className="font-mono text-[10px] text-emerald-400">
                    {protectedAppsCount} Protected
                  </div>
                )}
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between text-[11px] text-subtle">
              <span>Click to manage app whitelist</span>
              <span className="font-mono font-bold text-accent">Inspect →</span>
            </div>
          </div>

          {/* 4. Auto-Boost on Game Launch */}
          <div
            className={cn(
              'flex flex-col justify-between rounded-2xl border p-4 shadow-xs transition-all',
              autoBoost
                ? 'border-accent/45 bg-accent/10'
                : 'border-border/80 bg-surface/80',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span
                  className={cn(
                    'flex size-9 items-center justify-center rounded-xl',
                    autoBoost ? 'bg-accent text-white' : 'bg-surface-raised text-subtle',
                  )}
                >
                  <ShieldCheck className="size-4.5" />
                </span>
                <div>
                  <div className="text-xs font-bold text-text">Auto-Boost on Launch</div>
                  <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-accent">
                    {autoBoost ? 'ARMED AUTOMATICALLY' : 'MANUAL TRIGGER ONLY'}
                  </div>
                </div>
              </div>
              <Switch checked={autoBoost} onChange={setAutoBoost} ariaLabel="Auto Boost" />
            </div>
            <div className="mt-3 flex items-center justify-between text-[11px] text-muted">
              <span>Armed Loadout:</span>
              <span className="font-mono font-bold text-text">
                {moduleCount}/{BOOSTER_MODULES.length} Modules • OS {tweakStatus?.optimization_score ?? 0}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Sub-Navigation Tabs (Smooth Spring Morphing) ────────────────── */}
      <div className="relative z-10 flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3.5">
        <div className="inline-flex flex-wrap items-center gap-1.5 rounded-2xl border border-border/80 bg-surface/85 p-1.5 shadow-inner backdrop-blur-md">
          {(
            [
              {
                id: 'reactor' as const,
                label: 'Reactor & Loadout',
                icon: Rocket,
                badge: `${moduleCount}/${BOOSTER_MODULES.length}`,
                badgeTone: 'default',
              },
              {
                id: 'processes' as const,
                label: 'Process & RAM Killer',
                icon: Activity,
                badge: `${apps.length}`,
                badgeTone: apps.length > 0 ? 'amber' : 'default',
              },
              {
                id: 'tweaks' as const,
                label: 'Deep OS & Kernel Tweaks',
                icon: Zap,
                badge: `${tweakStatus?.optimization_score ?? 0}%`,
                badgeTone: 'emerald',
              },
            ]
          ).map((tab) => {
            const TabIcon = tab.icon
            const isTabActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  if (activeTab === tab.id) return
                  playButtonClick()
                  setActiveTab(tab.id)
                }}
                className={cn(
                  'relative flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-colors duration-200 select-none',
                  isTabActive ? 'text-white' : 'text-muted hover:text-text',
                )}
              >
                {isTabActive && (
                  <motion.span
                    layoutId="booster-active-tab-pill"
                    transition={{
                      type: 'spring',
                      stiffness: 420,
                      damping: 32,
                      mass: 0.75,
                    }}
                    className="absolute inset-0 rounded-xl bg-gradient-to-r from-accent to-accent-hover shadow-md shadow-accent/30"
                  />
                )}
                <TabIcon className="relative z-10 size-3.5" />
                <span className="relative z-10">{tab.label}</span>
                <span
                  className={cn(
                    'relative z-10 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold transition-colors',
                    isTabActive
                      ? 'bg-white/20 text-white'
                      : tab.badgeTone === 'amber'
                        ? 'bg-amber-500/20 text-amber-400'
                        : tab.badgeTone === 'emerald'
                          ? 'bg-emerald-500/15 text-emerald-400'
                          : 'bg-surface-raised text-subtle',
                  )}
                >
                  {tab.badge}
                </span>
              </button>
            )
          })}
        </div>

        {/* Active Preset Pill */}
        <div className="hidden items-center gap-2 rounded-xl border border-border/70 bg-surface/70 px-3 py-1.5 font-mono text-xs text-subtle sm:flex">
          <Sliders className="size-3.5 text-accent" />
          <span>Active Profile:</span>
          <strong className="uppercase text-accent">
            {PRESETS.find((p) => p.id === activePreset)?.label ?? 'Custom Loadout'}
          </strong>
        </div>
      </div>

      {/* ── ANIMATED TAB STAGE (Isolated & Clipped — Zero Upward Overlap) ── */}
      <div className="relative isolate shrink-0 overflow-hidden">
      <AnimatePresence mode="wait" initial={false}>
        {activeTab === 'reactor' && (
          <motion.div
            key="booster-tab-reactor"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 * speed, ease: 'easeOut' }}
            className="flex flex-col gap-6"
          >
          {/* Reactor Core + Optimization Profiles Grid */}
          <div className="grid gap-5 lg:grid-cols-[minmax(300px,0.95fr)_minmax(0,1.25fr)]">
            {/* Left: Reactor Core Chamber */}
            <div className="relative flex flex-col items-center justify-between overflow-hidden rounded-3xl border border-accent/25 bg-gradient-to-b from-surface-raised/60 via-surface/80 to-surface p-6 text-center shadow-card sm:p-7">
              <HudCorners />

              <div className="w-full flex items-center justify-between px-2 font-mono text-[10px] font-bold uppercase tracking-widest text-subtle">
                <span>REACTOR CORE</span>
                <span className={phase === 'done' ? 'text-emerald-400' : 'text-accent'}>
                  {phase === 'done' ? '100% LOCKED' : `${moduleCount} MODULES`}
                </span>
              </div>

              <div className="my-2">
                <BoosterScanDial
                  phase={phase}
                  progress={animatePct}
                  onClick={handleBoost}
                  reduceMotion={reduceMotion}
                  reclaimableLabel={
                    reclaimableRamBytes > 0 ? formatBytes(reclaimableRamBytes) : undefined
                  }
                  activeModulesCount={moduleCount}
                />
              </div>

              <div className="w-full max-w-sm">
                <ReactorTelemetryPills phase={phase} moduleCount={moduleCount} />
                <div className="mt-3" />
                <div className="mb-1.5 flex items-center justify-between font-mono text-[10px] font-bold tracking-[0.2em] text-subtle">
                  <span>OVERDRIVE CHARGE</span>
                  <span
                    className={cn(
                      'font-mono font-bold',
                      phase === 'done' ? 'text-emerald-400' : 'text-accent',
                    )}
                  >
                    {Math.round(animatePct)}%
                  </span>
                </div>

                <div className="h-2 w-full overflow-hidden rounded-full bg-surface ring-1 ring-border/60">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-300',
                      phase === 'done'
                        ? 'bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.6)]'
                        : 'bg-gradient-to-r from-accent via-cyan-400 to-accent shadow-[0_0_12px_var(--nx-accent)]',
                    )}
                    style={{ width: `${Math.max(3, animatePct)}%` }}
                  />
                </div>

                <p className="mt-3 text-xs leading-relaxed text-muted">
                  {phase === 'idle' &&
                    (targetApps.length > 0
                      ? `${targetApps.length} background apps (${formatBytes(reclaimableRamBytes)}) queued for termination.`
                      : `${moduleCount} kernel & memory optimization modules armed.`)}
                  {phase === 'boosting' &&
                    (activeStep ? `Executing: ${activeStep.label}...` : 'Applying kernel tweaks...')}
                  {phase === 'done' &&
                    (report?.freed_ram_bytes
                      ? `Boost complete! Reclaimed ${formatBytes(report.freed_ram_bytes)} RAM & locked 1.0ms timer.`
                      : 'Max hardware headroom locked in. Ready to launch your game.')}
                </p>

                {phase === 'done' && (
                  <div className="mt-4 flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={handleBoost}
                      className="flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-xs font-bold text-white shadow-sm transition-all hover:bg-accent-hover active:scale-95"
                    >
                      <Rocket className="size-3.5" />
                      <span>Re-Boost</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleRestore()}
                      className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3.5 py-2 text-xs font-bold text-muted transition-all hover:text-text active:scale-95"
                    >
                      <RotateCcw className="size-3.5" />
                      <span>Restore Normal</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Right: 1-Click Optimization Profiles & Target App Preview */}
            <div className="flex flex-col justify-between gap-4">
              <div className="rounded-3xl border border-border/80 bg-surface/70 p-5 shadow-sm">
                <div className="mb-3.5 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-text">Optimization Profiles</h3>
                    <p className="text-xs text-muted">
                      Select a tactical preset tailored to your gaming session
                    </p>
                  </div>
                  <span className="rounded-full border border-accent/30 bg-accent/10 px-2.5 py-0.5 font-mono text-[10px] font-bold text-accent uppercase">
                    {activePreset === 'custom' ? 'Custom' : 'Preset Active'}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-2.5">
                  {PRESETS.map((preset) => {
                    const Icon = preset.icon
                    const isSelected = activePreset === preset.id
                    return (
                      <motion.button
                        key={preset.id}
                        type="button"
                        whileTap={{ scale: 0.99 }}
                        onClick={() => applyPreset(preset.id)}
                        className={cn(
                          'relative flex items-start justify-between gap-3 overflow-hidden rounded-2xl border p-3.5 text-left transition-colors duration-200 cursor-pointer',
                          isSelected
                            ? 'border-accent text-text shadow-sm'
                            : 'border-border/80 bg-surface/60 hover:border-accent/40 hover:bg-surface-raised',
                        )}
                      >
                        {isSelected && (
                          <motion.span
                            key="booster-active-preset-bg"
                            transition={{
                              type: 'spring',
                              stiffness: 400,
                              damping: 32,
                              mass: 0.75,
                            }}
                            className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-r from-accent/15 via-accent/8 to-transparent ring-1 ring-accent/35"
                          />
                        )}
                        <div className="relative z-10 flex items-start gap-3">
                          <span
                            className={cn(
                              'flex size-9 shrink-0 items-center justify-center rounded-xl transition-all duration-200',
                              isSelected
                                ? 'bg-accent text-white shadow-[0_0_12px_var(--nx-accent)]'
                                : 'bg-surface-raised text-subtle',
                            )}
                          >
                            <Icon className="size-4.5" />
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-text">{preset.label}</span>
                              <span
                                className={cn(
                                  'rounded px-1.5 py-0.5 font-mono text-[9px] font-bold transition-colors',
                                  isSelected
                                    ? 'bg-accent text-white'
                                    : 'bg-surface-raised text-subtle',
                                )}
                              >
                                {preset.badge}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-muted leading-snug">
                              {preset.description}
                            </p>
                          </div>
                        </div>

                        <span
                          className={cn(
                            'relative z-10 mt-1 flex size-5 shrink-0 items-center justify-center rounded-full border transition-all duration-200',
                            isSelected
                              ? 'border-accent bg-accent text-white scale-105'
                              : 'border-border bg-surface',
                          )}
                        >
                          {isSelected && <Check className="size-3" strokeWidth={3} />}
                        </span>
                      </motion.button>
                    )
                  })}
                </div>
              </div>

              {/* Active Background Apps Quick Bar */}
              <div className="rounded-3xl border border-border/80 bg-surface/70 p-4 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Flame className="size-4 text-amber-400" />
                    <span className="text-xs font-bold text-text">
                      Detected Background Bloat ({apps.length})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('processes')}
                    className="text-xs font-bold text-accent hover:underline"
                  >
                    Manage Whitelist →
                  </button>
                </div>

                {apps.length === 0 ? (
                  <div className="mt-2.5 flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-400">
                    <Check className="size-3.5" />
                    <span>Zero background bloatware detected. Environment is clean!</span>
                  </div>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {apps.slice(0, 7).map((app) => {
                      const protectedApp = isExcluded(app.name)
                      return (
                        <button
                          key={app.name}
                          type="button"
                          onClick={() => toggleExclude(app.name)}
                          title={
                            protectedApp
                              ? 'Protected (Click to include in Boost termination)'
                              : 'Targeted for termination (Click to protect/whitelist)'
                          }
                          className={cn(
                            'flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs font-semibold transition-all',
                            protectedApp
                              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                              : 'border-amber-500/30 bg-amber-500/10 text-text hover:border-accent',
                          )}
                        >
                          {protectedApp ? (
                            <Shield className="size-3 text-emerald-400" />
                          ) : (
                            <span className="size-1.5 rounded-full bg-amber-400" />
                          )}
                          <span>{app.name}</span>
                          <span className="font-mono text-[10px] text-subtle">
                            {formatBytes(app.memory_bytes)}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Live Execution Telemetry Log */}
          <AnimatePresence>
            {(phase === 'boosting' || phase === 'done') && report && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 * speed }}
                className="overflow-hidden rounded-3xl border border-accent/30 bg-surface/90 p-5 shadow-card"
              >
                <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
                  <div className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-wider text-text">
                    <span
                      className={cn(
                        'size-2.5 rounded-full',
                        phase === 'done' ? 'bg-emerald-400' : 'bg-accent animate-pulse',
                      )}
                    />
                    <span>Optimization Telemetry Report</span>
                  </div>
                  <div className="flex items-center gap-3 font-mono text-xs">
                    {report.freed_ram_bytes > 0 && (
                      <span className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 font-bold text-emerald-400">
                        +{formatBytes(report.freed_ram_bytes)} RAM Reclaimed
                      </span>
                    )}
                    <span className="font-bold text-accent">
                      {Math.min(revealedCount, report.steps.length)} / {report.steps.length} Steps
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  {report.steps.map((step, index) => {
                    const revealed = phase === 'done' || index < revealedCount
                    const current = phase === 'boosting' && index === revealedCount - 1
                    if (!revealed) return null

                    return (
                      <div
                        key={step.id}
                        className={cn(
                          'flex items-center gap-2.5 rounded-xl border px-3 py-2.5 transition-colors',
                          current
                            ? 'border-accent/40 bg-accent/10'
                            : 'border-border/50 bg-surface-raised/50',
                        )}
                      >
                        <span className="w-5 shrink-0 font-mono text-[10px] font-bold text-subtle">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <span
                          className={cn(
                            'flex size-4.5 shrink-0 items-center justify-center rounded-full',
                            step.applied
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : 'bg-subtle/20 text-subtle',
                          )}
                        >
                          <Check className="size-3" strokeWidth={3} />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-xs font-medium text-text">
                          {step.detail}
                        </span>
                        {step.metric && (
                          <span className="shrink-0 rounded-md border border-accent/30 bg-accent/15 px-2 py-0.5 font-mono text-[10px] font-bold text-accent">
                            {step.metric}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Categorized Optimization Modules */}
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2 px-1">
              <div className="flex items-center gap-2">
                <Zap className="size-4 text-accent" />
                <h3 className="text-base font-bold text-text">
                  Kernel, Memory &amp; OS Modules ({moduleCount}/{BOOSTER_MODULES.length} Armed)
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    playButtonClick()
                    setModules(BOOSTER_MODULE_IDS)
                  }}
                  className="rounded-xl border border-border/80 bg-surface px-3 py-1.5 text-xs font-bold text-accent hover:bg-surface-raised"
                >
                  Enable All
                </button>
                <button
                  type="button"
                  onClick={() => {
                    playButtonClick()
                    setModules([])
                  }}
                  className="rounded-xl border border-border/80 bg-surface px-3 py-1.5 text-xs font-bold text-muted hover:bg-surface-raised hover:text-text"
                >
                  Disable All
                </button>
              </div>
            </div>

            {(['cpu_kernel', 'memory_io', 'os_desktop'] as BoosterModuleCategory[]).map((cat) => {
              const catModules = BOOSTER_MODULES.filter((m) => m.category === cat)
              return (
                <div key={cat} className="space-y-2.5">
                  <div className="flex items-center gap-2 px-1 font-mono text-[11px] font-bold uppercase tracking-wider text-subtle">
                    <span>{BOOSTER_CATEGORY_LABELS[cat]}</span>
                    <span className="h-px flex-1 bg-border/50" />
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {catModules.map((module) => {
                      const Icon = module.icon
                      const enabled = isModuleEnabled(module.id)
                      return (
                        <div
                          key={module.id}
                          onClick={() => toggleModule(module.id)}
                          className={cn(
                            'group relative flex cursor-pointer flex-col justify-between overflow-hidden rounded-2xl border p-4 transition-all duration-200 shadow-xs',
                            enabled
                              ? 'border-accent/40 bg-accent/5 hover:border-accent'
                              : 'border-border/80 bg-surface/60 hover:border-border hover:bg-surface-raised/70',
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex min-w-0 items-start gap-3">
                              <span
                                className={cn(
                                  'flex size-10 shrink-0 items-center justify-center rounded-xl shadow-xs transition-colors',
                                  enabled
                                    ? 'bg-accent text-white shadow-[0_0_14px_var(--nx-accent)]'
                                    : 'bg-surface-raised text-subtle group-hover:text-text',
                                )}
                              >
                                <Icon className="size-4.5" />
                              </span>
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="text-xs font-bold text-text">
                                    {module.label}
                                  </span>
                                  <span className="rounded-md border border-accent/30 bg-accent/10 px-1.5 py-0.5 font-mono text-[9px] font-bold text-accent">
                                    {module.impactBadge}
                                  </span>
                                  {module.windowsOnly && (
                                    <span className="rounded border border-border px-1.5 py-px font-mono text-[9px] font-bold text-subtle">
                                      WIN
                                    </span>
                                  )}
                                </div>
                                <p className="mt-1 text-xs leading-relaxed text-muted">
                                  {module.description}
                                </p>
                              </div>
                            </div>

                            <div
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => e.stopPropagation()}
                            >
                              <Switch
                                checked={enabled}
                                onChange={() => toggleModule(module.id)}
                                ariaLabel={module.label}
                              />
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </motion.div>
        )}

        {/* ── TAB 2: PROCESS & RAM KILLER ─────────────────────────────────── */}
        {activeTab === 'processes' && (
          <motion.div
            key="booster-tab-processes"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 * speed, ease: 'easeOut' }}
            className="flex flex-col gap-5"
          >
          {/* Action Control Header */}
          <div className="flex flex-col gap-4 rounded-3xl border border-border/80 bg-surface/70 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Activity className="size-4 text-accent" />
                <h3 className="text-base font-bold text-text">
                  Background Process &amp; Memory Manager
                </h3>
              </div>
              <p className="mt-1 text-xs text-muted">
                Protect apps you need during gameplay (like Discord or Spotify) and terminate memory
                hogs to free up RAM and CPU threads.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => {
                  playButtonClick()
                  setExcluded(VOICE_SAFE_APPS)
                }}
                className="flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2 text-xs font-bold text-emerald-400 transition-all hover:bg-emerald-500/20 active:scale-95"
              >
                <Shield className="size-3.5" />
                <span>Protect Voice/Chat Apps</span>
              </button>

              <button
                type="button"
                onClick={() => void handleKillTargetApps()}
                disabled={targetApps.length === 0 || killApps.isPending}
                className="flex items-center gap-1.5 rounded-xl bg-rose-500 px-4 py-2 text-xs font-bold text-white shadow-md shadow-rose-500/20 transition-all hover:bg-rose-600 active:scale-95 disabled:opacity-40"
              >
                {killApps.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Trash2 className="size-3.5" />
                )}
                <span>
                  Kill {targetApps.length} Target App{targetApps.length === 1 ? '' : 's'} (
                  {formatBytes(reclaimableRamBytes)})
                </span>
              </button>
            </div>
          </div>

          {/* Category Filters */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex flex-wrap items-center gap-1 rounded-2xl border border-border/80 bg-surface/75 p-1">
              {[
                { id: 'all', label: `All Detected (${apps.length})` },
                { id: 'browser', label: 'Browsers' },
                { id: 'chat_media', label: 'Chat & Media' },
                { id: 'cloud_sync', label: 'Cloud Sync' },
                { id: 'utility', label: 'Utilities' },
              ].map((cat) => {
                const isCatActive = procCategoryFilter === cat.id
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      playButtonClick()
                      setProcCategoryFilter(cat.id)
                    }}
                    className={cn(
                      'relative cursor-pointer rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors duration-200',
                      isCatActive ? 'text-white' : 'text-muted hover:text-text',
                    )}
                  >
                    {isCatActive && (
                      <motion.span
                        key="booster-proc-filter-pill"
                        transition={{
                          type: 'spring',
                          stiffness: 420,
                          damping: 32,
                          mass: 0.7,
                        }}
                        className="absolute inset-0 rounded-xl bg-accent shadow-xs"
                      />
                    )}
                    <span className="relative z-10">{cat.label}</span>
                  </button>
                )
              })}
            </div>

            {excludedNames.length > 0 && (
              <div className="flex items-center gap-2 text-xs text-muted">
                <span>Protected Whitelist: {excludedNames.join(', ')}</span>
                <button
                  type="button"
                  onClick={() => setExcluded([])}
                  className="font-bold text-accent hover:underline"
                >
                  Clear Whitelist
                </button>
              </div>
            )}
          </div>

          {/* Process Cards List */}
          {filteredApps.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-emerald-500/30 bg-emerald-500/5 py-14 text-center">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-400">
                <ShieldCheck className="size-6" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-text">No Background Bloat Running</h4>
                <p className="mt-1 text-xs text-muted">
                  All known memory-heavy background apps in this category are currently closed.
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {filteredApps.map((app) => {
                const isProtected = isExcluded(app.name)
                const badge = CATEGORY_BADGES[app.category] ?? {
                  label: 'Background App',
                  color: 'border-border bg-surface-raised text-subtle',
                  icon: Gauge,
                }
                const BadgeIcon = badge.icon
                const memShare =
                  reclaimableRamBytes > 0
                    ? Math.min(100, Math.round((app.memory_bytes / (1024 * 1024 * 1024)) * 100))
                    : 15

                return (
                  <div
                    key={app.name}
                    className={cn(
                      'flex flex-col justify-between gap-3 rounded-2xl border p-4 transition-all',
                      isProtected
                        ? 'border-emerald-500/35 bg-emerald-500/5'
                        : 'border-border/80 bg-surface/75 hover:border-accent/40',
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <span
                          className={cn(
                            'flex size-10 shrink-0 items-center justify-center rounded-xl border',
                            badge.color,
                          )}
                        >
                          <BadgeIcon className="size-4.5" />
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate text-sm font-bold text-text">{app.name}</span>
                            <span
                              className={cn(
                                'rounded-md border px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase',
                                badge.color,
                              )}
                            >
                              {badge.label}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center gap-2 font-mono text-[11px] text-muted">
                            <span>{app.instance_count || 1} process(es)</span>
                            <span>•</span>
                            <span>PID #{app.pid}</span>
                            {app.cpu_usage > 0 && (
                              <>
                                <span>•</span>
                                <span className="text-accent">{app.cpu_usage.toFixed(1)}% CPU</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="font-mono text-sm font-black text-text">
                          {formatBytes(app.memory_bytes)}
                        </div>
                        <div className="font-mono text-[10px] text-subtle">RAM Footprint</div>
                      </div>
                    </div>

                    {/* Memory Bar & Action Strip */}
                    <div className="flex items-center justify-between gap-3 border-t border-border/50 pt-3">
                      <div className="flex flex-1 items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-raised">
                          <div
                            className={cn(
                              'h-full rounded-full',
                              isProtected ? 'bg-emerald-400' : 'bg-amber-400',
                            )}
                            style={{ width: `${Math.max(8, memShare)}%` }}
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            playButtonClick()
                            toggleExclude(app.name)
                          }}
                          className={cn(
                            'flex items-center gap-1 rounded-xl border px-2.5 py-1 text-[11px] font-bold transition-all',
                            isProtected
                              ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400'
                              : 'border-border bg-surface text-muted hover:text-text',
                          )}
                        >
                          {isProtected ? (
                            <>
                              <Shield className="size-3" />
                              <span>Protected (Keep Open)</span>
                            </>
                          ) : (
                            <>
                              <ShieldAlert className="size-3 text-amber-400" />
                              <span>Targeted for Boost</span>
                            </>
                          )}
                        </button>

                        {!isProtected && (
                          <button
                            type="button"
                            onClick={() => {
                              playButtonClick()
                              killApps.mutate([app.name])
                            }}
                            disabled={killApps.isPending}
                            className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-[11px] font-bold text-rose-400 hover:bg-rose-500 hover:text-white transition-all"
                          >
                            End Task
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          </motion.div>
        )}

        {/* ── TAB 3: DEEP OS & KERNEL TWEAKS ──────────────────────────────── */}
        {activeTab === 'tweaks' && (
          <motion.div
            key="booster-tab-tweaks"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 * speed, ease: 'easeOut' }}
          >
            <SystemTweaksTab />
          </motion.div>
        )}
      </AnimatePresence>
      </div>
      </div>
    </div>
  )
}
