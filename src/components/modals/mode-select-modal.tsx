import React, { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Tv, Monitor, Sparkles, Check, Gamepad2, MousePointerClick } from 'lucide-react'
import { useNavigate, useLocation } from 'react-router-dom'
import { getSetting, setSetting } from '@/services/settings'
import { useProfileStore } from '@/store/profile-store'
import { useConsoleStore } from '@/features/console/store/console-store'
import { ProfileAvatarIcon } from '@/features/profiles/components/profile-avatar-icon'

export const ModeSelectModal: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const isGateOpen = useProfileStore((s) => s.isGateOpen)
  const isLoadingProfiles = useProfileStore((s) => s.isLoading)
  const activeProfile = useProfileStore((s) => s.activeProfile)

  const [open, setOpen] = useState(false)
  const [checkedSetting, setCheckedSetting] = useState(false)
  const [dontShowAgain, setDontShowAgain] = useState(false)
  const [focusedChoice, setFocusedChoice] = useState<'console' | 'legacy'>('console')
  const [sessionDismissed, setSessionDismissed] = useState(false)

  // Check once after profile gate closes whether the user has dismissed the mode prompt
  useEffect(() => {
    if (isLoadingProfiles || isGateOpen || sessionDismissed) return
    if (location.pathname === '/console') {
      setSessionDismissed(true)
      return
    }

    let cancelled = false
    getSetting('console_mode_prompt_dismissed')
      .then((val) => {
        if (cancelled) return
        setCheckedSetting(true)
        if (val !== '1' && val !== 'true') {
          setOpen(true)
        } else {
          setSessionDismissed(true)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCheckedSetting(true)
          setOpen(true)
        }
      })

    return () => {
      cancelled = true
    }
  }, [isLoadingProfiles, isGateOpen, sessionDismissed, location.pathname])

  const handleChooseMode = async (choice: 'console' | 'legacy') => {
    setOpen(false)
    setSessionDismissed(true)

    try {
      if (dontShowAgain) {
        await setSetting('console_mode_prompt_dismissed', '1')
        await setSetting('console_start_in_console', choice === 'console' ? '1' : '0')
      }
    } catch {
      // Ignore persistence errors
    }

    if (choice === 'console') {
      // Mark profile gate completed in Console Mode if user already selected their profile on startup
      useConsoleStore.getState().setLastDesktopRoute(location.pathname || '/')
      navigate('/console')
    }
  }

  // Keyboard & Controller support inside ModeSelectModal
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        e.preventDefault()
        setFocusedChoice('console')
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        e.preventDefault()
        setFocusedChoice('legacy')
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        void handleChooseMode(focusedChoice)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        void handleChooseMode('legacy')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  if (!checkedSetting || !open) return null

  return (
    <AnimatePresence>
      <motion.div
        key="mode-select-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        className="fixed inset-0 z-[190] flex items-center justify-center bg-black/80 backdrop-blur-xl p-6 select-none"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 18 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 10 }}
          transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-full max-w-3xl overflow-hidden rounded-3xl border border-white/15 bg-gradient-to-b from-[#111628] via-[#0c1020] to-[#080b16] p-8 shadow-[0_32px_90px_rgba(0,0,0,0.85)]"
        >
          {/* Ambient Top Glow */}
          <div
            className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 h-56 w-[36rem] rounded-full blur-3xl opacity-45"
            style={{
              background:
                focusedChoice === 'console'
                  ? 'radial-gradient(circle, #00e5ff 0%, #7c5cff 60%, transparent 100%)'
                  : 'radial-gradient(circle, #7c5cff 0%, #3b82f6 60%, transparent 100%)',
            }}
          />

          {/* Active User Greeting Pill */}
          <div className="relative z-10 flex flex-col items-center text-center">
            {activeProfile && (
              <div className="mb-3 inline-flex items-center gap-2.5 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-bold text-slate-200">
                <div
                  className="flex size-6 items-center justify-center overflow-hidden rounded-full border border-white/25"
                  style={{ backgroundColor: activeProfile.color || '#7c5cff' }}
                >
                  <ProfileAvatarIcon avatar={activeProfile.avatar} className="size-4 text-white" />
                </div>
                <span>Welcome, {activeProfile.name}</span>
              </div>
            )}

            <div className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-[0.2em] text-cyan-400">
              <Sparkles className="size-3.5" />
              Choose Your Experience
            </div>
            <h2 className="mt-1.5 text-3xl sm:text-4xl font-black tracking-tight text-white">
              How would you like to launch Nexus?
            </h2>
            <p className="mt-2 max-w-lg text-sm text-slate-300/85">
              Switch seamlessly between the fullscreen living-room Console experience and the
              classic Desktop workspace at any time.
            </p>
          </div>

          {/* Two Mode Choice Cards */}
          <div className="relative z-10 mt-8 grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Option 1: Console Mode */}
            <button
              type="button"
              onMouseEnter={() => setFocusedChoice('console')}
              onClick={() => void handleChooseMode('console')}
              className={`group relative flex flex-col justify-between rounded-3xl border p-6 text-left transition-all duration-200 cursor-pointer ${
                focusedChoice === 'console'
                  ? 'scale-[1.02] border-cyan-400 bg-gradient-to-br from-cyan-500/20 via-slate-900/90 to-violet-500/15 ring-2 ring-cyan-400/50 shadow-[0_16px_45px_rgba(0,229,255,0.28)]'
                  : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.07]'
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex size-14 items-center justify-center rounded-2xl bg-cyan-400/20 border border-cyan-400/40 text-cyan-300 shadow-inner">
                    <Tv className="size-7" />
                  </div>
                  <span className="rounded-full bg-cyan-400/20 border border-cyan-400/40 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-cyan-300 flex items-center gap-1">
                    <Gamepad2 className="size-3.5" />
                    Big Picture
                  </span>
                </div>

                <h3 className="mt-5 text-2xl font-black text-white">Console Mode</h3>
                <p className="mt-2 text-xs sm:text-sm leading-relaxed text-slate-300/90">
                  Fullscreen 10-foot experience built for DualSense, Xbox & couch gaming with
                  spatial navigation, dynamic backdrops, and in-game Quick Menu.
                </p>
              </div>

              <div
                className={`mt-6 flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-extrabold transition-all ${
                  focusedChoice === 'console'
                    ? 'bg-cyan-400 text-slate-950 shadow-lg'
                    : 'bg-white/10 text-white'
                }`}
              >
                <span>Enter Console Mode</span>
              </div>
            </button>

            {/* Option 2: Legacy (Desktop) Mode */}
            <button
              type="button"
              onMouseEnter={() => setFocusedChoice('legacy')}
              onClick={() => void handleChooseMode('legacy')}
              className={`group relative flex flex-col justify-between rounded-3xl border p-6 text-left transition-all duration-200 cursor-pointer ${
                focusedChoice === 'legacy'
                  ? 'scale-[1.02] border-violet-400 bg-gradient-to-br from-violet-500/20 via-slate-900/90 to-indigo-500/15 ring-2 ring-violet-400/50 shadow-[0_16px_45px_rgba(124,92,255,0.28)]'
                  : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.07]'
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex size-14 items-center justify-center rounded-2xl bg-violet-500/20 border border-violet-400/40 text-violet-300 shadow-inner">
                    <Monitor className="size-7" />
                  </div>
                  <span className="rounded-full bg-violet-500/20 border border-violet-400/40 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-violet-300 flex items-center gap-1">
                    <MousePointerClick className="size-3.5" />
                    Desktop UI
                  </span>
                </div>

                <h3 className="mt-5 text-2xl font-black text-white">Legacy Mode</h3>
                <p className="mt-2 text-xs sm:text-sm leading-relaxed text-slate-300/90">
                  Classic multi-panel desktop interface optimized for mouse & keyboard with sidebar
                  navigation, detailed inspector, and window controls.
                </p>
              </div>

              <div
                className={`mt-6 flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-extrabold transition-all ${
                  focusedChoice === 'legacy'
                    ? 'bg-violet-500 text-white shadow-lg'
                    : 'bg-white/10 text-white'
                }`}
              >
                <span>Continue in Legacy Mode</span>
              </div>
            </button>
          </div>

          {/* Bottom Bar: Don't show me again checkbox */}
          <div className="relative z-10 mt-7 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-white/10 pt-5">
            <button
              type="button"
              onClick={() => setDontShowAgain((v) => !v)}
              className="flex items-center gap-3 text-xs sm:text-sm font-semibold text-slate-300 hover:text-white cursor-pointer"
            >
              <span
                className={`flex size-5 items-center justify-center rounded-md border transition-colors ${
                  dontShowAgain
                    ? 'border-cyan-400 bg-cyan-400 text-slate-950'
                    : 'border-white/25 bg-white/5 text-transparent'
                }`}
              >
                <Check className="size-3.5 stroke-[3]" />
              </span>
              <span>Don&apos;t show me again (remember my choice on startup)</span>
            </button>

            <span className="text-xs text-slate-400">
              Tip: Press <kbd className="rounded border border-white/20 bg-white/10 px-1.5 py-0.5 font-mono text-[11px] text-white">Ctrl+Alt+Enter</kbd> anytime to toggle
            </span>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
