import { BaseSoundtrackProvider } from './base-provider'
import type {
  GameIdentity,
  ProviderCapabilities,
  SoundtrackAlbum,
  SoundtrackAlbumWithTracks,
  SoundtrackMatch,
} from '../../types'
import { getHubGameDetails, searchHubGames } from '@/services/hub'

export class IGDBSoundtrackProvider extends BaseSoundtrackProvider {
  public id = 'igdb'
  public name = 'IGDB'
  public priority = 60

  public capabilities: ProviderCapabilities = {
    metadata: true,
    artwork: true,
    streaming: false,
    downloading: false,
    externalPlayback: false,
  }

  public async searchGame(game: GameIdentity): Promise<SoundtrackMatch[]> {
    const albums = await this.getAlbums(game)
    return albums.map((album) => ({
      album,
      confidence: 0.8,
    }))
  }

  public async getAlbums(game: GameIdentity): Promise<SoundtrackAlbum[]> {
    try {
      let coverUrl = game.coverUrl || null
      let releaseDate: string | null = null

      if (game.igdbId) {
        const details = await getHubGameDetails(Number(game.igdbId))
        if (details) {
          coverUrl =
            details.backdrop_url ||
            (details.cover_url ? details.cover_url.replace('/t_cover_big/', '/t_1080p/') : null)
        }
      } else {
        const results = await searchHubGames(game.title, 0)
        if (results && results.length > 0) {
          const match = results[0]
          coverUrl =
            match.backdrop_url ||
            (match.cover_url ? match.cover_url.replace('/t_cover_big/', '/t_1080p/') : null)
        }
      }

      if (!coverUrl && !game.title) return []

      const album: SoundtrackAlbum = {
        id: `igdb_${game.gameId}`,
        game_id: game.gameId,
        title: `${game.title} (Official Game Score)`,
        album_type: 'original_score',
        artist: 'Original Game Soundtrack',
        release_date: releaseDate,
        cover_url: coverUrl,
        track_count: 0,
        total_duration_ms: 0,
        provider_id: this.id,
        external_id: game.igdbId ? String(game.igdbId) : null,
      }

      return [album]
    } catch {
      return []
    }
  }

  public async getAlbum(
    albumId: string,
    _externalId?: string,
  ): Promise<SoundtrackAlbumWithTracks | null> {
    return {
      album: {
        id: albumId,
        game_id: null,
        title: 'Original Game Soundtrack',
        album_type: 'original_soundtrack',
        artist: 'Various Artists',
        release_date: null,
        cover_url: null,
        track_count: 0,
        total_duration_ms: 0,
        provider_id: this.id,
        external_id: null,
      },
      tracks: [],
    }
  }

  public async getArtwork(album: SoundtrackAlbum): Promise<string | null> {
    if (album.cover_url) {
      // Upscale IGDB thumbnail to 1080p if applicable
      return album.cover_url
        .replace('/t_cover_big/', '/t_1080p/')
        .replace('/t_thumb/', '/t_1080p/')
        .replace('/t_screenshot_med/', '/t_1080p/')
    }
    return null
  }
}
