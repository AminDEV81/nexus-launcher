import { BaseSoundtrackProvider } from './base-provider'
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

interface ArchiveDoc {
  identifier: string
  title: string
  creator?: string
  year?: number | string
  description?: string
}

interface ArchiveFile {
  name: string
  title?: string
  creator?: string
  length?: string | number
  size?: string | number
  format?: string
  track?: string | number
}

const AUDIO_EXTS = ['.mp3', '.flac', '.ogg', '.wav', '.m4a']

export class ArchiveOrgProvider extends BaseSoundtrackProvider {
  public id = 'archive'
  public name = 'Internet Archive'
  public priority = 40

  public capabilities: ProviderCapabilities = {
    metadata: true,
    artwork: true,
    streaming: true,
    downloading: true,
    externalPlayback: false,
  }

  public async searchGame(game: GameIdentity): Promise<SoundtrackMatch[]> {
    const albums = await this.getAlbums(game)
    return albums.map((album) => ({
      album,
      confidence: 0.85,
    }))
  }

  public async getAlbums(game: GameIdentity): Promise<SoundtrackAlbum[]> {
    const query = encodeURIComponent(
      `("${this.cleanTitle(game.title)}" AND (soundtrack OR ost OR "original score")) AND mediatype:audio AND NOT title:(podcast OR interview OR audiocast OR radio)`,
    )
    const url = `https://archive.org/advancedsearch.php?q=${query}&fl[]=identifier,title,creator,year&rows=6&output=json`

    try {
      const resp = await this.fetchWithTimeout(url, {}, 6000)
      if (!resp.ok) return []

      const data = (await resp.json()) as { response?: { docs?: ArchiveDoc[] } }
      const docs = data.response?.docs || []

      return docs.map((doc) => {
        const coverUrl = `https://archive.org/services/img/${doc.identifier}`
        return {
          id: `ia_${doc.identifier}`,
          game_id: game.gameId,
          title: doc.title,
          album_type: doc.title.toLowerCase().includes('score')
            ? 'original_score'
            : 'original_soundtrack',
          artist: doc.creator || null,
          release_date: doc.year ? String(doc.year) : null,
          cover_url: coverUrl,
          track_count: 0,
          total_duration_ms: 0,
          provider_id: this.id,
          external_id: doc.identifier,
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
    const identifier = externalId || albumId.replace(/^ia_/, '')
    const url = `https://archive.org/metadata/${identifier}`

    try {
      const resp = await this.fetchWithTimeout(url, {}, 8000)
      if (!resp.ok) return null

      const data = (await resp.json()) as {
        metadata?: { title?: string; creator?: string; year?: string }
        files?: ArchiveFile[]
      }

      if (!data.files || data.files.length === 0) return null

      const audioFiles = data.files.filter((f) => {
        const lower = f.name.toLowerCase()
        return AUDIO_EXTS.some((ext) => lower.endsWith(ext))
      })

      if (audioFiles.length === 0) return null

      const coverUrl = `https://archive.org/services/img/${identifier}`
      const albumTitle = data.metadata?.title || identifier
      const artist = data.metadata?.creator || null

      let totalDurationMs = 0
      const tracks: SoundtrackTrack[] = audioFiles.map((file, idx) => {
        const durationSec =
          typeof file.length === 'string' ? parseFloat(file.length) : file.length || 0
        const durationMs = Math.round(durationSec * 1000)
        totalDurationMs += durationMs

        let trackTitle = file.title || file.name
        // Clean extension from name if title wasn't set
        if (!file.title) {
          trackTitle = trackTitle.replace(/\.[^/.]+$/, '')
        }

        const encodedFile = file.name.split('/').map(encodeURIComponent).join('/')
        const streamUrl = `https://archive.org/download/${identifier}/${encodedFile}`

        const trackNumber = file.track ? parseInt(String(file.track), 10) || idx + 1 : idx + 1

        return {
          id: `ia_trk_${identifier}_${idx}`,
          album_id: albumId,
          disc_number: 1,
          track_number: trackNumber,
          title: trackTitle,
          artist: file.creator || artist,
          duration_ms: durationMs,
          preview_url: streamUrl,
          stream_url: streamUrl,
          download_url: streamUrl,
          local_path: null,
          provider_id: this.id,
          external_id: `${identifier}/${file.name}`,
        }
      })

      const album: SoundtrackAlbum = {
        id: albumId,
        game_id: null,
        title: albumTitle,
        album_type: albumTitle.toLowerCase().includes('score')
          ? 'original_score'
          : 'original_soundtrack',
        artist,
        release_date: data.metadata?.year || null,
        cover_url: coverUrl,
        track_count: tracks.length,
        total_duration_ms: totalDurationMs,
        provider_id: this.id,
        external_id: identifier,
      }

      return { album, tracks }
    } catch {
      return null
    }
  }

  public override async getPlaybackSource(
    track: SoundtrackTrack,
    game?: GameIdentity,
  ): Promise<PlaybackSource | null> {
    if (track.stream_url) {
      return {
        type: 'stream',
        url: track.stream_url,
        providerId: this.id,
      }
    }

    // Try track-level search on Archive.org
    if (game?.title || track.artist) {
      try {
        const cleanGame = this.cleanTitle(game?.title || track.artist || '')
        const cleanTrack = this.cleanTitle(track.title)
        const q = encodeURIComponent(
          `("${cleanGame}" AND "${cleanTrack}") AND mediatype:audio AND NOT title:(podcast OR interview OR radio)`,
        )
        const url = `https://archive.org/advancedsearch.php?q=${q}&fl[]=identifier,title&rows=3&output=json`
        const resp = await this.fetchWithTimeout(url, {}, 4000)
        if (resp.ok) {
          const data = (await resp.json()) as { response?: { docs?: ArchiveDoc[] } }
          for (const doc of data.response?.docs || []) {
            const metaResp = await this.fetchWithTimeout(
              `https://archive.org/metadata/${doc.identifier}`,
              {},
              4000,
            )
            if (!metaResp.ok) continue
            const meta = (await metaResp.json()) as { files?: ArchiveFile[] }
            const match = meta.files?.find((f) => {
              const lowerName = f.name.toLowerCase()
              const lowerTitle = (f.title || '').toLowerCase()
              const isAudio = AUDIO_EXTS.some((ext) => lowerName.endsWith(ext))
              if (!isAudio) return false

              const strippedName = lowerName.replace(/[^\w]/g, '')
              const strippedTitle = lowerTitle.replace(/[^\w]/g, '')
              const target = cleanTrack.toLowerCase().replace(/[^\w]/g, '')
              return (
                (strippedTitle &&
                  (strippedTitle.includes(target) || target.includes(strippedTitle))) ||
                strippedName.includes(target) ||
                target.includes(strippedName)
              )
            })
            if (match) {
              const encoded = match.name.split('/').map(encodeURIComponent).join('/')
              const streamUrl = `https://archive.org/download/${doc.identifier}/${encoded}`
              track.stream_url = streamUrl
              return {
                type: 'stream',
                url: streamUrl,
                providerId: this.id,
              }
            }
          }
        }
      } catch {
        // Fallthrough to next provider
      }
    }

    return null
  }

  public override async getDownloadSource(track: SoundtrackTrack): Promise<DownloadSource | null> {
    const downloadUrl = track.download_url || track.stream_url
    if (downloadUrl) {
      const ext = downloadUrl.split('.').pop()?.split('?')[0] || 'mp3'
      return {
        url: downloadUrl,
        format: ext,
        filename: `${track.title}.${ext}`,
        providerId: this.id,
      }
    }
    return null
  }
}
