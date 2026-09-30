import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { OverlayWindowPage } from './features/overlay/pages/overlay-window-page.tsx'
import { ErrorBoundary } from './components/error-boundary'
import { installFpsLimiter } from './lib/fps-limiter'
import { getCurrentWindow } from '@tauri-apps/api/window'

const isOverlayWindow = (() => {
  if (typeof window === 'undefined') return false
  if ((window as unknown as { __NEXUS_IS_OVERLAY__?: boolean }).__NEXUS_IS_OVERLAY__) return true
  if (
    window.location.search.includes('overlay') ||
    window.location.hash.includes('overlay-window') ||
    window.location.pathname.includes('overlay')
  ) {
    return true
  }
  try {
    const label = getCurrentWindow().label
    return label === 'overlay'
  } catch {
    return false
  }
})()

if (isOverlayWindow) {
  // Immediately enforce full transparency on root DOM before first paint
  document.documentElement.setAttribute('data-overlay-window', 'true')
  document.documentElement.style.backgroundColor = 'transparent'
  document.documentElement.style.background = 'transparent'
  if (document.body) {
    document.body.style.backgroundColor = 'transparent'
    document.body.style.background = 'transparent'
    document.body.style.overflow = 'hidden'
  }
} else {
  // Lock application frame rate to 60 FPS to prevent high GPU usage on 120Hz/144Hz/165Hz/240Hz monitors
  installFpsLimiter(60)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Last-resort boundary: even a crash high in the tree shows a
        recoverable screen instead of a blank window. */}
    <ErrorBoundary label="Nexus">{isOverlayWindow ? <OverlayWindowPage /> : <App />}</ErrorBoundary>
  </StrictMode>,
)
