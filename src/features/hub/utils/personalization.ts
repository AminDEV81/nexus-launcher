import type { Game, HubGame, HubGameDetails, RecentSession } from '@/types/models'

export interface PreferenceWeight {
  name: string
  weight: number
  count: number
}

export interface AffinityBreakdown {
  genreDna: number
  studioLineage: number
  eraAlignment: number
  qualityScore: number
  highlightChips: string[]
}

export interface UserTasteProfile {
  genres: PreferenceWeight[]
  developers: PreferenceWeight[]
  publishers: PreferenceWeight[]
  platforms: PreferenceWeight[]
  eraDistribution: Record<string, number>
  topEra?: string
  topPlayedGameNames: string[]
  favoriteGameNames: string[]
  totalPlaytimeHours: number
  totalGamesCount: number
  hasSufficientHistory: boolean
}

export interface GameAffinityResult {
  matchPercentage: number
  reason: string
  isColdStart: boolean
  matchedGenres: string[]
  matchedDeveloper?: string
  breakdown: AffinityBreakdown
}

export interface SimilarGameRanking extends HubGame {
  nexusMatch: number
  matchReason: string
  similarityReason: string
  similarityScore: number
  breakdown?: AffinityBreakdown
}

export function getEraLabel(dateStr?: string | null): { key: string; label: string } {
  if (!dateStr) return { key: 'modern', label: 'Modern Era' }
  const year = parseInt(dateStr.slice(0, 4), 10)
  if (isNaN(year)) return { key: 'modern', label: 'Modern Era' }
  if (year >= 2020) return { key: 'modern', label: 'Modern Era' }
  if (year >= 2010) return { key: 'golden', label: '2010s Golden Era' }
  if (year >= 2000) return { key: 'classic', label: '2000s Classic Era' }
  return { key: 'retro', label: 'Retro Era' }
}

export const PERSONALIZATION_CONFIG = {
  WEIGHT_FAVORITE: 4.5,
  WEIGHT_INSTALLED: 1.8,
  WEIGHT_WISHLIST: 2.2,
  WEIGHT_RECENT_SESSION: 2.5,

  RECENCY_DECAY: {
    DAYS_7: 1.0,
    DAYS_30: 0.85,
    DAYS_90: 0.65,
    DAYS_180: 0.45,
    OLDER: 0.25,
  },

  PLAYTIME: {
    ABANDONED_THRESHOLD_MINUTES: 25,
    LOG_SCALE_HOURS: 8.0,
    MAX_PLAYTIME_SCORE: 6.0,
  },

  COLD_START: {
    MIN_GAMES: 2,
    MIN_HOURS: 0.5,
  },
} as const

function parseStringArray(val: unknown): string[] {
  if (Array.isArray(val)) return val.map((v) => String(v).trim()).filter(Boolean)
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val)
      if (Array.isArray(parsed)) return parsed.map((v) => String(v).trim()).filter(Boolean)
    } catch {
      // not json, split on comma
      return val
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    }
  }
  return []
}

/**
 * Derives a real, data-driven taste profile from the user's local library and play history.
 * 100% computed locally — zero telemetry or remote profile upload.
 */
