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

function normalizeAsset(item: any, type: 'cover' | 'hero' | 'logo'): ArtworkOption {
  return {
    id: item.id,
    url: item.url,
    thumbnail_url: item.thumb || item.url,
    mime: item.mime || 'image/jpeg',
    is_animated: Boolean(item.animated),
    width: item.width || 0,
    height: item.height || 0,
    provider: 'steamgrid',
    type,
  }
}

export async function searchSgdbGameId(name: string, env: Env): Promise<number | null> {
  const encoded = encodeURIComponent(name.trim())
  const json = await querySgdb(`/search/autocomplete/${encoded}`, env)
  if (!json?.data || !Array.isArray(json.data) || json.data.length === 0) {
    return null
  }
  return json.data[0].id
}

export async function getSgdbArtwork(
  kind: 'grids' | 'heroes' | 'logos',
  appId: string | null,
  gameId: number | null,
  env: Env,
): Promise<ArtworkOption[]> {
  const typeMap: Record<string, 'cover' | 'hero' | 'logo'> = {
    grids: 'cover',
    heroes: 'hero',
    logos: 'logo',
  }
  const type = typeMap[kind] || 'cover'

  let path = ''
  if (appId) {
    path = `/${kind}/steam/${appId}`
  } else if (gameId) {
    path = `/${kind}/game/${gameId}`
  } else {
    return []
  }

  const json = await querySgdb(path, env)
  if (!json?.data || !Array.isArray(json.data)) {
    return []
  }

  return json.data.map((item: any) => normalizeAsset(item, type))
}
