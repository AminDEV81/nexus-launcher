import type { ProviderCapabilities, ProviderHealth, SoundtrackProvider } from '../types'
import { LocalSoundtrackProvider } from './providers/local-provider'
import { KHInsiderProvider } from './providers/khinsider-provider'
import { MusicBrainzProvider } from './providers/musicbrainz-provider'
import { CoverArtArchiveProvider } from './providers/cover-art-archive-provider'
import { ArchiveOrgProvider } from './providers/archive-provider'
import { SteamSoundtrackProvider } from './providers/steam-provider'
import { IGDBSoundtrackProvider } from './providers/igdb-soundtrack-provider'
import { AudiusProvider } from './providers/audius-provider'
import { YouTubeDirectProvider } from './providers/youtube-direct-provider'
import { InvidiousAudioProvider } from './providers/invidious-provider'

const FAILURE_THRESHOLD = 3
const COOLDOWN_MS = 60 * 1000

export class SoundtrackProviderRegistry {
  private providers: Map<string, SoundtrackProvider> = new Map()
  private healthMap: Map<string, ProviderHealth> = new Map()
  private enabledMap: Map<string, boolean> = new Map()

  constructor() {
    this.register(new LocalSoundtrackProvider())
    this.register(new KHInsiderProvider())
    this.register(new MusicBrainzProvider())
    this.register(new CoverArtArchiveProvider())
    this.register(new ArchiveOrgProvider())
    this.register(new AudiusProvider())
    this.register(new YouTubeDirectProvider())
    this.register(new SteamSoundtrackProvider())
    this.register(new IGDBSoundtrackProvider())
    this.register(new InvidiousAudioProvider())
  }

  public register(provider: SoundtrackProvider) {
    this.providers.set(provider.id, provider)
    this.enabledMap.set(provider.id, true)
    this.healthMap.set(provider.id, {
      id: provider.id,
      status: 'healthy',
      consecutiveFailures: 0,
    })
  }

  public getProvider(id: string): SoundtrackProvider | undefined {
    return this.providers.get(id)
  }

  public getAllProviders(): SoundtrackProvider[] {
    return Array.from(this.providers.values()).sort((a, b) => a.priority - b.priority)
  }

  public getEnabledProviders(): SoundtrackProvider[] {
    return this.getAllProviders().filter((p) => this.enabledMap.get(p.id) !== false)
  }

  public setProviderEnabled(id: string, enabled: boolean) {
    this.enabledMap.set(id, enabled)
  }

  public isProviderEnabled(id: string): boolean {
    return this.enabledMap.get(id) !== false
  }

  public getHealth(id: string): ProviderHealth {
    const health = this.healthMap.get(id)
    if (!health) {
      return { id, status: 'healthy', consecutiveFailures: 0 }
    }

    // Check if cooldown expired
    if (health.cooldownUntil && Date.now() > health.cooldownUntil) {
      health.status = 'healthy'
      health.consecutiveFailures = 0
      health.cooldownUntil = undefined
    }

    return health
  }

  public recordSuccess(id: string) {
    const health = this.healthMap.get(id)
    if (health) {
      health.status = 'healthy'
      health.consecutiveFailures = 0
      health.lastError = undefined
      health.cooldownUntil = undefined
    }
  }

  public recordFailure(id: string, error: string) {
    const health = this.healthMap.get(id)
    if (health) {
      health.consecutiveFailures += 1
      health.lastError = error
      if (health.consecutiveFailures >= FAILURE_THRESHOLD) {
        health.status = 'unhealthy'
        health.cooldownUntil = Date.now() + COOLDOWN_MS
      } else {
        health.status = 'degraded'
      }
    }
  }

  public getProvidersForCapability(capability: keyof ProviderCapabilities): SoundtrackProvider[] {
    return this.getEnabledProviders()
      .filter((p) => p.capabilities[capability])
      .filter((p) => this.getHealth(p.id).status !== 'unhealthy')
  }

  /**
   * Executes a task using providers with automatic capability failover.
   * Tries providers in order of priority until one succeeds or all fail.
   */
  public async executeWithFailover<T>(
    capability: keyof ProviderCapabilities,
    task: (provider: SoundtrackProvider) => Promise<T | null | undefined>,
  ): Promise<{ result: T | null; usedProvider?: SoundtrackProvider }> {
    const candidates = this.getProvidersForCapability(capability)

    for (const provider of candidates) {
      try {
        const res = await task(provider)
        if (res !== null && res !== undefined) {
          this.recordSuccess(provider.id)
          return { result: res, usedProvider: provider }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        this.recordFailure(provider.id, msg)
        // Auto-failover to next provider
      }
    }

    return { result: null }
  }
}

export const providerRegistry = new SoundtrackProviderRegistry()