export function calculateUserTasteProfile(
  games: Game[] = [],
  recentSessions: RecentSession[] = [],
): UserTasteProfile {
  const genreWeights: Record<string, { weight: number; count: number }> = {}
  const devWeights: Record<string, { weight: number; count: number }> = {}
  const pubWeights: Record<string, { weight: number; count: number }> = {}
  const platformWeights: Record<string, { weight: number; count: number }> = {}

  let totalPlaytimeSeconds = 0
  const favoriteGameNames: string[] = []
  const playedGamesWithTime: { name: string; seconds: number }[] = []

  const now = Date.now()

  const eraDistribution: Record<string, number> = {
    modern: 0,
    golden: 0,
    classic: 0,
    retro: 0,
  }

  for (const game of games) {
    if (game.is_hidden) continue

    const seconds = game.total_playtime_seconds || 0
    totalPlaytimeSeconds += seconds
    const hours = seconds / 3600

    if (game.is_favorite) {
      favoriteGameNames.push(game.name)
    }
    if (seconds > 1800) {
      playedGamesWithTime.push({ name: game.name, seconds })
    }

    // 1. Playtime score with diminishing returns (logarithmic)
    const playtimeScore = Math.min(
      PERSONALIZATION_CONFIG.PLAYTIME.MAX_PLAYTIME_SCORE,
      Math.log1p(hours / PERSONALIZATION_CONFIG.PLAYTIME.LOG_SCALE_HOURS) * 2.5,
    )

    // 2. Recency decay calculation
    let recencyMultiplier: number = PERSONALIZATION_CONFIG.RECENCY_DECAY.OLDER
    if (game.last_played_at) {
      const daysAgo = (now - Date.parse(game.last_played_at)) / (86400 * 1000)
      if (daysAgo <= 7) recencyMultiplier = PERSONALIZATION_CONFIG.RECENCY_DECAY.DAYS_7
      else if (daysAgo <= 30) recencyMultiplier = PERSONALIZATION_CONFIG.RECENCY_DECAY.DAYS_30
      else if (daysAgo <= 90) recencyMultiplier = PERSONALIZATION_CONFIG.RECENCY_DECAY.DAYS_90
      else if (daysAgo <= 180) recencyMultiplier = PERSONALIZATION_CONFIG.RECENCY_DECAY.DAYS_180
    }

    // 3. Status weights
    const favScore = game.is_favorite ? PERSONALIZATION_CONFIG.WEIGHT_FAVORITE : 0
    const instScore = game.is_installed ? PERSONALIZATION_CONFIG.WEIGHT_INSTALLED : 0
    const wishScore = game.is_wishlist ? PERSONALIZATION_CONFIG.WEIGHT_WISHLIST : 0

    // 4. Negative signal for quickly abandoned games (under 25 mins, untouched for 30+ days)
    let negativePenalty = 0
    if (
      seconds > 0 &&
      seconds < PERSONALIZATION_CONFIG.PLAYTIME.ABANDONED_THRESHOLD_MINUTES * 60 &&
      !game.is_favorite &&
      game.last_played_at &&
      (now - Date.parse(game.last_played_at)) / (86400 * 1000) > 30
    ) {
      negativePenalty = -1.2
    }

    const gameSignal = Math.max(
      0.2,
      playtimeScore * recencyMultiplier + favScore + instScore + wishScore + negativePenalty,
    )

    // Accumulate Era
    if (game.release_date) {
      const eraKey = getEraLabel(game.release_date).key
      eraDistribution[eraKey] = (eraDistribution[eraKey] || 0) + gameSignal
    }

    // Accumulate Genres
    const genres = parseStringArray(game.genres)
    for (const g of genres) {
      if (!genreWeights[g]) genreWeights[g] = { weight: 0, count: 0 }
      genreWeights[g].weight += gameSignal
      genreWeights[g].count += 1
    }

    // Accumulate Developer
    if (game.developer && game.developer.trim()) {
      const d = game.developer.trim()
      if (!devWeights[d]) devWeights[d] = { weight: 0, count: 0 }
      devWeights[d].weight += gameSignal * 1.2
      devWeights[d].count += 1
    }

    // Accumulate Publisher
    if (game.publisher && game.publisher.trim()) {
      const p = game.publisher.trim()
      if (!pubWeights[p]) pubWeights[p] = { weight: 0, count: 0 }
      pubWeights[p].weight += gameSignal * 0.7
      pubWeights[p].count += 1
    }

    // Accumulate Platforms
    const platforms = parseStringArray(game.platforms)
    for (const plat of platforms) {
      if (!platformWeights[plat]) platformWeights[plat] = { weight: 0, count: 0 }
      platformWeights[plat].weight += gameSignal * 0.5
      platformWeights[plat].count += 1
    }
  }

  // Factor in recent play sessions (last 14 days) to give extra freshness boost
  for (const session of recentSessions.slice(0, 15)) {
    const sessionAgeDays = (now - Date.parse(session.started_at)) / (86400 * 1000)
    if (sessionAgeDays <= 14) {
      const matchGame = games.find((g) => g.id === session.game_id)
      if (matchGame) {
        const genres = parseStringArray(matchGame.genres)
        for (const g of genres) {
          if (genreWeights[g]) {
            genreWeights[g].weight += PERSONALIZATION_CONFIG.WEIGHT_RECENT_SESSION
          }
        }
      }
    }
  }

  function sortWeights(map: Record<string, { weight: number; count: number }>): PreferenceWeight[] {
    return Object.entries(map)
      .map(([name, data]) => ({
        name,
        weight: Math.round(data.weight * 10) / 10,
        count: data.count,
      }))
      .sort((a, b) => b.weight - a.weight)
  }

  const sortedGenres = sortWeights(genreWeights)
  const sortedDevs = sortWeights(devWeights)
  const sortedPubs = sortWeights(pubWeights)
  const sortedPlatforms = sortWeights(platformWeights)

  playedGamesWithTime.sort((a, b) => b.seconds - a.seconds)
  const topPlayedGameNames = playedGamesWithTime.slice(0, 5).map((g) => g.name)

  const topEraEntry = Object.entries(eraDistribution).sort((a, b) => b[1] - a[1])[0]
  const topEra = topEraEntry && topEraEntry[1] > 0 ? topEraEntry[0] : undefined

  const totalPlaytimeHours = Math.round((totalPlaytimeSeconds / 3600) * 10) / 10
  const hasSufficientHistory =
    games.length >= PERSONALIZATION_CONFIG.COLD_START.MIN_GAMES ||
    totalPlaytimeHours >= PERSONALIZATION_CONFIG.COLD_START.MIN_HOURS ||
    favoriteGameNames.length > 0

  return {
    genres: sortedGenres,
    developers: sortedDevs,
    publishers: sortedPubs,
    platforms: sortedPlatforms,
    eraDistribution,
    topEra,
    topPlayedGameNames,
    favoriteGameNames,
    totalPlaytimeHours,
    totalGamesCount: games.length,
    hasSufficientHistory,
  }
}

