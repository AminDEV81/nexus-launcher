import { BaseSoundtrackProvider } from './base-provider'
import type {
  GameIdentity,
  ProviderCapabilities,
  SoundtrackAlbum,
  SoundtrackAlbumWithTracks,
  SoundtrackMatch,
  SoundtrackTrack,
  SoundtrackType,
} from '../../types'

interface MBRelease {
  id: string
  title: string
  date?: string
  'track-count'?: number
  'artist-credit'?: { name: string }[]
}

interface MBMedia {
  position: number
  tracks: {
    id: string
    title: string
    length?: number
    position: number
    'artist-credit'?: { name: string }[]
  }[]
}

export class MusicBrainzProvider extends BaseSoundtrackProvider {
  public id = 'musicbrainz'
  public name = 'MusicBrainz'
  public priority = 30

  public capabilities: ProviderCapabilities = {
    metadata: true,
    artwork: true,
    streaming: false,
    downloading: false,
    externalPlayback: false,
  }

  private headers = {
    'User-Agent': 'NexusLauncher/1.0 ( contact@nexuslauncher.app )',
    Accept: 'application/json',
  }

  public async searchGame(game: GameIdentity): Promise<SoundtrackMatch[]> {
    const albums = await this.getAlbums(game)
    return albums.map((album) => ({
      album,
      confidence: 0.9,
    }))
  }

  public async getAlbums(game: GameIdentity): Promise<SoundtrackAlbum[]> {
    const query = encodeURIComponent(`${this.cleanTitle(game.title)} soundtrack`)
    const url = `https://musicbrainz.org/ws/2/release?query=${query}&limit=6&fmt=json`

    try {
      const resp = await this.fetchWithTimeout(url, { headers: this.headers }, 6000)
      if (!resp.ok) return []

      const data = (await resp.json()) as { releases?: MBRelease[] }
      if (!data.releases || data.releases.length === 0) return []

      return data.releases.map((rel) => {
        const artist = rel['artist-credit']?.map((a) => a.name).join(', ') || null
        const coverUrl = `https://coverartarchive.org/release/${rel.id}/front-500`

        let albumType: SoundtrackType = 'original_soundtrack'
        const lowerTitle = rel.title.toLowerCase()
        if (lowerTitle.includes('score')) albumType = 'original_score'
        else if (lowerTitle.includes('radio')) albumType = 'radio'
        else if (lowerTitle.includes('remix')) albumType = 'remix'

        return {
          id: `mb_${rel.id}`,
          game_id: game.gameId,
          title: rel.title,
          album_type: albumType,
          artist,
          release_date: rel.date || null,
          cover_url: coverUrl,
          track_count: rel['track-count'] || 0,
          total_duration_ms: 0,
          provider_id: this.id,
          external_id: rel.id,
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
    const releaseId = externalId || albumId.replace(/^mb_/, '')
    const url = `https://musicbrainz.org/ws/2/release/${releaseId}?inc=recordings+artists&fmt=json`

    try {
      const resp = await this.fetchWithTimeout(url, { headers: this.headers }, 8000)
      if (!resp.ok) return null

      const data = (await resp.json()) as {
        id: string
        title: string
        date?: string
        media?: MBMedia[]
        'artist-credit'?: { name: string }[]
      }

      const artist = data['artist-credit']?.map((a) => a.name).join(', ') || null
      const coverUrl = `https://coverartarchive.org/release/${data.id}/front-500`

      const tracks: SoundtrackTrack[] = []
      let totalDurationMs = 0

      if (data.media) {
        for (const media of data.media) {
          const discNumber = media.position || 1
          for (const t of media.tracks || []) {
            const trackDuration = t.length || 0
            totalDurationMs += trackDuration
            const trackArtist = t['artist-credit']?.map((a) => a.name).join(', ') || artist

            tracks.push({
              id: `mb_trk_${t.id}`,
              album_id: albumId,
              disc_number: discNumber,
              track_number: t.position,
              title: t.title,
              artist: trackArtist,
              duration_ms: trackDuration,
              preview_url: null,
              stream_url: null,
              download_url: null,
              local_path: null,
              provider_id: this.id,
              external_id: t.id,
            })
          }
        }
      }

      const album: SoundtrackAlbum = {
        id: albumId,
        game_id: null,
        title: data.title,
        album_type: data.title.toLowerCase().includes('score')
          ? 'original_score'
          : 'original_soundtrack',
        artist,
        release_date: data.date || null,
        cover_url: coverUrl,
        track_count: tracks.length,
        total_duration_ms: totalDurationMs,
        provider_id: this.id,
        external_id: data.id,
      }

      return { album, tracks }
    } catch {
      return null
    }
  }
}
