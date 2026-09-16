import { useEffect } from 'react'
import { gamepadManager } from '../core/gamepad-manager'
import { gamepadNavigator } from '../core/gamepad-navigator'
import { useGamepadStore } from '../store/gamepad-store'

/**
 * Top-level application lifecycle hook for the Gamepad subsystem.
 * Mounts in App root to start event listeners and centralized polling.
 * Safe with React Strict Mode.
 */
export function useGamepadLifecycle(): void {
  const enabled = useGamepadStore((s) => s.settings.enabled)

  useEffect(() => {
    // 1. Initialize event listeners and scan hardware
    gamepadManager.initialize()
    gamepadNavigator.attachListeners()

    // 2. Start polling if enabled
    if (enabled) {
      gamepadManager.start()
    } else {
      gamepadManager.stop()
    }

    return () => {
      // In development React StrictMode, stop ensures no orphan loops run
      gamepadManager.stop()
      gamepadNavigator.detachListeners()
    }
  }, [enabled])

  // Clean up completely when app unmounts
  useEffect(() => {
    return () => {
      gamepadManager.destroy()
      gamepadNavigator.detachListeners()
    }
  }, [])
}
