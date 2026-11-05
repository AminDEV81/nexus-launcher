import React, { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Plus, Sparkles, UserPlus, Image as ImageIcon, X } from 'lucide-react'
import { toast } from 'sonner'
import type { Profile } from '@/types/models'
import { playProfileEnter } from '@/lib/sound-engine'
import { useAnimationSpeed } from '@/hooks/use-animation-speed'
import { useProfileStore } from '@/store/profile-store'
import { ProfileAvatarIcon } from '@/features/profiles/components/profile-avatar-icon'
import { AVATAR_ICONS } from '@/features/profiles/components/avatar-icons'
import { AvatarPickerModal } from '@/features/profiles/components/avatar-picker-modal'
import { FocusScope, useFocusable, consoleNavController } from '../nav/FocusScope'
import { Glyph } from '../ui/Glyph'
import { consoleSoundEngine } from '../audio/ui-sounds'

const SPRING = { type: 'spring', stiffness: 320, damping: 28, mass: 0.85 } as const
const MORPH_SPRING = { type: 'spring', stiffness: 180, damping: 24, mass: 1.0 } as const

const PROFILE_COLORS = [
  '#00e5ff',
  '#7c5cff',
  '#ff3366',
  '#10b981',
  '#f59e0b',
  '#3b82f6',
  '#ec4899',
  '#a855f7',
]

const AVATAR_KEYS = Object.keys(AVATAR_ICONS)

/**
 * Pure PS5-style profile circle (#1) with shared `layoutId` so selecting a user
 * physically morphs and glides the avatar & name from the row into the center welcome stage!
 */
const Ps5ProfileCircle: React.FC<{
  profile: Profile
  onSelect: () => void
  onFocusCircle: () => void
}> = ({ profile, onSelect, onFocusCircle }) => {
  const speed = useAnimationSpeed()
  const { focusProps, isFocused } = useFocusable<HTMLButtonElement>({
    id: `profile_gate_${profile.id}`,
    scopeId: 'console_profile_gate',
    onFocus: onFocusCircle,
    onConfirm: onSelect,
  })
  const tint = profile.color || '#00e5ff'

  return (
    <motion.button
      type="button"
      {...focusProps}
      initial={{ opacity: 0, y: 20, scale: 0.9 }}
      animate={{
        opacity: isFocused ? 1 : 0.62,
        scale: isFocused ? 1.14 : 1,
        y: isFocused ? -10 : 0,
      }}
      exit={{ opacity: 0, scale: 0.85, filter: 'blur(8px)' }}
      transition={speed === 0 ? { duration: 0 } : SPRING}
      className="group relative flex flex-col items-center gap-5 outline-none select-none cursor-pointer px-3 py-2"
    >
      <div className="relative">
        {/* Ambient Halo behind the circle when focused */}
        <div
          className="pointer-events-none absolute -inset-4 rounded-full blur-2xl transition-opacity duration-300"
          style={{
            backgroundColor: tint,
            opacity: isFocused ? 0.65 : 0,
          }}
        />

        {/* Outer PS5 Focus Ring with shared layoutId for smooth morph into center stage */}
        <motion.div
          layoutId={`ps5-profile-avatar-${profile.id}`}
          transition={MORPH_SPRING}
          className={`relative flex size-36 sm:size-40 items-center justify-center overflow-hidden rounded-full ${
            isFocused
              ? 'ring-[4px] ring-white shadow-[0_0_50px_rgba(255,255,255,0.45)]'
              : 'ring-2 ring-white/20'
          }`}
          style={{ backgroundColor: `${tint}28`, color: tint }}
        >
          <ProfileAvatarIcon
            avatar={profile.avatar ?? undefined}
            className="size-full object-cover text-white"
          />
        </motion.div>
      </div>

      {/* Only the profile name underneath (#1) */}
      <motion.span
        layoutId={`ps5-profile-name-${profile.id}`}
        transition={MORPH_SPRING}
        className={`max-w-[11rem] truncate text-2xl font-bold tracking-tight transition-colors duration-200 ${
          isFocused ? 'text-white drop-shadow-[0_2px_12px_rgba(255,255,255,0.4)]' : 'text-white/55'
        }`}
      >
        {profile.name}
      </motion.span>
    </motion.button>
  )
}

