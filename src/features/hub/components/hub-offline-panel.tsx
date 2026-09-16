import { useNavigate } from 'react-router-dom'
import { WifiOff, RefreshCw, Gamepad2 } from 'lucide-react'

interface HubOfflinePanelProps {
  onRetry?: () => void
  isRetrying?: boolean
  message?: string
}

export function HubOfflinePanel({ onRetry, isRetrying, message }: HubOfflinePanelProps) {
  const navigate = useNavigate()

  return (
    <section className="flex flex-col items-center justify-center gap-5 rounded-3xl border border-border/80 bg-surface/90 px-8 py-16 text-center shadow-card backdrop-blur-md">
      <div className="relative flex size-16 items-center justify-center rounded-3xl border border-border bg-surface-raised shadow-inner">
        <WifiOff className="size-7 text-subtle" />
        <span className="absolute -bottom-1 -right-1 flex size-4 items-center justify-center rounded-full bg-amber-500 ring-2 ring-surface" />
      </div>

      <div className="space-y-1.5">
        <h3 className="text-lg font-bold tracking-tight text-text">No Internet Connection</h3>
        <p className="mx-auto max-w-md text-sm leading-relaxed text-muted">
          {message ||
            'Unable to reach the Game Hub catalog. Please check your internet connection and try again.'}
        </p>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            disabled={isRetrying}
            className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-accent/25 transition-all hover:bg-accent-hover active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={isRetrying ? 'size-4 animate-spin' : 'size-4'} />
            <span>Try Again</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-2 rounded-xl border border-border/80 bg-surface px-4 py-2.5 text-sm font-medium text-text transition-colors hover:bg-surface-raised cursor-pointer"
        >
          <Gamepad2 className="size-4 text-accent" />
          <span>Go to Library</span>
        </button>
      </div>
    </section>
  )
}
