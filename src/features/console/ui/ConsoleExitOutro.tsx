import React from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Monitor, Sparkles } from 'lucide-react'
import { LogoMark } from '@/components/brand/logo-mark'

export interface ConsoleExitOutroProps {
  open: boolean
}

export const ConsoleExitOutro: React.FC<ConsoleExitOutroProps> = ({ open }) => {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="console-exit-outro"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.28 }}
          className="fixed inset-0 z-[295] flex flex-col items-center justify-center overflow-hidden bg-[#050814]/95 backdrop-blur-2xl select-none"
        >
          {/* Contracting Neon Iris */}
          <motion.div
            initial={{ scale: 1.6, opacity: 0.75 }}
            animate={{ scale: 0.65, opacity: 0.35 }}
            transition={{ duration: 1.05, ease: [0.22, 1, 0.36, 1] }}
            className="pointer-events-none absolute size-[34rem] rounded-full blur-[100px]"
            style={{
              background:
                'radial-gradient(circle, rgba(124,92,255,0.5) 0%, rgba(0,229,255,0.3) 50%, transparent 80%)',
            }}
          />

          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 flex flex-col items-center text-center"
          >
            <div className="relative flex size-24 items-center justify-center rounded-3xl border border-violet-400/50 bg-slate-950/90 shadow-[0_0_55px_rgba(124,92,255,0.45)]">
              <LogoMark className="size-12" />
              <span className="absolute -bottom-2 -right-2 flex size-8 items-center justify-center rounded-xl bg-cyan-400 text-slate-950 shadow-lg">
                <Monitor className="size-4" />
              </span>
            </div>

            <div className="mt-6 inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-[0.3em] text-cyan-300">
              <Sparkles className="size-3.5" />
              Restoring Window Geometry
            </div>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-white">
              Switching to Legacy Mode...
            </h2>

            <div className="mt-6 h-1 w-56 overflow-hidden rounded-full bg-white/10">
              <motion.div
                initial={{ width: '0%' }}
                animate={{ width: '100%' }}
                transition={{ duration: 0.95, ease: 'easeInOut' }}
                className="h-full bg-gradient-to-r from-violet-500 via-cyan-400 to-sky-300"
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
