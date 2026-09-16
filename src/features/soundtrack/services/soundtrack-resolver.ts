import type {
  DownloadSource,
  GameIdentity,
  PlaybackSource,
  SoundtrackAlbumWithTracks,
  SoundtrackTrack,
} from '../types'
import { providerRegistry } from './provider-registry'
import { aggregateAlbums } from './tracklist-aggregator'
import {
  getSoundtrackCache,
  getSoundtrackLocalFiles,
  resolveGameSoundtracks,
  saveSoundtrackAlbum,
  setSoundtrackCache,
  soundtrackSearchYouTube,
} from './tauri-soundtrack'

export class SoundtrackResolver {
  private memoryCache: Map<string, SoundtrackAlbumWithTracks[]> = new Map()

  /**
   * 3-Layer Soundtrack Resolution:
   * Layer 1: METADATA Discovery & Tracklist Aggregation
   * Layer 2: ARTWORK Pipeline & High-Res Cover Art Enhancement
   * Layer 3: AUDIO Resolution with multi-provider failover
   */
  public async resolveGame(
    game: GameIdentity,
    forceRefresh = false,
  ): Promise<SoundtrackAlbumWithTracks[]> {
    const cacheKey = `game_ost_${game.gameId}`

    // 1. Memory Cache (only if has tracks)
    if (!forceRefresh && this.memoryCache.has(cacheKey)) {
      const mem = this.memoryCache.get(cacheKey)!
      if (mem.length > 0 && mem.some((a) => a.tracks.length > 0)) {
        return mem
      }
    }

    // 2. Database Resolution (offline-first, only if has tracks)
    if (!forceRefresh) {
      try {
        const saved = await resolveGameSoundtracks(game.gameId)
        if (saved && saved.length > 0 && saved.some((a) => a.tracks.length > 0)) {
          this.memoryCache.set(cacheKey, saved)
          return saved
        }
      } catch {
        // Fallthrough to external providers
      }
    }

    // 3. SQLite Cache check (only if has tracks)
    if (!forceRefresh) {
      try {
        const cachedJson = await getSoundtrackCache(cacheKey)
        if (cachedJson) {
          const parsed = JSON.parse(cachedJson) as SoundtrackAlbumWithTracks[]
          if (
            Array.isArray(parsed) &&
            parsed.length > 0 &&
            parsed.some((a) => a.tracks.length > 0)
          ) {
            this.memoryCache.set(cacheKey, parsed)
            return parsed
          }
        }
      } catch {
        // Ignore cache parse error
      }
    }

    // 4. LAYER 1: Multi-Provider Metadata Discovery
    const metadataProviders = providerRegistry.getProvidersForCapability('metadata')
    const discoveredAlbumsWithTracks: SoundtrackAlbumWithTracks[] = []

    for (const provider of metadataProviders) {
      try {
        const albums = await provider.getAlbums(game)
        if (albums && albums.length > 0) {
          providerRegistry.recordSuccess(provider.id)

          for (const alb of albums.slice(0, 4)) {
            try {
              const full = await provider.getAlbum(alb.id, alb.external_id || undefined)
              if (full && full.tracks.length > 0) {
                full.album.game_id = game.gameId
                if (!full.album.cover_url && alb.cover_url) {
                  full.album.cover_url = alb.cover_url
                }
                discoveredAlbumsWithTracks.push(full)
              }
            } catch {
              // Single album lookup error, continue to next
            }
          }

          // If we found solid tracklists with audio streams (e.g. from KHInsider or Archive),
          // we have high-fidelity data and can proceed
          if (
            discoveredAlbumsWithTracks.length > 0 &&
            discoveredAlbumsWithTracks.some((a) => a.tracks.length >= 3)
          ) {
            if (discoveredAlbumsWithTracks.length >= 3) {
              break
            }
          }
        }
      } catch (err) {
        providerRegistry.recordFailure(provider.id, String(err))
      }
    }

    // Fallback: If no online album with tracks was found, query YouTube Direct Fast-Resolver!
    if (discoveredAlbumsWithTracks.length === 0 && game.title) {
      try {
        const ytResults = await soundtrackSearchYouTube(`${game.title} OST`, 15)
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
            artist: t.channel || 'Video Game Soundtrack',
            duration_ms: (t.duration_seconds || 0) * 1000,
            preview_url: null,
            stream_url: t.video_id,
            download_url: null,
            local_path: null,
            provider_id: 'youtube',
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
              cover_url: `https://i.ytimg.com/vi/${ytResults[0].video_id}/hqdefault.jpg`,
              track_count: ytTracks.length,
              total_duration_ms: ytTracks.reduce((acc, t) => acc + t.duration_ms, 0),
              provider_id: 'youtube',
              external_id: null,
            },
            tracks: ytTracks,
          })
        }
      } catch {
        // Ignore youtube search fallback error
      }
    }

    // 5. Tracklist Aggregation & Reconciliation
    const canonical = aggregateAlbums(discoveredAlbumsWithTracks)

    // Link any local files on disk to matching canonical tracks
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

    // 6. LAYER 2: Artwork Pipeline Enhancement
    const artworkProviders = providerRegistry.getProvidersForCapability('artwork')
    for (const item of canonical) {
      item.album.game_id = game.gameId

      // If album lacks a valid web cover or has a generic one, try artwork providers
      if (!item.album.cover_url || !item.album.cover_url.startsWith('http')) {
        for (const artProvider of artworkProviders) {
          if (typeof artProvider.getArtwork === 'function') {
            try {
              const art = await artProvider.getArtwork(item.album)
              if (art && art.startsWith('http')) {
                item.album.cover_url = art
                break
              }
            } catch {
              // Ignore artwork fetch error
            }
          }
        }
      }

      // Final fallback to game identity cover if still missing
      if (!item.album.cover_url && game.coverUrl) {
        item.album.cover_url = game.coverUrl
      }
    }

    // 7. Persist to Database & Cache (only valid albums with tracks)
    const validCanonical = canonical.filter((item) => item.tracks.length > 0)
    if (validCanonical.length > 0) {
      this.memoryCache.set(cacheKey, validCanonical)

      // Async persist to SQLite
      for (const item of validCanonical) {
        saveSoundtrackAlbum(item.album, item.tracks).catch(() => undefined)
      }
      setSoundtrackCache(cacheKey, JSON.stringify(validCanonical), 86400 * 3).catch(() => undefined)
      return validCanonical
    }

    return validCanonical
  }

  /**
   * LAYER 3: Audio Resolution & Seamless Multi-Provider Failover
   * Flow: Local File -> Direct Stream -> Origin Provider -> Streaming Failover (KHInsider -> Archive -> YouTube)
   */
  public async resolvePlaybackSource(
    track: SoundtrackTrack,
    game?: GameIdentity,
  ): Promise<PlaybackSource | null> {
    // 1. Local file if present
    if (track.local_path) {
      return {
        type: 'local',
        url: track.local_path,
        providerId: 'local',
      }
    }

    // 2. Direct stream URL if already populated and valid
    if (
      track.stream_url &&
      (track.stream_url.startsWith('http://') ||
        track.stream_url.startsWith('https://') ||
        track.stream_url.startsWith('asset://') ||
        track.stream_url.startsWith('blob:'))
    ) {
      return {
        type: 'stream',
        url: track.stream_url,
        providerId: track.provider_id,
      }
    }

    // 3. Try the track's origin provider first if it has streaming capability
    if (track.provider_id) {
      const originProvider = providerRegistry.getProvider(track.provider_id)
      if (originProvider && originProvider.capabilities.streaming) {
        try {
          const source = await originProvider.getPlaybackSource(track, game)
          if (source && source.url) {
            if (
              source.type === 'stream' &&
              (source.url.startsWith('http://') ||
                source.url.startsWith('https://') ||
                source.url.startsWith('asset://') ||
                source.url.startsWith('blob:'))
            ) {
              track.stream_url = source.url
            }
            providerRegistry.recordSuccess(originProvider.id)
            return source
          }
        } catch {
          providerRegistry.recordFailure(originProvider.id, 'Failed origin playback resolution')
        }
      }
    }

    // 4. Capability Failover across all healthy streaming providers
    const { result, usedProvider } = await providerRegistry.executeWithFailover(
      'streaming',
      (provider) => provider.getPlaybackSource(track, game),
    )

    if (result && result.url) {
      if (
        result.type === 'stream' &&
        (result.url.startsWith('http://') ||
          result.url.startsWith('https://') ||
          result.url.startsWith('asset://') ||
          result.url.startsWith('blob:'))
      ) {
        track.stream_url = result.url
      }
      if (usedProvider) {
        result.providerId = usedProvider.id
      }
      return result
    }

    return null
  }

  public async resolveDownloadSource(track: SoundtrackTrack): Promise<DownloadSource | null> {
    // If track already has direct download URL
    if (track.download_url) {
      const ext = track.download_url.split('.').pop()?.split('?')[0] || 'mp3'
      return {
        url: track.download_url,
        format: ext,
        filename: `${track.title}.${ext}`,
        providerId: track.provider_id,
      }
    }

    // Try origin provider first
    if (track.provider_id) {
      const originProvider = providerRegistry.getProvider(track.provider_id)
      if (originProvider && originProvider.capabilities.downloading) {
        try {
          const source = await originProvider.getDownloadSource(track)
          if (source && source.url) {
            providerRegistry.recordSuccess(originProvider.id)
            return source
          }
        } catch {
          providerRegistry.recordFailure(originProvider.id, 'Failed origin download resolution')
        }
      }
    }

    // Capability failover across downloading providers
    const { result, usedProvider } = await providerRegistry.executeWithFailover(
      'downloading',
      (provider) => provider.getDownloadSource(track),
    )

    if (result && usedProvider) {
      result.providerId = usedProvider.id
    }

    return result
  }
}

export const soundtrackResolver = new SoundtrackResolver()
