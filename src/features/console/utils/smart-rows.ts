import type { Game, HubGame, Collection } from '@/types/models'
import type { DownloadInfo } from '@/services/download'
import { parseStoredUtcDate } from '@/features/library/utils/format'

export interface SmartRowItem {
  id: string
  game?: Game
  hubGame?: HubGame
  download?: DownloadInfo
  isRunning?: boolean
}

export interface SmartRowDescriptor {
  id: string
  titleKey: string
  customTitle?: string
  items: SmartRowItem[]
}

export interface SmartRowsInput {
  games: Game[]
  runningGameIds: Set<string>
  downloads?: DownloadInfo[]
  comingSoonHub?: HubGame[]
  dealsHub?: HubGame[]
  collections?: Collection[]
  collectionGamesMap?: Record<string, string[]>
  nowMs?: number
  minimalHome?: boolean
}

/**
 * Pure smart-row builder per Section 10:
 * Filters out hidden (`is_hidden`) and deleted (`is_memory`) games, computes all 10+ smart rows,
 * and omits any empty rows automatically.
 */
export function buildSmartRows(input: SmartRowsInput): SmartRowDescriptor[] {
  const nowMs = input.nowMs ?? Date.now()
  const visibleGames = input.games.filter((g) => !g.is_hidden && !g.is_memory && !g.is_wishlist)
  const wishlistedGames = input.games.filter((g) => !g.is_hidden && !g.is_memory && g.is_wishlist)

  const rows: SmartRowDescriptor[] = []

  // 1. Continue + Recently Played
  const playedSorted = [...visibleGames]
    .filter((g) => g.last_played_at !== null || input.runningGameIds.has(g.id))
    .sort((a, b) => {
      const aRun = input.runningGameIds.has(a.id) ? 1 : 0
      const bRun = input.runningGameIds.has(b.id) ? 1 : 0
      if (aRun !== bRun) return bRun - aRun
      const aMs = a.last_played_at ? (parseStoredUtcDate(a.last_played_at)?.getTime() ?? 0) : 0
      const bMs = b.last_played_at ? (parseStoredUtcDate(b.last_played_at)?.getTime() ?? 0) : 0
      return bMs - aMs
    })

  if (playedSorted.length > 0) {
    rows.push({
      id: 'recently_played',
      titleKey: 'recentlyPlayed',
      items: playedSorted.slice(0, 14).map((g) => ({
        id: g.id,
        game: g,
        isRunning: input.runningGameIds.has(g.id),
      })),
    })
  }

  if (input.minimalHome) {
    if (rows.length === 0 && visibleGames.length > 0) {
      rows.push({
        id: 'all_games_minimal',
        titleKey: 'recentlyPlayed',
        items: visibleGames.slice(0, 16).map((g) => ({
          id: g.id,
          game: g,
          isRunning: input.runningGameIds.has(g.id),
        })),
      })
    }
    return rows
  }

  // 2. Downloading Now
  const activeDownloads = (input.downloads ?? []).filter((d) =>
    ['downloading', 'queued', 'paused', 'extracting'].includes(d.status),
  )
  if (activeDownloads.length > 0) {
    rows.push({
      id: 'downloading_now',
      titleKey: 'downloadingNow',
      items: activeDownloads.map((d) => ({
        id: `dl_${d.id}`,
        download: d,
        game: visibleGames.find((g) => g.id === d.game_id),
      })),
    })
  }

  // 3. Favorites
  const favorites = visibleGames.filter((g) => g.is_favorite)
  if (favorites.length > 0) {
    rows.push({
      id: 'favorites',
      titleKey: 'favorites',
      items: favorites.slice(0, 16).map((g) => ({
        id: g.id,
        game: g,
        isRunning: input.runningGameIds.has(g.id),
      })),
    })
  }

  // 4. Because You Played <Top Game>
  const topPlayed = [...visibleGames]
    .filter((g) => g.total_playtime_seconds > 1800 && g.genres.length > 0)
    .sort((a, b) => b.total_playtime_seconds - a.total_playtime_seconds)[0]

  if (topPlayed) {
    const seedGenres = new Set(topPlayed.genres.map((x) => x.toLowerCase()))
    const seedTags = new Set(topPlayed.tag_ids)
    const similar = visibleGames
      .filter((g) => g.id !== topPlayed.id)
      .map((g) => {
        const gMatches = g.genres.filter((x) => seedGenres.has(x.toLowerCase())).length
        const tMatches = g.tag_ids.filter((t) => seedTags.has(t)).length
        return { game: g, score: gMatches * 2 + tMatches }
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)

    if (similar.length >= 2) {
      rows.push({
        id: 'because_you_played',
        titleKey: 'becauseYouPlayed',
        customTitle: `${topPlayed.name}`,
        items: similar.slice(0, 12).map((x) => ({
          id: x.game.id,
          game: x.game,
        })),
      })
    }
  }

  // 5. Quick Play (< 1 hour total playtime or bite-sized arcade/indie)
  const quickPlay = visibleGames.filter(
    (g) =>
      g.is_installed &&
      ((g.total_playtime_seconds > 0 && g.total_playtime_seconds <= 3600) ||
        g.genres.some((gn) => /indie|arcade|puzzle|platform|rogue/i.test(gn))),
  )
  if (quickPlay.length > 0) {
    rows.push({
      id: 'quick_play',
      titleKey: 'quickPlay',
      items: quickPlay.slice(0, 14).map((g) => ({ id: g.id, game: g })),
    })
  }

  // 6. Back in the Day (not played for >= 6 months)
  const sixMonthsMs = 180 * 24 * 3600 * 1000
  const backInTheDay = visibleGames.filter((g) => {
    if (!g.last_played_at) return false
    const ms = parseStoredUtcDate(g.last_played_at)?.getTime() ?? 0
    return ms > 0 && nowMs - ms >= sixMonthsMs
  })
  if (backInTheDay.length > 0) {
    rows.push({
      id: 'back_in_the_day',
      titleKey: 'backInTheDay',
      items: backInTheDay.slice(0, 14).map((g) => ({ id: g.id, game: g })),
    })
  }

  // 7. New in Your Library
  const newInLib = [...visibleGames].sort((a, b) => {
    const aMs = parseStoredUtcDate(a.added_at)?.getTime() ?? 0
    const bMs = parseStoredUtcDate(b.added_at)?.getTime() ?? 0
    return bMs - aMs
  })
  if (newInLib.length > 0) {
    rows.push({
      id: 'new_in_library',
      titleKey: 'newInLibrary',
      items: newInLib.slice(0, 14).map((g) => ({ id: g.id, game: g })),
    })
  }

  // 8. User Collections
  if (input.collections && input.collectionGamesMap) {
    for (const col of input.collections) {
      const ids = input.collectionGamesMap[col.id] ?? []
      const colGames = ids
        .map((gid) => visibleGames.find((g) => g.id === gid))
        .filter((g): g is Game => Boolean(g))
      if (colGames.length > 0) {
        rows.push({
          id: `collection_${col.id}`,
          titleKey: 'favorites',
          customTitle: col.name,
          items: colGames.map((g) => ({ id: g.id, game: g })),
        })
      }
    }
  }

  // 9. Wishlist & Store Deals
  if ((input.dealsHub && input.dealsHub.length > 0) || wishlistedGames.length > 0) {
    const items: SmartRowItem[] = [
      ...wishlistedGames.slice(0, 8).map((g) => ({ id: g.id, game: g })),
      ...(input.dealsHub ?? []).slice(0, 8).map((hg) => ({
        id: `hub_${hg.igdb_id}`,
        hubGame: hg,
      })),
    ]
    if (items.length > 0) {
      rows.push({
        id: 'wishlist_deals',
        titleKey: 'wishlistDeals',
        items,
      })
    }
  }

  // 10. Coming Soon
  if (input.comingSoonHub && input.comingSoonHub.length > 0) {
    rows.push({
      id: 'coming_soon',
      titleKey: 'comingSoon',
      items: input.comingSoonHub.slice(0, 12).map((hg) => ({
        id: `soon_${hg.igdb_id}`,
        hubGame: hg,
      })),
    })
  }

  return rows
}
