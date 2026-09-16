import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NexusAudioEngine } from './audio-engine'

describe('audio-engine', () => {
  let originalDocument: typeof globalThis.document
  let originalWindow: typeof globalThis.window

  beforeEach(() => {
    originalDocument = globalThis.document
    originalWindow = globalThis.window

    const messageListeners: Array<(e: { data: unknown }) => void> = []

    const mockIframe = {
      id: '',
      style: {},
      src: '',
      allow: '',
      contentWindow: {
        postMessage: vi.fn(),
      },
    }

    const mockBody = {
      contains: vi.fn().mockReturnValue(true),
      appendChild: vi.fn(),
    }

    globalThis.document = {
      createElement: vi.fn().mockReturnValue(mockIframe),
      body: mockBody,
    } as unknown as Document

    globalThis.window = {
      location: { origin: 'http://localhost:1420' },
      addEventListener: vi.fn((event: string, cb: (e: { data: unknown }) => void) => {
        if (event === 'message') {
          messageListeners.push(cb)
        }
      }),
      dispatchEvent: vi.fn((event: { data: unknown }) => {
        for (const cb of messageListeners) {
          cb(event)
        }
        return true
      }),
    } as unknown as Window & typeof globalThis
  })

  afterEach(() => {
    globalThis.document = originalDocument
    globalThis.window = originalWindow
  })

  it('initializes with idle state', () => {
    const engine = new NexusAudioEngine()
    expect(engine.getState()).toBe('idle')
  })

  it('updates state via listeners and tracks callbacks', () => {
    const engine = new NexusAudioEngine()
    const stateSpy = vi.fn()
    const timeSpy = vi.fn()

    engine.setEventListeners({
      onStateChange: stateSpy,
      onTimeUpdate: timeSpy,
    })

    // Calling pause on idle when no audio
    engine.pause()
    expect(engine.getState()).toBe('idle')
  })

  it('handles volume and mute controls correctly', () => {
    const engine = new NexusAudioEngine()
    engine.setVolume(0.65)
    expect(engine.getVolume()).toBe(0.65)

    engine.setMuted(true)
    expect(engine.isMuted()).toBe(true)

    engine.setMuted(false)
    expect(engine.isMuted()).toBe(false)
  })

  it('handles YouTube postMessage onStateChange and infoDelivery', async () => {
    const engine = new NexusAudioEngine()
    const stateHistory: string[] = []
    const timeUpdates: Array<{ cur: number; dur: number }> = []

    engine.setEventListeners({
      onStateChange: (state) => stateHistory.push(state),
      onTimeUpdate: (cur, dur) => timeUpdates.push({ cur, dur }),
    })

    // Start playback for a youtube source
    await engine.play({
      type: 'youtube',
      url: 'test_vid_123',
      providerId: 'youtube',
    })

    expect(engine.getState()).toBe('loading')

    // Simulate YouTube onStateChange message: 1 = playing
    window.dispatchEvent({
      data: JSON.stringify({ event: 'onStateChange', info: 1 }),
    } as MessageEvent)
    expect(engine.getState()).toBe('playing')
    expect(stateHistory).toContain('playing')

    // Simulate YouTube infoDelivery message with currentTime
    window.dispatchEvent({
      data: JSON.stringify({
        event: 'infoDelivery',
        info: { currentTime: 14.5, duration: 210 },
      }),
    } as MessageEvent)
    expect(engine.getCurrentTime()).toBe(14.5)
    expect(engine.getDuration()).toBe(210)
    expect(timeUpdates.length).toBeGreaterThan(0)
    expect(timeUpdates[timeUpdates.length - 1]).toEqual({ cur: 14.5, dur: 210 })

    // Simulate YouTube pause
    engine.pause()
    expect(engine.getState()).toBe('paused')

    // Clean up
    engine.stop()
    expect(engine.getState()).toBe('idle')
  })

  it('safely returns null for getAnalyser on remote stream to avoid CORS muting', () => {
    const engine = new NexusAudioEngine()
    void engine.play({
      type: 'stream',
      url: 'https://vgmtreasurechest.com/soundtracks/test/01.mp3',
      providerId: 'khinsider',
    })
    // For remote streams, analyser must be null to prevent Web Audio CORS output silencing
    expect(engine.getAnalyser()).toBeNull()
  })

  it('handles track navigation (Track 1 -> Track 2 -> Track 1) without error', async () => {
    const engine = new NexusAudioEngine()
    const track1Source = {
      type: 'stream' as const,
      url: 'https://archive.org/download/test/track1.mp3',
      providerId: 'archive',
    }
    const track2Source = {
      type: 'stream' as const,
      url: 'https://archive.org/download/test/track2.mp3',
      providerId: 'archive',
    }

    // Play track 1
    await engine.play(track1Source)
    expect(engine.getCurrentSource()?.url).toBe(track1Source.url)

    // Switch to track 2
    await engine.play(track2Source)
    expect(engine.getCurrentSource()?.url).toBe(track2Source.url)

    // Switch back to track 1
    await engine.play(track1Source)
    expect(engine.getCurrentSource()?.url).toBe(track1Source.url)

    engine.stop()
    expect(engine.getState()).toBe('idle')
  })
})
