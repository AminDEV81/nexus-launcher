import type { GamepadInfo, RumbleOptions, StandardGamepadInput } from '../types/gamepad'
import { parseGamepadInfo } from '../utils/identification'
import { profileRegistry } from './profile-registry'
import { triggerRumble } from '../utils/haptics'
import { useGamepadStore } from '../store/gamepad-store'
import { queryGamepadBattery } from '../utils/battery'
import { gamepadNavigator } from './gamepad-navigator'

export type GamepadInputListener = (input: StandardGamepadInput, info: GamepadInfo) => void
export type GamepadConnectionListener = (info: GamepadInfo, connected: boolean) => void

export class GamepadManager {
  private static instance: GamepadManager | null = null

  private isInitialized = false
  private isPolling = false
  private animFrameId: number | null = null
  private fallbackTimerId: ReturnType<typeof setInterval> | null = null
  private batteryTimerId: ReturnType<typeof setInterval> | null = null

  private latestInputs = new Map<number, StandardGamepadInput>()
  private inputListeners = new Set<GamepadInputListener>()
  private connectionListeners = new Set<GamepadConnectionListener>()

  // Keep track of active controller input thresholds
  private lastActivityCheckTimestamp = 0

  private constructor() {}

  public static getInstance(): GamepadManager {
    if (typeof window !== 'undefined') {
      const globalWindow = window as unknown as { __nexus_gamepad_manager__?: GamepadManager }
      if (globalWindow.__nexus_gamepad_manager__) {
        GamepadManager.instance = globalWindow.__nexus_gamepad_manager__
      }
    }

    if (!GamepadManager.instance) {
      GamepadManager.instance = new GamepadManager()
      if (typeof window !== 'undefined') {
        const globalWindow = window as unknown as { __nexus_gamepad_manager__?: GamepadManager }
        globalWindow.__nexus_gamepad_manager__ = GamepadManager.instance
      }
    }
    return GamepadManager.instance
  }

  /**
   * Initializes the manager: attaches native DOM events and sets up fallback polling.
   * Safe to call multiple times (idempotent).
   */
  public initialize(): void {
    if (this.isInitialized || typeof window === 'undefined') {
      return
    }

    this.isInitialized = true

    window.addEventListener('gamepadconnected', this.handleGamepadConnected)
    window.addEventListener('gamepaddisconnected', this.handleGamepadDisconnected)

    // Initial controller scan
    this.refreshControllers()

    // Secondary fallback poll for browsers where initial gamepadconnected event
    // is delayed until first user button press
    this.fallbackTimerId = setInterval(() => {
      this.refreshControllers()
    }, 2000)

    // Low-frequency battery refresh (every 3.5s)
    this.batteryTimerId = setInterval(() => {
      void this.refreshBatteries()
    }, 3500)
    void this.refreshBatteries()
  }

  /**
   * Starts the requestAnimationFrame polling loop if enabled and controllers exist.
   * Idempotent: safe to call repeatedly.
   */
  public start(): void {
    if (this.isPolling || typeof window === 'undefined') {
      return
    }

    const { settings, controllers } = useGamepadStore.getState()
    if (!settings.enabled || controllers.length === 0) {
      return
    }

    this.isPolling = true
    this.animFrameId = requestAnimationFrame(this.pollFrame)
  }

  /**
   * Stops the polling loop immediately.
   */
  public stop(): void {
    if (!this.isPolling) {
      return
    }

    this.isPolling = false
    if (this.animFrameId !== null && typeof window !== 'undefined') {
      cancelAnimationFrame(this.animFrameId)
      this.animFrameId = null
    }
  }

  /**
   * Cleans up all listeners, intervals, and stops polling.
   */
  public destroy(): void {
    this.stop()

    if (this.fallbackTimerId !== null) {
      clearInterval(this.fallbackTimerId)
      this.fallbackTimerId = null
    }

    if (this.batteryTimerId !== null) {
      clearInterval(this.batteryTimerId)
      this.batteryTimerId = null
    }

    if (typeof window !== 'undefined') {
      window.removeEventListener('gamepadconnected', this.handleGamepadConnected)
      window.removeEventListener('gamepaddisconnected', this.handleGamepadDisconnected)
    }

    this.inputListeners.clear()
    this.connectionListeners.clear()
    this.latestInputs.clear()
    this.isInitialized = false
  }

  /**
   * Returns standard input abstraction for a controller by index.
   */
  public getInput(index: number): StandardGamepadInput | null {
    return this.latestInputs.get(index) ?? null
  }

