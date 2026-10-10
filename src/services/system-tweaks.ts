import { invoke } from '@tauri-apps/api/core'

export interface SystemTweakReport {
  is_elevated: boolean
  network_tweaks_applied: boolean
  gpu_msi_applied: boolean
  bcd_tweaks_applied: boolean
  telemetry_debloated: boolean
  detected_gpus: string[]
  applied_tweaks: number
  total_tweaks: number
  optimization_score: number
}

export interface TweakActionResult {
  success: boolean
  message: string
  requires_admin: boolean
}

export interface CacheCleanReport {
  freed_bytes: number
  files_deleted: number
  paths_cleaned: string[]
}

export async function getSystemTweakStatus(): Promise<SystemTweakReport> {
  return invoke<SystemTweakReport>('get_system_tweak_status')
}

export async function createRestorePoint(): Promise<TweakActionResult> {
  return invoke<TweakActionResult>('create_restore_point')
}

export async function toggleNetworkTweaks(enable: boolean): Promise<TweakActionResult> {
  return invoke<TweakActionResult>('toggle_network_tweaks', { enable })
}

export async function toggleGpuMsiMode(enable: boolean): Promise<TweakActionResult> {
  return invoke<TweakActionResult>('toggle_gpu_msi_mode', { enable })
}

export async function toggleBcdTweaks(enable: boolean): Promise<TweakActionResult> {
  return invoke<TweakActionResult>('toggle_bcd_tweaks', { enable })
}

export async function toggleTelemetryDebloat(enable: boolean): Promise<TweakActionResult> {
  return invoke<TweakActionResult>('toggle_telemetry_debloat', { enable })
}

export async function cleanShaderCaches(): Promise<CacheCleanReport> {
  return invoke<CacheCleanReport>('clean_shader_caches')
}
