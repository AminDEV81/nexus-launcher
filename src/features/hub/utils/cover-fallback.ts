/**
 * Builds a deduplicated, multi-CDN fallback chain for Game Hub, Store, and Console Mode cover/banner images.
 * When Steam's `library_600x900_2x.jpg`, `library_hero.jpg`, or a CDN mirror returns 404, the `<img>`
 * automatically cascades through `library_600x900.jpg`, signed `backdropUrl`, `header.jpg`,
 * and `capsule_616x353.jpg` across Steam/IGDB CDN mirrors so cards never render blank.
 */
function normalizeExternalImageUrl(raw: string | null | undefined): string | null {
  if (!raw) return null
  const clean = raw.trim()
  if (!clean) return null
  if (clean.startsWith('//')) return `https:${clean}`
  return clean
}

function extractSteamAppId(
  coverUrl?: string | null,
  backdropUrl?: string | null,
  steamAppId?: string | number | null,
  igdbId?: number | null,
): string | null {
  if (steamAppId != null && String(steamAppId).trim() !== '') {
    const s = String(steamAppId).trim()
    if (/^\d+$/.test(s)) return s
  }
  const combined = `${coverUrl ?? ''} ${backdropUrl ?? ''}`
  const m = combined.match(/\/steam\/apps\/(\d+)\//)
  if (m?.[1]) return m[1]
  if (igdbId && igdbId > 1_000_000_000) {
    return String(igdbId - 1_000_000_000)
  }
  return null
}

export function buildCoverFallbackChain(
  coverUrl?: string | null,
  backdropUrl?: string | null,
  steamAppId?: string | number | null,
  igdbId?: number | null,
): string[] {
  const candidates: string[] = []
  const pushUnique = (u?: string | null) => {
    const clean = normalizeExternalImageUrl(u)
    if (!clean) return
    if (!candidates.includes(clean)) candidates.push(clean)
  }

  const normCover = normalizeExternalImageUrl(coverUrl)
  const normBackdrop = normalizeExternalImageUrl(backdropUrl)

  pushUnique(normCover)

  // If primary cover is an IGDB high-res variant, add standard cover_big fallback
  if (normCover && normCover.includes('images.igdb.com/igdb/image/upload/')) {
    pushUnique(normCover.replace(/\/t_(?:1080p|cover_big_2x|720p)\//, '/t_cover_big/'))
  }

  const resolvedAppId = extractSteamAppId(normCover, normBackdrop, steamAppId, igdbId)

  if (resolvedAppId) {
    if (normCover?.includes('library_600x900_2x.jpg')) {
      pushUnique(normCover.replace('library_600x900_2x.jpg', 'library_600x900.jpg'))
    }
    pushUnique(
      `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${resolvedAppId}/library_600x900.jpg`,
    )
    pushUnique(
      `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${resolvedAppId}/library_600x900.jpg`,
    )
    pushUnique(`https://cdn.akamai.steamstatic.com/steam/apps/${resolvedAppId}/library_600x900.jpg`)
    pushUnique(
      `https://cdn.cloudflare.steamstatic.com/steam/apps/${resolvedAppId}/library_600x900.jpg`,
    )
  }

  pushUnique(normBackdrop)

  if (resolvedAppId) {
    pushUnique(
      `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${resolvedAppId}/header.jpg`,
    )
    pushUnique(
      `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${resolvedAppId}/header.jpg`,
    )
    pushUnique(`https://cdn.akamai.steamstatic.com/steam/apps/${resolvedAppId}/header.jpg`)
    pushUnique(
      `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${resolvedAppId}/capsule_616x353.jpg`,
    )
    pushUnique(`https://cdn.akamai.steamstatic.com/steam/apps/${resolvedAppId}/capsule_616x353.jpg`)
  }

  return candidates
}

/**
 * Builds a deduplicated widescreen (16:9) fallback chain for Store / Wishlist banners, capsules, and hero stages.
 * Prioritizes verified `backdropUrl` / `header.jpg` / `capsule_616x353.jpg` before falling back to portrait covers.
 */
export function buildBannerFallbackChain(
  backdropUrl?: string | null,
  coverUrl?: string | null,
  steamAppId?: string | number | null,
  igdbId?: number | null,
): string[] {
  const candidates: string[] = []
  const pushUnique = (u?: string | null) => {
    const clean = normalizeExternalImageUrl(u)
    if (!clean) return
    if (!candidates.includes(clean)) candidates.push(clean)
  }

  const normBackdrop = normalizeExternalImageUrl(backdropUrl)
  const normCover = normalizeExternalImageUrl(coverUrl)
  const resolvedAppId = extractSteamAppId(normCover, normBackdrop, steamAppId, igdbId)

  // If normBackdrop is an IGDB URL, push its 1080p HD version FIRST!
  if (normBackdrop && normBackdrop.includes('images.igdb.com/igdb/image/upload/')) {
    pushUnique(normBackdrop.replace(/\/t_[a-z0-9_]+\//i, '/t_1080p/'))
    pushUnique(normBackdrop.replace(/\/t_[a-z0-9_]+\//i, '/t_720p/'))
  }

  // If normBackdrop is a low-res Steam capsule (616x353 or 460x215 header.jpg), try 1920x620 library_hero.jpg FIRST!
  const isLowResSteamCapsule =
    normBackdrop &&
    (normBackdrop.includes('capsule_616x353') ||
      normBackdrop.includes('header.jpg') ||
      normBackdrop.includes('capsule_467x181'))

  if (resolvedAppId && isLowResSteamCapsule) {
    pushUnique(
      `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${resolvedAppId}/library_hero.jpg`,
    )
    pushUnique(
      `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${resolvedAppId}/library_hero.jpg`,
    )
  }

  pushUnique(normBackdrop)

  if (resolvedAppId) {
    if (normBackdrop?.includes('library_hero.jpg')) {
      pushUnique(normBackdrop.replace('library_hero.jpg', 'header.jpg'))
      pushUnique(normBackdrop.replace('library_hero.jpg', 'capsule_616x353.jpg'))
    }
    pushUnique(
      `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${resolvedAppId}/header.jpg`,
    )
    pushUnique(
      `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${resolvedAppId}/header.jpg`,
    )
    pushUnique(`https://cdn.akamai.steamstatic.com/steam/apps/${resolvedAppId}/header.jpg`)
    pushUnique(
      `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${resolvedAppId}/capsule_616x353.jpg`,
    )
    pushUnique(`https://cdn.akamai.steamstatic.com/steam/apps/${resolvedAppId}/capsule_616x353.jpg`)
  }

  pushUnique(normCover)

  if (resolvedAppId) {
    pushUnique(
      `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${resolvedAppId}/library_600x900.jpg`,
    )
    pushUnique(`https://cdn.akamai.steamstatic.com/steam/apps/${resolvedAppId}/library_600x900.jpg`)
  }

  return candidates
}
