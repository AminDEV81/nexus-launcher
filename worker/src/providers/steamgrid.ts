import type { ArtworkOption, Env } from '../types'

const SGDB_BASE = 'https://www.steamgriddb.com/api/v2'
const DEFAULT_SGDB_KEY = 'b852e99f9735844f4a44a6acad6cd456'

async function querySgdb(path: string, env: Env): Promise<any> {
  const apiKey = env.STEAMGRIDDB_API_KEY || DEFAULT_SGDB_KEY

  const res = await fetch(`${SGDB_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
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

function isSafeAsset(item: any): boolean {
  if (!item || item.nsfw === true || item.epilepsy === true) return false
  const notes = String(item.notes || '').toLowerCase()
  if (/(nsfw|18\+|nude|nudity|hentai|uncensored|lewd|erotic|topless|porn|xxx|r18)/.test(notes)) {
    return false
  }
  return true
}

function normalizeAsset(
  item: any,
  type: 'cover' | 'hero' | 'logo',
  isAnimated: boolean,
): ArtworkOption {
  const url = String(item.url || '').trim()
  const thumb = String(item.thumb || url).trim()
  const mime = item.mime || (isAnimated ? 'image/webp' : 'image/jpeg')
  return {
    id: String(item.id),
    url,
    thumbnail_url: thumb || url,
    mime,
    is_animated:
      isAnimated ||
      Boolean(item.animated) ||
      mime.startsWith('video/') ||
      url.endsWith('.webm') ||
      url.endsWith('.mp4'),
    width: item.width || 0,
    height: item.height || 0,
    provider: 'steamgrid',
    type,
    artwork_type: type,
  }
}

export async function searchSgdbGameIds(name: string, env: Env): Promise<number[]> {
  if (!name || !name.trim()) return []
  const trimmed = name.trim()

  if (/^\d+$/.test(trimmed)) {
    return [parseInt(trimmed, 10)]
  }
  const urlMatch = trimmed.match(/\/game\/(\d+)/)
  if (urlMatch) {
    return [parseInt(urlMatch[1], 10)]
  }

  const encoded = encodeURIComponent(trimmed)
  const cleaned = cleanTitle(trimmed)
  const queries = [querySgdb(`/search/autocomplete/${encoded}`, env).catch(() => null)]
  if (cleaned && cleaned !== trimmed.toLowerCase()) {
    queries.push(
      querySgdb(`/search/autocomplete/${encodeURIComponent(cleaned)}`, env).catch(() => null),
    )
  }

  const responses = await Promise.all(queries)
  const ids: number[] = []
  const seen = new Set<number>()

  for (const json of responses) {
    if (Array.isArray(json?.data)) {
      for (const item of json.data.slice(0, 2)) {
        const id = Number(item?.id)
        if (id > 0 && !seen.has(id)) {
          seen.add(id)
          ids.push(id)
        }
      }
    }
  }

  return ids.slice(0, 2)
}

export async function searchSgdbGameId(name: string, env: Env): Promise<number | null> {
  const ids = await searchSgdbGameIds(name, env)
  return ids[0] ?? null
}

async function fetchKindAssets(
  kind: 'grids' | 'heroes' | 'logos',
  targetSegment: string,
  env: Env,
): Promise<ArtworkOption[]> {
  const typeMap: Record<string, 'cover' | 'hero' | 'logo'> = {
    grids: 'cover',
    heroes: 'hero',
    logos: 'logo',
  }
  const type = typeMap[kind] || 'cover'

  const promises: Promise<{ items: any[]; isAnimated: boolean }>[] = []

  const staticPages = kind === 'grids' ? [0, 1, 2] : [0, 1]
  for (const page of staticPages) {
    promises.push(
      querySgdb(
        `/${kind}/${targetSegment}?types=static&nsfw=false&humor=false&epilepsy=false&page=${page}`,
        env,
      )
        .then((res) => ({ items: Array.isArray(res?.data) ? res.data : [], isAnimated: false }))
        .catch(() => ({ items: [], isAnimated: false })),
    )
  }

  for (const page of [0, 1]) {
    promises.push(
      querySgdb(
        `/${kind}/${targetSegment}?types=animated&nsfw=false&humor=false&epilepsy=false&page=${page}`,
        env,
      )
        .then((res) => ({ items: Array.isArray(res?.data) ? res.data : [], isAnimated: true }))
        .catch(() => ({ items: [], isAnimated: true })),
    )
  }

  const batches = await Promise.all(promises)
  const results: ArtworkOption[] = []
  const seenUrls = new Set<string>()

  for (const batch of batches) {
    for (const item of batch.items) {
      if (isSafeAsset(item) && item.url && !seenUrls.has(item.url)) {
        seenUrls.add(item.url)
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
  const tasks: Promise<ArtworkOption[]>[] = []
  if (gameId) {
    tasks.push(fetchKindAssets(kind, `game/${gameId}`, env))
  }
  if (appId) {
    tasks.push(fetchKindAssets(kind, `steam/${appId}`, env))
  }

  const batches = await Promise.all(tasks)
  const combined: ArtworkOption[] = []
  const seen = new Set<string>()
  for (const list of batches) {
    for (const item of list) {
      if (!seen.has(item.url)) {
        seen.add(item.url)
        combined.push(item)
      }
    }
  }
  return combined
}
