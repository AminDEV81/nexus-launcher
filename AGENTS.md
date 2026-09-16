# AGENTS.md — Nexus Launcher

Instructions for AI coding agents working in this repository.

## Workflow rules

- **After completing any task, run the app** so the change can be
  verified live in the actual window:
  ```bash
  npm run tauri dev
  ```
  Run it in the background and check the output for a clean launch
  (Vite ready on port 1420, `app.exe` running). If an instance is
  already running, the Rust watcher rebuilds on save — watch its output
  for compile errors instead of starting a second one.
- Before finishing any change, verify with: `cargo clippy` (Rust),
  `npx tsc -b`, `npm run lint`, `npm run format:check`, and
  `npm run build` (frontend). All must be clean.

## Project context

- Tauri 2 (Rust) + React 19 + TypeScript + Vite + Tailwind CSS 4.
- Frontend: feature-based structure under `src/features/`; services in
  `src/services/` wrap Tauri `invoke` calls; Zustand stores + TanStack
  Query for data.
- Backend: command modules in `src-tauri/src/commands/`, SQLite via
  rusqlite with versioned migrations in `src-tauri/src/db/sql/`.
  Register new commands in `src-tauri/src/lib.rs` (always via full
  path, see note in `commands/mod.rs`).
- Game Hub (`src/features/hub/`) is IGDB-backed and requires the IGDB
  Client ID/Secret from Settings; IGDB's old `category` field is gone —
  use standalone types `game_type = (0, 8, 9, 10, 4)` in APIcalypse queries
  so Remakes (8), Remasters (9), Expanded Editions (10), and Standalone
  Expansions (4) are included alongside Main Games (0) while excluding
  DLCs/mods. `limit` and `offset` must be separate statements or IGDB
  returns 400.
- Performance discipline: animate transform/opacity only, keep blur on
  small overlays only, scale Framer Motion durations by
  `useAnimationSpeed()`, respect reduce-motion and window-focus rules.
