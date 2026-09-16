import { call } from './tauri'

export interface BoostStepResult {
  id: string
  label: string
  applied: boolean
  detail: string
  /** A short stat badge — "3 apps", "128 MB", etc. `null` when there's
   *  nothing worth quantifying. */
  metric: string | null
}

export interface BoostReport {
  steps: BoostStepResult[]
  closed_apps: string[]
}

export interface BoostableApp {
  name: string
  pid: number
}

export function scanBoostableApps() {
  return call<BoostableApp[]>('scan_boostable_apps')
}

export function runGameBoost() {
  return call<BoostReport>('run_game_boost')
}
