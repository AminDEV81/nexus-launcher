import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/error-boundary'
import { installFpsLimiter } from './lib/fps-limiter'

// Lock application frame rate to 60 FPS to prevent high GPU usage on 120Hz/144Hz/165Hz/240Hz monitors
installFpsLimiter(60)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Last-resort boundary: even a crash high in the tree shows a
        recoverable screen instead of a blank window. */}
    <ErrorBoundary label="Nexus">
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
