import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { gamepadManager } from '../core/gamepad-manager'
import { useGamepadStore } from '../store/gamepad-store'
import { triggerRumble } from '../utils/haptics'
import { mockDualSense, mockXbox } from './fixtures'

describe('GamepadManager & Haptics Subsystem', () => {
  beforeEach(() => {
    useGamepadStore.getState().resetSettings()
    useGamepadStore.getState().setControllers([])
    useGamepadStore.getState().setPrimaryControllerId(null)
    gamepadManager.destroy()
  })

  afterEach(() => {
    gamepadManager.destroy()
    vi.restoreAllMocks()
  })

  it('initializes and stops cleanly without duplicate loops (idempotency)', () => {
    expect(() => {
      gamepadManager.initialize()
      gamepadManager.initialize() // Second call must be safe
      gamepadManager.start()
      gamepadManager.start() // Second call must be safe
      gamepadManager.stop()
      gamepadManager.stop()
    }).not.toThrow()
  })

  describe('Primary Controller Selection', () => {
    it('sets first active controller as primary when none explicitly chosen', () => {
      const pad1 = mockXbox({ index: 0, id: 'Xbox Pad 1' })
      const pad2 = mockDualSense({ index: 1, id: 'DualSense Pad 2' })

      vi.spyOn(gamepadManager, 'getRawGamepads').mockReturnValue([pad1, pad2])
      gamepadManager.refreshControllers()

      const store = useGamepadStore.getState()
      expect(store.controllers).toHaveLength(2)
      expect(store.primaryControllerId).toBe('Xbox Pad 1')
    })

    it('respects user-chosen primary controller across refreshes', () => {
      const pad1 = mockXbox({ index: 0, id: 'Xbox Pad 1' })
      const pad2 = mockDualSense({ index: 1, id: 'DualSense Pad 2' })

      useGamepadStore.getState().updateSettings({ primaryControllerId: 'DualSense Pad 2' })

      vi.spyOn(gamepadManager, 'getRawGamepads').mockReturnValue([pad1, pad2])
      gamepadManager.refreshControllers()

      expect(useGamepadStore.getState().primaryControllerId).toBe('DualSense Pad 2')
    })

    it('falls back to remaining controller when primary disconnects', () => {
      const pad1 = mockXbox({ index: 0, id: 'Xbox Pad 1' })
      const pad2 = mockDualSense({ index: 1, id: 'DualSense Pad 2' })

      vi.spyOn(gamepadManager, 'getRawGamepads').mockReturnValue([pad1, pad2])
      gamepadManager.refreshControllers()
      expect(useGamepadStore.getState().primaryControllerId).toBe('Xbox Pad 1')

      // Disconnect pad1
      vi.spyOn(gamepadManager, 'getRawGamepads').mockReturnValue([null, pad2])
      gamepadManager.refreshControllers()

      expect(useGamepadStore.getState().controllers).toHaveLength(1)
      expect(useGamepadStore.getState().primaryControllerId).toBe('DualSense Pad 2')
    })

    it('sets primary controller to null when all controllers disconnect', () => {
      const pad = mockXbox({ index: 0, id: 'Xbox Pad 1' })

      vi.spyOn(gamepadManager, 'getRawGamepads').mockReturnValue([pad])
      gamepadManager.refreshControllers()
      expect(useGamepadStore.getState().primaryControllerId).toBe('Xbox Pad 1')

      // Disconnect all
      vi.spyOn(gamepadManager, 'getRawGamepads').mockReturnValue([])
      gamepadManager.refreshControllers()

      expect(useGamepadStore.getState().controllers).toHaveLength(0)
      expect(useGamepadStore.getState().primaryControllerId).toBeNull()
    })
  })

  describe('Haptics / Rumble Handling', () => {
    it('returns false if rumble is disabled by user settings', async () => {
      const pad = mockXbox()
      const result = await triggerRumble(pad, {}, false)
      expect(result).toBe(false)
    })

    it('returns false if gamepad lacks vibration actuators', async () => {
      const pad = mockXbox()
      const result = await triggerRumble(pad, {}, true)
      expect(result).toBe(false)
    })

    it('calls playEffect and returns true when vibrationActuator is supported', async () => {
      const playEffectMock = vi.fn().mockResolvedValue('complete')
      const pad = mockXbox({
        vibrationActuator: {
          playEffect: playEffectMock,
        },
      } as unknown as Partial<Gamepad>)

      const result = await triggerRumble(pad, { duration: 150, strongMagnitude: 0.8 }, true)
      expect(result).toBe(true)
      expect(playEffectMock).toHaveBeenCalledWith(
        'dual-rumble',
        expect.objectContaining({
          duration: 150,
          strongMagnitude: 0.8,
        }),
      )
    })

    it('handles actuator exceptions gracefully without crashing', async () => {
      const playEffectMock = vi.fn().mockRejectedValue(new Error('Device disconnected'))
      const pad = mockXbox({
        vibrationActuator: {
          playEffect: playEffectMock,
        },
      } as unknown as Partial<Gamepad>)

      const result = await triggerRumble(pad, {}, true)
      expect(result).toBe(false)
    })
  })
})
