import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { KHInsiderProvider } from './khinsider-provider'
import type { SoundtrackTrack } from '../../types'

describe('KHInsiderProvider', () => {
  let provider: KHInsiderProvider

  beforeEach(() => {
    provider = new KHInsiderProvider()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('has correct provider metadata and capabilities', () => {
    expect(provider.id).toBe('khinsider')
    expect(provider.name).toBe('KHInsider (VGM)')
    expect(provider.priority).toBe(20)
    expect(provider.capabilities.metadata).toBe(true)
    expect(provider.capabilities.artwork).toBe(true)
    expect(provider.capabilities.streaming).toBe(true)
    expect(provider.capabilities.downloading).toBe(true)
  })

  it('parses album list from search HTML correctly', async () => {
    const mockHtml = `
      <div id="pageContent">
        <a href="/game-soundtracks/album/cyberpunk-2077-original-score-ep">Cyberpunk 2077 Original Score EP</a>
        <a href="/game-soundtracks/album/the-witcher-3-wild-hunt">The Witcher 3: Wild Hunt</a>
      </div>
    `

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      text: async () => mockHtml,
    } as Response)

    const albums = await provider.getAlbums({ gameId: 'g1', title: 'Cyberpunk 2077' })

    expect(albums.length).toBe(2)
    expect(albums[0].title).toBe('Cyberpunk 2077 Original Score EP')
    expect(albums[0].id).toBe('kh_cyberpunk-2077-original-score-ep')
    expect(albums[0].provider_id).toBe('khinsider')
  })

  it('parses album details, tracklist, and high-res cover art', async () => {
    const mockAlbumHtml = `
      <h2>Cyberpunk 2077 Original Score EP</h2>
      <img src="https://jetta.vgmtreasurechest.com/soundtracks/cyberpunk-2077/thumbs/00%20Front.jpg" />
      <table id="songlist">
        <tr id="songlist_header"><th>#</th><th>Song Name</th><th>MP3</th></tr>
        <tr>
          <td align="right">1.</td>
          <td class="clickable-row"><a href="/game-soundtracks/album/cyberpunk-2077/01.mp3">Corposeduction</a></td>
          <td class="clickable-row" align="right"><a>4:27</a></td>
        </tr>
        <tr>
          <td align="right">2.</td>
          <td class="clickable-row"><a href="/game-soundtracks/album/cyberpunk-2077/02.mp3">Badlanders</a></td>
          <td class="clickable-row" align="right"><a>2:04</a></td>
        </tr>
      </table>
    `

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      text: async () => mockAlbumHtml,
    } as Response)

    const result = await provider.getAlbum(
      'kh_cyberpunk-2077',
      '/game-soundtracks/album/cyberpunk-2077',
    )

    expect(result).not.toBeNull()
    expect(result!.album.title).toBe('Cyberpunk 2077 Original Score EP')
    // Cover should replace /thumbs/ with / for full resolution
    expect(result!.album.cover_url).toBe(
      'https://jetta.vgmtreasurechest.com/soundtracks/cyberpunk-2077/00%20Front.jpg',
    )
    expect(result!.tracks.length).toBe(2)
    expect(result!.tracks[0].title).toBe('Corposeduction')
    expect(result!.tracks[0].duration_ms).toBe((4 * 60 + 27) * 1000)
    expect(result!.tracks[1].title).toBe('Badlanders')
    expect(result!.tracks[1].duration_ms).toBe((2 * 60 + 4) * 1000)
  })

  it('resolves direct audio stream and download link from song page', async () => {
    const mockSongHtml = `
      <div id="pageContent">
        <audio id="audio" controls preload="auto" src="https://jetta.vgmtreasurechest.com/soundtracks/cyberpunk/01.mp3"></audio>
      </div>
    `

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      text: async () => mockSongHtml,
    } as Response)

    const track: SoundtrackTrack = {
      id: 'kh_trk_1',
      album_id: 'kh_1',
      disc_number: 1,
      track_number: 1,
      title: 'Corposeduction',
      artist: 'VGM',
      duration_ms: 267000,
      preview_url: null,
      stream_url: null,
      download_url: null,
      local_path: null,
      provider_id: 'khinsider',
      external_id: '/game-soundtracks/album/cyberpunk/01.mp3',
    }

    const playback = await provider.getPlaybackSource(track)
    expect(playback).not.toBeNull()
    expect(playback!.type).toBe('stream')
    expect(playback!.url).toBe('https://jetta.vgmtreasurechest.com/soundtracks/cyberpunk/01.mp3')
    expect(playback!.format).toBe('mp3')

    // Download source should reuse the direct link
    const download = await provider.getDownloadSource(track)
    expect(download).not.toBeNull()
    expect(download!.url).toBe('https://jetta.vgmtreasurechest.com/soundtracks/cyberpunk/01.mp3')
    expect(download!.filename).toBe('Corposeduction.mp3')
  })
})
