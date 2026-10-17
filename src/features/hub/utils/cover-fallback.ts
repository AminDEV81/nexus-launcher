/**
 * Builds an ordered list of fallback image URLs for a game cover so that if
 * Steam's `library_600x900_2x.jpg` or a CDN mirror returns 404, the `<img>`
 * automatically cascades through `library_600x900.jpg`, `header.jpg`,
 * `capsule_616x353.jpg`, and `backdropUrl` before showing the styled title poster.
 */
export function buildCoverFallbackChain(
  coverUrl?: string | null,
  backdropUrl?: string | null,
  steamAppId?: string | number | null,
): string[] {
  const urls: string[] = []
  const pushUnique = (u?: string | null) => {
    const trimmed = u?.trim()
    if (trimmed && !urls.includes(trimmed)) {
      urls.push(trimmed)
    }
  }

  pushUnique(coverUrl)

  const matchFromCover = coverUrl?.match(/\/steam\/apps\/(\d+)\//)
  const matchFromBackdrop = backdropUrl?.match(/\/steam\/apps\/(\d+)\//)
  const resolvedAppId =
    (steamAppId != null && String(steamAppId).trim() !== '' ? String(steamAppId).trim() : null) ??
    matchFromCover?.[1] ??
    matchFromBackdrop?.[1] ??
    null

  if (resolvedAppId && /^\d+$/.test(resolvedAppId)) {
    pushUnique(
      `https://cdn.akamai.steamstatic.com/steam/apps/${resolvedAppId}/library_600x900.jpg`,
    )
    pushUnique(
      `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${resolvedAppId}/library_600x900.jpg`,
    )
    pushUnique(
      `https://cdn.akamai.steamstatic.com/steam/apps/${resolvedAppId}/library_600x900_2x.jpg`,
    )
    pushUnique(`https://cdn.akamai.steamstatic.com/steam/apps/${resolvedAppId}/header.jpg`)
    pushUnique(
      `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${resolvedAppId}/header.jpg`,
    )
    pushUnique(
      `https://cdn.akamai.steamstatic.com/steam/apps/${resolvedAppId}/capsule_616x353.jpg`,
    )
  }

  if (coverUrl && coverUrl.includes('images.igdb.com/igdb/image/upload/')) {
    pushUnique(coverUrl.replace('/t_cover_big/', '/t_720p/'))
    pushUnique(coverUrl.replace('/t_720p/', '/t_cover_big/'))
  }

  pushUnique(backdropUrl)

  return urls
}
