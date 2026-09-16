import type {
  DetectedSaveLocation,
  GameSaveDetails,
  SaveOperation,
  SaveSnapshot,
} from '@/types/models'
import { call } from './tauri'

export function getGameSaveDetails(gameId: string, profileId?: string): Promise<GameSaveDetails> {
  return call<GameSaveDetails>('get_game_save_details', {
    gameId,
    profileId,
  })
}

export function autoDetectSaveLocationsForGame(gameId: string): Promise<GameSaveDetails> {
  return call<GameSaveDetails>('auto_detect_save_locations_for_game', {
    gameId,
  })
}

export function applySaveLocationsFromDatabase(gameId: string): Promise<GameSaveDetails> {
  return call<GameSaveDetails>('apply_save_locations_from_database', {
    gameId,
  })
}

export function detectGameSaves(
  gameId: string,
  gameTitle: string,
  steamAppId?: number,
): Promise<DetectedSaveLocation[]> {
  return call<DetectedSaveLocation[]>('detect_game_saves', {
    gameId,
    gameTitle,
    steamAppId,
  })
}

export function configureSaveLocation(
  gameId: string,
  path: string,
  locationType: string,
  isEnabled: boolean,
): Promise<void> {
  return call<void>('configure_save_location', {
    gameId,
    path,
    locationType,
    isEnabled,
  })
}

export function removeSaveLocation(locationId: string): Promise<void> {
  return call<void>('remove_save_location', { locationId })
}

export function toggleSaveLocation(locationId: string, isEnabled: boolean): Promise<void> {
  return call<void>('toggle_save_location', { locationId, isEnabled })
}

export function listSaveSnapshots(gameId: string, profileId?: string): Promise<SaveSnapshot[]> {
  return call<SaveSnapshot[]>('list_save_snapshots', { gameId, profileId })
}

export function restoreSaveSnapshot(
  gameId: string,
  snapshotId: string,
  profileId?: string,
): Promise<string> {
  return call<string>('restore_save_snapshot', {
    gameId,
    snapshotId,
    profileId,
  })
}

export function deleteSaveSnapshot(
  gameId: string,
  snapshotId: string,
  profileId?: string,
): Promise<void> {
  return call<void>('delete_save_snapshot', {
    gameId,
    snapshotId,
    profileId,
  })
}

export function cloneProfileSave(
  gameId: string,
  srcProfileId: string,
  dstProfileId: string,
): Promise<string> {
  return call<string>('clone_profile_save', {
    gameId,
    srcProfileId,
    dstProfileId,
  })
}

export function openSaveFolder(path: string): Promise<void> {
  return call<void>('open_save_folder', { path })
}

export function listSaveOperations(gameId?: string, profileId?: string): Promise<SaveOperation[]> {
  return call<SaveOperation[]>('list_save_operations', {
    gameId,
    profileId,
  })
}
