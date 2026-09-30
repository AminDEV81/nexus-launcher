import React from 'react'
import { Bell, BellRing, Thermometer } from 'lucide-react'
import { useOverlayStore } from '../store/overlay-store'
import type { NotificationKind, NotificationSettings, OverlayPosition } from '../types/overlay'

const POSITIONS: { id: OverlayPosition; label: string }[] = [
  { id: 'top-left', label: 'Top Left' },
  { id: 'top-center', label: 'Top Center' },
  { id: 'top-right', label: 'Top Right' },
  { id: 'bottom-left', label: 'Bottom Left' },
  { id: 'bottom-center', label: 'Bottom Center' },
  { id: 'bottom-right', label: 'Bottom Right' },
]

const TEST_KINDS: { kind: NotificationKind; label: string }[] = [
  { kind: 'info', label: 'Info' },
  { kind: 'success', label: 'Success' },
  { kind: 'warning', label: 'Warning' },
  { kind: 'error', label: 'Error' },
]

interface SwitchRowProps {
  title: string
  description: string
  checked: boolean
  onChange: (next: boolean) => void
}

const SwitchRow: React.FC<SwitchRowProps> = ({ title, description, checked, onChange }) => (
  <label className="flex cursor-pointer items-center justify-between gap-3">
    <div>
      <div className="text-xs font-medium text-text">{title}</div>
      <div className="text-[10px] text-muted">{description}</div>
    </div>
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="h-4 w-4 cursor-pointer rounded accent-cyan-500"
    />
  </label>
)

interface ThresholdProps {
  label: string
  value: number
  min: number
  max: number
  unit: string
  onChange: (value: number) => void
}

const Threshold: React.FC<ThresholdProps> = ({ label, value, min, max, unit, onChange }) => (
  <label className="flex items-center justify-between gap-2 text-xs">
    <span className="text-muted">{label}</span>
    <span className="flex items-center gap-1">
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value)
          if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)))
        }}
        className="w-16 rounded-md border border-border bg-surface-raised px-2 py-1 text-right font-mono text-xs text-text focus:border-cyan-500 focus:outline-none"
      />
      <span className="w-4 text-[10px] text-muted">{unit}</span>
    </span>
  </label>
)

