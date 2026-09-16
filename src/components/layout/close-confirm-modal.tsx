import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { Layers, Sparkles, Power, ArrowRight } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { useCloseFlowStore } from '@/store/close-flow-store'
import { useAnimationSpeed } from '@/hooks/use-animation-speed'
import { NexusCyberMascot } from './nexus-cyber-mascot'
import { cn } from '@/lib/utils'

export function CloseConfirmModal() {
  const isConfirmOpen = useCloseFlowStore((s) => s.isConfirmOpen)
  const closeConfirm = useCloseFlowStore((s) => s.closeConfirm)
  const beginClosing = useCloseFlowStore((s) => s.beginClosing)
  const runInBackground = useCloseFlowStore((s) => s.runInBackground)
  const speed = useAnimationSpeed()

  // Keyboard navigation shortcuts when dialog is open
  useEffect(() => {
    if (!isConfirmOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Avoid capturing input in text fields
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
    <Modal open={isConfirmOpen} onClose={closeConfirm} widthClassName="max-w-md">
      <div className="relative overflow-hidden p-6 sm:p-7">
        {/* Futuristic Ambient Theme Glow in Background */}
        <div
          className="pointer-events-none absolute -top-16 left-1/2 -translate-x-1/2 size-56 rounded-full blur-3xl opacity-30"
          style={{ backgroundColor: 'var(--nx-accent)' }}
        />

        {/* Ambient Tech Grid Matrix */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:16px_16px] opacity-40" />

        <div className="relative z-10 flex flex-col items-center text-center">
          {/* Advanced Interactive Cyber Mascot */}
          <NexusCyberMascot className="mb-3" />

          {/* Dialog Header */}
          <motion.h2
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 * speed }}
            className="text-xl font-black tracking-tight text-text"
          >
            Leaving So Soon?
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 * speed, delay: 0.05 }}
            className="mt-1 text-xs text-muted max-w-xs leading-relaxed"
          >
            Choose how you would like Nexus to handle your session.
          </motion.p>

          {/* Action Cards Selection */}
          <div className="mt-5 flex w-full flex-col gap-2.5">
            {/* Option 1: Run in Background (RECOMMENDED) */}
            <motion.button
              type="button"
              onClick={runInBackground}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2 * speed, delay: 0.08 }}
              className={cn(
                'group relative flex w-full items-center gap-3.5 rounded-2xl border p-3.5 text-left transition-all duration-200 cursor-pointer',
                'border-accent/40 bg-accent/10 hover:bg-accent/20 hover:border-accent/70 hover:shadow-md hover:scale-[1.01] active:scale-[0.99]',
              )}
            >
              {/* Icon Orb */}
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent/20 border border-accent/30 text-accent transition-transform duration-200 group-hover:scale-110 shadow-xs">
                <Layers className="size-5" />
              </div>

              {/* Text Info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-text group-hover:text-accent transition-colors">
                    Run in Background
                  </span>
                  <span className="flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-white shadow-xs">
                    <span className="size-1 rounded-full bg-white animate-ping" />
                    Recommended
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-muted leading-tight">
                  Keeps downloads active and minimizes to your system tray.
                </p>
              </div>

              {/* Keyboard Badge & Arrow */}
              <div className="flex shrink-0 items-center gap-1.5 text-muted group-hover:text-accent transition-colors">
                <kbd className="hidden sm:inline-block rounded-md border border-border/80 bg-surface px-1.5 py-0.5 text-[10px] font-mono font-bold text-subtle shadow-2xs">
                  B
                </kbd>
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </div>
            </motion.button>

            {/* Option 2: Stay in Nexus */}
            <motion.button
              type="button"
              onClick={closeConfirm}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2 * speed, delay: 0.12 }}
              className={cn(
                'group flex w-full items-center gap-3.5 rounded-2xl border p-3.5 text-left transition-all duration-200 cursor-pointer',
                'border-border/70 bg-surface/70 hover:bg-surface-raised hover:border-border hover:shadow-xs hover:scale-[1.01] active:scale-[0.99]',
              )}
            >
              {/* Icon Orb */}
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-raised border border-border/80 text-emerald-400 transition-transform duration-200 group-hover:scale-110 shadow-xs">
                <Sparkles className="size-5" />
              </div>

              {/* Text Info */}
              <div className="min-w-0 flex-1">
                <span className="text-sm font-bold text-text group-hover:text-emerald-400 transition-colors">
                  Stay in Nexus
                </span>
                <p className="mt-0.5 text-[11px] text-muted leading-tight">
                  Continue exploring and managing your games library.
                </p>
              </div>

              {/* Keyboard Badge */}
              <kbd className="hidden sm:inline-block rounded-md border border-border/80 bg-surface px-1.5 py-0.5 text-[10px] font-mono font-bold text-subtle shadow-2xs">
                ESC
              </kbd>
            </motion.button>

            {/* Option 3: Quit Completely */}
            <motion.button
              type="button"
              onClick={beginClosing}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2 * speed, delay: 0.16 }}
              className={cn(
                'group flex w-full items-center gap-3.5 rounded-2xl border p-3.5 text-left transition-all duration-200 cursor-pointer',
                'border-border/50 bg-surface/40 hover:bg-rose-500/10 hover:border-rose-500/40 hover:scale-[1.01] active:scale-[0.99]',
              )}
            >
              {/* Icon Orb */}
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface/80 border border-border/60 text-muted group-hover:text-rose-400 group-hover:border-rose-500/30 group-hover:bg-rose-500/15 transition-all duration-200 group-hover:scale-110 shadow-xs">
                <Power className="size-5" />
              </div>

              {/* Text Info */}
              <div className="min-w-0 flex-1">
                <span className="text-sm font-bold text-text group-hover:text-rose-400 transition-colors">
                  Exit Nexus Completely
                </span>
                <p className="mt-0.5 text-[11px] text-muted leading-tight">
                  Safely save all data and shut down the launcher.
                </p>
              </div>

              {/* Keyboard Badge */}
              <kbd className="hidden sm:inline-block rounded-md border border-border/80 bg-surface px-1.5 py-0.5 text-[10px] font-mono font-bold text-subtle shadow-2xs">
                Q
              </kbd>
            </motion.button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
