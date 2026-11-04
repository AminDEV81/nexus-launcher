import type {
  DownloadSource,
  GameIdentity,
  PlaybackSource,
  SoundtrackAlbum,
  SoundtrackAlbumWithTracks,
  SoundtrackTrack,
} from '../types'
import {
  getAllCuratedSoundtracks,
  lookupCuratedSoundtrack,
  resolveAlbumCoverFallback,
} from './curated-soundtracks'
import { providerRegistry } from './provider-registry'
import {
  extractCoreGameTitle,
  isAlbumValidForGame,
  scoreAlbumForUserSearchQuery,
  scoreAlbumMatchForGame,
} from './providers/base-provider'
import { aggregateAlbums } from './tracklist-aggregator'
import {
  clearGameSoundtracks,
  getSoundtrackCache,
  getSoundtrackLocalFiles,
  saveSoundtrackAlbum,
  setSoundtrackCache,
  soundtrackHttpGet,
  soundtrackSearchYouTube,
} from './tauri-soundtrack'

interface ItunesSongItem {
  wrapperType?: string
  kind?: string
  collectionId?: number
  trackId?: number
  artistName?: string
  collectionName?: string
  trackName?: string
  previewUrl?: string
  artworkUrl100?: string
  trackTimeMillis?: number
  discNumber?: number
  trackNumber?: number
  releaseDate?: string
  primaryGenreName?: string
}

interface DeezerTrackItem {
  id?: number
  title?: string
  duration?: number
  preview?: string
  track_position?: number
  disk_number?: number
  artist?: { name?: string }
  album?: {
    id?: number
    title?: string
    cover_big?: string
    cover_xl?: string
  }
}

const NON_GAME_GENRES = new Set([
  'latino',
  'música tropical',
  'musica tropical',
  'urbano latino',
  'pop latino',
  'reggaeton',
  'salsa',
  'bachata',
  'cumbia',
  'regional mexicano',
  'latin',
  'brazilian',
  'sertanejo',
  'forró',
  'comedy',
  "children's music",
  'christian & gospel',
  'holiday',
])

const NON_ORIGINAL_ALBUM_MARKERS = [
  'tribute',
  'karaoke',
  'lullaby',
  'lullabies',
  'music box',
  '8-bit',
  '8 bit',
  'chiptune',
  'ringtone',
  'parody',
  'parodia',
  'en español',
  'en espanol',
  'spanish version',
  'made famous by',
  'originally performed by',
  'workout',
  'relaxing piano',
  'sleep music',
]

function isAuthenticSoundtrackCollection(
  collectionName: string,
  artistName: string,
  primaryGenreName: string | undefined,
  query: string,
): boolean {
  const lowCol = collectionName.toLowerCase()
  const lowArt = artistName.toLowerCase()
  const lowGenre = (primaryGenreName || '').toLowerCase().trim()
  const lowQ = query.toLowerCase().trim()

  for (const marker of NON_ORIGINAL_ALBUM_MARKERS) {
    if ((lowCol.includes(marker) || lowArt.includes(marker)) && !lowQ.includes(marker)) {
      return false
    }
  }

  const hasExplicitOstMarker =
    lowCol.includes('soundtrack') ||
    lowCol.includes('original score') ||
    lowCol.includes('video game') ||
    lowCol.includes('game music') ||
    lowCol.includes('game score') ||
    /\bost\b/.test(lowCol) ||
    lowCol.includes('songs to test by') ||
    lowGenre === 'soundtrack' ||
    lowGenre === 'video game' ||
    lowGenre === 'original score'

  if (lowGenre && NON_GAME_GENRES.has(lowGenre) && !hasExplicitOstMarker) {
    return false
  }

  // Reject single-track pop singles ("... - Single") unless it explicitly states Soundtrack/Score
  if (/\b-\s*single\b/i.test(collectionName) && !hasExplicitOstMarker) {
    return false
  }

  return scoreAlbumForUserSearchQuery(collectionName, artistName, query) > 0
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms)
    promise
      .then((val) => {
        clearTimeout(timer)
        resolve(val)
      })
      .catch(() => {
        clearTimeout(timer)
        resolve(fallback)
      })
  })
}

function isBrowserOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

async function fetchJsonFast<T>(url: string, timeoutMs = 5000): Promise<T | null> {
  if (isBrowserOffline()) return null
  try {
    const text = await withTimeout(soundtrackHttpGet(url), timeoutMs, '')
    if (text) {
      return JSON.parse(text) as T
    }
  } catch {
    // Fallthrough to browser fetch if CORS-enabled
  }
  // Only attempt browser fetch on CORS-enabled endpoints (iTunes supports CORS; Deezer does not)
  if (url.includes('itunes.apple.com')) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, 3500))
      const resp = await fetch(url, { signal: controller.signal })
      clearTimeout(timer)
      if (!resp.ok) return null
      return (await resp.json()) as T
    } catch {
      return null
    }
  }
  return null
}

function toTitleCase(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}

export class SoundtrackResolver {
  private memoryCache: Map<string, SoundtrackAlbumWithTracks[]> = new Map()
  private onlineSearchCache: Map<string, SoundtrackAlbumWithTracks[]> = new Map()
  private playbackCandidateCache: Map<string, PlaybackSource[]> = new Map()
  private inFlightCandidates: Map<string, Promise<PlaybackSource[]>> = new Map()

  /**
   * Fetches all songs belonging to an iTunes `collectionId` (up to 200 tracks).
   */
  private async expandItunesAlbumFullTracklist(
    collectionId: number,
  ): Promise<ItunesSongItem[]> {
    const url = `https://itunes.apple.com/lookup?id=${collectionId}&entity=song&limit=200`
    const data = await fetchJsonFast<{ results?: ItunesSongItem[] }>(url, 4500)
    if (!data?.results) return []
    return data.results.filter(
      (item) =>
        (item.wrapperType === 'track' || item.kind === 'song') &&
        Boolean(item.trackName),
    )
  }

