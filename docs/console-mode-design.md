# Nexus Launcher — Console Mode (Big Picture) Architecture & Design

## 1. Overview & Goals
Console Mode is a fullscreen, controller-first, 10-foot interface for Nexus Launcher designed for living-room TVs, handheld gaming PCs, and couch setups. It coexists with Desktop Mode inside the same Tauri binary with zero cold-start overhead on desktop routes (lazy-loaded under `/console/*`).

### Core Design Pillars
1. **100% Controller-First Flow**: Every workflow—selecting a Save Guardian profile, resuming or launching a game, browsing the 5,000-game virtualized library, searching with a bilingual (English + Persian) On-Screen Keyboard (OSK), managing downloads, playing game soundtracks, toggling Game Booster, opening the in-game Quick Menu via the Guide/PS button, and executing system power actions—works with a gamepad alone.
2. **Deterministic Spatial Navigation**: Focus is managed by a pure, unit-tested 2D spatial engine (`src/features/console/nav/spatial.ts`) with explicit `FocusScope` containers, per-route focus memory, modal focus traps, and RTL horizontal mirroring.
3. **60 FPS Budget on Integrated GPUs**: Animations use `transform` and `opacity` only, scaled by `useAnimationSpeed()`. Background art uses pre-computed vibrant dominant colors (`console_extract_dominant_color`) and smooth crossfades rather than full-screen live CSS `backdrop-filter` blurs. All polling loops pause automatically when the window is unfocused or a game is in the foreground.

## 2. Mode Lifecycle & Entry Points
- **Desktop Top Bar Button**: Clicking the Console Mode icon in the title bar calls `console_mode_enter` and navigates to `/console`.
- **Keyboard Chord**: `Ctrl+Alt+Enter` (or `F11` when enabled) toggles Console Mode from anywhere in the launcher.
- **Controller Chord**: Holding the Guide / PS button (or `Back + Start`) for 1.5s while on the desktop switches into Console Mode.
- **CLI Flag (`--console`) & Single-Instance Handoff**: Launching `nexus.exe --console` (including a second invocation caught by `tauri-plugin-single-instance`) emits `console://enter` and transitions the running window into Console Mode.
- **Startup Setting (`console_start_in_console`)**: Boots directly into the Console Mode splash and "Who's Playing?" Save Guardian profile selector.

## 3. Spatial Navigation Scoring Formula
Given the current focused bounding box $A$ and candidate bounding box $B$ in direction $D \in \{	ext{up}, 	ext{down}, 	ext{left}, 	ext{right}\}$:
1. **Half-Plane Filter**: The center of $B$ must lie strictly in direction $D$ from the center of $A$ within a configurable directional cone.
2. **Distance Metric**:
   $$	ext{score} = 	ext{primaryDistance} + 2.0 	imes 	ext{crossAxisOffset} - 	ext{overlapBonus} - 	ext{sameScopeBonus}$$
3. **Scope Memory**: Leaving a `FocusScope` records the last focused child ID; re-entering that scope restores focus to the remembered child if it is still mounted and enabled.
4. **RTL Support**: When the active locale is Persian (`fa`), `left` and `right` directional intents mirror horizontally in reading-order scopes while preserving physical spatial geometry.

## 4. Flagship Feature: In-Game Guide Button Quick Menu
- **Read-Only Polling**: When `console_guide_enabled` is enabled by the user, a background Rust thread polls XInput ordinal 100 (`XInputGetStateEx` in `xinput1_4.dll` / `xinput1_3.dll`) for the Guide bit (`0x0400`) and checks `DualSenseEngineState` for the `ps` button (plus the fallback `Back + Start` / `Create + Options` 1-second hold chord when Xbox Game Bar claims the Guide button).
- **Zero Anti-Cheat Intrusion**: No DLL injection, no API hooks into game processes, and no memory reads of game processes. The Quick Menu is rendered inside Nexus's existing non-activating topmost overlay window (`/overlay-window?view=quick-menu`).
