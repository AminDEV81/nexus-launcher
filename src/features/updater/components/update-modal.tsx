import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Sparkles,
  ArrowRight,
  Download,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Clock,
  Gauge,
  HardDrive,
  WifiOff,
  RefreshCw,
  ExternalLink,
  Copy,
  Check,
  X,
} from 'lucide-react'
import { openUrl } from '@tauri-apps/plugin-opener'
import { toast } from 'sonner'
import { useUpdaterStore } from '@/store/updater-store'
import { cn } from '@/lib/utils'

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 MB'
  const mb = bytes / (1024 * 1024)
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(2)} GB`
  }
  return `${mb.toFixed(1)} MB`
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec <= 0) return '0.0 MB/s'
  const mb = bytesPerSec / (1024 * 1024)
  if (mb < 0.1) {
    return `${(bytesPerSec / 1024).toFixed(0)} KB/s`
  }
  return `${mb.toFixed(1)} MB/s`
}

function formatEta(seconds: number): string {
  if (seconds <= 0) return 'Calculating...'
  if (seconds < 60) return `${seconds}s`
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}m ${secs}s`
}

export function UpdateModal() {
  const {
    isModalOpen,
    status,
    currentVersion,
    update,
    error,
    totalBytes,
    downloadedBytes,
    percentage,
    speedBps,
    etaSeconds,
    closeModal,
    startDownload,
    installAndRestart,
    dismissUpdate,
    checkUpdates,
    resetError,
  } = useUpdaterStore()

  const [copied, setCopied] = useState(false)

  const copyCommand = (cmd: string) => {
    navigator.clipboard.writeText(cmd)
    setCopied(true)
    toast.success('Command copied to clipboard')
    setTimeout(() => setCopied(false), 2000)
  }

  if (!isModalOpen) return null

  const isDownloading = status === 'downloading'
  const isReady = status === 'ready-to-install'
  const isInstalling = status === 'installing'
  const isAvailable = status === 'available'
  const isChecking = status === 'checking'
  const isUpToDate = status === 'up-to-date'
  const isError = status === 'error' || status === 'offline'

  const targetVersion = update?.version ? `v${update.version}` : 'Latest'
  const currentVerStr = `v${currentVersion}`

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-border/80 bg-surface shadow-2xl"
        >
          {/* Header background accent glow */}
          <div
            className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full"
            style={{
              background:
                'radial-gradient(circle, color-mix(in srgb, var(--nx-accent) 25%, transparent) 0%, transparent 70%)',
            }}
          />

          {/* Modal Header */}
          <div className="relative flex items-center justify-between border-b border-border/60 px-6 py-5">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  'flex size-9 shrink-0 items-center justify-center rounded-xl border text-sm',
                  isReady
                    ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.3)]'
                    : isError
                      ? 'border-rose-500/40 bg-rose-500/15 text-rose-400'
                      : 'border-accent/40 bg-accent/15 text-accent shadow-[0_0_15px_rgba(var(--nx-accent-rgb),0.25)]',
                )}
              >
                {isReady ? (
                  <CheckCircle2 className="size-5" />
                ) : isError ? (
                  <AlertCircle className="size-5" />
                ) : isDownloading ? (
                  <RefreshCw className="size-5 animate-spin" />
                ) : (
                  <Sparkles className="size-5" />
                )}
              </div>
              <div>
                <h2 className="text-base font-semibold tracking-tight text-text">
                  {isReady
                    ? 'Update Ready to Install'
                    : isDownloading
                      ? 'Downloading Update...'
                      : isInstalling
                        ? 'Applying Update...'
                        : isUpToDate
                          ? 'Nexus is Up to Date'
                          : isError
                            ? error?.type === 'INSTALL_FAILED'
                              ? 'Manual Installation Required'
                              : 'Update Check Failed'
                            : 'Nexus Update Available'}
                </h2>
                <div className="flex items-center gap-2 text-xs text-muted">
                  <span>{currentVerStr}</span>
                  {(isAvailable || isDownloading || isReady) && (
                    <>
                      <ArrowRight className="size-3 text-subtle" />
                      <span className="font-medium text-accent">{targetVersion}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {!isDownloading && !isInstalling && (
              <button
                onClick={closeModal}
                className="rounded-lg p-1.5 text-muted transition hover:bg-surface-raised hover:text-text"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          {/* Modal Body */}
          <div className="relative max-h-[60vh] overflow-y-auto px-6 py-5 text-sm">
            {/* Case: Ready to Install */}
            {isReady && (
              <div className="space-y-4">
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-200">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-400" />
                    <div>
                      <p className="font-semibold text-emerald-300">Package Verified & Ready</p>
                      <p className="mt-1 text-xs text-emerald-200/80 leading-relaxed">
                        The update has been securely downloaded and its cryptographic Minisign
                        signature has been verified. Click <strong>Restart & Update</strong> to
                        apply it seamlessly.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-surface-raised/40 p-3 text-xs text-muted">
                  Your library, game covers, playtime stats, and settings will remain completely
                  untouched.
                </div>
              </div>
            )}

            {/* Case: Downloading */}
            {isDownloading && (
              <div className="space-y-5">
                {/* Progress bar */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-text">Overall Progress</span>
                    <span className="font-bold text-accent">{percentage}%</span>
                  </div>
                  <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-surface-raised border border-border/60">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-accent to-emerald-400 shadow-[0_0_12px_var(--nx-accent)]"
                      style={{ width: `${Math.max(3, percentage)}%` }}
                      transition={{ ease: 'easeOut', duration: 0.2 }}
                    />
                  </div>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-3 gap-3 rounded-xl border border-border bg-surface-raised/40 p-3.5">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1.5 text-[11px] text-muted">
                      <HardDrive className="size-3.5 text-subtle" /> Size
                    </div>
                    <span className="text-xs font-semibold text-text">
                      {formatBytes(downloadedBytes)} /{' '}
                      {totalBytes > 0 ? formatBytes(totalBytes) : '—'}
                    </span>
                  </div>

                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1.5 text-[11px] text-muted">
                      <Gauge className="size-3.5 text-subtle" /> Speed
                    </div>
                    <span className="text-xs font-semibold text-text">{formatSpeed(speedBps)}</span>
                  </div>

                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1.5 text-[11px] text-muted">
                      <Clock className="size-3.5 text-subtle" /> ETA
                    </div>
                    <span className="text-xs font-semibold text-text">{formatEta(etaSeconds)}</span>
                  </div>
                </div>

                <p className="text-center text-xs text-subtle">
                  Verifying cryptographic signature during download. Please keep Nexus running.
                </p>
              </div>
            )}

            {/* Case: Installing */}
            {isInstalling && (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <RefreshCw className="size-8 animate-spin text-accent" />
                <p className="mt-4 font-medium text-text">Applying Update...</p>
                <p className="mt-1 text-xs text-muted max-w-xs">
                  Launching silent Windows updater and restarting Nexus Launcher.
                </p>
              </div>
            )}

            {/* Case: Update Available */}
            {isAvailable && (
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-xl border border-border bg-surface-raised/50 p-3">
                  <span className="text-xs text-muted">
                    A new version of Nexus is ready for download.
                  </span>
                  <span className="rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-semibold text-accent">
                    {targetVersion}
                  </span>
                </div>

                {update?.body && (
                  <div className="space-y-1.5">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-subtle">
                      Release Notes
                    </h3>
                    <div className="max-h-48 overflow-y-auto rounded-xl border border-border bg-bg/50 p-3.5 text-xs text-muted leading-relaxed font-mono whitespace-pre-wrap selection:bg-accent/30 selection:text-text">
                      {update.body}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Case: Up to Date */}
            {isUpToDate && (
              <div className="flex flex-col items-center justify-center py-6 text-center space-y-3">
                <div className="flex size-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
                  <CheckCircle2 className="size-6" />
                </div>
                <div>
                  <p className="font-semibold text-text">Nexus Launcher is Up to Date</p>
                  <p className="mt-1 text-xs text-muted">
                    You are currently running the latest stable release (
                    <strong>{currentVerStr}</strong>).
                  </p>
                </div>
              </div>
            )}

            {/* Case: Error or Offline */}
            {isError && (
              <div className="space-y-3 py-2">
                {error?.type === 'INSTALL_FAILED' ? (
                  <div className="space-y-3">
                    <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-amber-200">
                      <AlertCircle className="mt-0.5 size-5 shrink-0 text-amber-400" />
                      <div>
                        <p className="font-semibold text-amber-300">
                          Manual Update Required on Linux (.deb)
                        </p>
                        <p className="mt-1 text-xs text-amber-200/90 leading-relaxed">
                          Automatic background installation is restricted for Debian/Ubuntu packages
                          because root permissions are required. Please download the latest release
                          and install it via terminal:
                        </p>
                      </div>
                    </div>

                    <div className="rounded-xl border border-border bg-bg/80 p-3">
                      <div className="flex items-center justify-between text-xs text-subtle mb-1.5">
                        <span>Terminal Command</span>
                        <button
                          type="button"
                          onClick={() => copyCommand('sudo apt install ./nexus-launcher.deb')}
                          className="flex items-center gap-1 text-[11px] text-accent hover:underline"
                        >
                          {copied ? (
                            <>
                              <Check className="size-3" /> Copied
                            </>
                          ) : (
                            <>
                              <Copy className="size-3" /> Copy command
                            </>
                          )}
                        </button>
                      </div>
                      <code className="block rounded bg-surface p-2 text-xs font-mono text-text select-all">
                        sudo apt install ./nexus-launcher.deb
                      </code>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-rose-200">
                    {status === 'offline' ? (
                      <WifiOff className="mt-0.5 size-5 shrink-0 text-amber-400" />
                    ) : (
                      <AlertCircle className="mt-0.5 size-5 shrink-0 text-rose-400" />
                    )}
                    <div>
                      <p className="font-semibold text-rose-300">
                        {status === 'offline' ? 'Offline Mode' : 'Update Check Error'}
                      </p>
                      <p className="mt-1 text-xs text-rose-200/90 leading-relaxed">
                        {error?.message ||
                          'Could not connect to GitHub Releases or retrieve update metadata.'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Modal Footer */}
          <div className="relative flex items-center justify-end gap-3 border-t border-border/60 bg-surface-raised/20 px-6 py-4">
            {isAvailable && (
              <>
                <button
                  onClick={dismissUpdate}
                  className="rounded-xl border border-border px-4 py-2 text-xs font-medium text-muted transition hover:bg-surface-raised hover:text-text"
                >
                  Skip This Version
                </button>
                <button
                  onClick={() => closeModal()}
                  className="rounded-xl border border-border px-4 py-2 text-xs font-medium text-muted transition hover:bg-surface-raised hover:text-text"
                >
                  Later
                </button>
                <button
                  onClick={startDownload}
                  className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-bg transition hover:opacity-90 shadow-[0_0_15px_rgba(var(--nx-accent-rgb),0.4)]"
                >
                  <Download className="size-3.5" /> Update Now
                </button>
              </>
            )}

            {isReady && (
              <>
                <button
                  onClick={closeModal}
                  className="rounded-xl border border-border px-4 py-2 text-xs font-medium text-muted transition hover:bg-surface-raised hover:text-text"
                >
                  Restart Later
                </button>
                <button
                  onClick={installAndRestart}
                  className="flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-black transition hover:bg-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.4)]"
                >
                  <RotateCcw className="size-3.5" /> Restart & Update
                </button>
              </>
            )}

            {isError && (
              <>
                <button
                  onClick={() => {
                    resetError()
                    closeModal()
                  }}
                  className="rounded-xl border border-border px-4 py-2 text-xs font-medium text-muted transition hover:bg-surface-raised hover:text-text"
                >
                  Close
                </button>
                {error?.type === 'INSTALL_FAILED' ? (
                  <button
                    onClick={() => {
                      openUrl('https://github.com/AminDEV81/nexus-launcher/releases/latest').catch(
                        console.error,
                      )
                    }}
                    className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-bg transition hover:opacity-90 shadow-[0_0_15px_rgba(var(--nx-accent-rgb),0.4)]"
                  >
                    <ExternalLink className="size-3.5" /> Download on GitHub
                  </button>
                ) : (
                  <button
                    onClick={() => checkUpdates(true)}
                    disabled={isChecking}
                    className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-bg transition hover:opacity-90 disabled:opacity-50"
                  >
                    <RefreshCw className={cn('size-3.5', isChecking && 'animate-spin')} /> Try Again
                  </button>
                )}
              </>
            )}

            {isUpToDate && (
              <button
                onClick={closeModal}
                className="rounded-xl border border-border px-4 py-2 text-xs font-medium text-text transition hover:bg-surface-raised"
              >
                Close
              </button>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
