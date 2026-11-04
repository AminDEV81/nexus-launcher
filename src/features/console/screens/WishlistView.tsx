import React, { useEffect, useMemo, useState } from 'react'
import {
  ArrowUpDown,
  Bookmark,
  Calendar,
  CheckCircle2,
  Clock,
  Compass,
  ExternalLink,
  Film,
  Flame,
  Heart,
  Keyboard,
  LayoutGrid,
  List,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Tag,
  Trash2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import type { Game, HubGame } from '@/types/models'
import {
  formatReleaseDate,
  isGameUnreleased,
  parseStoredUtcDate,
} from '@/features/library/utils/format'
import {
  buildBannerFallbackChain,
  buildCoverFallbackChain,
} from '@/features/hub/utils/cover-fallback'
import { useSteamPrice } from '@/features/hub/hooks/use-steam-price'
import { permanentlyDeleteGame, promoteWishlistGame } from '@/services/games'
import { addGameToWishlist, getHubGameDetails, searchHubGames } from '@/services/hub'
import { useConsoleStore } from '../store/console-store'
import { CONSOLE_THEMES } from '../theme/tokens'
import { FocusScope, useFocusable } from '../nav/FocusScope'
import { resolveConsoleHighResUrl, resolveConsoleMediaUrl } from '../ui/Tile'
import { normalizeCanonicalStoreTitle } from './StoreView'

export interface WishlistViewProps {
  games: Game[]
  storeDeals: HubGame[]
  storeUpcoming: HubGame[]
  storeTopRated: HubGame[]
  onOpenGameHub: (game: Game) => void
  onSelectHubGame: (hubGame: HubGame) => void
  onFocusGame?: (game: Game) => void
  onGoToStore: () => void
  onRefreshGames: () => void
}

type WishlistFilterTab = 'all' | 'upcoming' | 'released' | 'deals' | 'acclaimed'
type WishlistSortMode = 'release' | 'added' | 'score' | 'name'
type WishlistLayoutMode = 'countdown_cards' | 'posters'

/**
 * Verified canonical artwork & release dates for major upcoming / console-first titles
 * so games like Grand Theft Auto VI (GTA 6) NEVER display wrong Steam fallback covers (like Vice City)
 * and always have their exact official countdown target date.
 */
interface VerifiedUpcomingMeta {
  coverUrl: string
  bannerUrl: string
  releaseDate: string
  developer: string
  summary: string
}

const VERIFIED_UPCOMING_CATALOG: Record<string, VerifiedUpcomingMeta> = {
  'grand theft auto 6': {
    coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big_2x/co9rwo.jpg',
    bannerUrl: 'https://images.igdb.com/igdb/image/upload/t_1080p/scq3y1.jpg',
    releaseDate: '2026-05-26',
    developer: 'Rockstar Games',
    summary:
      'Grand Theft Auto VI heads to the state of Leonida, home to the neon-soaked streets of Vice City and beyond in the biggest, most immersive evolution of the series yet.',
  },
  'gta 6': {
    coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big_2x/co9rwo.jpg',
    bannerUrl: 'https://images.igdb.com/igdb/image/upload/t_1080p/scq3y1.jpg',
    releaseDate: '2026-05-26',
    developer: 'Rockstar Games',
    summary:
      'Grand Theft Auto VI heads to the state of Leonida, home to the neon-soaked streets of Vice City and beyond in the biggest, most immersive evolution of the series yet.',
  },
  'gta vi': {
    coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big_2x/co9rwo.jpg',
    bannerUrl: 'https://images.igdb.com/igdb/image/upload/t_1080p/scq3y1.jpg',
    releaseDate: '2026-05-26',
    developer: 'Rockstar Games',
    summary:
      'Grand Theft Auto VI heads to the state of Leonida, home to the neon-soaked streets of Vice City and beyond in the biggest, most immersive evolution of the series yet.',
  },
}

/**
 * Extracts sequel numbers and spin-off keywords so "Grand Theft Auto VI" (`6`)
 * can never match "Grand Theft Auto: Vice City" (`vice`, `city`) or "Grand Theft Auto V" (`5`).
 */
function extractSequelSignature(rawTitle: string): string {
  const canon = normalizeCanonicalStoreTitle(rawTitle)
  const sig: string[] = []
  for (const tok of canon.split(/\s+/)) {
    if (
      /^\d+$/.test(tok) ||
      [
        'vice',
        'city',
        'san',
        'andreas',
        'liberty',
        'trilogy',
        'online',
        'ragnarok',
        'rebirth',
        'village',
        'odyssey',
        'valhalla',
        'mirage',
        'shadows',
        'origins',
        'silksong',
        'nightreign',
        'yotei',
      ].includes(tok)
    ) {
      sig.push(tok)
    }
  }
  return sig.join('_')
}

function getVerifiedOverride(gameName: string): VerifiedUpcomingMeta | null {
  const canon = normalizeCanonicalStoreTitle(gameName)
  if (VERIFIED_UPCOMING_CATALOG[canon]) return VERIFIED_UPCOMING_CATALOG[canon]
  const rawLow = gameName.trim().toLowerCase()
  if (
    rawLow === 'grand theft auto vi' ||
    rawLow === 'grand theft auto 6' ||
    rawLow === 'gta 6' ||
    rawLow === 'gta vi'
  ) {
    return VERIFIED_UPCOMING_CATALOG['grand theft auto 6']
  }
  return null
}

/**
 * Multi-CDN resilient artwork renderer for Wishlist cards that automatically applies
 * verified overrides for titles like GTA VI so polluted Vice City covers never appear.
 */
const WishlistSmartArtwork: React.FC<{
  game?: Game | null
  hubGame?: HubGame | null
  mode: 'poster' | 'banner'
  className?: string
}> = ({ game, hubGame, mode, className = 'h-full w-full object-cover' }) => {
  const candidates = useMemo(() => {
    const title = game?.name ?? hubGame?.name ?? ''
    const verified = getVerifiedOverride(title)
    if (verified) {
      return mode === 'banner'
        ? [verified.bannerUrl, verified.coverUrl]
        : [verified.coverUrl, verified.bannerUrl]
    }

    const coverPrimary = resolveConsoleMediaUrl(
      game?.cover_path ?? hubGame?.cover_url ?? hubGame?.backdrop_url,
    )
    const bannerPrimary = resolveConsoleHighResUrl(
      game?.banner_path ??
        game?.background_path ??
        hubGame?.backdrop_url ??
        game?.cover_path ??
        hubGame?.cover_url,
    )
    const steamAppId = game?.steam_app_id ?? hubGame?.steam_app_id
    const igdbId = game?.igdb_id ?? hubGame?.igdb_id

    if (mode === 'banner') {
      return buildBannerFallbackChain(bannerPrimary, coverPrimary, steamAppId, igdbId)
    }
    return buildCoverFallbackChain(coverPrimary, bannerPrimary, steamAppId, igdbId)
  }, [game, hubGame, mode])

  const [idx, setIdx] = useState(0)
  useEffect(() => {
    setIdx(0)
  }, [candidates])

  const src = candidates[idx] ?? null
  const title = game?.name ?? hubGame?.name ?? 'Game'

  if (!src) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 p-4 text-center">
        <Bookmark className="mb-2 size-6 text-rose-400/60" />
        <span className="line-clamp-3 text-xs font-black text-white/90">{title}</span>
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={title}
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setIdx((prev) => prev + 1)}
      className={className}
    />
  )
}

