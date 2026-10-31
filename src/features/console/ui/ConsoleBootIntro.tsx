import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, Gamepad2, ShieldCheck, Cpu } from 'lucide-react'
import { LogoMark } from '@/components/brand/logo-mark'
import { consoleSoundEngine } from '../audio/ui-sounds'

export interface ConsoleBootIntroProps {
  open: boolean
  onFinish: () => void
}

const BOOT_DURATION_MS = 3400

export const ConsoleBootIntro: React.FC<ConsoleBootIntroProps> = ({ open, onFinish }) => {
  const [phase, setPhase] = useState<0 | 1 | 2>(0)

  useEffect(() => {
    if (!open) return
    setPhase(0)
    consoleSoundEngine.unlock()
    consoleSoundEngine.play('boot')

    const t1 = window.setTimeout(() => setPhase(1), 1050)
    const t2 = window.setTimeout(() => setPhase(2), 2150)
    const tDone = window.setTimeout(() => {
      onFinish()
    }, BOOT_DURATION_MS)

    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      window.clearTimeout(tDone)
    }
  }, [open, onFinish])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="console-boot-intro"
          onClick={onFinish}
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.08, filter: 'blur(16px)' }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-0 z-[290] flex flex-col items-center justify-between overflow-hidden bg-[#040711] p-12 select-none cursor-pointer"
        >
          {/* Deep Space Nebula & Sweeping Horizon Beams */}
          <motion.div
            initial={{ opacity: 0, scale: 0.45, rotate: -12 }}
            animate={{ opacity: 0.9, scale: 1.35, rotate: 8 }}
            transition={{ duration: 3.2, ease: 'easeOut' }}
            className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[38rem] w-[64rem] rounded-full blur-[130px]"
            style={{
              background:
                'radial-gradient(circle, rgba(0,229,255,0.48) 0%, rgba(124,92,255,0.34) 42%, rgba(59,130,246,0.18) 68%, transparent 85%)',
            }}
          />

          {/* Subtle Cyber Grid Backdrop */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:32px_32px] opacity-35" />

          {/* Concentric Shockwave Rings */}
          {[0, 1, 2].map((idx) => (
            <motion.div
              key={idx}
              initial={{ scale: 0.35, opacity: 0 }}
              animate={{ scale: [0.35, 1.65 + idx * 0.45], opacity: [0, 0.65, 0] }}
              transition={{
                duration: 2.4,
                delay: idx * 0.38,
                ease: 'easeOut',
              }}
              className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 size-64 rounded-full border border-cyan-400/35"
            />
          ))}

          {/* Top Telemetry Status Header */}
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="relative z-10 flex w-full max-w-5xl items-center justify-between text-xs font-bold uppercase tracking-[0.25em] text-cyan-300/80"
          >
            <span className="flex items-center gap-2">
              <Sparkles className="size-4 text-cyan-400" />
              Nexus Console OS v0.7.5
            </span>
            <span>60FPS Spatial Engine · 1080p HD</span>
          </motion.div>

          {/* Center Holographic Prism Emblem & Multi-Stage Reveal */}
          <div className="relative z-10 my-auto flex flex-col items-center">
            <div className="relative flex items-center justify-center">
              {/* Rotating Outer Orbital Ring */}
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
                className="pointer-events-none absolute -inset-6 rounded-full border border-dashed border-cyan-400/40"
              />
              <motion.div
                animate={{ rotate: -360 }}
                transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
                className="pointer-events-none absolute -inset-11 rounded-full border border-violet-400/25"
              />

              <motion.div
                initial={{ scale: 0.5, opacity: 0, rotateY: 45 }}
                animate={{ scale: 1, opacity: 1, rotateY: 0 }}
                transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
                className="relative flex size-32 items-center justify-center rounded-[2.2rem] border-2 border-cyan-300/60 bg-slate-950/90 shadow-[0_0_85px_rgba(0,229,255,0.55)]"
              >
                <LogoMark className="size-20" />
              </motion.div>
            </div>

            {/* Wordmark & Phase Subtitle */}
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.65 }}
              className="mt-10 text-center"
            >
              <p className="text-xs font-extrabold uppercase tracking-[0.45em] text-cyan-300">
                {phase === 0
                  ? 'Initializing Spatial Navigation & DualSense HID'
                  : phase === 1
                    ? 'Mounting Save Guardian Vault & 1080p Shaders'
                    : 'Welcome to Big Picture Experience'}
              </p>
              <h1 className="mt-2.5 text-4xl sm:text-6xl font-black tracking-tight text-white drop-shadow-[0_4px_30px_rgba(0,229,255,0.4)]">
                NEXUS CONSOLE
              </h1>
            </motion.div>

            {/* Animated 16-Bar Audio Equalizer Spectrum */}
            <div className="mt-8 flex h-9 items-end justify-center gap-1.5">
              {Array.from({ length: 16 }).map((_, i) => (
                <motion.span
                  key={i}
                  initial={{ height: 6 }}
                  animate={{
                    height: [8, 14 + ((i * 7) % 22), 10, 26 - ((i * 5) % 18), 12],
                  }}
                  transition={{
                    duration: 1.1,
                    repeat: Infinity,
                    delay: i * 0.05,
                    ease: 'easeInOut',
                  }}
                  className="w-1.5 rounded-full bg-gradient-to-t from-violet-500 via-cyan-400 to-white"
                />
              ))}
            </div>

            {/* 3.2-Second Synchronized Progress Bar */}
            <div className="mt-7 h-1.5 w-72 sm:w-96 overflow-hidden rounded-full bg-white/10 p-0.5">
              <motion.div
                initial={{ width: '0%' }}
                animate={{ width: '100%' }}
                transition={{ duration: 3.15, ease: [0.22, 1, 0.36, 1] }}
                className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-sky-300 to-violet-500 shadow-[0_0_20px_rgba(0,229,255,0.8)]"
              />
            </div>
          </div>

          {/* Bottom Subsystem Check Pills */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45, duration: 0.6 }}
            className="relative z-10 flex flex-wrap items-center justify-center gap-6 text-xs font-bold text-slate-300/80"
          >
            <span className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5">
              <Gamepad2 className="size-4 text-cyan-400" />
              DualSense & XInput Ready
            </span>
            <span className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5">
              <ShieldCheck className="size-4 text-emerald-400" />
              Save Guardian Active
            </span>
            <span className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5">
              <Cpu className="size-4 text-violet-400" />
              Click Anywhere to Skip
            </span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
