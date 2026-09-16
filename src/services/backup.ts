import { call } from './tauri'

/** Mirrors `ImportSummary` in `src-tauri/src/commands/backup.rs`. */
export interface ImportSummary {
  games: number
  collections: number
  tags: number
  playtime_sessions: number
}

export function exportBackup(filePath: string) {
  return call<number>('export_backup', { filePath })
}

export function importBackup(filePath: string) {
  return call<ImportSummary>('import_backup', { filePath })
}
