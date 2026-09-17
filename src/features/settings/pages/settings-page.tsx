import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Cpu,
  DatabaseBackup,
  KeyRound,
  MonitorCog,
  Music,
  Palette,
  Rocket,
  Settings2,
  Sparkles,
  ArrowUpCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAnimationSpeed } from '@/hooks/use-animation-speed'
import { useUpdaterStore } from '@/store/updater-store'
import { AppearancePanel } from '../components/appearance-panel'
import { PerformancePanel } from '../components/performance-panel'
import { ApiKeysPanel } from '../components/api-keys-panel'
import { BackupPanel } from '../components/backup-panel'
import { SystemSpecsPanel } from '../components/system-specs-panel'
import { SoundtrackSettingsPanel } from '../components/soundtrack-settings-panel'
import { BoosterPanel } from '@/features/booster/components/booster-panel'
import { UpdatesPanel } from '../components/updates-panel'

const SECTIONS = [
  {
    id: 'appearance',
    label: 'Appearance',
    description: 'Theme, palette and layout',
    icon: Palette,
  },
  {
    id: 'system_specs',
    label: 'System Specs',
    description: 'Hardware, CPU, GPU & storage',
    icon: Cpu,
  },
  {
    id: 'booster',
    label: 'Game Booster',
    description: 'Optimize your system before you play',
    icon: Rocket,
  },
  {
    id: 'performance',
    label: 'Performance',
    description: 'Motion and rendering',
    icon: MonitorCog,
  },
  {
    id: 'soundtrack',
    label: 'Soundtrack',
    description: 'Music providers, storage, and visualizer',
    icon: Music,
  },
  { id: 'metadata', label: 'Metadata', description: 'IGDB and artwork keys', icon: KeyRound },
  {
    id: 'backup',
    label: 'Backup',
    description: 'Save and restore your library',
    icon: DatabaseBackup,
  },
  {
    id: 'updates',
    label: 'Updates',
    description: 'App version and auto-updates',
    icon: ArrowUpCircle,
  },
] as const

export function SettingsPage() {
  const [activeSection, setActiveSection] = useState<(typeof SECTIONS)[number]['id']>('appearance')
  const speed = useAnimationSpeed()
  const updaterStatus = useUpdaterStore((s) => s.status)
  const active = SECTIONS.find((section) => section.id === activeSection) ?? SECTIONS[0]

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-bg">
      <header className="relative shrink-0 overflow-hidden border-b border-border px-8 pb-7 pt-7">
        <div
          className="pointer-events-none absolute -right-16 -top-24 size-72 rounded-full"
          style={{
            background:
              'radial-gradient(circle, color-mix(in srgb, var(--nx-accent) 10%, transparent) 0%, transparent 70%)',
          }}
        />
        <div className="relative flex items-end justify-between gap-6">
          <div>
            <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-accent">
              <Sparkles className="size-3.5" /> Nexus Control Center
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-text">Settings</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              Shape the way Nexus looks, feels, and connects to your game library.
            </p>
          </div>
          <div className="hidden items-center gap-2 rounded-full border border-border bg-surface/70 px-3 py-2 text-xs text-subtle sm:flex">
            <span className="size-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgb(52_211_153)]" />{' '}
            System ready
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-6 p-6 lg:flex-row lg:p-8">
        <nav className="flex shrink-0 gap-2 overflow-x-auto lg:w-64 lg:flex-col lg:gap-3">
          <div className="mb-1 hidden items-center gap-2 px-3 text-xs font-semibold uppercase tracking-[0.16em] text-subtle lg:flex">
            <Settings2 className="size-3.5" /> Preferences
          </div>
          {SECTIONS.map((section) => {
            const Icon = section.icon
            const isActive = section.id === activeSection
            const hasUpdate =
              section.id === 'updates' &&
              (updaterStatus === 'available' || updaterStatus === 'ready-to-install')
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => setActiveSection(section.id)}
                className={`group relative flex min-w-[190px] items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition-all lg:min-w-0 ${isActive ? 'border-accent/40 bg-accent/10 text-text shadow-[0_10px_30px_color-mix(in_srgb,var(--color-accent)_12%,transparent)]' : 'border-transparent text-muted hover:border-border hover:bg-surface-raised hover:text-text'}`}
              >
                <span
                  className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${isActive ? 'bg-accent text-white' : 'bg-surface-raised text-subtle group-hover:text-text'}`}
                >
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between text-sm font-semibold">
                    <span>{section.label}</span>
                    {hasUpdate && (
                      <span className="size-2 rounded-full bg-accent shadow-[0_0_8px_var(--nx-accent)] animate-pulse" />
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-subtle">
                    {section.description}
                  </span>
                </span>
                {isActive && (
                  <motion.span
                    layoutId="settings-active"
                    className="absolute bottom-3 right-3 size-1.5 rounded-full bg-accent"
                  />
                )}
              </button>
            )
          })}
          <div className="mt-auto hidden rounded-2xl border border-border bg-surface/60 p-4 lg:block">
            <div className="text-xs font-semibold text-text">Nexus Launcher</div>
            <div className="mt-1 text-xs text-subtle">Personal game library</div>
            <div className="mt-4 h-1 overflow-hidden rounded-full bg-surface-raised">
              <div className="h-full w-2/3 rounded-full bg-accent" />
            </div>
            <div className="mt-2 text-[11px] text-subtle">All systems operational</div>
          </div>
        </nav>

        <main
          className={cn(
            'min-h-0 min-w-0 flex-1 overflow-y-auto rounded-3xl border shadow-card',
            activeSection === 'booster'
              ? 'border-accent/20 bg-bg'
              : 'border-border bg-surface/45 p-6 lg:p-8',
          )}
        >
          {activeSection !== 'booster' && (
            <div className="mb-7 flex items-center gap-3 border-b border-border pb-5">
              <div className="flex size-10 items-center justify-center rounded-xl bg-accent/10 text-accent">
                <active.icon className="size-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-text">{active.label}</h2>
                <p className="text-sm text-muted">{active.description}</p>
              </div>
            </div>
          )}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={activeSection}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 * speed, ease: 'easeOut' }}
            >
              {activeSection === 'appearance' && <AppearancePanel />}
              {activeSection === 'system_specs' && <SystemSpecsPanel />}
              {activeSection === 'booster' && <BoosterPanel />}
              {activeSection === 'performance' && <PerformancePanel />}
              {activeSection === 'soundtrack' && <SoundtrackSettingsPanel />}
              {activeSection === 'metadata' && <ApiKeysPanel />}
              {activeSection === 'backup' && <BackupPanel />}
              {activeSection === 'updates' && <UpdatesPanel />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  )
}