  /**
   * Fetches all tracks belonging to a Deezer `albumId` (up to 200 tracks).
   */
  private async expandDeezerAlbumFullTracklist(
    albumId: number,
  ): Promise<DeezerTrackItem[]> {
    const url = `https://api.deezer.com/album/${albumId}/tracks?limit=200`
    const data = await fetchJsonFast<{ data?: DeezerTrackItem[] }>(url, 4500)
    if (!data?.data) return []
    return data.data.filter((item) => Boolean(item.title))
  }

  /**
   * Queries iTunes + Deezer for any game soundtrack and expands top matching albums to their full 20-200 track list.
   */
  private async fetchItunesAndDeezerAlbumsSinglePass(
    query: string,
    game?: GameIdentity,
  ): Promise<SoundtrackAlbumWithTracks[]> {
    const cleanQ = query.trim()
    if (!cleanQ) return []

    const searchPhrase = /\b(?:soundtrack|ost|score)\b/i.test(cleanQ)
      ? cleanQ
      : `${cleanQ} Soundtrack`

    const term = encodeURIComponent(searchPhrase)
    const itunesUrl = `https://itunes.apple.com/search?term=${term}&media=music&entity=song&limit=60`
    const deezerUrl = `https://api.deezer.com/search?q=${term}&limit=50`

    const [itunesData, deezerData] = await Promise.all([
      fetchJsonFast<{ results?: ItunesSongItem[] }>(itunesUrl, 4800),
      fetchJsonFast<{ data?: DeezerTrackItem[] }>(deezerUrl, 4800),
    ])

    const out: SoundtrackAlbumWithTracks[] = []
    const gameId =
      game?.gameId || `custom_${cleanQ.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`

    // 1. Process iTunes songs into grouped albums
    const itunesItems = itunesData?.results || []
    if (itunesItems.length > 0) {
      const grouped = new Map<
        number,
        {
          collectionId: number
          collectionName: string
          artistName: string
          coverUrl: string | null
          releaseDate: string | null
          primaryGenreName?: string
          songs: ItunesSongItem[]
        }
      >()

      for (const item of itunesItems) {
        if (!item.collectionId || !item.collectionName || !item.trackName) {
          continue
        }
        if (
          !isAuthenticSoundtrackCollection(
            item.collectionName,
            item.artistName || '',
            item.primaryGenreName,
            cleanQ,
          )
        ) {
          continue
        }

        const existing = grouped.get(item.collectionId)
        if (existing) {
          existing.songs.push(item)
        } else {
          grouped.set(item.collectionId, {
            collectionId: item.collectionId,
            collectionName: item.collectionName,
            artistName: item.artistName || 'Original Game Soundtrack',
            coverUrl: item.artworkUrl100
              ? item.artworkUrl100.replace('100x100bb', '600x600bb')
              : game?.coverUrl || resolveAlbumCoverFallback(item.collectionName),
            releaseDate: item.releaseDate ? item.releaseDate.split('T')[0] : null,
            primaryGenreName: item.primaryGenreName,
            songs: [item],
          })
        }
      }

      const sortedGroups = Array.from(grouped.values()).sort((a, b) => {
        const sa =
          scoreAlbumForUserSearchQuery(a.collectionName, a.artistName, cleanQ) +
          a.songs.length * 3
        const sb =
          scoreAlbumForUserSearchQuery(b.collectionName, b.artistName, cleanQ) +
          b.songs.length * 3
        return sb - sa
      })

      await Promise.all(
        sortedGroups.slice(0, 3).map(async (grp) => {
          const fullSongs = await this.expandItunesAlbumFullTracklist(grp.collectionId)
          if (fullSongs.length > grp.songs.length) {
            grp.songs = fullSongs
          }
        }),
      )

      for (const grp of sortedGroups) {
        grp.songs.sort(
          (a, b) =>
            (a.discNumber || 1) - (b.discNumber || 1) ||
            (a.trackNumber || 0) - (b.trackNumber || 0),
        )

        const albumId = `itunes_alb_${grp.collectionId}`
        const tracks: SoundtrackTrack[] = grp.songs.map((s, idx) => ({
          id: `itunes_trk_${s.trackId || `${grp.collectionId}_${idx}`}`,
          album_id: albumId,
          disc_number: s.discNumber || 1,
          track_number: s.trackNumber || idx + 1,
          title: s.trackName || `Track ${idx + 1}`,
          artist: s.artistName || grp.artistName,
          duration_ms: s.trackTimeMillis || 165_000,
          preview_url: null,
          stream_url: null,
          download_url: null,
          local_path: null,
          provider_id: 'itunes',
          external_id: String(s.trackId || idx),
        }))

        if (tracks.length < 1) continue

        out.push({
          album: {
            id: albumId,
            game_id: gameId,
            title: grp.collectionName,
            album_type: 'original_soundtrack',
            artist: grp.artistName,
            release_date: grp.releaseDate,
            cover_url:
              grp.coverUrl || game?.coverUrl || resolveAlbumCoverFallback(grp.collectionName),
            track_count: tracks.length,
            total_duration_ms: tracks.reduce((acc, t) => acc + (t.duration_ms || 0), 0),
            provider_id: 'itunes',
            external_id: String(grp.collectionId),
          },
          tracks,
        })
      }
    }

    // 2. Process Deezer tracks into grouped albums
    const deezerItems = deezerData?.data || []
    if (deezerItems.length > 0) {
      const dzGrouped = new Map<
        number,
        {
          albumId: number
          albumTitle: string
          artistName: string
          coverUrl: string | null
          tracks: DeezerTrackItem[]
        }
      >()

      for (const item of deezerItems) {
        const albId = item.album?.id
        const albTitle = item.album?.title
        if (!albId || !albTitle || !item.title) continue
        if (
          !isAuthenticSoundtrackCollection(
            albTitle,
            item.artist?.name || '',
            undefined,
            cleanQ,
          )
        ) {
          continue
        }

        const existing = dzGrouped.get(albId)
        if (existing) {
          existing.tracks.push(item)
        } else {
          dzGrouped.set(albId, {
            albumId: albId,
            albumTitle: albTitle,
            artistName: item.artist?.name || 'Original Game Soundtrack',
            coverUrl:
              item.album?.cover_xl ||
              item.album?.cover_big ||
              game?.coverUrl ||
              resolveAlbumCoverFallback(albTitle),
            tracks: [item],
          })
        }
      }

      const sortedDzGroups = Array.from(dzGrouped.values()).sort((a, b) => {
        const sa =
          scoreAlbumForUserSearchQuery(a.albumTitle, a.artistName, cleanQ) +
          a.tracks.length * 3
        const sb =
          scoreAlbumForUserSearchQuery(b.albumTitle, b.artistName, cleanQ) +
          b.tracks.length * 3
        return sb - sa
      })

      await Promise.all(
        sortedDzGroups.slice(0, 2).map(async (grp) => {
          const fullDzTracks = await this.expandDeezerAlbumFullTracklist(grp.albumId)
          if (fullDzTracks.length > grp.tracks.length) {
            grp.tracks = fullDzTracks
          }
        }),
      )

      for (const grp of sortedDzGroups) {
        const albumId = `deezer_alb_${grp.albumId}`
        const tracks: SoundtrackTrack[] = grp.tracks.map((s, idx) => ({
          id: `deezer_trk_${s.id || `${grp.albumId}_${idx}`}`,
          album_id: albumId,
          disc_number: s.disk_number || 1,
          track_number: s.track_position || idx + 1,
          title: s.title || `Track ${idx + 1}`,
          artist: s.artist?.name || grp.artistName,
          duration_ms: (s.duration || 165) * 1000,
          preview_url: null,
          stream_url: null,
          download_url: null,
          local_path: null,
          provider_id: 'itunes',
          external_id: String(s.id || idx),
        }))

        if (tracks.length < 1) continue

        out.push({
          album: {
            id: albumId,
            game_id: gameId,
            title: grp.albumTitle,
            album_type: 'original_soundtrack',
            artist: grp.artistName,
            release_date: null,
            cover_url: grp.coverUrl || resolveAlbumCoverFallback(grp.albumTitle),
            track_count: tracks.length,
            total_duration_ms: tracks.reduce((acc, t) => acc + (t.duration_ms || 0), 0),
            provider_id: 'itunes',
            external_id: String(grp.albumId),
          },
          tracks,
        })
      }
    }

    out.sort((a, b) => {
      const sa =
        scoreAlbumForUserSearchQuery(a.album.title, a.album.artist || '', cleanQ) +
        Math.min(40, a.tracks.length * 2)
      const sb =
        scoreAlbumForUserSearchQuery(b.album.title, b.album.artist || '', cleanQ) +
        Math.min(40, b.tracks.length * 2)
      return sb - sa
    })

    return out.slice(0, 8)
  }

