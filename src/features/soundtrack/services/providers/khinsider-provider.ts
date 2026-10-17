import {
  BaseSoundtrackProvider,
  extractCoreGameTitle,
  scoreAlbumMatchForGame,
} from './base-provider'
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

const KNOWN_KHINSIDER_SLUGS: Record<string, string[]> = {
  'elden ring': ['elden-ring-original-soundtrack', 'elden-ring'],
  'the witcher 3 wild hunt': [
    'the-witcher-3-wild-hunt-official-soundtrack',
    'the-witcher-3-wild-hunt-extended-edition-soundtrack',
    'the-witcher-3-wild-hunt',
  ],
  'cyberpunk 2077': [
    'cyberpunk-2077-original-score',
    'cyberpunk-2077',
    'cyberpunk-2077-radio-vol-1-original-soundtrack',
  ],
  'baldurs gate 3': [
    'baldurs-gate-3-original-game-soundtrack-2023',
    'baldurs-gate-3-original-soundtrack',
    'baldurs-gate-3',
  ],
  'red dead redemption 2': [
    'red-dead-redemption-2-original-score',
    'red-dead-redemption-2-original-soundtrack',
    'red-dead-redemption-2',
  ],
  'red dead redemption': ['red-dead-redemption-original-soundtrack', 'red-dead-redemption'],
  'god of war': [
    'god-of-war-playstation-soundtrack-ps4-2018',
    'god-of-war-2018-original-soundtrack',
    'god-of-war-original-soundtrack',
  ],
  'god of war ragnarok': [
    'god-of-war-ragnarok-original-soundtrack-2022',
    'god-of-war-ragnarok-original-soundtrack',
  ],
  'ghost of tsushima': [
    'ghost-of-tsushima-original-soundtrack-2020',
    'ghost-of-tsushima-original-soundtrack',
  ],
  'the last of us': ['the-last-of-us-original-score-soundtrack', 'the-last-of-us'],
  'the last of us part i': ['the-last-of-us-original-score-soundtrack', 'the-last-of-us'],
  'the last of us part ii': [
    'the-last-of-us-part-ii-original-soundtrack-2020',
    'the-last-of-us-part-ii',
  ],
  'hollow knight': ['hollow-knight-original-soundtrack', 'hollow-knight-official-soundtrack'],
  hades: ['hades-original-soundtrack', 'hades'],
  'hades ii': ['hades-ii-original-soundtrack', 'hades-original-soundtrack'],
  'hades 2': ['hades-ii-original-soundtrack', 'hades-original-soundtrack'],
  'doom eternal': ['doom-eternal-original-game-soundtrack', 'doom-eternal-original-soundtrack'],
  doom: ['doom-2016-original-game-soundtrack', 'doom-original-game-soundtrack'],
  'nier automata': ['nier-automata-original-soundtrack', 'nier-automata'],
  'persona 5 royal': ['persona-5-royal-original-soundtrack', 'persona-5-original-soundtrack'],
  'persona 3 reload': [
    'persona-3-reload-original-soundtrack-2024',
    'persona-3-original-soundtrack',
  ],
  'dark souls iii': ['dark-souls-iii-original-soundtrack', 'dark-souls-3-original-soundtrack'],
  'dark souls 3': ['dark-souls-iii-original-soundtrack', 'dark-souls-3-original-soundtrack'],
  'sekiro shadows die twice': [
    'sekiro-shadows-die-twice-original-soundtrack',
    'sekiro-shadows-die-twice',
  ],
  'black myth wukong': ['black-myth-wukong-original-soundtrack-2024', 'black-myth-wukong'],
  'death stranding': ['death-stranding-original-score-2019', 'death-stranding-original-score'],
  'silent hill 2': [
    'silent-hill-2-original-soundtrack-2024',
    'silent-hill-2-original-soundtracks',
    'silent-hill-2-original-soundtrack',
  ],
  'resident evil 4': [
    'resident-evil-4-original-soundtrack-2023',
    'resident-evil-4-original-soundtrack',
  ],
  'alan wake 2': ['alan-wake-2-original-soundtrack', 'alan-wake-original-soundtrack'],
  control: ['control-original-soundtrack-2019', 'control-original-soundtrack'],
  celeste: ['celeste-original-soundtrack', 'celeste'],
  undertale: ['undertale-original-soundtrack', 'undertale'],
  'final fantasy vii remake': [
    'final-fantasy-vii-remake-original-soundtrack',
    'final-fantasy-vii-original-soundtrack',
  ],
  'final fantasy vii rebirth': [
    'final-fantasy-vii-rebirth-original-soundtrack-2024',
    'final-fantasy-vii-remake-original-soundtrack',
  ],
  'final fantasy xvi': [
    'final-fantasy-xvi-original-soundtrack-2023',
    'final-fantasy-xvi-original-soundtrack',
  ],
  'the elder scrolls v skyrim': [
    'the-elder-scrolls-v-skyrim-original-game-soundtrack',
    'skyrim-original-soundtrack',
  ],
  'grand theft auto v': ['the-music-of-grand-theft-auto-v-vol.-2-the-score', 'grand-theft-auto-v'],
  'marvels spider man': [
    'marvels-spider-man-original-video-game-soundtrack-2018',
    'marvel-s-spider-man-original-video-game-soundtrack',
  ],
  'marvels spider man miles morales': [
    'marvels-spider-man-miles-morales-original-video-game-soundtrack-2020',
  ],
  'horizon zero dawn': ['horizon-zero-dawn-original-soundtrack'],
  'horizon forbidden west': ['horizon-forbidden-west-original-soundtrack-2022'],
  'detroit become human': ['detroit-become-human-original-soundtrack-2018'],
  'lies of p': ['lies-of-p-original-soundtrack-2023', 'lies-of-p-original-soundtrack'],
  'armored core vi fires of rubicon': ['armored-core-vi-fires-of-rubicon-original-soundtrack-2023'],
  'monster hunter world': ['monster-hunter-world-original-soundtrack'],
  'halo the master chief collection': [
    'halo-combat-evolved-original-soundtrack',
    'halo-2-original-soundtrack',
  ],
  'mass effect legendary edition': [
    'mass-effect-original-soundtrack',
    'mass-effect-2-original-videogame-score',
  ],
  stray: ['stray-original-soundtrack-2022', 'stray-original-soundtrack'],
  'outer wilds': ['outer-wilds-original-soundtrack-2019', 'outer-wilds-original-soundtrack'],
  'disco elysium': ['disco-elysium-original-soundtrack-2019', 'disco-elysium-original-soundtrack'],
  'devil may cry 5': ['devil-may-cry-5-original-soundtrack'],
  'stardew valley': ['stardew-valley-original-soundtrack', 'stardew-valley-ost'],
  'the legend of zelda breath of the wild': [
    'the-legend-of-zelda-breath-of-the-wild-original-soundtrack',
  ],
  'the legend of zelda tears of the kingdom': [
    'the-legend-of-zelda-tears-of-the-kingdom-original-soundtrack-2024',
  ],
}

