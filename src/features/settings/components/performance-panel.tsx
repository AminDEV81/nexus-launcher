import {
  Zap,
  ImageDown,
  Network,
  Gauge,
  Gamepad2,
  Trash2,
  Sparkles,
  Activity,
  Cpu,
  Check,
  EyeOff,
  Minimize2,
  AppWindow,
} from 'lucide-react'
import { useAppearanceSettingsStore } from '@/store/appearance-settings-store'
import { useSettings, useSetSetting } from '../hooks/use-settings'
import { Switch } from './appearance-panel'
import { cn } from '@/lib/utils'

const STREAM_OPTIONS = [
  { num: 6, label: '6x Light' },
  { num: 8, label: '8x Balanced' },
  { num: 12, label: '12x Fast' },
  { num: 24, label: '24x Turbo' },
  { num: 32, label: '32x Ultra' },
] as const

const SPEED_LIMITS = [
  { label: 'Unlimited (Full Pipe)', value: '0' },
  { label: '1 MB/s (Low)', value: '1048576' },
  { label: '2 MB/s', value: '2097152' },
  { label: '5 MB/s', value: '5242880' },
  { label: '10 MB/s (Comfort)', value: '10485760' },
  { label: '25 MB/s (High)', value: '26214400' },
  { label: '50 MB/s (Extreme)', value: '52428800' },
]

const LAUNCH_WINDOW_OPTIONS = [
  {
    id: 'hide',
    label: 'Hide to System Tray',
    description: 'Hides launcher window into tray while gaming. Restores upon game exit.',
    badge: 'Recommended',
    icon: EyeOff,
  },
  {
    id: 'minimize',
    label: 'Minimize to Taskbar',
    description: 'Minimizes window to taskbar during gameplay, restores when game closes.',
    badge: null,
    icon: Minimize2,
  },
  {
    id: 'keep',
    label: 'Keep Window Open',
    description: 'Keeps launcher open on desktop in the background while playing.',
    badge: null,
    icon: AppWindow,
  },
] as const