  /**
   * Enriches a curated or partial album bundle with its complete online tracklist (KHInsider + iTunes/Deezer Lookup).
   */
  public async enrichAlbumWithFullTracklist(
    bundle: SoundtrackAlbumWithTracks,
  ): Promise<SoundtrackAlbumWithTracks> {
    if (!bundle?.album?.title) return bundle
    const coreTitle = extractCoreGameTitle(bundle.album.title)
      .replace(
        /\b(?:original|official|video|game|soundtrack|soundtracks|score|ost|music|complete|edition)\b/gi,
        ' ',
      )
      .replace(/\s+/g, ' ')
      .trim()

    if (!coreTitle) return bundle

    const resolved = await this.resolveGame({
      gameId: bundle.album.game_id || bundle.album.id,
      title: coreTitle,
      coverUrl: bundle.album.cover_url,
      releaseYear: bundle.album.release_date ?? undefined,
    })

    if (resolved.length > 0 && resolved[0].tracks.length > bundle.tracks.length) {
      return {
        album: {
          ...resolved[0].album,
          cover_url: bundle.album.cover_url || resolved[0].album.cover_url,
        },
        tracks: resolved[0].tracks,
      }
    }
    return bundle
  }

  /**
   * Global Live Online Soundtrack Search for any game (even games never in the user's library).
   * Queries Curated Catalog + iTunes/Deezer Full-Album API + KHInsider + YouTube OST Search in parallel!
   */
  public async searchOnlineSoundtracksFast(
    rawQuery: string,
    bypassCache = false,
  ): Promise<SoundtrackAlbumWithTracks[]> {
    const q = rawQuery.trim()
    if (q.length < 2) return []

    const normKey = q.toLowerCase()
    if (!bypassCache && this.onlineSearchCache.has(normKey)) {
      const cached = this.onlineSearchCache.get(normKey)!
      if (cached.length > 0) return cached
    }

    const results: SoundtrackAlbumWithTracks[] = []
    const seenIds = new Set<string>()
    const seenTitles = new Set<string>()

    const pushUnique = (item: SoundtrackAlbumWithTracks | null | undefined) => {
      if (!item || !item.tracks || item.tracks.length === 0) return
      const tKey = item.album.title.toLowerCase().trim()
      if (seenIds.has(item.album.id) || seenTitles.has(tKey)) return
      seenIds.add(item.album.id)
      seenTitles.add(tKey)
      results.push(item)
    }

    const customGameId = `custom_${normKey.replace(/[^a-z0-9]+/g, '_')}`

    // 1. Instant Curated Match
    const directCurated = lookupCuratedSoundtrack({
      gameId: customGameId,
      title: q,
    })

    // 2. KHInsider online search & album scraper
    const khinsiderProvider = providerRegistry.isProviderEnabled('khinsider')
      ? providerRegistry.getProvider('khinsider')
      : undefined

    const khTask = khinsiderProvider
      ? (async (): Promise<SoundtrackAlbumWithTracks[]> => {
          try {
            const gameCtx: GameIdentity = {
              gameId: customGameId,
              title: q,
            }
            const albums = await withTimeout(khinsiderProvider.getAlbums(gameCtx), 4500, [])
            const top = albums
              .map((alb) => ({
                alb,
                score: scoreAlbumForUserSearchQuery(alb.title, alb.artist || '', q),
              }))
              .filter((x) => x.score > 0)
              .sort((a, b) => b.score - a.score)
              .slice(0, 2)
            const fetched = await Promise.all(
              top.map(({ alb }) =>
                withTimeout(
                  khinsiderProvider.getAlbum(alb.id, alb.external_id || undefined),
                  4500,
                  null,
                ),
              ),
            )
            return fetched.filter((f): f is SoundtrackAlbumWithTracks =>
              Boolean(f && f.tracks.length > 0),
            )
          } catch {
            return []
          }
        })()
      : Promise.resolve([])

    // 3. YouTube Official Game Soundtrack Search (guarantees online results for ANY game in the world!)
    const ytTask = (async (): Promise<SoundtrackAlbumWithTracks | null> => {
      try {
        const ytQuery = /\b(?:soundtrack|ost|score)\b/i.test(q)
          ? `${q} Official Video Game`
          : `${q} Official Video Game Soundtrack OST`
        const ytResults = await withTimeout(soundtrackSearchYouTube(ytQuery, 20), 4800, [])
        if (!ytResults || ytResults.length === 0) return null

        const prettyGame = toTitleCase(extractCoreGameTitle(q) || q)
        const albumId = `yt_search_${normKey.replace(/[^a-z0-9]+/g, '_')}`
        const ytTracks: SoundtrackTrack[] = ytResults.map((t, idx) => ({
          id: `yt_trk_${t.video_id}`,
          album_id: albumId,
          disc_number: 1,
          track_number: idx + 1,
          title:
            t.title
              .replace(
                /\s*(?:\(|\[)?(?:OST|Official\s+Soundtrack|Original\s+(?:Game\s+)?Soundtrack|Official\s+Audio|Full\s+Track)(?:\)|\])?\s*/gi,
                ' ',
              )
              .replace(/\s+/g, ' ')
              .trim() || t.title,
          artist: t.channel?.replace(/ - Topic$/i, '') || `${prettyGame} Sound Team`,
          duration_ms: (t.duration_seconds || 180) * 1000,
          preview_url: null,
          stream_url: t.direct_audio_url || t.video_id,
          download_url: null,
          local_path: null,
          provider_id: 'youtube_direct',
          external_id: t.video_id,
        }))

        return {
          album: {
            id: albumId,
            game_id: customGameId,
            title: `${prettyGame} (Official Game Soundtrack)`,
            album_type: 'original_soundtrack',
            artist: ytTracks[0]?.artist || `${prettyGame} Sound Team`,
            release_date: null,
            cover_url:
              resolveAlbumCoverFallback(q) ||
              `https://i.ytimg.com/vi/${ytResults[0].video_id}/hqdefault.jpg`,
            track_count: ytTracks.length,
            total_duration_ms: ytTracks.reduce((acc, t) => acc + t.duration_ms, 0),
            provider_id: 'youtube',
            external_id: ytResults[0].video_id,
          },
          tracks: ytTracks,
        }
      } catch {
        return null
      }
    })()

    // 2b. Internet Archive classic game soundtrack search
    const archiveProvider = providerRegistry.isProviderEnabled('archive')
      ? providerRegistry.getProvider('archive')
      : undefined
    const iaTask = archiveProvider
      ? (async (): Promise<SoundtrackAlbumWithTracks[]> => {
          try {
            const gameCtx: GameIdentity = { gameId: customGameId, title: q }
            const albums = await withTimeout(archiveProvider.getAlbums(gameCtx), 4500, [])
            const fetched = await Promise.all(
              albums.slice(0, 2).map((alb) =>
                withTimeout(
                  archiveProvider.getAlbum(alb.id, alb.external_id || undefined),
                  4500,
                  null,
                ),
              ),
            )
            return fetched.filter((f): f is SoundtrackAlbumWithTracks =>
              Boolean(f && f.tracks.length > 0),
            )
          } catch {
            return []
          }
        })()
      : Promise.resolve([])

    const [cdnAlbums, khAlbums, iaAlbums, ytAlbum] = await Promise.all([
      this.fetchItunesAndDeezerAlbumsSinglePass(q),
      khTask,
      iaTask,
      ytTask,
    ])

    const bestOnlineCover =
      directCurated?.album.cover_url ||
      cdnAlbums.find((a) => a.album.cover_url)?.album.cover_url ||
      khAlbums.find((a) => a.album.cover_url)?.album.cover_url ||
      resolveAlbumCoverFallback(q) ||
      null

    // Merge primary exact matches so the top album has its complete tracklist
    const primaryPool: SoundtrackAlbumWithTracks[] = []
    if (directCurated) primaryPool.push(directCurated)
    for (const kh of khAlbums) {
      if (isAlbumValidForGame(kh.album.title, q)) {
        primaryPool.push(kh)
      }
    }
    for (const cdn of cdnAlbums) {
      if (isAlbumValidForGame(cdn.album.title, q)) {
        primaryPool.push(cdn)
      }
    }

    if (primaryPool.length > 0) {
      const mergedPrimary = aggregateAlbums(primaryPool)
      for (const mp of mergedPrimary) {
        if (!mp.album.cover_url && bestOnlineCover) {
          mp.album.cover_url = bestOnlineCover
        }
        pushUnique(mp)
      }
    }

    // Push all KHInsider, Internet Archive, and iTunes/Deezer albums matching the user's query
    for (const ia of iaAlbums) {
      if (!ia.album.cover_url && bestOnlineCover) {
        ia.album.cover_url = bestOnlineCover
      }
      pushUnique(ia)
    }
    for (const kh of khAlbums) {
      if (!kh.album.cover_url && bestOnlineCover) {
        kh.album.cover_url = bestOnlineCover
      }
      pushUnique(kh)
    }

    for (const alb of cdnAlbums) {
      if (scoreAlbumForUserSearchQuery(alb.album.title, alb.album.artist || '', q) > 0) {
        if (!alb.album.cover_url && bestOnlineCover) {
          alb.album.cover_url = bestOnlineCover
        }
        pushUnique(alb)
      }
    }

    // Also include matching curated albums
    for (const c of getAllCuratedSoundtracks()) {
      if (
        scoreAlbumForUserSearchQuery(c.album.title, c.album.artist || '', q) > 0 ||
        c.album.title.toLowerCase().includes(normKey) ||
        c.album.artist?.toLowerCase().includes(normKey) ||
        c.tracks.some((t) => t.title.toLowerCase().includes(normKey))
      ) {
        pushUnique(c)
      }
    }

    // Always include the YouTube Official Game Soundtrack album (either as primary if nothing else matched, or as an additional online source!)
    if (ytAlbum && ytAlbum.tracks.length > 0) {
      if (bestOnlineCover) {
        ytAlbum.album.cover_url = bestOnlineCover
      }
      pushUnique(ytAlbum)
    }

    if (results.length > 0) {
      this.onlineSearchCache.set(normKey, results)
      for (const item of results.slice(0, 3)) {
        saveSoundtrackAlbum(item.album, item.tracks).catch(() => undefined)
      }
    }

    return results
  }

