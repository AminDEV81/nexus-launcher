import { call } from './tauri'

export function getSetting(key: string) {
  return call<string | null>('get_setting', { key })
}

export function setSetting(key: string, value: string) {
  return call<void>('set_setting', { key, value })
}

export function getAllSettings() {
  return call<Record<string, string>>('get_all_settings')
}
