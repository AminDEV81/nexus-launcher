import { BaseSoundtrackProvider } from './base-provider'
import type {
  GameIdentity,
  ProviderCapabilities,
  SoundtrackAlbum,
  SoundtrackAlbumWithTracks,
  SoundtrackMatch,
  SoundtrackTrack,
} from '../../types'

interface SteamStoreSearchItem {
  id: number
  name: string
  price?: { initial: number; final: number; currency: string }
}

interface SteamAppDetailsData {
  type: string
  name: string
  steam_appid: number
  header_image?: string
  capsule_image?: string
  release_date?: { date: string }
  developers?: string[]
  publishers?: string[]
}

export class SteamSoundtrackProvider extends BaseSoundtrackProvider {
  public id = 'steam'
  public name = 'Steam Store'
  public priority = 50

  public capabilities: ProviderCapabilities = {
    metadata: true,
    artwork: true,
    streaming: false,
    downloading: false,
    externalPlayback: true,
  }

  public async searchGame(game: GameIdentity): Promise<SoundtrackMatch[]> {
    const albums = await this.getAlbums(game)
    return albums.map((album) => ({
      album,
      confidence: 0.95,
    }))
  }

  public async getAlbums(game: GameIdentity): Promise<SoundtrackAlbum[]> {
    const query = encodeURIComponent(`${this.cleanTitle(game.title)} soundtrack`)
    const url = `https://store.steampowered.com/api/storesearch/?term=${query}&l=english&cc=US`

    try {
      const text = await this.fetchHtml(url, {}, 6000)
      const data = JSON.parse(text) as { items?: SteamStoreSearchItem[] }
      if (!data.items || data.items.length === 0) return []

      const soundtrackItems = data.items.filter((item) => {
        const lower = item.name.toLowerCase()
        return (
          lower.includes('soundtrack') ||
          lower.includes('ost') ||
          lower.includes('score') ||
          lower.includes('music')
        )
      })

      const targetItems = soundtrackItems.length > 0 ? soundtrackItems : data.items.slice(0, 3)

      const albums: SoundtrackAlbum[] = []
      for (const item of targetItems.slice(0, 4)) {
        const coverUrl = `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${item.id}/header.jpg`
        albums.push({
          id: `steam_${item.id}`,
          game_id: game.gameId,
          title: item.name,
          album_type: item.name.toLowerCase().includes('score')
            ? 'original_score'
            : 'original_soundtrack',
          artist: null,
          release_date: null,
          cover_url: coverUrl,
          track_count: 0,
          total_duration_ms: 0,
          provider_id: this.id,
          external_id: String(item.id),
        })
      }

      return albums
    } catch {
      return []
    }
  }

  public async getAlbum(
    albumId: string,
    externalId?: string,
  ): Promise<SoundtrackAlbumWithTracks | null> {
    const appId = externalId || albumId.replace(/^steam_/, '')
    const url = `https://store.steampowered.com/api/appdetails?appids=${appId}`

    try {
      const text = await this.fetchHtml(url, {}, 6000)
      const json = JSON.parse(text) as Record<
        string,
        { success: boolean; data?: SteamAppDetailsData }
      >
      const appData = json[appId]?.data
      if (!appData) return null

      const coverUrl =
        appData.header_image ||
        `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`
      const artist = appData.developers?.join(', ') || appData.publishers?.join(', ') || null

      const album: SoundtrackAlbum = {
        id: albumId,
        game_id: null,
        title: appData.name,
        album_type: appData.name.toLowerCase().includes('score')
          ? 'original_score'
          : 'original_soundtrack',
        artist,
        release_date: appData.release_date?.date || null,
        cover_url: coverUrl,
        track_count: 0,
        total_duration_ms: 0,
        provider_id: this.id,
        external_id: appId,
      }

      const tracks: SoundtrackTrack[] = []
      return { album, tracks }
    } catch {
      return null
    }
  }

  public async getArtwork(album: SoundtrackAlbum): Promise<string | null> {
    if (album.cover_url && album.cover_url.startsWith('http')) return album.cover_url
    const searchTitle = this.cleanTitle(album.title)
    if (!searchTitle) return null
    try {
      const albums = await this.getAlbums({ gameId: album.game_id || '', title: searchTitle })
      if (albums.length > 0 && albums[0].cover_url) {
        return albums[0].cover_url
      }
    } catch {
      // Ignore steam search error
    }
    return null
  }
}
