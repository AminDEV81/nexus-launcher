import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest'
import { installFpsLimiter, setFpsLimitEnabled, setTargetFps } from './fps-limiter'

describe('FPS Limiter', () => {
  let mockRaf: any
  let mockCaf: any
  let nextId = 100

  beforeEach(() => {
    nextId = 100
    mockRaf = vi.fn((_cb: any) => ++nextId)
    mockCaf = vi.fn()

    ;(globalThis as any).window = {
      requestAnimationFrame: mockRaf,
      cancelAnimationFrame: mockCaf,
    }

    installFpsLimiter(60)
    setFpsLimitEnabled(true)
    setTargetFps(60)
  })

  afterEach(() => {
    delete (globalThis as any).window
  })

  it('queues and executes requestAnimationFrame callbacks', () => {
    const callback = vi.fn()
    const id = (globalThis as any).window.requestAnimationFrame(callback)

    expect(typeof id).toBe('number')
    expect(id).toBeGreaterThan(0)
    expect(callback).not.toHaveBeenCalled()
  })

  it('supports cancelling scheduled frames via cancelAnimationFrame', () => {
    const callback = vi.fn()
    const id = (globalThis as any).window.requestAnimationFrame(callback)

    ;(globalThis as any).window.cancelAnimationFrame(id)
    expect(callback).not.toHaveBeenCalled()
  })

  it('can be toggled on and off cleanly', () => {
    setFpsLimitEnabled(false)
    const callback = vi.fn()
    const id = (globalThis as any).window.requestAnimationFrame(callback)
    expect(id).toBeDefined()
    ;(globalThis as any).window.cancelAnimationFrame(id)

    setFpsLimitEnabled(true)
  })
})
