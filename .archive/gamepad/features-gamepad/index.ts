// Types
export * from './types/gamepad'
export * from './types/profiles'
export * from './types/navigation'

// Constants
export * from './constants/standard-mappings'
export * from './constants/vendor-ids'
export * from './constants/default-profiles'

// Core & Utilities
export { gamepadManager, GamepadManager } from './core/gamepad-manager'
export { profileRegistry, ProfileRegistry } from './core/profile-registry'
export { gamepadNavigator, GamepadNavigator } from './core/gamepad-navigator'
export { gamepadFocusManager, GamepadFocusManager } from './core/gamepad-focus-manager'
export {
  gamepadActionDispatcher,
  GamepadActionDispatcher,
  setGamepadNavigate,
} from './core/gamepad-action-dispatcher'
export { resolveNavigationContext } from './core/gamepad-navigation-context'
export { parseGamepadInfo, identifyGamepadType, extractHardwareIds } from './utils/identification'
export { applyRadialDeadzone, applyTriggerDeadzone } from './utils/deadzone'
export { triggerRumble } from './utils/haptics'
export { normalizeStandardGamepad } from './utils/input-normalizer'
export { queryGamepadBattery } from './utils/battery'
export {
  isInDirectionCone,
  computeSpatialScore,
  findBestSpatialCandidate,
} from './utils/spatial-navigation'
export { InputRepeatController } from './utils/input-repeat'

// Store & Hooks
export { useGamepadStore } from './store/gamepad-store'
export { useGamepad } from './hooks/use-gamepad'
export { useGamepadLifecycle } from './hooks/use-gamepad-lifecycle'

// Components
export { ControllerGlyph } from './components/controller-glyph'
export { ControllerCard } from './components/controller-card'
export { ControllerVisualizer } from './components/controller-visualizer'
export { GamepadSettingsPanel } from './components/gamepad-settings-panel'
export { ControllerBatteryBadge } from './components/controller-battery-badge'
export { GamepadNavigationHud } from './components/gamepad-navigation-hud'