export class KHInsiderProvider extends BaseSoundtrackProvider {
  public id = 'khinsider'
  public name = 'KHInsider (VGM)'
  public priority = 15

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
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  }
  private streamUrlCache: Map<string, string> = new Map()
  private albumCache: Map<string, SoundtrackAlbumWithTracks> = new Map()

  private cleanTrackName(title: string): string {
    return title
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/^\d+[\s.\-_]+/, '')
      .replace(/\([^)]*\)/g, ' ')
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
  }

  private candidateSlugsForGame(gameTitle: string): string[] {
    const core = extractCoreGameTitle(gameTitle).toLowerCase()
    const baseSlug = core.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    const list: string[] = []
    if (KNOWN_KHINSIDER_SLUGS[core]) {
      list.push(...KNOWN_KHINSIDER_SLUGS[core])
    }
    if (baseSlug) {
      list.push(
        `${baseSlug}-original-soundtrack`,
        `${baseSlug}-original-game-soundtrack`,
        `${baseSlug}-official-soundtrack`,
        `${baseSlug}-ost`,
        baseSlug,
      )
    }
    return Array.from(new Set(list))
  }

  public async searchGame(game: GameIdentity): Promise<SoundtrackMatch[]> {
    const albums = await this.getAlbums(game)
    return albums.map((album) => ({
      album,
      confidence: 0.95,
    }))
  }

  public async getAlbums(game: GameIdentity): Promise<SoundtrackAlbum[]> {
    const query = this.cleanTitle(game.title)
    if (!query) return []

    // 1. Check known or derived direct slugs first
    const directSlugs = this.candidateSlugsForGame(game.title)
    const url = `${this.baseUrl}/search?search=${encodeURIComponent(query)}`

    try {
      const html = await this.fetchHtml(url, this.headers, 5000)
      const scoredAlbums: { album: SoundtrackAlbum; score: number }[] = []
      const seenSlugs = new Set<string>()

      // Case A: Redirected directly to an album page
      if (html.includes('id="songlist"')) {
        const h2Match = html.match(/<h2>([^<]+)<\/h2>/i)
        const songLinkMatch = html.match(
          /href="(\/game-soundtracks\/album\/([^/"]+))\/[^"]+\.(?:mp3|flac|ogg|m4a)"/i,
        )
        if (songLinkMatch) {
          const rawTitle = h2Match ? h2Match[1].trim() : game.title
          const path = songLinkMatch[1]
          const slug = songLinkMatch[2]
          return [
            {
              id: `kh_${slug}`,
              game_id: game.gameId,
              title: rawTitle,
              album_type: 'original_soundtrack',
              artist: 'Video Game Soundtrack',
              release_date: null,
              cover_url: null,
              track_count: 0,
              total_duration_ms: 0,
              provider_id: this.id,
              external_id: path,
            },
          ]
        }
      }

      let searchRegion = html
      const pageContentIdx = html.indexOf('id="pageContent"')
      if (pageContentIdx !== -1) {
        searchRegion = html.substring(pageContentIdx)
      }

      const regex = /href="(\/game-soundtracks\/album\/([^"\/]+))"[^>]*>([^<]+)<\/a>/gi
      let match: RegExpExecArray | null

      while ((match = regex.exec(searchRegion)) !== null) {
        const path = match[1]
        const slug = match[2]
        const rawTitle = match[3].trim()

        if (seenSlugs.has(slug) || !rawTitle) continue
        seenSlugs.add(slug)

        const matchScore = scoreAlbumMatchForGame(rawTitle, game.title)
        const isKnownSlug = directSlugs.includes(slug)
        if (matchScore <= 0 && !isKnownSlug) continue

        scoredAlbums.push({
          score: isKnownSlug ? 100 : matchScore,
          album: {
            id: `kh_${slug}`,
            game_id: game.gameId,
            title: rawTitle,
            album_type: 'original_soundtrack',
            artist: 'Video Game Soundtrack',
            release_date: null,
            cover_url: null,
            track_count: 0,
            total_duration_ms: 0,
            provider_id: this.id,
            external_id: path,
          },
        })
      }

      if (scoredAlbums.length > 0) {
        scoredAlbums.sort((a, b) => b.score - a.score)
        return scoredAlbums.slice(0, 4).map((item) => item.album)
      }
    } catch {
      // Fallthrough to direct slug candidates
    }

    return directSlugs.slice(0, 3).map((slug) => ({
      id: `kh_${slug}`,
      game_id: game.gameId,
      title: `${game.title} (Original Soundtrack)`,
      album_type: 'original_soundtrack',
      artist: 'Video Game Soundtrack',
      release_date: null,
      cover_url: null,
      track_count: 0,
      total_duration_ms: 0,
      provider_id: this.id,
      external_id: `/game-soundtracks/album/${slug}`,
    }))
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
      const html = await this.fetchHtml(url, this.headers, 5500)
      if (!html.includes('id="songlist"')) return null

      const coverMatch =
        html.match(
          /src="(https?:\/\/[^"]*(?:vgmtreasurechest|vgmsite|vgmdownloads)\.com\/soundtracks\/[^"]*\/thumbs\/[^"]+\.(?:jpg|jpeg|png))"/i,
        ) ||
        html.match(
          /src="(https?:\/\/[^"]*(?:vgmtreasurechest|vgmsite|vgmdownloads)\.com\/soundtracks\/[^"]+\.(?:jpg|jpeg|png))"/i,
        )
      const coverUrl = coverMatch ? coverMatch[1].replace('/thumbs/', '/') : null

      const tracks: SoundtrackTrack[] = []
      let totalDurationMs = 0

      const songlistStart = html.indexOf('id="songlist"')
      const songlistEnd = html.indexOf('</table>', songlistStart)
      const songlistHtml =
        songlistEnd !== -1
          ? html.substring(songlistStart, songlistEnd)
          : html.substring(songlistStart)

      const trRegex = /<tr[\s\S]*?<\/tr>/gi
      let trMatch: RegExpExecArray | null
      let trackNumber = 1
      const seenSongPaths = new Set<string>()

      while ((trMatch = trRegex.exec(songlistHtml)) !== null) {
        const row = trMatch[0]
        if (row.includes('id="songlist_header"') || row.includes('id="songlist_footer"')) continue

        // Match all links to song pages inside the row regardless of whitespace/newlines
        const linkRegex =
          /<a\s+href="(\/game-soundtracks\/album\/[^"]+\.(?:mp3|flac|ogg|m4a))"[^>]*>([\s\S]*?)<\/a>/gi
        let lm: RegExpExecArray | null
        let songPath = ''
        let title = ''
        let durationMs = 0

        while ((lm = linkRegex.exec(row)) !== null) {
          const text = lm[2].replace(/<[^>]+>/g, '').trim()
          if (!text) continue
          if (/^\d+:\d+$/.test(text)) {
            const parts = text.split(':').map(Number)
            if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
              durationMs = (parts[0] * 60 + parts[1]) * 1000
            }
          } else if (!title) {
            songPath = lm[1]
            title = text
          }
        }

        if (!songPath || !title || seenSongPaths.has(songPath)) continue
        seenSongPaths.add(songPath)

        totalDurationMs += durationMs
        const trackId = `kh_trk_${albumId}_${trackNumber}`
        tracks.push({
          id: trackId,
          album_id: albumId,
          disc_number: 1,
          track_number: trackNumber++,
          title,
          artist: 'Official Game Score',
          duration_ms: durationMs || 180_000,
          preview_url: null,
          stream_url: null,
          download_url: null,
          local_path: null,
          provider_id: this.id,
          external_id: songPath,
        })
      }

      if (tracks.length === 0) return null

      const h2Match = html.match(/<h2>([^<]+)<\/h2>/i)
      const title = h2Match ? h2Match[1].trim() : albumId.replace(/^kh_/, '').replace(/-/g, ' ')

      return {
        album: {
          id: albumId,
          game_id: null,
          title,
          album_type: 'original_soundtrack',
          artist: 'Video Game Soundtrack',
          release_date: null,
          cover_url: coverUrl,
          track_count: tracks.length,
          total_duration_ms: totalDurationMs,
          provider_id: this.id,
          external_id: albumPath,
        },
        tracks,
      }
    } catch {
      return null
    }
  }

  public async getArtwork(album: SoundtrackAlbum): Promise<string | null> {
    if (album.cover_url && album.cover_url.startsWith('http')) return album.cover_url
    if (album.external_id) {
      const full = await this.getAlbum(album.id, album.external_id)
      if (full?.album.cover_url) return full.album.cover_url
    }
    return null
  }

  public async getPlaybackSource(
    track: SoundtrackTrack,
    game?: GameIdentity,
  ): Promise<PlaybackSource | null> {
    if (this.streamUrlCache.has(track.id)) {
      return {
        type: 'stream',
        url: this.streamUrlCache.get(track.id)!,
        format: 'mp3',
        providerId: this.id,
      }
    }

    let externalPath =
      track.external_id &&
      (track.external_id.startsWith('/game-soundtracks/') || track.external_id.startsWith('http'))
        ? track.external_id
        : null

    if (!externalPath && game?.title) {
      const cacheKey = this.cleanTitle(game.title).toLowerCase()
      let full = this.albumCache.get(cacheKey) || null

      if (!full) {
        // Probe direct known slugs first in parallel for instant resolution!
        const candidateSlugs = this.candidateSlugsForGame(game.title).slice(0, 3)
        const probed = await Promise.all(
          candidateSlugs.map((slug) =>
            this.getAlbum(`kh_${slug}`, `/game-soundtracks/album/${slug}`),
          ),
        )
        full = probed.find((p) => p && p.tracks.length > 0) || null

        if (!full) {
          const albums = await this.getAlbums(game)
          for (const alb of albums.slice(0, 2)) {
            if (!alb.external_id) continue
            const candidateAlb = await this.getAlbum(alb.id, alb.external_id)
            if (candidateAlb && candidateAlb.tracks.length > 0) {
              full = candidateAlb
              break
            }
          }
        }

        if (full && full.tracks.length > 0) {
          this.albumCache.set(cacheKey, full)
        }
      }

      if (full && full.tracks.length > 0) {
        const normTarget = this.cleanTrackName(track.title)
        const matchedTrack =
          full.tracks.find((t) => {
            const nt = this.cleanTrackName(t.title)
            return (
              Boolean(nt && normTarget) &&
              (nt === normTarget || nt.includes(normTarget) || normTarget.includes(nt))
            )
          }) ||
          (track.track_number > 0 && track.track_number <= full.tracks.length
            ? full.tracks[track.track_number - 1]
            : full.tracks[0])

        if (matchedTrack?.external_id) {
          externalPath = matchedTrack.external_id
        }
      }
    }

    if (!externalPath) return null

    const songUrl = externalPath.startsWith('http')
      ? externalPath
      : `${this.baseUrl}${externalPath}`

    try {
      const html = await this.fetchHtml(songUrl, this.headers, 5500)

      const audioMatch =
        html.match(/<audio[^>]*\bsrc=["']([^"']+\.(?:mp3|flac|ogg|m4a)[^"']*)["']/i) ||
        html.match(
          /href=["'](https?:\/\/[^"'\s]+\.(?:vgmtreasurechest|vgmsite|vgmdownloads)\.com\/[^"'\s]+\.(?:mp3|flac|ogg|m4a))["']/i,
        ) ||
        html.match(/href=["'](https?:\/\/[^"']+\.mp3)["']/i) ||
        html.match(/src=["'](https?:\/\/[^"']+\.mp3)["']/i)

      let streamUrl = audioMatch ? audioMatch[1] : null
      if (streamUrl) {
        streamUrl = streamUrl.replace(/&amp;/g, '&').trim()
        if (streamUrl.startsWith('//')) {
          streamUrl = `https:${streamUrl}`
        } else if (streamUrl.startsWith('/')) {
          streamUrl = `${this.baseUrl}${streamUrl}`
        }

        if (/^https?:\/\//i.test(streamUrl)) {
          this.streamUrlCache.set(track.id, streamUrl)
          return {
            type: 'stream',
            url: streamUrl,
            format: 'mp3',
            providerId: this.id,
          }
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