export const NotificationSettingsPanel: React.FC = () => {
  const settings = useOverlayStore((s) => s.config.notifications)
  const isLiveWindowOpen = useOverlayStore((s) => s.isLiveWindowOpen)
  const update = useOverlayStore((s) => s.updateNotifications)
  const sendTest = useOverlayStore((s) => s.sendTestNotification)

  const set = <K extends keyof NotificationSettings>(key: K, value: NotificationSettings[K]) =>
    update({ [key]: value } as Partial<NotificationSettings>)

  return (
    <div className="space-y-4 border-t border-border pt-4">
      <div>
        <h2 className="flex items-center gap-2 text-base font-bold text-text">
          <Bell className="h-4 w-4 text-cyan-500 dark:text-cyan-400" />
          In-Game Notifications
        </h2>
        <p className="mt-0.5 text-xs text-muted">
          Download results, Gaming Mode and hardware warnings appear on top of your game. They show
          only while the overlay is visible.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* General */}
        <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
          <SwitchRow
            title="Show notifications"
            description="Master switch for all in-game notifications"
            checked={settings.enabled}
            onChange={(v) => set('enabled', v)}
          />
          <SwitchRow
            title="Mirror launcher toasts"
            description="Downloads, errors and Gaming Mode messages"
            checked={settings.mirror_app_toasts}
            onChange={(v) => set('mirror_app_toasts', v)}
          />
          <SwitchRow
            title="Hardware alerts"
            description="Warn about high temperatures, VRAM and low battery"
            checked={settings.alerts_enabled}
            onChange={(v) => set('alerts_enabled', v)}
          />

          <div>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-muted">On-screen time</span>
              <span className="font-mono font-bold text-cyan-600 dark:text-cyan-400">
                {(settings.duration_ms / 1000).toFixed(1)}s
              </span>
            </div>
            <input
              type="range"
              min="2000"
              max="12000"
              step="500"
              value={settings.duration_ms}
              onChange={(e) => set('duration_ms', parseInt(e.target.value, 10))}
              className="h-1.5 w-full cursor-pointer rounded-lg border border-border/60 bg-surface-raised accent-cyan-500"
            />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-muted">Max on screen</span>
              <span className="font-mono font-bold text-cyan-600 dark:text-cyan-400">
                {settings.max_visible}
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="6"
              step="1"
              value={settings.max_visible}
              onChange={(e) => set('max_visible', parseInt(e.target.value, 10))}
              className="h-1.5 w-full cursor-pointer rounded-lg border border-border/60 bg-surface-raised accent-cyan-500"
            />
          </div>
        </div>

        {/* Position */}
        <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
          <label className="block text-xs font-medium text-muted">Notification position</label>
          <div className="grid grid-cols-3 gap-1.5">
            {POSITIONS.map((pos) => {
              const active = settings.position === pos.id
              return (
                <button
                  key={pos.id}
                  onClick={() => set('position', pos.id)}
                  className={`rounded-lg border px-2 py-2 text-center text-[11px] font-medium transition-all ${
                    active
                      ? 'border-cyan-500/60 bg-cyan-500/15 font-bold text-cyan-600 shadow-sm dark:text-cyan-300'
                      : 'border-border bg-surface-raised text-muted hover:bg-surface hover:text-text'
                  }`}
                >
                  {pos.label}
                </button>
              )
            })}
          </div>

          <div className="border-t border-border pt-3">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted">
              <BellRing className="h-3.5 w-3.5" /> Send a test notification
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {TEST_KINDS.map((t) => (
                <button
                  key={t.kind}
                  onClick={() => void sendTest(t.kind)}
                  className="rounded-lg border border-border bg-surface-raised px-2 py-1.5 text-[11px] font-medium text-text transition-colors hover:border-cyan-500/60"
                >
                  {t.label}
                </button>
              ))}
            </div>
            {!isLiveWindowOpen && (
              <p className="mt-2 text-[10px] text-muted">
                The overlay will be opened automatically for the test.
              </p>
            )}
          </div>
        </div>

        {/* Alert thresholds */}
        <div
          className={`space-y-3 rounded-2xl border border-border bg-surface p-4 transition-opacity ${
            settings.alerts_enabled ? '' : 'pointer-events-none opacity-50'
          }`}
        >
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-text">
            <Thermometer className="h-3.5 w-3.5 text-cyan-500" /> Alert thresholds
          </div>
          <Threshold
            label="GPU temperature"
            value={settings.gpu_temp_warn_c}
            min={50}
            max={120}
            unit="°C"
            onChange={(v) => set('gpu_temp_warn_c', v)}
          />
          <Threshold
            label="GPU hotspot"
            value={settings.gpu_hotspot_warn_c}
            min={60}
            max={130}
            unit="°C"
            onChange={(v) => set('gpu_hotspot_warn_c', v)}
          />
          <Threshold
            label="CPU temperature"
            value={settings.cpu_temp_warn_c}
            min={50}
            max={120}
            unit="°C"
            onChange={(v) => set('cpu_temp_warn_c', v)}
          />
          <Threshold
            label="VRAM usage"
            value={settings.vram_warn_percent}
            min={50}
            max={100}
            unit="%"
            onChange={(v) => set('vram_warn_percent', v)}
          />
          <Threshold
            label="Low battery"
            value={settings.low_battery_percent}
            min={5}
            max={50}
            unit="%"
            onChange={(v) => set('low_battery_percent', v)}
          />
          <p className="text-[10px] leading-relaxed text-muted">
            An alert fires once when a reading stays above its limit, then re-arms after it cools
            down.
          </p>
        </div>
      </div>
    </div>
  )
}
