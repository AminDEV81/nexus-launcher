import { create } from 'zustand'
import type { Profile } from '@/types/models'
import * as profileService from '@/services/profiles'
import { getSetting } from '@/services/settings'
import { queryClient } from '@/app/query-client'

interface ProfileState {
  profiles: Profile[]
  activeProfile: Profile | null
  isLoading: boolean
  isGateOpen: boolean
  isManagerModalOpen: boolean
  managerModalEditProfileId: string | null
  isSwitchingProfile: boolean
  switchingProfileId: string | null

  // Actions
  loadProfiles: (checkStartupGate?: boolean) => Promise<void>
  selectProfile: (profileId: string) => Promise<void>
  openGate: () => void
  closeGate: () => void
  openManagerModal: (profileId?: string) => void
  closeManagerModal: () => void
  createNewProfile: (name: string, avatar?: string, color?: string) => Promise<Profile>
  editProfile: (id: string, name: string, avatar?: string, color?: string) => Promise<Profile>
  removeProfile: (id: string) => Promise<void>
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  profiles: [],
  activeProfile: null,
  isLoading: true,
  isGateOpen: false,
  isManagerModalOpen: false,
  managerModalEditProfileId: null,
  isSwitchingProfile: false,
  switchingProfileId: null,

  loadProfiles: async (checkStartupGate = false) => {
    try {
      set({ isLoading: true })
      const [list, active] = await Promise.all([
        profileService.listProfiles(),
        profileService.getActiveProfile(),
      ])

      let showGate = false
      if (checkStartupGate) {
        try {
          const settingVal = await getSetting('profile_select_on_startup')
          if (settingVal === 'true' || settingVal === null) {
            showGate = true
          }
        } catch {
          showGate = false
        }
      }

      set({
        profiles: list,
        activeProfile: active,
        isLoading: false,
        isGateOpen: showGate ? true : get().isGateOpen,
      })
    } catch (err) {
      console.error('Failed to load profiles:', err)
      set({ isLoading: false })
    }
  },

  selectProfile: async (profileId: string) => {
    if (get().isSwitchingProfile) return
    if (get().activeProfile?.id === profileId) {
      set({ isGateOpen: false })
      return
    }

    set({ isSwitchingProfile: true, switchingProfileId: profileId })
    try {
      const updated = await profileService.switchProfile(profileId)
      set((s) => ({
        activeProfile: updated,
        profiles: s.profiles.map((p) => ({
          ...p,
          is_active: p.id === profileId,
        })),
        isGateOpen: false,
        isSwitchingProfile: false,
        switchingProfileId: null,
      }))
      // Invalidate queries so per-profile playtime and stats update immediately
      void queryClient.invalidateQueries({ queryKey: ['stats'] })
      // Refresh profiles to get updated save stats (non-critical, run in background)
      void get().loadProfiles(false)
    } catch (err) {
      console.error('Failed to switch profile:', err)
      throw err
    } finally {
      set({ isSwitchingProfile: false, switchingProfileId: null })
    }
  },

  openGate: () => set({ isGateOpen: true }),
  closeGate: () => set({ isGateOpen: false }),

  openManagerModal: (profileId?: string) =>
    set({ isManagerModalOpen: true, managerModalEditProfileId: profileId ?? null }),
  closeManagerModal: () => set({ isManagerModalOpen: false, managerModalEditProfileId: null }),

  createNewProfile: async (name: string, avatar?: string, color?: string) => {
    const created = await profileService.createProfile(name, avatar, color)
    await get().loadProfiles(false)
    return created
  },

  editProfile: async (id: string, name: string, avatar?: string, color?: string) => {
    const updated = await profileService.updateProfile(id, name, avatar, color)
    await get().loadProfiles(false)
    return updated
  },

  removeProfile: async (id: string) => {
    const wasActive = get().activeProfile?.id === id
    await profileService.deleteProfile(id)
    await get().loadProfiles(false)
    if (wasActive) {
      void queryClient.invalidateQueries({ queryKey: ['stats'] })
      void queryClient.invalidateQueries({ queryKey: ['games'] })
    }
  },
}))
