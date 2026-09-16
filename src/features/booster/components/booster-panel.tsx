import { useEffect, useState, useTransition } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Activity,
  Check,
  Crosshair,
  Flame,
  Radar,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Switch } from '@/features/settings/components/appearance-panel'
import { useAppearanceSettingsStore } from '@/store/appearance-settings-store'
import {
  useAutoBoost,
  useBoostableApps,
  useBoosterModules,
  useRunGameBoost,
} from '@/features/booster/hooks/use-game-boost'
import { BOOSTER_MODULES } from '@/features/booster/utils/module-meta'
import { BoosterScanDial, HudCorners } from './booster-scan-dial'
import { playBoostCharge, playBoostComplete } from '@/lib/sound-engine'
import type { BoostReport } from '@/services/booster'

type BoosterPhase = 'idle' | 'boosting' | 'done'

export function BoosterPanel() {
  const { data: boostableApps, refetch: refetchApps, isFetching: isScanning } = useBoostableApps()
  const runBoost = useRunGameBoost()
  const { enabled: autoBoost, setEnabled: setAutoBoost } = useAutoBoost()
  const { isEnabled: isModuleEnabled, toggle: toggleModule } = useBoosterModules()
  const reduceMotion = useAppearanceSettingsStore((s) => s.reduceMotion)
  const [, startTransition] = useTransition()

  const [phase, setPhase] = useState<BoosterPhase>('idle')
  const [revealedCount, setRevealedCount] = useState(0)
  const [report, setReport] = useState<BoostReport | null>(null)

  useEffect(() => {
    if (phase !== 'boosting' || !report) return
    if (revealedCount >= report.steps.length) {
      const timeout = setTimeout(() => {
        setPhase('done')
        playBoostComplete()
      }, 400)
      return () => clearTimeout(timeout)
    }
    const timeout = setTimeout(() => {
      startTransition(() => {
        setRevealedCount((c) => c + 1)
      })
    }, 380)
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

  const detectedCount = boostableApps?.length ?? 0
  const progress = report ? Math.min(100, (revealedCount / report.steps.length) * 100) : 0
  const moduleCount = BOOSTER_MODULES.filter((m) => isModuleEnabled(m.id)).length
  const animatePct = phase === 'done' ? 100 : progress

  const statusText =
    phase === 'idle' ? 'STANDBY' : phase === 'boosting' ? 'OPTIMIZING...' : 'SYSTEM ARMED'

  const previewApps = (boostableApps ?? []).slice(0, 8)
  const extraApps = Math.max(0, detectedCount - previewApps.length)
  const activeStep = report?.steps[Math.min(revealedCount, report.steps.length - 1)]

  return (
    <div className="relative px-6 pb-8 pt-6 lg:px-8">
      {/* Top Header */}
      <div className="relative mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-border/60 pb-5">
        <div>
          <div className="mb-2 flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-accent">
            <Crosshair className="size-3.5" />
            Performance Optimizer
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-text">Game Booster</h2>
          <p className="mt-1 max-w-lg text-sm text-muted">
            Quiet background bloat, elevate CPU scheduling, free system memory, and unleash maximum
            FPS.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => void refetchApps()}
            disabled={isScanning}
            title="Rescan background apps"
            className="flex h-9 items-center gap-1.5 rounded-xl border border-border/90 bg-surface px-3 text-xs font-semibold text-text shadow-xs transition-all hover:bg-surface-raised hover:border-accent/40 active:scale-95 disabled:opacity-60"
          >
            <RefreshCw className={cn('size-3.5 text-accent', isScanning && 'animate-spin')} />
            <span>{isScanning ? 'Scanning...' : 'Rescan'}</span>
          </button>

          <div
            className={cn(
              'flex h-9 items-center gap-2 rounded-xl border px-3.5 font-mono text-[11px] font-bold tracking-[0.16em] shadow-xs transition-all',
              phase === 'done'
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                : phase === 'boosting'
                  ? 'border-accent/50 bg-accent/15 text-accent'
                  : 'border-border/80 bg-surface-raised/80 text-subtle',
            )}
          >
            <span
              className={cn(
                'size-2 rounded-full',
                phase === 'done'
                  ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]'
                  : phase === 'boosting'
                    ? 'bg-accent animate-ping'
                    : 'bg-subtle',
              )}
            />
            <span>{statusText}</span>
          </div>
        </div>
      </div>

      {/* Main Reactor Bay & Telemetry Grid */}
      <div className="relative grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(260px,0.8fr)]">
        {/* Left: Booster Reactor Deck */}
        <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-3xl border border-accent/25 bg-surface-raised/40 p-6 text-center shadow-card sm:p-8">
          <HudCorners />

          <BoosterScanDial
            phase={phase}
            progress={animatePct}
            onClick={handleBoost}
            reduceMotion={reduceMotion}
          />

          <div className="mt-5 w-full max-w-xs">
            <div className="mb-1.5 flex items-center justify-between font-mono text-[9px] font-bold tracking-[0.2em] text-subtle">
              <span>CORE CHARGE</span>
              <span
                className={cn(
                  'font-mono font-bold',
                  phase === 'done' ? 'text-emerald-400' : 'text-accent',
                )}
              >
                {Math.round(animatePct)}%
              </span>
            </div>

            {/* High-contrast smooth progress track */}
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface ring-1 ring-border/50">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-300',
                  phase === 'done'
                    ? 'bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.5)]'
                    : 'bg-gradient-to-r from-accent to-accent-hover shadow-[0_0_12px_var(--nx-accent)]',
                )}
                style={{ width: `${Math.max(2, animatePct)}%` }}
              />
            </div>
          </div>

          <p className="mt-3 max-w-sm text-xs leading-relaxed text-muted">
            {phase === 'idle' &&
              (detectedCount > 0
                ? `${detectedCount} background apps found ready to silence • ${moduleCount} active modules`
                : `${moduleCount} optimization modules armed and ready`)}
            {phase === 'boosting' &&
              (activeStep ? `Running: ${activeStep.label}...` : 'Applying optimizations...')}
            {phase === 'done' && 'Max hardware headroom locked in. Launch your game.'}
          </p>

          {phase === 'done' && (
            <button
              type="button"
              onClick={handleBoost}
              className="mt-4 flex items-center gap-2 rounded-xl border border-accent/40 bg-accent/15 px-5 py-2 text-xs font-bold text-accent shadow-xs transition-all hover:bg-accent hover:text-white active:scale-95"
            >
              <Rocket className="size-3.5" />
              <span>Boost Again</span>
            </button>
          )}
        </div>

        {/* Right: Telemetry & Protocol Cards */}
        <div className="flex flex-col gap-3">
          <TelemetryCard
            icon={Radar}
            label="Background Apps"
            value={String(detectedCount).padStart(2, '0')}
            hint={detectedCount > 0 ? 'Quiet target apps' : 'Clean environment'}
            accent={detectedCount > 0}
          />

          <TelemetryCard
            icon={Activity}
            label="Armed Modules"
            value={`${moduleCount}/${BOOSTER_MODULES.length}`}
            hint="Active optimization loadout"
            accent={moduleCount > 0}
          />

          <div
            className={cn(
              'flex flex-1 flex-col justify-between rounded-2xl border p-4 shadow-sm transition-all',
              autoBoost
                ? 'border-accent/40 bg-accent/10 shadow-[0_4px_20px_color-mix(in_srgb,var(--color-accent)_12%,transparent)]'
                : 'border-border/80 bg-surface/70',
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span
                  className={cn(
                    'flex size-10 items-center justify-center rounded-xl shadow-xs',
                    autoBoost ? 'bg-accent text-white' : 'bg-surface-raised text-subtle',
                  )}
                >
                  <ShieldCheck className="size-5" />
                </span>
                <div>
                  <div className="text-sm font-bold text-text">Auto Boost</div>
                  <div className="font-mono text-[9px] font-semibold tracking-wider text-subtle">
                    ON GAME LAUNCH
                  </div>
                </div>
              </div>
              <Switch checked={autoBoost} onChange={setAutoBoost} ariaLabel="Auto Boost" />
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted">
              Automatically deploys this optimization suite the moment any game launches.
            </p>
          </div>
        </div>
      </div>

      {/* Target Apps Shelf */}
      {previewApps.length > 0 && phase === 'idle' && (
        <div className="relative mt-5 rounded-2xl border border-border/80 bg-surface/50 p-4">
          <div className="mb-2.5 flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-subtle">
            <Flame className="size-3 text-amber-500" />
            <span>Target Background Apps ({detectedCount})</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {previewApps.map((app) => (
              <span
                key={`${app.name}-${app.pid}`}
                className="flex items-center gap-1.5 rounded-lg border border-accent/25 bg-accent/10 px-2.5 py-1 text-xs font-medium text-text"
              >
                <span className="size-1.5 rounded-full bg-accent" />
                <span>{app.name}</span>
                <span className="font-mono text-[10px] text-subtle">#{app.pid}</span>
              </span>
            ))}
            {extraApps > 0 && (
              <span className="rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-subtle">
                +{extraApps} more
              </span>
            )}
          </div>
        </div>
      )}

      {/* Live Step Execution Feed */}
      <AnimatePresence>
        {(phase === 'boosting' || phase === 'done') && report && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="relative mt-5 overflow-hidden rounded-2xl border border-accent/25 bg-surface/80 p-4 shadow-sm"
          >
            <div className="mb-3 flex items-center justify-between border-b border-border/60 pb-2.5">
              <div className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-subtle">
                <span
                  className={cn(
                    'size-2 rounded-full',
                    phase === 'done' ? 'bg-emerald-400' : 'bg-accent animate-pulse',
                  )}
                />
                <span>Optimization Sequence Log</span>
              </div>
              <span className="font-mono text-xs font-bold text-accent">
                {Math.min(revealedCount, report.steps.length)} / {report.steps.length}
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              {report.steps.map((step, index) => {
                const revealed = phase === 'done' || index < revealedCount
                const current = phase === 'boosting' && index === revealedCount - 1
                if (!revealed) return null

                return (
                  <div
                    key={step.id}
                    className={cn(
                      'flex items-center gap-2.5 rounded-xl px-3 py-2 transition-colors',
                      current ? 'bg-accent/10' : 'bg-surface-raised/40',
                    )}
                  >
                    <span className="w-5 shrink-0 font-mono text-[10px] font-bold text-subtle">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span
                      className={cn(
                        'flex size-4 shrink-0 items-center justify-center rounded-full',
                        step.applied
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-subtle/20 text-subtle',
                      )}
                    >
                      <Check className="size-2.5" strokeWidth={3} />
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

      {/* Module Loadout Grid */}
      <div className="relative mt-7">
        <div className="mb-3 flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <Zap className="size-4 text-accent" />
            <span className="text-sm font-bold tracking-tight text-text">
              Optimization Modules ({moduleCount}/{BOOSTER_MODULES.length} Active)
            </span>
          </div>
          <span className="font-mono text-[10px] font-semibold text-subtle">SYSTEM TUNING</span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {BOOSTER_MODULES.map((module, i) => {
            const Icon = module.icon
            const enabled = isModuleEnabled(module.id)

            return (
              <div
                key={module.id}
                onClick={() => toggleModule(module.id)}
                className={cn(
                  'group relative flex cursor-pointer flex-col justify-between overflow-hidden rounded-2xl border p-4 transition-all duration-200 shadow-sm',
                  enabled
                    ? 'border-accent/40 bg-accent/5 hover:border-accent hover:shadow-md hover:shadow-accent/5'
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
                      <div className="flex items-center gap-2">
                        <span className="truncate text-xs font-bold text-text">{module.label}</span>
                        {module.windowsOnly && (
                          <span className="rounded border border-border px-1.5 py-px font-mono text-[9px] font-bold text-subtle">
                            WIN
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-muted line-clamp-2">
                        {module.description}
                      </p>
                    </div>
                  </div>

                  <div
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    <Switch
                      checked={enabled}
                      onChange={() => toggleModule(module.id)}
                      ariaLabel={module.label}
                    />
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-border/40 pt-2.5">
                  <span className="font-mono text-[10px] text-subtle">
                    MODULE #{String(i + 1).padStart(2, '0')}
                  </span>
                  <span
                    className={cn(
                      'flex items-center gap-1.5 font-mono text-[10px] font-bold',
                      enabled ? 'text-accent' : 'text-subtle',
                    )}
                  >
                    <span
                      className={cn(
                        'size-1.5 rounded-full',
                        enabled ? 'bg-accent' : 'bg-subtle/50',
                      )}
                    />
                    <span>{enabled ? 'ARMED' : 'STANDBY'}</span>
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function TelemetryCard({
  icon: Icon,
  label,
  value,
  hint,
  accent,
}: {
  icon: typeof Radar
  label: string
  value: string
  hint: string
  accent: boolean
}) {
  return (
    <div
      className={cn(
        'relative flex items-center justify-between rounded-2xl border p-4 shadow-sm transition-all',
        accent ? 'border-accent/30 bg-surface/80' : 'border-border/80 bg-surface/60',
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'flex size-10 items-center justify-center rounded-xl shadow-xs',
            accent ? 'bg-accent/15 text-accent' : 'bg-surface-raised text-subtle',
          )}
        >
          <Icon className="size-4.5" />
        </span>
        <div>
          <div className="font-mono text-[9px] font-bold tracking-wider text-subtle uppercase">
            {label}
          </div>
          <div className="text-xs text-muted">{hint}</div>
        </div>
      </div>

      <div
        className={cn(
          'font-mono text-2xl font-black tracking-tight tabular-nums',
          accent ? 'text-accent' : 'text-text',
        )}
      >
        {value}
      </div>
    </div>
  )
}
