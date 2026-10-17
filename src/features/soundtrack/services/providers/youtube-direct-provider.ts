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

  private candidateCache: Map<string, PlaybackSource[]> = new Map()

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

  public async getCandidateSources(
    track: SoundtrackTrack,
    game?: GameIdentity,
  ): Promise<PlaybackSource[]> {
    const cacheKey = `${game?.title || ''}_${track.id}_${track.title}`
    if (this.candidateCache.has(cacheKey)) {
      return this.candidateCache.get(cacheKey)!
    }

    const out: PlaybackSource[] = []

    // If track already has a known YouTube video_id, ask Rust backend to extract its direct full-length audio stream first!
    if (
      (track.provider_id === 'youtube' || track.provider_id === 'youtube_direct') &&
      track.external_id &&
      /^[A-Za-z0-9_-]{11}$/.test(track.external_id)
    ) {
      try {
        const directRes = await soundtrackSearchYouTube(track.external_id, 1)
        if (directRes && directRes.length > 0 && directRes[0].direct_audio_url) {
          out.push({
            type: 'stream',
            url: directRes[0].direct_audio_url,
            providerId: this.id,
          })
        }
      } catch {
        // Ignore invoke error
      }
      out.push({
        type: 'youtube',
        url: track.external_id,
        providerId: this.id,
      })
    }

    const cleanGame = this.cleanTitle(game?.title || track.artist || '')
    const cleanTrack = this.cleanTitle(track.title)
    const query = `${cleanGame} ${cleanTrack} OST`.trim()

    try {
      const results = await soundtrackSearchYouTube(query, 6)
      if (results && results.length > 0) {
        const nonGameplay = results.filter(
          (r) =>
            !/\b(?:gameplay|walkthrough|review|reaction|trailer|teaser|short)\b/i.test(r.title) &&
            (r.duration_seconds === undefined ||
              r.duration_seconds === null ||
              r.duration_seconds === 0 ||
              r.duration_seconds >= 38),
        )
        const embedFriendly = [...nonGameplay].sort((a, b) => {
          const aTopic = /- Topic$/i.test(a.channel || '') ? 1 : 0
          const bTopic = /- Topic$/i.test(b.channel || '') ? 1 : 0
          return aTopic - bTopic
        })

        const pool = embedFriendly.length > 0 ? embedFriendly : results

        // 1. Push any direct full-length audio stream URLs extracted by Rust InnerTube/Piped first!
        for (const r of pool) {
          if (r.direct_audio_url && !out.some((o) => o.url === r.direct_audio_url)) {
            out.unshift({
              type: 'stream',
              url: r.direct_audio_url,
              providerId: this.id,
            })
          }
        }

        // 2. Push YouTube video IDs as secondary full-length candidates
        for (const r of pool.slice(0, 3)) {
          if (r.video_id && !out.some((o) => o.url === r.video_id)) {
            out.push({
              type: 'youtube',
              url: r.video_id,
              providerId: this.id,
            })
          }
        }
      }
    } catch {
      // Ignore invoke failure
    }

    if (out.length > 0) {
      this.candidateCache.set(cacheKey, out)
    }

    return out
  }

  public override async getPlaybackSource(
    track: SoundtrackTrack,
    game?: GameIdentity,
  ): Promise<PlaybackSource | null> {
    const list = await this.getCandidateSources(track, game)
    return list[0] || null
  }
}