  /**
   * Live Online Radio Wave Fetcher
   */
  public async fetchLiveRadioWave(
    seedQueries: string[],
    maxTracks = 28,
  ): Promise<{
    albums: SoundtrackAlbumWithTracks[]
    tracks: Array<{ track: SoundtrackTrack; album: SoundtrackAlbum }>
  }> {
    const uniqueSeeds = Array.from(new Set(seedQueries.map((s) => s.trim()).filter(Boolean))).slice(
      0,
      4,
    )
    if (uniqueSeeds.length === 0) {
      return { albums: [], tracks: [] }
    }

    const albumWaves = await Promise.all(
      uniqueSeeds.map((seed) =>
        withTimeout(this.fetchItunesAndDeezerAlbumsSinglePass(seed), 4500, []),
      ),
    )

    const discoveredAlbums: SoundtrackAlbumWithTracks[] = []
    const seenAlbumIds = new Set<string>()
    const trackPool: Array<{ track: SoundtrackTrack; album: SoundtrackAlbum }> = []
    const seenTrackIds = new Set<string>()
    const seenTrackNames = new Set<string>()

    for (let i = 0; i < albumWaves.length; i++) {
      const wave = albumWaves[i]
      const seedName = uniqueSeeds[i]
      for (const item of wave.slice(0, 3)) {
        if (!item.tracks || item.tracks.length === 0) continue
        if (scoreAlbumForUserSearchQuery(item.album.title, item.album.artist || '', seedName) <= 0)
          continue
        const enrichedAlbum: SoundtrackAlbum = {
          ...item.album,
          cover_url:
            item.album.cover_url ||
            resolveAlbumCoverFallback(item.album.title) ||
            resolveAlbumCoverFallback(seedName),
        }
        const enrichedFull: SoundtrackAlbumWithTracks = {
          album: enrichedAlbum,
          tracks: item.tracks.map((t) => ({ ...t, album_id: enrichedAlbum.id, preview_url: null })),
        }
        if (!seenAlbumIds.has(enrichedAlbum.id)) {
          seenAlbumIds.add(enrichedAlbum.id)
          discoveredAlbums.push(enrichedFull)
          saveSoundtrackAlbum(enrichedFull.album, enrichedFull.tracks).catch(() => undefined)
        }

        const shuffledTracks = [...enrichedFull.tracks]
        for (let k = shuffledTracks.length - 1; k > 0; k--) {
          const j = Math.floor(Math.random() * (k + 1))
          ;[shuffledTracks[k], shuffledTracks[j]] = [shuffledTracks[j], shuffledTracks[k]]
        }

        for (const trk of shuffledTracks.slice(0, 8)) {
          const normTitle = `${trk.title.toLowerCase().trim()}::${(trk.artist || '').toLowerCase().trim()}`
          if (!seenTrackIds.has(trk.id) && !seenTrackNames.has(normTitle)) {
            seenTrackIds.add(trk.id)
            seenTrackNames.add(normTitle)
            trackPool.push({ track: trk, album: enrichedAlbum })
          }
        }
      }
    }

    for (let i = trackPool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[trackPool[i], trackPool[j]] = [trackPool[j], trackPool[i]]
    }

    return {
      albums: discoveredAlbums,
      tracks: trackPool.slice(0, maxTracks),
    }
  }

