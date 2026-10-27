import type { Env, HubGame, HubGameDetails } from '../types'
import { getTwitchToken } from './twitch-auth'
import { getSteamMetacriticScore } from './steam'

const IGDB_BASE = 'https://api.igdb.com/v4'
const STANDALONE_TYPES = '(0, 8, 9, 10, 4)'
const SEARCH_TYPES = '(0, 2, 3, 4, 8, 9, 10, 11)'

const FIELDS_LIST =
  'fields name, summary, first_release_date, game_type, cover.image_id, screenshots.image_id, total_rating_count, aggregated_rating, total_rating, rating, hypes, genres.name, platforms.name'

const FIELDS_DETAILS =
  'fields name, summary, first_release_date, game_type, cover.image_id, screenshots.image_id, total_rating_count, aggregated_rating, total_rating, rating, hypes, genres.name, platforms.name, involved_companies.developer, involved_companies.publisher, involved_companies.company.name, videos.video_id, videos.name, external_games.external_game_source, external_games.category, external_games.uid'

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

  const rawRating =
    typeof item.aggregated_rating === 'number'
      ? item.aggregated_rating
      : typeof item.total_rating === 'number'
        ? item.total_rating
        : typeof item.rating === 'number'
          ? item.rating
          : null

  return {
    igdb_id: item.id,
    name: item.name || '',
    summary: item.summary || null,
    release_date: releaseDateStr,
    game_type: item.game_type ?? null,
    cover_url: makeImageUrl(coverImageId, 'cover_big'),
    backdrop_url: backdropUrl,
    rating: rawRating !== null ? Math.round(rawRating) : null,
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

  const safeOffset = Math.max(0, Math.min(1000, Number.isFinite(offset) ? Math.floor(offset) : 0))
  const normFeed = feed.toLowerCase().replace(/-/g, '_')

  switch (normFeed) {
    case 'new_releases':
      query = `${FIELDS_LIST}; where game_type = ${STANDALONE_TYPES} & cover != null & first_release_date < ${now} & first_release_date > ${ninetyDaysAgo} & (hypes > 2 | total_rating_count > 10); sort hypes desc; limit 24; offset ${safeOffset};`
      break
    case 'coming_soon':
      query = `${FIELDS_LIST}; where game_type = ${STANDALONE_TYPES} & cover != null & first_release_date > ${now} & hypes > 1; sort first_release_date asc; limit 24; offset ${safeOffset};`
      break
    case 'top_rated':
      query = `${FIELDS_LIST}; where game_type = ${STANDALONE_TYPES} & cover != null & first_release_date < ${now} & first_release_date > ${threeYearsAgo} & total_rating_count > 75; sort total_rating_count desc; limit 24; offset ${safeOffset};`
      break
    case 'recommended': {
      const validGenres = genresParam
        ? genresParam
            .split(',')
            .map((s) => Number.parseInt(s.trim(), 10))
            .filter((n) => Number.isInteger(n) && n > 0)
        : []
      if (validGenres.length > 0) {
        query = `${FIELDS_LIST}; where game_type = ${STANDALONE_TYPES} & cover != null & genres = (${validGenres.join(',')}) & first_release_date < ${now} & total_rating_count > 30; sort total_rating_count desc; limit 24; offset ${safeOffset};`
      } else {
        query = `${FIELDS_LIST}; where game_type = ${STANDALONE_TYPES} & cover != null & first_release_date < ${now} & total_rating_count > 60; sort total_rating_count desc; limit 24; offset ${safeOffset};`
      }
      break
    }
    default:
      throw new Error(`INVALID_FEED: Unknown feed ${feed}`)
  }

  const raw = await queryIgdb('games', query, env)
  return raw.map(normalizeGame)
}

export interface SearchGamesOptions {
  queryText: string
  offset?: number
  genreIds?: number[]
  platformIds?: number[]
  release?: string
  minRating?: number
  sort?: string
  gameCategory?: string
  gameMode?: string
  env: Env
}

