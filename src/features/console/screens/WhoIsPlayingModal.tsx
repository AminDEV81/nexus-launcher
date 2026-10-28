import React from 'react'
import { UserCheck, ShieldCheck } from 'lucide-react'
import { useProfileStore } from '@/store/profile-store'
import { useConsoleStore } from '../store/console-store'
import { CONSOLE_STRINGS } from '../i18n/strings'
import { FocusScope, useFocusable } from '../nav/FocusScope'
import { Glyph } from '../ui/Glyph'

const ProfileCardButton: React.FC<{
  id: string
  name: string
  avatar: string | null
  color: string | null
  isActive: boolean
  onSelect: () => void
}> = ({ id, name, avatar, color, isActive, onSelect }) => {
  const { focusProps, isFocused } = useFocusable<HTMLButtonElement>({
    id: `profile_gate_${id}`,
    scopeId: 'console_profile_gate',
    onConfirm: onSelect,
  })

  return (
    <button
      type="button"
      {...focusProps}
      className={`group relative flex flex-col items-center justify-center w-56 h-64 rounded-3xl border p-6 transition-all duration-200 select-none ${
        isFocused
          ? 'scale-110 z-10 border-cyan-300 bg-slate-900/95 ring-4 ring-cyan-400/50 shadow-[0_20px_50px_rgba(0,229,255,0.4)]'
          : 'border-white/10 bg-slate-900/65 opacity-80 hover:opacity-100'
      }`}
    >
      <div
        className="w-24 h-24 rounded-full flex items-center justify-center text-4xl font-black text-white shadow-xl mb-4 border-2 border-white/20"
        style={{ backgroundColor: color || '#0ea5e9' }}
      >
        {avatar || name.slice(0, 1).toUpperCase()}
      </div>
      <span className="text-xl font-extrabold text-white tracking-tight line-clamp-1">{name}</span>
      {isActive && (
        <span className="mt-2 inline-flex items-center gap-1 px-3 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-bold">
          <UserCheck className="w-3.5 h-3.5" />
          Active
        </span>
      )}
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
    <div className="fixed inset-0 z-[240] bg-slate-950/95 backdrop-blur-xl flex flex-col items-center justify-center p-10 select-none">
      <div className="flex items-center gap-2 text-cyan-400 text-xs font-extrabold uppercase tracking-[0.25em] mb-3">
        <ShieldCheck className="w-4 h-4" />
        Save Guardian Profile Isolation
      </div>
      <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight mb-2">
        {t.home.whoIsPlaying}
      </h1>
      <p className="text-base text-slate-400 mb-10 max-w-lg text-center">
        {t.home.chooseProfileSub}
      </p>

      <FocusScope
        id="console_profile_gate"
        trapFocus
        orientation="horizontal"
        className="flex flex-wrap items-center justify-center gap-6"
      >
        {profiles.map((p) => (
          <ProfileCardButton
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

      <div className="mt-12 flex items-center gap-6 text-slate-400">
        <Glyph button="confirm" label={t.actions.select} />
        <Glyph button="back" label={t.actions.cancel} />
      </div>
    </div>
  )
}