/**
 * Exact 4-Unit Real-Time Digital Countdown Timer (`DAYS : HOURS : MINS : SECS`)
 * rendered directly on each Wishlist card.
 */
const CardPrecisionCountdown: React.FC<{
  releaseDate: string | null
  isLight: boolean
  compact?: boolean
}> = ({ releaseDate, isLight, compact = false }) => {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!releaseDate || !isGameUnreleased(releaseDate)) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [releaseDate])

  if (!releaseDate) {
    return (
      <div
        className={`flex items-center justify-between rounded-xl border px-3 py-2 ${
          compact
            ? 'border-white/20 bg-black/75 text-amber-300'
            : isLight
              ? 'border-amber-200 bg-amber-50/90 text-amber-900'
              : 'border-amber-400/25 bg-amber-500/10 text-amber-200'
        }`}
      >
        <span className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider">
          <Clock className="size-3.5 text-amber-400" />
          Release Date TBA
        </span>
        <span className="rounded-md bg-amber-400/20 px-2 py-0.5 font-mono text-[10px] font-black">
          AWAITING DATE
        </span>
      </div>
    )
  }

  const parsed = parseStoredUtcDate(releaseDate)
  if (!parsed || parsed.getTime() <= now) {
    return (
      <div
        className={`flex items-center justify-between rounded-xl border px-3 py-2 ${
          compact
            ? 'border-emerald-400/40 bg-black/80 text-emerald-300'
            : isLight
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-emerald-400/30 bg-emerald-500/12 text-emerald-200'
        }`}
      >
        <span className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider">
          <CheckCircle2 className="size-3.5 text-emerald-400" />
          Released &amp; Available Now
        </span>
        <span className="font-mono text-[10px] font-bold opacity-80">
          {formatReleaseDate(releaseDate)}
        </span>
      </div>
    )
  }

  const totalSec = Math.max(0, Math.floor((parsed.getTime() - now) / 1000))
  const days = Math.floor(totalSec / 86400)
  const hours = Math.floor((totalSec % 86400) / 3600)
  const mins = Math.floor((totalSec % 3600) / 60)
  const secs = totalSec % 60

  if (compact) {
    return (
      <div className="flex items-center justify-between gap-1 rounded-xl border border-amber-400/45 bg-black/85 px-2.5 py-1.5 font-mono text-[11px] font-black tabular-nums text-amber-300 backdrop-blur-md">
        <span className="inline-flex items-center gap-1 text-[9px] uppercase tracking-wider text-amber-200/90">
          <Clock className="size-2.5 animate-pulse text-amber-400" />
          Launch
        </span>
        <span>
          {days}d : {String(hours).padStart(2, '0')}h : {String(mins).padStart(2, '0')}m :{' '}
          {String(secs).padStart(2, '0')}s
        </span>
      </div>
    )
  }

  const units = [
    { label: 'DAYS', value: String(days).padStart(2, '0') },
    { label: 'HOURS', value: String(hours).padStart(2, '0') },
    { label: 'MINS', value: String(mins).padStart(2, '0') },
    { label: 'SECS', value: String(secs).padStart(2, '0') },
  ]

  return (
    <div
      className={`rounded-2xl border p-3 ${
        isLight
          ? 'border-amber-200/90 bg-gradient-to-r from-amber-50/90 via-white to-amber-50/60'
          : 'border-amber-400/30 bg-gradient-to-r from-amber-500/12 via-black/45 to-amber-500/5'
      }`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span
          className={`inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest ${
            isLight ? 'text-amber-800' : 'text-amber-300'
          }`}
        >
          <Clock className="size-3 animate-pulse" />
          Live Launch Countdown
        </span>
        <span
          className={`inline-flex items-center gap-1 font-mono text-[10px] font-bold ${
            isLight ? 'text-slate-600' : 'text-amber-200/85'
          }`}
        >
          <Calendar className="size-3" />
          {formatReleaseDate(releaseDate)}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {units.map((u) => (
          <div
            key={u.label}
            className={`flex flex-col items-center justify-center rounded-xl border py-1.5 ${
              isLight
                ? 'border-amber-200/90 bg-white shadow-2xs'
                : 'border-white/10 bg-[#070b16]/90 shadow-inner'
            }`}
          >
            <span
              className={`font-mono text-base sm:text-lg font-black tabular-nums leading-tight ${
                isLight ? 'text-slate-900' : 'text-amber-300'
              }`}
            >
              {u.value}
            </span>
            <span
              className={`text-[8px] font-black uppercase tracking-widest ${
                isLight ? 'text-slate-400' : 'text-slate-400'
              }`}
            >
              {u.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Live Steam Price & Discount badge for Wishlist items.
 */
const WishlistLivePriceBadge: React.FC<{
  steamAppId?: string | number | null
  gameName: string
  matchedHubGame?: HubGame
  isLight: boolean
}> = ({ steamAppId, gameName, matchedHubGame, isLight }) => {
  const verified = getVerifiedOverride(gameName)
  const effectiveAppId = verified ? null : steamAppId
  const { data: steamPrice } = useSteamPrice(
    effectiveAppId,
    'us',
    verified ? null : gameName,
    !verified,
  )

  if (verified) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${
          isLight
            ? 'border-amber-300 bg-amber-50 text-amber-800'
            : 'border-amber-400/35 bg-amber-500/15 text-amber-300'
        }`}
      >
        <Sparkles className="size-3" />
        Pre-Release
      </span>
    )
  }

  const discount =
    (steamPrice?.discount_percent && steamPrice.discount_percent > 0
      ? steamPrice.discount_percent
      : matchedHubGame?.discount_percent) ?? 0

  const finalFormatted =
    steamPrice?.final_formatted || matchedHubGame?.sale_price_formatted || null
  const initialFormatted =
    steamPrice?.initial_formatted || matchedHubGame?.original_price_formatted || null

  if (steamPrice?.is_free) {
    return (
      <span
        className={`inline-flex items-center rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${
          isLight
            ? 'bg-emerald-100 text-emerald-800'
            : 'bg-emerald-500/20 text-emerald-300'
        }`}
      >
        Free to Play
      </span>
    )
  }

  if (!finalFormatted && !discount) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] font-bold ${
          isLight ? 'bg-slate-100 text-slate-600' : 'bg-white/10 text-slate-300'
        }`}
      >
        <Heart className="size-2.5 fill-rose-500 text-rose-500" />
        <span>Wishlisted</span>
      </span>
    )
  }

  return (
    <div className="inline-flex items-center gap-1.5">
      {discount > 0 && (
        <span className="rounded-md bg-emerald-400 px-1.5 py-0.5 font-mono text-[10px] font-black text-slate-950 shadow-xs">
          -{discount}%
        </span>
      )}
      <div className="flex items-baseline gap-1.5">
        {discount > 0 && initialFormatted && (
          <span
            className={`font-mono text-[10px] line-through ${
              isLight ? 'text-slate-400' : 'text-slate-400/80'
            }`}
          >
            {initialFormatted}
          </span>
        )}
        {finalFormatted && (
          <span
            className={`font-mono text-xs font-black ${
              discount > 0
                ? isLight
                  ? 'text-emerald-700'
                  : 'text-emerald-300'
                : isLight
                  ? 'text-slate-900'
                  : 'text-white'
            }`}
          >
            {finalFormatted}
          </span>
        )}
      </div>
    </div>
  )
}

export const WishlistView: React.FC<WishlistViewProps> = ({
  games,
  storeDeals,
  storeUpcoming,
  storeTopRated,
  onOpenGameHub,
  onSelectHubGame,
  onFocusGame,
  onGoToStore,
  onRefreshGames,
}) => {
  const themeId = useConsoleStore((s) => s.theme)
  const isLight = Boolean(CONSOLE_THEMES[themeId]?.isLight)
  const openOsk = useConsoleStore((s) => s.openOsk)

  const [filterTab, setFilterTab] = useState<WishlistFilterTab>('all')
  const [sortMode, setSortMode] = useState<WishlistSortMode>('release')
  const [layoutMode, setLayoutMode] = useState<WishlistLayoutMode>('countdown_cards')
  const [query, setQuery] = useState('')
  const [busyGameId, setBusyGameId] = useState<string | null>(null)

  const storeMatchMap = useMemo(() => {
    const byCanon = new Map<string, HubGame>()
    const byIgdb = new Map<number, HubGame>()
    const bySteam = new Map<string, HubGame>()
    for (const hg of [...storeDeals, ...storeUpcoming, ...storeTopRated]) {
      const c = normalizeCanonicalStoreTitle(hg.name)
      if (c && !byCanon.has(c)) byCanon.set(c, hg)
      if (hg.igdb_id && !byIgdb.has(hg.igdb_id)) byIgdb.set(hg.igdb_id, hg)
      if (hg.steam_app_id && !bySteam.has(String(hg.steam_app_id))) {
        bySteam.set(String(hg.steam_app_id), hg)
      }
    }
    return { byCanon, byIgdb, bySteam }
  }, [storeDeals, storeUpcoming, storeTopRated])

  const matchHubGame = (g: Game): HubGame | undefined => {
    if (getVerifiedOverride(g.name)) {
      return undefined
    }
    if (g.igdb_id && storeMatchMap.byIgdb.has(g.igdb_id)) {
      const cand = storeMatchMap.byIgdb.get(g.igdb_id)!
      if (extractSequelSignature(cand.name) === extractSequelSignature(g.name)) {
        return cand
      }
    }
    if (g.steam_app_id && storeMatchMap.bySteam.has(String(g.steam_app_id))) {
      const cand = storeMatchMap.bySteam.get(String(g.steam_app_id))!
      if (extractSequelSignature(cand.name) === extractSequelSignature(g.name)) {
        return cand
      }
    }
    const byName = storeMatchMap.byCanon.get(normalizeCanonicalStoreTitle(g.name))
    if (byName && extractSequelSignature(byName.name) === extractSequelSignature(g.name)) {
      return byName
    }
    return undefined
  }

  const getEffectiveReleaseDate = (g: Game): string | null => {
    const verified = getVerifiedOverride(g.name)
    if (verified) return verified.releaseDate
    return g.release_date ?? matchHubGame(g)?.release_date ?? null
  }

  const wishlistGames = useMemo(
    () =>
      games.filter(
        (g) =>
          !g.is_memory &&
          !g.is_hidden &&
          (g.is_wishlist || (isGameUnreleased(getEffectiveReleaseDate(g)) && !g.is_installed)),
      ),
    [games, storeMatchMap],
  )

  const upcomingCount = useMemo(
    () => wishlistGames.filter((g) => isGameUnreleased(getEffectiveReleaseDate(g))).length,
    [wishlistGames, storeMatchMap],
  )
  const releasedCount = wishlistGames.length - upcomingCount
  const dealsCount = useMemo(
    () =>
      wishlistGames.filter((g) => (matchHubGame(g)?.discount_percent ?? 0) > 0).length,
    [wishlistGames, storeMatchMap],
  )
  const acclaimedCount = useMemo(
    () =>
      wishlistGames.filter(
        (g) => (g.metacritic_score ?? g.opencritic_score ?? 0) >= 85,
      ).length,
    [wishlistGames],
  )

  const filteredAndSorted = useMemo(() => {
    let list = [...wishlistGames]

    if (filterTab === 'upcoming') {
      list = list.filter((g) => isGameUnreleased(getEffectiveReleaseDate(g)))
    } else if (filterTab === 'released') {
      list = list.filter((g) => !isGameUnreleased(getEffectiveReleaseDate(g)))
    } else if (filterTab === 'deals') {
      list = list.filter((g) => (matchHubGame(g)?.discount_percent ?? 0) > 0)
    } else if (filterTab === 'acclaimed') {
      list = list.filter((g) => (g.metacritic_score ?? g.opencritic_score ?? 0) >= 85)
    }

    const q = query.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (g) =>
          g.name.toLowerCase().includes(q) ||
          (g.developer ?? '').toLowerCase().includes(q) ||
          g.genres.some((gn) => gn.toLowerCase().includes(q)),
      )
    }

    if (sortMode === 'release') {
      list.sort((a, b) => {
        const da =
          parseStoredUtcDate(getEffectiveReleaseDate(a))?.getTime() ??
          Number.MAX_SAFE_INTEGER
        const db =
          parseStoredUtcDate(getEffectiveReleaseDate(b))?.getTime() ??
          Number.MAX_SAFE_INTEGER
        return da - db
      })
    } else if (sortMode === 'score') {
      list.sort((a, b) => {
        const sa = a.opencritic_score ?? a.metacritic_score ?? 0
        const sb = b.opencritic_score ?? b.metacritic_score ?? 0
        return sb - sa
      })
    } else if (sortMode === 'name') {
      list.sort((a, b) => a.name.localeCompare(b.name))
    } else {
      list.sort((a, b) => (b.added_at ?? '').localeCompare(a.added_at ?? ''))
    }

    return list
  }, [wishlistGames, filterTab, query, sortMode, storeMatchMap])

  const handleOpenInStore = async (game: Game, matchedHub?: HubGame) => {
    const verified = getVerifiedOverride(game.name)
    if (verified) {
      onSelectHubGame({
        igdb_id: game.igdb_id || 52189,
        name: game.name,
        summary: verified.summary,
        release_date: verified.releaseDate,
        game_type: 0,
        cover_url: verified.coverUrl,
        backdrop_url: verified.bannerUrl,
        rating: null,
        rating_count: 9800,
        metacritic_score: null,
        opencritic_score: null,
        hypes: 9950,
        genres: game.genres.length > 0 ? game.genres : ['Shooter', 'Adventure'],
        platforms:
          game.platforms.length > 0
            ? game.platforms
            : ['PlayStation 5', 'Xbox Series X|S', 'PC (Microsoft Windows)'],
        steam_app_id: null,
      })
      return
    }
    if (matchedHub) {
      onSelectHubGame(matchedHub)
      return
    }
    setBusyGameId(game.id)
    try {
      if (game.igdb_id) {
        const d = await getHubGameDetails(game.igdb_id, game.name)
        onSelectHubGame(d)
        return
      }
      const hits = await searchHubGames(game.name, 0)
      const validHit = hits.find(
        (h) => extractSequelSignature(h.name) === extractSequelSignature(game.name),
      )
      if (validHit) {
        onSelectHubGame(validHit)
      } else {
        onOpenGameHub(game)
      }
    } catch {
      onOpenGameHub(game)
    } finally {
      setBusyGameId(null)
    }
  }

  const handlePromoteToLibrary = async (game: Game) => {
    setBusyGameId(game.id)
    try {
      await promoteWishlistGame(game.id)
      toast.success(`Moved "${game.name}" from Wishlist to your Library!`)
      onRefreshGames()
    } catch {
      toast.error(`Could not move "${game.name}" to Library`)
    } finally {
      setBusyGameId(null)
    }
  }

  const handleRemoveFromWishlist = async (game: Game) => {
    setBusyGameId(game.id)
    try {
      await permanentlyDeleteGame(game.id)
      toast.success(`Removed "${game.name}" from Wishlist`)
      onRefreshGames()
    } catch {
      toast.error(`Could not remove "${game.name}"`)
    } finally {
      setBusyGameId(null)
    }
  }

  const cycleSort = () => {
    const order: WishlistSortMode[] = ['release', 'added', 'score', 'name']
    setSortMode((prev) => order[(order.indexOf(prev) + 1) % order.length])
  }

  const sortBtnFocus = useFocusable<HTMLButtonElement>({
    id: 'wishlist_sort_btn',
    scopeId: 'console_wishlist_header',
    onConfirm: cycleSort,
  })

  const layoutBtnFocus = useFocusable<HTMLButtonElement>({
    id: 'wishlist_layout_btn',
    scopeId: 'console_wishlist_header',
    onConfirm: () =>
      setLayoutMode((m) => (m === 'countdown_cards' ? 'posters' : 'countdown_cards')),
  })

  const oskBtnFocus = useFocusable<HTMLButtonElement>({
    id: 'wishlist_osk_btn',
    scopeId: 'console_wishlist_header',
    onConfirm: () => {
      openOsk('Search Your Wishlist', query, (val) => setQuery(val))
    },
  })

  const browseStoreFocus = useFocusable<HTMLButtonElement>({
    id: 'wishlist_browse_store_btn',
    scopeId: 'console_wishlist_header',
    onConfirm: onGoToStore,
  })

  const emptyStoreFocus = useFocusable<HTMLButtonElement>({
    id: 'wishlist_empty_store_btn',
    scopeId: 'console_wishlist_empty',
    onConfirm: onGoToStore,
  })

  const sortLabels: Record<WishlistSortMode, string> = {
    release: 'Launch Countdown',
    added: 'Recently Added',
    score: 'Critic Score',
    name: 'Name A–Z',
  }

  return (
    <div className="space-y-6 pb-20">
      {/* 1. Console Wishlist & Release Countdown Command Bar */}
      <FocusScope
        id="console_wishlist_header"
        orientation="horizontal"
        className={`flex flex-col xl:flex-row xl:items-center justify-between gap-3.5 rounded-3xl border px-5 py-3.5 ${
          isLight
            ? 'border-slate-200/95 bg-white/95 shadow-[0_10px_30px_rgba(15,23,42,0.06)]'
            : 'border-white/12 bg-[#0b1020]/92 shadow-xl'
        }`}
      >
        {/* Left: Title + Filter Tabs */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2.5 pr-1">
            <div
              className={`flex size-10 items-center justify-center rounded-2xl border ${
                isLight
                  ? 'border-rose-200 bg-rose-50 text-rose-600'
                  : 'border-rose-400/35 bg-rose-500/15 text-rose-400'
              }`}
            >
              <Clock className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1
                  className={`text-lg font-black tracking-tight ${
                    isLight ? 'text-slate-900' : 'text-white'
                  }`}
                >
                  Wishlist &amp; Launch Radar
                </h1>
                <span
                  className={`rounded-full px-2 py-0.5 font-mono text-xs font-black ${
                    isLight
                      ? 'bg-rose-50 text-rose-700 border border-rose-200'
                      : 'bg-rose-500/20 text-rose-300 border border-rose-400/30'
                  }`}
                >
                  {wishlistGames.length}
                </span>
              </div>
              <p className={`text-[11px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                Live real-time launch countdowns &amp; verified cover vault
              </p>
            </div>
          </div>

          <div
            className={`flex flex-wrap items-center gap-1 rounded-xl p-1 ${
              isLight ? 'border border-slate-200/80 bg-slate-100' : 'border border-white/8 bg-black/35'
            }`}
          >
            {(
              [
                { id: 'all', label: 'All Saved', count: wishlistGames.length },
                { id: 'upcoming', label: 'Countdown Radar', count: upcomingCount },
                { id: 'released', label: 'Released', count: releasedCount },
                { id: 'deals', label: 'On Sale', count: dealsCount },
                { id: 'acclaimed', label: '85+ Rated', count: acclaimedCount },
              ] as const
            ).map((tab) => (
              <WishlistFilterPill
                key={tab.id}
                id={`wishlist_tab_${tab.id}`}
                label={tab.label}
                count={tab.count}
                active={filterTab === tab.id}
                isLight={isLight}
                onSelect={() => setFilterTab(tab.id)}
              />
            ))}
          </div>
        </div>

        {/* Right: Search + View Mode + Sort + Store */}
        <div className="flex flex-wrap items-center gap-2">
          <div
            className={`flex flex-1 sm:flex-initial sm:w-56 items-center gap-2 rounded-xl border px-3 py-1.5 ${
              isLight ? 'border-slate-200 bg-slate-100/90' : 'border-white/10 bg-black/40'
            }`}
          >
            <Search className={`size-3.5 ${isLight ? 'text-slate-400' : 'text-slate-500'}`} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter wishlist..."
              className={`w-full bg-transparent text-xs font-semibold outline-none ${
                isLight
                  ? 'text-slate-900 placeholder:text-slate-400'
                  : 'text-white placeholder:text-slate-500'
              }`}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="size-3.5" />
              </button>
            )}
            <button
              type="button"
              {...oskBtnFocus.focusProps}
              title="On-Screen Keypad"
              className={`rounded-lg p-1 transition-all cursor-pointer ${
                oskBtnFocus.isFocused
                  ? 'bg-cyan-400 text-slate-950'
                  : isLight
                    ? 'text-slate-500 hover:text-slate-900'
                    : 'text-slate-400 hover:text-white'
              }`}
            >
              <Keyboard className="size-3" />
            </button>
          </div>

          <button
            type="button"
            {...layoutBtnFocus.focusProps}
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition-all cursor-pointer outline-none ${
              layoutBtnFocus.isFocused
                ? 'scale-105 border-cyan-300 bg-cyan-400 text-slate-950 shadow-md'
                : isLight
                  ? 'border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200'
                  : 'border-white/10 bg-white/[0.05] text-slate-200 hover:bg-white/10'
            }`}
          >
            {layoutMode === 'countdown_cards' ? (
              <>
                <List className="size-3.5" />
                <span className="hidden sm:inline">Countdown Deck</span>
              </>
            ) : (
              <>
                <LayoutGrid className="size-3.5" />
                <span className="hidden sm:inline">3:4 Posters</span>
              </>
            )}
          </button>

          <button
            type="button"
            {...sortBtnFocus.focusProps}
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition-all cursor-pointer outline-none ${
              sortBtnFocus.isFocused
                ? 'scale-105 border-cyan-300 bg-cyan-400 text-slate-950 shadow-md'
                : isLight
                  ? 'border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200'
                  : 'border-white/10 bg-white/[0.05] text-slate-200 hover:bg-white/10'
            }`}
          >
            <ArrowUpDown className="size-3.5" />
            <span>{sortLabels[sortMode]}</span>
          </button>

          <button
            type="button"
            {...browseStoreFocus.focusProps}
            className={`flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-extrabold transition-all cursor-pointer outline-none ${
              browseStoreFocus.isFocused
                ? 'scale-105 bg-cyan-400 text-slate-950 ring-2 ring-white shadow-md'
                : isLight
                  ? 'bg-slate-900 text-white hover:bg-indigo-600'
                  : 'bg-cyan-400 text-slate-950 hover:bg-cyan-300'
            }`}
          >
            <Compass className="size-3.5" />
            <span>Store</span>
          </button>
        </div>
      </FocusScope>

      {/* 2. Wishlist Cards: Dedicated Live Countdown Showcase Cards OR 3:4 Posters */}
      {wishlistGames.length === 0 ? (
        <FocusScope
          id="console_wishlist_empty"
          orientation="horizontal"
          className={`flex flex-col items-center justify-center rounded-3xl border px-6 py-16 text-center ${
            isLight
              ? 'border-slate-200 bg-white/90 shadow-sm'
              : 'border-white/10 bg-[#0b1020]/75'
          }`}
        >
          <div
            className={`mb-4 flex size-14 items-center justify-center rounded-2xl border ${
              isLight
                ? 'border-rose-200 bg-rose-50 text-rose-500'
                : 'border-rose-400/30 bg-rose-500/15 text-rose-400'
            }`}
          >
            <Heart className="size-6" />
          </div>
          <h2 className={`text-xl font-black ${isLight ? 'text-slate-900' : 'text-white'}`}>
            Your Wishlist &amp; Launch Radar is Empty
          </h2>
          <p
            className={`mt-1.5 max-w-md text-xs leading-relaxed ${
              isLight ? 'text-slate-600' : 'text-slate-400'
            }`}
          >
            Save upcoming blockbusters and discounted titles from the Store to track live
            second-by-second launch countdowns and official box-art covers.
          </p>
          <button
            type="button"
            {...emptyStoreFocus.focusProps}
            className={`mt-5 flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-black transition-all cursor-pointer outline-none ${
              emptyStoreFocus.isFocused
                ? 'scale-105 bg-cyan-400 text-slate-950 ring-2 ring-white shadow-lg'
                : isLight
                  ? 'bg-slate-900 text-white hover:bg-indigo-600'
                  : 'bg-cyan-400 text-slate-950 hover:bg-cyan-300'
            }`}
          >
            <Compass className="size-4" />
            <span>Explore Store Catalog</span>
          </button>
        </FocusScope>
      ) : filteredAndSorted.length === 0 ? (
        <div
          className={`rounded-2xl border p-10 text-center text-xs font-semibold ${
            isLight
              ? 'border-slate-200 bg-white/80 text-slate-600'
              : 'border-white/10 bg-white/[0.03] text-slate-400'
          }`}
        >
          No wishlisted games match this filter. Try switching back to &ldquo;All Saved&rdquo;.
        </div>
      ) : layoutMode === 'countdown_cards' ? (
        <FocusScope
          id="console_wishlist_countdown_grid"
          orientation="grid"
          className="grid grid-cols-1 xl:grid-cols-2 gap-4"
        >
          {filteredAndSorted.map((game) => {
            const matched = matchHubGame(game)
            const effDate = getEffectiveReleaseDate(game)
            return (
              <WishlistCountdownShowcaseCard
                key={game.id}
                game={game}
                matchedHubGame={matched}
                effectiveReleaseDate={effDate}
                isLight={isLight}
                busy={busyGameId === game.id}
                onFocusCard={() => onFocusGame?.(game)}
                onOpenStore={() => void handleOpenInStore(game, matched)}
                onOpenHub={() => onOpenGameHub(game)}
                onPromote={() => void handlePromoteToLibrary(game)}
                onRemove={() => void handleRemoveFromWishlist(game)}
              />
            )
          })}
        </FocusScope>
      ) : (
        <FocusScope
          id="console_wishlist_poster_grid"
          orientation="grid"
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4"
        >
          {filteredAndSorted.map((game) => {
            const matched = matchHubGame(game)
            const effDate = getEffectiveReleaseDate(game)
            return (
              <WishlistPosterVaultCard
                key={game.id}
                game={game}
                matchedHubGame={matched}
                effectiveReleaseDate={effDate}
                isLight={isLight}
                busy={busyGameId === game.id}
                onFocusCard={() => onFocusGame?.(game)}
                onOpenStore={() => void handleOpenInStore(game, matched)}
                onOpenHub={() => onOpenGameHub(game)}
                onPromote={() => void handlePromoteToLibrary(game)}
                onRemove={() => void handleRemoveFromWishlist(game)}
              />
            )
          })}
        </FocusScope>
      )}

      {/* 3. Store Discovery Radar (3:4 Poster Recommendations for Wishlist) */}
      <WishlistDiscoveryPosterShelf
        wishlistGames={wishlistGames}
        storeDeals={storeDeals}
        storeUpcoming={storeUpcoming}
        storeTopRated={storeTopRated}
        isLight={isLight}
        onSelectHubGame={onSelectHubGame}
        onRefreshGames={onRefreshGames}
      />
    </div>
  )
}

const WishlistFilterPill: React.FC<{
  id: string
  label: string
  count: number
  active: boolean
  isLight: boolean
  onSelect: () => void
}> = ({ id, label, count, active, isLight, onSelect }) => {
  const { focusProps, isFocused } = useFocusable<HTMLButtonElement>({
    id,
    scopeId: 'console_wishlist_header',
    onConfirm: onSelect,
  })

  return (
    <button
      type="button"
      {...focusProps}
      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all cursor-pointer outline-none ${
        isFocused
          ? 'scale-105 bg-cyan-400 text-slate-950 shadow-sm'
          : active
            ? isLight
              ? 'bg-white text-slate-900 shadow-2xs'
              : 'bg-white/15 text-white'
            : isLight
              ? 'text-slate-600 hover:text-slate-900'
              : 'text-slate-400 hover:text-white'
      }`}
    >
      <span>{label}</span>
      <span
        className={`font-mono text-[10px] font-bold ${
          isFocused
            ? 'text-slate-950'
            : active
              ? isLight
                ? 'text-rose-600'
                : 'text-rose-400'
              : 'opacity-60'
        }`}
      >
        {count}
      </span>
    </button>
  )
}

/**
 * Dedicated Console Countdown Showcase Card:
 * Pairs a crisp 3:4 Vertical Box-Art Poster on the left with a full 4-Unit Live Digital Countdown
 * (`DAYS : HOURS : MINS : SECS`), verified metadata, live Steam pricing, and 1-click actions on the right.
 */
const WishlistCountdownShowcaseCard: React.FC<{
  game: Game
  matchedHubGame?: HubGame
  effectiveReleaseDate: string | null
  isLight: boolean
  busy: boolean
  onFocusCard: () => void
  onOpenStore: () => void
  onOpenHub: () => void
  onPromote: () => void
  onRemove: () => void
}> = ({
  game,
  matchedHubGame,
  effectiveReleaseDate,
  isLight,
  busy,
  onFocusCard,
  onOpenStore,
  onOpenHub,
  onPromote,
  onRemove,
}) => {
  const { focusProps, isFocused } = useFocusable<HTMLDivElement>({
    id: `wishlist_cd_card_${game.id}`,
    scopeId: 'console_wishlist_countdown_grid',
    onFocus: onFocusCard,
    onConfirm: onOpenStore,
    onOptions: onOpenHub,
  })

  const verified = getVerifiedOverride(game.name)
  const score =
    game.opencritic_score ??
    game.metacritic_score ??
    matchedHubGame?.opencritic_score ??
    matchedHubGame?.metacritic_score ??
    null
  const devName = verified?.developer || game.developer || 'Official Edition'

  return (
    <div
      {...focusProps}
      onMouseEnter={onFocusCard}
      onClick={onOpenStore}
      className={`group relative flex flex-col sm:flex-row gap-4 overflow-hidden rounded-3xl border p-4 text-left transition-transform duration-150 cursor-pointer select-none outline-none ${
        isFocused
          ? isLight
            ? 'z-20 scale-[1.015] border-indigo-600 bg-white ring-3 ring-indigo-500/35 shadow-[0_18px_40px_rgba(79,70,229,0.22)]'
            : 'z-20 scale-[1.015] border-cyan-400 bg-[#0f172e] ring-3 ring-cyan-400/45 shadow-[0_18px_40px_rgba(0,229,255,0.24)]'
          : isLight
            ? 'border-slate-200/95 bg-white/95 hover:border-slate-300 shadow-[0_8px_24px_rgba(15,23,42,0.05)]'
            : 'border-white/12 bg-[#0b1122]/92 hover:border-white/25 shadow-lg'
      }`}
    >
      {/* Left: Crisp 3:4 Vertical Official Cover Poster */}
      <div className="relative aspect-[3/4] w-full sm:w-36 shrink-0 overflow-hidden rounded-2xl border border-white/15 bg-slate-900 shadow-lg">
        <WishlistSmartArtwork
          game={game}
          hubGame={matchedHubGame}
          mode="poster"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        {score && score > 0 ? (
          <span className="absolute right-2 top-2 inline-flex items-center gap-0.5 rounded-full border border-white/20 bg-black/80 px-2 py-0.5 font-mono text-[10px] font-black text-emerald-300">
            <Sparkles className="size-2.5" />
            {score}
          </span>
        ) : null}
      </div>

      {/* Right: Title, Live 4-Unit Digital Countdown Matrix, Price & Actions */}
      <div className="flex flex-1 flex-col justify-between gap-3 min-w-0">
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span
              className={`text-[10px] font-black uppercase tracking-widest ${
                isLight ? 'text-indigo-600' : 'text-cyan-400'
              }`}
            >
              {devName}
            </span>
            <WishlistLivePriceBadge
              steamAppId={game.steam_app_id ?? matchedHubGame?.steam_app_id}
              gameName={game.name}
              matchedHubGame={matchedHubGame}
              isLight={isLight}
            />
          </div>

          <h3
            className={`mt-0.5 truncate text-lg sm:text-xl font-black tracking-tight ${
              isLight ? 'text-slate-900' : 'text-white'
            }`}
          >
            {game.name}
          </h3>

          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {(game.genres.length > 0 ? game.genres : (matchedHubGame?.genres ?? []))
              .slice(0, 3)
              .map((gn) => (
                <span
                  key={gn}
                  className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                    isLight
                      ? 'bg-slate-100 text-slate-700'
                      : 'bg-white/[0.06] text-slate-300'
                  }`}
                >
                  {gn}
                </span>
              ))}
          </div>
        </div>

        {/* Exact 4-Cell Live Digital Countdown Matrix (`DAYS : HOURS : MINS : SECS`) */}
        <CardPrecisionCountdown releaseDate={effectiveReleaseDate} isLight={isLight} />

        {/* Bottom Action Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onOpenStore()
              }}
              className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-black transition-colors cursor-pointer ${
                isLight
                  ? 'bg-slate-900 text-white hover:bg-indigo-600'
                  : 'bg-cyan-400 text-slate-950 hover:bg-cyan-300'
              }`}
            >
              <ExternalLink className="size-3.5" />
              <span>Store Page</span>
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onOpenHub()
              }}
              className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition-colors cursor-pointer ${
                isLight
                  ? 'border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200'
                  : 'border-white/12 bg-white/[0.06] text-white hover:bg-white/12'
              }`}
            >
              <Film className="size-3.5" />
              <span>Hub &amp; Media</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={busy}
              onClick={(e) => {
                e.stopPropagation()
                onPromote()
              }}
              title="Move to Library"
              className={`flex items-center gap-1 rounded-xl border px-2.5 py-2 text-xs font-bold transition-colors cursor-pointer ${
                isLight
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                  : 'border-emerald-400/30 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
              }`}
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              <span className="hidden sm:inline">Library</span>
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={(e) => {
                e.stopPropagation()
                onRemove()
              }}
              title="Remove from Wishlist"
              className={`flex size-8 items-center justify-center rounded-xl border transition-colors cursor-pointer ${
                isLight
                  ? 'border-slate-200 text-slate-400 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600'
                  : 'border-white/10 text-slate-400 hover:border-rose-500/40 hover:bg-rose-500/15 hover:text-rose-300'
              }`}
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * 3:4 Vertical Box-Art Poster Card with live `DD : HH : MM : SS` ticker bar.
 */
const WishlistPosterVaultCard: React.FC<{
  game: Game
  matchedHubGame?: HubGame
  effectiveReleaseDate: string | null
  isLight: boolean
  busy: boolean
  onFocusCard: () => void
  onOpenStore: () => void
  onOpenHub: () => void
  onPromote: () => void
  onRemove: () => void
}> = ({
  game,
  matchedHubGame,
  effectiveReleaseDate,
  isLight,
  busy,
  onFocusCard,
  onOpenStore,
  onOpenHub,
  onPromote,
  onRemove,
}) => {
  const { focusProps, isFocused } = useFocusable<HTMLDivElement>({
    id: `wishlist_poster_${game.id}`,
    scopeId: 'console_wishlist_poster_grid',
    onFocus: onFocusCard,
    onConfirm: onOpenStore,
    onOptions: onOpenHub,
  })

  const score =
    game.opencritic_score ??
    game.metacritic_score ??
    matchedHubGame?.opencritic_score ??
    matchedHubGame?.metacritic_score ??
    null

  return (
    <div
      {...focusProps}
      onMouseEnter={onFocusCard}
      onClick={onOpenStore}
      className={`group relative aspect-[3/4] w-full overflow-hidden rounded-2xl border text-left transition-transform duration-150 cursor-pointer select-none outline-none ${
        isFocused
          ? isLight
            ? 'z-20 -translate-y-1.5 scale-[1.03] border-indigo-600 ring-3 ring-indigo-500/40 shadow-xl'
            : 'z-20 -translate-y-1.5 scale-[1.03] border-cyan-400 ring-3 ring-cyan-400/45 shadow-2xl'
          : isLight
            ? 'border-slate-200/90 bg-slate-200 hover:border-slate-300 shadow-sm'
            : 'border-white/12 bg-[#111827] hover:border-white/25 shadow-md'
      }`}
    >
      <WishlistSmartArtwork
        game={game}
        hubGame={matchedHubGame}
        mode="poster"
        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
      />

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/95 via-black/35 to-black/10" />

      <div className="absolute inset-x-2.5 top-2.5 flex items-center justify-between gap-1">
        <span className="rounded-full bg-rose-500/90 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-white">
          Wishlist
        </span>
        {score && score > 0 ? (
          <span className="inline-flex items-center gap-0.5 rounded-full border border-white/20 bg-black/80 px-2 py-0.5 font-mono text-[10px] font-black text-emerald-300">
            <Sparkles className="size-2.5" />
            {score}
          </span>
        ) : null}
      </div>

      <div className="absolute inset-x-0 bottom-0 flex flex-col justify-end gap-1.5 p-3">
        <p className="line-clamp-1 text-sm font-black tracking-tight text-white drop-shadow">
          {game.name}
        </p>

        <CardPrecisionCountdown releaseDate={effectiveReleaseDate} isLight={false} compact />

        <div className="flex items-center justify-between gap-1.5 pt-1">
          <WishlistLivePriceBadge
            steamAppId={game.steam_app_id ?? matchedHubGame?.steam_app_id}
            gameName={game.name}
            matchedHubGame={matchedHubGame}
            isLight={false}
          />

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onOpenHub()
              }}
              title="Game Hub"
              className="flex size-6 items-center justify-center rounded-lg border border-white/15 bg-white/10 text-white hover:bg-cyan-400 hover:text-slate-950 transition-colors cursor-pointer"
            >
              <Film className="size-3" />
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={(e) => {
                e.stopPropagation()
                onPromote()
              }}
              title="Move to Library"
              className="flex size-6 items-center justify-center rounded-lg border border-emerald-400/30 bg-emerald-500/20 text-emerald-300 hover:bg-emerald-400 hover:text-slate-950 transition-colors cursor-pointer"
            >
              <Plus className="size-3" />
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={(e) => {
                e.stopPropagation()
                onRemove()
              }}
              title="Remove"
              className="flex size-6 items-center justify-center rounded-lg border border-white/15 bg-black/50 text-slate-300 hover:bg-rose-500 hover:text-white transition-colors cursor-pointer"
            >
              <Trash2 className="size-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * 3:4 Poster Discovery Shelf at the bottom of Wishlist for quick 1-click Wishlisting.
 */
const WishlistDiscoveryPosterShelf: React.FC<{
  wishlistGames: Game[]
  storeDeals: HubGame[]
  storeUpcoming: HubGame[]
  storeTopRated: HubGame[]
  isLight: boolean
  onSelectHubGame: (hubGame: HubGame) => void
  onRefreshGames: () => void
}> = ({
  wishlistGames,
  storeDeals,
  storeUpcoming,
  storeTopRated,
  isLight,
  onSelectHubGame,
  onRefreshGames,
}) => {
  const [addingId, setAddingId] = useState<number | null>(null)

  const suggestions = useMemo(() => {
    const existingCanon = new Set(
      wishlistGames.map((g) => normalizeCanonicalStoreTitle(g.name)),
    )
    const existingIgdb = new Set(
      wishlistGames.map((g) => g.igdb_id).filter((id): id is number => Boolean(id)),
    )

    const out: HubGame[] = []
    const seen = new Set<string>()

    for (const hg of [...storeUpcoming, ...storeDeals, ...storeTopRated]) {
      const canon = normalizeCanonicalStoreTitle(hg.name)
      if (!canon || seen.has(canon)) continue
      if (existingCanon.has(canon) || existingIgdb.has(hg.igdb_id)) continue
      if (!hg.cover_url && !hg.backdrop_url && !hg.steam_app_id) continue
      seen.add(canon)
      out.push(hg)
      if (out.length >= 6) break
    }
    return out
  }, [wishlistGames, storeUpcoming, storeDeals, storeTopRated])

  if (suggestions.length === 0) return null

  const handleQuickWishlist = async (hg: HubGame) => {
    setAddingId(hg.igdb_id)
    try {
      await addGameToWishlist(hg.igdb_id)
      toast.success(`Added "${hg.name}" to your Wishlist!`)
      onRefreshGames()
    } catch {
      toast.error(`Could not add "${hg.name}" to Wishlist`)
    } finally {
      setAddingId(null)
    }
  }

  return (
    <section className="space-y-3 pt-4">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <Flame className={`size-4 ${isLight ? 'text-rose-600' : 'text-rose-400'}`} />
          <h2
            className={`text-sm font-black uppercase tracking-wider ${
              isLight ? 'text-slate-800' : 'text-slate-200'
            }`}
          >
            Recommended For Your Launch Radar
          </h2>
        </div>
        <span className={`inline-flex items-center gap-1 text-[11px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
          <Tag className="size-3" />
          Upcoming &amp; On Sale
        </span>
      </div>

      <FocusScope
        id="console_wishlist_discovery"
        orientation="horizontal"
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5"
      >
        {suggestions.map((hg) => (
          <DiscoveryPosterCard
            key={hg.igdb_id}
            game={hg}
            isLight={isLight}
            adding={addingId === hg.igdb_id}
            onInspect={() => onSelectHubGame(hg)}
            onAdd={() => void handleQuickWishlist(hg)}
          />
        ))}
      </FocusScope>
    </section>
  )
}

const DiscoveryPosterCard: React.FC<{
  game: HubGame
  isLight: boolean
  adding: boolean
  onInspect: () => void
  onAdd: () => void
}> = ({ game, isLight, adding, onInspect, onAdd }) => {
  const { focusProps, isFocused } = useFocusable<HTMLDivElement>({
    id: `wishlist_disc_${game.igdb_id}`,
    scopeId: 'console_wishlist_discovery',
    onFocus: () => {
      useConsoleStore
        .getState()
        .setFocusedBackdropUrl(game.backdrop_url ?? game.cover_url)
    },
    onConfirm: onInspect,
    onOptions: onAdd,
  })

  return (
    <div
      {...focusProps}
      onClick={onInspect}
      className={`group relative aspect-[3/4] overflow-hidden rounded-2xl border transition-transform duration-150 cursor-pointer outline-none ${
        isFocused
          ? 'scale-[1.03] border-cyan-400 ring-2 ring-cyan-400 shadow-lg'
          : isLight
            ? 'border-slate-200/90 bg-slate-200 hover:border-slate-300 shadow-2xs'
            : 'border-white/10 bg-[#0b1020]/75 hover:border-white/20'
      }`}
    >
      <WishlistSmartArtwork
        hubGame={game}
        mode="poster"
        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/92 via-black/30 to-transparent" />

      {game.discount_percent && game.discount_percent > 0 ? (
        <span className="absolute left-2 top-2 rounded-md bg-emerald-400 px-1.5 py-0.5 font-mono text-[10px] font-black text-slate-950">
          -{game.discount_percent}%
        </span>
      ) : null}

      <div className="absolute inset-x-2.5 bottom-2.5 flex items-end justify-between gap-1.5">
        <div className="min-w-0">
          <p className="truncate text-xs font-black text-white">{game.name}</p>
          <p className="truncate font-mono text-[10px] font-bold text-slate-300">
            {game.sale_price_formatted || game.release_date || 'Store'}
          </p>
        </div>

        <button
          type="button"
          disabled={adding}
          onClick={(e) => {
            e.stopPropagation()
            onAdd()
          }}
          title="Add to Wishlist"
          className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-rose-500 text-white hover:bg-rose-400 transition-colors cursor-pointer shadow"
        >
          {adding ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
        </button>
      </div>
    </div>
  )
}