  /**
   * 3-Layer Soundtrack Resolution with Full Album Tracklist Aggregation (Curated + KHInsider + iTunes/Deezer Full Lookup + YouTube OST)
   */
  public async resolveGame(
    game: GameIdentity,
    forceRefresh = false,
  ): Promise<SoundtrackAlbumWithTracks[]> {
    const coreTitle = extractCoreGameTitle(game.title)
    const yrTag = (game.releaseYear || '0').slice(0, 4)
    const cacheKey = `game_ost_v10_${game.gameId}_${coreTitle.toLowerCase().replace(/\s+/g, '_')}_${yrTag}`

    if (forceRefresh) {
      this.memoryCache.delete(cacheKey)
      await clearGameSoundtracks(game.gameId).catch(() => undefined)
    }

    if (!forceRefresh && this.memoryCache.has(cacheKey)) {
      const mem = this.memoryCache.get(cacheKey)!
      if (mem.length > 0) return mem
    }

    const curated = lookupCuratedSoundtrack(game)

    if (!forceRefresh) {
      try {
        const cachedJson = await getSoundtrackCache(cacheKey)
        if (cachedJson) {
          const parsed = JSON.parse(cachedJson) as SoundtrackAlbumWithTracks[]
          if (Array.isArray(parsed)) {
            const verifiedCached = parsed
              .filter(
                (a) =>
                  a.tracks &&
                  a.tracks.length >= (curated ? curated.tracks.length : 1),
              )
              .map((a) => ({
                ...a,
                tracks: a.tracks.map((t) => ({ ...t, preview_url: null })),
              }))
            if (verifiedCached.length > 0) {
              this.memoryCache.set(cacheKey, verifiedCached)
              return verifiedCached
            }
          }
        }
      } catch {
        // Ignore cache parse error
      }
    }

    const discoveredAlbumsWithTracks: SoundtrackAlbumWithTracks[] = []
    if (curated) {
      discoveredAlbumsWithTracks.push(curated)
    }

    if (isBrowserOffline() && !forceRefresh) {
      return discoveredAlbumsWithTracks
    }

    const searchTarget = coreTitle || game.title
    const enabledMetaProviders = providerRegistry.getMetadataProviders()
    const khinsiderProvider = providerRegistry.isProviderEnabled('khinsider')
      ? providerRegistry.getProvider('khinsider')
      : undefined

    const khinsiderTask = (async (): Promise<SoundtrackAlbumWithTracks[]> => {
      if (!khinsiderProvider) return []
      try {
        const albums = await withTimeout(khinsiderProvider.getAlbums(game), 4500, [])
        const top = albums
          .map((alb) => ({
            alb,
            score: Math.max(
              scoreAlbumMatchForGame(alb.title, game.title, alb.release_date, game.releaseYear),
              scoreAlbumForUserSearchQuery(alb.title, alb.artist || '', game.title),
            ),
          }))
          .filter((x) => x.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 2)

        const fetched = await Promise.all(
          top.map(({ alb }) =>
            withTimeout(
              khinsiderProvider.getAlbum(alb.id, alb.external_id || undefined),
              4500,
              null,
            ),
          ),
        )
        return fetched.filter((f): f is SoundtrackAlbumWithTracks =>
          Boolean(f && f.tracks.length > 0),
        )
      } catch {
        return []
      }
    })()

    const [cdnAlbums, khAlbums] = await Promise.all([
      enabledMetaProviders.length > 0
        ? this.fetchItunesAndDeezerAlbumsSinglePass(searchTarget, game)
        : Promise.resolve([]),
      khinsiderTask,
    ])

    for (const alb of khAlbums) {
      alb.album.game_id = game.gameId
      discoveredAlbumsWithTracks.push(alb)
    }
    for (const alb of cdnAlbums) {
      if (
        isAlbumValidForGame(
          alb.album.title,
          game.title,
          alb.album.release_date,
          game.releaseYear,
        ) ||
        scoreAlbumForUserSearchQuery(alb.album.title, alb.album.artist || '', game.title) >= 70
      ) {
        alb.album.game_id = game.gameId
        discoveredAlbumsWithTracks.push(alb)
      }
    }

    // Fallback to YouTube official OST search if no curated/KHInsider/iTunes album matched
    if (discoveredAlbumsWithTracks.length === 0 && searchTarget) {
      const words = searchTarget.trim().split(/\s+/)
      const ytQuery =
        words.length <= 2
          ? `${searchTarget} Video Game Official Original Soundtrack OST`
          : `${searchTarget} Official Original Soundtrack OST`

      const ytResults = await withTimeout(soundtrackSearchYouTube(ytQuery, 24), 4500, [])
      if (ytResults && ytResults.length > 0) {
        const albumId = `yt_ost_${game.gameId}`
        const ytTracks: SoundtrackTrack[] = ytResults.map((t, idx) => ({
          id: `yt_trk_${t.video_id}`,
          album_id: albumId,
          disc_number: 1,
          track_number: idx + 1,
          title:
            t.title
              .replace(
                /\s*\(?(?:OST|Official Soundtrack|Original Soundtrack|Audio|Full Track)\)?\s*/gi,
                '',
              )
              .trim() || t.title,
          artist: t.channel?.replace(/ - Topic$/i, '') || `${game.title} Soundtrack`,
          duration_ms: (t.duration_seconds || 180) * 1000,
          preview_url: null,
          stream_url: t.direct_audio_url || t.video_id,
          download_url: null,
          local_path: null,
          provider_id: 'youtube_direct',
          external_id: t.video_id,
        }))

        discoveredAlbumsWithTracks.push({
          album: {
            id: albumId,
            game_id: game.gameId,
            title: `${game.title} (Official Soundtrack)`,
            album_type: 'original_soundtrack',
            artist: 'Official Game Score',
            release_date: game.releaseYear || null,
            cover_url:
              game.coverUrl ||
              resolveAlbumCoverFallback(game.title) ||
              `https://i.ytimg.com/vi/${ytResults[0].video_id}/hqdefault.jpg`,
            track_count: ytTracks.length,
            total_duration_ms: ytTracks.reduce((acc, t) => acc + t.duration_ms, 0),
            provider_id: 'youtube',
            external_id: null,
          },
          tracks: ytTracks,
        })
      }
    }

    const canonical = aggregateAlbums(discoveredAlbumsWithTracks)
    canonical.sort((a, b) => {
      const aCurated = a.album.provider_id === 'curated' ? 25 : 0
      const bCurated = b.album.provider_id === 'curated' ? 25 : 0
      const sa =
        scoreAlbumMatchForGame(
          a.album.title,
          game.title,
          a.album.release_date,
          game.releaseYear,
        ) +
        aCurated +
        Math.min(35, a.tracks.length)
      const sb =
        scoreAlbumMatchForGame(
          b.album.title,
          game.title,
          b.album.release_date,
          game.releaseYear,
        ) +
        bCurated +
        Math.min(35, b.tracks.length)
      return sb - sa || b.tracks.length - a.tracks.length
    })

    try {
      const localFiles = await getSoundtrackLocalFiles()
      const matchingLocal = localFiles.filter((f) => f.game_id === game.gameId)
      if (matchingLocal.length > 0) {
        for (const item of canonical) {
          for (const trk of item.tracks) {
            const cleanT = trk.title.toLowerCase().replace(/[^\w]/g, '')
            const matchedLocal = matchingLocal.find((lf) => {
              const cleanL = (lf.title || lf.file_path).toLowerCase().replace(/[^\w]/g, '')
              return cleanL.includes(cleanT) || cleanT.includes(cleanL)
            })
            if (matchedLocal) {
              trk.local_path = matchedLocal.file_path
            }
          }
        }
      }
    } catch {
      // Ignore local files link error
    }

    for (const item of canonical) {
      item.album.game_id = game.gameId
      if (!item.album.cover_url) {
        item.album.cover_url =
          curated?.album.cover_url ||
          game.coverUrl ||
          resolveAlbumCoverFallback(item.album.title) ||
          resolveAlbumCoverFallback(game.title)
      }
      item.tracks = item.tracks.map((t) => ({ ...t, preview_url: null }))
    }

    const validCanonical = canonical.filter((item) => item.tracks.length > 0)
    if (validCanonical.length > 0) {
      this.memoryCache.set(cacheKey, validCanonical)
      for (const item of validCanonical) {
        saveSoundtrackAlbum(item.album, item.tracks).catch(() => undefined)
      }
      setSoundtrackCache(cacheKey, JSON.stringify(validCanonical), 86400 * 3).catch(() => undefined)
    }

    return validCanonical
  }

