# Nexus Console Mode (Big Picture) — User & Developer Guide

## 1. Entering & Exiting Console Mode
- **Top Bar**: Click the **Console Mode** TV/Gamepad button in the top-right bar of Desktop Mode.
- **Keyboard Shortcut**: Press `Ctrl + Alt + Enter` (or `F11`) at any time.
- **Gamepad Shortcut**: Hold the **Guide / PS** button (or **Back + Start**) for **1.5 seconds**.
- **Command Line**: Launch with `nexus.exe --console`. If Nexus is already running, the existing instance automatically switches to Console Mode.
- **Exiting**: Hold **B / Circle** on the Home screen, or open the **Power** tab and choose **Exit to Desktop Mode**.

## 2. Controller Layouts & Regional Preferences
- **Automatic Glyph Detection**: Button prompts automatically adapt between **PlayStation** (`Cross`, `Circle`, `Square`, `Triangle`, `L1/R1`, `L2/R2`), **Xbox** (`A`, `B`, `X`, `Y`, `LB/RB`, `LT/RT`), **Switch** (`B`, `A`, `Y`, `X`), and **Keyboard** (`Enter`, `Esc`, `Tab`, `Arrows`).
- **Manual Override**: Under **Settings → Controller → Button Prompts**, you can lock glyphs to PlayStation, Xbox, Switch, or Auto.
- **Confirm / Back Swap**: Toggle **Swap Confirm & Back (East / South)** in **Settings → Controller** for Japanese/Asian console layout preference.

## 3. In-Game Quick Menu & Windows Game Bar Coexistence
- Pressing the **Guide (Xbox)** or **PS** button during gameplay opens the **Nexus Quick Menu** overlay on top of your borderless/windowed game.
- **Windows Game Bar Note**: Windows 10/11 enables "Open Xbox Game Bar using this button on a controller" by default. If Xbox Game Bar intercepts the Guide button, you can either:
  1. Use the built-in fallback chord: **Hold Back (Select/Create) + Start (Options) for 1 second** (enabled by default), or
  2. Disable the Game Bar controller shortcut in **Windows Settings → Gaming → Xbox Game Bar**.
- **Anti-Cheat Safety**: The Guide listener uses read-only controller state polling (`XInput` / `HID`) and renders inside Nexus's desktop overlay window. It never injects DLLs, hooks DirectX/Vulkan, or reads game process memory, making it 100% safe alongside kernel anti-cheat systems (EasyAntiCheat, BattlEye, Ricochet, Vanguard).

## 4. Edge Cases & Troubleshooting
- **UAC / Elevation Prompts**: Windows displays User Account Control (UAC) dialogs on the Secure Desktop, which blocks non-system applications from reading controller input. If a game installer or first-time redistributable triggers UAC, approve it with mouse/keyboard once.
- **Exclusive Fullscreen Games**: Games running in legacy Exclusive Fullscreen bypass the Windows Desktop Window Manager (DWM). If the overlay cannot appear on top of an exclusive-fullscreen game, use the Quick Menu's **Switch to Nexus** action or configure the game to use **Borderless Windowed** mode.