  /**
   * Subscribes a listener to receive input updates on every active frame.
   * Returns an unsubscribe function.
   */
  public subscribeInput(listener: GamepadInputListener): () => void {
    this.inputListeners.add(listener)
    return () => {
      this.inputListeners.delete(listener)
    }
  }

  /**
   * Subscribes a listener to controller connection/disconnection events.
   */
  public subscribeConnection(listener: GamepadConnectionListener): () => void {
    this.connectionListeners.add(listener)
    return () => {
      this.connectionListeners.delete(listener)
    }
  }

  /**
   * Triggers a rumble effect on a controller (defaults to primary controller).
   */
  public async rumble(options: RumbleOptions = {}, targetIndex?: number): Promise<boolean> {
    const store = useGamepadStore.getState()
    if (!store.settings.rumbleEnabled) {
      return false
    }

    const gamepads = this.getRawGamepads()
    let targetPad: Gamepad | null = null

    if (typeof targetIndex === 'number') {
      targetPad = gamepads.find((p) => p && p.index === targetIndex) ?? null
    } else {
      targetPad = this.getPrimaryRawGamepad()
    }

    if (!targetPad) {
      return false
    }

    return triggerRumble(targetPad, options, store.settings.rumbleEnabled)
  }

  /**
   * Returns the primary raw Gamepad.
   */
  public getPrimaryRawGamepad(): Gamepad | null {
    const store = useGamepadStore.getState()
    const gamepads = this.getRawGamepads()

    if (store.primaryControllerId) {
      const found = gamepads.find((g) => g && g.id === store.primaryControllerId)
      if (found) return found
    }

    // Default to first active controller
    return gamepads.find((g) => g !== null && g.connected) ?? null
  }

  /**
   * Returns the primary GamepadInfo record.
   */
  public getPrimaryGamepadInfo(): GamepadInfo | null {
    const store = useGamepadStore.getState()
    if (store.primaryControllerId) {
      const found = store.controllers.find((c) => c.id === store.primaryControllerId)
      if (found) return found
    }
    return store.controllers[0] ?? null
  }

