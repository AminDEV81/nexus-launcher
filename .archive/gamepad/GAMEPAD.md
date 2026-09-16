# Universal Gamepad Subsystem — Nexus Launcher

## 1. Overview & Architecture

Nexus Launcher includes a universal, modular, and brand-agnostic Gamepad subsystem built directly on top of the W3C Gamepad API in WebView2 (Chromium on Windows).

```text
src/features/gamepad/
├── types/                 # Strong TypeScript contracts
│   ├── gamepad.ts         # GamepadInfo, StandardGamepadInput, GamepadSettings
│   └── profiles.ts        # GamepadProfile interface
├── constants/             # Vendor IDs, standard mappings, default profiles
├── utils/                 # Pure helper functions
│   ├── identification.ts  # Hardware ID parser & controller categorization
│   ├── deadzone.ts        # True radial deadzone & analog trigger scaling
│   ├── input-normalizer.ts# Raw Gamepad -> StandardGamepadInput
│   └── haptics.ts         # Safe dual-rumble execution with feature detection
├── core/                  # Engine logic
│   ├── gamepad-manager.ts # Polling lifecycle, hotplug, primary controller
│   └── profile-registry.ts# Profile registration and resolution
├── store/                 # Zustand store (persisted settings + memory state)
├── hooks/                 # React hooks (useGamepad, useGamepadLifecycle)
└── components/            # UI components (Glyphs, Cards, Visualizer, Panel)
```

> **Scope Note:** Big Picture Mode, TV Mode, fullscreen controller UI, and controller-driven launcher navigation are explicitly out of scope for this subsystem. The Gamepad system serves as resilient infrastructure for controller detection, testing, calibration, and future features.

---

## 2. Supported Controllers

The subsystem identifies and abstracts the following hardware categories:

1. **PlayStation DualSense & DualSense Edge:**
   - Vendor ID: `054c`, Product IDs: `0ce6`, `0df2`.
   - Full mapping of Cross, Circle, Square, Triangle, L1/R1, L2/R2, L3/R3, D-Pad, Create/Options, Touchpad click (when exposed), and PS button (when exposed).
   - Standard dual-motor rumble supported where exposed by the OS/driver.
2. **PlayStation DualShock 4:**
   - Vendor ID: `054c`, Product IDs: `05c4`, `09cc`, `0ba0`.
   - Full standard mapping + haptics.
3. **Xbox Controllers (Xbox Series X|S, Xbox One, Xbox 360, Elite):**
   - Vendor ID: `045e`, Product IDs: `028e`, `02d1`, `02dd`, `02e3`, `0b12`, `0b13`, `0b20`, etc.
   - Standard XInput / W3C layout (A, B, X, Y, LB, RB, LT, RT, View, Menu, Xbox Guide).
4. **Generic & DirectInput USB/Bluetooth Controllers:**
   - Logitech, 8BitDo, generic arcade sticks, and retro USB gamepads.
   - Non-standard button/axis layouts are normalized via `GenericFallbackProfile`.
   - Unknown controllers gracefully fallback without crashing.

---

## 3. Standardized Input Abstraction

Application components interact exclusively with logical buttons and normalized analog values:

```ts
interface StandardGamepadButtons {
  south: boolean // A (Xbox) / Cross (PlayStation)
  east: boolean // B (Xbox) / Circle (PlayStation)
  west: boolean // X (Xbox) / Square (PlayStation)
  north: boolean // Y (Xbox) / Triangle (PlayStation)
  l1: boolean // LB / L1
  r1: boolean // RB / R1
  l3: boolean // Left stick click
  r3: boolean // Right stick click
  start: boolean // Menu / Options
  select: boolean // View / Share
  dpadUp: boolean
  dpadDown: boolean
  dpadLeft: boolean
  dpadRight: boolean
  home?: boolean // Guide / PS button
  touchpad?: boolean // DualSense / DualShock touchpad click
}

interface StandardGamepadAnalog {
  l2: number // 0.0 to 1.0
  r2: number // 0.0 to 1.0
  leftX: number // -1.0 to 1.0 (radial deadzone applied)
  leftY: number // -1.0 to 1.0
  rightX: number // -1.0 to 1.0
  rightY: number // -1.0 to 1.0
}
```

