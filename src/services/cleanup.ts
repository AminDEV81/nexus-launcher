import { invoke } from '@tauri-apps/api/core'

export type CleanupCategory =
  'orphaned_saves' | 'save_snapshots' | 'orphaned_artworks' | 'legacy_appdata' | 'staging_cache'

export interface CleanupItem {
  id: string
  category: CleanupCategory
  title: string
  subtitle: string
  path: string
  size_bytes: number
  item_count: number
  is_safe: boolean
  game_id?: string | null
  profile_id?: string | null
}

export interface CleanupScanReport {
  items: CleanupItem[]
  total_reclaimable_bytes: number
  total_items_count: number
  live_saves_protected_bytes: number
}

export interface CleanupExecuteReport {
  freed_bytes: number
  deleted_items_count: number
  errors: string[]
}

export async function scanCleanupTargets(): Promise<CleanupScanReport> {
  return invoke<CleanupScanReport>('scan_cleanup_targets')
}

export async function executeCleanup(itemIds: string[]): Promise<CleanupExecuteReport> {
  return invoke<CleanupExecuteReport>('execute_cleanup', { itemIds })
}

export interface DriveStorageInfo {
  mount_point: string
  label: string
  total_bytes: number
  available_bytes: number
  used_bytes: number
  games_bytes: number
  game_count: number
}

export interface GameStorageNode {
  id: string
  name: string
  install_path: string
  drive_mount: string
  size_bytes: number
  playtime_seconds: number
  last_played_at: string | null
  days_since_played: number | null
  is_stale: boolean
  cover_url: string | null
}

export interface RedistCleanTarget {
  id: string
  game_id: string
  game_name: string
  category: 'redist' | 'crash_dump'
  label: string
  path: string
  size_bytes: number
  file_count: number
}

export interface StorageAnalysisReport {
  drives: DriveStorageInfo[]
  games: GameStorageNode[]
  redists: RedistCleanTarget[]
  total_games_bytes: number
  total_reclaimable_redist_bytes: number
  stale_games_bytes: number
  stale_games_count: number
}

export async function analyzeStorageAndRedists(): Promise<StorageAnalysisReport> {
  return invoke<StorageAnalysisReport>('analyze_storage_and_redists')
}

export async function cleanRedistTargets(paths: string[]): Promise<CleanupExecuteReport> {
  return invoke<CleanupExecuteReport>('clean_redist_targets', { paths })
}
