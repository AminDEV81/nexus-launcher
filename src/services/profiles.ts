import type { Profile } from '@/types/models'
import { call } from './tauri'

export function listProfiles(): Promise<Profile[]> {
  return call<Profile[]>('list_profiles')
}

export function getActiveProfile(): Promise<Profile> {
  return call<Profile>('get_active_profile')
}

export function createProfile(name: string, avatar?: string, color?: string): Promise<Profile> {
  return call<Profile>('create_profile', { name, avatar, color })
}

export function updateProfile(
  id: string,
  name: string,
  avatar?: string,
  color?: string,
): Promise<Profile> {
  return call<Profile>('update_profile', { id, name, avatar, color })
}

export function deleteProfile(id: string): Promise<void> {
  return call<void>('delete_profile', { id })
}

export function switchProfile(newProfileId: string): Promise<Profile> {
  return call<Profile>('switch_profile', { newProfileId })
}

export interface GamingAvatarItem {
  id: string
  name: string
  source: string
  image_url: string
  preview_url: string
  subtitle?: string
}

export function searchGamingAvatars(
  query: string,
  offset = 0,
  limit = 24,
): Promise<GamingAvatarItem[]> {
  return call<GamingAvatarItem[]>('search_gaming_avatars', { query, offset, limit })
}

export function downloadAvatarDataUrl(url: string): Promise<string> {
  return call<string>('download_avatar_data_url', { url })
}
