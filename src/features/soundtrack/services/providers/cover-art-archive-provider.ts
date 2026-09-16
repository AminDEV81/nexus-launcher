import { BaseSoundtrackProvider } from './base-provider'
import type {
  GameIdentity,
  ProviderCapabilities,
  SoundtrackAlbum,
  SoundtrackAlbumWithTracks,
  SoundtrackMatch,
} from '../../types'

export class CoverArtArchiveProvider extends BaseSoundtrackProvider {
  public id = 'coverartarchive'
  public name = 'Cover Art Archive'
  public priority = 35

  public capabilities: ProviderCapabilities = {
    metadata: false,
    artwork: true,
    streaming: false,
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

  /**
   * Resolves front cover art for a MusicBrainz release or release group
   */
  public async getArtwork(album: SoundtrackAlbum): Promise<string | null> {
    // If the album already has a valid non-empty cover_url, return it
    if (album.cover_url && album.cover_url.startsWith('http')) {
      return album.cover_url
    }

    // MusicBrainz release identifier
    let mbid = album.provider_id === 'musicbrainz' ? album.external_id : null
    if (!mbid && album.title) {
      try {
        const clean = this.cleanTitle(album.title)
        const query = encodeURIComponent(`${clean} soundtrack`)
        const url = `https://musicbrainz.org/ws/2/release?query=${query}&limit=1&fmt=json`
        const text = await this.fetchHtml(
          url,
          {
            'User-Agent': 'NexusLauncher/1.0 ( contact@nexuslauncher.app )',
            Accept: 'application/json',
          },
          5000,
        )
        const data = JSON.parse(text) as { releases?: { id: string }[] }
        if (data.releases && data.releases.length > 0) {
          mbid = data.releases[0].id
        }
      } catch {
        // Ignore search error
      }
    }

    if (!mbid) return null

    const candidateUrl = `https://coverartarchive.org/release/${mbid}/front-500`

    try {
      // Check head or fetch text to verify cover exists
      const res = await this.fetchWithTimeout(candidateUrl, { method: 'HEAD' }, 4000)
      if (res.ok || res.status === 307 || res.status === 302) {
        return candidateUrl
      }
    } catch {
      // Direct return if head fails but mbid was valid
      return candidateUrl
    }

    return null
  }
}