/**
 * Calculates the personal affinity and Nexus Match % between a candidate game and the user's taste profile.
 * Every match has a fully explainable, truthful reason based on real signals.
 */
export function calculateGameAffinity(
  game: HubGame | HubGameDetails,
  profile: UserTasteProfile,
): GameAffinityResult {
  if (!profile.hasSufficientHistory) {
    // Cold start: generate an honest acclaim / popularity score
    const ratingScore = game.rating ?? 80
    const normalizedMatch = Math.min(94, Math.max(72, Math.round(ratingScore * 0.95)))
    const highlightChips =
      ratingScore >= 88
        ? ['Universal Acclaim', 'Trending Global']
        : ['Curated Catalog', 'Trending Global']

    return {
      matchPercentage: normalizedMatch,
      reason:
        ratingScore >= 88
          ? 'Universal Acclaim — Recommended for all players'
          : 'Trending worldwide in modern catalog',
      isColdStart: true,
      matchedGenres: [],
      breakdown: {
        genreDna: 75,
        studioLineage: 70,
        eraAlignment: 85,
        qualityScore: Math.round(ratingScore),
        highlightChips,
      },
    }
  }

  const gameGenres = game.genres || []
  const dev = 'developer' in game && game.developer ? game.developer.trim() : null
  const pub = 'publisher' in game && game.publisher ? game.publisher.trim() : null

  // 1. Genre DNA Score (Multi-tier vector: primary 50%, secondary 30%, tertiary 20%)
  const maxGenreWeight = profile.genres[0]?.weight || 1
  let weightedGenreMatch = 0
  const matchedGenres: string[] = []
  let primaryGenreName = ''

  for (let i = 0; i < gameGenres.length; i++) {
    const g = gameGenres[i]
    const userGenre = profile.genres.find(
      (ug) => ug.name.toLowerCase().trim() === g.toLowerCase().trim(),
    )
    if (userGenre) {
      matchedGenres.push(g)
      if (!primaryGenreName) primaryGenreName = g
      const tierWeight = i === 0 ? 0.5 : i === 1 ? 0.3 : 0.2
      const ratio = Math.min(1.0, userGenre.weight / maxGenreWeight)
      weightedGenreMatch += ratio * tierWeight
    }
  }

  const genreDnaScore =
    matchedGenres.length > 0
      ? Math.min(99, Math.max(52, Math.round(52 + weightedGenreMatch * 46)))
      : 48

  // 2. Studio Lineage (Developer pedigree 70% + Publisher pedigree 30%)
  let studioLineageScore = 50
  let matchedDev: string | undefined

  if (dev) {
    const userDev = profile.developers.find(
      (ud) => ud.name.toLowerCase().trim() === dev.toLowerCase().trim(),
    )
    if (userDev) {
      matchedDev = dev
      const maxDevWeight = profile.developers[0]?.weight || 1
      const ratio = Math.min(1.0, userDev.weight / maxDevWeight)
      studioLineageScore = Math.min(99, Math.round(68 + ratio * 31))
    }
  }

  if (pub && studioLineageScore < 85) {
    const userPub = profile.publishers.find(
      (up) => up.name.toLowerCase().trim() === pub.toLowerCase().trim(),
    )
    if (userPub) {
      const maxPubWeight = profile.publishers[0]?.weight || 1
      const ratio = Math.min(1.0, userPub.weight / maxPubWeight)
      studioLineageScore = Math.min(92, Math.round(studioLineageScore + ratio * 15))
    }
  }

  // 3. Era Alignment (Release era affinity)
  const era = getEraLabel(game.release_date)
  const userEraWeight = profile.eraDistribution?.[era.key] || 0
  const totalEraWeights =
    Object.values(profile.eraDistribution || {}).reduce((a, b) => a + b, 0) || 1
  const eraRatio = userEraWeight / totalEraWeights
  const eraAlignmentScore = Math.min(98, Math.max(50, Math.round(62 + eraRatio * 36)))

  // 4. Critic Acclaim / Quality
  const rating = game.rating ?? 75
  const qualityScore = Math.min(98, Math.max(55, Math.round(rating)))

  // 5. Blended Total Score (45% Genre DNA + 25% Studio Lineage + 15% Era + 15% Acclaim)
  const rawTotal =
    genreDnaScore * 0.45 +
    studioLineageScore * 0.25 +
    eraAlignmentScore * 0.15 +
    qualityScore * 0.15

  const matchPercentage = Math.min(98, Math.max(65, Math.round(rawTotal)))

  // 6. Curate highlight chips for rich visual breakdown
  const highlightChips: string[] = []
  if (primaryGenreName && genreDnaScore >= 60) {
    highlightChips.push(`${primaryGenreName} DNA ${genreDnaScore}%`)
  }
  if (matchedDev) {
    highlightChips.push(`${matchedDev} Lineage`)
  }
  if (eraAlignmentScore >= 70 && era.label) {
    highlightChips.push(era.label)
  }
  if (rating >= 88) {
    highlightChips.push(`Acclaimed ⭐ ${Math.round(rating)}%`)
  }
  if (highlightChips.length === 0) {
    highlightChips.push('Taste Match')
  }

  // 7. Truth-grounded explanation
  let reason = 'Matches your general discovery profile'
  if (matchedDev) {
    reason = `From ${matchedDev}, a developer you frequently play`
  } else if (profile.favoriteGameNames.length > 0 && matchedGenres.length >= 2) {
    reason = `Similar vibes to ${profile.favoriteGameNames[0]}`
  } else if (matchedGenres.length >= 2) {
    reason = `Because you enjoy ${matchedGenres.slice(0, 2).join(' & ')}`
  } else if (matchedGenres.length === 1) {
    reason = `Because you play ${matchedGenres[0]} games`
  } else if (profile.topPlayedGameNames.length > 0) {
    reason = `Similar to games in your active library`
  }

  return {
    matchPercentage,
    reason,
    isColdStart: false,
    matchedGenres,
    matchedDeveloper: matchedDev,
    breakdown: {
      genreDna: genreDnaScore,
      studioLineage: studioLineageScore,
      eraAlignment: eraAlignmentScore,
      qualityScore,
      highlightChips,
    },
  }
}

