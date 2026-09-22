import { call } from './tauri'
import type { Game } from '@/types/models'

export type DownloadStatus =
  'queued' | 'downloading' | 'paused' | 'extracting' | 'completed' | 'failed' | 'cancelled'

export interface DownloadInfo {
  id: string
  game_id: string
  url: string
  save_path: string
  file_path: string | null
  total_bytes: number
  downloaded_bytes: number
  status: DownloadStatus
  error_message: string | null
  speed_bps: number
  auto_extract?: boolean
  chunks?: number[]
  extract_percent?: number
  created_at: string
  updated_at: string
}

export interface DownloadProgress {
  id: string
  downloaded_bytes: number
  total_bytes: number
  speed_bps: number
  status: DownloadStatus
  error_message: string | null
  chunks?: number[]
  extract_percent?: number
}

export interface DownloadCompletedEvent {
  download_id: string
  game_id: string | null
}

export interface StartedGameDownload {
  download_id: string
  game: Game
}

export function startDownload(
  gameId: string,
  url: string,
  savePath: string,
  autoExtract: boolean = true,
) {
  return call<string>('start_download', { gameId, url, savePath, autoExtract })
}

export function startGameDownload(
  igdbId: number,
  url: string,
  savePath: string,
  autoExtract: boolean = true,
) {
  return call<StartedGameDownload>('start_game_download', { igdbId, url, savePath, autoExtract })
}

export function startBatchDownloads(params: {
  gameId?: string
  igdbId?: number
  urls: string[]
  savePath: string
  sequential: boolean
  autoExtract?: boolean
}) {
  return call<string[]>('start_batch_downloads', {
    gameId: params.gameId ?? null,
    igdbId: params.igdbId ?? null,
    urls: params.urls,
    savePath: params.savePath,
    sequential: params.sequential,
    autoExtract: params.autoExtract ?? true,
  })
}

export function pauseDownload(id: string) {
  return call<void>('pause_download', { id })
}

export function resumeDownload(id: string) {
  return call<void>('resume_download', { id })
}

export function queueDownload(id: string, queue: boolean) {
  return call<void>('queue_download', { id, queue })
}

export function queueBundle(params: { gameId?: string; savePath: string; queue: boolean }) {
  return call<void>('queue_bundle', {
    gameId: params.gameId ?? null,
    savePath: params.savePath,
    queue: params.queue,
  })
}

export function resumeQueueSequential() {
  return call<void>('resume_queue_sequential')
}

export function cancelDownload(id: string) {
  return call<void>('cancel_download', { id })
}

export function deleteDownload(id: string, deleteFile: boolean = false) {
  return call<void>('delete_download', { id, deleteFile })
}

export function getDownloads() {
  return call<DownloadInfo[]>('get_downloads')
}
