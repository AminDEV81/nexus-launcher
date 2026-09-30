import { useState } from 'react'
import { Cpu, Gamepad2, HardDrive, Info, Layers, Monitor, Volume2, Wifi, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SystemRequirementDetail, SystemRequirements } from '@/types/models'

interface HubSystemRequirementsProps {
  systemRequirements?: SystemRequirements | null
  gameTitle?: string
  className?: string
}

interface SpecItemProps {
  icon: typeof Cpu
  label: string
  value?: string | null
}

function SpecItem({ icon: Icon, label, value }: SpecItemProps) {
  if (!value) return null

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-border/70 bg-surface-raised/50 p-3.5 transition-colors hover:border-accent/40">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border bg-surface text-accent shadow-xs">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <span className="block text-[10px] font-bold uppercase tracking-wider text-subtle">
          {label}
        </span>
        <span className="mt-0.5 block text-xs font-semibold leading-snug text-text break-words">
          {value}
        </span>
      </div>
    </div>
  )
}

interface RequirementCardProps {
  type: 'minimum' | 'recommended'
  detail: SystemRequirementDetail
}

function RequirementCard({ type, detail }: RequirementCardProps) {
  const isRecommended = type === 'recommended'

  return (
    <div className="flex flex-col gap-4 rounded-3xl border border-border/80 bg-surface/80 p-5 shadow-xs transition-all hover:border-border">
      {/* Card Header */}
      <div className="flex items-center justify-between border-b border-border/60 pb-3">
        <div className="flex items-center gap-2">
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
            {isRecommended ? 'Optimal Experience' : 'Basic Playability'}
          </span>
        </div>
      </div>

      {/* Hardware Specs Grid */}
      <div className="grid gap-2.5 sm:grid-cols-2">
        <SpecItem icon={Monitor} label="Operating System" value={detail.os} />
        <SpecItem icon={Cpu} label="Processor (CPU)" value={detail.processor} />
        <SpecItem icon={Layers} label="Memory (RAM)" value={detail.memory} />
        <SpecItem icon={Gamepad2} label="Graphics (GPU)" value={detail.graphics} />
        <SpecItem icon={Zap} label="DirectX" value={detail.directx} />
        <SpecItem icon={HardDrive} label="Storage" value={detail.storage} />
        <SpecItem icon={Volume2} label="Sound Card" value={detail.sound_card} />
        <SpecItem icon={Wifi} label="Network" value={detail.network} />
      </div>

      {/* Additional Notes */}
      {detail.additional_notes && (
        <div className="mt-1 flex items-start gap-2.5 rounded-2xl border border-border/80 bg-surface-raised/40 p-3.5 text-xs text-muted">
          <Info className="mt-0.5 size-4 shrink-0 text-accent/80" />
          <div className="min-w-0 flex-1 leading-relaxed">
            <span className="font-bold text-text">Note: </span>
            <span className="whitespace-pre-line">{detail.additional_notes}</span>
          </div>
        </div>
      )}
    </div>
  )
}

export function HubSystemRequirements({
  systemRequirements,
  gameTitle,
  className,
}: HubSystemRequirementsProps) {
  const [activeTab, setActiveTab] = useState<'both' | 'minimum' | 'recommended'>('both')

  if (!systemRequirements) return null

  const { minimum, recommended } = systemRequirements
  const hasMin = Boolean(
    minimum &&
    (minimum.os ||
      minimum.processor ||
      minimum.memory ||
      minimum.graphics ||
      minimum.storage ||
      minimum.additional_notes),
  )
  const hasRec = Boolean(
    recommended &&
    (recommended.os ||
      recommended.processor ||
      recommended.memory ||
      recommended.graphics ||
      recommended.storage ||
      recommended.additional_notes),
  )

  if (!hasMin && !hasRec) return null

  const showBoth = hasMin && hasRec && activeTab === 'both'
  const showMinOnly = hasMin && (!hasRec || activeTab === 'minimum')
  const showRecOnly = hasRec && (!hasMin || activeTab === 'recommended')

  return (
    <section
      aria-label="System Requirements"
      className={cn(
        'flex flex-col gap-5 rounded-3xl border border-border bg-surface p-6 shadow-sm',
        className,
      )}
    >
      {/* Section Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex size-7 items-center justify-center rounded-xl border border-accent/30 bg-accent/10 text-accent">
            <Cpu className="size-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold tracking-tight text-text">System Requirements</h3>
            {gameTitle && (
              <p className="text-[11px] text-muted">Hardware specifications for {gameTitle}</p>
            )}
          </div>
        </div>

        {/* View Mode Toggle when both exist */}
        {hasMin && hasRec && (
          <div className="flex items-center rounded-xl border border-border bg-surface-raised p-1 text-[11px] font-bold">
            <button
              type="button"
              onClick={() => setActiveTab('both')}
              className={cn(
                'rounded-lg px-2.5 py-1 transition-all',
                activeTab === 'both'
                  ? 'bg-accent text-accent-foreground shadow-xs'
                  : 'text-subtle hover:text-text',
              )}
            >
              Side by Side
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('minimum')}
              className={cn(
                'rounded-lg px-2.5 py-1 transition-all',
                activeTab === 'minimum'
                  ? 'bg-accent text-accent-foreground shadow-xs'
                  : 'text-subtle hover:text-text',
              )}
            >
              Minimum
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('recommended')}
              className={cn(
                'rounded-lg px-2.5 py-1 transition-all',
                activeTab === 'recommended'
                  ? 'bg-accent text-accent-foreground shadow-xs'
                  : 'text-subtle hover:text-text',
              )}
            >
              Recommended
            </button>
          </div>
        )}
      </div>

      {/* Cards Display */}
      {showBoth && minimum && recommended && (
        <div className="grid gap-5 lg:grid-cols-2">
          <RequirementCard type="minimum" detail={minimum} />
          <RequirementCard type="recommended" detail={recommended} />
        </div>
      )}

      {showMinOnly && minimum && (
        <div className="w-full">
          <RequirementCard type="minimum" detail={minimum} />
        </div>
      )}

      {showRecOnly && recommended && (
        <div className="w-full">
          <RequirementCard type="recommended" detail={recommended} />
        </div>
      )}
    </section>
  )
}
