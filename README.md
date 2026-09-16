# Nexus — Premium Game Launcher

A personal, offline-first PC game library manager (React + Tauri). No
accounts, no store, no social layer — just a beautiful home for every
game already installed on your machine.

## Prerequisites (Windows)

Before running this project you need, on your own machine:

1. **Node.js 20+** — https://nodejs.org
2. **Rust (via rustup)** — https://rustup.rs
   After installing, restart your terminal and confirm with:
   ```
   rustc --version
   cargo --version
   ```
3. **Tauri's Windows prerequisites** — Microsoft C++ Build Tools + WebView2
   (WebView2 ships with Windows 10/11 by default on most machines).
   Full checklist: https://v2.tauri.app/start/prerequisites/

## Getting started

```bash
npm install
npm run tauri dev
```

The first `cargo` build will take a few minutes (it's compiling Rust
dependencies from scratch). Subsequent runs are fast.

## Scripts

| Command               | What it does                                             |
| --------------------- | -------------------------------------------------------- |
| `npm run dev`         | Frontend only, in a regular browser tab (no native APIs) |
| `npm run tauri dev`   | Full app — the actual desktop window                     |
| `npm run build`       | Type-checks and builds the frontend bundle               |
| `npm run tauri build` | Builds the installable Windows executable/installer      |
| `npm run lint`        | Lints the frontend with oxlint                           |
| `npm run format`      | Formats the whole project with Prettier                  |

## Project structure

```
src/
  app/            App shell: providers, router, top-level pages
  components/
    ui/           Small, reusable, unstyled-opinion primitives (buttons, etc.)
    layout/       Structural pieces (title bar, sidebar — Epic 1/2)
  features/       One folder per domain area (library, game-details,
                   collections, settings, stats, onboarding). Each owns
                   its own components, hooks, and services.
  services/       Cross-cutting API clients (services/tauri.ts wraps
                   `invoke` for talking to the Rust backend)
  store/          Zustand stores (theme-store, ui-store, ...)
  styles/         Global CSS + theme tokens
  types/          Shared TypeScript types

src-tauri/
  src/
    commands/     Tauri commands, one module per feature
    db/           SQLite connection + migrations
    error.rs      Shared AppError type returned by all commands
    lib.rs        Builder setup: plugins, managed state, command registration
```

## Current status: Epic 0 — Foundation

This is the scaffolding milestone. It proves the whole stack is wired
correctly (frontend → Tauri → Rust → SQLite) via a temporary check
screen, but has none of the real UI yet. See the project roadmap for
what's next.
