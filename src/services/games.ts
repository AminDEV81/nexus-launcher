import { call } from './tauri'
import type { Game } from '@/types/models'

export interface CreateGameInput {
  name: string
  executable_path?: string | null
  install_path?: string | null
  install_size_bytes?: number | null
  launch_arguments?: string | null
}

export interface UpdateGameFlagsInput {
  is_favorite?: boolean | null
  is_hidden?: boolean | null
  animated_cover_enabled?: boolean | null
}

export interface UpdateGameInstallationInput {
  executable_path: string | null
  install_path: string | null
  install_size_bytes: number | null
}

export function listGames(profileId?: string) {
  return call<Game[]>('list_games', typeof profileId === 'string' ? { profileId } : {})
}

export function getGame(id: string, profileId?: string) {
  return call<Game>('get_game', typeof profileId === 'string' ? { id, profileId } : { id })
}

export function createGame(input: CreateGameInput) {
  return call<Game>('create_game', { input })
}

export function updateGameFlags(id: string, input: UpdateGameFlagsInput) {
  return call<Game>('update_game_flags', { id, input })
}

export function updateGameInstallation(id: string, input: UpdateGameInstallationInput) {
  return call<Game>('update_game_installation', { id, input })
}

export function deleteGame(id: string) {
  return call<void>('delete_game', { id })
}

export function promoteWishlistGame(id: string) {
  return call<Game>('promote_wishlist_game', { id })
}

export function getGameScreenshots(id: string) {
  return call<string[]>('get_game_screenshots', { id })
}

export function updateLaunchArguments(id: string, launchArguments: string | null) {
  return call<Game>('update_launch_arguments', { id, launchArguments })
}

/** Persists an IGDB match resolved by name (manual games are created
 *  without one) — see `set_game_igdb_id` on the Rust side. */
export function setGameIgdbId(id: string, igdbId: number) {
  return call<void>('set_game_igdb_id', { id, igdbId })
}

export function updatePreLaunchCommand(id: string, preLaunchCommand: string | null) {
  return call<Game>('update_pre_launch_command', { id, preLaunchCommand })
}

export function updatePostLaunchCommand(id: string, postLaunchCommand: string | null) {
  return call<Game>('update_post_launch_command', { id, postLaunchCommand })
}

/** Sets or clears the user's personal rating (1-10) on a game. */
export function setGameUserRating(id: string, rating: number | null) {
  return call<Game>('set_game_user_rating', { id, rating })
}

/**
 * Starts the game and kicks off background playtime tracking. Resolves
 * once the process has been started (or handed off to Steam) — actual
 * tracking is reported separately via the `game-launched`,
 * `playtime-updated`, and `game-exited` events (see
 * `hooks/use-playtime-tracking.ts`), not this call's return value.
 */
export function launchGame(id: string) {
  return call<void>('launch_game', { gameId: id })
}

/** Force-closes a running game — the launcher's equivalent of Task
 *  Manager's "End Task". The tracker's poll loop notices the process is
 *  gone within a few seconds and finishes the session/emits
 *  `game-exited` on its own; this call doesn't do that itself. */
export function stopGame(id: string) {
  return call<void>('stop_game', { gameId: id })
}

/** IDs of games with an active play session — used to restore the
 *  "Playing…" state after a reload. */
export function getRunningGames() {
  return call<string[]>('get_running_games')
}
