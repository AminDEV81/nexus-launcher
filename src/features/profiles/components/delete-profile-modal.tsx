import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AlertTriangle,
  Trash2,
  Gamepad2,
  HardDrive,
  Check,
  Loader2,
  ShieldAlert,
} from 'lucide-react'
import { toast } from 'sonner'
import type { Profile } from '@/types/models'
import { useProfileStore } from '@/store/profile-store'
import { useThemeStore } from '@/store/theme-store'
import { useAnimationSpeed } from '@/hooks/use-animation-speed'
import { formatBytes } from '@/features/library/utils/guess-name'
import { ModalCloseButton } from '@/components/ui/modal-close-button'
import { ProfileAvatarIcon } from './profile-avatar-icon'
import { cn } from '@/lib/utils'

export interface DeleteProfileModalProps {
  profile: Profile | null
  isOpen: boolean
  onClose: () => void
  onSuccess?: (deletedProfileId: string) => void
}

export function DeleteProfileModal({
  profile,
  isOpen,
  onClose,
  onSuccess,
}: DeleteProfileModalProps) {
  const mode = useThemeStore((s) => s.mode)
  const speed = useAnimationSpeed()
  const removeProfile = useProfileStore((s) => s.removeProfile)
  const activeProfile = useProfileStore((s) => s.activeProfile)

  const [confirmInput, setConfirmInput] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Reset inputs on opening/profile change
  useEffect(() => {
    if (isOpen) {
      setConfirmInput('')
      setIsDeleting(false)
      const timer = setTimeout(() => {
        inputRef.current?.focus()
      }, 80)
      return () => clearTimeout(timer)
    }
  }, [isOpen, profile])

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isDeleting) {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, isDeleting, onClose])

  if (!isOpen || !profile) return null

  const isDefault = profile.id === 'default'
  const isActive = profile.id === activeProfile?.id
  const targetName = profile.name.trim()
  const isMatch = confirmInput.trim().toLowerCase() === targetName.toLowerCase()
  const gamesCount = profile.games_count ?? 0
  const saveBytes = profile.total_save_bytes ?? 0

  const handleDelete = async () => {
    if (!isMatch || isDeleting || isDefault) return

    try {
      setIsDeleting(true)
      await removeProfile(profile.id)
      toast.success(
        isActive
          ? `Profile "${profile.name}" deleted. Switched back to Default profile.`
          : `Profile "${profile.name}" and isolated saves deleted.`,
      )
      onSuccess?.(profile.id)
      onClose()
    } catch (err) {
      console.error('Failed to delete profile:', err)
      toast.error(`Failed to delete profile: ${String(err)}`)
      setIsDeleting(false)
    }
  }

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (isMatch && !isDeleting) {
      void handleDelete()
    }
  }

  return (
    <AnimatePresence>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-profile-title"
        onClick={(e) => {
          if (e.target === e.currentTarget && !isDeleting) {
            onClose()
          }
        }}
        className="fixed inset-0 z-[130] flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 select-none animate-in fade-in duration-150"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 8 }}
          transition={{ duration: 0.2 * speed, ease: [0.16, 1, 0.3, 1] }}
          className={cn(
            'relative flex flex-col w-full max-w-md rounded-3xl border shadow-2xl overflow-hidden',
            mode === 'light'
              ? 'bg-white border-slate-200/90 text-slate-800 shadow-slate-900/15'
              : 'bg-[#0f0f17] border-rose-500/20 text-text shadow-rose-950/20',
          )}
        >
          {/* Cyberpunk Danger Ambient Glow in Header */}
          <div
            className="pointer-events-none absolute -top-14 left-1/2 -translate-x-1/2 size-56 rounded-full blur-3xl opacity-25"
            style={{ backgroundColor: '#f43f5e' }}
          />

          {/* Dialog Header */}
          <div className="relative flex items-center justify-between border-b border-border/70 px-6 py-4 shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-2xl bg-rose-500/15 text-rose-500 ring-1 ring-rose-500/30 shadow-[0_0_15px_rgba(244,63,94,0.2)]">
                <AlertTriangle className="size-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 id="delete-profile-title" className="text-sm font-bold text-text">
                    Delete Player Profile
                  </h2>
                  <span className="px-2 py-0.5 rounded-md text-[9px] font-mono font-bold tracking-wider uppercase bg-rose-500/15 border border-rose-500/30 text-rose-400">
                    DANGER ZONE
                  </span>
                </div>
                <p className="text-[11px] text-subtle">Permanent removal of isolated save data</p>
              </div>
            </div>

            <ModalCloseButton onClick={onClose} disabled={isDeleting} />
          </div>

          {/* Content Body */}
          <form onSubmit={handleFormSubmit} className="flex flex-col gap-4 p-6">
            {/* Target Profile Preview Card */}
            <div
              className={cn(
                'flex flex-col gap-3 rounded-2xl p-4 border transition-colors',
                mode === 'light'
                  ? 'bg-slate-50/80 border-slate-200'
                  : 'bg-surface/60 border-border/80',
              )}
            >
              <div className="flex items-center gap-3.5">
                {/* Avatar with Halo Ring */}
                <div
                  className="relative flex size-13 items-center justify-center rounded-full border-2 shrink-0 shadow-sm"
                  style={{
                    borderColor: profile.color,
                    boxShadow: `0 0 16px ${profile.color}40`,
                    backgroundColor: mode === 'light' ? '#ffffff' : '#151520',
                  }}
                >
                  <div
                    className="flex size-full items-center justify-center rounded-full"
                    style={{ backgroundColor: `${profile.color}15` }}
                  >
                    <div style={{ color: profile.color }}>
                      <ProfileAvatarIcon avatar={profile.avatar} className="size-6.5" />
                    </div>
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-text truncate">{profile.name}</span>
                    {isActive ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-500/15 border border-amber-500/35 text-amber-500 dark:text-amber-400">
                        <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" />
                        Active
                      </span>
                    ) : (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-border/60 text-subtle bg-surface">
                        Local Profile
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-subtle block truncate">
                    ID: <span className="font-mono">{profile.id}</span>
                  </span>
                </div>
              </div>

              {/* Telemetry Stats Pills */}
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/50">
                <div
                  className={cn(
                    'flex items-center gap-2 rounded-xl px-2.5 py-1.5 border text-xs',
                    mode === 'light'
                      ? 'bg-white border-slate-200 text-slate-700'
                      : 'bg-surface-raised/70 border-border/60 text-muted',
                  )}
                >
                  <Gamepad2 className="size-3.5 text-accent shrink-0" />
                  <span className="font-semibold text-[11px] truncate">{gamesCount} Games</span>
                </div>

                <div
                  className={cn(
                    'flex items-center gap-2 rounded-xl px-2.5 py-1.5 border text-xs',
                    mode === 'light'
                      ? 'bg-white border-slate-200 text-slate-700'
                      : 'bg-surface-raised/70 border-border/60 text-muted',
                  )}
                >
                  <HardDrive className="size-3.5 text-accent shrink-0" />
                  <span className="font-semibold text-[11px] truncate">
                    {saveBytes > 0 ? formatBytes(saveBytes) : '0 B'} Saves
                  </span>
                </div>
              </div>
            </div>

            {/* Warning Callout Box */}
            <div className="rounded-2xl border border-rose-500/35 bg-rose-500/10 p-3.5 flex items-start gap-3">
              <ShieldAlert className="size-4.5 text-rose-400 shrink-0 mt-0.5" />
              <div className="text-xs leading-relaxed flex-1">
                <span className="font-bold text-rose-400 block mb-0.5">Irreversible Action</span>
                <p className="text-[11px] text-muted">
                  Deleting this profile will permanently remove all isolated save files,
                  checkpoints, and history recorded under this account from disk.
                </p>
                {isActive && (
                  <p className="text-[11px] text-amber-400/90 font-medium mt-1.5 pt-1.5 border-t border-rose-500/20">
                    ⚠️ Since this profile is currently active, the launcher will automatically
                    switch back to the primary <strong>Default Profile</strong>.
                  </p>
                )}
              </div>
            </div>

            {/* Confirmation Input Field */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-text flex items-center justify-between">
                <span>
                  Type <span className="font-mono font-bold text-rose-400">"{targetName}"</span> to
                  confirm:
                </span>
                {isMatch && (
                  <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-bold">
                    <Check className="size-3 stroke-[3]" />
                    <span>Verified</span>
                  </span>
                )}
              </label>

              <div className="relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={confirmInput}
                  onChange={(e) => setConfirmInput(e.target.value)}
                  placeholder={targetName}
                  disabled={isDeleting}
                  className={cn(
                    'w-full rounded-xl border px-3.5 py-2 text-xs transition-all focus:outline-none',
                    isMatch
                      ? 'border-emerald-500/60 bg-emerald-500/5 text-text focus:ring-2 focus:ring-emerald-500/20'
                      : 'border-border bg-surface text-text focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20',
                    mode === 'light' ? 'bg-slate-50' : 'bg-surface',
                  )}
                />
              </div>
            </div>

            {/* Action Buttons Footer */}
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-border/70">
              <button
                type="button"
                onClick={onClose}
                disabled={isDeleting}
                className={cn(
                  'rounded-xl border px-4 py-2 text-xs font-semibold transition-colors cursor-pointer',
                  mode === 'light'
                    ? 'border-slate-200 text-slate-700 hover:bg-slate-100'
                    : 'border-border text-muted hover:text-text hover:bg-surface',
                )}
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={!isMatch || isDeleting || isDefault}
                className={cn(
                  'flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold text-white transition-all shadow-md cursor-pointer',
                  isMatch && !isDeleting && !isDefault
                    ? 'bg-rose-600 hover:bg-rose-500 hover:shadow-rose-600/30 active:scale-[0.98]'
                    : 'bg-rose-600/40 opacity-50 cursor-not-allowed',
                )}
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    <span>Deleting Profile...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="size-3.5" />
                    <span>Delete Profile &amp; Saves</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
