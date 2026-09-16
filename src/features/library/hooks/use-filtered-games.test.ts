import { describe, expect, it } from 'vitest'
import { compareGames, matchesFilters, matchesSearch, matchesScope } from './use-filtered-games'
import type { AdvancedFilters } from '../store/library-ui-store'
import type { Game } from '@/types/models'

function makeGame(overrides: Partial<Game>): Game {
  return {
    id: 'g1',
    name: 'Test Game',
    executable_path: null,
    install_path: null,
    install_size_bytes: null,
    version: null,
    launch_arguments: null,
    is_installed: false,
    pre_launch_command: null,
    post_launch_command: null,
    source: 'manual',
    steam_app_id: null,
    igdb_id: null,
    is_wishlist: false,
    is_favorite: false,
    is_hidden: false,
    description: null,
    developer: null,
    publisher: null,
    release_date: null,
    genres: [],
    platforms: [],
    age_rating: null,
    metacritic_score: null,
    opencritic_score: null,
    trailer_url: null,
    cover_path: null,
    cover_is_animated: false,
    banner_path: null,
    logo_path: null,
    background_path: null,
    animated_cover_enabled: true,
    total_playtime_seconds: 0,
    last_played_at: null,
    added_at: '2026-01-01 00:00:00',
    tag_ids: [],
    user_rating: null,
    ...overrides,
  }
}

describe('matchesSearch', () => {
  const game = makeGame({
    name: 'Baldur\u2019s Gate 3',
    developer: 'Larian Studios',
    genres: ['RPG'],
  })

  it('matches case-insensitively across name, developer, and genre', () => {
    expect(matchesSearch(game, 'baldur')).toBe(true)
    expect(matchesSearch(game, 'larian')).toBe(true)
    expect(matchesSearch(game, 'rpg')).toBe(true)
    expect(matchesSearch(game, 'larian rpg')).toBe(false) // no substring across fields
    expect(matchesSearch(game, '')).toBe(true) // empty = match all
  })
})

describe('matchesFilters', () => {
  it('ORs within a field and ANDs across fields', () => {
    const game = makeGame({
      genres: ['RPG', 'Strategy'],
      platforms: ['PC (Microsoft Windows)'],
      developer: 'Larian Studios',
      release_date: '2023-08-03',
      tag_ids: ['t-backlog'],
      total_playtime_seconds: 36000, // 10h -> '10h-50h'
    })
    const filters: AdvancedFilters = {
      genres: new Set(['RPG', 'Strategy']),
      platforms: new Set(['PC (Microsoft Windows)']),
      developers: new Set(['Larian Studios']),
      years: new Set(['2023']),
      yearRange: { from: null, to: null },
      tags: new Set(['t-backlog']),
      playtime: new Set(['10h-50h']),
    }
    expect(matchesFilters(game, filters)).toBe(true)

    // Genre mismatch: game has RPG + Strategy, but filter requires RPG + Shooter -> false
    expect(matchesFilters(game, { ...filters, genres: new Set(['RPG', 'Shooter']) })).toBe(false)

    // Playtime tier mismatch -> false
    expect(matchesFilters(game, { ...filters, playtime: new Set(['unplayed']) })).toBe(false)
    // Every other field matches, but the year doesn't → AND fails.
    expect(matchesFilters(game, { ...filters, years: new Set(['2020']) })).toBe(false)
    // Year range matching (2020 to 2025 matches 2023)
    expect(
      matchesFilters(game, { ...filters, years: new Set(), yearRange: { from: 2020, to: 2025 } }),
    ).toBe(true)
    // Year range mismatch (2005 to 2010 does not match 2023)
    expect(
      matchesFilters(game, { ...filters, years: new Set(), yearRange: { from: 2005, to: 2010 } }),
    ).toBe(false)
    // No tag overlap → false.
    expect(matchesFilters(game, { ...filters, tags: new Set(['t-other']) })).toBe(false)
  })

  it('treats empty sets as "no filter on this field"', () => {
    const game = makeGame({ genres: [] })
    expect(
      matchesFilters(game, {
        genres: new Set(),
        platforms: new Set(),
        developers: new Set(),
        years: new Set(),
        yearRange: { from: null, to: null },
        tags: new Set(),
        playtime: new Set(),
      }),
    ).toBe(true)
  })
})

describe('compareGames (chronological sorts)', () => {
  // Regression guard for the lexicographic-sort bug: the DB stores both
  // legacy `YYYY-MM-DD HH:mm:ss` and RFC 3339 strings, whose raw string
  // order does NOT match chronological order across formats.
  const old = makeGame({ last_played_at: '2026-08-01 09:00:00', added_at: '2026-01-05 12:00:00' })
  const recent = makeGame({
    last_played_at: '2026-08-02T08:00:00+00:00',
    added_at: '2026-07-30T20:00:00+00:00',
  })

  it('sorts recently-played by actual time across mixed formats', () => {
    // Newer date comes first (negative comparator return value puts first arg first)
    expect(compareGames(recent, old, 'recently-played', 'all')).toBeLessThan(0)
    expect(compareGames(old, recent, 'recently-played', 'all')).toBeGreaterThan(0)
  })

  it('treats missing timestamps as the oldest', () => {
    const never = makeGame({ last_played_at: null })
    // Descending order puts the dated game first; the null one sorts last (0ms epoch)
    expect(compareGames(old, never, 'recently-played', 'all')).toBeLessThan(0)
    expect(compareGames(never, old, 'recently-played', 'all')).toBeGreaterThan(0)
  })

  it('sorts by playtime descending', () => {
    const casual = makeGame({ total_playtime_seconds: 100 })
    const addicted = makeGame({ total_playtime_seconds: 9999 })
    expect(compareGames(addicted, casual, 'playtime', 'all')).toBeLessThan(0)
  })

  it('sorts names alphabetically', () => {
    const a = makeGame({ name: 'Alan Wake' })
    const b = makeGame({ name: 'Zeno Clash' })
    expect(compareGames(a, b, 'name', 'all')).toBeLessThan(0)
  })

  it('sorts by custom drag order', () => {
    const a = makeGame({ id: 'g-a', name: 'Alan Wake' })
    const b = makeGame({ id: 'g-b', name: 'Zeno Clash' })
    const customOrder = ['g-b', 'g-a']
    expect(compareGames(a, b, 'custom', 'all', customOrder)).toBeGreaterThan(0)
    expect(compareGames(b, a, 'custom', 'all', customOrder)).toBeLessThan(0)
  })
})

describe('matchesScope', () => {
  it('places unreleased uninstalled games in wishlist instead of library all', () => {
    const unreleased = makeGame({
      release_date: '2099-12-31',
      is_installed: false,
      is_wishlist: false,
    })
    expect(matchesScope(unreleased, 'all')).toBe(false)
    expect(matchesScope(unreleased, 'wishlist')).toBe(true)
  })

  it('keeps installed games in all and installed even if date is future', () => {
    const installed = makeGame({
      release_date: '2099-12-31',
      is_installed: true,
      is_wishlist: false,
    })
    expect(matchesScope(installed, 'all')).toBe(true)
    expect(matchesScope(installed, 'installed')).toBe(true)
  })
})
