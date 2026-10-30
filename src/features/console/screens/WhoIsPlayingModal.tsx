import React from 'react'
import { motion } from 'framer-motion'
import { useAnimationSpeed } from '@/hooks/use-animation-speed'
import { useProfileStore } from '@/store/profile-store'
import { useConsoleStore } from '../store/console-store'
import { CONSOLE_STRINGS } from '../i18n/strings'
import { FocusScope, useFocusable } from '../nav/FocusScope'
import { Glyph } from '../ui/Glyph'

const SPRING = { type: 'spring', stiffness: 420, damping: 30, mass: 0.8 } as const

/** A round avatar and a name: no card, the focused profile simply lifts and glows. */
const ProfileButton: React.FC<{
  id: string
  name: string
  avatar: string | null
  color: string | null
  isActive: boolean
  onSelect: () => void
}> = ({ id, name, avatar, color, isActive, onSelect }) => {
  const speed = useAnimationSpeed()
  const { focusProps, isFocused } = useFocusable<HTMLButtonElement>({
    id: `profile_gate_${id}`,
    scopeId: 'console_profile_gate',
    onConfirm: onSelect,
  })
  const tint = color || '#0ea5e9'

  return (
    <button
      type="button"
      {...focusProps}
      className="group relative flex w-[11rem] select-none flex-col items-center gap-5 py-4 outline-none"
    >
      <motion.div
        className="relative flex size-[8.5rem] items-center justify-center rounded-full text-[3rem] font-semibold text-white"
        style={{ backgroundColor: tint }}
        initial={false}
        animate={{ scale: isFocused ? 1.14 : 1, opacity: isFocused ? 1 : 0.55 }}
        transition={speed === 0 ? { duration: 0 } : SPRING}
      >
        <motion.span
          aria-hidden
          className="pointer-events-none absolute -inset-[0.45rem] rounded-full ring-[0.2rem] ring-white"
          initial={false}
          animate={{ opacity: isFocused ? 1 : 0 }}
          transition={{ duration: 0.18 * speed }}
        />
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 rounded-full blur-2xl"
          style={{ backgroundColor: tint }}
          initial={false}
          animate={{ opacity: isFocused ? 0.7 : 0 }}
          transition={{ duration: 0.3 * speed }}
        />
        {avatar || name.slice(0, 1).toUpperCase()}
      </motion.div>
      <span
        className={`line-clamp-1 text-[1.35rem] font-medium transition-colors duration-200 ${
          isFocused ? 'text-white' : 'text-white/50'
        }`}
      >
        {name}
      </span>
      <span
        className={`-mt-3 h-[1.1rem] text-[0.82rem] tracking-wide text-white/40 ${
          isActive ? '' : 'invisible'
        }`}
      >
        Current
      </span>
    </button>
  )
}

export const WhoIsPlayingModal: React.FC<{
  open: boolean
  onDone: () => void
}> = ({ open, onDone }) => {
  const profiles = useProfileStore((s) => s.profiles)
  const activeProfile = useProfileStore((s) => s.activeProfile)
  const selectProfile = useProfileStore((s) => s.selectProfile)
  const lang = useConsoleStore((s) => s.language)
  const t = CONSOLE_STRINGS[lang]

  if (!open || profiles.length <= 1) return null

  const handleChoose = async (id: string) => {
    await selectProfile(id)
    onDone()
  }

  return (
    <motion.div
      className="fixed inset-0 z-[240] flex select-none flex-col items-center justify-center bg-[#06070b]/96 p-10"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
    >
      <h1 className="mb-14 text-[2.6rem] font-medium tracking-tight text-white">
        {t.home.whoIsPlaying}
      </h1>

      <FocusScope
        id="console_profile_gate"
        trapFocus
        orientation="horizontal"
        className="flex flex-wrap items-start justify-center gap-10"
      >
        {profiles.map((p) => (
          <ProfileButton
            key={p.id}
            id={p.id}
            name={p.name}
            avatar={p.avatar}
            color={p.color}
            isActive={activeProfile?.id === p.id}
            onSelect={() => {
              void handleChoose(p.id)
            }}
          />
        ))}
      </FocusScope>

      <div className="mt-20 flex items-center gap-8 text-white/45">
        <Glyph button="confirm" label={t.actions.select} />
        <Glyph button="back" label={t.actions.cancel} />
      </div>
    </motion.div>
  )
}