  /**
   * Reads raw browser gamepads defensively.
   */
  public getRawGamepads(): (Gamepad | null)[] {
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') {
      return []
    }
    try {
      const pads = navigator.getGamepads()
      return pads ? Array.from(pads) : []
    } catch {
      return []
    }
  }

  /**
   * Scans connected gamepads and synchronizes store state.
   */
  public refreshControllers(): void {
    const rawPads = this.getRawGamepads().filter((p): p is Gamepad => p !== null && p.connected)
    const infos = rawPads.map((p) => parseGamepadInfo(p))

    const store = useGamepadStore.getState()
    const prevControllers = store.controllers

    // Detect if controller list actually changed (by IDs & connection states)
    const hasChanged =
      prevControllers.length !== infos.length ||
      infos.some(
        (info, i) =>
          prevControllers[i]?.id !== info.id || prevControllers[i]?.connected !== info.connected,
      )

    if (hasChanged) {
      store.setControllers(infos)

      // Re-evaluate primary controller
      this.evaluatePrimaryController(infos)

      // Start/stop polling loop based on controller availability
      if (infos.length > 0 && store.settings.enabled) {
        this.start()
      } else {
        this.stop()
      }
    }
  }

  private evaluatePrimaryController(connectedPads: GamepadInfo[]): void {
    const store = useGamepadStore.getState()
    const currentPrimaryId = store.primaryControllerId

    if (connectedPads.length === 0) {
      if (currentPrimaryId !== null) {
        store.setPrimaryControllerId(null)
      }
      return
    }

    // 1. User preferred primary controller is still connected?
    const preferredId = store.settings.primaryControllerId
    if (preferredId && connectedPads.some((p) => p.id === preferredId)) {
      if (currentPrimaryId !== preferredId) {
        store.setPrimaryControllerId(preferredId)
      }
      return
    }

    // 2. Current primary still connected?
    if (currentPrimaryId && connectedPads.some((p) => p.id === currentPrimaryId)) {
      return
    }

    // 3. Fallback to first available controller
    store.setPrimaryControllerId(connectedPads[0].id)
  }

  private handleGamepadConnected = (event: GamepadEvent): void => {
    this.refreshControllers()
    if (event.gamepad) {
      const info = parseGamepadInfo(event.gamepad)
      for (const listener of this.connectionListeners) {
        listener(info, true)
      }
    }
  }

  private handleGamepadDisconnected = (event: GamepadEvent): void => {
    if (event.gamepad) {
      this.latestInputs.delete(event.gamepad.index)
      const info = parseGamepadInfo(event.gamepad)
      for (const listener of this.connectionListeners) {
        listener(info, false)
      }
    }
    this.refreshControllers()
  }

  /**
   * Main per-frame polling loop.
   */
  private pollFrame = (timestamp: number): void => {
    if (!this.isPolling) {
      return
    }

    const { settings, controllers } = useGamepadStore.getState()
    if (!settings.enabled || controllers.length === 0) {
      this.stop()
      return
    }

    const rawPads = this.getRawGamepads()
    let detectedActivePadId: string | null = null
    const primaryInfo = this.getPrimaryGamepadInfo()
    let primaryNormalized: StandardGamepadInput | null = null

    for (const info of controllers) {
      const rawPad = rawPads[info.index]
      if (!rawPad || !rawPad.connected) continue

      // Resolve profile & normalize input
      const profile = profileRegistry.resolve(rawPad)
      const normalized = profile.normalize(rawPad, settings)

      this.latestInputs.set(rawPad.index, normalized)

      // Notify high-frequency input subscribers
      if (this.inputListeners.size > 0) {
        for (const listener of this.inputListeners) {
          listener(normalized, info)
        }
      }

      // Track normalized input of the designated primary controller
      if (primaryInfo && info.index === primaryInfo.index) {
        primaryNormalized = normalized
      }

      // Check for user activity on this gamepad
      if (this.hasMeaningfulInput(normalized)) {
        detectedActivePadId = info.id
      }
    }

    // Route primary controller input to navigator for UI navigation ONCE per frame
    if (primaryNormalized && settings.navigationEnabled) {
      gamepadNavigator.processInput(primaryNormalized, timestamp)
    }

    // Throttled activity detection update (every 100ms) to avoid unnecessary store writes
    if (
      detectedActivePadId &&
      detectedActivePadId !== useGamepadStore.getState().lastActiveControllerId &&
      timestamp - this.lastActivityCheckTimestamp > 100
    ) {
      this.lastActivityCheckTimestamp = timestamp
      useGamepadStore.getState().setLastActiveControllerId(detectedActivePadId)
    }

    // Schedule next frame
    this.animFrameId = requestAnimationFrame(this.pollFrame)
  }

  /**
   * Refreshes battery states of all connected controllers at a low frequency.
   */
  public async refreshBatteries(): Promise<void> {
    const store = useGamepadStore.getState()
    if (store.controllers.length === 0) return

    const rawPads = this.getRawGamepads()
    let hasChanged = false

    const updated = await Promise.all(
      store.controllers.map(async (info) => {
        const raw = rawPads[info.index]
        const newBattery = await queryGamepadBattery(info, raw)
        const prev = info.battery

        if (
          !prev ||
          prev.status !== newBattery.status ||
          prev.level !== newBattery.level ||
          prev.charging !== newBattery.charging ||
          prev.isWired !== newBattery.isWired
        ) {
          hasChanged = true
          return { ...info, battery: newBattery }
        }
        return info
      }),
    )

    if (hasChanged) {
      useGamepadStore.getState().setControllers(updated)
    }
  }

  /**
   * Checks whether the normalized input exceeds idle noise/drift threshold.
   */
  private hasMeaningfulInput(input: StandardGamepadInput): boolean {
    const { buttons, analog } = input

    // Check if any button is pressed
    if (
      buttons.south ||
      buttons.east ||
      buttons.west ||
      buttons.north ||
      buttons.l1 ||
      buttons.r1 ||
      buttons.l3 ||
      buttons.r3 ||
      buttons.start ||
      buttons.select ||
      buttons.dpadUp ||
      buttons.dpadDown ||
      buttons.dpadLeft ||
      buttons.dpadRight ||
      Boolean(buttons.home) ||
      Boolean(buttons.touchpad)
    ) {
      return true
    }

    // Check analog inputs (sticks and triggers)
    if (
      Math.abs(analog.leftX) > 0.15 ||
      Math.abs(analog.leftY) > 0.15 ||
      Math.abs(analog.rightX) > 0.15 ||
      Math.abs(analog.rightY) > 0.15 ||
      analog.l2 > 0.15 ||
      analog.r2 > 0.15
    ) {
      return true
    }

    return false
  }
}

export const gamepadManager = GamepadManager.getInstance()
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    gamepadManager.stop()
  })
}
