import type {
  DownloadSource,
  GameIdentity,
  PlaybackSource,
  ProviderCapabilities,
  SoundtrackAlbum,
  SoundtrackAlbumWithTracks,
  SoundtrackMatch,
  SoundtrackProvider,
  SoundtrackTrack,
} from '../../types'
import { soundtrackHttpGet } from '../tauri-soundtrack'

export abstract class BaseSoundtrackProvider implements SoundtrackProvider {
  public abstract id: string
  public abstract name: string
  public abstract priority: number
  public abstract capabilities: ProviderCapabilities

  abstract searchGame(game: GameIdentity): Promise<SoundtrackMatch[]>
  abstract getAlbums(game: GameIdentity): Promise<SoundtrackAlbum[]>
  abstract getAlbum(albumId: string, externalId?: string): Promise<SoundtrackAlbumWithTracks | null>

  async getPlaybackSource(
    _track: SoundtrackTrack,
    _game?: GameIdentity,
  ): Promise<PlaybackSource | null> {
    return null
  }

  async getDownloadSource(_track: SoundtrackTrack): Promise<DownloadSource | null> {
    return null
  }

  /**
   * Universal text/HTML fetcher:
   * 1. Attempts Tauri native Rust `soundtrackHttpGet` to bypass CORS and user-agent restrictions completely.
   * 2. Falls back to standard `fetchWithTimeout` if running in test environment.
   */
  protected async fetchHtml(
    url: string,
    headers?: Record<string, string>,
    timeoutMs = 8000,
  ): Promise<string> {
    try {
      return await soundtrackHttpGet(url, headers)
    } catch {
      const res = await this.fetchWithTimeout(url, { headers }, timeoutMs)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.text()
    }
  }

  /**
   * Robust fetch wrapper with timeout, backoff, and error handling
   */
  protected async fetchWithTimeout(
    url: string,
    options: RequestInit = {},
    timeoutMs = 8000,
  ): Promise<Response> {
    const controller = new AbortController()
    const id = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      })
      clearTimeout(id)
      return response
    } catch (err) {
      clearTimeout(id)
      throw err
    }
  }

  /**
   * Helper to normalize a title for search
   */
  protected cleanTitle(title: string): string {
    return title
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }
}
