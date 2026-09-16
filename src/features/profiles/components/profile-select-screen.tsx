import { useCallback, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus,
  Check,
  Play,
  Gamepad2,
  HardDrive,
  Sun,
  Moon,
  Settings,
  Users,
  Sparkles,
  Clock,
  Pencil,
  Trash2,
  Activity,
  Layers,
  Minus,
  Square,
  Copy,
  X,
} from 'lucide-react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { toast } from 'sonner'
import type { Profile } from '@/types/models'
import { useProfileStore } from '@/store/profile-store'
import { useThemeStore, useActivePalette, PALETTES } from '@/store/theme-store'
import { useAnimationSpeed } from '@/hooks/use-animation-speed'
import { getSetting, setSetting } from '@/services/settings'
import { formatBytes } from '@/features/library/utils/guess-name'
import { cn } from '@/lib/utils'
import { playProfileSwitch, playProfileEnter } from '@/lib/sound-engine'
import { ProfileAvatarIcon } from './profile-avatar-icon'
import { DeleteProfileModal } from './delete-profile-modal'

const PALETTE_DOT_COLORS: Record<string, string> = {
  violet: '#7c5cff',
  ocean: '#3b82f6',
  emerald: '#10b981',
  crimson: '#f43f5e',
  amber: '#f59e0b',
  cyberpunk: '#ec4899',
  solaris: '#eab308',
  toxic: '#84cc16',
  aquamarine: '#06b6d4',
  amethyst: '#8b5cf6',
  inferno: '#f97316',
}

function ProfileScreenClock({ mode }: { mode: string }) {
  const [currentTime, setCurrentTime] = useState<Date>(() => new Date())

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const formattedTime = currentTime.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const formattedDate = currentTime.toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })

  return (
    <div
      className={cn(
        'hidden md:flex items-center gap-2.5 rounded-full px-4 py-1.5 border shadow-xs text-xs font-mono',
        mode === 'light'
          ? 'bg-white/90 border-slate-200/80 text-slate-600'
          : 'bg-surface/85 border-border/70 text-muted',
      )}
    >
      <Clock className="size-3.5 text-accent" />
      <span className="font-bold text-slate-800 dark:text-text">{formattedTime}</span>
      <span className="text-slate-400 dark:text-subtle">•</span>
      <span>{formattedDate}</span>
    </div>
  )
}

