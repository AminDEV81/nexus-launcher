import { describe, expect, it } from 'vitest'
import { buildSmartRows } from './smart-rows'
import type { Game } from '@/types/models'

function mockGame(overrides: Partial<Game>): Game {
  return {
    id: 'g1',
    name: 'Cyberpunk 2077',
    executable_path: 'C:/Games/CP2077/bin/Cyberpunk2077.exe',
    install_path: 'C:/Games/CP2077',
    install_size_bytes: 70000000000,
    version: null,
    launch_arguments: null,
    is_installed: true,
    pre_launch_command: null,
    post_launch_command: null,
    source: 'steam',
    steam_app_id: '1091500',
    igdb_id: 1877,
    is_wishlist: false,
    is_favorite: false,
    is_hidden: false,
    description: null,
    developer: 'CD PROJEKT RED',
    publisher: null,
    release_date: '2020-12-10',
    genres: ['RPG', 'Shooter'],
    platforms: ['PC'],
    age_rating: null,
    metacritic_score: 86,
    opencritic_score: 86,
    trailer_url: null,
    cover_path: null,
    cover_is_animated: false,
    banner_path: null,
    logo_path: null,
    background_path: null,
    animated_cover_enabled: false,
    total_playtime_seconds: 12000,
    last_played_at: '2026-10-20T12:00:00Z',
    added_at: '2026-10-01T12:00:00Z',
    tag_ids: ['sci-fi'],
    user_rating: 9,
    is_memory: false,
    ...overrides,
  }
}

describe('Console Smart Rows Builder', () => {
  it('excludes hidden and Memory games and builds smart rows cleanly', () => {
    const games: Game[] = [
      mockGame({ id: 'g1', name: 'Cyberpunk 2077', is_favorite: true, total_playtime_seconds: 50000 }),
      mockGame({ id: 'g2', name: 'The Witcher 3', genres: ['RPG'], total_playtime_seconds: 1800 }),
      mockGame({ id: 'g3', name: 'Deus Ex', genres: ['RPG', 'Shooter'], last_played_at: '2025-01-01T00:00:00Z' }),
      mockGame({ id: 'g_hidden', name: 'Hidden Game', is_hidden: true, is_favorite: true }),
      mockGame({ id: 'g_mem', name: 'Deleted Memory Game', is_memory: true, is_favorite: true }),
    ]

    const rows = buildSmartRows({
      games,
      runningGameIds: new Set(['g1']),
      nowMs: new Date('2026-10-28T00:00:00Z').getTime(),
    })

    const allIds = rows.flatMap((r) => r.items.map((i) => i.id))
    expect(allIds).not.toContain('g_hidden')
    expect(allIds).not.toContain('g_mem')

    expect(rows.some((r) => r.id === 'recently_played')).toBe(true)
    expect(rows.some((r) => r.id === 'favorites')).toBe(true)
    expect(rows.some((r) => r.id === 'because_you_played')).toBe(true)
    expect(rows.some((r) => r.id === 'back_in_the_day')).toBe(true)
  })
})
