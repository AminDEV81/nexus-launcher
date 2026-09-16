import { useState, useEffect } from 'react'
import { Plus, Trash2, Edit2, Check, User, Palette, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import type { Profile } from '@/types/models'
import { useProfileStore } from '@/store/profile-store'
import { AVATAR_ICONS } from './avatar-icons'
import { ProfileAvatarIcon } from './profile-avatar-icon'
import { AvatarPickerModal } from './avatar-picker-modal'
import { DeleteProfileModal } from './delete-profile-modal'
import { cn } from '@/lib/utils'
import { playProfileEnter } from '@/lib/sound-engine'
import { ModalCloseButton } from '@/components/ui/modal'

const PROFILE_COLORS = [
  '#7c5cff', // Nexus Violet
  '#00f0ff', // Cyber Cyan
  '#ff3366', // Crimson Pink
  '#00e676', // Emerald Green
  '#ffaa00', // Amber Orange
  '#3b82f6', // Sapphire Blue
  '#ec4899', // Hot Pink
  '#a855f7', // Electric Purple
]

const AVATAR_OPTIONS = Object.keys(AVATAR_ICONS)

export function ProfileManagerModal() {
  const isOpen = useProfileStore((s) => s.isManagerModalOpen)
  const closeModal = useProfileStore((s) => s.closeManagerModal)
  const managerModalEditProfileId = useProfileStore((s) => s.managerModalEditProfileId)
  const profiles = useProfileStore((s) => s.profiles)
  const activeProfile = useProfileStore((s) => s.activeProfile)
  const createNewProfile = useProfileStore((s) => s.createNewProfile)
  const editProfile = useProfileStore((s) => s.editProfile)
  const selectProfile = useProfileStore((s) => s.selectProfile)
  const isSwitchingProfile = useProfileStore((s) => s.isSwitchingProfile)
  const switchingProfileId = useProfileStore((s) => s.switchingProfileId)

  // Edit / Create form state
  const [isEditing, setIsEditing] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [selectedAvatar, setSelectedAvatar] = useState('gamepad')
  const [selectedColor, setSelectedColor] = useState('#7c5cff')
  const [isSaving, setIsSaving] = useState(false)
  const [profileToDelete, setProfileToDelete] = useState<Profile | null>(null)
  const [isAvatarPickerOpen, setIsAvatarPickerOpen] = useState(false)

  // Sync edit mode if opened with a specific profile ID
  useEffect(() => {
    if (!isOpen) {
      setIsEditing(false)
      setEditingId(null)
      setName('')
      setProfileToDelete(null)
      return
    }

    if (managerModalEditProfileId) {
      const target = profiles.find((p) => p.id === managerModalEditProfileId)
      if (target) {
        setIsEditing(true)
        setEditingId(target.id)
        setName(target.name)
        setSelectedAvatar(target.avatar)
        setSelectedColor(target.color)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, managerModalEditProfileId])

  // ESC handler inside modal
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        if (isEditing) {
          setIsEditing(false)
          setEditingId(null)
        } else {
          closeModal()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [isOpen, isEditing, closeModal])

  if (!isOpen) return null

  const startCreate = () => {
    setIsEditing(true)
    setEditingId(null)
    setName('')
    setSelectedAvatar('gamepad')
    setSelectedColor('#7c5cff')
  }

  const startEdit = (p: Profile) => {
    setIsEditing(true)
    setEditingId(p.id)
    setName(p.name)
    setSelectedAvatar(p.avatar)
    setSelectedColor(p.color)
  }

  const handleSave = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      toast.error('Please enter a profile name.')
      return
    }

    try {
      setIsSaving(true)
      if (editingId) {
        await editProfile(editingId, trimmed, selectedAvatar, selectedColor)
        toast.success('Profile updated!')
      } else {
        await createNewProfile(trimmed, selectedAvatar, selectedColor)
        toast.success('Profile created successfully!')
      }
      setIsEditing(false)
      setEditingId(null)
    } catch (err) {
      toast.error(`Error saving profile: ${String(err)}`)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) closeModal()
      }}
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-xs p-4"
    >
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-border bg-surface-raised shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-accent/15 text-accent border border-accent/20">
              <User className="size-4.5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-text">Manage Player Profiles</h2>
              <p className="text-[11px] text-subtle">
                Isolated save games and individual settings per player
              </p>
            </div>
          </div>
          <ModalCloseButton onClick={closeModal} />
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {isEditing ? (
            /* Edit / Create Form */
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-text">Player Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Player One"
                  maxLength={30}
                  className="rounded-xl border border-border bg-surface px-3 py-2 text-xs text-text focus:border-accent focus:outline-none"
                />
              </div>

              {/* Avatar Picker */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-text">Player Avatar</label>
                  <button
                    type="button"
                    onClick={() => setIsAvatarPickerOpen(true)}
                    className="text-xs font-bold text-accent hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Sparkles className="size-3" />
                    <span>Browse Characters &amp; Upload</span>
                  </button>
                </div>

                <div className="flex items-center gap-3.5 p-3 rounded-2xl border border-border/80 bg-surface/50">
                  <button
                    type="button"
                    onClick={() => setIsAvatarPickerOpen(true)}
                    className="relative group size-16 rounded-full border-2 transition-transform hover:scale-105 shadow-sm overflow-hidden shrink-0 cursor-pointer"
                    style={{ borderColor: selectedColor, backgroundColor: `${selectedColor}15` }}
                    title="Change Avatar"
                  >
                    <ProfileAvatarIcon avatar={selectedAvatar} className="size-full" />
                    <span className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
                      <Edit2 className="size-4" />
                    </span>
                  </button>

                  <div className="flex-1 flex flex-col gap-1.5">
                    <button
                      type="button"
                      onClick={() => setIsAvatarPickerOpen(true)}
                      className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-accent text-white text-xs font-bold shadow-xs hover:bg-accent-hover transition-colors cursor-pointer"
                    >
                      <Sparkles className="size-3.5" />
                      <span>Choose Gaming Character or Photo</span>
                    </button>
                    <span className="text-[10px] text-subtle">
                      Search IGDB / SteamGridDB characters or upload &amp; crop photo
                    </span>
                  </div>
                </div>

                {/* Quick select icons row */}
                <div className="grid grid-cols-5 gap-2 mt-1">
                  {AVATAR_OPTIONS.slice(0, 5).map((av) => {
                    const isSelected = selectedAvatar === av
                    return (
                      <button
                        key={av}
                        type="button"
                        onClick={() => setSelectedAvatar(av)}
                        className={cn(
                          'flex h-11 items-center justify-center rounded-xl border transition-all cursor-pointer',
                          isSelected
                            ? 'border-accent bg-accent/20 text-accent scale-105 shadow-xs'
                            : 'border-border bg-surface text-muted hover:text-text hover:bg-surface-raised',
                        )}
                        title={av}
                      >
                        <ProfileAvatarIcon avatar={av} className="size-5" />
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Color Picker */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-text flex items-center gap-1.5">
                  <Palette className="size-3.5" />
                  Accent Color
                </label>
                <div className="flex items-center gap-2">
                  {PROFILE_COLORS.map((clr) => {
                    const isSelected = selectedColor === clr
                    return (
                      <button
                        key={clr}
                        type="button"
                        onClick={() => setSelectedColor(clr)}
                        className={cn(
                          'size-7 rounded-full border-2 transition-all flex items-center justify-center',
                          isSelected
                            ? 'scale-110 border-white shadow-lg'
                            : 'border-transparent opacity-80 hover:opacity-100',
                        )}
                        style={{ backgroundColor: clr }}
                      >
                        {isSelected && <Check className="size-3.5 text-black stroke-[3]" />}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex justify-end gap-2 pt-2 border-t border-border/60">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditing(false)
                    setEditingId(null)
                  }}
                  className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-muted hover:text-text hover:bg-surface"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={isSaving || !name.trim()}
                  className="rounded-xl bg-accent px-5 py-2 text-xs font-bold text-white transition-opacity disabled:opacity-50 hover:bg-accent-hover"
                >
                  {isSaving ? 'Saving...' : editingId ? 'Save Changes' : 'Create Profile'}
                </button>
              </div>
            </div>
          ) : (
            /* Profiles List */
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-subtle uppercase tracking-wider">
                  Available Profiles ({profiles.length})
                </span>
                <button
                  type="button"
                  onClick={startCreate}
                  className="flex items-center gap-1 rounded-lg bg-accent/15 border border-accent/30 px-2.5 py-1 text-xs font-bold text-accent hover:bg-accent hover:text-white transition-colors"
                >
                  <Plus className="size-3.5" />
                  <span>New Profile</span>
                </button>
              </div>

              {profiles.map((p) => {
                const isActive = p.id === activeProfile?.id
                const isDefault = p.id === 'default'

                return (
                  <div
                    key={p.id}
                    className={cn(
                      'flex items-center justify-between rounded-xl border p-3 transition-colors',
                      isActive
                        ? 'border-accent/50 bg-accent/10 shadow-xs'
                        : 'border-border/80 bg-surface/60 hover:bg-surface',
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="flex size-10 items-center justify-center rounded-full text-white"
                        style={{ backgroundColor: p.color }}
                      >
                        <ProfileAvatarIcon avatar={p.avatar} className="size-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-text">{p.name}</span>
                          {isActive && (
                            <span className="rounded-full bg-emerald-500/20 border border-emerald-500/40 px-2 py-0.5 text-[9px] font-bold text-emerald-400">
                              Active
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-subtle">
                          {isDefault ? 'Primary Default Profile' : 'Local Profile'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {!isActive && (
                        <button
                          type="button"
                          onClick={async () => {
                            if (isSwitchingProfile) return
                            try {
                              playProfileEnter()
                              await selectProfile(p.id)
                              toast.success(`Switched to ${p.name}`)
                            } catch (err) {
                              toast.error(`Could not switch profile: ${String(err)}`)
                            }
                          }}
                          disabled={isSwitchingProfile}
                          className="rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-text hover:bg-surface-raised hover:border-accent/40 transition-colors disabled:opacity-50"
                        >
                          {isSwitchingProfile && switchingProfileId === p.id
                            ? 'Switching...'
                            : 'Switch'}
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => startEdit(p)}
                        title="Edit profile"
                        className="flex size-7 items-center justify-center rounded-lg border border-border/60 bg-surface text-muted hover:text-text transition-colors"
                      >
                        <Edit2 className="size-3.5" />
                      </button>

                      {!isDefault && (
                        <button
                          type="button"
                          onClick={() => setProfileToDelete(p)}
                          title="Delete profile"
                          className="flex size-7 items-center justify-center rounded-lg border border-border/60 bg-surface text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/30 transition-colors cursor-pointer"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border/70 px-5 py-3 flex justify-end bg-surface/50">
          <button
            type="button"
            onClick={closeModal}
            className="rounded-xl border border-border bg-surface px-4 py-1.5 text-xs font-semibold text-text hover:bg-surface-raised cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>

      {/* Advanced Avatar Picker (Gaming Characters, Custom Windows Photo, Classic Icons) */}
      <AvatarPickerModal
        isOpen={isAvatarPickerOpen}
        currentAvatar={selectedAvatar}
        profileColor={selectedColor}
        onClose={() => setIsAvatarPickerOpen(false)}
        onSelectAvatar={(avatar) => setSelectedAvatar(avatar)}
      />

      {/* Delete Profile Confirmation Modal */}
      <DeleteProfileModal
        profile={profileToDelete}
        isOpen={profileToDelete !== null}
        onClose={() => setProfileToDelete(null)}
      />
    </div>
  )
}
