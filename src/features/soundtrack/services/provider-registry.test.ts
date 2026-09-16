import { describe, expect, it } from 'vitest'
import { SoundtrackProviderRegistry } from './provider-registry'
import type { SoundtrackProvider } from '../types'

function createMockProvider(id: string, priority: number, canStream = false): SoundtrackProvider {
  return {
    id,
    name: `Mock ${id}`,
    priority,
    capabilities: {
      metadata: true,
      artwork: true,
      streaming: canStream,
      downloading: false,
      externalPlayback: false,
    },
    searchGame: async () => [],
    getAlbums: async () => [],
    getAlbum: async () => null,
    getPlaybackSource: async () => null,
    getDownloadSource: async () => null,
  }
}

describe('provider-registry', () => {
  it('registers providers and sorts by priority', () => {
    const registry = new SoundtrackProviderRegistry()
    const p1 = createMockProvider('test-1', 50)
    const p2 = createMockProvider('test-2', 10)

    registry.register(p1)
    registry.register(p2)

    const all = registry.getAllProviders()
    const indexP2 = all.findIndex((p) => p.id === 'test-2')
    const indexP1 = all.findIndex((p) => p.id === 'test-1')
    expect(indexP2).toBeLessThan(indexP1)
  })

  it('triggers circuit breaker after consecutive failures', () => {
    const registry = new SoundtrackProviderRegistry()
    const p1 = createMockProvider('faulty-provider', 1, true)
    registry.register(p1)

    expect(registry.getHealth('faulty-provider').status).toBe('healthy')

    // 1st failure -> degraded
    registry.recordFailure('faulty-provider', 'Network timeout 1')
    expect(registry.getHealth('faulty-provider').status).toBe('degraded')

    // 2nd failure -> degraded
    registry.recordFailure('faulty-provider', 'Network timeout 2')
    expect(registry.getHealth('faulty-provider').status).toBe('degraded')

    // 3rd failure -> unhealthy (circuit breaker opens)
    registry.recordFailure('faulty-provider', 'Network timeout 3')
    expect(registry.getHealth('faulty-provider').status).toBe('unhealthy')

    // Capability query excludes unhealthy provider
    const streamingCandidates = registry.getProvidersForCapability('streaming')
    expect(streamingCandidates.some((p) => p.id === 'faulty-provider')).toBe(false)
  })

  it('fails over automatically to secondary provider on error', async () => {
    const registry = new SoundtrackProviderRegistry()
    const p1 = createMockProvider('primary', 1, true)
    const p2 = createMockProvider('secondary', 2, true)

    registry.register(p1)
    registry.register(p2)

    const execution = await registry.executeWithFailover('streaming', async (provider) => {
      if (provider.id === 'primary') {
        throw new Error('Primary stream service down')
      }
      return 'https://secondary.stream/track.mp3'
    })

    expect(execution.result).toBe('https://secondary.stream/track.mp3')
    expect(execution.usedProvider?.id).toBe('secondary')
    expect(registry.getHealth('primary').consecutiveFailures).toBe(1)
  })

  it('recovers provider health on success', () => {
    const registry = new SoundtrackProviderRegistry()
    const p = createMockProvider('recovering', 1)
    registry.register(p)

    registry.recordFailure('recovering', 'Temporary blip')
    expect(registry.getHealth('recovering').status).toBe('degraded')

    registry.recordSuccess('recovering')
    expect(registry.getHealth('recovering').status).toBe('healthy')
    expect(registry.getHealth('recovering').consecutiveFailures).toBe(0)
  })
})
