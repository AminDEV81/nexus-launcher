import { call } from './tauri'

export interface ScannedGame {
  name: string
  source: string
  executable_path: string | null
  install_path: string | null
  install_size_bytes: number | null
  steam_app_id: string | null
}

export interface StoreScanSummary {
  source: string
  found: number
}

export interface ScanResult {
  games: ScannedGame[]
  summaries: StoreScanSummary[]
}

export function scanAllStores() {
  return call<ScanResult>('scan_all_stores')
}

export function importScannedGames(games: ScannedGame[]) {
  return call<number>('import_scanned_games', { games })
}
