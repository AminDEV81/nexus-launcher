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

const STREAM_SEARCH_ENDPOINTS = [
  'https://api.piped.private.coffee',
  'https://pipedapi.kavin.rocks',
  'https://piped.video',
]

export class InvidiousAudioProvider extends BaseSoundtrackProvider {
  public id = 'invidious'
  public name = 'Audio Streamer'
  public priority = 70

  public capabilities: ProviderCapabilities = {
    metadata: false,
    artwork: false,
    streaming: true,
    downloading: false,
    externalPlayback: false,
  }

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
    const gameName = game?.title?.replace(/[:™®]/g, '').trim() || ''
    const trackName = track.title.replace(/[:™®]/g, '').trim()
    const query = encodeURIComponent(`${gameName} ${trackName} ost soundtrack`.trim())

    for (const instance of STREAM_SEARCH_ENDPOINTS) {
      try {
        const isPiped = instance.includes('piped')
        const searchUrl = isPiped
          ? `${instance}/search?q=${query}&filter=music_songs`
          : `${instance}/api/v1/search?q=${query}&type=video`

        const searchText = await this.fetchHtml(searchUrl, undefined, 4000)
        if (!searchText) continue

        const json = JSON.parse(searchText)
        const items = isPiped ? json.items : json
        if (!items || items.length === 0) continue

        const first = items[0]
        const videoId = isPiped
          ? first.url?.split('watch?v=')[1] || first.id
          : first.videoId || first.id

        if (!videoId) continue

        // Check if direct audio stream is available via streams API
        if (isPiped) {
          try {
            const streamUrl = `${instance}/streams/${videoId}`
            const streamText = await this.fetchHtml(streamUrl, undefined, 3500)
            if (streamText) {
              const streamData = JSON.parse(streamText)
              const audioStream = streamData.audioStreams?.[0]
              if (audioStream?.url) {
                return {
                  type: 'stream',
                  url: audioStream.url,
                  providerId: this.id,
                  bitrate: audioStream.bitrate,
                }
              }
            }
          } catch {
            // Direct stream lookup failed, fallback to native embedded player
          }
        }

        // Return YouTube audio playback source
        return {
          type: 'youtube',
          url: videoId,
          providerId: 'youtube',
        }
      } catch {
        // Try next endpoint
        continue
      }
    }

    return null
  }
}
