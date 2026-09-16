import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { AudiusProvider } from './audius-provider'
import { YouTubeDirectProvider } from './youtube-direct-provider'
import type { SoundtrackTrack } from '../../types'
import * as tauriSoundtrack from '../tauri-soundtrack'

describe('AudiusProvider', () => {
  let provider: AudiusProvider

  beforeEach(() => {
    provider = new AudiusProvider()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('has correct metadata and capabilities', () => {
    expect(provider.id).toBe('audius')
    expect(provider.name).toBe('Audius Open Audio')
    expect(provider.capabilities.streaming).toBe(true)
    expect(provider.capabilities.downloading).toBe(false)
  })

  it('resolves track playback to direct 320kbps MP3 stream URL', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          {
            id: 'audius_track_123',
            title: 'Geralt of Rivia (Orchestral)',
            duration: 180,
            user: { name: 'Composer' },
          },
        ],
      }),
    } as Response)

    const track: SoundtrackTrack = {
      id: 't1',
      album_id: 'a1',
      disc_number: 1,
      track_number: 1,
      title: 'Geralt of Rivia',
      artist: 'Marcin Przybyłowicz',
      duration_ms: 180000,
      preview_url: null,
      stream_url: null,
      download_url: null,
      local_path: null,
      provider_id: 'archive',
      external_id: null,
    }

    const source = await provider.getPlaybackSource(track, {
      gameId: 'g1',
      title: 'The Witcher 3',
    })

    expect(source).not.toBeNull()
    expect(source?.type).toBe('stream')
    expect(source?.url).toBe(
      'https://discoveryprovider.audius.co/v1/tracks/audius_track_123/stream?app_name=nexus_launcher',
    )
    expect(source?.bitrate).toBe(320)
    expect(source?.providerId).toBe('audius')
  })
})

describe('YouTubeDirectProvider', () => {
  let provider: YouTubeDirectProvider

  beforeEach(() => {
    provider = new YouTubeDirectProvider()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('has correct metadata and capabilities', () => {
    expect(provider.id).toBe('youtube_direct')
    expect(provider.capabilities.streaming).toBe(true)
  })

  it('resolves playback source using native search command', async () => {
    vi.spyOn(tauriSoundtrack, 'soundtrackSearchYouTube').mockResolvedValueOnce([
      {
        video_id: 'abc123vid',
        title: 'Cyberpunk 2077 - The Rebel Path',
        channel: 'OST Station',
        duration_seconds: 240,
      },
    ])

    const track: SoundtrackTrack = {
      id: 't2',
      album_id: 'a2',
      disc_number: 1,
      track_number: 1,
      title: 'The Rebel Path',
      artist: 'P.T. Adamczyk',
      duration_ms: 240000,
      preview_url: null,
      stream_url: null,
      download_url: null,
      local_path: null,
      provider_id: 'archive',
      external_id: null,
    }

    const source = await provider.getPlaybackSource(track, {
      gameId: 'g2',
      title: 'Cyberpunk 2077',
    })

    expect(source).not.toBeNull()
    expect(source?.type).toBe('youtube')
    expect(source?.url).toBe('abc123vid')
    expect(source?.providerId).toBe('youtube_direct')
  })
})
