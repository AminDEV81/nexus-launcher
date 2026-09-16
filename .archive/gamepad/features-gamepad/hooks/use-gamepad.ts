import { useCallback, useMemo } from 'react'
import { useGamepadStore } from '../store/gamepad-store'
import { gamepadManager } from '../core/gamepad-manager'
import type { GamepadInfo, RumbleOptions, StandardGamepadInput } from '../types/gamepad'

export function useGamepad() {
  const settings = useGamepadStore((s) => s.settings)
  const updateSettings = useGamepadStore((s) => s.updateSettings)
  const resetSettings = useGamepadStore((s) => s.resetSettings)

  const controllers = useGamepadStore((s) => s.controllers)
  const primaryControllerId = useGamepadStore((s) => s.primaryControllerId)
  const lastActiveControllerId = useGamepadStore((s) => s.lastActiveControllerId)

  const primaryController = useMemo<GamepadInfo | null>(() => {
    if (!primaryControllerId) return controllers[0] ?? null
    return controllers.find((c) => c.id === primaryControllerId) ?? controllers[0] ?? null
  }, [controllers, primaryControllerId])

  const lastActiveController = useMemo<GamepadInfo | null>(() => {
    if (!lastActiveControllerId) return primaryController
    return controllers.find((c) => c.id === lastActiveControllerId) ?? primaryController
  }, [controllers, lastActiveControllerId, primaryController])

  /**
   * Resolves effective glyph style ('xbox' | 'playstation')
   * taking into account user preference ('auto' | 'xbox' | 'playstation')
   * and current active/primary controller type.
   */
  const activeGlyphType = useMemo<'xbox' | 'playstation'>(() => {
    if (settings.glyphPreference === 'xbox') return 'xbox'
    if (settings.glyphPreference === 'playstation') return 'playstation'

    const targetType = lastActiveController?.type ?? primaryController?.type
    if (targetType === 'dualsense' || targetType === 'dualshock4') {
      return 'playstation'
    }
    return 'xbox'
  }, [settings.glyphPreference, lastActiveController, primaryController])

  const rumble = useCallback((options?: RumbleOptions, targetIndex?: number) => {
    return gamepadManager.rumble(options, targetIndex)
  }, [])

  const getInput = useCallback((index: number): StandardGamepadInput | null => {
    return gamepadManager.getInput(index)
  }, [])

  const setPrimary = useCallback(
    (id: string) => {
      updateSettings({ primaryControllerId: id })
      useGamepadStore.getState().setPrimaryControllerId(id)
    },
    [updateSettings],
  )

  return {
    settings,
    updateSettings,
    resetSettings,
    controllers,
    primaryController,
    lastActiveController,
    activeGlyphType,
    rumble,
    getInput,
    setPrimary,
  }
}
