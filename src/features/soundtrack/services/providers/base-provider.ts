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

const EDITION_NOISE_WORDS = new Set([
  'edition',
  'deluxe',
  'ultimate',
  'complete',
  'definitive',
  'goty',
  'directors',
  'director',
  'cut',
  'remastered',
  'remaster',
  'anniversary',
  'enhanced',
  'gold',
  'premium',
  'standard',
  'digital',
  'collection',
  'bundle',
  'repack',
  'fitgirl',
  'dodi',
  'elamigos',
  'codex',
  'rune',
  'tenoke',
  'flt',
])

const ROMAN_TO_DIGIT: Record<string, string> = {
  ii: '2',
  iii: '3',
  iv: '4',
  v: '5',
  vi: '6',
  vii: '7',
  viii: '8',
  ix: '9',
  x: '10',
  xi: '11',
  xii: '12',
  xiii: '13',
  xiv: '14',
  xv: '15',
  xvi: '16',
}

const SEQUEL_SUBTITLE_TOKENS = new Set([
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  '11',
  '12',
  '13',
  '14',
  '15',
  '16',
  'ragnarok',
  'rebirth',
  'village',
  'biohazard',
  'odyssey',
  'valhalla',
  'mirage',
  'shadows',
  'origins',
  'brotherhood',
  'revelations',
  'unity',
  'syndicate',
  'wilds',
  'world',
  'rise',
  'iceborne',
  'sunbreak',
  'eternal',
  'ages',
  'alyx',
  'silksong',
  'infinite',
  'survivor',
  'requiem',
  'nightreign',
  'erdtree',
  'reload',
  'yotei',
  'tsushima',
  'beach',
  'retold',
  'veilguard',
  'inquisition',
  'deliverance',
  'chornobyl',
  'rubicon',
])

const STOP_WORDS = new Set(['the', 'of', 'and', 'a', 'an', 'in', 'on', 'to', 'for'])

/**
 * Normalizes a game title into its canonical core search form:
 * - Folds diacritics (Ragnarök -> ragnarok, Pokémon -> pokemon)
 * - Strips packaging/edition suffixes ("Director's Cut", "Complete Edition", "GOTY", "Remastered", etc.)
 * - Preserves sequel numbers, subtitles, and Roman numerals.
 */
