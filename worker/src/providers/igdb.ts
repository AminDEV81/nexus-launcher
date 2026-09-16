import type { Env, HubGame, HubGameDetails } from '../types'
import { getTwitchToken } from './twitch-auth'

const IGDB_BASE = 'https://api.igdb.com/v4'
const STANDALONE_TYPES = '(0, 8, 9, 10, 4)'

const FIELDS_LIST =
  'fields name, summary, first_release_date, game_type, cover.image_id, screenshots.image_id, total_rating_count, aggregated_rating, hypes, genres.name, platforms.name'

const FIELDS_DETAILS =
  'fields name, summary, first_release_date, game_type, cover.image_id, screenshots.image_id, total_rating_count, aggregated_rating, hypes, genres.name, platforms.name, involved_companies.developer, involved_companies.publisher, involved_companies.company.name, videos.video_id'

function makeImageUrl(imageId: string | undefined, size: string): string | null {
  if (!imageId) return null
  return `https://images.igdb.com/igdb/image/upload/t_${size}/${imageId}.jpg`
}

function normalizeGame(item: any): HubGame {
  const screenshots = Array.isArray(item.screenshots) ? item.screenshots : []
  const firstScreenshotId = screenshots[0]?.image_id
  const coverImageId = item.cover?.image_id

  const backdropUrl = firstScreenshotId
    ? makeImageUrl(firstScreenshotId, '1080p')
    : makeImageUrl(coverImageId, '1080p')

  let releaseDateStr: string | null = null
  if (typeof item.first_release_date === 'number') {
    const d = new Date(item.first_release_date * 1000)
    releaseDateStr = d.toISOString().split('T')[0]
  }

  const genres = Array.isArray(item.genres)
    ? item.genres.map((g: any) => g.name).filter(Boolean)
    : []

  const platforms = Array.isArray(item.platforms)
    ? item.platforms.map((p: any) => p.name).filter(Boolean)
    : []

  return {
    igdb_id: item.id,
    name: item.name || '',
    summary: item.summary || null,
    release_date: releaseDateStr,
    game_type: item.game_type ?? null,
    cover_url: makeImageUrl(coverImageId, 'cover_big'),
    backdrop_url: backdropUrl,
    rating: typeof item.aggregated_rating === 'number' ? Math.round(item.aggregated_rating) : null,
    rating_count: item.total_rating_count ?? null,
    hypes: item.hypes ?? null,
    genres,
    platforms,
  }
}

async function queryIgdb(endpoint: string, queryBody: string, env: Env): Promise<any[]> {
  const token = await getTwitchToken(env)
  const clientId = env.IGDB_CLIENT_ID!

  const res = await fetch(`${IGDB_BASE}/${endpoint}`, {
    method: 'POST',
    headers: {
      'Client-ID': clientId,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'text/plain',
    },
    body: queryBody,
  })

  if (!res.ok) {
    const errText = await res.text()
    if (res.status === 429) {
      throw new Error('IGDB_RATE_LIMITED: Upstream rate limit exceeded.')
    }
    throw new Error(`IGDB_ERROR_${res.status}: ${errText}`)
  }

  return (await res.json()) as any[]
}

export async function fetchFeed(
  feed: string,
  offset = 0,
  genresParam?: string,
  env?: Env,
): Promise<HubGame[]> {
  if (!env) throw new Error('ENV_MISSING')
  const now = Math.floor(Date.now() / 1000)
  const ninetyDaysAgo = now - 90 * 86_400
  const threeYearsAgo = now - 3 * 365 * 86_400
  let query = ''

  const normFeed = feed.toLowerCase().replace(/-/g, '_')

  switch (normFeed) {
    case 'new_releases':
      // Banner & New Releases: High-hype trending games released in the last 90 days
      query = `${FIELDS_LIST}; where game_type = ${STANDALONE_TYPES} & cover != null & first_release_date < ${now} & first_release_date > ${ninetyDaysAgo} & (hypes > 2 | total_rating_count > 10); sort hypes desc; limit 24; offset ${offset};`
      break
    case 'coming_soon':
      // Upcoming releases soonest first
      query = `${FIELDS_LIST}; where game_type = ${STANDALONE_TYPES} & cover != null & first_release_date > ${now} & hypes > 1; sort first_release_date asc; limit 24; offset ${offset};`
      break
    case 'top_rated':
      // Acclaimed masterpieces with over 75 ratings and verified covers
      query = `${FIELDS_LIST}; where game_type = ${STANDALONE_TYPES} & cover != null & first_release_date < ${now} & first_release_date > ${threeYearsAgo} & total_rating_count > 75; sort total_rating_count desc; limit 24; offset ${offset};`
      break
    case 'recommended':
      // User's genres if passed, or top popular masterpieces
      if (genresParam && genresParam.trim()) {
        const cleanGenres = genresParam.replace(/[^0-9,]/g, '')
        query = `${FIELDS_LIST}; where game_type = ${STANDALONE_TYPES} & cover != null & genres = (${cleanGenres}) & first_release_date < ${now} & total_rating_count > 30; sort total_rating_count desc; limit 24; offset ${offset};`
      } else {
        query = `${FIELDS_LIST}; where game_type = ${STANDALONE_TYPES} & cover != null & first_release_date < ${now} & total_rating_count > 60; sort total_rating_count desc; limit 24; offset ${offset};`
      }
      break
    default:
      throw new Error(`INVALID_FEED: Unknown feed ${feed}`)
  }

  const raw = await queryIgdb('games', query, env)
  return raw.map(normalizeGame)
}

