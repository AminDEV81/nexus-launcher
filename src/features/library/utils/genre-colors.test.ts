import { describe, expect, it } from 'vitest'
import { genreColor } from './genre-colors'

describe('genreColor', () => {
  it('maps every known IGDB genre to its fixed color', () => {
    expect(genreColor('Role-playing (RPG)')).toBe('#c084fc')
    expect(genreColor('Shooter')).toBe('#dc2626')
    expect(genreColor('Adventure')).toBe('#f59e0b')
  })

  it('falls back deterministically for unknown genres', () => {
    // Same unknown name must always produce the same color — a random
    // pick would make chips flicker on every render.
    const first = genreColor('Some Future IGDB Genre')
    expect(genreColor('Some Future IGDB Genre')).toBe(first)
    expect(first).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('distinguishes unknown genres reasonably', () => {
    // Not a strict requirement, but a palette of 8 that always collides
    // would defeat the point of per-genre colors.
    const colors = new Set(
      ['Puzzle-lite', 'Walking Simulator 2', 'Roguelike Deckbuilder', 'Idler'].map(genreColor),
    )
    expect(colors.size).toBeGreaterThan(1)
  })
})