function buildNameWildcardClause(cleanQ: string): string | null {
  const stopWords = new Set(['the', 'a', 'an', 'of', 'and'])
  const tokens = cleanQ
    .split(/[\s\-:'’/&]+/)
    .map((w) => w.replace(/[^a-zA-Z0-9]/g, ''))
    .filter(Boolean)

  if (tokens.length === 0) return null
  const meaningful = tokens.filter(
    (w) => !stopWords.has(w.toLowerCase()) && (w.length >= 2 || /^\d+$/.test(w)),
  )
  const chosen = (meaningful.length > 0 ? meaningful : tokens).slice(0, 5)
  return chosen.map((w) => `name ~ *"${w}"*`).join(' & ')
}

export async function searchGames(
  queryOrOptions: string | SearchGamesOptions,
  offsetArg = 0,
  genreIdArg?: number,
  platformIdArg?: number,
  envArg?: Env,
): Promise<HubGame[]> {
  let opts: SearchGamesOptions
  if (typeof queryOrOptions === 'object') {
    opts = queryOrOptions
  } else {
    opts = {
      queryText: queryOrOptions,
      offset: offsetArg,
      genreIds: genreIdArg ? [genreIdArg] : undefined,
      platformIds: platformIdArg ? [platformIdArg] : undefined,
      env: envArg!,
    }
  }

  const {
    queryText,
    offset = 0,
    genreIds,
    platformIds,
    release,
    minRating,
    sort,
    gameCategory,
    gameMode,
    env,
  } = opts
  if (!env) throw new Error('ENV_MISSING')
  const cleanQ = queryText.replace(/["\\]/g, '').trim()
  const now = Math.floor(Date.now() / 1000)

  const hasFilters = Boolean(
    (genreIds && genreIds.length > 0) ||
    (platformIds && platformIds.length > 0) ||
    release ||
    minRating != null ||
    sort ||
    (gameCategory && gameCategory !== 'all') ||
    (gameMode && gameMode !== 'all'),
  )

  if (hasFilters) {
    let typeClause = `game_type = ${SEARCH_TYPES}`
    if (gameCategory === 'main') typeClause = 'game_type = 0'
    else if (gameCategory === 'remake') typeClause = 'game_type = (8, 9)'
    else if (gameCategory === 'expansion') typeClause = 'game_type = (2, 4, 10)'

    const conditions = [typeClause, 'cover != null']
    if (cleanQ) {
      const wc = buildNameWildcardClause(cleanQ)
      if (wc) conditions.push(wc)
    }
    if (genreIds && genreIds.length > 0) {
      if (genreIds.length === 1) {
        conditions.push(`genres = (${genreIds[0]})`)
      } else {
        conditions.push(`genres = [${genreIds.join(',')}]`)
      }
    }
    if (platformIds && platformIds.length > 0) {
      if (platformIds.length === 1) {
        conditions.push(`platforms = (${platformIds[0]})`)
      } else {
        conditions.push(`platforms = [${platformIds.join(',')}]`)
      }
    }
    if (gameMode) {
      if (gameMode === 'singleplayer') conditions.push('game_modes = (1)')
      else if (gameMode === 'multiplayer') conditions.push('game_modes = (2, 5)')
      else if (gameMode === 'coop') conditions.push('game_modes = (3)')
      else if (gameMode === 'splitscreen') conditions.push('game_modes = (4)')
    }
    if (minRating != null) {
      conditions.push(
        `(aggregated_rating >= ${minRating} | total_rating >= ${minRating} | rating >= ${minRating})`,
      )
    }
    if (release) {
      if (release === 'upcoming') {
        conditions.push(`first_release_date > ${now}`)
      } else if (release === 'new') {
        conditions.push(`first_release_date > ${now - 90 * 86400} & first_release_date <= ${now}`)
      } else if (release === 'last-year') {
        conditions.push(`first_release_date > ${now - 365 * 86400} & first_release_date <= ${now}`)
      } else if (release === 'last-3-years') {
        conditions.push(
          `first_release_date > ${now - 3 * 365 * 86400} & first_release_date <= ${now}`,
        )
      } else if (release.startsWith('-')) {
        const to = parseInt(release.replace('-', ''), 10)
        if (!isNaN(to)) {
          const endTs = Math.floor(Date.UTC(to + 1, 0, 1) / 1000)
          conditions.push(`first_release_date < ${endTs}`)
        }
      } else if (release.endsWith('+')) {
        const from = parseInt(release.replace('+', ''), 10)
        if (!isNaN(from)) {
          const startTs = Math.floor(Date.UTC(from, 0, 1) / 1000)
          conditions.push(`first_release_date >= ${startTs}`)
        }
      } else if (release.includes('-')) {
        const parts = release.split('-')
        const from = parseInt(parts[0], 10)
        const to = parseInt(parts[1], 10)
        if (!isNaN(from) && !isNaN(to)) {
          const minYear = Math.min(from, to)
          const maxYear = Math.max(from, to)
          const startTs = Math.floor(Date.UTC(minYear, 0, 1) / 1000)
          const endTs = Math.floor(Date.UTC(maxYear + 1, 0, 1) / 1000)
          conditions.push(`first_release_date >= ${startTs} & first_release_date < ${endTs}`)
        }
      } else {
        const year = parseInt(release, 10)
        if (!isNaN(year)) {
          const startTs = Math.floor(Date.UTC(year, 0, 1) / 1000)
          const endTs = Math.floor(Date.UTC(year + 1, 0, 1) / 1000)
          conditions.push(`first_release_date >= ${startTs} & first_release_date < ${endTs}`)
        }
      }
    }

    let sortOrder = 'total_rating_count desc'
    if (sort === 'rating') {
      sortOrder = 'total_rating desc'
      conditions.push('(aggregated_rating != null | total_rating != null) & total_rating_count >= 5')
    } else if (sort === 'hypes') {
      sortOrder = 'hypes desc'
      conditions.push('hypes != null')
    } else if (sort === 'newest') {
      sortOrder = 'first_release_date desc'
      if (release !== 'upcoming') {
        conditions.push(`first_release_date != null & first_release_date <= ${now}`)
      }
    } else if (sort === 'oldest') {
      sortOrder = 'first_release_date asc'
      conditions.push('first_release_date != null')
    } else if (sort === 'name') {
      sortOrder = 'name asc'
    } else if (release === 'upcoming') {
      sortOrder = 'first_release_date asc'
    } else if (release === 'new') {
      sortOrder = 'hypes desc'
    }

    const query = `${FIELDS_LIST}; where ${conditions.join(' & ')}; sort ${sortOrder}; limit 36; offset ${offset};`
    const raw = await queryIgdb('games', query, env)
    return raw.map(normalizeGame)
  }

  if (cleanQ.length >= 2) {
    const wc = buildNameWildcardClause(cleanQ)
    const searchQuery = `search "${cleanQ}"; ${FIELDS_LIST}; where game_type = ${SEARCH_TYPES} & cover != null; limit 30; offset ${offset};`
    if (wc) {
      const wildcardQuery = `${FIELDS_LIST}; where game_type = ${SEARCH_TYPES} & cover != null & ${wc}; sort total_rating_count desc; limit 24; offset ${safeOffset};`
      const [wildRaw, searchRaw] = await Promise.all([
        queryIgdb('games', wildcardQuery, env).catch(() => []),
        queryIgdb('games', searchQuery, env).catch(() => []),
      ])
      const seen = new Set<number>()
      const merged: HubGame[] = []
      for (const item of [...wildRaw, ...searchRaw]) {
        if (item && typeof item.id === 'number' && !seen.has(item.id)) {
          seen.add(item.id)
          merged.push(normalizeGame(item))
        }
      }
      return merged
    }
    const searchRaw = await queryIgdb('games', searchQuery, env)
    return (searchRaw || []).map(normalizeGame)
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

  const videos: HubGameDetails['videos'] = Array.isArray(item.videos)
    ? item.videos
        .filter((v: any) => v && v.video_id)
        .map((v: any) => ({ name: v.name || null, video_id: String(v.video_id) }))
    : []

  let steamAppId: string | null = null
  if (Array.isArray(item.external_games)) {
    const steamEntry = item.external_games.find(
      (eg: any) => eg.external_game_source === 1 || eg.category === 1,
    )
    if (steamEntry && steamEntry.uid) {
      steamAppId = String(steamEntry.uid)
    }
  }

  const metacriticScore = steamAppId ? await getSteamMetacriticScore(steamAppId) : null

  return {
    ...base,
    developer,
    publisher,
    trailer_url: trailerUrl,
    videos,
    screenshot_urls: screenshotUrls,
    metacritic_score: metacriticScore,
    steam_app_id: steamAppId,
  }
}

export async function getGenres(env: Env): Promise<{ id: number; name: string }[]> {
  const query = 'fields name; sort name asc; limit 50;'
  return await queryIgdb('genres', query, env)
}

export async function getPlatforms(
  env: Env,
): Promise<{ id: number; name: string; abbreviation?: string }[]> {
  const query =
    'fields name, abbreviation; where id = (3, 6, 14, 48, 49, 130, 167, 169, 508); sort name asc; limit 50;'
  return await queryIgdb('platforms', query, env)
}

export async function getSimilarGames(igdbId: number, env: Env): Promise<HubGame[]> {
  const query = `fields similar_games.id, similar_games.name, similar_games.summary, similar_games.first_release_date, similar_games.game_type, similar_games.cover.image_id, similar_games.screenshots.image_id, similar_games.total_rating_count, similar_games.aggregated_rating, similar_games.total_rating, similar_games.hypes, similar_games.genres.name, similar_games.platforms.name, genres.id; where id = ${igdbId};`

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