export async function searchGames(
  queryText: string,
  offset = 0,
  genreId?: number,
  platformId?: number,
  env?: Env,
): Promise<HubGame[]> {
  if (!env) throw new Error('ENV_MISSING')
  const cleanQ = queryText.replace(/["\\]/g, '').trim()

  if (genreId || platformId) {
    const conditions = [`game_type = ${STANDALONE_TYPES}`, 'cover != null']
    if (cleanQ) conditions.push(`name ~ *"${cleanQ}"*`)
    if (genreId) conditions.push(`genres = [${genreId}]`)
    if (platformId) conditions.push(`platforms = [${platformId}]`)

    const query = `${FIELDS_LIST}; where ${conditions.join(' & ')}; sort total_rating_count desc; limit 24; offset ${offset};`
    const raw = await queryIgdb('games', query, env)
    return raw.map(normalizeGame)
  }

  if (cleanQ.length >= 2) {
    // 1. First attempt: standard exact search with cover != null
    const searchQuery = `search "${cleanQ}"; ${FIELDS_LIST}; where game_type = ${STANDALONE_TYPES} & cover != null; limit 24; offset ${offset};`
    const searchRaw = await queryIgdb('games', searchQuery, env)
    if (searchRaw && searchRaw.length > 0) {
      return searchRaw.map(normalizeGame)
    }

    // 2. Fallback: wildcard name match sorted by popularity
    const fallbackQuery = `${FIELDS_LIST}; where game_type = ${STANDALONE_TYPES} & cover != null & name ~ *"${cleanQ}"*; sort total_rating_count desc; limit 24; offset ${offset};`
    const fallbackRaw = await queryIgdb('games', fallbackQuery, env)
    return fallbackRaw.map(normalizeGame)
  }

  return []
}

export async function getGameDetails(igdbId: number, env: Env): Promise<HubGameDetails | null> {
  const query = `${FIELDS_DETAILS}; where id = ${igdbId};`
  const raw = await queryIgdb('games', query, env)
  const item = raw[0]
  if (!item) return null

  const base = normalizeGame(item)

  let developer: string | null = null
  let publisher: string | null = null

  if (Array.isArray(item.involved_companies)) {
    const devs: string[] = []
    const pubs: string[] = []
    for (const ic of item.involved_companies) {
      const name = ic.company?.name
      if (!name) continue
      if (ic.developer) devs.push(name)
      if (ic.publisher) pubs.push(name)
    }
    developer = devs.length ? devs.join(', ') : null
    publisher = pubs.length ? pubs.join(', ') : null
  }

  let trailerUrl: string | null = null
  if (Array.isArray(item.videos) && item.videos[0]?.video_id) {
    trailerUrl = `https://www.youtube.com/watch?v=${item.videos[0].video_id}`
  }

  const screenshotUrls: string[] = []
  if (Array.isArray(item.screenshots)) {
    for (const sc of item.screenshots) {
      if (sc.image_id) {
        screenshotUrls.push(`https://images.igdb.com/igdb/image/upload/t_1080p/${sc.image_id}.jpg`)
      }
    }
  }

  return {
    ...base,
    developer,
    publisher,
    trailer_url: trailerUrl,
    screenshot_urls: screenshotUrls,
  }
}

export async function getGenres(env: Env): Promise<{ id: number; name: string }[]> {
  const query = 'fields name; sort name asc; limit 50;'
  return await queryIgdb('genres', query, env)
}

export async function getPlatforms(env: Env): Promise<{ id: number; name: string }[]> {
  const query = 'fields name; sort name asc; limit 50;'
  return await queryIgdb('platforms', query, env)
}

export async function getSimilarGames(igdbId: number, env: Env): Promise<HubGame[]> {
  const query = `fields similar_games.id, similar_games.name, similar_games.summary, similar_games.first_release_date, similar_games.game_type, similar_games.cover.image_id, similar_games.screenshots.image_id, similar_games.total_rating_count, similar_games.aggregated_rating, similar_games.hypes, similar_games.genres.name, similar_games.platforms.name, genres.id; where id = ${igdbId};`

  const raw = await queryIgdb('games', query, env)
  const item = raw[0]
  if (!item) return []

  const games: HubGame[] = []
  const seenIds = new Set<number>([igdbId])

  if (Array.isArray(item.similar_games)) {
    for (const sim of item.similar_games) {
      if (sim && sim.id && !seenIds.has(sim.id)) {
        seenIds.add(sim.id)
        const g = normalizeGame(sim)
        const isStandalone = g.game_type === null || [0, 4, 8, 9, 10].includes(g.game_type)
        if (isStandalone && g.cover_url) {
          games.push(g)
        }
      }
    }
  }

  // Augment with popular games from the same genres if fewer than 10
  const genreIds: number[] = Array.isArray(item.genres)
    ? item.genres.map((g: any) => g.id).filter((id: any) => typeof id === 'number')
    : []

  if (games.length < 10 && genreIds.length > 0) {
    const genreClause = genreIds.slice(0, 3).join(',')
    const fallbackQuery = `${FIELDS_LIST}; where game_type = ${STANDALONE_TYPES} & cover != null & genres = (${genreClause}) & id != ${igdbId}; sort total_rating_count desc; limit 16;`
    const fallbackRaw = await queryIgdb('games', fallbackQuery, env)
    for (const entry of fallbackRaw) {
      if (entry && entry.id && !seenIds.has(entry.id)) {
        seenIds.add(entry.id)
        games.push(normalizeGame(entry))
        if (games.length >= 16) break
      }
    }
  }

  return games
}
