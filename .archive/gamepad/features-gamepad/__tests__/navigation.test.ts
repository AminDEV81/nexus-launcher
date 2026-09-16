import { describe, expect, it, vi } from 'vitest'
import {
  isInDirectionCone,
  computeSpatialScore,
  findBestSpatialCandidate,
  type RectLike,
} from '../utils/spatial-navigation'
import { InputRepeatController } from '../utils/input-repeat'

describe('Gamepad Spatial Navigation & Scoring', () => {
  const currentBox: RectLike = {
    left: 100,
    top: 100,
    right: 150,
    bottom: 150,
    width: 50,
    height: 50,
  }

  describe('Directional Cone Filtering', () => {
    it('detects elements strictly to the right', () => {
      const rightCandidate: RectLike = {
        left: 200,
        top: 100,
        right: 250,
        bottom: 150,
        width: 50,
        height: 50,
      }
      expect(isInDirectionCone(currentBox, rightCandidate, 'right')).toBe(true)
      expect(isInDirectionCone(currentBox, rightCandidate, 'left')).toBe(false)
      expect(isInDirectionCone(currentBox, rightCandidate, 'up')).toBe(false)
      expect(isInDirectionCone(currentBox, rightCandidate, 'down')).toBe(false)
    })

    it('detects elements strictly to the left', () => {
      const leftCandidate: RectLike = {
        left: 20,
        top: 100,
        right: 70,
        bottom: 150,
        width: 50,
        height: 50,
      }
      expect(isInDirectionCone(currentBox, leftCandidate, 'left')).toBe(true)
      expect(isInDirectionCone(currentBox, leftCandidate, 'right')).toBe(false)
    })

    it('detects elements strictly down', () => {
      const downCandidate: RectLike = {
        left: 100,
        top: 200,
        right: 150,
        bottom: 250,
        width: 50,
        height: 50,
      }
      expect(isInDirectionCone(currentBox, downCandidate, 'down')).toBe(true)
      expect(isInDirectionCone(currentBox, downCandidate, 'up')).toBe(false)
    })

    it('detects elements strictly up', () => {
      const upCandidate: RectLike = {
        left: 100,
        top: 20,
        right: 150,
        bottom: 70,
        width: 50,
        height: 50,
      }
      expect(isInDirectionCone(currentBox, upCandidate, 'up')).toBe(true)
      expect(isInDirectionCone(currentBox, upCandidate, 'down')).toBe(false)
    })
  })

  describe('Candidate Scoring & Selection', () => {
    it('calculates lower score for closer elements in navigation direction', () => {
      const nearCandidate: RectLike = {
        left: 170,
        top: 100,
        right: 220,
        bottom: 150,
        width: 50,
        height: 50,
      }
      const farCandidate: RectLike = {
        left: 300,
        top: 100,
        right: 350,
        bottom: 150,
        width: 50,
        height: 50,
      }

      const scoreNear = computeSpatialScore(currentBox, nearCandidate, 'right')
      const scoreFar = computeSpatialScore(currentBox, farCandidate, 'right')

      expect(scoreNear).toBeLessThan(scoreFar)
    })

    it('prefers vertically overlapping elements over vertically skewed elements', () => {
      const alignedCandidate: RectLike = {
        left: 200,
        top: 100,
        right: 250,
        bottom: 150,
        width: 50,
        height: 50,
      }
      const skewedCandidate: RectLike = {
        left: 200,
        top: 300,
        right: 250,
        bottom: 350,
        width: 50,
        height: 50,
      }

      const scoreAligned = computeSpatialScore(currentBox, alignedCandidate, 'right')
      const scoreSkewed = computeSpatialScore(currentBox, skewedCandidate, 'right')

      expect(scoreAligned).toBeLessThan(scoreSkewed)
    })

    it('awards bonus for elements in the same focus group', () => {
      const candidate: RectLike = {
        left: 200,
        top: 100,
        right: 250,
        bottom: 150,
        width: 50,
        height: 50,
      }

      const scoreDiffGroup = computeSpatialScore(currentBox, candidate, 'right', false)
      const scoreSameGroup = computeSpatialScore(currentBox, candidate, 'right', true)

      expect(scoreSameGroup).toBeLessThan(scoreDiffGroup)
    })

    it('awards score improvements for higher priority elements', () => {
      const candidate: RectLike = {
        left: 200,
        top: 100,
        right: 250,
        bottom: 150,
        width: 50,
        height: 50,
      }

      const scorePriority0 = computeSpatialScore(currentBox, candidate, 'right', false, 0)
      const scorePriority2 = computeSpatialScore(currentBox, candidate, 'right', false, 2)

      expect(scorePriority2).toBeLessThan(scorePriority0)
    })

    it('ranks closer aligned candidates strictly lower than farther candidates in a list/grid without clamping to 0', () => {
      const cur: RectLike = { left: 200, right: 600, top: 200, bottom: 250, width: 400, height: 50 }
      const cand1Up: RectLike = {
        left: 200,
        right: 600,
        top: 140,
        bottom: 190,
        width: 400,
        height: 50,
      }
      const cand2Up: RectLike = {
        left: 200,
        right: 600,
        top: 80,
        bottom: 130,
        width: 400,
        height: 50,
      }
      const cand3Up: RectLike = {
        left: 200,
        right: 600,
        top: 20,
        bottom: 70,
        width: 400,
        height: 50,
      }

      const score1 = computeSpatialScore(cur, cand1Up, 'up', true)
      const score2 = computeSpatialScore(cur, cand2Up, 'up', true)
      const score3 = computeSpatialScore(cur, cand3Up, 'up', true)

      expect(score1).toBeLessThan(score2)
      expect(score2).toBeLessThan(score3)
    })

    it('picks the best spatial candidate using findBestSpatialCandidate', () => {
      const createMockEl = (rect: RectLike, group?: string) => {
        return {
          getBoundingClientRect: () => ({
            ...rect,
            x: rect.left,
            y: rect.top,
            toJSON: () => ({}),
          }),
          getAttribute: (attr: string) => (attr === 'data-gamepad-group' ? (group ?? null) : null),
        } as unknown as HTMLElement
      }

      const currentEl = createMockEl(currentBox, 'library')
      const nearEl = createMockEl(
        { left: 180, top: 100, right: 230, bottom: 150, width: 50, height: 50 },
        'library',
      )
      const farEl = createMockEl(
        { left: 320, top: 100, right: 370, bottom: 150, width: 50, height: 50 },
        'library',
      )

      const best = findBestSpatialCandidate(currentEl, [nearEl, farEl], 'right')
      expect(best).toBe(nearEl)
    })
  })
})