export function ProfileSelectScreen() {
  const isOpen = useProfileStore((s) => s.isGateOpen)
  const isManagerModalOpen = useProfileStore((s) => s.isManagerModalOpen)
  const profiles = useProfileStore((s) => s.profiles)
  const activeProfile = useProfileStore((s) => s.activeProfile)
  const selectProfile = useProfileStore((s) => s.selectProfile)
  const closeGate = useProfileStore((s) => s.closeGate)
  const openManagerModal = useProfileStore((s) => s.openManagerModal)

  const { mode, toggleMode, setPalette } = useThemeStore()
  const activePalette = useActivePalette()
  const speed = useAnimationSpeed()

  const [selectedIndex, setSelectedIndex] = useState(0)
  const [isSwitching, setIsSwitching] = useState(false)
  const [isEntering, setIsEntering] = useState(false)
  const [startupGateEnabled, setStartupGateEnabled] = useState<boolean>(true)
  const [isMaximized, setIsMaximized] = useState(false)
  const [profileToDelete, setProfileToDelete] = useState<Profile | null>(null)

  // Sync maximized state for window controls
  useEffect(() => {
    if (!isOpen) return
    const appWindow = getCurrentWindow()
    const syncMaximized = () => {
      appWindow
        .isMaximized()
        .then(setIsMaximized)
        .catch(() => {})
    }
    syncMaximized()
    const unlisten = appWindow.onResized(syncMaximized)
    return () => {
      unlisten.then((fn) => fn())
    }
  }, [isOpen])

  // Sync selected index with active profile initially
  useEffect(() => {
    if (activeProfile && profiles.length > 0) {
      const idx = profiles.findIndex((p) => p.id === activeProfile.id)
      if (idx !== -1) setSelectedIndex(idx)
    }
  }, [activeProfile, profiles])

  // Load startup setting preference
  useEffect(() => {
    if (isOpen) {
      getSetting('profile_select_on_startup')
        .then((val) => {
          // Default to true if not explicitly disabled
          setStartupGateEnabled(val === null || val === 'true')
        })
        .catch(() => {
          setStartupGateEnabled(true)
        })
    }
  }, [isOpen])

  const handleToggleStartupGate = async () => {
    const nextVal = !startupGateEnabled
    setStartupGateEnabled(nextVal)
    try {
      await setSetting('profile_select_on_startup', nextVal ? 'true' : 'false')
      toast.success(
        nextVal
          ? 'Profile selection screen enabled on startup'
          : 'Profile selection on startup disabled (can be re-enabled in Settings)',
      )
    } catch (err) {
      setStartupGateEnabled(!nextVal)
      toast.error(`Failed to save startup setting: ${String(err)}`)
    }
  }

  const handleSelect = useCallback(
    async (profile: Profile) => {
      if (isSwitching || isEntering) return

      try {
        setIsEntering(true)
        playProfileEnter()
        // Responsive console entrance presentation
        await new Promise((resolve) => setTimeout(resolve, Math.round(80 * speed)))

        if (activeProfile?.id === profile.id) {
          closeGate()
          toast.success(`Playing as ${profile.name}`)
          return
        }

        setIsSwitching(true)
        let timer: ReturnType<typeof setTimeout> | undefined
        try {
          const timeoutPromise = new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error('Profile switch timed out')), 20000)
          })
          await Promise.race([selectProfile(profile.id), timeoutPromise])
          toast.success(`Welcome back, ${profile.name}!`)
        } finally {
          if (timer) clearTimeout(timer)
        }
      } catch (err) {
        console.error('Profile switch failed or timed out:', err)
        toast.error(`Could not switch profile: ${String(err)}`)
      } finally {
        setIsSwitching(false)
        setIsEntering(false)
      }
    },
    [isSwitching, isEntering, speed, selectProfile, activeProfile, closeGate],
  )

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen || isManagerModalOpen || profileToDelete !== null) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept typing in inputs
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return
      }

      const totalItems = profiles.length + 1 // Profiles + Add User card

      if (e.key === 'ArrowRight') {
        e.preventDefault()
        if (isSwitching) return
        playProfileSwitch()
        setSelectedIndex((prev) => (prev + 1) % totalItems)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        if (isSwitching) return
        playProfileSwitch()
        setSelectedIndex((prev) => (prev - 1 + totalItems) % totalItems)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (isSwitching) return
        if (selectedIndex < profiles.length) {
          void handleSelect(profiles[selectedIndex])
        } else {
          openManagerModal()
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        if (isSwitching) return
        if (activeProfile) {
          playProfileEnter()
          closeGate()
        }
      } else if (e.key === 't' || e.key === 'T') {
        e.preventDefault()
        toggleMode()
      } else if (e.key === 'e' || e.key === 'E') {
        e.preventDefault()
        if (selectedIndex < profiles.length) {
          openManagerModal(profiles[selectedIndex].id)
        } else {
          openManagerModal()
        }
      } else if (e.key === 'Delete') {
        if (selectedIndex < profiles.length) {
          const target = profiles[selectedIndex]
          if (target && target.id !== 'default') {
            e.preventDefault()
            setProfileToDelete(target)
          }
        }
      } else if (e.key === 'm' || e.key === 'M' || e.key === 'a' || e.key === 'A') {
        e.preventDefault()
        openManagerModal()
      } else if (/^[1-9]$/.test(e.key)) {
        const num = Number(e.key) - 1
        if (num < profiles.length) {
          e.preventDefault()
          if (isSwitching) return
          playProfileSwitch()
          setSelectedIndex(num)
          void handleSelect(profiles[num])
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    isOpen,
    isManagerModalOpen,
    profileToDelete,
    selectedIndex,
    profiles,
    activeProfile,
    handleSelect,
    openManagerModal,
    closeGate,
    toggleMode,
    isSwitching,
  ])

  const currentHoveredProfile =
    selectedIndex < profiles.length ? (profiles[selectedIndex] ?? null) : null

  return (
    <AnimatePresence mode="wait">
      {isOpen && (
        <motion.div
          key="profile-selection-gate"
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{
            opacity: 0,
            scale: 1.04,
            transition: { duration: 0.35 * speed, ease: [0.22, 1, 0.36, 1] },
          }}
          className={cn(
            'fixed inset-0 z-[100] flex flex-col items-center justify-between select-none overflow-hidden transition-colors duration-300',
            mode === 'light'
              ? 'bg-gradient-to-br from-[#f8fafc] via-[#f1f5f9] to-[#e2e8f0] text-slate-900'
              : 'bg-gradient-to-br from-[#09090e] via-[#0d0d14] to-[#13121f] text-text',
          )}
        >
          {/* Base Persistent Ambient Glow */}
          <div
            className="pointer-events-none absolute inset-0 opacity-70 transition-opacity duration-300"
            style={{
              background:
                mode === 'dark'
                  ? 'radial-gradient(circle at 50% 40%, rgba(124, 92, 255, 0.18) 0%, transparent 65%)'
                  : 'radial-gradient(circle at 50% 40%, rgba(124, 92, 255, 0.08) 0%, transparent 60%)',
            }}
          />

          {/* Dynamic Smooth Crossfade Color Aura per Profile */}
          <AnimatePresence>
            {currentHoveredProfile && (
              <motion.div
                key={currentHoveredProfile.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.35 * speed, ease: 'easeOut' }}
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    mode === 'dark'
                      ? `radial-gradient(circle at 50% 38%, ${currentHoveredProfile.color}28 0%, transparent 65%), radial-gradient(circle at 85% 15%, #7c5cff18 0%, transparent 50%)`
                      : `radial-gradient(circle at 50% 38%, ${currentHoveredProfile.color}18 0%, transparent 60%), radial-gradient(circle at 15% 20%, #3b82f610 0%, transparent 45%), radial-gradient(circle at 85% 80%, #8b5cf610 0%, transparent 50%)`,
                }}
              />
            )}
          </AnimatePresence>

          {/* Ambient Micro-Dot Pattern */}
          <div
            className={cn(
              'pointer-events-none absolute inset-0 [background-size:24px_24px]',
              mode === 'dark'
                ? 'bg-[radial-gradient(rgba(255,255,255,0.07)_1px,transparent_1px)] opacity-40'
                : 'bg-[radial-gradient(#4755691f_1px,transparent_1px)] opacity-60',
            )}
          />

          {/* Top Header Bar */}
          <div
            data-tauri-drag-region
            onDoubleClick={() => void getCurrentWindow().toggleMaximize()}
            className="relative z-10 flex w-full items-center justify-between px-8 pt-6 select-none"
          >
            {/* Brand Badge */}
            <div data-tauri-drag-region="false" className="flex items-center gap-3">
              <div
                className={cn(
                  'flex items-center gap-2.5 rounded-full px-4 py-1.5 shadow-sm border transition-colors',
                  mode === 'light'
                    ? 'bg-white/95 border-slate-200/90 text-slate-800'
                    : 'bg-surface/90 border-border/80 text-text/90',
                )}
              >
                <span className="size-2 rounded-full bg-accent shadow-[0_0_8px_var(--nx-accent)]" />
                <span className="text-xs font-black tracking-widest uppercase">Nexus Launcher</span>
                <span
                  className={cn(
                    'text-[10px] font-bold px-2 py-0.5 rounded-full border',
                    mode === 'light'
                      ? 'bg-slate-100 text-slate-600 border-slate-200'
                      : 'bg-surface-raised text-muted border-border/60',
                  )}
                >
                  PROFILES
                </span>
              </div>
            </div>

            {/* Center Digital Clock HUD */}
            <div data-tauri-drag-region="false">
              <ProfileScreenClock mode={mode} />
            </div>

            {/* Top Actions: Palette Dots, Theme Switcher, Manage, Skip, and Window Controls */}
            <div data-tauri-drag-region="false" className="flex items-center gap-2.5">
              {/* Palette Dots Picker */}
              <div
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border shadow-xs',
                  mode === 'light'
                    ? 'bg-white/95 border-slate-200/90'
                    : 'bg-surface/90 border-border/70',
                )}
              >
                {PALETTES.map((p) => {
                  const isSelected = activePalette === p.id
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPalette(p.id)}
                      title={`Accent: ${p.label}`}
                      className={cn(
                        'size-3.5 rounded-full transition-all duration-200 cursor-pointer',
                        isSelected
                          ? 'scale-125 ring-2 ring-offset-1 ring-offset-background ring-slate-800 dark:ring-white shadow-xs'
                          : 'opacity-50 hover:opacity-100 hover:scale-110',
                      )}
                      style={{ backgroundColor: PALETTE_DOT_COLORS[p.id] }}
                    />
                  )
                })}
              </div>

              {/* Theme Toggle Button */}
              <button
                type="button"
                onClick={toggleMode}
                title={`Switch to ${mode === 'dark' ? 'Light' : 'Dark'} mode (T)`}
                className={cn(
                  'flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all shadow-xs border cursor-pointer',
                  mode === 'light'
                    ? 'bg-white/95 border-slate-200 text-slate-700 hover:bg-white hover:text-slate-900 hover:border-slate-300'
                    : 'bg-surface/90 border-border/70 text-muted hover:text-text hover:bg-surface-raised',
                )}
              >
                {mode === 'dark' ? (
                  <>
                    <Sun className="size-3.5 text-amber-400" />
                    <span>Light</span>
                  </>
                ) : (
                  <>
                    <Moon className="size-3.5 text-accent" />
                    <span>Dark</span>
                  </>
                )}
                <kbd
                  className={cn(
                    'text-[9px] font-mono px-1 rounded border',
                    mode === 'light'
                      ? 'bg-slate-100 text-slate-500 border-slate-200'
                      : 'bg-surface-raised text-subtle border-border/60',
                  )}
                >
                  T
                </kbd>
              </button>

              {/* Profile Manager Button */}
              <button
                type="button"
                onClick={() => openManagerModal()}
                title="Manage Profiles (M)"
                className={cn(
                  'flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all shadow-xs border cursor-pointer',
                  mode === 'light'
                    ? 'bg-white/95 border-slate-200 text-slate-700 hover:bg-white hover:text-slate-900 hover:border-slate-300'
                    : 'bg-surface/90 border-border/70 text-muted hover:text-text hover:bg-surface-raised',
                )}
              >
                <Settings className="size-3.5 text-accent" />
                <span>Manage</span>
                <kbd
                  className={cn(
                    'text-[9px] font-mono px-1 rounded border',
                    mode === 'light'
                      ? 'bg-slate-100 text-slate-500 border-slate-200'
                      : 'bg-surface-raised text-subtle border-border/60',
                  )}
                >
                  M
                </kbd>
              </button>

              {/* Skip / Continue as active profile button */}
              {activeProfile && (
                <button
                  type="button"
                  disabled={isSwitching}
                  onClick={() => {
                    if (isSwitching) return
                    playProfileEnter()
                    closeGate()
                  }}
                  title="Continue playing as active user (ESC)"
                  className={`flex items-center gap-2 rounded-full border border-accent/40 bg-accent/15 px-4 py-1.5 text-xs font-bold text-accent hover:bg-accent/25 transition-all shadow-sm ${isSwitching ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <Play className="size-3.5" />
                  <span>Continue as {activeProfile.name}</span>
                  <kbd className="text-[9px] font-mono px-1.5 rounded bg-background/80 border border-accent/30 text-accent font-bold">
                    ESC
                  </kbd>
                </button>
              )}

              {/* Window Controls Divider & Buttons */}
              <div className="mx-1 h-5 w-px bg-border/60" />

              <div
                className={cn(
                  'flex items-center gap-1 rounded-full border px-1.5 py-1 shadow-xs',
                  mode === 'light'
                    ? 'bg-white/95 border-slate-200/90'
                    : 'bg-surface/90 border-border/70',
                )}
              >
                <button
                  type="button"
                  onClick={() => void getCurrentWindow().minimize()}
                  title="Minimize"
                  aria-label="Minimize"
                  className="flex size-7 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-raised hover:text-text cursor-pointer"
                >
                  <Minus className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => void getCurrentWindow().toggleMaximize()}
                  title={isMaximized ? 'Restore' : 'Maximize'}
                  aria-label={isMaximized ? 'Restore' : 'Maximize'}
                  className="flex size-7 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-raised hover:text-text cursor-pointer"
                >
                  {isMaximized ? <Copy className="size-3" /> : <Square className="size-3" />}
                </button>
                <button
                  type="button"
                  onClick={() => void getCurrentWindow().close()}
                  title="Close"
                  aria-label="Close"
                  className="flex size-7 items-center justify-center rounded-full text-muted transition-colors hover:bg-red-500 hover:text-white cursor-pointer"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Center PlayStation / Console Style Showcase */}
          <div className="relative z-10 flex flex-col items-center gap-6 text-center max-w-6xl px-6 my-auto">
            {/* Header Texts */}
            <motion.div
              initial={{ y: -16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.35 * speed, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col items-center gap-2"
            >
              <div
                className={cn(
                  'inline-flex items-center gap-1.5 text-xs font-bold px-3.5 py-1 rounded-full border shadow-xs',
                  mode === 'light'
                    ? 'bg-accent/10 border-accent/25 text-accent'
                    : 'bg-accent/15 border-accent/30 text-accent',
                )}
              >
                <Sparkles className="size-3.5" />
                <span>Isolated Saves • Dedicated Player Profiles</span>
              </div>
              <h1
                className={cn(
                  'text-4xl sm:text-5xl font-black tracking-tight drop-shadow-xs',
                  mode === 'light' ? 'text-slate-900' : 'text-white',
                )}
              >
                Who is playing?
              </h1>
              <p
                className={cn(
                  'text-sm sm:text-base font-medium max-w-xl',
                  mode === 'light' ? 'text-slate-600' : 'text-muted',
                )}
              >
                Select your player profile to load your dedicated game saves, play history, and
                settings.
              </p>
            </motion.div>

            {/* Horizontal Profile Cards Grid */}
            <div className="flex flex-wrap items-stretch justify-center gap-5 pt-2">
              {profiles.map((profile, idx) => {
                const isSelected = selectedIndex === idx
                const isActive = profile.id === activeProfile?.id
                const gamesCount = profile.games_count ?? 0
                const saveBytes = profile.total_save_bytes ?? 0
                const recentGames = profile.recent_games ?? []

                return (
                  <motion.div
                    key={profile.id}
                    animate={{
                      opacity: isEntering ? (isSelected ? 1 : 0.2) : 1,
                      scale: isEntering ? (isSelected ? 1.05 : 0.95) : 1,
                    }}
                    whileHover={!isEntering ? { y: -4, scale: 1.02 } : undefined}
                    whileTap={!isEntering ? { scale: 0.98 } : undefined}
                    transition={{ duration: 0.25 * speed, ease: [0.16, 1, 0.3, 1] }}
                    style={{
                      willChange: 'transform, opacity',
                      borderColor: isSelected ? profile.color : undefined,
                      boxShadow: isSelected
                        ? mode === 'light'
                          ? `0 16px 36px -8px ${profile.color}40, 0 0 0 2px ${profile.color}`
                          : `0 16px 36px -8px ${profile.color}45, 0 0 0 2px ${profile.color}`
                        : undefined,
                    }}
                    onMouseEnter={() => {
                      if (isSwitching) return
                      if (!isEntering && selectedIndex !== idx) {
                        playProfileSwitch()
                        setSelectedIndex(idx)
                      }
                    }}
                    className={cn(
                      'group relative flex flex-col items-center justify-between rounded-3xl p-5 transition-colors duration-200',
                      'w-52 sm:w-60 h-[22rem] sm:h-[23.5rem]',
                      'border cursor-pointer select-none',
                      mode === 'light'
                        ? isSelected
                          ? 'bg-white shadow-xl ring-2'
                          : 'bg-white/95 border-slate-200 hover:bg-white hover:border-slate-300 shadow-sm'
                        : isSelected
                          ? 'bg-surface shadow-xl ring-2'
                          : 'bg-surface/90 border-border/80 hover:bg-surface-raised hover:border-border shadow-md',
                    )}
                    onClick={() => void handleSelect(profile)}
                  >
                    {/* Top Status & Slot Row */}
                    <div className="flex w-full items-center justify-between">
                      <span
                        className={cn(
                          'text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border',
                          mode === 'light'
                            ? 'bg-slate-100 text-slate-600 border-slate-200'
                            : 'bg-surface-raised/80 text-muted border-border/50',
                        )}
                      >
                        #{idx + 1}
                      </span>

                      <div className="flex items-center gap-1.5">
                        {/* Quick Edit button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            openManagerModal(profile.id)
                          }}
                          title={`Edit ${profile.name}`}
                          className={cn(
                            'size-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 hover:scale-110 transition-all border shadow-xs cursor-pointer',
                            mode === 'light'
                              ? 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                              : 'bg-surface-raised border-border text-muted hover:text-text',
                          )}
                        >
                          <Pencil className="size-3" />
                        </button>

                        {/* Quick Delete button (for non-default profiles) */}
                        {profile.id !== 'default' && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setProfileToDelete(profile)
                            }}
                            title={`Delete ${profile.name}`}
                            className={cn(
                              'size-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 hover:scale-110 transition-all border shadow-xs cursor-pointer',
                              mode === 'light'
                                ? 'bg-rose-50 border-rose-200 text-rose-600 hover:bg-rose-100 hover:text-rose-700'
                                : 'bg-surface-raised border-border text-rose-400 hover:bg-rose-500/20 hover:border-rose-500/40 hover:text-rose-300',
                            )}
                          >
                            <Trash2 className="size-3" />
                          </button>
                        )}

                        {isActive ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase bg-emerald-500/15 border border-emerald-500/35 text-emerald-600 dark:text-emerald-400 shadow-xs">
                            <span className="size-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.7)]" />
                            Active
                          </span>
                        ) : (
                          <span
                            className={cn(
                              'text-[10px] font-bold px-2 py-0.5 rounded-full border',
                              mode === 'light'
                                ? 'bg-slate-100 text-slate-500 border-slate-200'
                                : 'bg-surface-raised/60 text-muted border-border/40',
                            )}
                          >
                            Ready
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Avatar with Halo Aura */}
                    <div className="relative my-2">
                      <div
                        className="relative flex size-20 sm:size-24 items-center justify-center rounded-full border-[2.5px] transition-transform duration-300 group-hover:scale-105 shadow-sm"
                        style={{
                          borderColor: profile.color,
                          boxShadow: isSelected
                            ? `0 0 32px ${profile.color}70, inset 0 0 16px ${profile.color}25`
                            : `0 4px 18px ${profile.color}35`,
                          backgroundColor: mode === 'light' ? '#ffffff' : '#151520',
                        }}
                      >
                        <div
                          className="flex size-full items-center justify-center rounded-full"
                          style={{ backgroundColor: `${profile.color}15` }}
                        >
                          <div style={{ color: profile.color }}>
                            <ProfileAvatarIcon
                              avatar={profile.avatar}
                              className="size-10 sm:size-12"
                            />
                          </div>
                        </div>

                        {isActive && (
                          <span
                            className="absolute -bottom-1 -right-1 flex size-6 items-center justify-center rounded-full bg-emerald-500 text-white shadow-md ring-2 ring-white dark:ring-surface"
                            title="Currently Active Profile"
                          >
                            <Check className="size-3.5 stroke-[3]" />
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Profile Name & Tag */}
                    <div className="flex flex-col items-center gap-1.5 w-full">
                      <span
                        className={cn(
                          'text-base sm:text-lg font-black tracking-tight truncate max-w-[170px] transition-colors',
                          mode === 'light' ? 'text-slate-900' : 'text-text',
                          isSelected && 'text-accent',
                        )}
                      >
                        {profile.name}
                      </span>

                      {/* Stats Row: Games & Saves */}
                      <div className="flex items-center justify-center gap-2 w-full">
                        <div
                          className={cn(
                            'flex items-center gap-1.5 text-[11px] font-bold rounded-lg px-2.5 py-1 border shadow-2xs transition-colors',
                            mode === 'light'
                              ? 'bg-slate-200/90 border-slate-300/90 text-slate-900'
                              : 'bg-surface-raised/70 border-border/60 text-muted',
                          )}
                          title={`${gamesCount} games have saves in this profile`}
                        >
                          <Gamepad2 className="size-3.5 text-accent" />
                          <span>{gamesCount} Games</span>
                        </div>

                        <div
                          className={cn(
                            'flex items-center gap-1.5 text-[11px] font-bold rounded-lg px-2.5 py-1 border shadow-2xs transition-colors',
                            mode === 'light'
                              ? 'bg-slate-200/90 border-slate-300/90 text-slate-900'
                              : 'bg-surface-raised/70 border-border/60 text-muted',
                          )}
                          title={`Total saves footprint: ${formatBytes(saveBytes)}`}
                        >
                          <HardDrive className="size-3.5 text-accent" />
                          <span>{saveBytes > 0 ? formatBytes(saveBytes) : '0 B'}</span>
                        </div>
                      </div>

                      {/* Recent Games Chips */}
                      <div className="w-full flex flex-col items-center gap-1 pt-1 min-h-[36px]">
                        {recentGames.length > 0 ? (
                          <div className="flex flex-wrap items-center justify-center gap-1 w-full max-w-[190px]">
                            {recentGames.slice(0, 2).map((title) => (
                              <span
                                key={title}
                                className={cn(
                                  'truncate max-w-[90px] text-[10px] font-bold px-2 py-0.5 rounded-md border shadow-2xs',
                                  mode === 'light'
                                    ? 'bg-slate-200/90 border-slate-300 text-slate-900'
                                    : 'bg-surface-raised/90 border-border/70 text-text/80',
                                )}
                                title={title}
                              >
                                {title}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span
                            className={cn(
                              'text-[10px] font-semibold italic pt-1',
                              mode === 'light' ? 'text-slate-600' : 'text-muted/60',
                            )}
                          >
                            Ready to play
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Bottom Action Footer on Card */}
                    <div className="w-full pt-2">
                      <div
                        className={cn(
                          'w-full py-2 px-3 rounded-2xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-xs',
                          isSelected
                            ? 'text-white shadow-md'
                            : mode === 'light'
                              ? 'bg-slate-200 border border-slate-300 text-slate-900 hover:bg-slate-300'
                              : 'bg-surface-raised/80 text-muted group-hover:bg-surface-raised group-hover:text-text',
                        )}
                        style={{
                          backgroundColor: isSelected ? profile.color : undefined,
                        }}
                      >
                        {isSwitching && isSelected ? (
                          <span className="animate-pulse">Loading saves...</span>
                        ) : isSelected ? (
                          <>
                            <span>Play as {profile.name}</span>
                            <kbd className="text-[10px] font-mono px-1 rounded bg-black/20 text-white font-bold">
                              ↵
                            </kbd>
                          </>
                        ) : (
                          <span>Select Profile</span>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )
              })}

              {/* Add Profile Card */}
              <motion.div
                animate={{
                  opacity: isEntering ? 0.15 : 1,
                  scale: isEntering ? 0.92 : 1,
                }}
                whileHover={!isEntering ? { y: -6, scale: 1.02 } : undefined}
                whileTap={!isEntering ? { scale: 0.98 } : undefined}
                transition={{ duration: 0.35 * speed, ease: [0.16, 1, 0.3, 1] }}
                onMouseEnter={() => {
                  if (isSwitching) return
                  if (!isEntering && selectedIndex !== profiles.length) {
                    playProfileSwitch()
                    setSelectedIndex(profiles.length)
                  }
                }}
                onClick={() => openManagerModal()}
                className={cn(
                  'group relative flex flex-col items-center justify-between rounded-3xl p-5 transition-all duration-300',
                  'w-52 sm:w-60 h-[22rem] sm:h-[23.5rem]',
                  'border-2 border-dashed cursor-pointer select-none',
                  mode === 'light'
                    ? selectedIndex === profiles.length
                      ? 'border-accent bg-white shadow-2xl ring-2 ring-accent/30'
                      : 'border-slate-300/90 bg-white/70 hover:border-accent hover:bg-white shadow-[0_10px_30px_-8px_rgba(15,23,42,0.06)]'
                    : selectedIndex === profiles.length
                      ? 'border-accent bg-surface shadow-2xl ring-2 ring-accent/30'
                      : 'border-border/80 bg-surface/60 hover:border-accent hover:bg-surface-raised/80 shadow-sm',
                )}
              >
                <div className="flex w-full justify-end">
                  <kbd
                    className={cn(
                      'text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border',
                      mode === 'light'
                        ? 'bg-slate-100 text-slate-500 border-slate-200'
                        : 'bg-surface-raised/80 text-muted border-border/50',
                    )}
                  >
                    A
                  </kbd>
                </div>

                <div className="my-auto flex flex-col items-center gap-3">
                  <div
                    className={cn(
                      'flex size-20 sm:size-24 items-center justify-center rounded-full border-2 border-dashed transition-all group-hover:scale-105 shadow-2xs',
                      mode === 'light'
                        ? 'border-slate-300 bg-slate-100/90 text-slate-500 group-hover:border-accent group-hover:text-accent group-hover:bg-accent/10'
                        : 'border-border/90 bg-surface-raised/60 text-muted group-hover:border-accent group-hover:text-accent group-hover:bg-accent/10',
                    )}
                  >
                    <Plus className="size-8 stroke-[2.5]" />
                  </div>
                  <div className="flex flex-col items-center gap-1 text-center">
                    <span
                      className={cn(
                        'text-base font-black transition-colors',
                        mode === 'light'
                          ? 'text-slate-900 group-hover:text-accent'
                          : 'text-text group-hover:text-accent',
                      )}
                    >
                      New Profile
                    </span>
                    <span
                      className={cn(
                        'text-xs max-w-[150px] leading-tight font-medium',
                        mode === 'light' ? 'text-slate-500' : 'text-muted',
                      )}
                    >
                      Create isolated space for a new player or walkthrough
                    </span>
                  </div>
                </div>

                <div className="w-full pt-2">
                  <div
                    className={cn(
                      'w-full py-2 px-3 rounded-2xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-xs',
                      mode === 'light'
                        ? 'bg-slate-200 border border-slate-300 text-slate-900 group-hover:bg-accent group-hover:text-white group-hover:border-accent'
                        : 'bg-surface-raised/80 text-muted group-hover:bg-accent/15 group-hover:text-accent',
                    )}
                  >
                    <Users className="size-3.5" />
                    <span>Create User</span>
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Selected Profile Detail Ribbon / Inspector */}
            {currentHoveredProfile && selectedIndex < profiles.length && (
              <div
                className={cn(
                  'min-h-[44px] flex items-center justify-center rounded-2xl border px-5 py-2 text-xs shadow-sm font-medium transition-colors duration-300',
                  mode === 'light'
                    ? 'bg-white/95 border-slate-300/80 text-slate-800 shadow-[0_4px_24px_-6px_rgba(15,23,42,0.08)]'
                    : 'bg-surface/95 border-border/80 text-muted shadow-[0_4px_24px_-6px_rgba(0,0,0,0.5)]',
                )}
              >
                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentHoveredProfile.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.18 * speed, ease: 'easeOut' }}
                    className="flex flex-wrap items-center justify-center gap-4"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="size-2.5 rounded-full shadow-2xs"
                        style={{ backgroundColor: currentHoveredProfile.color }}
                      />
                      <span
                        className={cn(
                          'font-black tracking-tight text-xs sm:text-sm',
                          mode === 'light' ? 'text-slate-900' : 'text-white',
                        )}
                      >
                        {currentHoveredProfile.name}
                      </span>
                    </div>

                    <span className={mode === 'light' ? 'text-slate-300' : 'text-subtle'}>•</span>

                    <div className="flex items-center gap-1.5">
                      <Layers className="size-3.5 text-accent" />
                      <span
                        className={cn(
                          'font-semibold',
                          mode === 'light' ? 'text-slate-700' : 'text-text/80',
                        )}
                      >
                        {currentHoveredProfile.games_count ?? 0} games managed
                      </span>
                    </div>

                    <span className={mode === 'light' ? 'text-slate-300' : 'text-subtle'}>•</span>

                    <div className="flex items-center gap-1.5">
                      <HardDrive className="size-3.5 text-accent" />
                      <span
                        className={cn(
                          'font-semibold',
                          mode === 'light' ? 'text-slate-700' : 'text-text/80',
                        )}
                      >
                        {formatBytes(currentHoveredProfile.total_save_bytes ?? 0)} total saves
                      </span>
                    </div>

                    <span className={mode === 'light' ? 'text-slate-300' : 'text-subtle'}>•</span>

                    <div className="flex items-center gap-1.5">
                      <Activity className="size-3.5 text-emerald-500" />
                      <span
                        className={cn(
                          'font-bold',
                          currentHoveredProfile.id === activeProfile?.id
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : mode === 'light'
                              ? 'text-slate-600'
                              : 'text-muted',
                        )}
                      >
                        {currentHoveredProfile.id === activeProfile?.id
                          ? 'Currently active in launcher'
                          : 'Ready to mount'}
                      </span>
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* Footer: Startup Checkbox & Keyboard Navigation Badges */}
          <div
            className={cn(
              'relative z-10 flex flex-col sm:flex-row w-full items-center justify-between gap-4 px-8 pb-6 text-xs font-medium border-t pt-4',
              mode === 'light'
                ? 'bg-white/80 border-slate-200/80 text-slate-600'
                : 'bg-background/80 border-border/40 text-muted',
            )}
          >
            {/* Startup Toggle */}
            <label className="flex items-center gap-2.5 text-xs cursor-pointer select-none transition-colors hover:text-slate-900 dark:hover:text-text font-medium">
              <input
                type="checkbox"
                checked={startupGateEnabled}
                onChange={handleToggleStartupGate}
                className="size-4 rounded border-slate-300 dark:border-border text-accent focus:ring-accent/40 bg-white dark:bg-surface cursor-pointer"
              />
              <span>Show profile selection on launcher startup</span>
              <span className="text-[11px] text-slate-400 dark:text-subtle font-normal hidden sm:inline">
                (changeable in Settings)
              </span>
            </label>

            {/* Console Keyboard Shortcuts */}
            <div className="flex flex-wrap items-center justify-center gap-3.5">
              <span className="flex items-center gap-1.5">
                <kbd
                  className={cn(
                    'rounded border px-1.5 py-0.5 text-[10px] font-mono shadow-2xs font-bold',
                    mode === 'light'
                      ? 'bg-white border-slate-200 text-slate-700'
                      : 'bg-surface border-border/80 text-text',
                  )}
                >
                  &larr; &rarr;
                </kbd>
                <span>Move</span>
              </span>

              <span className="flex items-center gap-1.5">
                <kbd
                  className={cn(
                    'rounded border px-1.5 py-0.5 text-[10px] font-mono shadow-2xs font-bold',
                    mode === 'light'
                      ? 'bg-white border-slate-200 text-slate-700'
                      : 'bg-surface border-border/80 text-text',
                  )}
                >
                  1-9
                </kbd>
                <span>Quick Pick</span>
              </span>

              <span className="flex items-center gap-1.5">
                <kbd
                  className={cn(
                    'rounded border px-2 py-0.5 text-[10px] font-mono shadow-2xs font-bold',
                    mode === 'light'
                      ? 'bg-white border-slate-200 text-slate-700'
                      : 'bg-surface border-border/80 text-text',
                  )}
                >
                  ENTER
                </kbd>
                <span>Select</span>
              </span>

              <span className="flex items-center gap-1.5">
                <kbd
                  className={cn(
                    'rounded border px-1.5 py-0.5 text-[10px] font-mono shadow-2xs font-bold',
                    mode === 'light'
                      ? 'bg-white border-slate-200 text-slate-700'
                      : 'bg-surface border-border/80 text-text',
                  )}
                >
                  E
                </kbd>
                <span>Edit</span>
              </span>

              <span className="flex items-center gap-1.5">
                <kbd
                  className={cn(
                    'rounded border px-1.5 py-0.5 text-[10px] font-mono shadow-2xs font-bold',
                    mode === 'light'
                      ? 'bg-white border-slate-200 text-slate-700'
                      : 'bg-surface border-border/80 text-text',
                  )}
                >
                  T
                </kbd>
                <span>Theme</span>
              </span>

              <span className="flex items-center gap-1.5">
                <kbd
                  className={cn(
                    'rounded border px-1.5 py-0.5 text-[10px] font-mono shadow-2xs font-bold',
                    mode === 'light'
                      ? 'bg-white border-slate-200 text-slate-700'
                      : 'bg-surface border-border/80 text-text',
                  )}
                >
                  M
                </kbd>
                <span>Manage</span>
              </span>

              {selectedIndex < profiles.length && profiles[selectedIndex]?.id !== 'default' && (
                <span className="flex items-center gap-1.5 text-rose-500 dark:text-rose-400 font-semibold">
                  <kbd
                    className={cn(
                      'rounded border px-1.5 py-0.5 text-[10px] font-mono shadow-2xs font-bold',
                      mode === 'light'
                        ? 'bg-rose-50 border-rose-200 text-rose-600'
                        : 'bg-surface border-rose-500/40 text-rose-400',
                    )}
                  >
                    DEL
                  </kbd>
                  <span>Delete</span>
                </span>
              )}

              {activeProfile && (
                <span className="flex items-center gap-1.5">
                  <kbd
                    className={cn(
                      'rounded border px-1.5 py-0.5 text-[10px] font-mono shadow-2xs font-bold',
                      mode === 'light'
                        ? 'bg-white border-slate-200 text-slate-700'
                        : 'bg-surface border-border/80 text-text',
                    )}
                  >
                    ESC
                  </kbd>
                  <span>Skip</span>
                </span>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* Delete Profile Confirmation Modal */}
      <DeleteProfileModal
        profile={profileToDelete}
        isOpen={profileToDelete !== null}
        onClose={() => setProfileToDelete(null)}
        onSuccess={() => {
          setProfileToDelete(null)
          setSelectedIndex(0)
        }}
      />
    </AnimatePresence>
  )
}
