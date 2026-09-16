import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { soundtrackResolver } from './soundtrack-resolver'
import { assetUrl } from '@/lib/asset-url'
import * as tauriSoundtrack from './tauri-soundtrack'
import { providerRegistry } from './provider-registry'

describe('assetUrl', () => {
  it('returns null for null or undefined path', () => {
    expect(assetUrl(null)).toBeNull()
    expect(assetUrl(undefined)).toBeNull()
  })

  it('passes through http and https URLs unchanged', () => {
    expect(assetUrl('https://archive.org/services/img/test')).toBe(
      'https://archive.org/services/img/test',
    )
    expect(assetUrl('http://vgmtreasurechest.com/soundtracks/cover.jpg')).toBe(
      'http://vgmtreasurechest.com/soundtracks/cover.jpg',
    )
  })

  it('passes through blob, asset, and data URLs unchanged', () => {
    expect(assetUrl('blob:http://localhost:1420/abc')).toBe('blob:http://localhost:1420/abc')
    expect(assetUrl('asset://localhost/xyz')).toBe('asset://localhost/xyz')
    expect(assetUrl('data:image/png;base64,123')).toBe('data:image/png;base64,123')
  })

  it('converts local windows paths using convertFileSrc', () => {
    const res = assetUrl('C:\\Users\\Amin\\AppData\\artwork\\cover.jpg')
    expect(res).toBeTruthy()
    expect(res).not.toContain('C:\\')
  })
})

describe('SoundtrackResolver', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('ignores cached 0-track albums and resolves online', async () => {
    // Mock getSoundtrackCache returning a 0-track album
    vi.spyOn(tauriSoundtrack, 'getSoundtrackCache').mockResolvedValueOnce(
      JSON.stringify([
        {
          album: {
            id: 'empty_alb',
            title: 'Empty Album',
            track_count: 0,
            cover_url: null,
          },
          tracks: [],
        },
      ]),
    )

    // Mock resolveGameSoundtracks returning empty
    vi.spyOn(tauriSoundtrack, 'resolveGameSoundtracks').mockResolvedValueOnce([])

    // Mock YouTube fallback search
    vi.spyOn(tauriSoundtrack, 'soundtrackSearchYouTube').mockResolvedValueOnce([
      {
        video_id: 'vid123',
        title: 'Main Theme OST',
        channel: 'Composer',
        duration_seconds: 195,
      },
    ])

    // Mock local files
    vi.spyOn(tauriSoundtrack, 'getSoundtrackLocalFiles').mockResolvedValueOnce([])
    vi.spyOn(tauriSoundtrack, 'saveSoundtrackAlbum').mockResolvedValue(undefined)
    vi.spyOn(tauriSoundtrack, 'setSoundtrackCache').mockResolvedValue(undefined)

    // Disable all metadata providers so it triggers fallback cleanly
    for (const p of providerRegistry.getAllProviders()) {
      providerRegistry.setProviderEnabled(p.id, false)
    }

    const albums = await soundtrackResolver.resolveGame(
      { gameId: 'g_test_1', title: 'Sayonara Wild Hearts' },
      true,
    )

    // Re-enable providers
    for (const p of providerRegistry.getAllProviders()) {
      providerRegistry.setProviderEnabled(p.id, true)
    }

    expect(albums.length).toBe(1)
    expect(albums[0].tracks.length).toBe(1)
    expect(albums[0].tracks[0].title).toBe('Main Theme')
    expect(albums[0].tracks[0].stream_url).toBe('vid123')
    expect(albums[0].album.cover_url).toBe('https://i.ytimg.com/vi/vid123/hqdefault.jpg')
  })
})
