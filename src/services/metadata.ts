import { call } from './tauri'
import type { Game } from '@/types/models'

export interface MetadataCandidate {
  igdb_id: number
  name: string
  release_year: number | null
  cover_url: string | null
}

export interface CoverOption {
  id: number
  url: string
  thumbnail_url: string
  mime: string
  is_animated: boolean
  width: number
  height: number
}

export function searchMetadataCandidates(query: string) {
  return call<MetadataCandidate[]>('search_metadata_candidates', { query })
}

export function applyMetadata(gameId: string, igdbId: number) {
  return call<Game>('apply_metadata', { gameId, igdbId })
}

export function syncGameMetadata(gameId: string) {
  return call<Game>('sync_game_metadata', { gameId })
}

export function syncWishlistMetadata() {
  return call<Game[]>('sync_wishlist_metadata')
}

export function searchCoverOptions(gameId: string) {
  return call<CoverOption[]>('search_cover_options', { gameId })
}

export function applyCover(gameId: string, url: string, isAnimated: boolean, allowLarge?: boolean) {
  return call<Game>('apply_cover', { gameId, url, isAnimated, allowLarge: allowLarge ?? false })
}

export function applyCustomCover(gameId: string, filePath: string) {
  return call<Game>('apply_custom_cover', { gameId, filePath })
}

export function searchLogoOptions(gameId: string) {
  return call<CoverOption[]>('search_logo_options', { gameId })
}

export function applyLogo(gameId: string, url: string, allowLarge?: boolean) {
  return call<Game>('apply_logo', { gameId, url, allowLarge: allowLarge ?? false })
}

export function searchBannerOptions(gameId: string) {
  return call<CoverOption[]>('search_banner_options', { gameId })
}

export function applyBanner(gameId: string, url: string, allowLarge?: boolean) {
  return call<Game>('apply_banner', { gameId, url, allowLarge: allowLarge ?? false })
}

export function applyCustomBanner(gameId: string, filePath: string) {
  return call<Game>('apply_custom_banner', { gameId, filePath })
}

/** The four artwork slots the Epic 10 crop editor and Reset can target. */
export type ArtworkKind = 'cover' | 'banner' | 'logo' | 'background'

export interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

export function cropAndSaveImage(
  gameId: string,
  sourcePath: string,
  rect: CropRect,
  targetKind: ArtworkKind,
) {
  return call<Game>('crop_and_save_image', {
    gameId,
    sourcePath,
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    targetKind,
  })
}

export function resetArtwork(gameId: string, kind: ArtworkKind) {
  return call<Game>('reset_artwork', { gameId, kind })
}

export interface OrphanedArtworkSummary {
  orphaned_count: number
  total_bytes: number
}

export function getOrphanedArtworkSummary() {
  return call<OrphanedArtworkSummary>('get_orphaned_artwork_summary')
}

export function cleanupOrphanedArtworks() {
  return call<OrphanedArtworkSummary>('cleanup_orphaned_artworks')
}