  /**
   * LAYER 3: Full-Length Audio Resolution & Multi-Provider Failover (Zero 30s Preview Clips)
   */
  private isPreviewClipUrl(url?: string | null): boolean {
    if (!url) return false
    const low = url.toLowerCase()
    return (
      low.includes('itunes.apple.com') ||
      low.includes('mzstatic.com') ||
      low.includes('dzcdn.net') ||
      low.includes('deezer.com')
    )
  }

  public getInstantCandidate(track: SoundtrackTrack): PlaybackSource | null {
    if (track.local_path) {
      return {
        type: 'local',
        url: track.local_path,
        providerId: 'local',
      }
    }
    const cached = this.playbackCandidateCache.get(track.id)
    if (cached && cached.length > 0 && !this.isPreviewClipUrl(cached[0].url)) {
      return cached[0]
    }
    if (
      track.stream_url &&
      /^https?:\/\//i.test(track.stream_url) &&
      !this.isPreviewClipUrl(track.stream_url)
    ) {
      return {
        type: 'stream',
        url: track.stream_url,
        providerId: track.provider_id,
      }
    }
    if (
      (track.provider_id === 'youtube' || track.provider_id === 'youtube_direct') &&
      track.external_id &&
      /^[A-Za-z0-9_-]{8,15}$/.test(track.external_id)
    ) {
      return {
        type: 'youtube',
        url: track.external_id,
        providerId: 'youtube_direct',
      }
    }
    return null
  }

