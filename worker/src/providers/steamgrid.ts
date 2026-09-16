import type { ArtworkOption, Env } from '../types'

const SGDB_BASE = 'https://www.steamgriddb.com/api/v2'

async function querySgdb(path: string, env: Env): Promise<any> {
  const apiKey = env.STEAMGRIDDB_API_KEY
  if (!apiKey) {
    throw new Error('STEAMGRIDDB_KEY_MISSING: Worker secret STEAMGRIDDB_API_KEY is not configured.')
  }

  const res = await fetch(`${SGDB_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  })

  if (!res.ok) {
    if (res.status === 404) return null
    if (res.status === 429) throw new Error('STEAMGRIDDB_RATE_LIMITED')
    throw new Error(`STEAMGRIDDB_ERROR_${res.status}`)
  }

  return await res.json()
}

function cleanTitle(str: string): string {
  return str
    .toLowerCase()
    .replace(/\b(edition|deluxe|complete|remastered|goty|v\d+(\.\d+)*|repack|fitgirl|dodi)\b/gi, '')
    .replace(/[()[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeAsset(
  item: any,
  type: 'cover' | 'hero' | 'logo',
  isAnimated: boolean,
): ArtworkOption {
  return {
    id: String(item.id),
    url: item.url,
    thumbnail_url: item.thumb || item.url,
    mime: item.mime || (isAnimated ? 'image/webp' : 'image/jpeg'),
    is_animated: isAnimated,
    width: item.width || 0,
    height: item.height || 0,
    provider: 'steamgrid',
    type,
    artwork_type: type,
  }
}

export async function searchSgdbGameId(name: string, env: Env): Promise<number | null> {
  if (!name || !name.trim()) return null
  const trimmed = name.trim()
  const encoded = encodeURIComponent(trimmed)
  let json = await querySgdb(`/search/autocomplete/${encoded}`, env)

  // Fallback: If no results with full title, retry with cleaned title
  if (!json?.data || !Array.isArray(json.data) || json.data.length === 0) {
    const cleaned = cleanTitle(trimmed)
    if (cleaned && cleaned !== trimmed.toLowerCase()) {
      json = await querySgdb(`/search/autocomplete/${encodeURIComponent(cleaned)}`, env)
    }
  }

  if (!json?.data || !Array.isArray(json.data) || json.data.length === 0) {
    return null
  }

  // Check for exact title match among candidates first
  const lower = trimmed.toLowerCase()
  const exact = json.data.find((c: any) => c.name?.toLowerCase() === lower)
  if (exact) {
    return exact.id
  }

  return json.data[0].id
}

async function fetchKindAssets(
  kind: 'grids' | 'heroes' | 'logos',
  targetSegment: string, // e.g. "game/12345" or "steam/620"
  env: Env,
): Promise<ArtworkOption[]> {
  const typeMap: Record<string, 'cover' | 'hero' | 'logo'> = {
    grids: 'cover',
    heroes: 'hero',
    logos: 'logo',
  }
  const type = typeMap[kind] || 'cover'

  const promises: Promise<{ items: any[]; isAnimated: boolean }>[] = []

  // 1. Static items (page 0)
  promises.push(
    querySgdb(`/${kind}/${targetSegment}?types=static&page=0&nsfw=false`, env)
      .then((res) => ({ items: Array.isArray(res?.data) ? res.data : [], isAnimated: false }))
      .catch(() => ({ items: [], isAnimated: false })),
  )

  // 2. For covers (grids), fetch page 1 static as well to get up to 100 static options
  if (kind === 'grids') {
    promises.push(
      querySgdb(`/${kind}/${targetSegment}?types=static&page=1&nsfw=false`, env)
        .then((res) => ({ items: Array.isArray(res?.data) ? res.data : [], isAnimated: false }))
        .catch(() => ({ items: [], isAnimated: false })),
    )
  }

  // 3. Animated items (page 0)
  promises.push(
    querySgdb(`/${kind}/${targetSegment}?types=animated&page=0&nsfw=false`, env)
      .then((res) => ({ items: Array.isArray(res?.data) ? res.data : [], isAnimated: true }))
      .catch(() => ({ items: [], isAnimated: true })),
  )

  const batches = await Promise.all(promises)
  const results: ArtworkOption[] = []
  const seenIds = new Set<number | string>()

  for (const batch of batches) {
    for (const item of batch.items) {
      if (item && item.id && !seenIds.has(item.id)) {
        seenIds.add(item.id)
        results.push(normalizeAsset(item, type, batch.isAnimated))
      }
    }
  }

  return results
}

export async function getSgdbArtwork(
  kind: 'grids' | 'heroes' | 'logos',
  appId: string | null,
  gameId: number | null,
  env: Env,
): Promise<ArtworkOption[]> {
  // Try canonical gameId first if available
  if (gameId) {
    const assets = await fetchKindAssets(kind, `game/${gameId}`, env)
    if (assets.length > 0) {
      return assets
    }
  }

  // Fallback to steam appId if gameId was missing or yielded no results
  if (appId) {
    const assets = await fetchKindAssets(kind, `steam/${appId}`, env)
    if (assets.length > 0) {
      return assets
    }
  }

  return []
}
