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

export class KHInsiderProvider extends BaseSoundtrackProvider {
  public id = 'khinsider'
  public name = 'KHInsider (VGM)'
  public priority = 20

  public capabilities: ProviderCapabilities = {
    metadata: true,
    artwork: true,
    streaming: true,
    downloading: true,
    externalPlayback: false,
  }

  private baseUrl = 'https://downloads.khinsider.com'
  private headers = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  }
  private streamUrlCache: Map<string, string> = new Map()

  public async searchGame(game: GameIdentity): Promise<SoundtrackMatch[]> {
    const albums = await this.getAlbums(game)
    return albums.map((album) => ({
      album,
      confidence: 0.9,
    }))
  }

  public async getAlbums(game: GameIdentity): Promise<SoundtrackAlbum[]> {
    const query = this.cleanTitle(game.title)
    if (!query) return []

    const url = `${this.baseUrl}/search?search=${encodeURIComponent(query)}`

    try {
      const html = await this.fetchHtml(url, this.headers, 8000)
      const albums: SoundtrackAlbum[] = []
      const seenSlugs = new Set<string>()

      // Album links on search page: href="/game-soundtracks/album/<slug>"
      const regex = /href="(\/game-soundtracks\/album\/([^"]+))"[^>]*>([^<]+)<\/a>/g
      let match: RegExpExecArray | null

      while ((match = regex.exec(html)) !== null) {
        const path = match[1]
        const slug = match[2]
        const rawTitle = match[3].trim()

        if (seenSlugs.has(slug) || !rawTitle) continue
        seenSlugs.add(slug)

        const albumId = `kh_${slug}`
        albums.push({
          id: albumId,
          game_id: game.gameId,
          title: rawTitle,
          album_type: rawTitle.toLowerCase().includes('score')
            ? 'original_score'
            : 'original_soundtrack',
          artist: 'Video Game Soundtrack',
          release_date: null,
          cover_url: null,
          track_count: 0,
          total_duration_ms: 0,
          provider_id: this.id,
          external_id: path,
        })

        if (albums.length >= 6) break
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
    const albumPath =
      externalId && externalId.startsWith('/game-soundtracks/album/')
        ? externalId
        : `/game-soundtracks/album/${externalId || albumId.replace(/^kh_/, '')}`

    const url = `${this.baseUrl}${albumPath}`

    try {
      const html = await this.fetchHtml(url, this.headers, 9000)

      // 1. Cover art
      const coverMatch =
        html.match(
          /src="(https?:\/\/[^"]*vgmtreasurechest\.com\/soundtracks\/[^"]*\/thumbs\/[^"]+\.(?:jpg|jpeg|png))"/i,
        ) ||
        html.match(
          /src="(https?:\/\/[^"]*vgmtreasurechest\.com\/soundtracks\/[^"]+\.(?:jpg|jpeg|png))"/i,
        )
      const coverUrl = coverMatch ? coverMatch[1].replace('/thumbs/', '/') : null

      // 2. Tracks from #songlist table
      const tracks: SoundtrackTrack[] = []
      let totalDurationMs = 0

      const songlistStart = html.indexOf('id="songlist"')
      if (songlistStart !== -1) {
        const songlistEnd = html.indexOf('</table>', songlistStart)
        const songlistHtml =
          songlistEnd !== -1
            ? html.substring(songlistStart, songlistEnd)
            : html.substring(songlistStart)

        const trRegex = /<tr[\s\S]*?<\/tr>/gi
        let trMatch: RegExpExecArray | null
        let trackNumber = 1

        while ((trMatch = trRegex.exec(songlistHtml)) !== null) {
          const row = trMatch[0]
          if (row.includes('id="songlist_header"') || row.includes('id="songlist_footer"')) continue

          const linkMatch = row.match(
            /<td[^>]*class="clickable-row"[^>]*><a\s+href="([^"]+)">([^<]+)<\/a><\/td>/i,
          )
          if (!linkMatch) continue

          const songPath = linkMatch[1]
          const title = linkMatch[2].trim()

          // Parse duration string e.g. "4:27"
          const durMatch = row.match(
            /<td[^>]*class="clickable-row"[^>]*align="right"[^>]*><a[^>]*>(\d+:\d+)<\/a><\/td>/i,
          )
          let durationMs = 0
          if (durMatch) {
            const parts = durMatch[1].split(':').map(Number)
            if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
              durationMs = (parts[0] * 60 + parts[1]) * 1000
            }
          }

          totalDurationMs += durationMs

          const trackId = `kh_trk_${albumId}_${trackNumber}`
          tracks.push({
            id: trackId,
            album_id: albumId,
            disc_number: 1,
            track_number: trackNumber++,
            title,
            artist: 'VGM',
            duration_ms: durationMs,
            preview_url: null,
            stream_url: null,
            download_url: null,
            local_path: null,
            provider_id: this.id,
            external_id: songPath,
          })
        }
      }

      // Title from <h2>
      const h2Match = html.match(/<h2>([^<]+)<\/h2>/i)
      const title = h2Match ? h2Match[1].trim() : albumId.replace(/^kh_/, '').replace(/-/g, ' ')

      const album: SoundtrackAlbum = {
        id: albumId,
        game_id: null,
        title,
        album_type: title.toLowerCase().includes('score')
          ? 'original_score'
          : 'original_soundtrack',
        artist: 'Video Game Soundtrack',
        release_date: null,
        cover_url: coverUrl,
        track_count: tracks.length,
        total_duration_ms: totalDurationMs,
        provider_id: this.id,
        external_id: albumPath,
      }

      return { album, tracks }
    } catch {
      return null
    }
  }

  public async getArtwork(album: SoundtrackAlbum): Promise<string | null> {
    if (album.cover_url && album.cover_url.startsWith('http')) return album.cover_url

    if (album.external_id) {
      try {
        const full = await this.getAlbum(album.id, album.external_id)
        if (full?.album.cover_url) return full.album.cover_url
      } catch {
        // Fallthrough to title search
      }
    }

    // Try finding artwork by album title / game title on KHInsider
    const searchTitle = this.cleanTitle(album.title)
    if (searchTitle) {
      try {
        const albums = await this.getAlbums({ gameId: album.game_id || '', title: searchTitle })
        if (albums.length > 0 && albums[0].external_id) {
          const full = await this.getAlbum(albums[0].id, albums[0].external_id)
          if (full?.album.cover_url) return full.album.cover_url
        }
      } catch {
        // Ignore artwork search error
      }
    }

    return null
  }

  public async getPlaybackSource(
    track: SoundtrackTrack,
    _game?: GameIdentity,
  ): Promise<PlaybackSource | null> {
    if (track.stream_url) {
      return {
        type: 'stream',
        url: track.stream_url,
        format: 'mp3',
        providerId: this.id,
      }
    }

    if (this.streamUrlCache.has(track.id)) {
      const cached = this.streamUrlCache.get(track.id)!
      return {
        type: 'stream',
        url: cached,
        format: 'mp3',
        providerId: this.id,
      }
    }

    if (!track.external_id) return null

    const songUrl = track.external_id.startsWith('http')
      ? track.external_id
      : `${this.baseUrl}${track.external_id}`

    try {
      const html = await this.fetchHtml(songUrl, this.headers, 7000)

      const audioMatch = html.match(/<audio[^>]+id="audio"[^>]+src="([^"]+)"/i)
      let streamUrl = audioMatch ? audioMatch[1] : null

      if (!streamUrl) {
        const directMatch = html.match(
          /href="(https?:\/\/[^"'\s]+\.(?:vgmtreasurechest|vgmsite)\.com\/[^"'\s]+\.mp3)"/i,
        )
        if (directMatch) {
          streamUrl = directMatch[1]
        }
      }

      if (!streamUrl) {
        const generalMatch = html.match(/src="([^"]+\.mp3)"/i) || html.match(/href="([^"]+\.mp3)"/i)
        if (generalMatch) {
          streamUrl = generalMatch[1]
        }
      }

      if (streamUrl) {
        track.stream_url = streamUrl
        this.streamUrlCache.set(track.id, streamUrl)
        return {
          type: 'stream',
          url: streamUrl,
          format: 'mp3',
          providerId: this.id,
        }
      }

      return null
    } catch {
      return null
    }
  }

  public async getDownloadSource(track: SoundtrackTrack): Promise<DownloadSource | null> {
    const playback = await this.getPlaybackSource(track)
    if (!playback || !playback.url) return null

    const format = playback.format || 'mp3'
    return {
      url: playback.url,
      format,
      filename: `${track.title}.${format}`,
      providerId: this.id,
    }
  }
}
