import { describe, expect, it } from 'vitest'
import {
  aggregateAlbums,
  aggregateTracklists,
  normalizeTrackTitle,
  titlesMatch,
} from './tracklist-aggregator'
import type { SoundtrackAlbum, SoundtrackAlbumWithTracks, SoundtrackTrack } from '../types'

describe('tracklist-aggregator', () => {
  describe('normalizeTrackTitle', () => {
    it('strips track number prefixes and generic OST tags', () => {
      const result = normalizeTrackTitle('01 - Dragonborn (Original Soundtrack)')
      expect(result.normalized).toBe('dragonborn')
      expect(result.distinctVariant).toBeNull()
    })

    it('identifies distinct variants such as acoustic, remix, and live', () => {
      const acoustic = normalizeTrackTitle('Main Theme (Acoustic Version)')
      expect(acoustic.distinctVariant).toBe('acoustic')

      const remix = normalizeTrackTitle('Battle Theme (Remix)')
      expect(remix.distinctVariant).toBe('remix')

      const live = normalizeTrackTitle('Boss Battle (Live in Concert)')
      expect(live.distinctVariant).toBe('live')
    })
  })

  describe('titlesMatch', () => {
    it('matches identical and cleaned track titles', () => {
      expect(titlesMatch('01. Main Theme', 'Main Theme (OST)')).toBe(true)
      expect(titlesMatch('Geralt of Rivia', '01 - Geralt of Rivia (Album Version)')).toBe(true)
    })

    it('preserves distinct variants and prevents merging', () => {
      expect(titlesMatch('Main Theme', 'Main Theme (Acoustic)')).toBe(false)
      expect(titlesMatch('Main Theme (Remix)', 'Main Theme (Acoustic)')).toBe(false)
      expect(titlesMatch('Main Theme (Live)', 'Main Theme')).toBe(false)
    })
  })

  describe('aggregateTracklists', () => {
    const trackA1: SoundtrackTrack = {
      id: 'a1',
      album_id: 'alb1',
      title: '01 - Main Theme',
      artist: 'Composer A',
      duration_ms: 180000,
      track_number: 1,
      disc_number: 1,
      stream_url: null,
      download_url: null,
      preview_url: null,
      local_path: null,
      provider_id: 'test',
      external_id: null,
    }

    const trackA2: SoundtrackTrack = {
      id: 'a2',
      album_id: 'alb1',
      title: '02 - Main Theme (Acoustic)',
      artist: 'Composer A',
      duration_ms: 150000,
      track_number: 2,
      disc_number: 1,
      stream_url: null,
      download_url: null,
      preview_url: null,
      local_path: null,
      provider_id: 'test',
      external_id: null,
    }

    const trackB1: SoundtrackTrack = {
      id: 'b1',
      album_id: 'alb1',
      title: 'Main Theme (Original Soundtrack)',
      artist: 'Composer A',
      duration_ms: 180000,
      track_number: 1,
      disc_number: 1,
      stream_url: 'https://stream.provider/a1.mp3',
      download_url: 'https://download.provider/a1.mp3',
      preview_url: null,
      local_path: null,
      provider_id: 'test-2',
      external_id: null,
    }

    it('merges secondary track details into primary track without duplicating', () => {
      const merged = aggregateTracklists([trackA1], [[trackB1]])
      expect(merged).toHaveLength(1)
      expect(merged[0].stream_url).toBe('https://stream.provider/a1.mp3')
      expect(merged[0].download_url).toBe('https://download.provider/a1.mp3')
    })

    it('keeps distinct acoustic variant as a separate track', () => {
      const merged = aggregateTracklists([trackA1, trackA2], [[trackB1]])
      expect(merged).toHaveLength(2)
      expect(merged[0].title).toBe('01 - Main Theme')
      expect(merged[1].title).toBe('02 - Main Theme (Acoustic)')
    })

    it('orders multi-disc tracks correctly', () => {
      const disc2Track: SoundtrackTrack = {
        ...trackA1,
        id: 'd2_1',
        title: 'Disc 2 Opening',
        disc_number: 2,
        track_number: 1,
      }
      const merged = aggregateTracklists([disc2Track, trackA1], [])
      expect(merged[0].disc_number).toBe(1)
      expect(merged[1].disc_number).toBe(2)
    })
  })

  describe('aggregateAlbums', () => {
    it('aggregates same album from different providers', () => {
      const album1: SoundtrackAlbum = {
        id: 'alb1',
        game_id: 'witcher-3',
        title: 'The Witcher 3: Wild Hunt (Original Game Soundtrack)',
        album_type: 'original_soundtrack',
        artist: 'Marcin Przybylowicz',
        cover_url: 'https://img.com/cover1.jpg',
        release_date: '2015-05-19',
        track_count: 1,
        total_duration_ms: 180000,
        provider_id: 'musicbrainz',
        external_id: 'mb-1',
        created_at: '',
        updated_at: '',
      }

      const album2: SoundtrackAlbum = {
        ...album1,
        id: 'alb2',
        title: 'The Witcher 3 Wild Hunt OST',
        provider_id: 'steam',
        external_id: 'steam-1',
      }

      const item1: SoundtrackAlbumWithTracks = {
        album: album1,
        tracks: [
          {
            id: 't1',
            album_id: 'alb1',
            title: 'Geralt of Rivia',
            artist: 'Marcin Przybylowicz',
            duration_ms: 180000,
            track_number: 1,
            disc_number: 1,
            stream_url: null,
            download_url: null,
            preview_url: null,
            local_path: null,
            provider_id: 'musicbrainz',
            external_id: null,
          },
        ],
      }

      const item2: SoundtrackAlbumWithTracks = {
        album: album2,
        tracks: [
          {
            id: 't2',
            album_id: 'alb2',
            title: '01 - Geralt of Rivia',
            artist: 'Marcin Przybylowicz',
            duration_ms: 180000,
            track_number: 1,
            disc_number: 1,
            stream_url: 'https://steam.cdn/t1.mp3',
            download_url: null,
            preview_url: null,
            local_path: null,
            provider_id: 'steam',
            external_id: null,
          },
        ],
      }

      const result = aggregateAlbums([item1, item2])
      expect(result).toHaveLength(1)
      expect(result[0].tracks).toHaveLength(1)
      expect(result[0].tracks[0].stream_url).toBe('https://steam.cdn/t1.mp3')
    })
  })
})
