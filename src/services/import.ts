import { call } from './tauri'

export interface ResolvedShortcut {
  target_path: string | null
  working_dir: string | null
  arguments: string | null
}

export interface ExecutableCandidate {
  path: string
  file_name: string
  size_bytes: number
}

export function resolveShortcut(path: string) {
  return call<ResolvedShortcut>('resolve_shortcut', { path })
}

export function scanFolderForExecutables(folderPath: string) {
  return call<ExecutableCandidate[]>('scan_folder_for_executables', { folderPath })
}

export function computePathSize(path: string) {
  return call<number>('compute_path_size', { path })
}
