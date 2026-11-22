import { invoke } from '@tauri-apps/api/core'

export type ArtCategory = 'all' | 'wallpaper' | 'hero' | 'cover' | 'concept'

export interface ArtItem {
  id: string
  title: string
  game_name: string | null
  author: string | null
  source: string
  category: string
  image_url: string
  thumb_url: string
  width: number | null
  height: number | null
  file_size_bytes: number | null
  file_format: string | null
  page_url: string | null
  is_liked: boolean
  popularity?: number
}

export interface ArtDownloadInfo {
  size_bytes: number | null
  mime_type: string | null
  file_format: string
}

export interface ArtDownloadProgressEvent {
  download_id: string
  downloaded_bytes: number
  total_bytes: number | null
  percent: number
  status: 'downloading' | 'completed' | 'error'
}

export async function searchArtWallpapers(
  query: string,
  category: ArtCategory = 'all',
  page = 1,
  syncNonce = 0,
): Promise<ArtItem[]> {
  return invoke<ArtItem[]>('search_art_wallpapers', {
    query,
    category,
    page,
    syncNonce,
  })
}


export async function toggleLikeArtwork(item: ArtItem): Promise<boolean> {
  return invoke<boolean>('toggle_like_artwork', { item })
}

export async function listLikedArtworks(): Promise<ArtItem[]> {
  return invoke<ArtItem[]>('list_liked_artworks')
}

export async function getDefaultArtDownloadDir(): Promise<string> {
  return invoke<string>('get_default_art_download_dir')
}

export async function getArtworkDownloadInfo(url: string): Promise<ArtDownloadInfo> {
  return invoke<ArtDownloadInfo>('get_artwork_download_info', { url })
}

export async function downloadArtworkFile(params: {
  url: string
  destDir: string
  filename: string
  downloadId: string
}): Promise<string> {
  return invoke<string>('download_artwork_file', {
    url: params.url,
    destDir: params.destDir,
    filename: params.filename,
    downloadId: params.downloadId,
  })
}

export async function openArtFolder(filePath: string): Promise<void> {
  return invoke<void>('open_art_folder', { filePath })
}

export async function setDesktopWallpaper(url: string, filename: string): Promise<string> {
  return invoke<string>('set_desktop_wallpaper', { url, filename })
}
