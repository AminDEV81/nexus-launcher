import { useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowRight,
  Download,
  Gamepad2,
  Layers,
  Power,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { useCloseFlowStore } from '@/store/close-flow-store'
import { useLaunchStore } from '@/store/launch-store'
import { useDownloads } from '@/features/downloads/hooks/use-downloads'
import { useAnimationSpeed } from '@/hooks/use-animation-speed'
import { NexusCyberMascot } from './nexus-cyber-mascot'
import { cn } from '@/lib/utils'

export function CloseConfirmModal() {
  const isConfirmOpen = useCloseFlowStore((s) => s.isConfirmOpen)
  const closeConfirm = useCloseFlowStore((s) => s.closeConfirm)
  const beginClosing = useCloseFlowStore((s) => s.beginClosing)
  const runInBackground = useCloseFlowStore((s) => s.runInBackground)
  const speed = useAnimationSpeed()

  const runningGamesCount = useLaunchStore((s) => s.runningGameIds?.size ?? 0)
  const { data: downloads = [] } = useDownloads()
  const activeDownloadsCount = downloads.filter(
    (d) => d.status === 'downloading' || d.status === 'extracting' || d.status === 'queued',
  ).length

  useEffect(() => {
    if (!isConfirmOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      if (e.key === 'b' || e.key === 'B') {
        e.preventDefault()
        runInBackground()
      } else if (e.key === 'q' || e.key === 'Q') {
        e.preventDefault()
        beginClosing()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isConfirmOpen, runInBackground, beginClosing])

  return (
    <Modal open={isConfirmOpen} onClose={closeConfirm} widthClassName="max-w-lg">
      <div className="relative overflow-hidden rounded-3xl bg-surface text-text">
        {/* Ambient Top Glow */}
        <div
          className="pointer-events-none absolute -top-20 left-1/2 size-64 -translate-x-1/2 rounded-full blur-3xl opacity-25"
          style={{ backgroundColor: 'var(--nx-accent)' }}
        />

        {/* Top Accent Header Banner */}
        <div className="relative border-b border-border/70 bg-gradient-to-b from-surface-raised/80 to-surface px-6 pt-6 pb-5 text-center">
          <div className="mx-auto mb-2.5 flex justify-center">
            <NexusCyberMascot />
          </div>

          <div className="inline-flex items-center gap-1.5 rounded-full border border-accent/35 bg-accent/10 px-3 py-0.5 font-mono text-[10px] font-extrabold uppercase tracking-widest text-accent">
            <ShieldCheck className="size-3" />
            <span>Session Control Center</span>
          </div>

          <motion.h2
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22 * speed }}
            className="mt-2 text-xl font-black tracking-tight text-text sm:text-2xl"
          >
            How would you like to close Nexus?
          </motion.h2>

          <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted">
            Keep Nexus running silently in your Windows system tray for instant reopening and
            background tasks, or shut down completely.
          </p>

          {/* Active Session Telemetry Pills (if games or downloads are active) */}
          {(runningGamesCount > 0 || activeDownloadsCount > 0) && (
            <div className="mt-3.5 flex flex-wrap items-center justify-center gap-2">
              {runningGamesCount > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/12 px-2.5 py-1 text-[11px] font-bold text-emerald-500 dark:text-emerald-300">
                  <Gamepad2 className="size-3.5 animate-pulse" />
                  <span>{runningGamesCount} Active Game Session</span>
                </span>
              )}
              {activeDownloadsCount > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/12 px-2.5 py-1 text-[11px] font-bold text-amber-500 dark:text-amber-300">
                  <Download className="size-3.5 animate-bounce" />
                  <span>{activeDownloadsCount} Active Download</span>
                </span>
              )}
            </div>
          )}
        </div>

        {/* Action Cards */}
        <div className="relative z-10 flex flex-col gap-2.5 p-5 sm:p-6">
          {/* Option 1: Run in Background (Recommended) */}
          <motion.button
            type="button"
            onClick={runInBackground}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 * speed, delay: 0.04 }}
            className={cn(
              'group relative flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition-all duration-200 cursor-pointer',
              'border-accent/45 bg-gradient-to-r from-accent/15 via-accent/8 to-surface-raised/60 hover:border-accent hover:from-accent/22 hover:shadow-lg active:scale-[0.99]',
            )}
          >
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-accent/40 bg-accent text-white shadow-md transition-transform duration-200 group-hover:scale-108">
              <Layers className="size-5" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-extrabold text-text group-hover:text-accent transition-colors">
                  Run in Background (System Tray)
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-white shadow-xs">
                  <span className="size-1.5 rounded-full bg-white animate-pulse" />
                  Recommended
                </span>
              </div>
              <p className="mt-1 text-[11px] leading-snug text-muted">
                Minimizes to the system tray. Reopens instantly anytime from your desktop icon or
                tray while keeping downloads, overlay &amp; controller drivers active.
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2 text-muted group-hover:text-accent transition-colors">
              <kbd className="hidden sm:inline-block rounded-lg border border-border bg-surface px-2 py-1 font-mono text-[10px] font-extrabold text-subtle shadow-2xs">
                B
              </kbd>
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
            </div>
          </motion.button>

          {/* Option 2: Stay in Nexus */}
          <motion.button
            type="button"
            onClick={closeConfirm}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 * speed, delay: 0.08 }}
            className={cn(
              'group flex w-full items-center gap-4 rounded-2xl border p-3.5 text-left transition-all duration-200 cursor-pointer',
              'border-border bg-surface-raised/60 hover:border-emerald-500/50 hover:bg-emerald-500/8 active:scale-[0.99]',
            )}
          >
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-emerald-500/35 bg-emerald-500/12 text-emerald-500 dark:text-emerald-400 transition-transform duration-200 group-hover:scale-108">
              <Sparkles className="size-5" />
            </div>

            <div className="min-w-0 flex-1">
              <span className="text-sm font-extrabold text-text group-hover:text-emerald-500 dark:group-hover:text-emerald-400 transition-colors">
                Stay in Nexus Launcher
              </span>
              <p className="mt-0.5 text-[11px] leading-snug text-muted">
                Cancel and return to your games library right where you left off.
              </p>
            </div>

            <kbd className="hidden sm:inline-block rounded-lg border border-border bg-surface px-2 py-1 font-mono text-[10px] font-extrabold text-subtle shadow-2xs">
              ESC
            </kbd>
          </motion.button>

          {/* Option 3: Exit Application Completely */}
          <motion.button
            type="button"
            onClick={beginClosing}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 * speed, delay: 0.12 }}
            className={cn(
              'group flex w-full items-center gap-4 rounded-2xl border p-3.5 text-left transition-all duration-200 cursor-pointer',
              'border-border/80 bg-surface-raised/35 hover:border-rose-500/50 hover:bg-rose-500/10 active:scale-[0.99]',
            )}
          >
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-rose-500/30 bg-rose-500/12 text-rose-500 dark:text-rose-400 transition-transform duration-200 group-hover:scale-108">
              <Power className="size-5" />
            </div>

            <div className="min-w-0 flex-1">
              <span className="text-sm font-extrabold text-text group-hover:text-rose-500 dark:group-hover:text-rose-400 transition-colors">
                Exit Nexus Completely
              </span>
              <p className="mt-0.5 text-[11px] leading-snug text-muted">
                Safely save all database state and shut down all background services.
              </p>
            </div>

            <kbd className="hidden sm:inline-block rounded-lg border border-border bg-surface px-2 py-1 font-mono text-[10px] font-extrabold text-subtle shadow-2xs">
              Q
            </kbd>
          </motion.button>
        </div>
      </div>
    </Modal>
  )
}