describe('InputRepeatController', () => {
  it('triggers on first press with check()', () => {
    const repeater = new InputRepeatController()
    expect(repeater.check('down', 1000)).toBe(true)
  })

  it('delays repeat during the initial delay window (450ms)', () => {
    const repeater = new InputRepeatController()
    repeater.check('down', 1000) // First trigger

    // At 100ms, should return false (holding during delay window)
    expect(repeater.check('down', 1100)).toBe(false)
    // At 350ms, still within 450ms initial delay
    expect(repeater.check('down', 1350)).toBe(false)
  })

  it('repeats at repeat interval (140ms) once initial delay expires', () => {
    const repeater = new InputRepeatController()
    repeater.check('down', 1000) // First trigger

    // At 500ms: still within 550ms initial delay -> no repeat
    expect(repeater.check('down', 1500)).toBe(false)

    // At 555ms: initial delay exceeded -> fires repeat
    expect(repeater.check('down', 1555)).toBe(true)

    // At 600ms (only 45ms after 1555): too soon for next repeat
    expect(repeater.check('down', 1600)).toBe(false)

    // At 700ms (145ms after 1555): repeat interval met -> fires repeat
    expect(repeater.check('down', 1700)).toBe(true)
  })

  it('filters out micro-releases and contact bounce within debounce window', () => {
    const repeater = new InputRepeatController()
    expect(repeater.check('down', 1000)).toBe(true) // First trigger

    // Micro-bounce to null at 1030ms
    expect(repeater.check(null, 1030)).toBe(false)

    // Bounces back to down at 1050ms (within 70ms debounce window)
    // Should NOT re-trigger as a new rising edge
    expect(repeater.check('down', 1050)).toBe(false)
  })

  it('resets and triggers a new step after release debounce expires (70ms)', () => {
    const repeater = new InputRepeatController()
    expect(repeater.check('down', 1000)).toBe(true)

    // Released at 1100ms
    expect(repeater.check(null, 1100)).toBe(false)
    // 80ms later (debounce expired)
    expect(repeater.check(null, 1180)).toBe(false)

    // Pressed again -> triggers as new press
    expect(repeater.check('down', 1200)).toBe(true)
  })

  it('suppresses rapid direction flutter within cooldown and triggers when cooldown expires', () => {
    const repeater = new InputRepeatController()
    expect(repeater.check('down', 1000)).toBe(true)

    // Rapid diagonal rock/flutter to up within 50ms is suppressed
    expect(repeater.check('up', 1050)).toBe(false)

    // Direction changes after minStepCooldownMs (120ms) -> fires immediately
    expect(repeater.check('up', 1130)).toBe(true)
  })

  it('prevents accidental double stepping during rapid D-pad contact bounce', () => {
    const repeater = new InputRepeatController()
    // Initial press
    expect(repeater.check('up', 1000)).toBe(true)

    // Micro-bounce: release 40ms, press again at 80ms
    expect(repeater.check(null, 1040)).toBe(false)
    // Pressed again at 1080ms (< 120ms cooldown) -> MUST NOT trigger double step
    expect(repeater.check('up', 1080)).toBe(false)

    // Released and pressed after cooldown (1150ms) -> valid new step
    expect(repeater.check(null, 1100)).toBe(false)
    expect(repeater.check('up', 1180)).toBe(true)
  })

  describe('Analog Stick Direction Resolution & Hysteresis', () => {
    it('requires threshold of 0.55 to engage from rest', () => {
      const repeater = new InputRepeatController()
      expect(repeater.resolveStickDirection(0.3, 0)).toBeNull()
      expect(repeater.resolveStickDirection(0.5, 0)).toBeNull()
      expect(repeater.resolveStickDirection(0.6, 0)).toBe('right')
    })

    it('maintains engaged direction until falling below release threshold of 0.35', () => {
      const repeater = new InputRepeatController()
      // Engage
      expect(repeater.resolveStickDirection(0.7, 0)).toBe('right')

      // Decay to 0.45 (above 0.35 release threshold) -> remains engaged
      expect(repeater.resolveStickDirection(0.45, 0)).toBe('right')

      // Decay below 0.35 -> releases
      expect(repeater.resolveStickDirection(0.2, 0)).toBeNull()
    })

    it('determines primary axis correctly', () => {
      const repeater = new InputRepeatController()
      // Y is larger than X -> down
      expect(repeater.resolveStickDirection(0.2, 0.8)).toBe('down')

      repeater.reset()
      // Negative Y -> up
      expect(repeater.resolveStickDirection(0.1, -0.8)).toBe('up')

      repeater.reset()
      // Negative X -> left
      expect(repeater.resolveStickDirection(-0.8, 0.1)).toBe('left')
    })

    it('swallows spring-back re-engage within 300ms of a stick step', () => {
      vi.useFakeTimers()
      try {
        vi.setSystemTime(0)
        const repeater = new InputRepeatController()
        // Flick up: resolve stick engages at t=0 -> check() fires step
        expect(repeater.resolveStickDirection(0, -0.7, 0)).toBe('up')
        expect(repeater.check('up', 0)).toBe(true)

        // Stick releases (spring falls below 0.35 at t=50ms)
        expect(repeater.resolveStickDirection(0, -0.2, 50)).toBeNull()

        // Spring overshoots back across engage threshold at t=150ms (< 300ms) -> bounce, swallowed
        expect(repeater.resolveStickDirection(0, -0.7, 150)).toBeNull()

        // A deliberate second flick after 300ms passes (at t=350ms)
        expect(repeater.check(null, 350)).toBe(false)
        expect(repeater.resolveStickDirection(0, -0.7, 350)).toBe('up')
      } finally {
        vi.useRealTimers()
      }
    })
  })
})
