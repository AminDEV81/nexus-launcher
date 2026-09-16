import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

// https://vite.dev/config/
// https://v2.tauri.app/start/frontend/vite/
const host = process.env.TAURI_DEV_HOST

export default defineConfig({
  plugins: [react(), tailwindcss()],

  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  // Prevent Vite from obscuring Rust errors
  clearScreen: false,

  // The main bundle (React + framer-motion + cmdk, ~780KB) ships inside
  // the Tauri binary and loads over the local asset protocol — there is
  // no network latency to optimize, so Vite's web-tuned 500KB chunk
  // warning is noise here. Genuinely independent heavy pages (stats with
  // recharts) are still split out via React.lazy.
  build: {
    chunkSizeWarningLimit: 900,
  },

  // Tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // Tell Vite to ignore watching `src-tauri`
      ignored: ['**/src-tauri/**'],
    },
  },
})
