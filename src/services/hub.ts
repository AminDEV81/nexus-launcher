import { call } from './tauri'
import type {
  Game,
  HubGame,
  HubGameDetails,
  HubGenre,
  HubPlatform,
  HubSearchFilters,
} from '@/types/models'

/** Game Hub API — every list is fetched live from IGDB (the image URLs
 *  point at IGDB's CDN) and nothing is downloaded locally until a game
 *  is actually added to the library. */
export function getHubNewReleases() {
  return call<HubGame[]>('get_hub_new_releases')
}

export function getHubComingSoon() {
  return call<HubGame[]>('get_hub_coming_soon')
}

export function getHubTopRated() {
  return call<HubGame[]>('get_hub_top_rated')
}

export function getHubRecommended() {
  return call<HubGame[]>('get_hub_recommended')
}

/** Matches the `limit` baked into `search_hub_games` on the Rust side —
 *  the frontend needs it to compute the next page's offset. */
export const HUB_SEARCH_PAGE_SIZE = 24

/** Any active filter or sort switches the backend to wildcard name
 *  matching (IGDB doesn't allow `where` together with `search`) and
 *  explicit ordering; filters also work alone as a browse mode. */
export function searchHubGames(query: string, offset = 0, filters: HubSearchFilters = {}) {
  return call<HubGame[]>('search_hub_games', { query, offset, filters })
}

/** IGDB's fixed genre list (~25 values) — the hub's filter chips. */
export function listHubGenres() {
  return call<HubGenre[]>('list_hub_genres')
}

/** Curated modern platforms — the hub's platform dropdown. */
export function listHubPlatforms() {
  return call<HubPlatform[]>('list_hub_platforms')
}

/** Full listing behind a shelf's "More" button — same feed definitions
 *  as the shelves, paged by offset. */
export const HUB_FEED_PAGE_SIZE = 24

export function getHubFeed(feed: string, offset = 0) {
  return call<HubGame[]>('get_hub_feed', { feed, offset })
}

export function getHubGameDetails(igdbId: number) {
  return call<HubGameDetails>('get_hub_game_details', { igdbId })
}

export function getHubSimilarGames(igdbId: number) {
  return call<HubGame[]>('get_hub_similar_games', { igdbId })
}

export function addGameFromHub(igdbId: number) {
  return call<Game>('add_game_from_hub', { igdbId })
}

export function addGameToWishlist(igdbId: number) {
  return call<Game>('add_game_to_wishlist', { igdbId })
}

export function openGoogleAuthWindow() {
  return call<void>('open_google_auth_window')
}

export function openTrailerWindow(videoId: string, title: string) {
  return call<void>('open_trailer_window', { videoId, title })
}

export function mountEmbeddedTrailer(
  videoId: string,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  return call<void>('mount_embedded_trailer', { videoId, x, y, width, height })
}

export function unmountEmbeddedTrailer() {
  return call<void>('unmount_embedded_trailer')
}
