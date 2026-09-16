export interface Env {
  IGDB_CLIENT_ID?: string
  IGDB_CLIENT_SECRET?: string
  STEAMGRIDDB_API_KEY?: string
  ENVIRONMENT?: string
  API_VERSION?: string
  NEXUS_CACHE?: KVNamespace
}

export interface ApiResponse<T> {
  success: boolean
  data?: T
  source?: 'cache' | 'upstream' | 'stale-cache' | 'fallback'
  provider?: 'igdb' | 'steam' | 'steamgrid' | 'local'
  cached?: boolean
  stale?: boolean
  error?: {
    code: string
    message: string
  }
}

export interface HubGame {
  igdb_id: number
  name: string
  summary: string | null
  release_date: string | null
  game_type: number | null
  cover_url: string | null
  backdrop_url: string | null
  rating: number | null
  rating_count: number | null
  hypes: number | null
  genres: string[]
  platforms: string[]
}

export interface HubVideo {
  name: string | null
  video_id: string
}

export interface HubGameDetails extends HubGame {
  developer: string | null
  publisher: string | null
  trailer_url: string | null
  videos: HubVideo[]
  screenshot_urls: string[]
  metacritic_score: number | null
  steam_app_id: string | null
}

export interface ArtworkOption {
  id: string
  url: string
  thumbnail_url: string
  mime: string
  is_animated: boolean
  width: number
  height: number
  provider: 'steam' | 'steamgrid' | 'local'
  type: 'cover' | 'hero' | 'logo' | 'screenshot'
  artwork_type: 'cover' | 'hero' | 'logo' | 'screenshot'
}

export interface TwitchToken {
  access_token: string
  expires_at: number // unix epoch ms
}