export function extractCoreGameTitle(rawTitle: string): string {
  if (!rawTitle) return ''
  const folded = rawTitle
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’‘`]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[:\-–—/\\.,!?™®©]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const rawTokens = folded.split(' ').filter(Boolean)
  const kept: string[] = []

  for (let i = 0; i < rawTokens.length; i++) {
    const low = rawTokens[i].toLowerCase()
    if (i > 0 && EDITION_NOISE_WORDS.has(low)) continue
    if (i > 1 && /^v\d+/i.test(low)) continue
    kept.push(rawTokens[i])
  }

  return kept
    .join(' ')
    .replace(/\bgame of the year\b/gi, '')
    .replace(/\bscholar of the first sin\b/gi, '')
    .replace(/\bprepare to die\b/gi, '')
    .replace(/\bgame of the yorha\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeTokensForComparison(text: string): string[] {
  const core = extractCoreGameTitle(text)
    .toLowerCase()
    .replace(
      /\b(?:original|official|video|game|soundtrack|soundtracks|score|ost|music|audio|gamerip|complete|expanded|selection|selections|ep|vol|volume|disc|cd)\b/g,
      ' ',
    )
    .replace(
      /\b(?:ps1|ps2|ps3|ps4|ps5|psp|psvita|xbox|360|switch|windows|pc|mac|linux|steam|nes|snes|n64|gamecube|wii|wiiu|3ds|ds|sega|genesis|dreamcast|arcade|ost)\b/g,
      ' ',
    )
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!core) return []
  return core
    .split(' ')
    .filter(Boolean)
    .map((tok) => ROMAN_TO_DIGIT[tok] || tok)
}

function extractYearNumber(raw?: string | null): number | null {
  if (!raw) return null
  const m = raw.trim().match(/\b(19\d{2}|20\d{2})\b/)
  if (!m) return null
  const num = Number.parseInt(m[1], 10)
  return Number.isNaN(num) ? null : num
}

/**
 * Strictly scores how well an album title matches a target game title (0 = invalid/mismatch, 1..100 = verified match).
 * Prevents:
 * - Unrelated KHInsider sidebar links ("The Witcher 3" when searching "Cyberpunk 2077")
 * - Wrong sequels or same-studio entries ("God of War" vs "God of War Ragnarök", "Spider-Man" vs "Spider-Man 2",
 *   "Monster Hunter World" vs "Monster Hunter Wilds", "Ghost of Tsushima" vs "Ghost of Yōtei", "Elden Ring" vs "Elden Ring Nightreign")
 * - Single-word false positives ("Out of Control" when searching "Control", "Inside Out" when searching "Inside")
 * - Release-year mismatches for newly released games or same-name reboots.
 */
export function scoreAlbumMatchForGame(
  albumTitle: string,
  gameTitle: string,
  albumReleaseDate?: string | null,
  gameReleaseDate?: string | null,
): number {
  if (!albumTitle || !gameTitle) return 0

  const lowerAlbum = albumTitle.toLowerCase()
  if (/\b(?:podcast|interview|audiobook|ringtone|karaoke|sound effects only)\b/.test(lowerAlbum)) {
    return 0
  }

  // Release-year guard: if the game is a brand-new release (e.g. 2025/2026) and the album is from
  // a much older game (more than 2 years prior), reject it so new releases don't inherit old OSTs!
  const albYear = extractYearNumber(albumReleaseDate)
  const gmYear = extractYearNumber(gameReleaseDate)
  if (albYear !== null && gmYear !== null) {
    if (gmYear >= 2024 && albYear < gmYear - 2) {
      return 0
    }
    if (albYear > gmYear + 2) {
      return 0
    }
  }

  const gameTokens = normalizeTokensForComparison(gameTitle)
  const albumTokens = normalizeTokensForComparison(albumTitle)

  if (gameTokens.length === 0 || albumTokens.length === 0) return 0

  const significantGameTokens = gameTokens.filter((t) => !STOP_WORDS.has(t))
  const significantAlbumTokens = albumTokens.filter((t) => !STOP_WORDS.has(t))
  const effGameTokens = significantGameTokens.length > 0 ? significantGameTokens : gameTokens
  const effAlbumTokens = significantAlbumTokens.length > 0 ? significantAlbumTokens : albumTokens

  const gameTokenSet = new Set(effGameTokens)
  const albumTokenSet = new Set(effAlbumTokens)

  // 1. Sequel / Spin-Off / Subtitle Disambiguation Guard
  // Every sequel or subtitle marker present in the game title MUST be in the album title
  for (const tok of effGameTokens) {
    if (SEQUEL_SUBTITLE_TOKENS.has(tok) && !albumTokenSet.has(tok)) {
      return 0
    }
  }
  // And any sequel or subtitle marker in the album title that is NOT in the game title is rejected!
  for (const tok of effAlbumTokens) {
    if (SEQUEL_SUBTITLE_TOKENS.has(tok) && !gameTokenSet.has(tok)) {
      return 0
    }
  }
  // Special check for "Miles Morales" spin-off vs base "Spider-Man"
  const gameHasMiles = gameTokens.includes('miles') || gameTokens.includes('morales')
  const albumHasMiles = albumTokens.includes('miles') || albumTokens.includes('morales')
  if (gameHasMiles !== albumHasMiles) {
    return 0
  }

  // 2. Single-word Game Title Strict Guard (e.g. "Control", "Hades", "Prey", "Inside", "Stray", "Doom")
  if (effGameTokens.length === 1) {
    const targetWord = effGameTokens[0]
    if (effAlbumTokens[0] !== targetWord) {
      return 0
    }
    if (effAlbumTokens.length > 1) {
      return 0
    }
  } else {
    // 3. Multi-word Game Title Coverage
    if (effAlbumTokens[0] !== effGameTokens[0] && !albumTokenSet.has(effGameTokens[0])) {
      return 0
    }

    const matchedCount = effGameTokens.filter((t) => albumTokenSet.has(t)).length
    const coverage = matchedCount / effGameTokens.length

    if (effGameTokens.length <= 3 && matchedCount < effGameTokens.length) {
      return 0
    }
    if (coverage < 0.8) {
      return 0
    }

    // Reject if the album has extra significant tokens that alter the game identity (e.g. spin-offs)
    if (effAlbumTokens.length > effGameTokens.length + 2) {
      return 0
    }
  }

  let score = 75

  if (effAlbumTokens.join(' ') === effGameTokens.join(' ')) {
    score += 15
  }

  if (
    lowerAlbum.includes('original soundtrack') ||
    lowerAlbum.includes('official soundtrack') ||
    lowerAlbum.includes('original score') ||
    lowerAlbum.includes('original game soundtrack') ||
    lowerAlbum.includes('original video game') ||
    /\bost\b/.test(lowerAlbum)
  ) {
    score += 10
  }

  if (lowerAlbum.includes('gamerip')) score -= 12
  if (lowerAlbum.includes('single') || lowerAlbum.includes('promo')) score -= 15
  if (lowerAlbum.includes('remix') || lowerAlbum.includes('arrangement')) score -= 10

  return Math.max(1, Math.min(100, score))
}

export function isAlbumValidForGame(
  albumTitle: string,
  gameTitle: string,
  albumReleaseDate?: string | null,
  gameReleaseDate?: string | null,
): boolean {
  return scoreAlbumMatchForGame(albumTitle, gameTitle, albumReleaseDate, gameReleaseDate) > 0
}

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
      if (typeof res.text === 'function') {
        return await res.text()
      }
      if (typeof res.json === 'function') {
        return JSON.stringify(await res.json())
      }
      throw new Error('Invalid response body')
    }
  }

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

  protected cleanTitle(title: string): string {
    return extractCoreGameTitle(title)
  }
}
