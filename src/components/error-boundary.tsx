import { Component } from 'react'
import type { ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface ErrorBoundaryProps {
  children: ReactNode
  /** What crashed, for nested boundaries — "Stats page", "Details panel". */
  label: string
  /** Compact inline fallback for boundaries that guard a sub-area
   *  rather than the whole window. */
  compact?: boolean
}

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * Epic 16's crash safety net. Without a boundary, any render-time
 * exception in any component unmounts the ENTIRE React tree — one bad
 * data point in the stats charts used to blank the whole window until a
 * restart (exactly the kind of crash that motivated this epic).
 *
 * Layered three ways in main.tsx / app-shell.tsx: around the whole app
 * (last resort), around the routed page (a stats crash keeps the
 * library usable), and around the details panel. Event-handler and
 * async errors don't go through boundaries — those are already handled
 * by the per-call catch/toast discipline used across the app.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    const { label, compact } = this.props

    if (compact) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
          <AlertTriangle className="size-5 text-amber-400" />
          <p className="text-sm text-muted">{label} hit a problem and was stopped.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text transition-colors hover:border-accent/45"
          >
            <RefreshCw className="size-3" />
            Reload app
          </button>
        </div>
      )
    }

    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="solid-panel w-full max-w-md rounded-2xl border border-border p-7 text-center shadow-elevated">
          <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-amber-400/12 text-amber-400">
            <AlertTriangle className="size-6" />
          </span>
          <h1 className="mt-4 text-base font-semibold text-text">Something went wrong</h1>
          <p className="mt-1.5 text-sm text-muted">
            {label} hit an unexpected problem and the app stopped it there — the rest of your
            library and data are safe. Reloading almost always fixes it.
          </p>
          {error.message && (
            <p className="mt-3 max-h-24 overflow-y-auto rounded-lg border border-border bg-surface px-3 py-2 text-left font-mono text-[11px] leading-relaxed text-subtle">
              {error.message}
            </p>
          )}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mx-auto mt-5 flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
          >
            <RefreshCw className="size-4" />
            Reload Nexus
          </button>
        </div>
      </div>
    )
  }
}