  public prefetchTrack(track: SoundtrackTrack, game?: GameIdentity): Promise<PlaybackSource[]> {
    if (!track || !track.id) return Promise.resolve([])
    const existing = this.playbackCandidateCache.get(track.id)
    if (existing && existing.length > 0 && !this.isPreviewClipUrl(existing[0].url)) {
      return Promise.resolve(existing)
    }
    return this.resolvePlaybackCandidates(track, game).catch(() => [])
  }

  public async resolvePlaybackCandidates(
    track: SoundtrackTrack,
    game?: GameIdentity,
  ): Promise<PlaybackSource[]> {
    const cachedList = this.playbackCandidateCache.get(track.id)
    if (cachedList && cachedList.length > 0 && !this.isPreviewClipUrl(cachedList[0].url)) {
      return cachedList
    }

    if (track.local_path) {
      const localList: PlaybackSource[] = [
        {
          type: 'local',
          url: track.local_path,
          providerId: 'local',
        },
      ]
      this.playbackCandidateCache.set(track.id, localList)
      return localList
    }

    if (
      track.stream_url &&
      /^https?:\/\//i.test(track.stream_url) &&
      !this.isPreviewClipUrl(track.stream_url)
    ) {
      const fastList: PlaybackSource[] = [
        {
          type: 'stream',
          url: track.stream_url,
          providerId: track.provider_id,
        },
      ]
      this.playbackCandidateCache.set(track.id, fastList)
      return fastList
    }

    const inFlight = this.inFlightCandidates.get(track.id)
    if (inFlight) {
      return inFlight
    }

    const resolutionPromise = this.performCandidateResolution(track, game)
    this.inFlightCandidates.set(track.id, resolutionPromise)
    try {
      const result = await resolutionPromise
      if (result.length > 0) {
        this.playbackCandidateCache.set(track.id, result)
        const bestStream = result.find(
          (c) => c.type === 'stream' && c.url && !this.isPreviewClipUrl(c.url),
        )
        if (bestStream) {
          track.stream_url = bestStream.url
        }
      }
      return result
    } finally {
      this.inFlightCandidates.delete(track.id)
    }
  }

