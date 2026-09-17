import { useEffect } from 'react'
import {
  Sparkles,
  CheckCircle2,
  RefreshCw,
  Download,
  RotateCcw,
  ShieldCheck,
  AlertCircle,
  Clock,
  WifiOff,
  GitBranch,
} from 'lucide-react'
import { useUpdaterStore } from '@/store/updater-store'
import { Switch } from './appearance-panel'
import { cn } from '@/lib/utils'

export function UpdatesPanel() {
  const {
    currentVersion,
    status,
    update,
    error,
    isAutoCheckEnabled,
    lastCheckedTimestamp,
    checkUpdates,
    openModal,
    installAndRestart,
    setAutoCheckEnabled,
  } = useUpdaterStore()

  useEffect(() => {
    // Ensure store is initialized
    void useUpdaterStore.getState().init()
  }, [])

  const isChecking = status === 'checking'
  const isAvailable = status === 'available'
  const isReady = status === 'ready-to-install'
  const isUpToDate = status === 'up-to-date'
  const isError = status === 'error' || status === 'offline'

  const formattedLastChecked = lastCheckedTimestamp
    ? new Date(lastCheckedTimestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        month: 'short',
        day: 'numeric',
      })
    : 'Never'

  return (
    <div className="flex flex-col gap-6">
      {/* Current Version & Channel Overview */}
      <div className="flex flex-col gap-4 rounded-2xl border border-border/80 bg-surface/60 p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex size-12 items-center justify-center rounded-2xl border border-accent/30 bg-accent/10 text-accent shadow-[0_0_20px_rgba(var(--nx-accent-rgb),0.2)]">
              <Sparkles className="size-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold tracking-tight text-text">Nexus Game Launcher</h2>
                <span className="rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-semibold text-accent border border-accent/20">
                  v{currentVersion}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted flex items-center gap-1.5">
                <GitBranch className="size-3 text-subtle" /> Channel:
                <strong className="text-text font-medium">Stable (GitHub Releases)</strong>
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={isChecking}
            onClick={() => checkUpdates(true)}
            className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-xs font-semibold text-bg shadow-sm transition hover:opacity-90 disabled:opacity-50"
          >
            <RefreshCw className={cn('size-3.5', isChecking && 'animate-spin')} />
            {isChecking ? 'Checking...' : 'Check for Updates'}
          </button>
        </div>

        {/* Live Status Banner */}
        {isAvailable && (
          <div className="mt-2 flex items-center justify-between rounded-xl border border-accent/40 bg-accent/10 p-4">
            <div className="flex items-center gap-3">
              <div className="flex size-8 items-center justify-center rounded-lg bg-accent/20 text-accent">
                <Download className="size-4" />
              </div>
              <div>
                <p className="text-xs font-semibold text-text">
                  New Version Available: <span className="text-accent">v{update?.version}</span>
                </p>
                <p className="text-[11px] text-muted">
                  A newer release of Nexus Launcher is ready for download and verification.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={openModal}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-bg transition hover:opacity-90 shadow-[0_0_12px_rgba(var(--nx-accent-rgb),0.3)]"
            >
              View & Install
            </button>
          </div>
        )}

        {isReady && (
          <div className="mt-2 flex items-center justify-between rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4">
            <div className="flex items-center gap-3">
              <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
                <CheckCircle2 className="size-4" />
              </div>
              <div>
                <p className="text-xs font-semibold text-emerald-300">Update Verified & Ready</p>
                <p className="text-[11px] text-emerald-200/80">
                  Version v{update?.version} is downloaded and signature-checked.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={installAndRestart}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-black transition hover:bg-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.3)]"
            >
              <RotateCcw className="size-3.5" /> Restart & Update
            </button>
          </div>
        )}

        {isUpToDate && (
          <div className="mt-2 flex items-center gap-3 rounded-xl border border-border/60 bg-surface-raised/30 p-3.5 text-xs text-muted">
            <CheckCircle2 className="size-4 text-emerald-400 shrink-0" />
            <span>
              Nexus Launcher is currently up to date. You are running the latest stable release.
            </span>
          </div>
        )}

        {isError && (
          <div className="mt-2 flex items-center gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs text-rose-200">
            {status === 'offline' ? (
              <WifiOff className="size-4 text-amber-400 shrink-0" />
            ) : (
              <AlertCircle className="size-4 text-rose-400 shrink-0" />
            )}
            <span>{error?.message || 'Unable to fetch update metadata from GitHub Releases.'}</span>
          </div>
        )}

        <div className="flex items-center gap-1.5 text-[11px] text-subtle">
          <Clock className="size-3" /> Last checked:{' '}
          <span className="text-muted">{formattedLastChecked}</span>
        </div>
      </div>

      {/* Update Preferences */}
      <div className="flex flex-col gap-4 rounded-2xl border border-border/80 bg-surface/60 p-6 shadow-sm">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-subtle">Preferences</h3>

        <div className="flex items-center justify-between gap-4 py-1">
          <div>
            <p className="text-sm font-medium text-text">Automatic Background Checks</p>
            <p className="mt-0.5 text-xs text-muted">
              Periodically query GitHub Releases on startup and notify you when a new stable version
              is released.
            </p>
          </div>
          <Switch
            checked={isAutoCheckEnabled}
            onChange={(checked) => void setAutoCheckEnabled(checked)}
            ariaLabel="Automatic update checks"
          />
        </div>
      </div>

      {/* Cryptographic Protection & Data Safety Notice */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-surface-raised/30 p-5">
        <div className="flex items-center gap-2.5 text-xs font-semibold text-text">
          <ShieldCheck className="size-4 text-accent" /> Cryptographic Integrity & Zero Data Loss
        </div>
        <p className="text-xs text-muted leading-relaxed">
          Nexus updates are signed using official Minisign Ed25519 signatures and downloaded
          directly from verified GitHub Releases. The updater operates in passive mode, upgrading
          only application binaries without altering your game library database, playtime logs,
          custom covers, or profile data in{' '}
          <code className="rounded bg-bg px-1.5 py-0.5 text-[11px] text-text border border-border/40">
            %APPDATA%/com.nexus.launcher/
          </code>
          .
        </p>
      </div>
    </div>
  )
}
