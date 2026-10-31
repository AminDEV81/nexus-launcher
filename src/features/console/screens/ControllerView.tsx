import React, { useCallback, useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import {
  Gamepad2,
  BatteryCharging,
  ShieldCheck,
  Vibrate,
  Palette,
  Sliders,
  RefreshCw,
  MousePointerClick,
  EyeOff,
  Zap,
  Usb,
  Bluetooth,
} from 'lucide-react'
import { toast } from 'sonner'
import { DualSenseSvgController } from '@/features/dualsense/components/dualsense-svg-controller'
import { XboxSvgController } from '@/features/dualsense/components/xbox-svg-controller'
import { useConsoleStore } from '../store/console-store'
import { CONSOLE_THEMES } from '../theme/tokens'
import { FocusScope, useFocusable } from '../nav/FocusScope'

interface DualSenseProfileConfig {
  lightbarR: number
  lightbarG: number
  lightbarB: number
  playerLedMask: number
  muteLedMode: number
  leftTriggerEffect: string
  leftTriggerStart: number
  leftTriggerForce: number
  rightTriggerEffect: string
  rightTriggerStart: number
  rightTriggerForce: number
  leftDeadzone: number
  rightDeadzone: number
  l2Deadzone: number
  r2Deadzone: number
  rumbleStrength: number
  testHeavyRumble: number
  testLightRumble: number
  touchpadMouseEnabled: boolean
  touchpadMouseSensitivity: number
  touchpadAsXboxBack: boolean
  hidePs5Controller: boolean
}

interface DualSenseRawInput {
  slotIndex: number
  connected: boolean
  connectionType: string
  deviceName: string
  batteryPercent: number
  batteryCharging: boolean
  cross: boolean
  circle: boolean
  square: boolean
  triangle: boolean
  l1: boolean
  r1: boolean
  l2Button: boolean
  r2Button: boolean
  create: boolean
  options: boolean
  l3: boolean
  r3: boolean
  ps: boolean
  touchpadClick: boolean
  mute: boolean
  dpadUp: boolean
  dpadDown: boolean
  dpadLeft: boolean
  dpadRight: boolean
  lx: number
  ly: number
  rx: number
  ry: number
  l2: number
  r2: number
  touch1Active: boolean
  touch1X: number
  touch1Y: number
}

interface Xbox360EmulatedState {
  slotIndex: number
  emulationActive: boolean
  vigemConnected: boolean
  xinputUserIndex: number
  ps5HiddenExclusive: boolean
  hidhideActive: boolean
  a: boolean
  b: boolean
  x: boolean
  y: boolean
  lb: boolean
  rb: boolean
  back: boolean
  start: boolean
  guide: boolean
  share: boolean
  ls: boolean
  rs: boolean
  dpadUp: boolean
  dpadDown: boolean
  dpadLeft: boolean
  dpadRight: boolean
  lt: number
  rt: number
  thumbLx: number
  thumbLy: number
  thumbRx: number
  thumbRy: number
}

interface DualSenseTelemetrySnapshot {
  activeSlot: number
  connectedCount: number
  emulatingCount: number
  slots: Array<{
    slotIndex: number
    dualsense: DualSenseRawInput
    xbox: Xbox360EmulatedState
    config: DualSenseProfileConfig
  }>
  dualsense: DualSenseRawInput
  xbox: Xbox360EmulatedState
  config: DualSenseProfileConfig
  driverStatus: {
    vigembusInstalled: boolean
    hidhideInstalled: boolean
    activeModeLabel: string
    statusMessage: string
  }
}

const TRIGGER_MODES = ['Off', 'Rigid', 'Pulse', 'Bow', 'AutomaticGun'] as const

const LIGHTBAR_PRESETS: Array<{ label: string; r: number; g: number; b: number; hex: string }> = [
  { label: 'PS5 Cobalt', r: 0, g: 72, b: 255, hex: '#3b82f6' },
  { label: 'Nexus Cyan', r: 0, g: 229, b: 255, hex: '#00e5ff' },
  { label: 'Royal Violet', r: 124, g: 92, b: 255, hex: '#7c5cff' },
  { label: 'Crimson Pulse', r: 255, g: 30, b: 80, hex: '#f43f5e' },
  { label: 'Emerald Green', r: 16, g: 220, b: 120, hex: '#10b981' },
  { label: 'Solar Gold', r: 255, g: 165, b: 0, hex: '#f59e0b' },
]

const ActionTileBtn: React.FC<{
  id: string
  title: string
  subtitle: string
  badge: string
  active?: boolean
  isLight: boolean
  icon: React.ReactNode
  onPress: () => void
}> = ({ id, title, subtitle, badge, active, isLight, icon, onPress }) => {
  const { focusProps, isFocused } = useFocusable<HTMLButtonElement>({
    id,
    scopeId: 'console_dualsense_scope',
    onConfirm: onPress,
  })
  return (
    <button
      type="button"
      {...focusProps}
      className={`flex items-center justify-between gap-4 rounded-3xl border p-5 text-left transition-all cursor-pointer ${
        isFocused
          ? 'scale-[1.02] border-cyan-300 bg-cyan-400 text-slate-950 shadow-xl'
          : active
            ? isLight
              ? 'border-indigo-500 bg-indigo-50 text-slate-900'
              : 'border-cyan-400/50 bg-cyan-500/15 text-white'
            : isLight
              ? 'border-slate-300 bg-white/90 text-slate-900'
              : 'border-white/12 bg-white/[0.04] text-white'
      }`}
    >
      <div className="flex items-center gap-4 min-w-0">
        <div
          className={`flex size-12 shrink-0 items-center justify-center rounded-2xl ${
            isFocused ? 'bg-slate-950 text-cyan-300' : 'bg-cyan-500/20 text-cyan-300'
          }`}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <p className="truncate text-base font-black">{title}</p>
          <p className={`truncate text-xs ${isFocused ? 'text-slate-800' : 'text-slate-400'}`}>
            {subtitle}
          </p>
        </div>
      </div>
      <span
        className={`shrink-0 rounded-xl px-3 py-1 text-xs font-black uppercase ${
          isFocused
            ? 'bg-slate-950 text-cyan-300'
            : active
              ? 'bg-emerald-400 text-slate-950'
              : 'bg-white/10 text-slate-300'
        }`}
      >
        {badge}
      </span>
    </button>
  )
}

export const ControllerView: React.FC = () => {
  const themeId = useConsoleStore((s) => s.theme)
  const isLight = Boolean(CONSOLE_THEMES[themeId]?.isLight)
  const controllerTestMode = useConsoleStore((s) => s.controllerTestMode)
  const setControllerTestMode = useConsoleStore((s) => s.setControllerTestMode)
  const setDetectedDevice = useConsoleStore((s) => s.setDetectedDevice)

  const [snapshot, setSnapshot] = useState<DualSenseTelemetrySnapshot | null>(null)
  const [activeSlot, setActiveSlot] = useState(0)

  const fetchState = useCallback(async () => {
    try {
      const res = await invoke<DualSenseTelemetrySnapshot>('dualsense_get_state')
      setSnapshot(res)
    } catch {
      // Ignore
    }
  }, [])

  useEffect(() => {
    void fetchState()
    const id = window.setInterval(fetchState, 120)
    return () => window.clearInterval(id)
  }, [fetchState])

  const currentSlot = snapshot?.slots?.[activeSlot]
  const ds = currentSlot?.dualsense ?? snapshot?.dualsense
  const xb = currentSlot?.xbox ?? snapshot?.xbox
  const cfg = currentSlot?.config ?? snapshot?.config
  const emulationActive = Boolean(xb?.emulationActive)

  const updateConfig = async (patch: Partial<DualSenseProfileConfig>) => {
    if (!cfg) return
    const nextCfg: DualSenseProfileConfig = { ...cfg, ...patch }
    try {
      const updated = await invoke<DualSenseTelemetrySnapshot>('dualsense_update_config', {
        config: nextCfg,
        slotIndex: activeSlot,
      })
      setSnapshot(updated)
    } catch {
      // Ignore
    }
  }

  const handleToggleEmulation = async () => {
    try {
      const updated = await invoke<DualSenseTelemetrySnapshot>('dualsense_set_xbox_emulation', {
        enabled: !emulationActive,
        slotIndex: activeSlot,
        allSlots: false,
      })
      setSnapshot(updated)
      const nowEmulating = (updated?.emulatingCount ?? 0) > 0
      setDetectedDevice(nowEmulating ? 'xbox' : 'playstation')
      window.dispatchEvent(new CustomEvent('nexus:dualsense-mode-changed'))
      toast.success(
        nowEmulating
          ? 'ViGEm Xbox 360 Mode Active — UI Icons Switched to Xbox!'
          : 'Native DualSense Mode Active — UI Icons Switched to PlayStation!',
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to toggle Xbox 360 emulation')
    }
  }

  const handleRumbleTest = async () => {
    try {
      await invoke('dualsense_trigger_rumble_test', {
        heavyMotor: 220,
        lightMotor: 255,
        durationMs: 650,
        slotIndex: activeSlot,
      })
      toast.success('DualSense Haptic Rumble Pulse Triggered!')
    } catch {
      // Ignore
    }
  }

  const handleRescan = async () => {
    try {
      const updated = await invoke<DualSenseTelemetrySnapshot>('dualsense_scan_devices')
      setSnapshot(updated)
      toast.success('Rescanned USB & Bluetooth HID controllers')
    } catch {
      // Ignore
    }
  }



  return (
    <FocusScope id="console_dualsense_scope" orientation="vertical" className="space-y-7 pb-20">
      {/* Header Banner */}
      <div
        className={`rounded-[2rem] border p-7 shadow-2xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 ${
          isLight
            ? 'border-slate-300 bg-white'
            : 'border-white/15 bg-gradient-to-r from-[#0e1938] via-[#0c1428] to-[#171132]'
        }`}
      >
        <div className="flex items-center gap-5">
          <div className="flex size-16 items-center justify-center rounded-3xl bg-cyan-400/20 border border-cyan-400/40 text-cyan-300 shadow-lg">
            <Gamepad2 className="size-9" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <span className="rounded-full bg-cyan-400/20 border border-cyan-400/40 px-3 py-0.5 text-xs font-extrabold uppercase text-cyan-300">
                DualSense Studio · Console Edition
              </span>
              {ds?.connected && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 border border-emerald-400/40 px-3 py-0.5 text-xs font-extrabold text-emerald-300">
                  {ds.connectionType === 'Bluetooth' ? (
                    <Bluetooth className="size-3.5" />
                  ) : (
                    <Usb className="size-3.5" />
                  )}
                  {ds.connectionType} · {ds.batteryPercent}%
                </span>
              )}
            </div>
            <h1
              className={`mt-1 text-3xl font-black tracking-tight ${
                isLight ? 'text-slate-900' : 'text-white'
              }`}
            >
              {ds?.connected ? ds.deviceName : 'DualSense & Xbox Controller Studio'}
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Configure Adaptive Triggers (L2/R2), RGB Lightbar, ViGEm Xbox 360 Emulation, and
              HidHide Stealth Cloaking
            </p>
          </div>
        </div>

        {/* Slot Switcher P1 - P4 */}
        <div className="flex items-center gap-2">
          {[0, 1, 2, 3].map((slotIdx) => {
            const slotConnected = snapshot?.slots?.[slotIdx]?.dualsense?.connected
            return (
              <SlotButton
                key={slotIdx}
                slotIdx={slotIdx}
                active={activeSlot === slotIdx}
                connected={Boolean(slotConnected)}
                onSelect={() => {
                  setActiveSlot(slotIdx)
                  void invoke('dualsense_select_slot', { slotIndex: slotIdx }).catch(() => {})
                }}
              />
            )
          })}
        </div>
      </div>

      {/* Live Dual Interactive Controller Visualizers (DualSense + Emulated Xbox 360) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div
          className={`lg:col-span-6 rounded-3xl border p-6 flex flex-col items-center justify-between ${
            isLight ? 'border-slate-300 bg-white/90' : 'border-white/15 bg-[#0c1222]/90'
          }`}
        >
          <div className="flex w-full items-center justify-between text-xs font-extrabold uppercase tracking-wider text-cyan-400">
            <span>Physical Sony DualSense Input</span>
            <span className="flex items-center gap-1 text-emerald-300">
              <BatteryCharging className="size-4" />
              {ds?.batteryPercent ?? 0}%
            </span>
          </div>
          <div className="my-2 w-full max-w-md">
            <DualSenseSvgController
              isActiveController={!emulationActive}
              isConnected={Boolean(ds?.connected)}
              state={{
                lightbarR: cfg?.lightbarR ?? 0,
                lightbarG: cfg?.lightbarG ?? 229,
                lightbarB: cfg?.lightbarB ?? 255,
                playerLedMask: cfg?.playerLedMask ?? 1,
                emulationActive,
                cross: Boolean(ds?.cross),
                circle: Boolean(ds?.circle),
                square: Boolean(ds?.square),
                triangle: Boolean(ds?.triangle),
                l1: Boolean(ds?.l1),
                r1: Boolean(ds?.r1),
                l2: ds?.l2 ?? 0,
                r2: ds?.r2 ?? 0,
                create: Boolean(ds?.create),
                options: Boolean(ds?.options),
                l3: Boolean(ds?.l3),
                r3: Boolean(ds?.r3),
                ps: Boolean(ds?.ps),
                touchpadClick: Boolean(ds?.touchpadClick),
                mute: Boolean(ds?.mute),
                dpadUp: Boolean(ds?.dpadUp),
                dpadDown: Boolean(ds?.dpadDown),
                dpadLeft: Boolean(ds?.dpadLeft),
                dpadRight: Boolean(ds?.dpadRight),
                lx: ds?.lx ?? 128,
                ly: ds?.ly ?? 128,
                rx: ds?.rx ?? 128,
                ry: ds?.ry ?? 128,
                touch1Active: Boolean(ds?.touch1Active),
                touch1X: ds?.touch1X ?? 960,
                touch1Y: ds?.touch1Y ?? 540,
              }}
            />
          </div>
        </div>

        <div
          className={`lg:col-span-6 rounded-3xl border p-6 flex flex-col items-center justify-between ${
            isLight ? 'border-slate-300 bg-white/90' : 'border-white/15 bg-[#0c1222]/90'
          }`}
        >
          <div className="flex w-full items-center justify-between text-xs font-extrabold uppercase tracking-wider text-emerald-400">
            <span>Virtual ViGEm Xbox 360 Target</span>
            <span>{emulationActive ? 'ACTIVE (XInput)' : 'STANDBY'}</span>
          </div>
          <div className="my-2 w-full max-w-md">
            <XboxSvgController
              isActiveController={emulationActive}
              isConnected={emulationActive}
              state={{
                share: Boolean(xb?.share),
                a: Boolean(xb?.a),
                b: Boolean(xb?.b),
                x: Boolean(xb?.x),
                y: Boolean(xb?.y),
                lb: Boolean(xb?.lb),
                rb: Boolean(xb?.rb),
                lt: xb?.lt ?? 0,
                rt: xb?.rt ?? 0,
                back: Boolean(xb?.back),
                start: Boolean(xb?.start),
                guide: Boolean(xb?.guide),
                ls: Boolean(xb?.ls),
                rs: Boolean(xb?.rs),
                dpadUp: Boolean(xb?.dpadUp),
                dpadDown: Boolean(xb?.dpadDown),
                dpadLeft: Boolean(xb?.dpadLeft),
                dpadRight: Boolean(xb?.dpadRight),
                thumbLx: xb?.thumbLx ?? 0,
                thumbLy: xb?.thumbLy ?? 0,
                thumbRx: xb?.thumbRx ?? 0,
                thumbRy: xb?.thumbRy ?? 0,
              }}
            />
          </div>
        </div>
      </div>

      {/* Requirement #6: Controller Input Test Mode Banner */}
      {controllerTestMode && (
        <div className="rounded-3xl border-2 border-amber-400 bg-amber-500/15 p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-[0_0_40px_rgba(251,191,36,0.25)]">
          <div className="flex items-center gap-3.5">
            <span className="size-3.5 rounded-full bg-amber-400 animate-ping shrink-0" />
            <div>
              <p className="text-base font-black text-white">
                Controller Input Test Mode Active (Menu Navigation Locked)
              </p>
              <p className="text-xs text-amber-200">
                Press any buttons, triggers, D-Pad, or thumbsticks to test live on the controller
                diagram above without moving between menus. Press ESC or click Exit Test Mode when
                finished.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setControllerTestMode(false)}
            className="shrink-0 rounded-2xl bg-amber-400 px-6 py-3 text-xs font-black uppercase text-slate-950 hover:bg-amber-300 cursor-pointer shadow-lg"
          >
            Exit Test Mode (ESC)
          </button>
        </div>
      )}

      {/* Console Action Grid for DualSense Features */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ActionTileBtn
          id="ds_test_mode_toggle"
          title="Controller Button Test Mode"
          subtitle="Lock menu navigation so you can freely test all buttons, triggers & sticks"
          badge={controllerTestMode ? 'Testing (ESC to Exit)' : 'Start Test'}
          active={controllerTestMode}
          isLight={isLight}
          icon={<Gamepad2 className="size-6" />}
          onPress={() => {
            const next = !controllerTestMode
            setControllerTestMode(next)
            toast.info(
              next
                ? 'Test Mode enabled! Menu navigation is locked — press ESC or click Exit Test Mode when done.'
                : 'Test Mode disabled.',
            )
          }}
        />
        <ActionTileBtn
          id="ds_toggle_emulation"
          title="ViGEm Xbox 360 Emulation"
          subtitle="Translate DualSense HID input into native XInput for all PC games"
          badge={emulationActive ? 'Active' : 'Off'}
          active={emulationActive}
          isLight={isLight}
          icon={<Zap className="size-6" />}
          onPress={() => {
            void handleToggleEmulation()
          }}
        />

        <ActionTileBtn
          id="ds_left_trigger"
          title="Left Adaptive Trigger (L2)"
          subtitle="Cycle physical resistance feedback mode for L2 trigger"
          badge={cfg?.leftTriggerEffect || 'Off'}
          active={Boolean(cfg?.leftTriggerEffect && cfg.leftTriggerEffect !== 'Off')}
          isLight={isLight}
          icon={<Sliders className="size-6" />}
          onPress={() => {
            const cur = (cfg?.leftTriggerEffect || 'Off') as (typeof TRIGGER_MODES)[number]
            const next = TRIGGER_MODES[(TRIGGER_MODES.indexOf(cur) + 1) % TRIGGER_MODES.length]
            void updateConfig({
              leftTriggerEffect: next,
              leftTriggerStart: 48,
              leftTriggerForce: 210,
            })
          }}
        />

        <ActionTileBtn
          id="ds_right_trigger"
          title="Right Adaptive Trigger (R2)"
          subtitle="Cycle physical resistance feedback mode for R2 trigger"
          badge={cfg?.rightTriggerEffect || 'Off'}
          active={Boolean(cfg?.rightTriggerEffect && cfg.rightTriggerEffect !== 'Off')}
          isLight={isLight}
          icon={<Sliders className="size-6" />}
          onPress={() => {
            const cur = (cfg?.rightTriggerEffect || 'Off') as (typeof TRIGGER_MODES)[number]
            const next = TRIGGER_MODES[(TRIGGER_MODES.indexOf(cur) + 1) % TRIGGER_MODES.length]
            void updateConfig({
              rightTriggerEffect: next,
              rightTriggerStart: 48,
              rightTriggerForce: 210,
            })
          }}
        />

        <ActionTileBtn
          id="ds_lightbar_preset"
          title="DualSense RGB Lightbar Color"
          subtitle="Cycle LED lightbar color palette on the physical controller"
          badge="Cycle Color"
          active
          isLight={isLight}
          icon={<Palette className="size-6" />}
          onPress={() => {
            const curIdx = LIGHTBAR_PRESETS.findIndex(
              (p) => p.r === cfg?.lightbarR && p.g === cfg?.lightbarG && p.b === cfg?.lightbarB,
            )
            const next = LIGHTBAR_PRESETS[(curIdx + 1) % LIGHTBAR_PRESETS.length]
            void updateConfig({
              lightbarR: next.r,
              lightbarG: next.g,
              lightbarB: next.b,
            })
            toast.success(`Lightbar set to ${next.label}`)
          }}
        />

        <ActionTileBtn
          id="ds_touchpad_mouse"
          title="Touchpad Desktop Mouse"
          subtitle="Use the DualSense capacitive touchpad as a precision cursor"
          badge={cfg?.touchpadMouseEnabled ? 'Enabled' : 'Disabled'}
          active={Boolean(cfg?.touchpadMouseEnabled)}
          isLight={isLight}
          icon={<MousePointerClick className="size-6" />}
          onPress={() => {
            void updateConfig({ touchpadMouseEnabled: !cfg?.touchpadMouseEnabled })
          }}
        />

        <ActionTileBtn
          id="ds_hidhide_cloak"
          title="HidHide Double-Input Cloaking"
          subtitle="Hide physical DualSense from games while Xbox 360 emulation is active"
          badge={cfg?.hidePs5Controller ? 'Cloaked' : 'Visible'}
          active={Boolean(cfg?.hidePs5Controller)}
          isLight={isLight}
          icon={<EyeOff className="size-6" />}
          onPress={() => {
            void updateConfig({ hidePs5Controller: !cfg?.hidePs5Controller })
          }}
        />

        <ActionTileBtn
          id="ds_rumble_test"
          title="Test DualSense Haptic Motors"
          subtitle="Send a dual-motor vibration wave to verify controller haptics"
          badge="Pulse"
          isLight={isLight}
          icon={<Vibrate className="size-6" />}
          onPress={() => {
            void handleRumbleTest()
          }}
        />

        <ActionTileBtn
          id="ds_rescan_btn"
          title="Rescan USB & Bluetooth Controllers"
          subtitle="Refresh connected DualSense & XInput slots"
          badge={`${snapshot?.connectedCount ?? 0} Connected`}
          isLight={isLight}
          icon={<RefreshCw className="size-6" />}
          onPress={() => {
            void handleRescan()
          }}
        />
      </div>

      {/* Driver Status Footer */}
      <div
        className={`flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-4 text-xs font-bold ${
          isLight ? 'border-slate-300 bg-white/80 text-slate-700' : 'border-white/10 bg-white/[0.03] text-slate-300'
        }`}
      >
        <span className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-emerald-400" />
          ViGEmBus Driver: {snapshot?.driverStatus?.vigembusInstalled ? 'Installed' : 'Not Installed'} ·
          HidHide Driver: {snapshot?.driverStatus?.hidhideInstalled ? 'Installed' : 'Optional'}
        </span>
        <span className="text-cyan-400">{snapshot?.driverStatus?.statusMessage || 'Ready'}</span>
      </div>
    </FocusScope>
  )
}

const SlotButton: React.FC<{
  slotIdx: number
  active: boolean
  connected: boolean
  onSelect: () => void
}> = ({ slotIdx, active, connected, onSelect }) => {
  const { focusProps, isFocused } = useFocusable<HTMLButtonElement>({
    id: `ds_slot_btn_${slotIdx}`,
    scopeId: 'console_dualsense_scope',
    onConfirm: onSelect,
  })
  return (
    <button
      type="button"
      {...focusProps}
      className={`rounded-2xl border px-4 py-2.5 text-xs font-extrabold transition-all cursor-pointer ${
        isFocused
          ? 'scale-105 border-cyan-300 bg-cyan-400 text-slate-950 shadow-lg'
          : active
            ? 'border-cyan-400 bg-cyan-500/20 text-cyan-300'
            : 'border-white/15 bg-white/5 text-slate-400'
      }`}
    >
      P{slotIdx + 1} {connected ? '●' : '○'}
    </button>
  )
}
