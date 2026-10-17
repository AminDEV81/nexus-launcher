import { BaseSoundtrackProvider, scoreAlbumMatchForGame } from './base-provider'
import type {
  DownloadSource,
  GameIdentity,
  PlaybackSource,
  ProviderCapabilities,
  SoundtrackAlbum,
  SoundtrackAlbumWithTracks,
  SoundtrackMatch,
  SoundtrackTrack,
} from '../../types'

interface ItunesSongItem {
  trackId?: number
  collectionId?: number
  trackName?: string
  collectionName?: string
  artistName?: string
  previewUrl?: string
  artworkUrl100?: string
  trackTimeMillis?: number
  trackNumber?: number
  discNumber?: number
  releaseDate?: string
}

/**
 * Apple Music / iTunes Global CDN Provider:
 * Delivers high-availability, DRM-free 256kbps AAC (.m4a) streams hosted on Apple's global
 * `audio-ssl.itunes.apple.com` CDN with permissive CORS and 1000x1000 album artwork.
 */
export class ItunesAudioProvider extends BaseSoundtrackProvider {
  public id = 'itunes'
  public name = 'Apple Music / iTunes CDN'
  public priority = 25

  public capabilities: ProviderCapabilities = {
    metadata: true,
    artwork: true,
    streaming: true,
    downloading: true,
    externalPlayback: false,
  }

  private streamCache: Map<string, string> = new Map()

