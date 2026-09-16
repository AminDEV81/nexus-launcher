import { call } from './tauri'
import type { Collection, CollectionSummary, Game } from '@/types/models'

export function listCollections() {
  return call<Collection[]>('list_collections')
}

/** Powers the `/collections` grid — one call instead of N (a naive
 *  `listCollections` + `listGamesInCollection` per card). */
export function listCollectionsWithPreviews() {
  return call<CollectionSummary[]>('list_collections_with_previews')
}

export function createCollection(name: string) {
  return call<Collection>('create_collection', { input: { name } })
}

export function deleteCollection(id: string) {
  return call<void>('delete_collection', { id })
}

export function addGameToCollection(collectionId: string, gameId: string) {
  return call<void>('add_game_to_collection', { collectionId, gameId })
}

export function removeGameFromCollection(collectionId: string, gameId: string) {
  return call<void>('remove_game_from_collection', { collectionId, gameId })
}

export function listGamesInCollection(collectionId: string, profileId?: string) {
  return call<Game[]>(
    'list_games_in_collection',
    typeof profileId === 'string' ? { collectionId, profileId } : { collectionId },
  )
}

/** Which collections a game currently belongs to — backs the checkbox
 *  state in the "Add to Collection" picker. */
export function listCollectionIdsForGame(gameId: string) {
  return call<string[]>('list_collection_ids_for_game', { gameId })
}
