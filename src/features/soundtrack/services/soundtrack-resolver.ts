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
  scoreAlbumMatchForGame,
} from './providers/base-provider'
import { aggregateAlbums } from './tracklist-aggregator'
import {
  clearGameSoundtracks,
  getSoundtrackCache,
  getSoundtrackLocalFiles,
  resolveGameSoundtracks,
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
  artist?: { name?: string }
  album?: {
    id?: number
    title?: string
    cover_big?: string
    cover_xl?: string
  }
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

async function fetchJsonFast<T>(url: string, timeoutMs = 3500): Promise<T | null> {
  try {
    const text = await withTimeout(soundtrackHttpGet(url), timeoutMs, '')
    if (text) {
      return JSON.parse(text) as T
    }
  } catch {
    // Fallthrough to browser fetch
  }
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const resp = await fetch(url, { signal: controller.signal })
    clearTimeout(timer)
    if (!resp.ok) return null
    return (await resp.json()) as T
  } catch {
    return null
  }
}

export class SoundtrackResolver {
  private memoryCache: Map<string, SoundtrackAlbumWithTracks[]> = new Map()
  private onlineSearchCache: Map<string, SoundtrackAlbumWithTracks[]> = new Map()
  private playbackCandidateCache: Map<string, PlaybackSource[]> = new Map()
  private inFlightCandidates: Map<string, Promise<PlaybackSource[]>> = new Map()

  /**
   * Ultra-fast single-roundtrip iTunes + Deezer Soundtrack Song & Album aggregator (~300ms).
   */
  private async fetchItunesAndDeezerAlbumsSinglePass(
    query: string,
    game?: GameIdentity,
  ): Promise<SoundtrackAlbumWithTracks[]> {
    const cleanQ = query.trim()
    if (!cleanQ) return []

    const term = encodeURIComponent(`${cleanQ} Soundtrack`)
    const itunesUrl = `https://itunes.apple.com/search?term=${term}&media=music&entity=song&limit=45`
    const deezerUrl = `https://api.deezer.com/search?q=${term}&limit=35`

    const [itunesData, deezerData] = await Promise.all([
      fetchJsonFast<{ results?: ItunesSongItem[] }>(itunesUrl, 3200),
      fetchJsonFast<{ data?: DeezerTrackItem[] }>(deezerUrl, 3200),
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
          songs: ItunesSongItem[]
        }
      >()

      for (const item of itunesItems) {
        if (!item.collectionId || !item.collectionName || !item.trackName || !item.previewUrl) {
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
            songs: [item],
          })
        }
      }

