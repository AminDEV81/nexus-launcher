import React, { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowRight,
  CheckCircle2,
  Cpu,
  Gamepad2,
  Layers,
  Monitor,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { LogoMark } from '@/components/brand/logo-mark'
import { useConsoleStore } from '../store/console-store'
import { CONSOLE_THEMES } from '../theme/tokens'

export interface ConsoleExitOutroProps {
  open: boolean
  onSkip?: () => void
}

const EXIT_DURATION_MS = 1950

export const ConsoleExitOutro: React.FC<ConsoleExitOutroProps> = ({ open, onSkip }) => {
  const themeId = useConsoleStore((s) => s.theme)
  const isLight = Boolean(CONSOLE_THEMES[themeId]?.isLight)

  const [progress, setProgress] = useState(0)
  const [phase, setPhase] = useState<0 | 1 | 2>(0)

  useEffect(() => {
    if (!open) {
      setProgress(0)
      setPhase(0)
      return
    }

    const startTs = performance.now()
    let rafId: number | null = null

    const tick = (now: number) => {
      const elapsed = now - startTs
      const pct = Math.min(100, Math.round((elapsed / EXIT_DURATION_MS) * 100))
      setProgress(pct)
      if (pct >= 72) {
        setPhase(2)
      } else if (pct >= 34) {
        setPhase(1)
      } else {
        setPhase(0)
      }
      if (elapsed < EXIT_DURATION_MS) {
        rafId = requestAnimationFrame(tick)
      }
    }

    rafId = requestAnimationFrame(tick)
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId)
    }
  }, [open])

  const steps = [
    {
      id: 'hid',
      icon: Gamepad2,
      title: 'Spatial HID & Controller Engine',
      detail: 'Parking 10-foot focus graph & releasing exclusive gamepad lock',
      done: phase >= 1,
      active: phase === 0,
    },
    {
      id: 'vault',
      icon: ShieldCheck,
      title: 'Save Guardian & Session Telemetry',
      detail: 'Flushing playtime counters & profile state to SQLite vault',
      done: phase >= 2,
      active: phase === 1,
    },
    {
      id: 'desktop',
      icon: Monitor,
      title: 'Desktop Workspace Compositor',
      detail: 'Restoring multi-panel desktop window geometry & DPI scaling',
      done: progress >= 95,
      active: phase === 2,
    },
  ]

  const segmentCount = 24
  const activeSegments = Math.round((progress / 100) * segmentCount)

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="console-exit-outro"
          onClick={onSkip}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.04 }}
          transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
          className={`fixed inset-0 z-[295] flex flex-col items-center justify-between overflow-hidden p-8 sm:p-12 select-none cursor-pointer ${
            isLight
              ? 'bg-gradient-to-b from-slate-50 via-white to-indigo-50/90 text-slate-900'
              : 'bg-[#040711]/98 text-white'
          } backdrop-blur-2xl`}
        >
          {/* Ambient Dimensional Warp Core */}
          <motion.div
            initial={{ scale: 1.5, opacity: 0.2, rotate: 0 }}
            animate={{ scale: [1.5, 0.85, 1.15], opacity: [0.35, 0.75, 0.45], rotate: 45 }}
            transition={{ duration: 2.0, ease: 'easeInOut' }}
            className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[38rem] w-[58rem] rounded-full blur-[125px]"
            style={{
              background: isLight
                ? 'radial-gradient(circle, rgba(79,70,229,0.28) 0%, rgba(6,182,212,0.22) 48%, transparent 80%)'
                : 'radial-gradient(circle, rgba(124,92,255,0.52) 0%, rgba(0,229,255,0.38) 45%, rgba(59,130,246,0.18) 70%, transparent 88%)',
            }}
          />

          {/* Architectural Dot Grid Matrix */}
          <div
            className={`pointer-events-none absolute inset-0 [background-size:28px_28px] ${
              isLight
                ? 'bg-[radial-gradient(rgba(15,23,42,0.08)_1px,transparent_1px)] opacity-60'
                : 'bg-[radial-gradient(rgba(255,255,255,0.09)_1px,transparent_1px)] opacity-35'
            }`}
          />

          {/* Contracting Holographic Shockwave Rings */}
          {[0, 1, 2].map((idx) => (
            <motion.div
              key={idx}
              initial={{ scale: 1.9 - idx * 0.25, opacity: 0 }}
              animate={{ scale: 0.45, opacity: [0, 0.55, 0] }}
              transition={{
                duration: 1.65,
                delay: idx * 0.22,
                ease: 'easeInOut',
              }}
              className={`pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 size-80 rounded-full border ${
                isLight ? 'border-indigo-400/35' : 'border-cyan-400/35'
              }`}
            />
          ))}

          {/* Top Telemetry Status Bar */}
          <motion.div
            initial={{ opacity: 0, y: -14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className={`relative z-10 flex w-full max-w-5xl items-center justify-between font-mono text-xs font-extrabold uppercase tracking-[0.22em] ${
              isLight ? 'text-indigo-700' : 'text-cyan-300/85'
            }`}
          >
            <span className="flex items-center gap-2">
              <Sparkles className="size-4" />
              Nexus Mode Transition Engine
            </span>
            <span className="flex items-center gap-2">
              <Cpu className="size-4" />
              Console OS ➔ Desktop UI
            </span>
          </motion.div>

          {/* Center Morphing Stage: Console Emblem -> Quantum Bridge -> Desktop Window */}
          <div className="relative z-10 my-auto flex w-full max-w-3xl flex-col items-center">
            <motion.div
              initial={{ scale: 0.88, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="flex items-center justify-center gap-5 sm:gap-8"
            >
              {/* Source Node: Console Mode */}
              <motion.div
                animate={{
                  scale: phase === 0 ? 1.06 : 0.92,
                  opacity: phase >= 2 ? 0.55 : 1,
                }}
                className={`relative flex size-20 sm:size-24 flex-col items-center justify-center rounded-3xl border shadow-xl ${
                  isLight
                    ? 'border-slate-300 bg-white text-slate-800'
                    : 'border-white/15 bg-slate-950/90 text-cyan-300'
                }`}
              >
                <Gamepad2 className="size-9 sm:size-10" />
                <span className="mt-1 font-mono text-[9px] font-black uppercase tracking-wider opacity-75">
                  Console
                </span>
              </motion.div>

              {/* Animated Quantum Data Conduit + Rotating Core Logo */}
              <div className="relative flex items-center justify-center">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
                  className={`pointer-events-none absolute -inset-4 rounded-full border border-dashed ${
                    isLight ? 'border-indigo-400/50' : 'border-cyan-400/45'
                  }`}
                />
                <motion.div
                  animate={{ rotate: -360 }}
                  transition={{ duration: 9, repeat: Infinity, ease: 'linear' }}
                  className={`pointer-events-none absolute -inset-8 rounded-full border ${
                    isLight ? 'border-violet-400/30' : 'border-violet-400/30'
                  }`}
                />

                <div
                  className={`relative flex size-24 sm:size-28 items-center justify-center rounded-[2rem] border-2 shadow-2xl ${
                    isLight
                      ? 'border-indigo-500 bg-white shadow-[0_0_55px_rgba(79,70,229,0.28)]'
                      : 'border-cyan-400/70 bg-slate-950 shadow-[0_0_70px_rgba(0,229,255,0.45)]'
                  }`}
                >
                  <LogoMark className="size-14 sm:size-16" />
                  <motion.span
                    animate={{ x: [0, 5, 0] }}
                    transition={{ duration: 1.0, repeat: Infinity }}
                    className={`absolute -bottom-2.5 flex items-center gap-1 rounded-full px-2.5 py-0.5 font-mono text-[10px] font-black shadow-lg ${
                      isLight ? 'bg-indigo-600 text-white' : 'bg-cyan-400 text-slate-950'
                    }`}
                  >
                    <span>{progress}%</span>
                    <ArrowRight className="size-3" />
                  </motion.span>
                </div>
              </div>

              {/* Target Node: Legacy / Desktop Workspace */}
              <motion.div
                animate={{
                  scale: phase >= 1 ? 1.08 : 0.94,
                }}
                className={`relative flex size-20 sm:size-24 flex-col items-center justify-center rounded-3xl border-2 shadow-2xl ${
                  phase >= 1
                    ? isLight
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-700 shadow-[0_0_40px_rgba(79,70,229,0.25)]'
                      : 'border-emerald-400 bg-emerald-500/15 text-emerald-300 shadow-[0_0_45px_rgba(16,185,129,0.35)]'
                    : isLight
                      ? 'border-slate-300 bg-white text-slate-500'
                      : 'border-white/15 bg-slate-950/90 text-slate-400'
                }`}
              >
                <Monitor className="size-9 sm:size-10" />
                <span className="mt-1 font-mono text-[9px] font-black uppercase tracking-wider">
                  Desktop
                </span>
              </motion.div>
            </motion.div>

            {/* Dynamic Headline & Subtitle */}
            <div className="mt-9 text-center">
              <div
                className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1 font-mono text-[10.5px] font-black uppercase tracking-[0.25em] ${
                  isLight
                    ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                    : 'border-cyan-400/35 bg-cyan-500/15 text-cyan-300'
                }`}
              >
                <Layers className="size-3.5" />
                {phase === 0
                  ? 'Phase 1/3 · Deconstructing 10-Foot Spatial Canvas'
                  : phase === 1
                    ? 'Phase 2/3 · Synchronizing Library & Save Vault'
                    : 'Phase 3/3 · Activating Desktop Mode Workspace'}
              </div>

              <h1
                className={`mt-3 text-3xl sm:text-5xl font-black tracking-tight ${
                  isLight ? 'text-slate-900' : 'text-white'
                }`}
              >
                Switching to Legacy Desktop Mode
              </h1>
            </div>

            {/* 24-Segment Digital Telemetry Progress Bar */}
            <div className="mt-7 w-full max-w-xl space-y-2">
              <div className="grid grid-cols-24 gap-1 rounded-2xl border p-1.5 border-white/15 bg-black/20">
                {Array.from({ length: segmentCount }).map((_, i) => {
                  const lit = i < activeSegments
                  return (
                    <div
                      key={i}
                      className={`h-2.5 rounded-sm transition-all duration-75 ${
                        lit
                          ? isLight
                            ? 'bg-gradient-to-t from-indigo-600 to-cyan-500 shadow-[0_0_8px_rgba(79,70,229,0.5)]'
                            : 'bg-gradient-to-t from-violet-500 via-cyan-400 to-emerald-300 shadow-[0_0_10px_rgba(0,229,255,0.75)]'
                          : isLight
                            ? 'bg-slate-300/70'
                            : 'bg-white/10'
                      }`}
                    />
                  )
                })}
              </div>
              <div
                className={`flex items-center justify-between font-mono text-[11px] font-bold ${
                  isLight ? 'text-slate-500' : 'text-slate-400'
                }`}
              >
                <span>RESTORING WINDOW GEOMETRY &amp; DPI</span>
                <span>{progress}% COMPLETE</span>
              </div>
            </div>

            {/* 3 Live Subsystem Handoff Diagnostic Cards */}
            <div className="mt-6 grid w-full grid-cols-1 sm:grid-cols-3 gap-3">
              {steps.map((st) => {
                const Icon = st.icon
                return (
                  <div
                    key={st.id}
                    className={`flex flex-col justify-between rounded-2xl border p-3.5 text-left transition-all duration-200 ${
                      st.done
                        ? isLight
                          ? 'border-emerald-300 bg-emerald-50/90 text-emerald-950 shadow-sm'
                          : 'border-emerald-400/45 bg-emerald-500/12 text-emerald-200'
                        : st.active
                          ? isLight
                            ? 'border-indigo-400 bg-indigo-50/90 text-indigo-950 shadow-md scale-[1.02]'
                            : 'border-cyan-400/50 bg-cyan-500/15 text-white shadow-lg scale-[1.02]'
                          : isLight
                            ? 'border-slate-200 bg-white/80 text-slate-500'
                            : 'border-white/10 bg-white/[0.03] text-slate-400'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Icon
                        className={`size-4 ${
                          st.done
                            ? 'text-emerald-400'
                            : st.active
                              ? isLight
                                ? 'text-indigo-600'
                                : 'text-cyan-300'
                              : 'opacity-60'
                        }`}
                      />
                      {st.done ? (
                        <span className="inline-flex items-center gap-1 font-mono text-[9.5px] font-black uppercase text-emerald-400">
                          <CheckCircle2 className="size-3.5" />
                          Ready
                        </span>
                      ) : st.active ? (
                        <span className="font-mono text-[9.5px] font-black uppercase text-cyan-400 animate-pulse">
                          Syncing...
                        </span>
                      ) : (
                        <span className="font-mono text-[9.5px] font-bold uppercase opacity-50">
                          Queued
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-xs font-extrabold">{st.title}</p>
                    <p className="mt-0.5 text-[10.5px] opacity-80 leading-snug">{st.detail}</p>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Footer Hint */}
          <div
            className={`relative z-10 text-xs font-bold ${
              isLight ? 'text-slate-500' : 'text-slate-400'
            }`}
          >
            Click anywhere to complete transition immediately
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
