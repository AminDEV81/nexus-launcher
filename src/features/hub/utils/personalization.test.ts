import { describe, expect, it } from 'vitest'
import type { Game, HubGame } from '@/types/models'
import {
  calculateGameAffinity,
  calculateGameSimilarity,
  calculateUserTasteProfile,
  rankPersonalizedSimilarGames,
} from './personalization'

function createMockGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'game-1',
    name: 'Elden Ring',
    executable_path: null,
    install_path: null,
    install_size_bytes: null,
    version: null,
    launch_arguments: null,
    is_installed: true,
    pre_launch_command: null,
    post_launch_command: null,
    source: 'steam',
    steam_app_id: '1245620',
    igdb_id: 119133,
    is_wishlist: false,
    is_favorite: true,
    is_hidden: false,
    description: null,
    developer: 'FromSoftware',
    publisher: 'Bandai Namco',
    release_date: '2022-02-25',
    genres: ['Action', 'RPG'],
    platforms: ['PC'],
    age_rating: null,
    metacritic_score: 96,
    opencritic_score: 95,
    trailer_url: null,
    cover_path: null,
    cover_is_animated: false,
    banner_path: null,
    logo_path: null,
    background_path: null,
    animated_cover_enabled: false,
    total_playtime_seconds: 72000,
    last_played_at: new Date().toISOString(),
    added_at: new Date().toISOString(),
    tag_ids: [],
    user_rating: null,
    is_memory: false,
    ...overrides,
  }
}

function createMockHubGame(overrides: Partial<HubGame> = {}): HubGame {
  return {
    igdb_id: 100,
    name: 'Dark Souls III',
    summary: 'A dark fantasy action role-playing game by FromSoftware.',
    release_date: '2016-03-24',
    game_type: 0,
    cover_url: 'https://example.com/ds3.jpg',
    backdrop_url: null,
    rating: 89,
    rating_count: 500,
    hypes: 200,
    genres: ['Action', 'RPG'],
    platforms: ['PC'],
    ...overrides,
  }
}

describe('Personalization - calculateUserTasteProfile', () => {
  it('identifies cold start when library is empty', () => {
    const profile = calculateUserTasteProfile([])
    expect(profile.hasSufficientHistory).toBe(false)
    expect(profile.genres).toHaveLength(0)
  })

  it('computes top genres and developers based on weighted library games', () => {
    const games = [
      createMockGame({
        id: '1',
        name: 'Elden Ring',
        genres: ['Action', 'RPG'],
        developer: 'FromSoftware',
        total_playtime_seconds: 72000,
        is_favorite: true,
      }),
      createMockGame({
        id: '2',
        name: 'Cyberpunk 2077',
        genres: ['RPG', 'Sci-Fi'],
        developer: 'CD Projekt Red',
        total_playtime_seconds: 36000,
        is_favorite: false,
      }),
    ]

    const profile = calculateUserTasteProfile(games)
    expect(profile.hasSufficientHistory).toBe(true)
    expect(profile.genres.length).toBeGreaterThan(0)
    expect(profile.genres[0].name).toBe('RPG')
    expect(profile.developers[0].name).toBe('FromSoftware')
  })
})

describe('Personalization - calculateGameAffinity', () => {
  it('returns cold start match for new users', () => {
    const coldProfile = calculateUserTasteProfile([])
    const hubGame = createMockHubGame()
    const affinity = calculateGameAffinity(hubGame, coldProfile)

    expect(affinity.isColdStart).toBe(true)
    expect(affinity.matchPercentage).toBeGreaterThan(70)
    expect(affinity.reason).toContain('Acclaim')
  })

  it('calculates high match percentage and reason for games matching user taste', () => {
    const games = [
      createMockGame({
        genres: ['Action', 'RPG'],
        developer: 'FromSoftware',
        total_playtime_seconds: 100000,
      }),
    ]
    const profile = calculateUserTasteProfile(games)
    const hubGame = createMockHubGame({
      genres: ['Action', 'RPG'],
      summary: 'Action RPG by FromSoftware',
    })

    const affinity = calculateGameAffinity(hubGame, profile)
    expect(affinity.isColdStart).toBe(false)
    expect(affinity.matchPercentage).toBeGreaterThan(65)
    expect(affinity.reason).toMatch(/Because you|From|Similar/i)
    expect(affinity.breakdown).toBeDefined()
    expect(affinity.breakdown.genreDna).toBeGreaterThanOrEqual(60)
    expect(affinity.breakdown.highlightChips.length).toBeGreaterThan(0)
  })
})

describe('Personalization - calculateGameSimilarity', () => {
  it('recognizes franchise match and genre overlap', () => {
    const target = createMockHubGame({
      igdb_id: 1,
      name: 'Dark Souls',
      genres: ['Action', 'RPG'],
    })
    const candidate = createMockHubGame({
      igdb_id: 2,
      name: 'Dark Souls II',
      genres: ['Action', 'RPG'],
    })

    const result = calculateGameSimilarity(target, candidate)
    expect(result.similarityScore).toBeGreaterThan(0.7)
    expect(result.reason).toContain('franchise')
  })

  it('detects genre similarity between different games', () => {
    const target = createMockHubGame({
      igdb_id: 1,
      name: 'Elden Ring',
      genres: ['Action', 'RPG', 'Open World'],
    })
    const candidate = createMockHubGame({
      igdb_id: 3,
      name: 'Dragon Dogma 2',
      genres: ['Action', 'RPG'],
    })

    const result = calculateGameSimilarity(target, candidate)
    expect(result.similarityScore).toBeGreaterThan(0.3)
    expect(result.reason).toContain('Action')
  })
})

describe('Personalization - rankPersonalizedSimilarGames', () => {
  it('fuses 60% similarity + 40% affinity and sorts candidates', () => {
    const target = createMockHubGame({
      igdb_id: 1,
      name: 'Elden Ring',
      genres: ['Action', 'RPG'],
    })
    const profile = calculateUserTasteProfile([
      createMockGame({
        genres: ['RPG'],
        total_playtime_seconds: 50000,
      }),
    ])

    const candidates: HubGame[] = [
      createMockHubGame({ igdb_id: 201, name: 'FIFA 24', genres: ['Sports'] }),
      createMockHubGame({ igdb_id: 202, name: 'Dark Souls III', genres: ['Action', 'RPG'] }),
      createMockHubGame({ igdb_id: 203, name: 'Lies of P', genres: ['Action', 'Soulslike'] }),
    ]

    const ranked = rankPersonalizedSimilarGames(target, candidates, profile)
    expect(ranked[0].name).toBe('Dark Souls III')
    expect(ranked[0].nexusMatch).toBeGreaterThan(ranked[1]?.nexusMatch ?? 0)
  })
})
