# Console Mode Input Architecture & DualSense / ViGEm Deduplication

## 1. The DualSense + ViGEm / HidHide Challenge
Nexus Launcher includes a built-in multi-controller DualSense engine (`src-tauri/src/commands/dualsense/`) that can:
1. Cloak the physical Sony DualSense controller from standard APIs via **HidHide**.
2. Spawn a virtual **Xbox 360 (XInput)** controller via **ViGEmBus**.

Consequently, depending on whether HidHide and ViGEm emulation are active, the Chromium WebView's `navigator.getGamepads()` may see:
- **Both** the physical DualSense (`054c:0ce6` / `054c:0df2`) AND the virtual Xbox 360 pad (`XInput STANDARD GAMEPAD`) for the same physical controller in the user's hands.
- **Only** the virtual Xbox 360 pad (when HidHide cloaks the physical HID device from WebView2).
- **Zero** browser gamepads (if exclusive HID mode or OS policy hides the device from Chromium).

## 2. Logical Player Deduplication Strategy
`InputManager` (`src/features/console/input/InputManager.ts`) resolves physical and virtual devices into unified **Logical Players (P1–P4)**:

1. **DualSense Engine Telemetry Sync**:
   - `InputManager` periodically queries `dualsense_get_state` (and listens to `console://input` / `console://guide` backend events).
   - If the DualSense engine reports `emulatingCount > 0` (meaning N physical DualSense controllers are actively mirrored onto N virtual Xbox 360 controllers) AND the browser sees both Sony (`054c`) pads and XInput pads:
     - Physical Sony pads in `navigator.getGamepads()` that correspond to an active emulated slot are marked as **shadowed duplicates** so a single button press never fires twice.
     - The active glyph family remains **PlayStation** (`cross`, `circle`, `square`, `triangle`) whenever a physical DualSense is connected in `DualSenseEngineState`, even when its input arrives via the virtual XInput pad!
2. **Backend HID Fallback (`console://input`)**:
   - When the Rust DualSense worker reads HID input reports from a connected DualSense and the browser sees 0 gamepads, the backend emits `console://input` state snapshots so Console Mode remains 100% responsive even if WebView2 Gamepad API is blocked or cloaked.

## 3. Analog Stick Hysteresis & Repeat Timing
- **Dead Zone**: Engage threshold `0.35`, release threshold `0.22` (radial hysteresis prevents boundary flutter).
- **45-Degree Directional Lock**: Dominant axis must exceed `1.25x` orthogonal axis magnitude to prevent accidental diagonal double-stepping.
- **Repeat Cadence**:
  - Initial press fires immediately (`t = 0 ms`).
  - Initial repeat delay: `400 ms`.
  - Standard repeat interval: `90 ms`.
  - Turbo repeat interval (after `1,200 ms` of continuous hold): `45 ms`.
- **Focus Ownership & Ghost-Input Guard**:
  - Polling is suspended whenever the Nexus window is unfocused or minimized (`!document.hasFocus()`), except inside the overlay window when the Quick Menu is open.
  - Upon regaining window focus (or closing the Quick Menu / exiting a game), a **400 ms swallow window** suppresses residual button releases so the last press inside a game never triggers a launcher action.