  private cleanTrackQuery(title: string): string {
    return title
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/^\d+[\s.\-_]+/, '')
      .replace(/\([^)]*\)/g, ' ')
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  public async searchGame(game: GameIdentity): Promise<SoundtrackMatch[]> {
    const albums = await this.getAlbums(game)
    return albums.map((album) => ({ album, confidence: 0.9 }))
  }

  public async getAlbums(game: GameIdentity): Promise<SoundtrackAlbum[]> {
    const cleanGame = this.cleanTitle(game.title)
    if (!cleanGame) return []

    const query = encodeURIComponent(`${cleanGame} Original Soundtrack`)
    const url = `https://itunes.apple.com/search?term=${query}&media=music&entity=album&limit=8`

    try {
      const text = await this.fetchHtml(url, undefined, 6000)
      const data = JSON.parse(text) as {
        results?: Array<{
          collectionId?: number
          collectionName?: string
          artistName?: string
          artworkUrl100?: string
          trackCount?: number
          releaseDate?: string
        }>
      }

      const scored = (data.results || [])
        .filter((item) => item.collectionId && item.collectionName)
        .map((item) => ({
          item,
          score: scoreAlbumMatchForGame(item.collectionName!, game.title),
        }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)

      return scored.map(({ item }) => {
        const cover = item.artworkUrl100
          ? item.artworkUrl100.replace('100x100bb', '1000x1000bb')
          : null
        return {
          id: `itunes_${item.collectionId}`,
          game_id: game.gameId,
          title: item.collectionName!,
          album_type: item.collectionName!.toLowerCase().includes('score')
            ? 'original_score'
            : 'original_soundtrack',
          artist: item.artistName || 'Original Soundtrack',
          release_date: item.releaseDate ? item.releaseDate.split('T')[0] : null,
          cover_url: cover,
          track_count: item.trackCount || 0,
          total_duration_ms: 0,
          provider_id: this.id,
          external_id: String(item.collectionId),
        }
      })
    } catch {
      return []
    }
  }

  public async getAlbum(
    albumId: string,
    externalId?: string,
  ): Promise<SoundtrackAlbumWithTracks | null> {
    const collectionId = externalId || albumId.replace(/^itunes_/, '')
    if (!collectionId || !/^\d+$/.test(collectionId)) return null

    const url = `https://itunes.apple.com/lookup?id=${collectionId}&entity=song&limit=200`
    try {
      const text = await this.fetchHtml(url, undefined, 7000)
      const data = JSON.parse(text) as {
        results?: Array<
          ItunesSongItem & {
            wrapperType?: string
          }
        >
      }
      const results = data.results || []
      const col = results.find((r) => r.wrapperType === 'collection') || results[0]
      const songs = results.filter((r) => r.wrapperType === 'track' && r.trackName && r.previewUrl)
      if (!col || songs.length === 0) return null

      const cover = col.artworkUrl100 ? col.artworkUrl100.replace('100x100bb', '1000x1000bb') : null

      let totalDurationMs = 0
      const tracks: SoundtrackTrack[] = songs.map((s, idx) => {
        const dur = s.trackTimeMillis || 0
        totalDurationMs += dur
        const streamUrl = s.previewUrl || null
        const trkId = `itunes_trk_${collectionId}_${s.trackId || idx + 1}`
        if (streamUrl) {
          this.streamCache.set(trkId, streamUrl)
        }
        return {
          id: trkId,
          album_id: `itunes_${collectionId}`,
          disc_number: s.discNumber || 1,
          track_number: s.trackNumber || idx + 1,
          title: s.trackName!,
          artist: s.artistName || col.artistName || null,
          duration_ms: dur,
          preview_url: streamUrl,
          stream_url: streamUrl,
          download_url: streamUrl,
          local_path: null,
          provider_id: this.id,
          external_id: s.trackId ? String(s.trackId) : null,
        }
      })

      return {
        album: {
          id: `itunes_${collectionId}`,
          game_id: null,
          title: col.collectionName || 'Official Soundtrack',
          album_type: 'original_soundtrack',
          artist: col.artistName || null,
          release_date: col.releaseDate ? col.releaseDate.split('T')[0] : null,
          cover_url: cover,
          track_count: tracks.length,
          total_duration_ms: totalDurationMs,
          provider_id: this.id,
          external_id: String(collectionId),
        },
        tracks,
      }
    } catch {
      return null
    }
  }

  public override async getPlaybackSource(
    track: SoundtrackTrack,
    game?: GameIdentity,
  ): Promise<PlaybackSource | null> {
    if (track.stream_url && track.stream_url.includes('itunes.apple.com')) {
      return {
        type: 'stream',
        url: track.stream_url,
        format: 'm4a',
        bitrate: 256,
        providerId: this.id,
      }
    }

    const cacheKey = `${game?.title || ''}_${track.title}`.toLowerCase()
    if (this.streamCache.has(cacheKey)) {
      return {
        type: 'stream',
        url: this.streamCache.get(cacheKey)!,
        format: 'm4a',
        bitrate: 256,
        providerId: this.id,
      }
    }

    const cleanGame = this.cleanTitle(game?.title || '')
    const cleanTrack = this.cleanTrackQuery(track.title)
    const artistHint = track.artist ? this.cleanTrackQuery(track.artist.split(',')[0]) : ''
    if (!cleanTrack) return null

    const queries = [
      `${cleanGame} ${cleanTrack}`.trim(),
      artistHint ? `${artistHint} ${cleanTrack}`.trim() : '',
    ].filter(Boolean)

    for (const q of queries) {
      try {
        const url = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=music&entity=song&limit=10`
        const text = await this.fetchHtml(url, undefined, 5500)
        const data = JSON.parse(text) as { results?: ItunesSongItem[] }
        const items = (data.results || []).filter((r) => r.previewUrl && r.trackName)
        if (items.length === 0) continue

        const normTarget = cleanTrack.toLowerCase()
        const exactOrClose =
          items.find((r) => {
            const nt = this.cleanTrackQuery(r.trackName || '').toLowerCase()
            return nt === normTarget || nt.includes(normTarget) || normTarget.includes(nt)
          }) || items[0]

        if (exactOrClose?.previewUrl) {
          this.streamCache.set(cacheKey, exactOrClose.previewUrl)
          return {
            type: 'stream',
            url: exactOrClose.previewUrl,
            format: 'm4a',
            bitrate: 256,
            providerId: this.id,
          }
        }
      } catch {
        continue
      }
    }

    return null
  }

  public override async getDownloadSource(track: SoundtrackTrack): Promise<DownloadSource | null> {
    const pb = await this.getPlaybackSource(track)
    if (!pb || !pb.url) return null
    return {
      url: pb.url,
      format: 'm4a',
      filename: `${track.title}.m4a`,
      providerId: this.id,
    }
  }
}

interface AudiusTrackItem {
  id: string
  title: string
  duration: number
  user?: {
    name: string
  }
}

export class AudiusProvider extends BaseSoundtrackProvider {
  public id = 'audius'
  public name = 'Audius Open Audio'
  public priority = 65

  public capabilities: ProviderCapabilities = {
    metadata: false,
    artwork: false,
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
    const url = `https://api.audius.co/v1/tracks/search?query=${query}&app_name=nexus_launcher`

    try {
      const text = await this.fetchHtml(url, undefined, 4500)
      const json = JSON.parse(text) as { data?: AudiusTrackItem[] }
      const items = json.data || []
      if (items.length === 0) return null

      const stop = new Set(['the', 'of', 'and', 'a', 'in', 'to', 'for', 'on'])
      const trackWords = cleanTrack
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 1 && !stop.has(w))
      const gameWords = cleanGame
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 1 && !stop.has(w))

      const matched = items.find((item) => {
        const lower = item.title.toLowerCase()
        if (trackWords.length === 0 || gameWords.length === 0) return false
        const allTrackWordsMatch = trackWords.every((w) => lower.includes(w))
        const someGameWordsMatch = gameWords.some((gw) => lower.includes(gw))
        return allTrackWordsMatch && someGameWordsMatch
      })

      if (matched && matched.id) {
        const streamUrl = `https://api.audius.co/v1/tracks/${matched.id}/stream?app_name=nexus_launcher`
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
