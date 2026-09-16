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
import { getSoundtrackLocalFiles } from '../tauri-soundtrack'

export class LocalSoundtrackProvider extends BaseSoundtrackProvider {
  public id = 'local'
  public name = 'Local Library'
  public priority = 5 // Highest priority for local files!

  public capabilities: ProviderCapabilities = {
    metadata: true,
    artwork: false,
    streaming: true,
    downloading: false,
    externalPlayback: false,
  }

  public async searchGame(game: GameIdentity): Promise<SoundtrackMatch[]> {
    const albums = await this.getAlbums(game)
    return albums.map((album) => ({
      album,
      confidence: 1.0,
    }))
  }

  public async getAlbums(game: GameIdentity): Promise<SoundtrackAlbum[]> {
    try {
      const localFiles = await getSoundtrackLocalFiles()
      const matching = localFiles.filter((f) => f.game_id === game.gameId)
      if (matching.length === 0) return []

      // Group by album name
      const albumMap = new Map<string, typeof matching>()
      for (const f of matching) {
        const albumName = f.album || 'Local Soundtrack'
        const existing = albumMap.get(albumName) || []
        existing.push(f)
        albumMap.set(albumName, existing)
      }

      const albums: SoundtrackAlbum[] = []
      for (const [albumName, files] of albumMap.entries()) {
        const albumId = `local_${game.gameId}_${encodeURIComponent(albumName)}`
        albums.push({
          id: albumId,
          game_id: game.gameId,
          title: albumName,
          album_type: 'original_soundtrack',
          artist: files[0]?.artist || null,
          release_date: null,
          cover_url: null,
          track_count: files.length,
          total_duration_ms: files.reduce((acc, f) => acc + (f.duration_ms || 0), 0),
          provider_id: this.id,
          external_id: albumName,
        })
      }

      return albums
    } catch {
      return []
    }
  }

  public async getAlbum(
    albumId: string,
    _externalId?: string,
  ): Promise<SoundtrackAlbumWithTracks | null> {
    try {
      const localFiles = await getSoundtrackLocalFiles()
      const parts = albumId.split('_')
      const gameId = parts[1]
      const albumName = decodeURIComponent(parts.slice(2).join('_'))

      const matching = localFiles.filter(
        (f) =>
          f.game_id === gameId &&
          (f.album === albumName || (!f.album && albumName === 'Local Soundtrack')),
      )

      if (matching.length === 0) return null

      const tracks: SoundtrackTrack[] = matching.map((f, idx) => ({
        id: `local_trk_${f.id}`,
        album_id: albumId,
        disc_number: 1,
        track_number: idx + 1,
        title: f.title || `Track ${idx + 1}`,
        artist: f.artist || null,
        duration_ms: f.duration_ms || 0,
        preview_url: null,
        stream_url: null,
        download_url: null,
        local_path: f.file_path,
        provider_id: this.id,
        external_id: f.id,
      }))

      const album: SoundtrackAlbum = {
        id: albumId,
        game_id: gameId,
        title: albumName,
        album_type: 'original_soundtrack',
        artist: matching[0]?.artist || null,
        release_date: null,
        cover_url: null,
        track_count: tracks.length,
        total_duration_ms: tracks.reduce((acc, t) => acc + t.duration_ms, 0),
        provider_id: this.id,
        external_id: albumName,
      }

      return { album, tracks }
    } catch {
      return null
    }
  }

  public override async getPlaybackSource(track: SoundtrackTrack): Promise<PlaybackSource | null> {
    if (track.local_path) {
      return {
        type: 'local',
        url: track.local_path,
        providerId: this.id,
      }
    }
    return null
  }

  public override async getDownloadSource(_track: SoundtrackTrack): Promise<DownloadSource | null> {
    // Already local
    return null
  }
}
