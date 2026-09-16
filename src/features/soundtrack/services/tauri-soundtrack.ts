import { call } from '@/services/tauri'
import type {
  SoundtrackAlbum,
  SoundtrackAlbumWithTracks,
  SoundtrackFavorite,
  SoundtrackLocalFile,
  SoundtrackPlayHistory,
  SoundtrackTrack,
} from '../types'

export interface DownloadSoundtrackRequest {
  download_id: string
  track_id?: string | null
  album_id?: string | null
  game_id?: string | null
  url: string
  target_path: string
}

export interface SoundtrackDownloadRow {
  id: string
  track_id: string | null
  album_id: string | null
  game_id: string | null
  url: string
  save_path: string
  total_bytes: number
  downloaded_bytes: number
  status: string
  error_message: string | null
  speed_bps: number
  created_at: string
  updated_at: string
}

export function resolveGameSoundtracks(gameId: string): Promise<SoundtrackAlbumWithTracks[]> {
  return call<SoundtrackAlbumWithTracks[]>('soundtrack_resolve_game', { gameId })
}

export function getSoundtrackAlbum(albumId: string): Promise<SoundtrackAlbumWithTracks | null> {
  return call<SoundtrackAlbumWithTracks | null>('soundtrack_get_album', { albumId })
}

export function getAllSoundtrackAlbums(): Promise<SoundtrackAlbum[]> {
  return call<SoundtrackAlbum[]>('soundtrack_get_all_albums')
}

export function saveSoundtrackAlbum(
  album: SoundtrackAlbum,
  tracks: SoundtrackTrack[],
): Promise<void> {
  return call<void>('soundtrack_save_album', { album, tracks })
}

export function toggleSoundtrackFavorite(targetType: string, targetId: string): Promise<boolean> {
  return call<boolean>('soundtrack_toggle_favorite', { targetType, targetId })
}

export function getSoundtrackFavorites(): Promise<SoundtrackFavorite[]> {
  return call<SoundtrackFavorite[]>('soundtrack_get_favorites')
}

export function recordSoundtrackPlay(
  trackId: string,
  albumId: string | null,
  gameId: string | null,
  durationPlayedMs: number,
  completed: boolean,
): Promise<void> {
  return call<void>('soundtrack_record_play', {
    trackId,
    albumId,
    gameId,
    durationPlayedMs,
    completed,
  })
}

export function getSoundtrackPlayHistory(limit = 50): Promise<SoundtrackPlayHistory[]> {
  return call<SoundtrackPlayHistory[]>('soundtrack_get_history', { limit })
}

export function getSoundtrackCache(key: string): Promise<string | null> {
  return call<string | null>('soundtrack_cache_get', { key })
}

export function setSoundtrackCache(key: string, dataJson: string, ttlSecs = 86400): Promise<void> {
  return call<void>('soundtrack_cache_set', { key, dataJson, ttlSecs })
}

export function startSoundtrackDownload(req: DownloadSoundtrackRequest): Promise<void> {
  return call<void>('soundtrack_download', { req })
}

export function cancelSoundtrackDownload(downloadId: string): Promise<boolean> {
  return call<boolean>('soundtrack_cancel_download', { downloadId })
}

export function getSoundtrackDownloads(): Promise<SoundtrackDownloadRow[]> {
  return call<SoundtrackDownloadRow[]>('soundtrack_get_downloads')
}

export function getSoundtrackDownloadDirectory(): Promise<string> {
  return call<string>('soundtrack_get_download_directory')
}

export function setSoundtrackDownloadDirectory(path: string): Promise<void> {
  return call<void>('soundtrack_set_download_directory', { path })
}

export function scanSoundtrackLibrary(paths?: string[]): Promise<SoundtrackLocalFile[]> {
  return call<SoundtrackLocalFile[]>('soundtrack_scan_library', { paths: paths ?? null })
}

export function getSoundtrackLocalFiles(): Promise<SoundtrackLocalFile[]> {
  return call<SoundtrackLocalFile[]>('soundtrack_get_local_files')
}

export interface YouTubeTrackResult {
  video_id: string
  title: string
  channel: string
  duration_seconds: number | null
}

export function soundtrackSearchYouTube(query: string, limit = 5): Promise<YouTubeTrackResult[]> {
  return call<YouTubeTrackResult[]>('soundtrack_search_youtube', { query, limit })
}

export function soundtrackHttpGet(url: string, headers?: Record<string, string>): Promise<string> {
  return call<string>('soundtrack_http_get', { url, headers: headers ?? null })
}
