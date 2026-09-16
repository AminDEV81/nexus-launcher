import { call } from './tauri'
import type { Tag } from '@/types/models'

export function listTags() {
  return call<Tag[]>('list_tags')
}

export function createTag(name: string, color: string | null) {
  return call<Tag>('create_tag', { input: { name, color } })
}

export function updateTag(id: string, name: string, color: string) {
  return call<Tag>('update_tag', { id, input: { name, color } })
}

export function deleteTag(id: string) {
  return call<void>('delete_tag', { id })
}

/** Replaces the game's whole tag set in one call — the tag editor
 *  buffers its checkbox state and sends the final selection on Save. */
export function setGameTags(gameId: string, tagIds: string[]) {
  return call<void>('set_game_tags', { gameId, tagIds })
}
