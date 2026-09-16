import type { SoundtrackAlbumWithTracks, SoundtrackTrack } from '../types'

/**
 * Key variants that signify an intentionally distinct arrangement or version
 * and MUST NOT be merged with the base track.
 */
const DISTINCT_VARIANTS = [
  'acoustic',
  'live',
  'remix',
  'instrumental',
  'orchestral',
  'piano',
  'demo',
  'reprise',
  'extended',
  'edit',
  'alt',
  'alternate',
  '8-bit',
  'chiptune',
  'ambient',
  'vocal',
]

/**
 * Common tags that can be safely stripped when matching canonical tracks
 */
const STRIP_TAGS = [
  /\b(?:original\s+(?:video\s+)?(?:game\s+)?soundtrack|original\s+(?:video\s+)?(?:game\s+)?score|ost|from\s+the\s+(?:video\s+)?game|official\s+soundtrack|video\s+game\s+soundtrack|game\s+soundtrack)\b/gi,
  /\b(?:original\s+version|original\s+mix|album\s+version)\b/gi,
  /\bfeat\.?.*$/i,
  /\bft\.?.*$/i,
]

export function normalizeTrackTitle(title: string): {
  normalized: string
  distinctVariant: string | null
} {
  let cleaned = title.normalize('NFKD').toLowerCase().trim()

  // Detect distinct variant (e.g. Acoustic, Live, Remix)
  let detectedVariant: string | null = null
  for (const v of DISTINCT_VARIANTS) {
    const regex = new RegExp(`\\b${v}\\b`, 'i')
    if (regex.test(cleaned)) {
      detectedVariant = v
      break
    }
  }

  // Remove track numbering prefixes like "01. ", "01 - ", "1 "
  cleaned = cleaned.replace(/^\d+[\s.-]+/, '')

  // Remove generic strip tags
  for (const regex of STRIP_TAGS) {
    cleaned = cleaned.replace(regex, '')
  }

  // Strip punctuation and normalize whitespace
  cleaned = cleaned
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return {
    normalized: cleaned,
    distinctVariant: detectedVariant,
  }
}

export function titlesMatch(titleA: string, titleB: string): boolean {
  const normA = normalizeTrackTitle(titleA)
  const normB = normalizeTrackTitle(titleB)

  // If one has a distinct variant (like Acoustic) and the other doesn't or has a different one, DO NOT MERGE!
  if (normA.distinctVariant !== normB.distinctVariant) {
    return false
  }

  if (normA.normalized === normB.normalized) {
    return true
  }

  // Levenshtein similarity for slight typos or punctuation diffs
  const sim = stringSimilarity(normA.normalized, normB.normalized)
  return sim >= 0.88
}

function stringSimilarity(s1: string, s2: string): number {
  if (s1 === s2) return 1.0
  if (s1.length === 0 || s2.length === 0) return 0.0

  const len1 = s1.length
  const len2 = s2.length
  const maxLen = Math.max(len1, len2)

  // Fast Levenshtein distance
  const track = Array(len2 + 1)
    .fill(null)
    .map((_, i) => i)

  for (let i = 0; i < len1; i++) {
    let prev = i + 1
    for (let j = 0; j < len2; j++) {
      let cur = track[j]
      if (s1[i] !== s2[j]) {
        cur = Math.min(track[j] + 1, prev + 1, track[j + 1] + 1)
      }
      track[j] = prev
      prev = cur
    }
    track[len2] = prev
  }

  const distance = track[len2]
  return 1.0 - distance / maxLen
}

/**
 * Reconciles multiple tracklists from different providers into one canonical tracklist.
 * Multi-disc structures are preserved.
 */
export function aggregateTracklists(
  primaryTracks: SoundtrackTrack[],
  secondaryTracksList: SoundtrackTrack[][],
): SoundtrackTrack[] {
  const canonical: SoundtrackTrack[] = [...primaryTracks]

  for (const secondaryTracks of secondaryTracksList) {
    for (const secTrack of secondaryTracks) {
      // Find matching track in canonical list
      const matchIndex = canonical.findIndex((canTrack) => {
        // Must match disc if multi-disc
        if (canTrack.disc_number !== secTrack.disc_number) {
          // If both specify a disc number > 1 and they differ, they're not the same
          if (canTrack.disc_number > 1 || secTrack.disc_number > 1) {
            return false
          }
        }

        // Check title match
        if (!titlesMatch(canTrack.title, secTrack.title)) {
          return false
        }

        // Duration check: if both have duration, should be within 15 seconds
        if (canTrack.duration_ms > 0 && secTrack.duration_ms > 0) {
          const delta = Math.abs(canTrack.duration_ms - secTrack.duration_ms)
          if (delta > 15000) {
            return false
          }
        }

        return true
      })

      if (matchIndex >= 0) {
        // Merge metadata: enrich missing fields (artist, duration, stream/download URLs)
        const canTrack = canonical[matchIndex]
        canonical[matchIndex] = {
          ...canTrack,
          artist: canTrack.artist || secTrack.artist,
          duration_ms: canTrack.duration_ms > 0 ? canTrack.duration_ms : secTrack.duration_ms,
          stream_url: canTrack.stream_url || secTrack.stream_url,
          download_url: canTrack.download_url || secTrack.download_url,
          preview_url: canTrack.preview_url || secTrack.preview_url,
          local_path: canTrack.local_path || secTrack.local_path,
        }
      } else {
        // Track was missing in primary list! Add it to the canonical list
        canonical.push(secTrack)
      }
    }
  }

  // Sort canonical tracks properly by disc number, then track number
  canonical.sort((a, b) => {
    if (a.disc_number !== b.disc_number) {
      return a.disc_number - b.disc_number
    }
    return a.track_number - b.track_number
  })

  // Normalize track numbers per disc if gaps exist
  const discCounters = new Map<number, number>()
  return canonical.map((t) => {
    const current = (discCounters.get(t.disc_number) || 0) + 1
    discCounters.set(t.disc_number, current)
    return {
      ...t,
      track_number: t.track_number > 0 ? t.track_number : current,
    }
  })
}

/**
 * Reconciles multiple albums from different providers for a single game.
 */
export function aggregateAlbums(
  albumsWithTracks: SoundtrackAlbumWithTracks[],
): SoundtrackAlbumWithTracks[] {
  if (albumsWithTracks.length <= 1) {
    return albumsWithTracks
  }

  const groups: SoundtrackAlbumWithTracks[] = []

  for (const current of albumsWithTracks) {
    const existingIndex = groups.findIndex((g) => {
      return titlesMatch(g.album.title, current.album.title)
    })

    if (existingIndex >= 0) {
      const existing = groups[existingIndex]
      const mergedTracks = aggregateTracklists(existing.tracks, [current.tracks])
      const totalDuration = mergedTracks.reduce((acc, t) => acc + (t.duration_ms || 0), 0)

      groups[existingIndex] = {
        album: {
          ...existing.album,
          artist: existing.album.artist || current.album.artist,
          cover_url: existing.album.cover_url || current.album.cover_url,
          track_count: mergedTracks.length,
          total_duration_ms: totalDuration,
          release_date: existing.album.release_date || current.album.release_date,
        },
        tracks: mergedTracks,
      }
    } else {
      groups.push(current)
    }
  }

  return groups
}
