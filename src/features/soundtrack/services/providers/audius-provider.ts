import { BaseSoundtrackProvider } from './base-provider'
import type {
  GameIdentity,
  PlaybackSource,
  ProviderCapabilities,
  SoundtrackAlbum,
  SoundtrackAlbumWithTracks,
  SoundtrackMatch,
  SoundtrackTrack,
} from '../../types'

interface AudiusTrackItem {
  id: string
  title: string
  duration: number
  artwork?: {
    '150x150'?: string
    '480x480'?: string
    '1000x1000'?: string
  }
  user?: {
    name: string
  }
}

export class AudiusProvider extends BaseSoundtrackProvider {
  public id = 'audius'
  public name = 'Audius Open Audio'
  public priority = 38

  public capabilities: ProviderCapabilities = {
    metadata: false,
    artwork: true,
    streaming: true,
    downloading: false,
    externalPlayback: false,
  }

  private streamCache: Map<string, string> = new Map()

  public async searchGame(_game: GameIdentity): Promise<SoundtrackMatch[]> {
    return []
  }

  public async getAlbums(_game: GameIdentity): Promise<SoundtrackAlbum[]> {
    return []
  }

  public async getAlbum(
    _albumId: string,
    _externalId?: string,
  ): Promise<SoundtrackAlbumWithTracks | null> {
    return null
  }

  public override async getPlaybackSource(
    track: SoundtrackTrack,
    game?: GameIdentity,
  ): Promise<PlaybackSource | null> {
    const cacheKey = `${game?.title || ''}_${track.title}`
    if (this.streamCache.has(cacheKey)) {
      return {
        type: 'stream',
        url: this.streamCache.get(cacheKey)!,
        format: 'mp3',
        bitrate: 320,
        providerId: this.id,
      }
    }

    const cleanGame = this.cleanTitle(game?.title || track.artist || '')
    const cleanTrack = this.cleanTitle(track.title)
    if (!cleanTrack) return null

    const query = encodeURIComponent(`${cleanGame} ${cleanTrack}`.trim())
    const url = `https://discoveryprovider.audius.co/v1/tracks/search?query=${query}&app_name=nexus_launcher`

    try {
      const res = await this.fetchWithTimeout(url, {}, 4500)
      if (!res.ok) return null

      const json = (await res.json()) as { data?: AudiusTrackItem[] }
      const items = json.data || []
      if (items.length === 0) return null

      // Match item whose title contains clean words of track
      const trackWords = cleanTrack.toLowerCase().split(/\s+/).filter(Boolean)
      const matched =
        items.find((item) => {
          const lower = item.title.toLowerCase()
          return trackWords.some((w) => lower.includes(w))
        }) || items[0]

      if (matched && matched.id) {
        const streamUrl = `https://discoveryprovider.audius.co/v1/tracks/${matched.id}/stream?app_name=nexus_launcher`
        this.streamCache.set(cacheKey, streamUrl)
        return {
          type: 'stream',
          url: streamUrl,
          format: 'mp3',
          bitrate: 320,
          providerId: this.id,
        }
      }
    } catch {
      // Ignore network timeout
    }

    return null
  }
}
