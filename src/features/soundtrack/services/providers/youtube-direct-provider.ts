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
import { soundtrackSearchYouTube } from '../tauri-soundtrack'

export class YouTubeDirectProvider extends BaseSoundtrackProvider {
  public id = 'youtube_direct'
  public name = 'YouTube Direct Resolver'
  public priority = 50

  public capabilities: ProviderCapabilities = {
    metadata: false,
    artwork: false,
    streaming: true,
    downloading: false,
    externalPlayback: false,
  }

  private videoIdCache: Map<string, string> = new Map()

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
    if (this.videoIdCache.has(cacheKey)) {
      return {
        type: 'youtube',
        url: this.videoIdCache.get(cacheKey)!,
        providerId: this.id,
      }
    }

    const cleanGame = this.cleanTitle(game?.title || track.artist || '')
    const cleanTrack = this.cleanTitle(track.title)
    const query = `${cleanGame} ${cleanTrack} OST`.trim()

    try {
      const results = await soundtrackSearchYouTube(query, 3)
      if (results && results.length > 0) {
        const best = results[0]
        this.videoIdCache.set(cacheKey, best.video_id)
        return {
          type: 'youtube',
          url: best.video_id,
          providerId: this.id,
        }
      }
    } catch {
      // Ignore invoke failure
    }

    return null
  }
}
