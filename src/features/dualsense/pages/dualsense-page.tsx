import React, { useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import {
  Activity,
  ArrowRightLeft,
  BatteryCharging,
  Bluetooth,
  CheckCircle2,
  EyeOff,
  Gamepad2,
  MousePointerClick,
  Palette,
  Play,
  RefreshCw,
  ShieldCheck,
  Sliders,
  Sparkles,
  Square,
  Terminal,
  Unplug,
  Usb,
  Users,
  Vibrate,
  Zap,
} from 'lucide-react'
import { DualSenseSvgController } from '../components/dualsense-svg-controller'
import { XboxSvgController } from '../components/xbox-svg-controller'

interface DualSenseRawInput {
  slotIndex: number
  connected: boolean
  connectionType: string
  deviceName: string
  devicePath: string
  instanceId: string
  macAddress: string
  vendorId: number
  productId: number
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
  fnL: boolean
  fnR: boolean
  blp: boolean
  brp: boolean
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
  gyroPitch: number
  gyroYaw: number
  gyroRoll: number
  accelX: number
  accelY: number
  accelZ: number
  touch1Active: boolean
  touch1Id: number
  touch1X: number
  touch1Y: number
  touch2Active: boolean
  touch2Id: number
  touch2X: number
  touch2Y: number
  mouseLeftClick: boolean
  mouseRightClick: boolean
  frameCounter: number
  inputLatencyUs: number
}

interface Xbox360EmulatedState {
  slotIndex: number
  emulationActive: boolean
  vigemConnected: boolean
  xinputUserIndex: number
  ps5HiddenExclusive: boolean
  hidhideActive: boolean
  wButtons: number
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
  largeMotorRumble: number
  smallMotorRumble: number
  packetsSent: number
}

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

interface DriverStatusInfo {
  vigembusInstalled: boolean
  hidhideInstalled: boolean
  exclusiveAccessGranted: boolean
  activeModeLabel: string
  statusMessage: string
  logs: string[]
}

interface ControllerSlotSnapshot {
  slotIndex: number
  dualsense: DualSenseRawInput
  xbox: Xbox360EmulatedState
  config: DualSenseProfileConfig
}

interface DualSenseTelemetrySnapshot {
  activeSlot: number
  connectedCount: number
  emulatingCount: number
  slots: ControllerSlotSnapshot[]
  dualsense: DualSenseRawInput
  xbox: Xbox360EmulatedState
  config: DualSenseProfileConfig
  driverStatus: DriverStatusInfo
}

interface VirtualControllerOverride {
  slotIndex: number
  active: boolean
  webGamepadConnected: boolean
  cross: boolean
  circle: boolean
  square: boolean
  triangle: boolean
  l1: boolean
  r1: boolean
  l2: number
  r2: number
  create: boolean
  options: boolean
  l3: boolean
  r3: boolean
  ps: boolean
  touchpadClick: boolean
  touch1Active: boolean
  touch1X: number
  touch1Y: number
  mute: boolean
  dpadUp: boolean
  dpadDown: boolean
  dpadLeft: boolean
  dpadRight: boolean
  lx: number
  ly: number
  rx: number
  ry: number
}

function makeDefaultOverride(slotIndex: number): VirtualControllerOverride {
  return {
    slotIndex,
    active: false,
    webGamepadConnected: false,
    cross: false,
    circle: false,
    square: false,
    triangle: false,
    l1: false,
    r1: false,
    l2: 0,
    r2: 0,
    create: false,
    options: false,
    l3: false,
    r3: false,
    ps: false,
    touchpadClick: false,
    touch1Active: false,
    touch1X: 960,
    touch1Y: 540,
    mute: false,
    dpadUp: false,
    dpadDown: false,
    dpadLeft: false,
    dpadRight: false,
    lx: 128,
    ly: 128,
    rx: 128,
    ry: 128,
  }
}

function hasAnyManualOverrideInput(ov: VirtualControllerOverride): boolean {
  return (
    ov.cross ||
    ov.circle ||
    ov.square ||
    ov.triangle ||
    ov.l1 ||
    ov.r1 ||
    ov.l2 > 0 ||
    ov.r2 > 0 ||
    ov.create ||
    ov.options ||
    ov.l3 ||
    ov.r3 ||
    ov.ps ||
    ov.touchpadClick ||
    ov.touch1Active ||
    ov.mute ||
    ov.dpadUp ||
    ov.dpadDown ||
    ov.dpadLeft ||
    ov.dpadRight ||
    Math.abs(ov.lx - 128) > 2 ||
    Math.abs(ov.ly - 128) > 2 ||
    Math.abs(ov.rx - 128) > 2 ||
    Math.abs(ov.ry - 128) > 2
  )
}

/**
 * Strictly filters browser `navigator.getGamepads()` entries to genuine Sony DualSense / DualShock
 * controllers and explicitly rejects Virtual Xbox 360 / XInput / ViGEmBus controllers (`VID_045E&PID_028E`).
 * This prevents Virtual Xbox 360 controllers spawned by "Activate All" from being mistaken for
 * additional physical DualSense controllers in Slots 3 & 4!
 */
function isSonyDualSenseGamepad(pad: Gamepad | null | undefined): pad is Gamepad {
  if (!pad || !pad.connected) return false
  const id = (pad.id || '').toLowerCase()
  if (
    id.includes('xbox') ||
    id.includes('xinput') ||
    id.includes('045e') ||
    id.includes('028e') ||
    id.includes('vigem') ||
    id.includes('microsoft') ||
    id.includes('virtual')
  ) {
    return false
  }
  return (
    id.includes('054c') ||
    id.includes('dualsense') ||
    id.includes('dualshock') ||
    id.includes('wireless controller') ||
    id.includes('playstation') ||
    id.includes('sony')
  )
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase()
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.trim().replace(/^#/, '')
  if (!/^[0-9A-Fa-f]{6}$/.test(clean)) return null
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  }
}

export function DualSensePage() {
  const [snapshot, setSnapshot] = useState<DualSenseTelemetrySnapshot | null>(null)
  const [activeSlot, setActiveSlot] = useState<number>(0)
  const [isToggling, setIsToggling] = useState(false)
  const [autoCircleTest, setAutoCircleTest] = useState(false)
  const [hexDraft, setHexDraft] = useState<string>('#0070FF')

  const snapshotRef = useRef<DualSenseTelemetrySnapshot | null>(null)
  snapshotRef.current = snapshot

  const overridesRef = useRef<VirtualControllerOverride[]>([
    makeDefaultOverride(0),
    makeDefaultOverride(1),
    makeDefaultOverride(2),
    makeDefaultOverride(3),
  ])
  const prevPadConnectedRef = useRef<boolean[]>([false, false, false, false])
  const autoCircleAngleRef = useRef<number>(0)

  const syncOverrideToBackend = useCallback(async (next: VirtualControllerOverride) => {
    overridesRef.current[next.slotIndex] = next
    try {
      const updated = await invoke<DualSenseTelemetrySnapshot>('dualsense_set_virtual_override', {
        overrideState: next,
      })
      setSnapshot(updated)
    } catch {
      // Ignore transient IPC error
    }
  }, [])

  const slots = snapshot?.slots ?? []
  const currentSlot = slots[activeSlot]
  const ds = currentSlot?.dualsense ?? snapshot?.dualsense
  const xb = currentSlot?.xbox ?? snapshot?.xbox
  const cfg = currentSlot?.config ?? snapshot?.config
  const drv = snapshot?.driverStatus
  const emulationActive = Boolean(xb?.emulationActive)

  const connectedSlots = slots.filter((s) => s.dualsense.connected)
  const allConnectedEmulating =
    connectedSlots.length > 0
      ? connectedSlots.every((s) => s.xbox.emulationActive)
      : slots.some((s) => s.xbox.emulationActive)

  // Sync hex input when slot or the lightbar colour changes (deps intentionally exclude the whole
  // `cfg` object so unrelated config updates don't overwrite what the user is typing).
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (cfg) {
      setHexDraft(rgbToHex(cfg.lightbarR, cfg.lightbarG, cfg.lightbarB))
    }
  }, [activeSlot, cfg?.lightbarR, cfg?.lightbarG, cfg?.lightbarB])

  // Listen to browser gamepadconnected / gamepaddisconnected for Sony controllers only
  useEffect(() => {
    const onDisconnect = (e: GamepadEvent) => {
      if (!isSonyDualSenseGamepad(e.gamepad)) return
      void invoke<DualSenseTelemetrySnapshot>('dualsense_scan_devices')
        .then((res) => setSnapshot(res))
        .catch(() => {})
    }
    const onConnect = (e: GamepadEvent) => {
      if (!isSonyDualSenseGamepad(e.gamepad)) return
      void invoke<DualSenseTelemetrySnapshot>('dualsense_scan_devices')
        .then((res) => setSnapshot(res))
        .catch(() => {})
    }
    window.addEventListener('gamepaddisconnected', onDisconnect)
    window.addEventListener('gamepadconnected', onConnect)
    return () => {
      window.removeEventListener('gamepaddisconnected', onDisconnect)
      window.removeEventListener('gamepadconnected', onConnect)
    }
  }, [])

  // Non-overlapping adaptive telemetry loop (never queues overlapping IPC requests)
  useEffect(() => {
    let cancelled = false
    let timerId: number | null = null

    const fetchInitial = async () => {
      try {
        const res = await invoke<DualSenseTelemetrySnapshot>('dualsense_get_state')
        if (!cancelled) {
          setSnapshot(res)
          setActiveSlot(res.activeSlot)
        }
      } catch {
        // Ignore
      }
    }
    void fetchInitial()

    const tick = async () => {
      if (cancelled) return

      if (!document.hidden) {
        let sentViaOverride = false

        if (autoCircleTest) {
          autoCircleAngleRef.current = (autoCircleAngleRef.current + 0.14) % (Math.PI * 2)
          const angle = autoCircleAngleRef.current
          const lx = Math.round(128 + Math.cos(angle) * 118)
          const ly = Math.round(128 + Math.sin(angle) * 118)
          const rx = Math.round(128 + Math.sin(angle * 1.5) * 118)
          const ry = Math.round(128 + Math.cos(angle * 1.5) * 118)
          const cur = overridesRef.current[activeSlot] ?? makeDefaultOverride(activeSlot)
          const next: VirtualControllerOverride = {
            ...cur,
            slotIndex: activeSlot,
            active: true,
            lx,
            ly,
            rx,
            ry,
          }
          overridesRef.current[activeSlot] = next
          sentViaOverride = true
          try {
            const res = await invoke<DualSenseTelemetrySnapshot>('dualsense_set_virtual_override', {
              overrideState: next,
            })
            if (!cancelled) {
              setSnapshot(res)
            }
          } catch {
            // Ignore
          }
        } else {
          // Check if native Win32 HID driver has already claimed physical Sony controller(s)
          const hasNativeHid = Boolean(
            snapshotRef.current?.slots?.some(
              (s) => s.dualsense.devicePath && s.dualsense.devicePath.length > 0,
            ),
          )

          if (!hasNativeHid && navigator.getGamepads) {
            const rawPads = Array.from(navigator.getGamepads())
            const sonyPads = rawPads.filter(isSonyDualSenseGamepad).slice(0, 4)

            for (let slotIdx = 0; slotIdx < 4; slotIdx++) {
              const pad = sonyPads[slotIdx]
              const isNowConnected = Boolean(pad && pad.connected)

              if (!isNowConnected) {
                if (prevPadConnectedRef.current[slotIdx]) {
                  prevPadConnectedRef.current[slotIdx] = false
                  const cleared = makeDefaultOverride(slotIdx)
                  overridesRef.current[slotIdx] = cleared
                  sentViaOverride = true
                  try {
                    const res = await invoke<DualSenseTelemetrySnapshot>(
                      'dualsense_set_virtual_override',
                      { overrideState: cleared },
                    )
                    if (!cancelled) {
                      setSnapshot(res)
                    }
                  } catch {
                    // Ignore
                  }
                }
                continue
              }

              prevPadConnectedRef.current[slotIdx] = true
              const b = pad.buttons
              const ax = pad.axes
              const padLx = Math.round(((ax[0] ?? 0) + 1) * 127.5)
              const padLy = Math.round(((ax[1] ?? 0) + 1) * 127.5)
              const padRx = Math.round(((ax[2] ?? 0) + 1) * 127.5)
              const padRy = Math.round(((ax[3] ?? 0) + 1) * 127.5)

              const m = overridesRef.current[slotIdx] ?? makeDefaultOverride(slotIdx)
              const combined: VirtualControllerOverride = {
                slotIndex: slotIdx,
                active: true,
                webGamepadConnected: true,
                cross: m.cross || Boolean(b[0]?.pressed),
                circle: m.circle || Boolean(b[1]?.pressed),
                square: m.square || Boolean(b[2]?.pressed),
                triangle: m.triangle || Boolean(b[3]?.pressed),
                l1: m.l1 || Boolean(b[4]?.pressed),
                r1: m.r1 || Boolean(b[5]?.pressed),
                l2: Math.max(m.l2, Math.round((b[6]?.value ?? 0) * 255)),
                r2: Math.max(m.r2, Math.round((b[7]?.value ?? 0) * 255)),
                create: m.create || Boolean(b[8]?.pressed),
                options: m.options || Boolean(b[9]?.pressed),
                l3: m.l3 || Boolean(b[10]?.pressed),
                r3: m.r3 || Boolean(b[11]?.pressed),
                dpadUp: m.dpadUp || Boolean(b[12]?.pressed),
                dpadDown: m.dpadDown || Boolean(b[13]?.pressed),
                dpadLeft: m.dpadLeft || Boolean(b[14]?.pressed),
                dpadRight: m.dpadRight || Boolean(b[15]?.pressed),
                ps: m.ps || Boolean(b[16]?.pressed),
                touchpadClick: m.touchpadClick || Boolean(b[17]?.pressed),
                touch1Active: m.touch1Active,
                touch1X: m.touch1X,
                touch1Y: m.touch1Y,
                mute: m.mute,
                lx: Math.abs(m.lx - 128) > 4 ? m.lx : padLx,
                ly: Math.abs(m.ly - 128) > 4 ? m.ly : padLy,
                rx: Math.abs(m.rx - 128) > 4 ? m.rx : padRx,
                ry: Math.abs(m.ry - 128) > 4 ? m.ry : padRy,
              }
              sentViaOverride = true
              try {
                const res = await invoke<DualSenseTelemetrySnapshot>(
                  'dualsense_set_virtual_override',
                  { overrideState: combined },
                )
                if (!cancelled) {
                  setSnapshot(res)
                }
              } catch {
                // Ignore
              }
            }
          }
        }

        if (!sentViaOverride) {
          try {
            const res = await invoke<DualSenseTelemetrySnapshot>('dualsense_get_state')
            if (!cancelled) {
              setSnapshot(res)
            }
          } catch {
            // Ignore
          }
        }
      }

      if (!cancelled) {
        timerId = window.setTimeout(() => {
          void tick()
        }, 35)
      }
    }

    timerId = window.setTimeout(() => {
      void tick()
    }, 35)

    return () => {
      cancelled = true
      if (timerId !== null) {
        window.clearTimeout(timerId)
      }
    }
  }, [autoCircleTest, activeSlot])

  const handleSelectSlot = async (slotIdx: number) => {
    setActiveSlot(slotIdx)
    try {
      const updated = await invoke<DualSenseTelemetrySnapshot>('dualsense_select_slot', {
        slotIndex: slotIdx,
      })
      setSnapshot(updated)
    } catch {
      // Ignore
    }
  }

  const handleToggleXboxEmulation = async (targetSlot?: number, allSlots?: boolean) => {
    if (isToggling) return
    setIsToggling(true)
    const slotToUse = targetSlot ?? activeSlot
    if (targetSlot !== undefined && !allSlots && targetSlot !== activeSlot) {
      setActiveSlot(targetSlot)
      void invoke('dualsense_select_slot', { slotIndex: targetSlot }).catch(() => {})
    }

    const nextState = allSlots
      ? !allConnectedEmulating
      : !(slots[slotToUse]?.xbox?.emulationActive ?? snapshot?.xbox?.emulationActive)

    try {
      const updated = await invoke<DualSenseTelemetrySnapshot>('dualsense_set_xbox_emulation', {
        enabled: nextState,
        slotIndex: slotToUse,
        allSlots: Boolean(allSlots),
      })
      setSnapshot(updated)
    } finally {
      setIsToggling(false)
    }
  }

  const handleButtonToggle = (btnKey: string, pressed: boolean) => {
    const cur: VirtualControllerOverride = {
      ...(overridesRef.current[activeSlot] ?? makeDefaultOverride(activeSlot)),
      slotIndex: activeSlot,
    }
    if (btnKey === 'l2') {
      cur.l2 = pressed ? 255 : 0
    } else if (btnKey === 'r2') {
      cur.r2 = pressed ? 255 : 0
    } else if (btnKey in cur) {
      ;(cur as unknown as Record<string, unknown>)[btnKey] = pressed
    }
    cur.active = pressed || hasAnyManualOverrideInput(cur)
    void syncOverrideToBackend(cur)
  }

  const handleStickMove = (stick: 'left' | 'right', x: number, y: number) => {
    const cur: VirtualControllerOverride = {
      ...(overridesRef.current[activeSlot] ?? makeDefaultOverride(activeSlot)),
      slotIndex: activeSlot,
    }
    if (stick === 'left') {
      cur.lx = x
      cur.ly = y
    } else {
      cur.rx = x
      cur.ry = y
    }
    cur.active = hasAnyManualOverrideInput(cur)
    void syncOverrideToBackend(cur)
  }

  const handleTouchpadInput = (
    active: boolean,
    x: number,
    y: number,
    clicked: boolean,
  ) => {
    const cur: VirtualControllerOverride = {
      ...(overridesRef.current[activeSlot] ?? makeDefaultOverride(activeSlot)),
      slotIndex: activeSlot,
      touch1Active: active,
      touch1X: x,
      touch1Y: y,
      touchpadClick: clicked,
    }
    cur.active = active || clicked || hasAnyManualOverrideInput(cur)
    void syncOverrideToBackend(cur)
  }

  const handleResetTestInputs = () => {
    setAutoCircleTest(false)
    const reset = makeDefaultOverride(activeSlot)
    void syncOverrideToBackend(reset)
  }

  const handleUpdateConfig = async (patch: Partial<DualSenseProfileConfig>) => {
    if (!cfg) return
    const nextCfg: DualSenseProfileConfig = {
      ...cfg,
      ...patch,
    }
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

  const handleScanDevices = async () => {
    try {
      const updated = await invoke<DualSenseTelemetrySnapshot>('dualsense_scan_devices')
      setSnapshot(updated)
    } catch {
      // Ignore
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
    } catch {
      // Ignore
    }
  }

  const handleInstallDriver = async (driverType: 'vigembus' | 'hidhide') => {
    try {
      const updated = await invoke<DualSenseTelemetrySnapshot>('dualsense_install_driver', {
        driverType,
      })
      setSnapshot(updated)
    } catch {
      // Ignore
    }
  }

  const ps5VisualState = {
    cross: !emulationActive ? Boolean(ds?.cross) : false,
    circle: !emulationActive ? Boolean(ds?.circle) : false,
    square: !emulationActive ? Boolean(ds?.square) : false,
    triangle: !emulationActive ? Boolean(ds?.triangle) : false,
    l1: !emulationActive ? Boolean(ds?.l1) : false,
    r1: !emulationActive ? Boolean(ds?.r1) : false,
    l2: !emulationActive ? (ds?.l2 ?? 0) : 0,
    r2: !emulationActive ? (ds?.r2 ?? 0) : 0,
    create: !emulationActive ? Boolean(ds?.create) : false,
    options: !emulationActive ? Boolean(ds?.options) : false,
    l3: !emulationActive ? Boolean(ds?.l3) : false,
    r3: !emulationActive ? Boolean(ds?.r3) : false,
    ps: !emulationActive ? Boolean(ds?.ps) : false,
    touchpadClick: Boolean(ds?.touchpadClick),
    mute: !emulationActive ? Boolean(ds?.mute) : false,
    dpadUp: !emulationActive ? Boolean(ds?.dpadUp) : false,
    dpadDown: !emulationActive ? Boolean(ds?.dpadDown) : false,
    dpadLeft: !emulationActive ? Boolean(ds?.dpadLeft) : false,
    dpadRight: !emulationActive ? Boolean(ds?.dpadRight) : false,
    lx: !emulationActive ? (ds?.lx ?? 128) : 128,
    ly: !emulationActive ? (ds?.ly ?? 128) : 128,
    rx: !emulationActive ? (ds?.rx ?? 128) : 128,
    ry: !emulationActive ? (ds?.ry ?? 128) : 128,
    touch1Active: Boolean(ds?.touch1Active),
    touch1X: ds?.touch1X ?? 960,
    touch1Y: ds?.touch1Y ?? 540,
    mouseLeftClick: Boolean(ds?.mouseLeftClick),
    mouseRightClick: Boolean(ds?.mouseRightClick),
    touchpadMouseEnabled: cfg?.touchpadMouseEnabled ?? true,
    emulationActive,
    playerLedMask: cfg?.playerLedMask ?? 0x04,
    lightbarR: cfg?.lightbarR ?? 0,
    lightbarG: cfg?.lightbarG ?? 112,
    lightbarB: cfg?.lightbarB ?? 255,
  }

  const xboxVisualState = {
    a: emulationActive ? Boolean(xb?.a) : false,
    b: emulationActive ? Boolean(xb?.b) : false,
    x: emulationActive ? Boolean(xb?.x) : false,
    y: emulationActive ? Boolean(xb?.y) : false,
    lb: emulationActive ? Boolean(xb?.lb) : false,
    rb: emulationActive ? Boolean(xb?.rb) : false,
    lt: emulationActive ? (xb?.lt ?? 0) : 0,
    rt: emulationActive ? (xb?.rt ?? 0) : 0,
    back: emulationActive ? Boolean(xb?.back) : false,
    start: emulationActive ? Boolean(xb?.start) : false,
    guide: emulationActive ? Boolean(xb?.guide) : false,
    share: emulationActive ? Boolean(xb?.share) : false,
    ls: emulationActive ? Boolean(xb?.ls) : false,
    rs: emulationActive ? Boolean(xb?.rs) : false,
    dpadUp: emulationActive ? Boolean(xb?.dpadUp) : false,
    dpadDown: emulationActive ? Boolean(xb?.dpadDown) : false,
    dpadLeft: emulationActive ? Boolean(xb?.dpadLeft) : false,
    dpadRight: emulationActive ? Boolean(xb?.dpadRight) : false,
    thumbLx: emulationActive ? (xb?.thumbLx ?? 0) : 0,
    thumbLy: emulationActive ? (xb?.thumbLy ?? 0) : 0,
    thumbRx: emulationActive ? (xb?.thumbRx ?? 0) : 0,
    thumbRy: emulationActive ? (xb?.thumbRy ?? 0) : 0,
  }

  const currentHex = rgbToHex(
    cfg?.lightbarR ?? 0,
    cfg?.lightbarG ?? 112,
    cfg?.lightbarB ?? 255,
  )

  return (
    <div className="flex h-full flex-col overflow-y-auto px-6 py-6 text-text">
      {/* ==================== TOP HEADER & DS4WINDOWS START/STOP ENGINE BAR ==================== */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-surface/90 p-5 shadow-sm backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <div
            className="flex size-12 items-center justify-center rounded-2xl ring-1"
            style={{
              backgroundColor: `rgba(${cfg?.lightbarR ?? 0}, ${cfg?.lightbarG ?? 112}, ${cfg?.lightbarB ?? 255}, 0.16)`,
              borderColor: `rgba(${cfg?.lightbarR ?? 0}, ${cfg?.lightbarG ?? 112}, ${cfg?.lightbarB ?? 255}, 0.45)`,
            }}
          >
            <Gamepad2 className="size-6 text-accent" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl font-black tracking-tight text-text">
                DualSense Studio &amp; Multi-Controller Xbox Emulator
              </h1>
              <span className="rounded-full border border-accent/30 bg-accent/10 px-2.5 py-0.5 font-mono text-[10px] font-extrabold uppercase tracking-wider text-accent">
                DS4Windows 4-Slot Core
              </span>
            </div>
            <p className="mt-1 text-xs text-muted">
              {emulationActive
                ? `Controller #${activeSlot + 1}: Xbox 360 Emulation + Touchpad Mouse ACTIVE (Left Touchpad = Left Click, Right Touchpad = Right Click).`
                : `Controller #${activeSlot + 1}: Native PS5 Mode ACTIVE — Games see the PS5 DualSense controller directly.`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Live Hardware Connection & Battery Badge */}
          <div
            className={`flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-bold transition-colors ${
              ds?.connected
                ? 'border-emerald-500/40 bg-emerald-500/10 text-text'
                : 'border-border bg-surface-raised/80 text-muted'
            }`}
          >
            {ds?.connected ? (
              ds.connectionType === 'Bluetooth' ? (
                <Bluetooth className="size-4 text-blue-500" />
              ) : (
                <Usb className="size-4 text-emerald-500" />
              )
            ) : (
              <Unplug className="size-4 text-subtle" />
            )}
            <span>
              {ds?.connected
                ? `Connected (${ds.connectionType})`
                : `Slot #${activeSlot + 1} Disconnected`}
            </span>
            {ds?.connected && (
              <>
                <span className="text-subtle">•</span>
                <BatteryCharging className="size-4 text-emerald-500" />
                <span>{ds.batteryPercent}%</span>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={handleScanDevices}
            className="flex items-center gap-1.5 rounded-xl border border-border bg-surface-raised px-3.5 py-2.5 text-xs font-bold text-text transition hover:border-accent/50 hover:bg-accent/10 cursor-pointer"
            title="Rescan all USB & Bluetooth HID Controllers (Slots 1-4)"
          >
            <RefreshCw className="size-3.5" />
            Rescan HID
          </button>

          {/* Toggle All Connected Slots Button */}
          <button
            type="button"
            disabled={isToggling}
            onClick={() => void handleToggleXboxEmulation(undefined, true)}
            className="flex items-center gap-1.5 rounded-xl border border-border bg-surface-raised px-3.5 py-2.5 text-xs font-extrabold text-text transition hover:border-emerald-500/40 hover:bg-emerald-500/10 cursor-pointer disabled:opacity-50"
            title="Start or Stop Xbox Emulation across all connected controllers simultaneously"
          >
            <Users className="size-3.5 text-emerald-500" />
            {allConnectedEmulating ? 'Stop All (1–4)' : 'Activate All (1–4)'}
          </button>

          {/* Primary Active Slot Start / Stop Emulation Button */}
          <button
            type="button"
            disabled={isToggling}
            onClick={() => void handleToggleXboxEmulation(activeSlot, false)}
            className={`flex items-center gap-2.5 rounded-xl px-5 py-2.5 text-sm font-black tracking-wide text-white shadow-md transition-all cursor-pointer disabled:opacity-50 ${
              emulationActive
                ? 'bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 shadow-emerald-600/20 ring-2 ring-emerald-400/50 hover:brightness-110'
                : 'bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-600 shadow-blue-600/20 ring-1 ring-blue-400/40 hover:brightness-110'
            }`}
          >
            {emulationActive ? (
              <>
                <Square className="size-4 fill-current" />
                Stop Slot #{activeSlot + 1} (Restore PS5)
              </>
            ) : (
              <>
                <Play className="size-4 fill-current" />
                Activate Xbox 360 &amp; Mouse (Slot #{activeSlot + 1})
              </>
            )}
          </button>
        </div>
      </div>

      {/* ==================== MULTI-CONTROLLER SLOT BAR (SLOTS 1 TO 4) ==================== */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((idx) => {
          const slotSnap = slots[idx]
          const isSelected = activeSlot === idx
          const isSlotEmulating = Boolean(slotSnap?.xbox?.emulationActive)
          const isSlotConnected = Boolean(slotSnap?.dualsense?.connected)
          const sr =
            slotSnap?.config?.lightbarR ??
            (idx === 0 ? 0 : idx === 1 ? 239 : idx === 2 ? 16 : 168)
          const sg =
            slotSnap?.config?.lightbarG ??
            (idx === 0 ? 112 : idx === 1 ? 68 : idx === 2 ? 185 : 85)
          const sb =
            slotSnap?.config?.lightbarB ??
            (idx === 0 ? 255 : idx === 1 ? 68 : idx === 2 ? 129 : 247)
          const slotColor = `rgb(${sr}, ${sg}, ${sb})`

          return (
            <div
              key={idx}
              onClick={() => void handleSelectSlot(idx)}
              className={`flex items-center justify-between rounded-2xl border p-3.5 transition-all cursor-pointer ${
                isSelected
                  ? 'border-accent bg-surface-raised shadow-sm ring-1 ring-accent/30'
                  : 'border-border bg-surface/75 hover:border-accent/40 hover:bg-surface-raised/60'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="flex size-9 shrink-0 items-center justify-center rounded-xl font-mono text-xs font-black text-white shadow-xs"
                  style={{
                    backgroundColor: slotColor,
                    boxShadow: `0 0 12px rgba(${sr}, ${sg}, ${sb}, 0.4)`,
                  }}
                >
                  P{idx + 1}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-xs font-black text-text">
                      Controller #{idx + 1}
                    </span>
                    <span
                      className={`size-2 rounded-full ${
                        isSlotConnected
                          ? 'bg-emerald-500 shadow-[0_0_6px_#10b981]'
                          : 'bg-subtle/50'
                      }`}
                    />
                  </div>
                  <div className="truncate text-[10px] font-bold text-muted">
                    {isSlotEmulating
                      ? 'Xbox 360 + Touchpad Mouse'
                      : isSlotConnected
                        ? `Connected (${slotSnap?.dualsense?.connectionType})`
                        : 'Disconnected'}
                  </div>
                </div>
              </div>

              <button
                type="button"
                disabled={isToggling}
                onClick={(e) => {
                  e.stopPropagation()
                  void handleToggleXboxEmulation(idx, false)
                }}
                className={`shrink-0 rounded-lg px-2.5 py-1 text-[10px] font-extrabold transition cursor-pointer ${
                  isSlotEmulating
                    ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/40'
                    : 'bg-surface border border-border text-muted hover:text-text'
                }`}
              >
                {isSlotEmulating ? 'XBOX ON' : 'PS5 MODE'}
              </button>
            </div>
          )
        })}
      </div>

      {/* ==================== ORIGINAL FACTORY 3D DUAL CONTROLLER STAGE ==================== */}
      {!ds?.connected && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface-raised/90 px-4 py-2.5 text-xs">
          <div className="flex items-center gap-2.5">
            <span className="size-2.5 rounded-full bg-subtle animate-pulse" />
            <span className="font-extrabold text-text">
              Controller #{activeSlot + 1} is Disconnected — Both Controllers Displayed in Standby Grayscale
            </span>
          </div>
          <span className="font-medium text-muted">
            Connect controller #{activeSlot + 1} via USB or Bluetooth to restore full RGB color &amp; live telemetry
          </span>
        </div>
      )}
      <div
        className={`relative mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2 transition-all duration-500 ${
          !ds?.connected ? 'grayscale saturate-0 opacity-75' : ''
        }`}
      >
        {/* LEFT CARD: ORIGINAL FACTORY PS5 DUALSENSE CONTROLLER */}
        <div
          className={`relative overflow-hidden rounded-3xl border p-6 transition-all duration-500 ${
            !ds?.connected
              ? 'border-border/60 bg-surface/50'
              : !emulationActive
                ? 'border-accent/60 bg-gradient-to-b from-surface-raised/90 via-surface to-surface-raised/80 shadow-lg ring-1 ring-accent/25'
                : 'border-border/70 bg-surface/60'
          }`}
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span
                className="size-3 rounded-full"
                style={{
                  backgroundColor: currentHex,
                  boxShadow: `0 0 10px ${currentHex}`,
                }}
              />
              <span className="text-sm font-black tracking-wide text-text">
                PS5 DualSense Wireless Controller #{activeSlot + 1}
              </span>
              <span className="font-mono text-[11px] text-subtle">VID:054C PID:0CE6</span>
            </div>

            {!emulationActive ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/15 px-3 py-1 text-[11px] font-extrabold text-accent">
                <CheckCircle2 className="size-3.5" />
                ACTIVE IN GAMES (NATIVE PS5)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/15 px-3 py-1 text-[11px] font-extrabold text-amber-500">
                <EyeOff className="size-3.5" />
                CLOAKED IN GAMES • TOUCHPAD MOUSE ON
              </span>
            )}
          </div>

          <DualSenseSvgController
            state={ps5VisualState}
            isActiveController={!emulationActive}
            isConnected={Boolean(ds?.connected)}
            onButtonToggle={handleButtonToggle}
            onStickMove={handleStickMove}
            onTouchpadInput={handleTouchpadInput}
          />

          {/* Live PS5 DualSense Bottom Readout Bar (Theme-Adaptive) */}
          <div className="mt-4 grid grid-cols-4 gap-2 rounded-2xl border border-border bg-surface-raised/85 p-3 font-mono text-[11px]">
            <div>
              <div className="text-[10px] font-bold text-subtle">LEFT STICK (L3)</div>
              <div className="font-extrabold text-accent">
                {ps5VisualState.lx} , {ps5VisualState.ly}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold text-subtle">RIGHT STICK (R3)</div>
              <div className="font-extrabold text-accent">
                {ps5VisualState.rx} , {ps5VisualState.ry}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold text-subtle">TOUCHPAD MOUSE</div>
              <div className="font-extrabold text-text">
                {ps5VisualState.mouseLeftClick
                  ? 'LEFT CLICK'
                  : ps5VisualState.mouseRightClick
                    ? 'RIGHT CLICK'
                    : `${ps5VisualState.touch1X},${ps5VisualState.touch1Y}`}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold text-subtle">LIGHTBAR RGB</div>
              <div className="flex items-center gap-1.5 font-extrabold text-text">
                <span
                  className="size-2.5 rounded-full border border-border"
                  style={{ backgroundColor: currentHex }}
                />
                {currentHex}
              </div>
            </div>
          </div>
        </div>

        {/* CENTER FLOATING MODE INDICATOR BADGE ON LARGE SCREENS */}
        <div className="pointer-events-none hidden lg:flex absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 flex-col items-center">
          <div
            className={`flex size-12 items-center justify-center rounded-2xl border bg-surface-raised shadow-lg transition-all duration-500 ${
              emulationActive
                ? 'border-emerald-500/50 text-emerald-500 shadow-emerald-500/20'
                : 'border-accent/50 text-accent shadow-accent/20'
            }`}
          >
            <ArrowRightLeft className="size-5" />
          </div>
        </div>

        {/* RIGHT CARD: ORIGINAL FACTORY XBOX SERIES X|S EMULATED CONTROLLER */}
        <div
          className={`relative overflow-hidden rounded-3xl border p-6 transition-all duration-500 ${
            emulationActive
              ? 'border-emerald-500/60 bg-gradient-to-b from-surface-raised/90 via-surface to-surface-raised/80 shadow-lg ring-1 ring-emerald-500/30'
              : 'border-border/70 bg-surface/60'
          }`}
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span
                className={`size-3 rounded-full ${
                  emulationActive
                    ? 'bg-emerald-500 shadow-[0_0_10px_#10b981] animate-pulse'
                    : 'bg-subtle/50'
                }`}
              />
              <span className="text-sm font-black tracking-wide text-text">
                Virtual Xbox Controller #{activeSlot + 1} (XInput)
              </span>
              <span className="font-mono text-[11px] text-subtle">VID:045E PID:028E</span>
            </div>

            {emulationActive ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-3 py-1 text-[11px] font-extrabold text-emerald-500">
                <Zap className="size-3.5" />
                ACTIVE IN GAMES (XBOX EMULATED)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-raised px-3 py-1 text-[11px] font-bold text-muted">
                STANDBY (UNPLUGGED)
              </span>
            )}
          </div>

          <XboxSvgController
            state={xboxVisualState}
            isActiveController={emulationActive}
            isConnected={Boolean(ds?.connected)}
            onButtonToggle={handleButtonToggle}
            onStickMove={handleStickMove}
          />

          {/* Live Xbox 360 XInput Bottom Readout Bar (Theme-Adaptive) */}
          <div className="mt-4 grid grid-cols-4 gap-2 rounded-2xl border border-border bg-surface-raised/85 p-3 font-mono text-[11px]">
            <div>
              <div className="text-[10px] font-bold text-subtle">XINPUT LS (X/Y)</div>
              <div className="font-extrabold text-emerald-500">
                {xboxVisualState.thumbLx} , {xboxVisualState.thumbLy}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold text-subtle">XINPUT RS (X/Y)</div>
              <div className="font-extrabold text-emerald-500">
                {xboxVisualState.thumbRx} , {xboxVisualState.thumbRy}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold text-subtle">TRIGGERS (LT/RT)</div>
              <div className="font-extrabold text-text">
                {xboxVisualState.lt} / {xboxVisualState.rt}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold text-subtle">wButtons MASK</div>
              <div className="font-extrabold text-amber-500">
                0x
                {(emulationActive ? (xb?.wButtons ?? 0) : 0)
                  .toString(16)
                  .toUpperCase()
                  .padStart(4, '0')}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ==================== REDESIGNED LIVE BUTTON, 360° STICK & TOUCHPAD MOUSE TEST BENCH ==================== */}
      <div className="mb-6 rounded-3xl border border-border bg-surface/90 p-6 shadow-sm">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-border/70 pb-4">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-2xl bg-accent/15 text-accent ring-1 ring-accent/30">
              <Activity className="size-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-black uppercase tracking-wider text-text">
                  Interactive Hardware &amp; Input Diagnostics Bench
                </h2>
                <span className="rounded-lg bg-surface-raised px-2 py-0.5 font-mono text-[10px] font-bold text-subtle border border-border">
                  Slot #{activeSlot + 1}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted">
                Press physical controller buttons or interact with the modules below to test{' '}
                <strong className="text-accent">
                  {emulationActive
                    ? 'Virtual Xbox 360 XInput + Touchpad Mouse'
                    : 'Native PS5 DualSense HID'}
                </strong>{' '}
                in real time.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setAutoCircleTest((v) => !v)}
              className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-extrabold transition cursor-pointer ${
                autoCircleTest
                  ? 'bg-accent text-white shadow-md shadow-accent/25'
                  : 'border border-border bg-surface-raised text-text hover:border-accent/50'
              }`}
            >
              <Sparkles className="size-3.5" />
              {autoCircleTest ? 'Stop 360° Stick Test' : 'Auto-Rotate 360° Sticks'}
            </button>

            <button
              type="button"
              onClick={handleRumbleTest}
              className="flex items-center gap-1.5 rounded-xl border border-border bg-surface-raised px-3.5 py-2 text-xs font-extrabold text-text transition hover:border-amber-500/50 hover:bg-amber-500/10 cursor-pointer"
            >
              <Vibrate className="size-3.5 text-amber-500" />
              Test Rumble Haptics
            </button>

            <button
              type="button"
              onClick={handleResetTestInputs}
              className="rounded-xl border border-border bg-surface-raised px-3.5 py-2 text-xs font-bold text-muted hover:text-text cursor-pointer"
            >
              Reset All
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
          {/* Left 5 Columns: 360° Analog Vector Radars + Touchpad Mouse Trackpad */}
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3 xl:col-span-5">
            <StickTesterPad
              title={emulationActive ? 'Left Stick (LS)' : 'Left Stick (L3)'}
              rawX={ds?.lx ?? 128}
              rawY={ds?.ly ?? 128}
              xinputX={xb?.thumbLx ?? 0}
              xinputY={xb?.thumbLy ?? 0}
              emulationActive={emulationActive}
              onMove={(x, y) => handleStickMove('left', x, y)}
            />
            <StickTesterPad
              title={emulationActive ? 'Right Stick (RS)' : 'Right Stick (R3)'}
              rawX={ds?.rx ?? 128}
              rawY={ds?.ry ?? 128}
              xinputX={xb?.thumbRx ?? 0}
              xinputY={xb?.thumbRy ?? 0}
              emulationActive={emulationActive}
              onMove={(x, y) => handleStickMove('right', x, y)}
            />
            <TouchpadMouseTesterPad
              touchX={ds?.touch1X ?? 960}
              touchY={ds?.touch1Y ?? 540}
              touchActive={Boolean(ds?.touch1Active)}
              leftClick={Boolean(ds?.mouseLeftClick)}
              rightClick={Boolean(ds?.mouseRightClick)}
              emulationActive={emulationActive}
              onInput={handleTouchpadInput}
            />
          </div>

          {/* Right 7 Columns: Categorized Tactile Button Matrix & Trigger Sliders */}
          <div className="flex flex-col justify-between gap-4 xl:col-span-7">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {[
                { key: 'cross', psLabel: '✕ Cross', xbLabel: 'A Button', active: ds?.cross, badgeColor: 'text-blue-500' },
                { key: 'circle', psLabel: '○ Circle', xbLabel: 'B Button', active: ds?.circle, badgeColor: 'text-rose-500' },
                { key: 'square', psLabel: '□ Square', xbLabel: 'X Button', active: ds?.square, badgeColor: 'text-pink-500' },
                { key: 'triangle', psLabel: '△ Triangle', xbLabel: 'Y Button', active: ds?.triangle, badgeColor: 'text-emerald-500' },
                { key: 'l1', psLabel: 'L1 Bumper', xbLabel: 'LB Bumper', active: ds?.l1, badgeColor: 'text-accent' },
                { key: 'r1', psLabel: 'R1 Bumper', xbLabel: 'RB Bumper', active: ds?.r1, badgeColor: 'text-accent' },
                { key: 'l3', psLabel: 'L3 Click', xbLabel: 'LS Click', active: ds?.l3, badgeColor: 'text-accent' },
                { key: 'r3', psLabel: 'R3 Click', xbLabel: 'RS Click', active: ds?.r3, badgeColor: 'text-accent' },
                { key: 'dpadUp', psLabel: 'D-Pad Up', xbLabel: 'D-Pad Up', active: ds?.dpadUp, badgeColor: 'text-subtle' },
                { key: 'dpadDown', psLabel: 'D-Pad Down', xbLabel: 'D-Pad Down', active: ds?.dpadDown, badgeColor: 'text-subtle' },
                { key: 'dpadLeft', psLabel: 'D-Pad Left', xbLabel: 'D-Pad Left', active: ds?.dpadLeft, badgeColor: 'text-subtle' },
                { key: 'dpadRight', psLabel: 'D-Pad Right', xbLabel: 'D-Pad Right', active: ds?.dpadRight, badgeColor: 'text-subtle' },
                { key: 'create', psLabel: 'Create', xbLabel: 'View / Back', active: ds?.create, badgeColor: 'text-subtle' },
                { key: 'options', psLabel: 'Options', xbLabel: 'Menu / Start', active: ds?.options, badgeColor: 'text-subtle' },
                { key: 'ps', psLabel: 'PS Home', xbLabel: 'Xbox Guide', active: ds?.ps, badgeColor: 'text-emerald-500' },
                { key: 'mute', psLabel: 'Mic Mute', xbLabel: 'Share', active: ds?.mute, badgeColor: 'text-amber-500' },
              ].map((btn) => (
                <button
                  key={btn.key}
                  type="button"
                  onPointerDown={() => handleButtonToggle(btn.key, true)}
                  onPointerUp={() => handleButtonToggle(btn.key, false)}
                  onPointerLeave={() => {
                    const cur = overridesRef.current[activeSlot]
                    if (cur && (cur as unknown as Record<string, unknown>)[btn.key]) {
                      handleButtonToggle(btn.key, false)
                    }
                  }}
                  className={`group flex items-center justify-between rounded-xl border px-3 py-2.5 text-left transition-all select-none cursor-pointer ${
                    btn.active
                      ? emulationActive
                        ? 'border-emerald-500 bg-emerald-500 text-white shadow-md shadow-emerald-500/25 scale-[0.98]'
                        : 'border-accent bg-accent text-white shadow-md shadow-accent/25 scale-[0.98]'
                      : 'border-border bg-surface-raised/75 text-text hover:border-accent/50 hover:bg-surface-raised'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="truncate text-xs font-extrabold">
                      {emulationActive ? btn.xbLabel : btn.psLabel}
                    </div>
                    <div
                      className={`truncate font-mono text-[10px] ${
                        btn.active ? 'text-white/85' : 'text-subtle'
                      }`}
                    >
                      {emulationActive ? `← ${btn.psLabel}` : `→ ${btn.xbLabel}`}
                    </div>
                  </div>
                  <span
                    className={`size-2 rounded-full transition-transform ${
                      btn.active
                        ? 'bg-white scale-125'
                        : 'bg-border group-hover:bg-accent/60'
                    }`}
                  />
                </button>
              ))}
            </div>

            {/* L2 / LT & R2 / RT Analog Trigger Pull Test Sliders */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-border bg-surface-raised/65 p-3.5">
                <div className="mb-2 flex items-center justify-between text-xs font-extrabold">
                  <span className="text-text">
                    {emulationActive ? 'Left Trigger (LT ← L2)' : 'Left Trigger (L2)'}
                  </span>
                  <span className="rounded-md bg-accent/15 px-2 py-0.5 font-mono text-[11px] text-accent">
                    {emulationActive ? xb?.lt ?? 0 : ds?.l2 ?? 0} / 255
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={255}
                  value={ds?.l2 ?? 0}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    const cur: VirtualControllerOverride = {
                      ...(overridesRef.current[activeSlot] ?? makeDefaultOverride(activeSlot)),
                      slotIndex: activeSlot,
                      l2: v,
                    }
                    cur.active = v > 0 || hasAnyManualOverrideInput(cur)
                    void syncOverrideToBackend(cur)
                  }}
                  className="w-full accent-blue-600 cursor-pointer"
                />
              </div>

              <div className="rounded-2xl border border-border bg-surface-raised/65 p-3.5">
                <div className="mb-2 flex items-center justify-between text-xs font-extrabold">
                  <span className="text-text">
                    {emulationActive ? 'Right Trigger (RT ← R2)' : 'Right Trigger (R2)'}
                  </span>
                  <span className="rounded-md bg-accent/15 px-2 py-0.5 font-mono text-[11px] text-accent">
                    {emulationActive ? xb?.rt ?? 0 : ds?.r2 ?? 0} / 255
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={255}
                  value={ds?.r2 ?? 0}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    const cur: VirtualControllerOverride = {
                      ...(overridesRef.current[activeSlot] ?? makeDefaultOverride(activeSlot)),
                      slotIndex: activeSlot,
                      r2: v,
                    }
                    cur.active = v > 0 || hasAnyManualOverrideInput(cur)
                    void syncOverrideToBackend(cur)
                  }}
                  className="w-full accent-blue-600 cursor-pointer"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ==================== BOTTOM DS4WINDOWS HARDWARE TUNING & CUSTOM RGB LIGHTBAR ==================== */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* 1. 24-Bit Custom PS5 Lightbar Color Picker & Player LEDs */}
        <div className="rounded-3xl border border-border bg-surface/90 p-5 shadow-xs">
          <div className="mb-4 flex items-center justify-between border-b border-border/60 pb-3">
            <div className="flex items-center gap-2">
              <Palette className="size-4 text-accent" />
              <h3 className="text-xs font-black uppercase tracking-wider text-text">
                Custom PS5 Lightbar Color (Slot #{activeSlot + 1})
              </h3>
            </div>
            <span className="rounded-md border border-border bg-surface-raised px-2 py-0.5 font-mono text-xs font-extrabold text-text">
              {currentHex}
            </span>
          </div>

          <div className="space-y-4 text-xs">
            {/* Native Color Wheel Picker + Hex Input */}
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface-raised/75 p-3">
              <label
                className="relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 border-white/40 shadow-md cursor-pointer"
                style={{
                  backgroundColor: currentHex,
                  boxShadow: `0 0 16px ${currentHex}`,
                }}
                title="Click to pick any custom Lightbar color"
              >
                <input
                  type="color"
                  value={currentHex}
                  onChange={(e) => {
                    const rgb = hexToRgb(e.target.value)
                    if (rgb) {
                      setHexDraft(e.target.value.toUpperCase())
                      void handleUpdateConfig({
                        lightbarR: rgb.r,
                        lightbarG: rgb.g,
                        lightbarB: rgb.b,
                      })
                    }
                  }}
                  className="absolute inset-0 size-full opacity-0 cursor-pointer"
                />
              </label>

              <div className="flex-1">
                <div className="font-extrabold text-text">Custom Color Wheel &amp; Hex</div>
                <div className="text-[10px] text-muted">
                  Choose any 24-bit color or type a `#RRGGBB` code
                </div>
              </div>

              <input
                type="text"
                value={hexDraft}
                maxLength={7}
                onChange={(e) => {
                  const val = e.target.value.toUpperCase()
                  setHexDraft(val)
                  const rgb = hexToRgb(val)
                  if (rgb) {
                    void handleUpdateConfig({
                      lightbarR: rgb.r,
                      lightbarG: rgb.g,
                      lightbarB: rgb.b,
                    })
                  }
                }}
                className="w-24 rounded-xl border border-border bg-surface px-2.5 py-1.5 text-center font-mono text-xs font-extrabold text-text"
              />
            </div>

            {/* Individual R / G / B 0..255 Fine Sliders */}
            <div className="space-y-2.5 rounded-2xl border border-border bg-surface-raised/50 p-3.5">
              <div>
                <div className="flex justify-between text-[11px] font-bold">
                  <span className="text-rose-500">Red (R)</span>
                  <span className="font-mono text-text">{cfg?.lightbarR ?? 0}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={255}
                  value={cfg?.lightbarR ?? 0}
                  onChange={(e) => handleUpdateConfig({ lightbarR: Number(e.target.value) })}
                  className="w-full accent-rose-500 cursor-pointer"
                />
              </div>
              <div>
                <div className="flex justify-between text-[11px] font-bold">
                  <span className="text-emerald-500">Green (G)</span>
                  <span className="font-mono text-text">{cfg?.lightbarG ?? 112}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={255}
                  value={cfg?.lightbarG ?? 112}
                  onChange={(e) => handleUpdateConfig({ lightbarG: Number(e.target.value) })}
                  className="w-full accent-emerald-500 cursor-pointer"
                />
              </div>
              <div>
                <div className="flex justify-between text-[11px] font-bold">
                  <span className="text-blue-500">Blue (B)</span>
                  <span className="font-mono text-text">{cfg?.lightbarB ?? 255}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={255}
                  value={cfg?.lightbarB ?? 255}
                  onChange={(e) => handleUpdateConfig({ lightbarB: Number(e.target.value) })}
                  className="w-full accent-blue-500 cursor-pointer"
                />
              </div>
            </div>

            {/* Quick Studio Swatches */}
            <div className="flex flex-wrap gap-1.5">
              {[
                { name: 'PS5 Blue', r: 0, g: 112, b: 255 },
                { name: 'Xbox Green', r: 16, g: 185, b: 129 },
                { name: 'Cyber Cyan', r: 0, g: 240, b: 255 },
                { name: 'Neon Rose', r: 244, g: 63, b: 94 },
                { name: 'Royal Violet', r: 168, g: 85, b: 247 },
                { name: 'Solar Gold', r: 245, g: 158, b: 11 },
                { name: 'Pure White', r: 255, g: 255, b: 255 },
              ].map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() =>
                    handleUpdateConfig({
                      lightbarR: preset.r,
                      lightbarG: preset.g,
                      lightbarB: preset.b,
                    })
                  }
                  className="flex items-center gap-1.5 rounded-xl border border-border bg-surface-raised px-2.5 py-1.5 text-[11px] font-bold text-text hover:border-accent/50 cursor-pointer"
                >
                  <span
                    className="size-2.5 rounded-full border border-black/20"
                    style={{ backgroundColor: `rgb(${preset.r},${preset.g},${preset.b})` }}
                  />
                  {preset.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 2. Touchpad Mouse Mode & Adaptive Triggers (L2 / R2) */}
        <div className="rounded-3xl border border-border bg-surface/90 p-5 shadow-xs">
          <div className="mb-4 flex items-center gap-2 border-b border-border/60 pb-3">
            <Sliders className="size-4 text-accent" />
            <h3 className="text-xs font-black uppercase tracking-wider text-text">
              Touchpad Mouse &amp; Adaptive Triggers
            </h3>
          </div>

          <div className="space-y-3.5 text-xs">
            <label className="flex items-center justify-between rounded-2xl border border-border bg-surface-raised/70 p-3 cursor-pointer">
              <div>
                <div className="font-extrabold text-text">
                  PS5 Touchpad as Windows Mouse (When Active)
                </div>
                <div className="text-[10px] text-muted">
                  Slide finger to move cursor • Left side = Left Click • Right side = Right Click
                </div>
              </div>
              <input
                type="checkbox"
                checked={cfg?.touchpadMouseEnabled ?? true}
                onChange={(e) => handleUpdateConfig({ touchpadMouseEnabled: e.target.checked })}
                className="size-4 accent-emerald-600"
              />
            </label>

            <div className="rounded-2xl border border-border bg-surface-raised/50 p-3">
              <div className="mb-1 flex justify-between font-bold">
                <span className="text-muted">Touchpad Mouse Sensitivity</span>
                <span className="font-mono text-accent">
                  {cfg?.touchpadMouseSensitivity ?? 100}%
                </span>
              </div>
              <input
                type="range"
                min={25}
                max={250}
                value={cfg?.touchpadMouseSensitivity ?? 100}
                onChange={(e) =>
                  handleUpdateConfig({ touchpadMouseSensitivity: Number(e.target.value) })
                }
                className="w-full accent-blue-600 cursor-pointer"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block font-bold text-muted">L2 Adaptive Mode</label>
                <select
                  value={cfg?.leftTriggerEffect ?? 'None'}
                  onChange={(e) => handleUpdateConfig({ leftTriggerEffect: e.target.value })}
                  className="w-full rounded-xl border border-border bg-surface-raised px-3 py-2 font-bold text-text"
                >
                  <option value="None">None (Linear)</option>
                  <option value="Rigid">Rigid (Heavy)</option>
                  <option value="Pulse">Pulse (Lock)</option>
                  <option value="FullClick">FullClick (Weapon)</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block font-bold text-muted">R2 Adaptive Mode</label>
                <select
                  value={cfg?.rightTriggerEffect ?? 'None'}
                  onChange={(e) => handleUpdateConfig({ rightTriggerEffect: e.target.value })}
                  className="w-full rounded-xl border border-border bg-surface-raised px-3 py-2 font-bold text-text"
                >
                  <option value="None">None (Linear)</option>
                  <option value="Rigid">Rigid (Heavy)</option>
                  <option value="Pulse">Pulse (Lock)</option>
                  <option value="FullClick">FullClick (Weapon)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-border bg-surface-raised/50 p-3">
                <div className="mb-1 flex justify-between font-bold">
                  <span className="text-muted">LS Deadzone</span>
                  <span className="font-mono text-accent">{cfg?.leftDeadzone ?? 8}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={48}
                  value={cfg?.leftDeadzone ?? 8}
                  onChange={(e) => handleUpdateConfig({ leftDeadzone: Number(e.target.value) })}
                  className="w-full accent-blue-600"
                />
              </div>
              <div className="rounded-2xl border border-border bg-surface-raised/50 p-3">
                <div className="mb-1 flex justify-between font-bold">
                  <span className="text-muted">RS Deadzone</span>
                  <span className="font-mono text-accent">{cfg?.rightDeadzone ?? 8}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={48}
                  value={cfg?.rightDeadzone ?? 8}
                  onChange={(e) => handleUpdateConfig({ rightDeadzone: Number(e.target.value) })}
                  className="w-full accent-blue-600"
                />
              </div>
            </div>
          </div>
        </div>

        {/* 3. ViGEmBus / HidHide Kernel Driver Status & Engine Logs */}
        <div className="rounded-3xl border border-border bg-surface/90 p-5 shadow-xs">
          <div className="mb-4 flex items-center justify-between border-b border-border/60 pb-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-emerald-500" />
              <h3 className="text-xs font-black uppercase tracking-wider text-text">
                Cloaking &amp; Kernel Driver Telemetry
              </h3>
            </div>
            <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-500">
              XUSB Pkts: {xb?.packetsSent ?? 0}
            </span>
          </div>

          <label className="mb-3 flex items-center justify-between rounded-2xl border border-border bg-surface-raised/70 p-3 text-xs cursor-pointer">
            <div>
              <div className="font-extrabold text-text">Cloak PS5 Controller When Active</div>
              <div className="text-[10px] text-muted">
                Locks DualSense in Exclusive Mode / HidHide so games only see Xbox 360
              </div>
            </div>
            <input
              type="checkbox"
              checked={cfg?.hidePs5Controller ?? true}
              onChange={(e) => handleUpdateConfig({ hidePs5Controller: e.target.checked })}
              className="size-4 accent-emerald-600"
            />
          </label>

          <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center justify-between rounded-xl border border-border bg-surface-raised/70 px-3 py-2">
              <div>
                <div className="font-extrabold text-text">ViGEmBus</div>
                <div className="text-[10px] text-muted">
                  {drv?.vigembusInstalled ? 'Driver Ready' : 'Not Installed'}
                </div>
              </div>
              {!drv?.vigembusInstalled && (
                <button
                  type="button"
                  onClick={() => handleInstallDriver('vigembus')}
                  className="rounded-lg bg-accent px-2.5 py-1 text-[10px] font-bold text-white cursor-pointer"
                >
                  Install
                </button>
              )}
            </div>

            <div className="flex items-center justify-between rounded-xl border border-border bg-surface-raised/70 px-3 py-2">
              <div>
                <div className="font-extrabold text-text">HidHide / Excl</div>
                <div className="text-[10px] text-muted">
                  {drv?.hidhideInstalled ? 'HidHide Active' : 'HID Exclusive'}
                </div>
              </div>
              {!drv?.hidhideInstalled && (
                <button
                  type="button"
                  onClick={() => handleInstallDriver('hidhide')}
                  className="rounded-lg border border-border bg-surface px-2.5 py-1 text-[10px] font-bold text-text cursor-pointer"
                >
                  Install
                </button>
              )}
            </div>
          </div>

          <div className="h-32 overflow-y-auto rounded-2xl border border-border bg-surface-raised/85 p-3 font-mono text-[10px] leading-relaxed text-muted">
            <div className="mb-1.5 flex items-center gap-1.5 text-accent font-extrabold">
              <Terminal className="size-3.5" />
              <span>DS4Windows Multi-Controller Runtime Log</span>
            </div>
            {(drv?.logs ?? []).map((line, i) => (
              <div key={i} className="truncate text-text/85">
                {line}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function StickTesterPad({
  title,
  rawX,
  rawY,
  xinputX,
  xinputY,
  emulationActive,
  onMove,
}: {
  title: string
  rawX: number
  rawY: number
  xinputX: number
  xinputY: number
  emulationActive: boolean
  onMove: (x: number, y: number) => void
}) {
  const padRef = useRef<HTMLDivElement | null>(null)
  const [dragging, setDragging] = useState(false)

  const updateFromEvent = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!padRef.current) return
    const rect = padRef.current.getBoundingClientRect()
    const cx = rect.width / 2
    const cy = rect.height / 2
    const dx = e.clientX - rect.left - cx
    const dy = e.clientY - rect.top - cy
    const maxR = cx - 10
    const dist = Math.hypot(dx, dy)
    const clampedDist = Math.min(dist, maxR)
    const angle = Math.atan2(dy, dx)
    const finalX = dist > 0 ? Math.cos(angle) * clampedDist : 0
    const finalY = dist > 0 ? Math.sin(angle) * clampedDist : 0

    const normX = Math.max(0, Math.min(255, Math.round(128 + (finalX / maxR) * 127)))
    const normY = Math.max(0, Math.min(255, Math.round(128 + (finalY / maxR) * 127)))
    onMove(normX, normY)
  }

  const dotX = ((rawX - 128) / 127) * 40
  const dotY = ((rawY - 128) / 127) * 40

  return (
    <div className="flex flex-col items-center justify-between rounded-2xl border border-border bg-surface-raised/70 p-3.5">
      <div className="mb-2 text-[11px] font-extrabold text-text">{title}</div>
      <div
        ref={padRef}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          setDragging(true)
          updateFromEvent(e)
        }}
        onPointerMove={(e) => {
          if (dragging) updateFromEvent(e)
        }}
        onPointerUp={() => {
          setDragging(false)
          onMove(128, 128)
        }}
        className="relative flex size-28 items-center justify-center rounded-full border-2 border-border bg-surface shadow-inner cursor-crosshair select-none touch-none"
      >
        <div className="pointer-events-none absolute inset-3 rounded-full border border-dashed border-border/70" />
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-border/80" />
        <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-border/80" />
        <div
          className={`pointer-events-none size-5 rounded-full border-2 border-white shadow-md transition-transform duration-75 ${
            emulationActive ? 'bg-emerald-500' : 'bg-accent'
          }`}
          style={{
            transform: `translate(${dotX}px, ${dotY}px)`,
          }}
        />
      </div>
      <div className="mt-2.5 text-center font-mono text-[10px] text-muted">
        {emulationActive ? (
          <span>
            XInput: <strong className="text-emerald-500">{xinputX}</strong> ,{' '}
            <strong className="text-emerald-500">{xinputY}</strong>
          </span>
        ) : (
          <span>
            HID: <strong className="text-accent">{rawX}</strong> ,{' '}
            <strong className="text-accent">{rawY}</strong>
          </span>
        )}
      </div>
    </div>
  )
}

function TouchpadMouseTesterPad({
  touchX,
  touchY,
  touchActive,
  leftClick,
  rightClick,
  emulationActive,
  onInput,
}: {
  touchX: number
  touchY: number
  touchActive: boolean
  leftClick: boolean
  rightClick: boolean
  emulationActive: boolean
  onInput: (active: boolean, x: number, y: number, clicked: boolean) => void
}) {
  const padRef = useRef<HTMLDivElement | null>(null)
  const [dragging, setDragging] = useState(false)
  const [clicked, setClicked] = useState(false)

  const updateFromPointer = (
    e: React.PointerEvent<HTMLDivElement>,
    isActive: boolean,
    isClicked: boolean,
  ) => {
    if (!padRef.current) return
    const rect = padRef.current.getBoundingClientRect()
    const rx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const ry = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))
    onInput(isActive, Math.round(rx * 1920), Math.round(ry * 1080), isClicked)
  }

  return (
    <div className="flex flex-col items-center justify-between rounded-2xl border border-border bg-surface-raised/70 p-3.5">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-extrabold text-text">
        <MousePointerClick className="size-3.5 text-accent" />
        <span>PS5 Touchpad Mouse</span>
      </div>

      <div
        ref={padRef}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          setDragging(true)
          const isClick = e.button === 2
          setClicked(isClick)
          updateFromPointer(e, true, isClick)
        }}
        onPointerMove={(e) => {
          if (dragging) updateFromPointer(e, true, clicked)
        }}
        onPointerUp={() => {
          setDragging(false)
          setClicked(false)
          onInput(false, 960, 540, false)
        }}
        onContextMenu={(e) => e.preventDefault()}
        className="relative h-20 w-full overflow-hidden rounded-xl border-2 border-border bg-surface shadow-inner cursor-crosshair select-none touch-none"
      >
        <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px border-l border-dashed border-accent/50" />
        <div
          className={`pointer-events-none absolute inset-y-0 left-0 w-1/2 flex items-end justify-center pb-1.5 text-[9px] font-mono font-extrabold transition ${
            leftClick ? 'bg-emerald-500/30 text-emerald-500' : 'text-subtle'
          }`}
        >
          L-CLICK
        </div>
        <div
          className={`pointer-events-none absolute inset-y-0 right-0 w-1/2 flex items-end justify-center pb-1.5 text-[9px] font-mono font-extrabold transition ${
            rightClick ? 'bg-amber-500/30 text-amber-500' : 'text-subtle'
          }`}
        >
          R-CLICK
        </div>

        {(touchActive || dragging) && (
          <div
            className="pointer-events-none absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-accent shadow-md"
            style={{
              left: `${(touchX / 1920) * 100}%`,
              top: `${(touchY / 1080) * 100}%`,
            }}
          />
        )}
      </div>

      {/* Explicit Left Click / Right Click Touchpad Test Buttons */}
      <div className="mt-2 grid w-full grid-cols-2 gap-1.5">
        <button
          type="button"
          onPointerDown={() => onInput(true, 450, 540, true)}
          onPointerUp={() => onInput(false, 960, 540, false)}
          onPointerLeave={() => onInput(false, 960, 540, false)}
          className={`rounded-lg border py-1 font-mono text-[10px] font-extrabold transition cursor-pointer ${
            leftClick
              ? 'border-emerald-500 bg-emerald-500 text-white'
              : 'border-border bg-surface text-muted hover:text-text'
          }`}
        >
          Left Click
        </button>
        <button
          type="button"
          onPointerDown={() => onInput(true, 1450, 540, true)}
          onPointerUp={() => onInput(false, 960, 540, false)}
          onPointerLeave={() => onInput(false, 960, 540, false)}
          className={`rounded-lg border py-1 font-mono text-[10px] font-extrabold transition cursor-pointer ${
            rightClick
              ? 'border-amber-500 bg-amber-500 text-white'
              : 'border-border bg-surface text-muted hover:text-text'
          }`}
        >
          Right Click
        </button>
      </div>

      <div className="mt-1 text-center font-mono text-[9px] font-bold text-subtle">
        {emulationActive ? 'Mouse Mode ACTIVE' : 'Activate to enable Mouse'}
      </div>
    </div>
  )
}