/**
 * Pure PS5-style circular '+' button next to profiles (#1 & #3).
 */
const Ps5AddUserCircle: React.FC<{
  disabled: boolean
  onOpenCreate: () => void
  onFocusCircle: () => void
}> = ({ disabled, onOpenCreate, onFocusCircle }) => {
  const speed = useAnimationSpeed()
  const { focusProps, isFocused } = useFocusable<HTMLButtonElement>({
    id: 'profile_gate_add_new_user',
    scopeId: 'console_profile_gate',
    disabled,
    onFocus: onFocusCircle,
    onConfirm: onOpenCreate,
  })

  return (
    <motion.button
      type="button"
      {...focusProps}
      initial={{ opacity: 0, y: 20, scale: 0.9 }}
      animate={{
        opacity: disabled ? 0 : isFocused ? 1 : 0.62,
        scale: isFocused ? 1.14 : 1,
        y: isFocused ? -10 : 0,
      }}
      exit={{ opacity: 0, scale: 0.85, filter: 'blur(8px)' }}
      transition={speed === 0 ? { duration: 0 } : SPRING}
      className="group relative flex flex-col items-center gap-5 outline-none select-none cursor-pointer px-3 py-2"
    >
      <div className="relative">
        <div
          className={`pointer-events-none absolute -inset-4 rounded-full bg-cyan-400 blur-2xl transition-opacity duration-300 ${
            isFocused ? 'opacity-55' : 'opacity-0'
          }`}
        />
        <div
          className={`relative flex size-36 sm:size-40 items-center justify-center rounded-full transition-all duration-200 ${
            isFocused
              ? 'bg-white text-slate-950 ring-[4px] ring-cyan-300 shadow-[0_0_50px_rgba(0,229,255,0.6)]'
              : 'bg-white/10 text-white/80 ring-2 ring-white/25 hover:bg-white/15'
          }`}
        >
          <Plus className="size-16 stroke-[2.2]" />
        </div>
      </div>

      <span
        className={`text-2xl font-bold tracking-tight transition-colors duration-200 ${
          isFocused ? 'text-white' : 'text-white/55'
        }`}
      >
        Add User
      </span>
    </motion.button>
  )
}