      for (const grp of grouped.values()) {
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
          duration_ms: s.trackTimeMillis || 150_000,
          preview_url: s.previewUrl || null,
          stream_url: null,
          download_url: s.previewUrl || null,
          local_path: null,
          provider_id: 'itunes',
          external_id: String(s.trackId || idx),
        }))

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
        if (!albId || !albTitle || !item.title || !item.preview) continue

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

      for (const grp of dzGrouped.values()) {
        const albumId = `deezer_alb_${grp.albumId}`
        const tracks: SoundtrackTrack[] = grp.tracks.map((s, idx) => ({
          id: `deezer_trk_${s.id || `${grp.albumId}_${idx}`}`,
          album_id: albumId,
          disc_number: 1,
          track_number: idx + 1,
          title: s.title || `Track ${idx + 1}`,
          artist: s.artist?.name || grp.artistName,
          duration_ms: (s.duration || 150) * 1000,
          preview_url: s.preview || null,
          stream_url: null,
          download_url: s.preview || null,
          local_path: null,
          provider_id: 'itunes',
          external_id: String(s.id || idx),
        }))

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
      const sa = scoreAlbumMatchForGame(a.album.title, cleanQ) + a.tracks.length * 3
      const sb = scoreAlbumMatchForGame(b.album.title, cleanQ) + b.tracks.length * 3
      return sb - sa
    })

    return out.slice(0, 6)
  }

  /**
   * Direct instant stream resolver across iTunes CDN (.m4a) and Deezer CDN (.mp3).
   */
  private async resolveDirectCdnStreamsFast(
    track: SoundtrackTrack,
    game?: GameIdentity,
  ): Promise<PlaybackSource[]> {
    const cleanGame = extractCoreGameTitle(game?.title || '')
    const cleanTrack = track.title
      .replace(/^\d+[\s.\-_]+/, '')
      .replace(/\([^)]*\)/g, ' ')
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    const artistHint = track.artist
      ? track.artist
          .split(',')[0]
          .replace(/[^\w\s]/g, ' ')
          .trim()
      : ''

    const searchQ = `${cleanGame} ${cleanTrack}`.trim() || `${artistHint} ${cleanTrack}`.trim()
    if (!searchQ) return []

    const encoded = encodeURIComponent(searchQ)
    const itunesUrl = `https://itunes.apple.com/search?term=${encoded}&media=music&entity=song&limit=8`
    const deezerUrl = `https://api.deezer.com/search?q=${encoded}&limit=8`

    const [itunesRes, deezerRes] = await Promise.all([
      fetchJsonFast<{ results?: ItunesSongItem[] }>(itunesUrl, 3200),
      fetchJsonFast<{ data?: DeezerTrackItem[] }>(deezerUrl, 3200),
    ])

    const sources: PlaybackSource[] = []
    const normTarget = cleanTrack.toLowerCase()

    const itunesSongs = (itunesRes?.results || []).filter((r) => r.previewUrl && r.trackName)
    if (itunesSongs.length > 0) {
      const best =
        itunesSongs.find((r) => {
          const nt = (r.trackName || '').toLowerCase()
          return nt.includes(normTarget) || normTarget.includes(nt)
        }) || itunesSongs[0]

      if (best?.previewUrl) {
        sources.push({
          type: 'stream',
          url: best.previewUrl,
          format: 'm4a',
          bitrate: 256,
          providerId: 'itunes',
        })
      }
    }

    const deezerSongs = (deezerRes?.data || []).filter((r) => r.preview && r.title)
    if (deezerSongs.length > 0) {
      const bestDz =
        deezerSongs.find((r) => {
          const nt = (r.title || '').toLowerCase()
          return nt.includes(normTarget) || normTarget.includes(nt)
        }) || deezerSongs[0]

      if (bestDz?.preview) {
        sources.push({
          type: 'stream',
          url: bestDz.preview,
          format: 'mp3',
          bitrate: 128,
          providerId: 'deezer',
        })
      }
    }

    return sources
  }

  /**
   * Instant + Parallel Live Online Soundtrack Search (< 800ms) for the Soundtrack Center search bar
   * and live dynamic shelves.
   */
  public async searchOnlineSoundtracksFast(
    rawQuery: string,
    bypassCache = false,
  ): Promise<SoundtrackAlbumWithTracks[]> {
    const q = rawQuery.trim()
    if (q.length < 2) return []

    const normKey = q.toLowerCase()
    if (!bypassCache && this.onlineSearchCache.has(normKey)) {
      return this.onlineSearchCache.get(normKey)!
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

    // 1. Instant Curated Match (0ms)
    const directCurated = lookupCuratedSoundtrack({
      gameId: `custom_${normKey.replace(/[^a-z0-9]+/g, '_')}`,
      title: q,
    })
    if (directCurated) {
      pushUnique(directCurated)
    }

    for (const c of getAllCuratedSoundtracks()) {
      if (
        c.album.title.toLowerCase().includes(normKey) ||
        c.album.artist?.toLowerCase().includes(normKey) ||
        c.tracks.some((t) => t.title.toLowerCase().includes(normKey))
      ) {
        pushUnique(c)
      }
    }

    // 2. Fire iTunes + Deezer Single-Pass Song/Album Search via Rust HTTP client!
    const cdnAlbums = await this.fetchItunesAndDeezerAlbumsSinglePass(q)
    for (const alb of cdnAlbums) {
      pushUnique(alb)
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
   * Live Online Radio Wave Fetcher:
   * Queries online soundtrack providers in parallel for rotating game soundtrack seeds,
   * returning fresh online albums and a randomized wave of playable tracks so Mood Radios
   * are always live, online, and never repeat the same static song list.
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
        withTimeout(this.fetchItunesAndDeezerAlbumsSinglePass(seed), 3500, []),
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
        const enrichedAlbum: SoundtrackAlbum = {
          ...item.album,
          cover_url:
            item.album.cover_url ||
            resolveAlbumCoverFallback(item.album.title) ||
            resolveAlbumCoverFallback(seedName),
        }
        const enrichedFull: SoundtrackAlbumWithTracks = {
          album: enrichedAlbum,
          tracks: item.tracks.map((t) => ({ ...t, album_id: enrichedAlbum.id })),
        }
        if (!seenAlbumIds.has(enrichedAlbum.id)) {
          seenAlbumIds.add(enrichedAlbum.id)
          discoveredAlbums.push(enrichedFull)
          saveSoundtrackAlbum(enrichedFull.album, enrichedFull.tracks).catch(() => undefined)
        }

        // Pick randomized tracks from this online album
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

    // Shuffle the combined live online track pool
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
   * 3-Layer Soundtrack Resolution with Fast Parallel Discovery
   */
  public async resolveGame(
    game: GameIdentity,
    forceRefresh = false,
  ): Promise<SoundtrackAlbumWithTracks[]> {
    const coreTitle = extractCoreGameTitle(game.title)
    const cacheKey = `game_ost_v6_${game.gameId}_${coreTitle.toLowerCase().replace(/\s+/g, '_')}`

    if (forceRefresh) {
      this.memoryCache.delete(cacheKey)
      await clearGameSoundtracks(game.gameId).catch(() => undefined)
    }

    if (!forceRefresh && this.memoryCache.has(cacheKey)) {
      const mem = this.memoryCache.get(cacheKey)!
      const verifiedMem = mem.filter(
        (a) => a.tracks.length > 0 && isAlbumValidForGame(a.album.title, game.title),
      )
      if (verifiedMem.length > 0) {
        return verifiedMem
      }
    }

    const curated = lookupCuratedSoundtrack(game)
    if (curated && !forceRefresh) {
      this.memoryCache.set(cacheKey, [curated])
      saveSoundtrackAlbum(curated.album, curated.tracks).catch(() => undefined)
      return [curated]
    }

    if (!forceRefresh) {
      try {
        const saved = await resolveGameSoundtracks(game.gameId)
        if (saved && saved.length > 0) {
          const verifiedSaved = saved.filter(
            (a) =>
              a.tracks.length > 0 &&
              isAlbumValidForGame(a.album.title, game.title) &&
              a.tracks.some(
                (t) =>
                  t.local_path ||
                  (t.stream_url && !this.isPreviewClipUrl(t.stream_url)) ||
                  (t.external_id && t.external_id.startsWith('/game-soundtracks/')) ||
                  t.provider_id === 'khinsider' ||
                  t.provider_id === 'youtube_direct',
              ),
          )
          if (verifiedSaved.length > 0) {
            this.memoryCache.set(cacheKey, verifiedSaved)
            return verifiedSaved
          }
        }
      } catch {
        // Fallthrough
      }
    }

    if (!forceRefresh) {
      try {
        const cachedJson = await getSoundtrackCache(cacheKey)
        if (cachedJson) {
          const parsed = JSON.parse(cachedJson) as SoundtrackAlbumWithTracks[]
          if (Array.isArray(parsed)) {
            const verifiedCached = parsed.filter(
              (a) =>
                a.tracks && a.tracks.length > 0 && isAlbumValidForGame(a.album.title, game.title),
            )
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

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return discoveredAlbumsWithTracks
    }

    const searchTarget = coreTitle || game.title
    const khinsiderProvider = providerRegistry.getProvider('khinsider')

    const khinsiderTask = (async (): Promise<SoundtrackAlbumWithTracks[]> => {
      if (!khinsiderProvider) return []
      try {
        const albums = await withTimeout(khinsiderProvider.getAlbums(game), 3500, [])
        const top = albums
          .map((alb) => ({ alb, score: scoreAlbumMatchForGame(alb.title, game.title) }))
          .filter((x) => x.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 2)

        const fetched = await Promise.all(
          top.map(({ alb }) =>
            withTimeout(
              khinsiderProvider.getAlbum(alb.id, alb.external_id || undefined),
              3500,
              null,
            ),
          ),
        )
        return fetched.filter(
          (f): f is SoundtrackAlbumWithTracks =>
            Boolean(f && f.tracks.length > 0 && isAlbumValidForGame(f.album.title, game.title)),
        )
      } catch {
        return []
      }
    })()

    const [cdnAlbums, khAlbums] = await Promise.all([
      this.fetchItunesAndDeezerAlbumsSinglePass(searchTarget, game),
      khinsiderTask,
    ])

    for (const alb of khAlbums) {
      alb.album.game_id = game.gameId
      discoveredAlbumsWithTracks.push(alb)
    }
    for (const alb of cdnAlbums) {
      if (isAlbumValidForGame(alb.album.title, game.title) || discoveredAlbumsWithTracks.length === 0) {
        alb.album.game_id = game.gameId
        discoveredAlbumsWithTracks.push(alb)
      }
    }

    // Fallback to YouTube metadata only if nothing else found
    if (discoveredAlbumsWithTracks.length === 0 && searchTarget) {
      const ytResults = await withTimeout(
        soundtrackSearchYouTube(`${searchTarget} Official Soundtrack OST`, 14),
        2500,
        [],
      )
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
          artist: t.channel || `${game.title} Soundtrack`,
          duration_ms: (t.duration_seconds || 0) * 1000,
          preview_url: null,
          stream_url: null,
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
            artist: 'Official Score',
            release_date: game.releaseYear || null,
            cover_url:
              game.coverUrl || `https://i.ytimg.com/vi/${ytResults[0].video_id}/hqdefault.jpg`,
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
      const sa = scoreAlbumMatchForGame(a.album.title, game.title) + aCurated
      const sb = scoreAlbumMatchForGame(b.album.title, game.title) + bCurated
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
      if (!item.album.cover_url && game.coverUrl) {
        item.album.cover_url = game.coverUrl
      }
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
   * LAYER 3: Audio Resolution & Seamless Multi-Provider Failover
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
    if (track.stream_url && !this.isPreviewClipUrl(track.stream_url)) {
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
    // 0. Instant cache hit (only if primary candidate is a full-length source, not a 30s preview clip)
    const cachedList = this.playbackCandidateCache.get(track.id)
    if (cachedList && cachedList.length > 0 && !this.isPreviewClipUrl(cachedList[0].url)) {
      return cachedList
    }

    // 1. Instant local file hit (0ms)
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

    // 2. Instant already-resolved full-length stream URL hit (0ms)
    if (track.stream_url && !this.isPreviewClipUrl(track.stream_url)) {
      const fastList: PlaybackSource[] = [
        {
          type: 'stream',
          url: track.stream_url,
          providerId: track.provider_id,
        },
      ]
      if (track.preview_url) {
        fastList.push({
          type: 'stream',
          url: track.preview_url,
          providerId: track.provider_id,
        })
      }
      this.playbackCandidateCache.set(track.id, fastList)
      return fastList
    }

    // 3. Deduplicate in-flight resolution for the same track
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

    // Launch all full-length stream providers + YouTube full-track resolver concurrently!
    const streamPromises: Array<Promise<PlaybackSource | null>> = [
      khProvider
        ? withTimeout(khProvider.getPlaybackSource(track, game), 3800, null).then((s) =>
            s?.url ? { ...s, providerId: 'khinsider' } : null,
          )
        : Promise.resolve(null),
      archiveProvider
        ? withTimeout(archiveProvider.getPlaybackSource(track, game), 3200, null).then((s) =>
            s?.url ? { ...s, providerId: 'archive' } : null,
          )
        : Promise.resolve(null),
      audiusProvider
        ? withTimeout(audiusProvider.getPlaybackSource(track, game), 3000, null).then((s) =>
            s?.url ? { ...s, providerId: 'audius' } : null,
          )
        : Promise.resolve(null),
      pipedProvider
        ? withTimeout(pipedProvider.getPlaybackSource(track, game), 3200, null).then((s) =>
            s?.url ? { ...s, providerId: s.type === 'youtube' ? 'youtube' : 'invidious' } : null,
          )
        : Promise.resolve(null),
    ]

    const ytCandidatesPromise: Promise<PlaybackSource[]> = ytProvider
      ? withTimeout(
          'getCandidateSources' in ytProvider &&
            typeof (ytProvider as { getCandidateSources?: unknown }).getCandidateSources === 'function'
            ? (
                ytProvider as unknown as {
                  getCandidateSources: (
                    t: SoundtrackTrack,
                    g?: GameIdentity,
                  ) => Promise<PlaybackSource[]>
                }
              ).getCandidateSources(track, game)
            : ytProvider.getPlaybackSource(track, game).then((s) => (s ? [s] : [])),
          2800,
          [],
        )
      : Promise.resolve([])

    const ytFirstDirectStreamPromise: Promise<PlaybackSource | null> = ytCandidatesPromise.then(
      (list) => list.find((s) => s.type === 'stream' && s.url && !this.isPreviewClipUrl(s.url)) || null,
    )
    const allDirectStreamPromises = [...streamPromises, ytFirstDirectStreamPromise]

    // Race for the FIRST direct full-length HTTP stream (KHInsider MP3, YouTube InnerTube direct audio, Archive, Audius, Piped)
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

    // Wait up to 2400ms for a direct full-length HTTP audio stream winner
    const fastFullStream = await withTimeout(firstFullStreamRace, 2400, null)
    if (fastFullStream) {
      pushCandidate(fastFullStream)
    }

    if (candidates.length === 0) {
      // Wait for all full-length providers and YouTube search to complete
      const [allStreams, ytSources] = await Promise.all([
        Promise.all(streamPromises),
        ytCandidatesPromise,
      ])

      // 1. Direct full-length HTTP streams first (KHInsider, YouTube InnerTube direct audio, Archive, Audius, Piped)
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

      // 2. Full-length YouTube OST track playback second (multiple fallback video IDs in case one is embed-restricted)
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
      // Even when a fast direct stream won, attach full-length YouTube and remaining streams in background
      void Promise.all([Promise.all(streamPromises), ytCandidatesPromise]).then(([allStreams, ytSources]) => {
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
          if (ys && ys.url) {
            enriched.push(ys)
          }
        }
        if (track.preview_url) {
          enriched.push({
            type: 'stream',
            url: track.preview_url,
            providerId: track.provider_id,
          })
        }
        this.playbackCandidateCache.set(track.id, enriched)
      })
    }

    // 3. Last-resort fallback ONLY if all full-length HTTP streams and YouTube full tracks fail: 30s CDN preview
    if (track.preview_url) {
      pushCandidate({
        type: 'stream',
        url: track.preview_url,
        providerId: track.provider_id,
      })
    } else if (candidates.length === 0) {
      const cdnFallbacks = await this.resolveDirectCdnStreamsFast(track, game)
      for (const cdnSrc of cdnFallbacks) {
        pushCandidate(cdnSrc)
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
    if (track.download_url) {
      const ext = track.download_url.split('.').pop()?.split('?')[0] || 'mp3'
      return {
        url: track.download_url,
        format: ext,
        filename: `${track.title}.${ext}`,
        providerId: track.provider_id,
      }
    }

    const candidates = await this.resolvePlaybackCandidates(track)
    const streamCandidate = candidates.find((c) => c.type === 'stream' && c.url.startsWith('http'))
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
