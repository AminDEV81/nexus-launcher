import { useState } from 'react'
import {
  Gamepad2,
  Sliders,
  Vibrate,
  RotateCcw,
  AlertCircle,
  Sparkles,
  ArrowUpDown,
  Compass,
  Layers,
  HelpCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useGamepad } from '../hooks/use-gamepad'
import { ControllerCard } from './controller-card'
import { ControllerVisualizer } from './controller-visualizer'

export function GamepadSettingsPanel() {
  const {
    settings,
    updateSettings,
    resetSettings,
    controllers,
    primaryController,
    lastActiveController,
  } = useGamepad()

  const [selectedVisualizerIndex, setSelectedVisualizerIndex] = useState<number | null>(null)

  const activeVisualizerController =
    controllers.find((c) => c.index === selectedVisualizerIndex) ??
    primaryController ??
    controllers[0] ??
    null

  return (
    <div className="flex flex-col gap-8">
      {/* Master Enable/Disable Switch */}
      <div className="flex items-center justify-between rounded-2xl border border-border/80 bg-surface/70 p-5 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <Gamepad2 className="size-5" />
          </div>
          <div>
            <div className="text-sm font-bold text-text">Enable Gamepad Subsystem</div>
            <div className="text-xs text-subtle">
              Detects connected gamepads, tracks input activity, and routes vibration
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => updateSettings({ enabled: !settings.enabled })}
          className={cn(
            'relative h-7 w-12 rounded-full transition-colors duration-200 focus:outline-none',
            settings.enabled ? 'bg-accent' : 'bg-surface-raised border border-border',
          )}
        >
          <span
            className={cn(
              'block size-5 rounded-full bg-white shadow-md transition-transform duration-200',
              settings.enabled ? 'translate-x-6' : 'translate-x-1',
            )}
          />
        </button>
      </div>

      {/* Connected Controllers Section */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Compass className="size-4 text-accent" />
            <span className="text-sm font-bold tracking-tight text-text">
              Connected Controllers ({controllers.length})
            </span>
          </div>

          {controllers.length > 1 && (
            <span className="text-xs text-subtle">
              {controllers.length} controllers detected simultaneously
            </span>
          )}
        </div>

        {controllers.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 bg-surface/40 p-8 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-surface-raised text-muted">
              <Gamepad2 className="size-6" />
            </div>
            <h4 className="mt-3 text-sm font-semibold text-text">No Controllers Connected</h4>
            <p className="mt-1 max-w-sm text-xs text-subtle">
              Connect an Xbox, PlayStation DualSense / DualShock 4, or Generic USB / Bluetooth
              gamepad. Nexus detects hot-plugged devices automatically without restarting.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {controllers.map((ctrl) => (
              <div key={ctrl.id} className="flex flex-col gap-2">
                <ControllerCard
                  controller={ctrl}
                  isPrimary={ctrl.id === primaryController?.id}
                  isLastActive={ctrl.id === lastActiveController?.id}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Live Controller Tester */}
      {activeVisualizerController && settings.enabled && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-accent" />
              <span className="text-sm font-bold tracking-tight text-text">Hardware Tester</span>
            </div>

            {controllers.length > 1 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-subtle">Testing:</span>
                <select
                  value={activeVisualizerController.index}
                  onChange={(e) => setSelectedVisualizerIndex(Number(e.target.value))}
                  className="rounded-xl border border-border bg-surface px-2.5 py-1 text-xs text-text focus:border-accent focus:outline-none"
                >
                  {controllers.map((c) => (
                    <option key={c.index} value={c.index}>
                      Port #{c.index}: {c.displayName}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <ControllerVisualizer controller={activeVisualizerController} />
        </div>
      )}

      {/* Calibration & Deadzones */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Sliders className="size-4 text-accent" />
          <span className="text-sm font-bold tracking-tight text-text">
            Deadzones & Calibration
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Left Stick Radial Deadzone */}
          <div className="flex flex-col justify-between rounded-2xl border border-border/80 bg-surface/60 p-4">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-text">Left Stick Deadzone</span>
                <span className="font-mono text-xs font-bold text-accent">
                  {Math.round(settings.leftStickDeadzone * 100)}%
                </span>
              </div>
              <p className="mt-1 text-xs text-subtle">
                Radial zone around the center to counteract drift and sensor jitter.
              </p>
            </div>
            <input
              type="range"
              min="0"
              max="0.4"
              step="0.01"
              value={settings.leftStickDeadzone}
              onChange={(e) => updateSettings({ leftStickDeadzone: parseFloat(e.target.value) })}
              className="mt-4 accent-accent"
            />
          </div>

          {/* Right Stick Radial Deadzone */}
          <div className="flex flex-col justify-between rounded-2xl border border-border/80 bg-surface/60 p-4">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-text">Right Stick Deadzone</span>
                <span className="font-mono text-xs font-bold text-accent">
                  {Math.round(settings.rightStickDeadzone * 100)}%
                </span>
              </div>
              <p className="mt-1 text-xs text-subtle">
                Radial zone around the center for camera / aim stick stability.
              </p>
            </div>
            <input
              type="range"
              min="0"
              max="0.4"
              step="0.01"
              value={settings.rightStickDeadzone}
              onChange={(e) => updateSettings({ rightStickDeadzone: parseFloat(e.target.value) })}
              className="mt-4 accent-accent"
            />
          </div>

          {/* Trigger Deadzone */}
          <div className="flex flex-col justify-between rounded-2xl border border-border/80 bg-surface/60 p-4">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-text">Trigger Deadzone</span>
                <span className="font-mono text-xs font-bold text-accent">
                  {Math.round(settings.triggerDeadzone * 100)}%
                </span>
              </div>
              <p className="mt-1 text-xs text-subtle">
                Initial travel required before LT / RT register analog displacement.
              </p>
            </div>
            <input
              type="range"
              min="0"
              max="0.3"
              step="0.01"
              value={settings.triggerDeadzone}
              onChange={(e) => updateSettings({ triggerDeadzone: parseFloat(e.target.value) })}
              className="mt-4 accent-accent"
            />
          </div>

          {/* Trigger Threshold */}
          <div className="flex flex-col justify-between rounded-2xl border border-border/80 bg-surface/60 p-4">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-text">Trigger Button Threshold</span>
                <span className="font-mono text-xs font-bold text-accent">
                  {Math.round(settings.triggerThreshold * 100)}%
                </span>
              </div>
              <p className="mt-1 text-xs text-subtle">
                Pull depth required to trigger digital button actions.
              </p>
            </div>
            <input
              type="range"
              min="0.1"
              max="0.9"
              step="0.05"
              value={settings.triggerThreshold}
              onChange={(e) => updateSettings({ triggerThreshold: parseFloat(e.target.value) })}
              className="mt-4 accent-accent"
            />
          </div>
        </div>
      </div>

      {/* Rumble & Inversion Settings */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Rumble Toggle */}
        <div className="flex items-center justify-between rounded-2xl border border-border/80 bg-surface/60 p-4">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-xl bg-surface-raised text-accent">
              <Vibrate className="size-4.5" />
            </span>
            <div>
              <div className="text-sm font-semibold text-text">Controller Vibration</div>
              <div className="text-xs text-subtle">Dual-motor haptic feedback where supported</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => updateSettings({ rumbleEnabled: !settings.rumbleEnabled })}
            className={cn(
              'relative h-6 w-11 rounded-full transition-colors duration-200 focus:outline-none',
              settings.rumbleEnabled ? 'bg-accent' : 'bg-surface-raised border border-border',
            )}
          >
            <span
              className={cn(
                'block size-4 rounded-full bg-white shadow-md transition-transform duration-200',
                settings.rumbleEnabled ? 'translate-x-6' : 'translate-x-1',
              )}
            />
          </button>
        </div>

        {/* Invert Left Y */}
        <div className="flex items-center justify-between rounded-2xl border border-border/80 bg-surface/60 p-4">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-xl bg-surface-raised text-subtle">
              <ArrowUpDown className="size-4.5" />
            </span>
            <div>
              <div className="text-sm font-semibold text-text">Invert Left Stick Y-Axis</div>
              <div className="text-xs text-subtle">Reverses up/down on left stick</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => updateSettings({ invertLeftY: !settings.invertLeftY })}
            className={cn(
              'relative h-6 w-11 rounded-full transition-colors duration-200 focus:outline-none',
              settings.invertLeftY ? 'bg-accent' : 'bg-surface-raised border border-border',
            )}
          >
            <span
              className={cn(
                'block size-4 rounded-full bg-white shadow-md transition-transform duration-200',
                settings.invertLeftY ? 'translate-x-6' : 'translate-x-1',
              )}
            />
          </button>
        </div>

        {/* Invert Right Y */}
        <div className="flex items-center justify-between rounded-2xl border border-border/80 bg-surface/60 p-4">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-xl bg-surface-raised text-subtle">
              <ArrowUpDown className="size-4.5" />
            </span>
            <div>
              <div className="text-sm font-semibold text-text">Invert Right Stick Y-Axis</div>
              <div className="text-xs text-subtle">
                Reverses up/down on right stick (flight/camera)
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => updateSettings({ invertRightY: !settings.invertRightY })}
            className={cn(
              'relative h-6 w-11 rounded-full transition-colors duration-200 focus:outline-none',
              settings.invertRightY ? 'bg-accent' : 'bg-surface-raised border border-border',
            )}
          >
            <span
              className={cn(
                'block size-4 rounded-full bg-white shadow-md transition-transform duration-200',
                settings.invertRightY ? 'translate-x-6' : 'translate-x-1',
              )}
            />
          </button>
        </div>

        {/* Button Glyph Style Preference */}
        <div className="flex items-center justify-between rounded-2xl border border-border/80 bg-surface/60 p-4">
          <div>
            <div className="text-sm font-semibold text-text">Button Icons Style</div>
            <div className="text-xs text-subtle">Visual hints in future launcher prompts</div>
          </div>
          <div className="flex gap-1.5">
            {(['auto', 'xbox', 'playstation'] as const).map((pref) => (
              <button
                key={pref}
                type="button"
                onClick={() => updateSettings({ glyphPreference: pref })}
                className={cn(
                  'rounded-lg border px-2.5 py-1 text-xs font-medium capitalize transition-colors',
                  settings.glyphPreference === pref
                    ? 'border-accent bg-accent/15 text-accent'
                    : 'border-border bg-surface text-subtle hover:text-text',
                )}
              >
                {pref}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* UI Navigation & Controller HUD Section */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Layers className="size-4 text-accent" />
          <span className="text-sm font-bold tracking-tight text-text">
            Launcher Navigation & Shortcuts
          </span>
        </div>

        {/* Enable Navigation */}
        <div className="flex items-center justify-between rounded-2xl border border-border/80 bg-surface/60 p-4">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-xl bg-surface-raised text-subtle">
              <Compass className="size-4.5" />
            </span>
            <div>
              <div className="text-sm font-semibold text-text">Gamepad UI Navigation</div>
              <div className="text-xs text-subtle">
                Navigate menus, library games, and modals with D-Pad, Left Stick, and buttons
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => updateSettings({ navigationEnabled: !settings.navigationEnabled })}
            className={cn(
              'relative h-6 w-11 rounded-full transition-colors duration-200 focus:outline-none',
              settings.navigationEnabled ? 'bg-accent' : 'bg-surface-raised border border-border',
            )}
          >
            <span
              className={cn(
                'block size-4 rounded-full bg-white shadow-md transition-transform duration-200',
                settings.navigationEnabled ? 'translate-x-6' : 'translate-x-1',
              )}
            />
          </button>
        </div>

        {/* Show HUD */}
        <div className="flex items-center justify-between rounded-2xl border border-border/80 bg-surface/60 p-4">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-xl bg-surface-raised text-subtle">
              <HelpCircle className="size-4.5" />
            </span>
            <div>
              <div className="text-sm font-semibold text-text">
                Show Controller Action Guide (HUD)
              </div>
              <div className="text-xs text-subtle">
                Displays contextual button prompts at the bottom of the window
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => updateSettings({ showNavigationHud: !settings.showNavigationHud })}
            className={cn(
              'relative h-6 w-11 rounded-full transition-colors duration-200 focus:outline-none',
              settings.showNavigationHud ? 'bg-accent' : 'bg-surface-raised border border-border',
            )}
          >
            <span
              className={cn(
                'block size-4 rounded-full bg-white shadow-md transition-transform duration-200',
                settings.showNavigationHud ? 'translate-x-6' : 'translate-x-1',
              )}
            />
          </button>
        </div>
      </div>

      {/* Footer / Reset Button */}
      <div className="flex items-center justify-between border-t border-border/50 pt-5">
        <div className="flex items-center gap-2 text-xs text-subtle">
          <AlertCircle className="size-3.5" />
          Settings are saved automatically.
        </div>

        <button
          type="button"
          onClick={resetSettings}
          className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-border hover:bg-surface-raised hover:text-text"
        >
          <RotateCcw className="size-3.5" /> Reset to Defaults
        </button>
      </div>
    </div>
  )
}