export const WhoIsPlayingModal: React.FC<{
  open: boolean
  onDone: () => void
}> = ({ open, onDone }) => {
  const profiles = useProfileStore((s) => s.profiles)
  const activeProfile = useProfileStore((s) => s.activeProfile)
  const selectProfile = useProfileStore((s) => s.selectProfile)
  const createNewProfile = useProfileStore((s) => s.createNewProfile)

  const [hoveredColor, setHoveredColor] = useState<string>('#00e5ff')
  const [morphingProfile, setMorphingProfile] = useState<Profile | null>(null)
  const [morphPhase, setMorphPhase] = useState<'idle' | 'center' | 'portal'>('idle')

  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newAvatar, setNewAvatar] = useState('gamepad')
  const [newColor, setNewColor] = useState('#00e5ff')
  const [creating, setCreating] = useState(false)
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false)

  useEffect(() => {
    if (!open) {
      setMorphingProfile(null)
      setMorphPhase('idle')
      return
    }
    if (createOpen) return
    const targetId = activeProfile?.id ?? profiles[0]?.id
    if (!targetId) return
    const focusKey = `profile_gate_${targetId}`
    const timer = window.setTimeout(() => {
      consoleNavController.setFocus(focusKey, false)
    }, 30)
    return () => window.clearTimeout(timer)
  }, [open, createOpen, activeProfile, profiles])

  const handleChoose = async (profile: Profile) => {
    if (morphingProfile) return
    consoleSoundEngine.unlock()
    playProfileEnter()
    consoleSoundEngine.play('confirm')
    setMorphingProfile(profile)
    setMorphPhase('center')
    setHoveredColor(profile.color || '#00e5ff')

    try {
      await selectProfile(profile.id)
    } catch {
      // Ignore error
    }

    // Stage 1 (0ms -> 1150ms): Selected profile circle glides & morphs to center stage with welcome aura
    window.setTimeout(() => {
      setMorphPhase('portal')
    }, 1150)

    // Stage 2 (1150ms -> 1750ms): Smooth portal zoom & dissolve into Console Home screen
    window.setTimeout(() => {
      onDone()
    }, 1750)
  }

  const handleCreateProfile = async () => {
    const trimmed = newName.trim()
    if (!trimmed) {
      toast.error('Please enter a profile name')
      return
    }
    if (creating) return
    setCreating(true)
    try {
      const created = await createNewProfile(trimmed, newAvatar, newColor)
      toast.success(`Profile "${created.name}" created!`)
      setCreateOpen(false)
      setNewName('')
      await handleChoose(created)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create profile')
    } finally {
      setCreating(false)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="console-who-is-playing"
          initial={{ opacity: 0 }}
          animate={{
            opacity: morphPhase === 'portal' ? 0 : 1,
            scale: morphPhase === 'portal' ? 1.12 : 1,
            filter: morphPhase === 'portal' ? 'blur(18px)' : 'blur(0px)',
          }}
          exit={{ opacity: 0, scale: 1.14, filter: 'blur(20px)' }}
          transition={{ duration: 0.72, ease: [0.16, 1, 0.3, 1] }}
          className="fixed inset-0 z-[240] flex select-none flex-col items-center justify-between overflow-hidden bg-[#070b18]/95 backdrop-blur-2xl p-12"
        >
          {/* Dynamic Per-Profile Radial Aura */}
          <motion.div
            animate={{
              scale: morphPhase !== 'idle' ? 1.35 : 1,
              opacity: morphPhase === 'portal' ? 0 : 1,
              background: `radial-gradient(circle at 50% 48%, ${hoveredColor}45 0%, rgba(59,130,246,0.16) 45%, transparent 72%)`,
            }}
            transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
            className="pointer-events-none absolute inset-0"
          />

          <div />

          {/* Center Stage: Morphing Welcome OR Pure PS5 Circles */}
          <div className="relative z-10 my-auto flex flex-col items-center text-center max-w-6xl w-full">
            <AnimatePresence mode="popLayout">
              {morphingProfile ? (
                <motion.div
                  key="morph-welcome"
                  initial={{ opacity: 0 }}
                  animate={{
                    opacity: 1,
                    scale: morphPhase === 'portal' ? 1.18 : 1,
                    y: morphPhase === 'portal' ? -18 : 0,
                  }}
                  exit={{ opacity: 0, scale: 1.2 }}
                  transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
                  className="flex flex-col items-center py-12"
                >
                  <div className="relative mb-8">
                    {/* Expanding PS5 shockwave rings */}
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0.85 }}
                      animate={{ scale: 2.3, opacity: 0 }}
                      transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
                      className="pointer-events-none absolute inset-0 rounded-full border-2"
                      style={{ borderColor: morphingProfile.color || '#00e5ff' }}
                    />
                    <motion.div
                      initial={{ scale: 0.9, opacity: 0.4 }}
                      animate={{ scale: 1.45, opacity: 0.7 }}
                      transition={{ duration: 1.1, ease: 'easeOut' }}
                      className="pointer-events-none absolute -inset-6 rounded-full blur-2xl"
                      style={{ backgroundColor: morphingProfile.color || '#00e5ff' }}
                    />

                    <motion.div
                      layoutId={`ps5-profile-avatar-${morphingProfile.id}`}
                      transition={MORPH_SPRING}
                      className="relative flex size-44 sm:size-48 items-center justify-center overflow-hidden rounded-full ring-4 ring-white bg-slate-950 shadow-[0_0_70px_rgba(255,255,255,0.45)]"
                      style={{ backgroundColor: `${morphingProfile.color || '#00e5ff'}28` }}
                    >
                      <ProfileAvatarIcon
                        avatar={morphingProfile.avatar ?? undefined}
                        className="size-full object-cover text-white"
                      />
                    </motion.div>
                  </div>

                  <motion.div
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.18, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
                    className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.28em] text-cyan-300"
                  >
                    <Sparkles className="size-3.5" />
                    Welcome Back to Nexus
                  </motion.div>

                  <motion.h1
                    layoutId={`ps5-profile-name-${morphingProfile.id}`}
                    transition={MORPH_SPRING}
                    className="mt-3 text-5xl sm:text-6xl font-black tracking-tight text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.6)]"
                  >
                    {morphingProfile.name}
                  </motion.h1>
                </motion.div>
              ) : (
                <motion.div
                  key="profile-grid"
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.94, filter: 'blur(6px)' }}
                  transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                  className="flex flex-col items-center w-full"
                >
                  <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-white mb-16">
                    Who&apos;s Playing?
                  </h1>

                  <FocusScope
                    id="console_profile_gate"
                    trapFocus={!createOpen}
                    wrap
                    orientation="horizontal"
                    className="flex flex-wrap items-center justify-center gap-12"
                  >
                    {profiles.map((p) => (
                      <Ps5ProfileCircle
                        key={p.id}
                        profile={p}
                        onFocusCircle={() => setHoveredColor(p.color || '#00e5ff')}
                        onSelect={() => {
                          void handleChoose(p)
                        }}
                      />
                    ))}

                    <Ps5AddUserCircle
                      disabled={Boolean(morphingProfile)}
                      onFocusCircle={() => setHoveredColor('#00e5ff')}
                      onOpenCreate={() => {
                        consoleSoundEngine.play('confirm')
                        setCreateOpen(true)
                      }}
                    />
                  </FocusScope>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Minimalist PS5 Bottom Control Legend */}
          <motion.div
            animate={{ opacity: morphingProfile ? 0 : 1 }}
            transition={{ duration: 0.3 }}
            className="relative z-10 flex items-center gap-8 text-white/60"
          >
            <Glyph button="confirm" label="Select" />
            <Glyph button="back" label="Cancel" />
          </motion.div>

          {/* Create New User Modal */}
          <AnimatePresence>
            {createOpen && (
              <motion.div
                key="console-create-user-modal"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[260] flex items-center justify-center bg-black/80 backdrop-blur-xl p-6"
              >
                <FocusScope
                  id="console_create_user_scope"
                  trapFocus
                  orientation="vertical"
                  className="relative w-full max-w-2xl rounded-3xl border border-cyan-400/35 bg-gradient-to-b from-[#11182d] via-[#0c1222] to-[#080b16] p-8 shadow-[0_30px_90px_rgba(0,0,0,0.9)]"
                >
                  <div className="flex items-center justify-between border-b border-white/10 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="flex size-11 items-center justify-center rounded-2xl bg-cyan-400/20 border border-cyan-400/40 text-cyan-300">
                        <UserPlus className="size-6" />
                      </div>
                      <div>
                        <h2 className="text-2xl font-black text-white">Create New User</h2>
                        <p className="text-xs text-slate-400">
                          Choose an avatar, halo color, and player name
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCreateOpen(false)}
                      className="rounded-xl border border-white/15 bg-white/5 p-2 text-slate-300 hover:bg-white/10 hover:text-white cursor-pointer"
                    >
                      <X className="size-5" />
                    </button>
                  </div>

                  <div className="mt-6 flex flex-col sm:flex-row items-center gap-6">
                    <div className="relative shrink-0">
                      <div
                        className="flex size-28 items-center justify-center overflow-hidden rounded-full border-4 bg-slate-950 shadow-2xl"
                        style={{
                          borderColor: newColor,
                          boxShadow: `0 0 35px ${newColor}55`,
                        }}
                      >
                        <div
                          className="flex size-full items-center justify-center overflow-hidden rounded-full"
                          style={{ backgroundColor: `${newColor}20`, color: newColor }}
                        >
                          <ProfileAvatarIcon
                            avatar={newAvatar}
                            className="size-full object-cover text-white"
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAvatarPickerOpen(true)}
                        className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl border border-cyan-400/40 bg-cyan-500/15 px-3 py-1.5 text-xs font-extrabold text-cyan-300 hover:bg-cyan-500/25 cursor-pointer"
                      >
                        <ImageIcon className="size-3.5" />
                        <span>HD Gallery / Upload</span>
                      </button>
                    </div>

                    <div className="flex-1 w-full space-y-4">
                      <div>
                        <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-300 mb-2">
                          Player Name
                        </label>
                        <input
                          type="text"
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          placeholder="e.g. Player One..."
                          autoFocus
                          maxLength={28}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void handleCreateProfile()
                          }}
                          className="w-full rounded-2xl border-2 border-white/15 bg-slate-950/90 px-4 py-3.5 text-lg font-bold text-white outline-none focus:border-cyan-400"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-300 mb-2">
                          Emblem Icon
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {AVATAR_KEYS.map((key) => {
                            const selected = newAvatar === key
                            return (
                              <button
                                key={key}
                                type="button"
                                onClick={() => setNewAvatar(key)}
                                className={`flex size-10 items-center justify-center rounded-xl border transition-all cursor-pointer ${
                                  selected
                                    ? 'scale-110 border-cyan-300 bg-cyan-400/25 text-white shadow-md'
                                    : 'border-white/10 bg-white/5 text-slate-400 hover:text-white'
                                }`}
                              >
                                <ProfileAvatarIcon avatar={key} className="size-5" />
                              </button>
                            )
                          })}
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-300 mb-2">
                          Profile Color
                        </label>
                        <div className="flex flex-wrap gap-2.5">
                          {PROFILE_COLORS.map((hex) => {
                            const selected = newColor === hex
                            return (
                              <button
                                key={hex}
                                type="button"
                                onClick={() => setNewColor(hex)}
                                style={{ backgroundColor: hex }}
                                className={`size-8 rounded-full transition-all cursor-pointer ${
                                  selected
                                    ? 'scale-125 ring-2 ring-white ring-offset-2 ring-offset-slate-950'
                                    : 'opacity-70 hover:opacity-100'
                                }`}
                              />
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-8 flex items-center justify-end gap-3 border-t border-white/10 pt-5">
                    <button
                      type="button"
                      onClick={() => setCreateOpen(false)}
                      className="rounded-2xl border border-white/15 bg-white/5 px-6 py-3 text-sm font-bold text-slate-200 hover:bg-white/10 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={creating}
                      onClick={() => void handleCreateProfile()}
                      className="rounded-2xl bg-cyan-400 px-7 py-3 text-sm font-extrabold text-slate-950 shadow-[0_0_30px_rgba(0,229,255,0.45)] hover:bg-cyan-300 cursor-pointer"
                    >
                      {creating ? 'Creating...' : 'Create & Sign In'}
                    </button>
                  </div>
                </FocusScope>
              </motion.div>
            )}
          </AnimatePresence>

          <AvatarPickerModal
            isOpen={avatarPickerOpen}
            currentAvatar={newAvatar}
            profileColor={newColor}
            onClose={() => setAvatarPickerOpen(false)}
            onSelectAvatar={(av: string) => {
              setNewAvatar(av)
              setAvatarPickerOpen(false)
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