export function PerformancePanel() {
  const reduceMotion = useAppearanceSettingsStore((s) => s.reduceMotion)
  const setReduceMotion = useAppearanceSettingsStore((s) => s.setReduceMotion)
  const ambientBackground = useAppearanceSettingsStore((s) => s.ambientBackground)
  const setAmbientBackground = useAppearanceSettingsStore((s) => s.setAmbientBackground)
  const gpuEcoMode = useAppearanceSettingsStore((s) => s.gpuEcoMode)
  const setGpuEcoMode = useAppearanceSettingsStore((s) => s.setGpuEcoMode)
  const fpsLimit60 = useAppearanceSettingsStore((s) => s.fpsLimit60)
  const setFpsLimit60 = useAppearanceSettingsStore((s) => s.setFpsLimit60)
  const { data: settings } = useSettings()
  const setSetting = useSetSetting()

  const currentStreams = Number(settings?.download_streams ?? '8')
  const activeStreams = STREAM_OPTIONS.some((opt) => opt.num === currentStreams)
    ? currentStreams
    : 8

  const speedLimit = settings?.download_speed_limit || '0'
  const isGamingMode = settings?.download_gaming_mode !== 'false'
  const autoCleanup = settings?.download_auto_cleanup === 'true'
  const windowAction = settings?.game_launch_window_action || 'hide'

  return (
    <div className="flex flex-col gap-6">
      {/* Download Engine Turbo Suite */}
      <div className="flex flex-col gap-4 rounded-2xl border border-border/80 bg-surface/60 p-5 shadow-sm">
        <div className="flex items-center justify-between border-b border-border/60 pb-3">
          <div className="flex items-center gap-2">
            <Network className="size-4.5 text-accent" />
            <div>
              <span className="text-sm font-bold text-text">Parallel Download Engine</span>
              <span className="ml-2 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 font-mono text-[10px] font-bold text-accent">
                {activeStreams}x Streams
              </span>
            </div>
          </div>
          <span className="font-mono text-[10px] font-bold text-subtle">HTTP RANGE TURBO</span>
        </div>

        {/* Stream Buttons */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold text-muted">
            Simultaneous Network Range Streams:
          </span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {STREAM_OPTIONS.map((opt) => (
              <button
                key={opt.num}
                type="button"
                onClick={() =>
                  setSetting.mutate({ key: 'download_streams', value: String(opt.num) })
                }
                className={cn(
                  'flex items-center justify-center gap-1.5 rounded-xl border py-2.5 text-xs font-bold transition-all duration-200 shadow-xs',
                  activeStreams === opt.num
                    ? 'border-accent bg-accent text-white shadow-md shadow-accent/25'
                    : 'border-border/80 bg-surface text-muted hover:border-accent/40 hover:bg-surface-raised hover:text-text',
                )}
              >
                {activeStreams === opt.num && <Check className="size-3.5" strokeWidth={3} />}
                <span>{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-border/40" />

        {/* Bandwidth Throttle */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-xl bg-surface-raised text-accent shadow-xs">
              <Gauge className="size-4.5" />
            </span>
            <div>
              <div className="text-sm font-bold text-text">Global Bandwidth Throttle</div>
              <div className="text-xs text-subtle">
                Cap aggregate download network speed across all game downloads.
              </div>
            </div>
          </div>

          <select
            value={speedLimit}
            onChange={(e) =>
              setSetting.mutate({ key: 'download_speed_limit', value: e.target.value })
            }
            className="rounded-xl border border-border/80 bg-surface px-3 py-2 text-xs font-bold text-text shadow-xs focus:border-accent focus:outline-none"
          >
            {SPEED_LIMITS.map((opt) => (
              <option key={opt.value} value={opt.value} className="bg-surface text-text">
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="border-t border-border/40" />

        {/* Smart Gaming Mode Auto-Pause */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-xl bg-surface-raised text-accent shadow-xs">
              <Gamepad2 className="size-4.5" />
            </span>
            <div>
              <div className="text-sm font-bold text-text">Gaming Mode (Auto-Pause)</div>
              <div className="text-xs text-subtle">
                Automatically pauses active downloads when any game launches to prioritize ping.
              </div>
            </div>
          </div>

          <Switch
            checked={isGamingMode}
            onChange={(checked) =>
              setSetting.mutate({ key: 'download_gaming_mode', value: String(checked) })
            }
            ariaLabel="Gaming Mode Auto-Pause"
          />
        </div>

        <div className="border-t border-border/40" />

        {/* Auto Cleanup Archive Post-Extraction */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-xl bg-surface-raised text-amber-500 shadow-xs">
              <Trash2 className="size-4.5" />
            </span>
            <div>
              <div className="text-sm font-bold text-text">Auto-Delete Archives</div>
              <div className="text-xs text-subtle">
                Removes downloaded .zip &amp; .rar archives automatically once extracted to save
                storage.
              </div>
            </div>
          </div>

          <Switch
            checked={autoCleanup}
            onChange={(checked) =>
              setSetting.mutate({ key: 'download_auto_cleanup', value: String(checked) })
            }
            ariaLabel="Auto-Delete Archives"
          />
        </div>
      </div>

      {/* Game Launch Window Behavior */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border/80 bg-surface/60 p-5 shadow-sm">
        <div className="flex items-center justify-between border-b border-border/60 pb-3">
          <div className="flex items-center gap-2">
            <Gamepad2 className="size-4.5 text-accent" />
            <div>
              <span className="text-sm font-bold text-text">On Game Launch Window Behavior</span>
              <span className="ml-2 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 font-mono text-[10px] font-bold text-accent">
                Gameplay Mode
              </span>
            </div>
          </div>
          <span className="font-mono text-[10px] font-bold text-subtle">PROCESS MANAGEMENT</span>
        </div>

        <p className="text-xs text-muted">
          Choose what Nexus Launcher does when a game starts up to optimize background resource
          usage:
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {LAUNCH_WINDOW_OPTIONS.map((opt) => {
            const Icon = opt.icon
            const isSelected = windowAction === opt.id
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() =>
                  setSetting.mutate({ key: 'game_launch_window_action', value: opt.id })
                }
                className={cn(
                  'flex flex-col items-start gap-2 rounded-xl border p-3.5 text-left transition-all duration-200 shadow-xs relative cursor-pointer',
                  isSelected
                    ? 'border-accent bg-accent/15 shadow-md shadow-accent/10'
                    : 'border-border/80 bg-surface/70 hover:border-accent/40 hover:bg-surface-raised',
                )}
              >
                <div className="flex w-full items-center justify-between">
                  <span
                    className={cn(
                      'flex size-8 items-center justify-center rounded-lg transition-colors',
                      isSelected ? 'bg-accent text-white' : 'bg-surface-raised text-muted',
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  {opt.badge && (
                    <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 font-mono text-[9px] font-bold text-emerald-400">
                      {opt.badge}
                    </span>
                  )}
                  {isSelected && !opt.badge && (
                    <span className="flex size-5 items-center justify-center rounded-full bg-accent text-white">
                      <Check className="size-3" strokeWidth={3} />
                    </span>
                  )}
                </div>
                <div>
                  <div
                    className={cn('text-xs font-bold', isSelected ? 'text-accent' : 'text-text')}
                  >
                    {opt.label}
                  </div>
                  <div className="mt-1 text-[11px] leading-snug text-subtle">{opt.description}</div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Display & Motion Tuning */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {/* GPU Power Saver (Eco Mode) */}
        <div
          className={cn(
            'flex items-center justify-between rounded-2xl border p-4 shadow-sm transition-all',
            gpuEcoMode
              ? 'border-emerald-500/50 bg-emerald-500/10'
              : 'border-border/80 bg-surface/70 hover:bg-surface-raised',
          )}
        >
          <div className="flex items-center gap-3">
            <span
              className={cn(
                'flex size-10 items-center justify-center rounded-xl shadow-xs transition-colors',
                gpuEcoMode ? 'bg-emerald-500 text-white' : 'bg-surface-raised text-emerald-400',
              )}
            >
              <Zap className="size-4.5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-text">GPU Eco Mode</span>
                {gpuEcoMode && (
                  <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 font-mono text-[9px] font-bold text-emerald-400">
                    &lt;1%
                  </span>
                )}
              </div>
              <div className="text-xs text-subtle">Disables blurs &amp; heavy shaders</div>
            </div>
          </div>
          <Switch checked={gpuEcoMode} onChange={setGpuEcoMode} ariaLabel="GPU Eco Mode" />
        </div>

        {/* 60 FPS Frame Rate Lock */}
        <div
          className={cn(
            'flex items-center justify-between rounded-2xl border p-4 shadow-sm transition-all',
            fpsLimit60
              ? 'border-accent/40 bg-accent/10'
              : 'border-border/80 bg-surface/70 hover:bg-surface-raised',
          )}
        >
          <div className="flex items-center gap-3">
            <span
              className={cn(
                'flex size-10 items-center justify-center rounded-xl shadow-xs transition-colors',
                fpsLimit60 ? 'bg-accent text-white' : 'bg-surface-raised text-accent',
              )}
            >
              <Gauge className="size-4.5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-text">Lock 60 FPS</span>
                <span className="rounded-full bg-accent/20 px-1.5 py-0.5 font-mono text-[9px] font-bold text-accent">
                  {fpsLimit60 ? '60 Hz' : 'Native'}
                </span>
              </div>
              <div className="text-xs text-subtle">Caps frame rate to save GPU power</div>
            </div>
          </div>
          <Switch checked={fpsLimit60} onChange={setFpsLimit60} ariaLabel="Lock 60 FPS" />
        </div>

        {/* Ambient Background Effects */}
        <div className="flex items-center justify-between rounded-2xl border border-border/80 bg-surface/70 p-4 shadow-sm transition-all hover:bg-surface-raised">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-surface-raised text-accent shadow-xs">
              <Sparkles className="size-4.5" />
            </span>
            <div>
              <div className="text-sm font-bold text-text">Ambient Glow</div>
              <div className="text-xs text-subtle">Dynamic cover gradients</div>
            </div>
          </div>
          <Switch
            checked={ambientBackground}
            onChange={setAmbientBackground}
            ariaLabel="Ambient Glow"
          />
        </div>

        {/* Reduce Motion */}
        <div className="flex items-center justify-between rounded-2xl border border-border/80 bg-surface/70 p-4 shadow-sm transition-all hover:bg-surface-raised">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-surface-raised text-subtle shadow-xs">
              <Activity className="size-4.5" />
            </span>
            <div>
              <div className="text-sm font-bold text-text">Reduce Motion</div>
              <div className="text-xs text-subtle">Instantly disables animations</div>
            </div>
          </div>
          <Switch checked={reduceMotion} onChange={setReduceMotion} ariaLabel="Reduce Motion" />
        </div>
      </div>

      {/* Hardware & Compositor Architecture Diagnostics */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border/80 bg-surface/50 p-4 shadow-sm">
        <div className="flex items-center gap-2 px-1">
          <Cpu className="size-4 text-accent" />
          <span className="text-xs font-bold text-subtle uppercase tracking-wider">
            Engine Compositor Architecture
          </span>
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-surface-raised/50 p-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
              <Zap className="size-4" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-text">GPU Hardware Compositing</span>
                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-mono text-[9px] font-bold text-emerald-400">
                  Active
                </span>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-muted">
                Visual passes render on the GPU compositor and sleep automatically when unfocused.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-surface-raised/50 p-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
              <ImageDown className="size-4" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-text">Lazy Virtualized Assets</span>
                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-mono text-[9px] font-bold text-emerald-400">
                  Active
                </span>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-muted">
                Game banners, covers, and Live video covers stream into memory only while in
                viewport.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
