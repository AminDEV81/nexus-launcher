export type SoundtrackType =
  | 'original_soundtrack'
  | 'original_score'
  | 'radio'
  | 'gamerip'
  | 'remix'
  | 'compilation'
  | 'dlc_soundtrack'
  | 'expansion_soundtrack'
  | 'other'

export interface SoundtrackTrack {
  id: string
  album_id: string
  disc_number: number
  track_number: number
  title: string
  artist: string | null
  duration_ms: number
  preview_url: string | null
  stream_url: string | null
  download_url: string | null
  local_path: string | null
  provider_id: string
  external_id: string | null
  created_at?: string
}

export interface SoundtrackAlbum {
  id: string
  game_id: string | null
  title: string
  album_type: SoundtrackType
  artist: string | null
  release_date: string | null
  cover_url: string | null
  track_count: number
  total_duration_ms: number
  provider_id: string
  external_id: string | null
  created_at?: string
  updated_at?: string
}

export interface SoundtrackAlbumWithTracks {
  album: SoundtrackAlbum
  tracks: SoundtrackTrack[]
}

export interface GameIdentity {
  gameId: string
  title: string
  normalizedTitle?: string
  releaseYear?: string | null
  developer?: string | null
  publisher?: string | null
  steamAppId?: string | number | null
  igdbId?: number | null
  coverUrl?: string | null
}

export interface SoundtrackMatch {
  album: SoundtrackAlbum
  confidence: number
  tracksPreview?: SoundtrackTrack[]
}

export interface PlaybackSource {
  type: 'stream' | 'local' | 'youtube'
  url: string
  providerId: string
  bitrate?: number
  format?: string
}

export interface DownloadSource {
  url: string
  format: string
  totalBytes?: number
  filename: string
  providerId: string
}

export interface ProviderCapabilities {
  metadata: boolean
  artwork: boolean
  streaming: boolean
  downloading: boolean
  externalPlayback: boolean
}

export interface SoundtrackProvider {
  id: string
  name: string
  priority: number
  capabilities: ProviderCapabilities

  searchGame(game: GameIdentity): Promise<SoundtrackMatch[]>
  getAlbums(game: GameIdentity): Promise<SoundtrackAlbum[]>
  getAlbum(albumId: string, externalId?: string): Promise<SoundtrackAlbumWithTracks | null>
  getPlaybackSource(track: SoundtrackTrack, game?: GameIdentity): Promise<PlaybackSource | null>
  getDownloadSource(track: SoundtrackTrack): Promise<DownloadSource | null>
  getArtwork?(album: SoundtrackAlbum): Promise<string | null>
}

export interface ProviderHealth {
  id: string
  status: 'healthy' | 'degraded' | 'unhealthy'
  consecutiveFailures: number
  lastError?: string
  cooldownUntil?: number
}

export interface DownloadProgressPayload {
  id: string
  track_id?: string | null
  album_id?: string | null
  downloaded_bytes: number
  total_bytes: number
  speed_bps: number
  status: 'queued' | 'downloading' | 'paused' | 'completed' | 'failed' | 'cancelled'
  error_message?: string | null
}

export interface DownloadCompletePayload {
  id: string
  track_id?: string | null
  local_path: string
}

export interface SoundtrackFavorite {
  id: string
  target_type: 'track' | 'album'
  target_id: string
  created_at: string
}

export interface SoundtrackPlayHistory {
  id: string
  track_id: string
  album_id: string | null
  game_id: string | null
  played_at: string
  duration_played_ms: number
  completed: boolean
}

export interface SoundtrackLocalFile {
  id: string
  file_path: string
  file_size: number
  game_id: string | null
  album_id: string | null
  track_id: string | null
  title: string | null
  artist: string | null
  album: string | null
  duration_ms: number
  format: string | null
  scanned_at: string
}