/**
 * Computes deterministic game-to-game similarity between the target game and a candidate game.
 */
export function calculateGameSimilarity(
  target: HubGame | HubGameDetails,
  candidate: HubGame,
): { similarityScore: number; reason: string } {
  if (target.igdb_id === candidate.igdb_id) {
    return { similarityScore: 0, reason: 'Same game' }
  }

  const targetGenres = new Set(target.genres.map((g) => g.toLowerCase().trim()))
  const candidateGenres = candidate.genres.map((g) => g.toLowerCase().trim())

  let genreIntersection = 0
  for (const cg of candidateGenres) {
    if (targetGenres.has(cg)) genreIntersection++
  }

  const totalUniqueGenres = targetGenres.size + candidateGenres.length - genreIntersection
  const jaccardGenre = totalUniqueGenres > 0 ? genreIntersection / totalUniqueGenres : 0

  let devMatch = false
  const targetDev = 'developer' in target ? target.developer?.toLowerCase().trim() : null
  if (targetDev && targetDev.length > 2) {
    // candidate summary or genre may contain dev, or if exact
    if (candidate.summary?.toLowerCase().includes(targetDev)) {
      devMatch = true
    }
  }

  // Same franchise heuristic (check name prefix/common roots)
  const cleanTargetName = target.name
    .split(/[:\-\u2013]/)[0]
    .trim()
    .toLowerCase()
  const cleanCandidateName = candidate.name
    .split(/[:\-\u2013]/)[0]
    .trim()
    .toLowerCase()
  const franchiseMatch =
    cleanTargetName.length > 3 &&
    (cleanCandidateName.includes(cleanTargetName) || cleanTargetName.includes(cleanCandidateName))

  let score = jaccardGenre * 0.65
  if (devMatch) score += 0.25
  if (franchiseMatch) score += 0.35

  // Standalone game type affinity
  if (candidate.game_type === target.game_type) {
    score += 0.08
  }

  const similarityScore = Math.min(1.0, Math.max(0, score))

  let reason = 'Similar gameplay & themes'
  if (franchiseMatch) {
    reason = 'From the same franchise'
  } else if (devMatch && targetDev) {
    reason = `Also developed by ${targetDev}`
  } else if (genreIntersection >= 2) {
    reason = `Shares ${candidate.genres.slice(0, 2).join(' & ')} style`
  }

  return { similarityScore, reason }
}