---

## 4. Radial Deadzone Calibration

Rather than axial deadzones (which clip X and Y independently, causing diagonal pinching and box-shaped deadzones), the subsystem uses **radial deadzone mathematics**:

$$\text{magnitude} = \sqrt{x^2 + y^2}$$

1. If $\text{magnitude} \le \text{deadzone}$, returns $(0, 0)$.
2. If $\text{magnitude} > \text{deadzone}$, rescales remaining distance smoothly:
   $$\text{scaledMagnitude} = \frac{\text{magnitude} - \text{deadzone}}{1 - \text{deadzone}}$$
   $$\text{normX} = \frac{x}{\text{magnitude}} \times \text{scaledMagnitude}, \quad \text{normY} = \frac{y}{\text{magnitude}} \times \text{scaledMagnitude}$$

Configurable independently in Settings:

- **Left Stick Deadzone:** 0% to 40% (default: 12%)
- **Right Stick Deadzone:** 0% to 40% (default: 12%)
- **Trigger Deadzone:** 0% to 30% (default: 5%)
- **Trigger Threshold:** 10% to 90% (default: 35%)

---

## 5. Haptics / Rumble

- Uses standard `gamepad.vibrationActuator.playEffect('dual-rumble', ...)` with fallback to `hapticActuators[0].pulse()`.
- Guaranteed crash-proof: all actuator calls are wrapped in defensive `try/catch` handlers with promise rejection handling.
- Gracefully returns `false` if unsupported by hardware or disabled by user preference.

---

## 6. How to Add a Custom Controller Profile

To add support for specialized hardware (e.g., flight sticks, steering wheels, or retro converters):

```ts
import { profileRegistry, type GamepadProfile, type GamepadSettings } from '@/features/gamepad'

const FlightStickProfile: GamepadProfile = {
  id: 'flight-stick-custom',
  name: 'HOTAS Flight Stick',
  type: 'generic',
  matches: (gamepad: Gamepad) => gamepad.id.includes('HOTAS FlightStick'),
  normalize: (gamepad: Gamepad, settings: GamepadSettings) => {
    // Custom button/axis mapping logic...
    return {
      buttons: {/* ... */},
      analog: {/* ... */},
    }
  },
}

// Register profile (takes precedence over default profiles)
profileRegistry.register(FlightStickProfile)
```

---

## 7. Known Platform & Browser Limitations

1. **Vendor/Product IDs:** Not all browser versions or Bluetooth stacks expose `Vendor: xxxx Product: yyyy`. The identification engine treats ID extraction as best-effort, falling back to name heuristics and generic profiles.
2. **DualSense Adaptive Triggers & HD Audio Haptics:** Standard Web Gamepad API does not expose Sony's proprietary USB HID feature reports for adaptive resistance motors without specialized native C++/Rust drivers. As specified in requirements, standard dual-rumble is used instead.
3. **Bluetooth on Windows:** Certain older Bluetooth drivers for DualShock 4 / DualSense report different button indices compared to USB wired connections. The normalizer handles both standard W3C mapping and DirectInput fallbacks.

---

## 8. Manual Testing Procedure

1. Launch Nexus Launcher:
   ```bash
   npm run tauri dev
   ```
2. Navigate to **Settings -> Preferences -> Gamepad**.
3. **Connection Test:** Plug in your controller via USB or Bluetooth. The card appears immediately without restarting the application.
4. **Hardware Tester:** Move both analog sticks and press buttons. Verify smooth circular movement and instant button illumination.
5. **Vibration Test:** Click "Test Rumble". A brief vibration pulse fires on supported controllers.
6. **Calibration Test:** Adjust stick deadzones and verify that resting sticks read strictly `X: 0.00 Y: 0.00`.
