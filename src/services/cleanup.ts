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
