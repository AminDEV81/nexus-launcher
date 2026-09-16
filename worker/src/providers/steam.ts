import type { ArtworkOption } from '../types'

const STEAM_STORE_SEARCH = 'https://store.steampowered.com/api/storesearch'
const STEAM_APP_DETAILS = 'https://store.steampowered.com/api/appdetails'
const STEAM_CDN_BASE = 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps'

function cleanTitle(str: string): string {
  return str
    .toLowerCase()
    .replace(/\b(edition|deluxe|complete|remastered|goty|v\d+(\.\d+)*|repack|fitgirl|dodi)\b/gi, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function searchSteamAppId(term: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${STEAM_STORE_SEARCH}/?term=${encodeURIComponent(term)}&l=english&cc=US`,
    )
    if (!res.ok) return null
    const json = (await res.json()) as { items?: { id: number; name?: string }[] }
    if (!json.items || json.items.length === 0) return null

    const cleanTerm = cleanTitle(term)
    if (!cleanTerm) return null

    for (const item of json.items) {
      if (!item.name || !item.id) continue
      const cleanItemName = cleanTitle(item.name)
      if (
        cleanItemName === cleanTerm ||
        (cleanItemName.startsWith(cleanTerm) && cleanTerm.length >= 4) ||
        (cleanTerm.startsWith(cleanItemName) && cleanItemName.length >= 4)
      ) {
        return item.id.toString()
      }
    }
    return null
  } catch {
    return null
  }
}

export function getSteamOfficialArtwork(appId: string): ArtworkOption[] {
  const options: ArtworkOption[] = []

  // 1. Official Vertical Box Art (600x900)
  options.push({
    id: `steam-${appId}-cover-600x900`,
    url: `${STEAM_CDN_BASE}/${appId}/library_600x900_2x.jpg`,
    thumbnail_url: `${STEAM_CDN_BASE}/${appId}/library_600x900_2x.jpg`,
    mime: 'image/jpeg',
    is_animated: false,
    width: 600,
    height: 900,
    provider: 'steam',
    type: 'cover',
  })

  // 2. Official Horizontal Capsule (460x215)
  options.push({
    id: `steam-${appId}-cover-header`,
    url: `${STEAM_CDN_BASE}/${appId}/header.jpg`,
    thumbnail_url: `${STEAM_CDN_BASE}/${appId}/header.jpg`,
    mime: 'image/jpeg',
    is_animated: false,
    width: 460,
    height: 215,
    provider: 'steam',
    type: 'cover',
  })

  // 3. Official Library Hero Banner (1920x620)
  options.push({
    id: `steam-${appId}-hero`,
    url: `${STEAM_CDN_BASE}/${appId}/library_hero.jpg`,
    thumbnail_url: `${STEAM_CDN_BASE}/${appId}/library_hero.jpg`,
    mime: 'image/jpeg',
    is_animated: false,
    width: 1920,
    height: 620,
    provider: 'steam',
    type: 'hero',
  })

  // 4. Official Logo Transparent (PNG)
  options.push({
    id: `steam-${appId}-logo`,
    url: `${STEAM_CDN_BASE}/${appId}/logo.png`,
    thumbnail_url: `${STEAM_CDN_BASE}/${appId}/logo.png`,
    mime: 'image/png',
    is_animated: false,
    width: 640,
    height: 360,
    provider: 'steam',
    type: 'logo',
  })

  return options
}

export async function getSteamScreenshots(appId: string): Promise<ArtworkOption[]> {
  try {
    const res = await fetch(`${STEAM_APP_DETAILS}?appids=${appId}&l=english`)
    if (!res.ok) return []
    const json = (await res.json()) as any
    const entry = json[appId]
    if (!entry?.success || !entry?.data?.screenshots) return []

    return entry.data.screenshots.map((sc: any, index: number) => ({
      id: `steam-${appId}-screenshot-${index}`,
      url: sc.path_full || sc.path_thumbnail,
      thumbnail_url: sc.path_thumbnail || sc.path_full,
      mime: 'image/jpeg',
      is_animated: false,
      width: 1920,
      height: 1080,
      provider: 'steam',
      type: 'screenshot',
    }))
  } catch {
    return []
  }
}
