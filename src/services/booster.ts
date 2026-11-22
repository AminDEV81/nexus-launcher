import { call } from './tauri'

export interface BoostStepResult {
  id: string
  label: string
  applied: boolean
  detail: string
  /** A short stat badge — "3 apps • 1.2 GB", "512 MB", etc. `null` when there's
   *  nothing worth quantifying. */
  metric: string | null
}

export interface BoostReport {
  steps: BoostStepResult[]
  closed_apps: string[]
  freed_ram_bytes: number
}

export type BoostableAppCategory = 'browser' | 'chat_media' | 'cloud_sync' | 'utility' | string

export interface BoostableApp {
  name: string
  pid: number
  memory_bytes: number
  cpu_usage: number
  instance_count: number
  category: BoostableAppCategory
}

export function scanBoostableApps() {
  return call<BoostableApp[]>('scan_boostable_apps')
}

export function runGameBoost() {
  return call<BoostReport>('run_game_boost')
}

export function restoreGameBoost() {
  return call<BoostStepResult>('restore_game_boost')
}

export function killSelectedApps(appNames: string[]) {
  return call<BoostStepResult>('kill_selected_apps', { appNames })
}

export interface ShaderCacheEntry {
  id: string
  vendor: string
  label: string
  path: string
  size_bytes: number
  file_count: number
}

export interface LatencyTargetResult {
  name: string
  host: string
  region: string
  avg_ms: number | null
  jitter_ms: number | null
  status: 'excellent' | 'good' | 'moderate' | 'high' | 'offline'
}

export function scanShaderCaches() {
  return call<ShaderCacheEntry[]>('scan_shader_caches')
}

export function purgeShaderCaches(ids?: string[]) {
  return call<BoostStepResult>('purge_shader_caches', { ids: ids ?? null })
}

export function measureGamingLatency() {
  return call<LatencyTargetResult[]>('measure_gaming_latency')
}