  private async performCandidateResolution(
    track: SoundtrackTrack,
    game?: GameIdentity,
  ): Promise<PlaybackSource[]> {
    const candidates: PlaybackSource[] = []
    const seenUrls = new Set<string>()

    const pushCandidate = (src: PlaybackSource | null | undefined) => {
      if (!src || !src.url) return
      if (this.isPreviewClipUrl(src.url)) return
      if (
        src.type === 'stream' &&
        !src.url.startsWith('http://') &&
        !src.url.startsWith('https://') &&
        !src.url.startsWith('asset://') &&
        !src.url.startsWith('blob:')
      ) {
        return
      }
      const key = `${src.type}:${src.url}`
      if (!seenUrls.has(key)) {
        seenUrls.add(key)
        candidates.push(src)
      }
    }

    const khProvider = providerRegistry.getProvider('khinsider')
    const archiveProvider = providerRegistry.getProvider('archive')
    const audiusProvider = providerRegistry.getProvider('audius')
    const pipedProvider = providerRegistry.getProvider('invidious')
    const ytProvider = providerRegistry.getProvider('youtube_direct')

    const streamPromises: Array<Promise<PlaybackSource | null>> = [
      khProvider
        ? withTimeout(khProvider.getPlaybackSource(track, game), 4800, null).then((s) =>
            s?.url ? { ...s, providerId: 'khinsider' } : null,
          )
        : Promise.resolve(null),
      archiveProvider
        ? withTimeout(archiveProvider.getPlaybackSource(track, game), 3800, null).then((s) =>
            s?.url ? { ...s, providerId: 'archive' } : null,
          )
        : Promise.resolve(null),
      audiusProvider
        ? withTimeout(audiusProvider.getPlaybackSource(track, game), 3600, null).then((s) =>
            s?.url ? { ...s, providerId: 'audius' } : null,
          )
        : Promise.resolve(null),
      pipedProvider
        ? withTimeout(pipedProvider.getPlaybackSource(track, game), 4000, null).then((s) =>
            s?.url ? { ...s, providerId: s.type === 'youtube' ? 'youtube' : 'invidious' } : null,
          )
        : Promise.resolve(null),
    ]

    const ytCandidatesPromise: Promise<PlaybackSource[]> = ytProvider
      ? withTimeout(
          'getCandidateSources' in ytProvider &&
            typeof (ytProvider as { getCandidateSources?: unknown }).getCandidateSources ===
              'function'
            ? (
                ytProvider as unknown as {
                  getCandidateSources: (
                    t: SoundtrackTrack,
                    g?: GameIdentity,
                  ) => Promise<PlaybackSource[]>
                }
              ).getCandidateSources(track, game)
            : ytProvider.getPlaybackSource(track, game).then((s) => (s ? [s] : [])),
          5200,
          [],
        )
      : Promise.resolve([])

    const ytFirstDirectStreamPromise: Promise<PlaybackSource | null> = ytCandidatesPromise.then(
      (list) =>
        list.find((s) => s.type === 'stream' && s.url && !this.isPreviewClipUrl(s.url)) || null,
    )
    const allDirectStreamPromises = [...streamPromises, ytFirstDirectStreamPromise]

    const firstFullStreamRace = new Promise<PlaybackSource | null>((resolve) => {
      let pending = allDirectStreamPromises.length
      if (pending === 0) {
        resolve(null)
        return
      }
      let settled = false
      for (const p of allDirectStreamPromises) {
        p.then((res) => {
          if (
            !settled &&
            res &&
            res.url &&
            res.type === 'stream' &&
            !this.isPreviewClipUrl(res.url)
          ) {
            settled = true
            resolve(res)
          } else {
            pending -= 1
            if (pending === 0 && !settled) {
              settled = true
              resolve(null)
            }
          }
        }).catch(() => {
          pending -= 1
          if (pending === 0 && !settled) {
            settled = true
            resolve(null)
          }
        })
      }
    })

    const fastFullStream = await withTimeout(firstFullStreamRace, 3600, null)
    if (fastFullStream) {
      pushCandidate(fastFullStream)
    }

    if (candidates.length === 0) {
      const [allStreams, ytSources] = await Promise.all([
        Promise.all(streamPromises),
        ytCandidatesPromise,
      ])

      for (const s of allStreams) {
        if (s && s.url && s.type === 'stream' && !this.isPreviewClipUrl(s.url)) {
          pushCandidate(s)
        }
      }
      for (const ys of ytSources) {
        if (ys && ys.url && ys.type === 'stream' && !this.isPreviewClipUrl(ys.url)) {
          pushCandidate(ys)
        }
      }

      if (
        (track.provider_id === 'youtube' || track.provider_id === 'youtube_direct') &&
        track.external_id &&
        /^[A-Za-z0-9_-]{8,15}$/.test(track.external_id)
      ) {
        pushCandidate({
          type: 'youtube',
          url: track.external_id,
          providerId: 'youtube_direct',
        })
      }
      for (const ys of ytSources) {
        if (ys && ys.url) {
          pushCandidate(ys)
        }
      }
      for (const s of allStreams) {
        if (s && s.url && s.type === 'youtube') {
          pushCandidate(s)
        }
      }
    } else {
      void Promise.all([Promise.all(streamPromises), ytCandidatesPromise]).then(
        ([allStreams, ytSources]) => {
          const enriched: PlaybackSource[] = [fastFullStream!]
          for (const s of allStreams) {
            if (
              s &&
              s.url &&
              s.type === 'stream' &&
              !this.isPreviewClipUrl(s.url) &&
              s.url !== fastFullStream!.url
            ) {
              enriched.push(s)
            }
          }
          for (const ys of ytSources) {
            if (ys && ys.url && !this.isPreviewClipUrl(ys.url)) {
              enriched.push(ys)
            }
          }
          this.playbackCandidateCache.set(track.id, enriched)
        },
      )
    }

    if (candidates.length === 0) {
      const cleanGame = extractCoreGameTitle(game?.title || '')
      const cleanTrack = track.title.replace(/^\d+[\s.\-_]+/, '').trim()
      const fallbackQuery = cleanGame
        ? `${cleanGame} "${cleanTrack}" Official Video Game Soundtrack OST`
        : `${cleanTrack} ${track.artist || ''} Official Soundtrack OST`.trim()
      const ytFallback = await withTimeout(
        soundtrackSearchYouTube(fallbackQuery, 4),
        4500,
        [],
      )
      for (const r of ytFallback) {
        if (r.direct_audio_url && r.direct_audio_url.startsWith('http')) {
          pushCandidate({
            type: 'stream',
            url: r.direct_audio_url,
            providerId: 'youtube_direct',
          })
        }
        if (r.video_id) {
          pushCandidate({
            type: 'youtube',
            url: r.video_id,
            providerId: 'youtube_direct',
          })
        }
      }
    }

    return candidates
  }

  public async resolvePlaybackSource(
    track: SoundtrackTrack,
    game?: GameIdentity,
  ): Promise<PlaybackSource | null> {
    const list = await this.resolvePlaybackCandidates(track, game)
    return list[0] || null
  }

  public async resolveDownloadSource(track: SoundtrackTrack): Promise<DownloadSource | null> {
    if (track.download_url && !this.isPreviewClipUrl(track.download_url)) {
      const ext = track.download_url.split('.').pop()?.split('?')[0] || 'mp3'
      return {
        url: track.download_url,
        format: ext,
        filename: `${track.title}.${ext}`,
        providerId: track.provider_id,
      }
    }

    const candidates = await this.resolvePlaybackCandidates(track)
    const streamCandidate = candidates.find(
      (c) => c.type === 'stream' && c.url.startsWith('http') && !this.isPreviewClipUrl(c.url),
    )
    if (streamCandidate) {
      const ext = streamCandidate.format || 'mp3'
      return {
        url: streamCandidate.url,
        format: ext,
        filename: `${track.title}.${ext}`,
        providerId: streamCandidate.providerId || 'stream',
      }
    }

    return null
  }
}

export const soundtrackResolver = new SoundtrackResolver()
