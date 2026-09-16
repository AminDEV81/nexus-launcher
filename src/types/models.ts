/**
 * Mirrors `src-tauri/src/db/models.rs`. Kept as a hand-written type
 * rather than codegen'd from Rust for now — the surface is small enough
 * that duplication is cheaper than adding a build step, but if the two
 * drift a type-mismatch will surface immediately as a runtime shape
 * error from `services/tauri.ts`'s `call()`, not a silent bug.
 */
export interface Game {
  id: string
  name: string

  executable_path: string | null
  install_path: string | null
  install_size_bytes: number | null
  version: string | null
  launch_arguments: string | null
  is_installed: boolean

  /** Epic 11: optional shell hooks run right before launch / right after exit. */
  pre_launch_command: string | null
  post_launch_command: string | null

  source: string
  steam_app_id: string | null
  /** Game Hub: the IGDB entry this game was added from, when known. */
  igdb_id: number | null
  /** Game Hub wishlist flag — the game lives in the Wishlist view until
   *  promoted to the library or installed locally. */
  is_wishlist: boolean

  is_favorite: boolean
  is_hidden: boolean

  description: string | null
  developer: string | null
  publisher: string | null
  release_date: string | null
  genres: string[]
  platforms: string[]
  age_rating: string | null
  metacritic_score: number | null
  opencritic_score: number | null
  trailer_url: string | null

  cover_path: string | null
  cover_is_animated: boolean
  banner_path: string | null
  logo_path: string | null
  background_path: string | null
  animated_cover_enabled: boolean

  total_playtime_seconds: number
  last_played_at: string | null

  added_at: string
  user_rating: number | null

  /** Ids of the user's tags on this game (joined in the backend's
   *  `SELECT_COLUMNS` via a subquery). Names/colors live in `Tag` —
   *  resolved where needed with `useTags()`. */
  tag_ids: string[]
}

export interface Collection {
  id: string
  name: string
  created_at: string
}

/** Mirrors `Tag` in `src-tauri/src/db/models.rs` — a user-created,
 *  colored label attached to games through `game_tags`. */
export interface Tag {
  id: string
  name: string
  /** `#rrggbb`, validated by the backend before any write. */
  color: string
}

/** `Collection` plus enough to render its card on `/collections` —
 *  mirrors `CollectionSummary` in `src-tauri/src/commands/collections.rs`. */
export interface CollectionSummary extends Collection {
  game_count: number
  preview_covers: string[]
}

/** Mirrors `StatsSummary`/`MostPlayedGame` in
 *  `src-tauri/src/commands/stats.rs`. */
export interface MostPlayedGame {
  id: string
  name: string
  cover_path: string | null
  total_playtime_seconds: number
}

export interface StatsSummary {
  total_games: number
  installed_games: number
  total_playtime_seconds: number
  most_played_game: MostPlayedGame | null
}

export interface GenrePlaytime {
  genre: string
  total_playtime_seconds: number
}

export interface WeeklyPlaytime {
  week_start: string
  total_playtime_seconds: number
}

/** Mirrors `HubGame`/`HubGameDetails` in `src-tauri/src/commands/hub.rs`. */
export interface HubGame {
  igdb_id: number
  name: string
  summary: string | null
  release_date: string | null
  game_type?: number | null
  cover_url: string | null
  /** Full-width hero image (banner / detail page) at IGDB's 1080p size. */
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
  videos?: HubVideo[]
  screenshot_urls: string[]
  /** The real Metacritic score (live from Steam's store API); null when
   *  unavailable — the UI falls back to the IGDB aggregate in `rating`. */
  metacritic_score: number | null
  steam_app_id?: string | null
}

/** Mirrors `HubGenre` in `src-tauri/src/commands/hub.rs` — one of IGDB's
 *  fixed genre values, for the hub's genre filter chips. */
export interface HubGenre {
  id: number
  name: string
}

/** Mirrors `HubPlatform` — a curated modern platform for the filter
 *  dropdown (IGDB's full platform list has ~200 mostly-obsolete rows). */
export interface HubPlatform {
  id: number
  name: string
  abbreviation: string
}

/** Mirrors `HubSearchFilters` — the hub catalog filters as one IPC
 *  payload. All fields optional/null; `release` is a preset key
 *  ('upcoming' | 'new' | 'last-year' | 'last-3-years') or a year string,
 *  `sort` one of 'popularity' | 'rating' | 'newest' | 'oldest' | 'name'. */
export interface HubSearchFilters {
  genreId?: number | null
  genreIds?: number[]
  platformId?: number | null
  platformIds?: number[]
  release?: string | null
  yearFrom?: number | null
  yearTo?: number | null
  minRating?: number | null
  sort?: string | null
}

/** Mirrors `DailyActivity`/`RecentSession` in `src-tauri/src/commands/stats.rs`. */
export interface DailyActivity {
  date: string
  total_playtime_seconds: number
}

export interface RecentSession {
  id: string
  game_id: string
  game_name: string
  cover_path: string | null
  started_at: string
  ended_at: string | null
  duration_seconds: number | null
}

export interface Profile {
  id: string
  name: string
  avatar: string
  color: string
  created_at: string
  updated_at: string
  is_active: boolean
  games_count?: number
  total_save_bytes?: number
  recent_games?: string[]
}

export interface GameSaveLocation {
  id: string
  game_id: string
  path: string
  resolved_path: string
  location_type: 'save' | 'profile' | 'config' | 'metadata' | 'unknown'
  detection_source: 'heuristic' | 'manual'
  confidence: number
  is_enabled: boolean
  exists: boolean
}

export interface GameSaveDetails {
  game_id: string
  profile_id: string
  is_managed: boolean
  locations: GameSaveLocation[]
  file_count: number
  save_size_bytes: number
  content_hash: string | null
  last_synced_at: string | null
  state: 'unknown' | 'empty' | 'ready' | 'modified' | 'missing' | 'corrupt' | 'error'
}

export interface SnapshotLocationMeta {
  location_id: string
  original_path: string
  hash: string
  size_bytes: number
}

export interface SaveSnapshot {
  id: string
  profile_id: string
  game_id: string
  created_at: string
  label: string
  total_size_bytes: number
  tree_hash: string
  is_permanent: boolean
  locations: SnapshotLocationMeta[]
}

export interface DetectedSaveLocation {
  path: string
  location_type: string
  confidence: number
  exists: boolean
}

export interface SaveOperation {
  id: string
  schema_version: number
  operation_type: 'prepare_launch' | 'sync_exit' | 'restore_snapshot' | 'clone_save'
  game_id: string | null
  profile_id: string | null
  state: string
  started_at: string
  completed_at: string | null
  error_code: string | null
  error_message: string | null
}