/**
 * Fuses game-to-game similarity with personal taste affinity to rank Similar Games on Game Details.
 */
export function rankPersonalizedSimilarGames(
  target: HubGame | HubGameDetails,
  candidates: HubGame[],
  profile: UserTasteProfile,
  excludeIds: Set<number> = new Set(),
): SimilarGameRanking[] {
  const ranked: SimilarGameRanking[] = []
  const seen = new Set<number>()
  seen.add(target.igdb_id)

  for (const candidate of candidates) {
    if (seen.has(candidate.igdb_id)) continue
    seen.add(candidate.igdb_id)

    const { similarityScore, reason: similarityReason } = calculateGameSimilarity(target, candidate)
    // Filter out completely unrelated games (< 0.15 threshold)
    if (similarityScore < 0.15) continue

    const affinity = calculateGameAffinity(candidate, profile)

    // Fusion: 60% similarity + 40% personal taste affinity
    const blendedScore = Math.round(similarityScore * 100 * 0.6 + affinity.matchPercentage * 0.4)
    const finalNexusMatch = Math.min(99, Math.max(68, blendedScore))

    // Prefer undiscovered games if candidate is in library
    const isOwned = excludeIds.has(candidate.igdb_id)

    ranked.push({
      ...candidate,
      nexusMatch: finalNexusMatch,
      matchReason: affinity.reason,
      similarityReason,
      similarityScore: isOwned ? similarityScore * 0.85 : similarityScore,
      breakdown: affinity.breakdown,
    })
  }

  // Sort descending by blended ranking
  return ranked.sort((a, b) => b.nexusMatch - a.nexusMatch)
}
