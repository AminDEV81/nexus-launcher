import { call } from './tauri'

/** Mirrors `ImportSummary` in `src-tauri/src/commands/backup.rs`. */
export interface ImportSummary {
  games: number
  collections: number
  tags: number
  playtime_sessions: number
}

export interface BackupStats {
  games: number
  collections: number
  tags: number
  playtime_sessions: number
  profiles: number
  saves: number
  settings: number
  downloads: number
  soundtrack_albums: number
  soundtrack_tracks: number
  soundtrack_favorites: number
  artwork_cache: number
  metadata_cache: number
}

export function getBackupStats() {
  return call<BackupStats>('get_backup_stats')
}

export function exportBackup(filePath: string, tables?: string[]) {
  return call<number>('export_backup', { filePath, tables })
}

export function importBackup(filePath: string) {
  return call<ImportSummary>('import_backup', { filePath })
}
