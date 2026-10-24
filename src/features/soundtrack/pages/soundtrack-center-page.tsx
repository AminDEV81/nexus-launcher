import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Activity,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Compass,
  Disc,
  Disc3,
  EyeOff,
  Flame,
  FolderSync,
  Gamepad2,
  Globe,
  HardDrive,
  Headphones,
  Heart,
  History,
  ListMusic,
  Loader2,
  Maximize2,
  Moon,
  Music,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Search,
  Repeat,
  Shuffle,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Sparkles,
  Swords,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { assetUrl } from '@/lib/asset-url'
import { playButtonClick } from '@/lib/sound-engine'
import { queryClient } from '@/app/query-client'
import { useAnimationSpeed } from '@/hooks/use-animation-speed'
import { useGames } from '@/features/library/hooks/use-games'
import { useSoundtrackPlayer } from '../hooks/use-soundtrack-player'
import {
  cleanGameTitleFromAlbumTitle,
  deriveGameIdentityFromAlbum,
} from '../store/soundtrack-store'
import {
  getAllCuratedSoundtracks,
  lookupCuratedSoundtrack,
  resolveAlbumCoverFallback,
} from '../services/curated-soundtracks'
import { soundtrackResolver } from '../services/soundtrack-resolver'
import {
  getAllSoundtrackAlbums,
  getSoundtrackAlbum,
  getSoundtrackDownloads,
  getSoundtrackFavorites,
  getSoundtrackLocalFiles,
  scanSoundtrackLibrary,
} from '../services/tauri-soundtrack'
import { AlbumCard } from '../components/center/album-card'
import { TrackRow } from '../components/center/track-row'
import { AlbumDetailModal } from '../components/center/album-detail-modal'
import { AudioVisualizer } from '../components/player/audio-visualizer'
import type { SoundtrackAlbumWithTracks, SoundtrackTrack } from '../types'

type CenterTab = 'overview' | 'games' | 'radios' | 'favorites' | 'queue' | 'downloaded'

type VibeFilterId =
  | 'all'
  | 'boss_action'
  | 'rpg_fantasy'
  | 'cyber_scifi'
  | 'story_emotional'
  | 'open_world'
  | 'horror_dark'

const VIBE_FILTERS: Array<{
  id: VibeFilterId
  label: string
  icon: typeof Sparkles
  keywords: string[]
}> = [
  { id: 'all', label: 'All Soundtracks', icon: Sparkles, keywords: [] },
  {
    id: 'boss_action',
    label: 'Action & Boss Themes',
    icon: Swords,
    keywords: [
      'elden ring',
      'god of war',
      'dark souls',
      'sekiro',
      'wukong',
      'doom',
      'devil may cry',
      'hades',
      'monster hunter',
      'bloodborne',
      'metal gear',
    ],
  },
  {
    id: 'rpg_fantasy',
    label: 'RPG & Epic Fantasy',
    icon: Flame,
    keywords: [
      'witcher',
      'baldur',
      'skyrim',
      'final fantasy',
      'persona',
      'clair obscur',
      'metaphor',
      'dragon',
      'kingdom come',
      'zelda',
      'chrono',
    ],
  },
  {
    id: 'cyber_scifi',
    label: 'Cyberpunk & Sci-Fi',
    icon: Activity,
    keywords: [
      'cyberpunk',
      'mass effect',
      'halo',
      'nier',
      'starfield',
      'armored core',
      'death stranding',
      'control',
      'half-life',
      'portal',
      'helldivers',
    ],
  },
  {
    id: 'story_emotional',
    label: 'Emotional & Story',
    icon: Heart,
    keywords: [
      'last of us',
      'clair obscur',
      'red dead',
      'life is strange',
      'detroit',
      'undertale',
      'celeste',
      'ori',
      'hollow knight',
      'disco elysium',
    ],
  },
  {
    id: 'open_world',
    label: 'Open World & Horizon',
    icon: Compass,
    keywords: [
      'red dead',
      'tsushima',
      'horizon',
      'witcher',
      'grand theft auto',
      'assassin',
      'zelda',
      'skyrim',
      'outer wilds',
      'stray',
    ],
  },
  {
    id: 'horror_dark',
    label: 'Survival & Dark',
    icon: Moon,
    keywords: [
      'silent hill',
      'resident evil',
      'alan wake',
      'dead space',
      'bloodborne',
      'lies of p',
      'diablo',
      'dark souls',
    ],
  },
]

const DYNAMIC_DISCOVERY_SEEDS = [
  'Octopath Traveler II',
  'Xenoblade Chronicles 3',
  'Sea of Stars',
  'Cuphead',
  'Katana ZERO',
  'Furi',
  'Transistor',
  'Bastion',
  'Divinity Original Sin 2',
  'Frostpunk',
  'Guilty Gear Strive',
  'Tales of Arise',
  'Yakuza 0',
  'Like a Dragon Infinite Wealth',
  'Deus Ex Human Revolution',
  'BioShock Infinite',
  'Dishonored 2',
  'Prey',
  'Metro Exodus',
  'Warhammer 40000 Darktide',
  'Warhammer 40000 Space Marine 2',
  'Helldivers 2',
  'Returnal',
  'Ghostrunner',
  'Astral Chain',
  'Bayonetta 3',
  'Dead Cells',
  'Blasphemous 2',
  'Hyper Light Drifter',
  'VA-11 Hall-A',
  'gris',
  'Journey',
  'Shadow of the Colossus',
  'Kingdom Hearts II',
  'Dragon Age Inquisition',
  'Max Payne 3',
  'LA Noire',
  'Sleeping Dogs',
  'Ace Combat 7',
  'Metal Gear Rising',
  'Chrono Trigger',
  'Final Fantasy XVI',
  'Monster Hunter Wilds',
  'NieR Replicant',
  'Persona 3 Reload',
  'Metaphor ReFantazio',
  'Armored Core VI',
  'Hi-Fi RUSH',
  'Stellar Blade',
  'Lies of P',
  'Outer Wilds',
  'Deltarune',
  'Street Fighter 6',
  'Tekken 8',
  'Forza Horizon 5',
  'Subnautica',
  'Risk of Rain 2',
  'Hades II',
]

function normalizeGameOstKey(rawTitle: string): string {
  return cleanGameTitleFromAlbumTitle(rawTitle)
    .toLowerCase()
    .replace(/\b(original|official|video\s*game|game|soundtrack|score|ost|music|album|deluxe|edition|complete|vol\.?\s*\d+|volume\s*\d+)\b/gi, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

interface MoodStation {
  id: string
  title: string
  subtitle: string
  badge: string
  gradient: string
  accentText: string
  icon: typeof Flame
  keywords: string[]
  onlineSeeds: string[]
}

const MOOD_STATIONS: MoodStation[] = [
  {
    id: 'boss_orchestral',
    title: 'Boss Fight & Epic Orchestral',
    subtitle:
      'Live-streamed choirs, brass & symphonic boss themes — dynamically refreshed from online OST catalogs',
    badge: 'LIVE SYMPHONY',
    gradient: 'from-amber-500/20 via-rose-500/10 to-surface',
    accentText: 'text-amber-400 border-amber-500/35 bg-amber-500/10',
    icon: Flame,
    keywords: [
      'elden ring',
      'god of war',
      'baldur',
      'dark souls',
      'sekiro',
      'wukong',
      'final fantasy',
      'skyrim',
      'bloodborne',
      'monster hunter',
    ],
    onlineSeeds: [
      'Elden Ring Shadow of the Erdtree',
      'Dark Souls III',
      'Bloodborne',
      'God of War Ragnarok',
      'Final Fantasy XVI',
      'Final Fantasy VII Rebirth',
      'Black Myth Wukong',
      'Monster Hunter Wilds',
      'Baldur’s Gate 3',
      'Sekiro Shadows Die Twice',
      'Lies of P',
      'Dragon’s Dogma 2',
      'Metaphor ReFantazio',
      'Skyrim',
      'Shadow of the Colossus',
      'Stellar Blade',
    ],
  },
  {
    id: 'cyber_pulse',
    title: 'Cyberpunk & High-Voltage Pulse',
    subtitle:
      'Live synthwave, industrial combat metal & high-BPM action scores streamed fresh on every session',
    badge: 'LIVE ADRENALINE',
    gradient: 'from-cyan-500/20 via-fuchsia-500/10 to-surface',
    accentText: 'text-cyan-400 border-cyan-500/35 bg-cyan-500/10',
    icon: Activity,
    keywords: [
      'cyberpunk',
      'doom',
      'hades',
      'armored core',
      'control',
      'persona',
      'spider-man',
      'devil may cry',
      'metal gear',
    ],
    onlineSeeds: [
      'Cyberpunk 2077 Phantom Liberty',
      'DOOM Eternal',
      'Devil May Cry 5',
      'Metal Gear Rising Revengeance',
      'Hades II',
      'Armored Core VI',
      'Hi-Fi RUSH',
      'Ghostrunner 2',
      'Hotline Miami',
      'Katana ZERO',
      'Ultrakill',
      'Persona 5 Strikers',
      'Sonic Frontiers',
      'Tekken 8',
      'Street Fighter 6',
      'Helldivers 2',
    ],
  },
  {
    id: 'open_world',
    title: 'Open World & Horizon Exploration',
    subtitle:
      'Sweeping frontier, wilderness & cosmic journey scores dynamically pulled from online archives',
    badge: 'LIVE HORIZON',
    gradient: 'from-emerald-500/20 via-teal-500/10 to-surface',
    accentText: 'text-emerald-400 border-emerald-500/35 bg-emerald-500/10',
    icon: Compass,
    keywords: [
      'witcher',
      'red dead',
      'tsushima',
      'horizon',
      'skyrim',
      'kingdom come',
      'monster hunter',
      'zelda',
    ],
    onlineSeeds: [
      'The Witcher 3 Blood and Wine',
      'Red Dead Redemption 2',
      'Ghost of Tsushima',
      'Horizon Forbidden West',
      'The Legend of Zelda Tears of the Kingdom',
      'Kingdom Come Deliverance II',
      'Assassin’s Creed Shadows',
      'Assassin’s Creed Valhalla',
      'Starfield',
      'No Man’s Sky',
      'Subnautica',
      'Death Stranding',
      'Xenoblade Chronicles 3',
      'genshin impact',
      'Sea of Thieves',
      'Forza Horizon 5',
    ],
  },
  {
    id: 'emotional_story',
    title: 'Emotional & Cinematic Story',
    subtitle:
      'Poignant vocal, piano & acoustic masterpieces updated live with rotating narrative scores',
    badge: 'LIVE CINEMATIC',
    gradient: 'from-violet-500/20 via-indigo-500/10 to-surface',
    accentText: 'text-violet-400 border-violet-500/35 bg-violet-500/10',
    icon: Heart,
    keywords: [
      'clair obscur',
      'last of us',
      'nier',
      'death stranding',
      'silent hill',
      'detroit',
      'lies of p',
      'ori',
    ],
    onlineSeeds: [
      'Clair Obscur Expedition 33',
      'NieR Automata',
      'NieR Replicant',
      'The Last of Us Part II',
      'Ori and the Will of the Wisps',
      'Life is Strange',
      'Detroit Become Human',
      'Silent Hill 2',
      'Final Fantasy X',
      'Chrono Cross',
      'Persona 3 Reload',
      'Gris',
      'Journey',
      'A Plague Tale Requiem',
      'Alan Wake 2',
      'Bioshock Infinite',
    ],
  },
  {
    id: 'late_night',
    title: 'Late Night Focus & Lo-Fi Ambient',
    subtitle:
      'Nocturnal piano, synth pads & atmospheric chill mixes fetched live for coding & late-night gaming',
    badge: 'LIVE AMBIENT',
    gradient: 'from-blue-500/20 via-sky-500/10 to-surface',
    accentText: 'text-sky-400 border-sky-500/35 bg-sky-500/10',
    icon: Moon,
    keywords: [
      'hollow knight',
      'celeste',
      'outer wilds',
      'stray',
      'disco elysium',
      'undertale',
      'alan wake',
    ],
    onlineSeeds: [
      'Hollow Knight',
      'Celeste',
      'Outer Wilds',
      'Stray',
      'Disco Elysium',
      'Undertale',
      'Deltarune',
      'Stardew Valley',
      'Minecraft Volume Alpha',
      'Animal Crossing New Horizons',
      'VA-11 Hall-A',
      'Coffee Talk',
      'Hyper Light Drifter',
      'Risk of Rain 2',
      'Fez',
      'Dave the Diver',
    ],
  },
  {
    id: 'masterpiece_mix',
    title: 'Nexus Live Global Shuffle',
    subtitle:
      'Continuous online discovery radio streaming fresh tracks across 100+ legendary & new video game scores',
    badge: '24/7 ONLINE STREAM',
    gradient: 'from-accent/25 via-purple-500/10 to-surface',
    accentText: 'text-accent border-accent/35 bg-accent/10',
    icon: Radio,
    keywords: [],
    onlineSeeds: [
      'Elden Ring',
      'Cyberpunk 2077',
      'Baldur’s Gate 3',
      'Clair Obscur Expedition 33',
      'Persona 5 Royal',
      'NieR Automata',
      'The Witcher 3',
      'God of War Ragnarok',
      'Red Dead Redemption 2',
      'Final Fantasy VII Rebirth',
      'Halo 3',
      'Mass Effect 2',
      'Silent Hill 2',
      'DOOM Eternal',
      'Devil May Cry 5',
      'Hollow Knight',
      'Hades',
      'Kingdom Hearts II',
      'Chrono Trigger',
      'Metal Gear Solid 3',
    ],
  },
]

function formatSeconds(sec: number) {
  if (!sec || sec <= 0 || !Number.isFinite(sec)) return '0:00'
  const total = Math.floor(sec)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), ms)
    return () => window.clearTimeout(id)
  }, [value, ms])
  return debounced
}


type StudioEqPresetId = 'flat' | 'boss_bass' | 'symphonic' | 'cyber_synth' | 'night_lofi'

const STUDIO_EQ_PRESETS: Array<{
  id: StudioEqPresetId
  label: string
  sublabel: string
  bands: number[] // 10 frequency bands (32Hz..16kHz) in dB (-6 to +8)
}> = [
  {
    id: 'flat',
    label: 'Studio Reference',
    sublabel: 'Flat 24-Bit Mastering Curve',
    bands: [1, 1, 0, 0, 1, 1, 1, 2, 1, 1],
  },
  {
    id: 'boss_bass',
    label: 'Boss Arena Bass',
    sublabel: '+6dB Sub-Bass & Percussion Punch',
    bands: [7, 8, 6, 3, 1, 0, 2, 4, 5, 4],
  },
  {
    id: 'symphonic',
    label: 'Symphonic Hall',
    sublabel: 'Wide Soundstage for Strings & Choirs',
    bands: [4, 5, 3, 2, 3, 5, 6, 7, 6, 5],
  },
  {
    id: 'cyber_synth',
    label: 'Cyber Synth',
    sublabel: 'V-Shaped High-Voltage Analog Harmonics',
    bands: [8, 7, 4, -1, 0, 3, 6, 8, 8, 7],
  },
  {
    id: 'night_lofi',
    label: 'Night Lo-Fi Warmth',
    sublabel: 'Smooth High Roll-Off & Warm Midrange',
    bands: [5, 6, 5, 4, 3, 2, 0, -2, -3, -4],
  },
]

const EQ_FREQ_LABELS = ['32', '64', '125', '250', '500', '1k', '2k', '4k', '8k', '16k']

const WAVEFORM_BAR_HEIGHTS = [
  28, 42, 64, 50, 78, 92, 60, 45, 84, 96, 72, 54, 68, 88, 100, 76, 58, 44, 66, 86, 94, 70,
  52, 80, 98, 82, 62, 48, 74, 90, 65, 50, 85, 95, 75, 56, 40, 68, 88, 72, 55, 46, 60, 36,
]

export function SoundtrackCenterPage() {
  const speed = useAnimationSpeed()
  const [activeTab, setActiveTab] = useState<CenterTab>('overview')
  const [activeVibe, setActiveVibe] = useState<VibeFilterId>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedAlbum, setSelectedAlbum] = useState<SoundtrackAlbumWithTracks | null>(null)
  const [isScanning, setIsScanning] = useState(false)
  const [isSearchingOnline, setIsSearchingOnline] = useState(false)
  const [isSyncingLiveFeed, setIsSyncingLiveFeed] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [visibleAlbumLimit, setVisibleAlbumLimit] = useState(18)
  const [visibleTrackLimit, setVisibleTrackLimit] = useState(18)
  const [onlineDiscovered, setOnlineDiscovered] = useState<SoundtrackAlbumWithTracks[]>([])
  const [rotationNonce, setRotationNonce] = useState(0)
  const [activeStationId, setActiveStationId] = useState<string | null>(null)
  const [loadingStationId, setLoadingStationId] = useState<string | null>(null)
  const [stationLiveSeeds, setStationLiveSeeds] = useState<Record<string, string[]>>({})
  const [radioWaveGeneration, setRadioWaveGeneration] = useState(1)
  const dynamicSeedIdxRef = useRef(0)
  const radioSeedCursorRef = useRef<Record<string, number>>({})

  const debouncedSearch = useDebouncedValue(searchQuery.trim(), 280)

  const { data: libraryGames = [] } = useGames()

  const {
    currentTrack,
    currentAlbum,
    currentGame,
    playbackState,
    currentTime,
    duration,
    shuffle,
    visualizerMode,
    favorites,
    savedFavoriteTracks,
    savedFavoriteAlbums,
    queue,
    playTrack,
    playAlbum,
    togglePlay,
    next,
    previous,
    seek,
    volume,
    isMuted,
    repeatMode,
     setVolume,
    toggleMute,
    cycleRepeatMode,
    toggleShuffle,
    toggleFavorite,
    setExpanded,
    setVisualizerMode,
    clearQueue,
  } = useSoundtrackPlayer()

  // Load all albums saved in SQLite
  const { data: allAlbums = [], refetch: refetchAlbums } = useQuery({
    queryKey: ['soundtrack', 'all-albums', favorites.size],
    queryFn: () => getAllSoundtrackAlbums(),
  })

  // Load local scanned audio files
  const { data: localFiles = [], refetch: refetchLocal } = useQuery({
    queryKey: ['soundtrack', 'local-files'],
    queryFn: () => getSoundtrackLocalFiles(),
  })

  // Load completed/active downloads from SQLite
  const { data: downloadHistory = [] } = useQuery({
    queryKey: ['soundtrack', 'downloads'],
    queryFn: () => getSoundtrackDownloads(),
  })

  // Load all favorite records from SQLite
  const { data: favoriteRows = [] } = useQuery({
    queryKey: ['soundtrack', 'favorites-list', favorites.size],
    queryFn: () => getSoundtrackFavorites(),
  })

  // Full album objects with tracks from SQLite
  const { data: dbAlbumsWithTracks = [] } = useQuery({
    queryKey: [
      'soundtrack',
      'albums-with-tracks',
      allAlbums.map((a) => a.id).join(','),
      favorites.size,
    ],
    queryFn: async () => {
      const results: SoundtrackAlbumWithTracks[] = []
      for (const alb of allAlbums.slice(0, 80)) {
        const full = await getSoundtrackAlbum(alb.id)
        if (full && full.tracks.length > 0) results.push(full)
      }
      return results
    },
    enabled: allAlbums.length > 0,
  })

  // Built-in Curated Masterpiece Catalog + User Library Game OST Matches
  const curatedCatalog = useMemo(() => getAllCuratedSoundtracks(), [])

  const libraryMatchedAlbums = useMemo(() => {
    const matched: SoundtrackAlbumWithTracks[] = []
    const seenIds = new Set<string>()

    for (const g of libraryGames) {
      if (g.is_hidden) continue
      const fromDb = dbAlbumsWithTracks.find(
        (a) =>
          a.album.game_id === g.id ||
          a.album.game_id === `igdb_${g.igdb_id}` ||
          cleanGameTitleFromAlbumTitle(a.album.title).toLowerCase() === g.name.toLowerCase(),
      )
      if (fromDb && !seenIds.has(fromDb.album.id)) {
        seenIds.add(fromDb.album.id)
        matched.push({
          album: {
            ...fromDb.album,
            game_id: g.id,
            cover_url: fromDb.album.cover_url || assetUrl(g.cover_path),
          },
          tracks: fromDb.tracks,
        })
        continue
      }

      const curated = lookupCuratedSoundtrack({
        gameId: g.id,
        title: g.name,
        releaseYear: g.release_date?.split('-')[0] || null,
        coverUrl: assetUrl(g.cover_path),
      })
      if (curated && !seenIds.has(curated.album.id)) {
        seenIds.add(curated.album.id)
        matched.push(curated)
      }
    }
    return matched
  }, [libraryGames, dbAlbumsWithTracks])

  // Auto-trigger fast parallel online soundtrack search whenever user types 2+ characters!
  useEffect(() => {
    if (debouncedSearch.length < 2) {
      setIsSearchingOnline(false)
      return
    }

    let cancelled = false
    setIsSearchingOnline(true)

    soundtrackResolver
      .searchOnlineSoundtracksFast(debouncedSearch)
      .then((found) => {
        if (cancelled) return
        if (found && found.length > 0) {
          setOnlineDiscovered((prev) => {
            const seenIds = new Set(prev.map((p) => p.album.id))
            const seenKeys = new Set(prev.map((p) => normalizeGameOstKey(p.album.title)))
            const fresh = found.filter((f) => {
              const k = normalizeGameOstKey(f.album.title)
              if (seenIds.has(f.album.id) || (k && seenKeys.has(k))) return false
              seenIds.add(f.album.id)
              if (k) seenKeys.add(k)
              return true
            })
            return [...prev, ...fresh]
          })
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setIsSearchingOnline(false)
      })

    return () => {
      cancelled = true
    }
  }, [debouncedSearch])

  // All known albums & tracks across every source (including right-sidebar savedFavoriteAlbums & savedFavoriteTracks!)
  const { allKnownAlbumsById, allKnownFullAlbumsById, allKnownTracksById } = useMemo(() => {
    const albMap = new Map<string, SoundtrackAlbumWithTracks['album']>()
    const fullAlbMap = new Map<string, SoundtrackAlbumWithTracks>()
    const trkMap = new Map<
      string,
      { track: SoundtrackTrack; album: SoundtrackAlbumWithTracks['album'] }
    >()

    const registerSource = (list: SoundtrackAlbumWithTracks[]) => {
      for (const item of list) {
        if (!item || !item.album || !item.tracks || item.tracks.length === 0) continue
        const fallbackCover = item.album.cover_url || resolveAlbumCoverFallback(item.album.title)
        const enrichedAlbum = {
          ...item.album,
          cover_url: fallbackCover,
        }
        const enrichedFull = {
          album: enrichedAlbum,
          tracks: item.tracks,
        }
        if (!albMap.has(enrichedAlbum.id)) {
          albMap.set(enrichedAlbum.id, enrichedAlbum)
          fullAlbMap.set(enrichedAlbum.id, enrichedFull)
        }
        for (const t of item.tracks) {
          if (!trkMap.has(t.id)) {
            trkMap.set(t.id, {
              track: { ...t, album_id: t.album_id || enrichedAlbum.id },
              album: enrichedAlbum,
            })
          }
        }
      }
    }

    // 1. Register direct in-memory/persisted favorites from right-hand sidebar & player first!
    registerSource(Object.values(savedFavoriteAlbums || {}))
    for (const [trkId, entry] of Object.entries(savedFavoriteTracks || {})) {
      if (!entry?.track) continue
      const alb = entry.album
        ? {
            ...entry.album,
            cover_url:
              entry.album.cover_url || resolveAlbumCoverFallback(entry.album.title),
          }
        : null
      if (alb && !albMap.has(alb.id)) {
        albMap.set(alb.id, alb)
      }
      if (!trkMap.has(trkId)) {
        trkMap.set(trkId, {
          track: { ...entry.track, album_id: entry.track.album_id || alb?.id || '' },
          album:
            alb || {
              id: entry.track.album_id || `fav_alb_${trkId}`,
              game_id: null,
              title: entry.track.artist || entry.track.title,
              album_type: 'original_soundtrack',
              artist: entry.track.artist || 'Original Game Soundtrack',
              release_date: null,
              cover_url: resolveAlbumCoverFallback(entry.track.title),
              track_count: 1,
              total_duration_ms: entry.track.duration_ms || 0,
              provider_id: entry.track.provider_id || 'curated',
              external_id: null,
            },
        })
      }
    }

    // 2. Register Curated, Library-Matched, SQLite DB, and Online Discovered
    registerSource(curatedCatalog)
    registerSource(libraryMatchedAlbums)
    registerSource(dbAlbumsWithTracks)
    registerSource(onlineDiscovered)

    return {
      allKnownAlbumsById: albMap,
      allKnownFullAlbumsById: fullAlbMap,
      allKnownTracksById: trkMap,
    }
  }, [
    savedFavoriteAlbums,
    savedFavoriteTracks,
    curatedCatalog,
    libraryMatchedAlbums,
    dbAlbumsWithTracks,
    onlineDiscovered,
  ])

  // Unified Master Album Catalog for Browse Grids (Preserves existing list order and appends newly discovered albums at the end without duplicates!)
  const albumsWithTracks = useMemo(() => {
    const merged: SoundtrackAlbumWithTracks[] = []
    const seenTitles = new Set<string>()
    const seenIds = new Set<string>()

    const addUnique = (item: SoundtrackAlbumWithTracks) => {
      if (!item || !item.album || !item.tracks || item.tracks.length === 0) return
      const normTitle = normalizeGameOstKey(item.album.title)
      const exactTitle = cleanGameTitleFromAlbumTitle(item.album.title).toLowerCase().trim()
      if (seenIds.has(item.album.id)) return
      if ((normTitle && seenTitles.has(normTitle)) || (exactTitle && seenTitles.has(exactTitle))) {
        return
      }
      seenIds.add(item.album.id)
      if (normTitle) seenTitles.add(normTitle)
      if (exactTitle) seenTitles.add(exactTitle)
      const fallbackCover = item.album.cover_url || resolveAlbumCoverFallback(item.album.title)
      merged.push({
        album: {
          ...item.album,
          cover_url: fallbackCover,
        },
        tracks: item.tracks,
      })
    }

    // Keep base catalog stable at the top and append onlineDiscovered at the end!
    for (const item of libraryMatchedAlbums) addUnique(item)
    for (const item of curatedCatalog) addUnique(item)
    for (const item of dbAlbumsWithTracks) addUnique(item)
    for (const item of Object.values(savedFavoriteAlbums || {})) addUnique(item)
    for (const item of onlineDiscovered) addUnique(item)

    return merged
  }, [
    savedFavoriteAlbums,
    onlineDiscovered,
    libraryMatchedAlbums,
    curatedCatalog,
    dbAlbumsWithTracks,
  ])

  const albumsById = allKnownAlbumsById
  const fullAlbumsById = allKnownFullAlbumsById

  // Combined Favorite IDs set (merges Zustand `favorites` + SQLite `favoriteRows` so nothing is ever missed)
  const effectiveFavoriteIds = useMemo(() => {
    const set = new Set<string>(favorites)
    for (const row of favoriteRows) {
      if (row.target_id) set.add(row.target_id)
    }
    return set
  }, [favorites, favoriteRows])

  // Dynamic Spotlight Shelf
  const spotlightShelfAlbums = useMemo(() => {
    if (albumsWithTracks.length <= 8) return albumsWithTracks
    const copy = [...albumsWithTracks]
    if (rotationNonce > 0) {
      let state = (rotationNonce * 2654435761) >>> 0
      for (let i = copy.length - 1; i > 0; i--) {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0
        const j = state % (i + 1)
        ;[copy[i], copy[j]] = [copy[j], copy[i]]
      }
    }
    return copy.slice(0, 12)
  }, [albumsWithTracks, rotationNonce])

  async function handleSyncLiveFeed() {
    if (isSyncingLiveFeed) return
    playButtonClick()
    setIsSyncingLiveFeed(true)
    setRotationNonce((n) => n + 1)

    const seed1 =
      DYNAMIC_DISCOVERY_SEEDS[dynamicSeedIdxRef.current % DYNAMIC_DISCOVERY_SEEDS.length]
    const seed2 =
      DYNAMIC_DISCOVERY_SEEDS[(dynamicSeedIdxRef.current + 1) % DYNAMIC_DISCOVERY_SEEDS.length]
    dynamicSeedIdxRef.current += 2

    try {
      const [res1, res2] = await Promise.all([
        soundtrackResolver.searchOnlineSoundtracksFast(seed1, true),
        soundtrackResolver.searchOnlineSoundtracksFast(seed2, true),
      ])
      const combined = [...res1, ...res2]
      if (combined.length > 0) {
        setOnlineDiscovered((prev) => {
          const seen = new Set(combined.map((f) => f.album.id))
          return [...combined, ...prev.filter((p) => !seen.has(p.album.id))]
        })
      }
      toast.success('Synced live online soundtracks & rotated featured shelves!')
    } catch {
      toast.success('Rotated soundtrack discovery shelves!')
    } finally {
      setIsSyncingLiveFeed(false)
    }
  }

  async function handleLoadMoreSoundtracks() {
    playButtonClick()
    if (isLoadingMore) return
    setIsLoadingMore(true)

    // Snapshot existing album IDs and normalized game keys so we never add duplicates
    const existingIds = new Set(albumsWithTracks.map((a) => a.album.id))
    const existingKeys = new Set(
      albumsWithTracks.map((a) => normalizeGameOstKey(a.album.title)).filter(Boolean),
    )

    try {
      const q = searchQuery.trim()
      const seedsToFetch: string[] = []
      if (q.length >= 2) {
        seedsToFetch.push(`${q} Soundtrack`, `${q} OST`, `${q} Original Score`)
      } else {
        let attempts = 0
        while (seedsToFetch.length < 4 && attempts < DYNAMIC_DISCOVERY_SEEDS.length) {
          const candidate =
            DYNAMIC_DISCOVERY_SEEDS[dynamicSeedIdxRef.current % DYNAMIC_DISCOVERY_SEEDS.length]
          dynamicSeedIdxRef.current += 1
          attempts += 1
          const candidateKey = normalizeGameOstKey(candidate)
          if (!existingKeys.has(candidateKey)) {
            seedsToFetch.push(candidate)
          }
        }
      }

      const results = await Promise.all(
        seedsToFetch.map((seed) =>
          soundtrackResolver.searchOnlineSoundtracksFast(seed, true).catch(() => []),
        ),
      )
      const flat = results.flat()
      let addedCount = 0

      if (flat.length > 0) {
        setOnlineDiscovered((prev) => {
          const seenIds = new Set([...existingIds, ...prev.map((p) => p.album.id)])
          const seenKeys = new Set([
            ...existingKeys,
            ...prev.map((p) => normalizeGameOstKey(p.album.title)).filter(Boolean),
          ])
          const uniqueNew: SoundtrackAlbumWithTracks[] = []

          for (const item of flat) {
            if (!item?.album?.id || !item.tracks || item.tracks.length === 0) continue
            const key = normalizeGameOstKey(item.album.title)
            if (seenIds.has(item.album.id) || (key && seenKeys.has(key))) continue
            seenIds.add(item.album.id)
            if (key) seenKeys.add(key)
            uniqueNew.push(item)
          }

          addedCount = uniqueNew.length
          return uniqueNew.length > 0 ? [...prev, ...uniqueNew] : prev
        })
      }

      setVisibleAlbumLimit((prev) => Math.max(prev + 12, filteredAlbums.length + addedCount))
      if (addedCount > 0) {
        toast.success(`Added ${addedCount} new game soundtrack(s) to the end of the list!`)
      }
    } catch {
      setVisibleAlbumLimit((prev) => prev + 12)
    } finally {
      setIsLoadingMore(false)
    }
  }

  async function handleScan() {
    playButtonClick()
    setIsScanning(true)
    toast.info('Scanning music folders for local soundtracks...')
    try {
      const found = await scanSoundtrackLibrary()
      toast.success(`Scan completed: found ${found.length} audio tracks`)
      void refetchLocal()
      void refetchAlbums()
      void queryClient.invalidateQueries({ queryKey: ['soundtrack'] })
    } catch (err) {
      toast.error('Scan failed', { description: String(err) })
    } finally {
      setIsScanning(false)
    }
  }

  async function handleDiscoverOnline() {
    const q = searchQuery.trim()
    if (!q || isSearchingOnline) return
    playButtonClick()
    setIsSearchingOnline(true)
    try {
      const resolved = await soundtrackResolver.searchOnlineSoundtracksFast(q, true)
      if (resolved && resolved.length > 0) {
        setOnlineDiscovered((prev) => {
          const seen = new Set(resolved.map((f) => f.album.id))
          return [...resolved, ...prev.filter((p) => !seen.has(p.album.id))]
        })
        void refetchAlbums()
        toast.success(`Found ${resolved.length} soundtrack album(s) for "${q}"`)
        setSelectedAlbum(resolved[0])
      } else {
        toast.info(`No verified soundtrack found online for "${q}".`)
      }
    } catch {
      toast.error('Online soundtrack lookup failed.')
    } finally {
      setIsSearchingOnline(false)
    }
  }

  /**
   * Live Online Mood Radio Launcher:
   * Rotates through each station's `onlineSeeds` + user library games on every click,
   * starts playing a fresh randomized wave immediately, and streams in newly fetched
   * online tracks from Apple Music / Deezer / KHInsider so Radio never repeats the same playlist!
   */
  async function handlePlayMoodStation(station: MoodStation) {
    playButtonClick()
    setActiveStationId(station.id)
    setLoadingStationId(station.id)
    setRadioWaveGeneration((g) => g + 1)

    // Pick 3 rotating online seeds for this station (advances cursor every click!)
    const prevCursor = radioSeedCursorRef.current[station.id] ?? Math.floor(Math.random() * station.onlineSeeds.length)
    const totalSeeds = station.onlineSeeds.length
    const pickedSeeds: string[] = [
      station.onlineSeeds[prevCursor % totalSeeds],
      station.onlineSeeds[(prevCursor + 1) % totalSeeds],
      station.onlineSeeds[(prevCursor + 2) % totalSeeds],
    ]
    radioSeedCursorRef.current[station.id] = (prevCursor + 3) % totalSeeds

    // Also include a random game from the user's Library if available for personalized radio
    if (libraryGames.length > 0) {
      const randomLib = libraryGames[Math.floor(Math.random() * libraryGames.length)]
      if (randomLib?.name && !pickedSeeds.includes(randomLib.name)) {
        pickedSeeds.push(randomLib.name)
      }
    }

    setStationLiveSeeds((prev) => ({ ...prev, [station.id]: pickedSeeds.slice(0, 3) }))

    // 1. Build an instant randomized starter pool across all matching albums (all tracks, not just first 6!)
    const matchingAlbums =
      station.keywords.length === 0
        ? albumsWithTracks
        : albumsWithTracks.filter((a) => {
            const hay = `${a.album.title} ${a.album.artist || ''}`.toLowerCase()
            return station.keywords.some((kw) => hay.includes(kw))
          })

    const sourceAlbums = matchingAlbums.length > 0 ? matchingAlbums : albumsWithTracks
    const starterPool: { track: SoundtrackTrack; album: SoundtrackAlbumWithTracks['album'] }[] = []

    for (const alb of sourceAlbums) {
      const tracksCopy = [...alb.tracks]
      for (let i = tracksCopy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[tracksCopy[i], tracksCopy[j]] = [tracksCopy[j], tracksCopy[i]]
      }
      for (const trk of tracksCopy.slice(0, 4)) {
        starterPool.push({ track: trk, album: alb.album })
      }
    }

    for (let i = starterPool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[starterPool[i], starterPool[j]] = [starterPool[j], starterPool[i]]
    }

    // 2. Fetch fresh online soundtrack wave in parallel (~400ms)
    try {
      const liveWave = await soundtrackResolver.fetchLiveRadioWave(pickedSeeds, 28)
      if (liveWave.albums.length > 0) {
        setOnlineDiscovered((prev) => {
          const seen = new Set(liveWave.albums.map((f) => f.album.id))
          return [...liveWave.albums, ...prev.filter((p) => !seen.has(p.album.id))]
        })
      }

      // Combine live online tracks at the front with shuffled starter tracks (deduplicated)
      const combinedPool = [...liveWave.tracks, ...starterPool]
      const seenTrackIds = new Set<string>()
      const finalWave: { track: SoundtrackTrack; album: SoundtrackAlbumWithTracks['album'] }[] = []
      for (const item of combinedPool) {
        if (!seenTrackIds.has(item.track.id)) {
          seenTrackIds.add(item.track.id)
          finalWave.push(item)
        }
      }

      if (finalWave.length > 0) {
        // Lightly interleave the top 12 tracks so multiple games play in rotation
        const topSlice = finalWave.slice(0, 14)
        for (let i = topSlice.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[topSlice[i], topSlice[j]] = [topSlice[j], topSlice[i]]
        }
        const fullQueue = [...topSlice, ...finalWave.slice(14)].slice(0, 40)
        const chosen = fullQueue[0]
        void playTrack(
          chosen.track,
          chosen.album,
          deriveGameIdentityFromAlbum(chosen.album),
          fullQueue.map((p) => p.track),
        )
        toast.success(
          `Live Radio: "${station.title}" synced (${fullQueue.length} online tracks • ${pickedSeeds.slice(0, 2).join(' & ')})`,
        )
      }
    } catch {
      if (starterPool.length > 0) {
        const chosen = starterPool[0]
        const stationQueue = starterPool.slice(0, 35).map((p) => p.track)
        void playTrack(
          chosen.track,
          chosen.album,
          deriveGameIdentityFromAlbum(chosen.album),
          stationQueue,
        )
        toast.success(`Started "${station.title}" Radio (${stationQueue.length} tracks)`)
      }
    } finally {
      setLoadingStationId(null)
    }
  }

  async function handleInjectFreshRadioWave() {
    const targetStation =
      MOOD_STATIONS.find((s) => s.id === activeStationId) ||
      MOOD_STATIONS[Math.floor(Math.random() * MOOD_STATIONS.length)]
    await handlePlayMoodStation(targetStation)
  }

  // Filtered albums by search AND active Vibe filter chip
  const filteredAlbums = useMemo(() => {
    let list = albumsWithTracks
    const vibeObj = VIBE_FILTERS.find((v) => v.id === activeVibe)
    if (vibeObj && vibeObj.keywords.length > 0) {
      list = list.filter((a) => {
        const hay = `${a.album.title} ${a.album.artist || ''}`.toLowerCase()
        return vibeObj.keywords.some((kw) => hay.includes(kw))
      })
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(
        (a) =>
          a.album.title.toLowerCase().includes(q) ||
          a.album.artist?.toLowerCase().includes(q) ||
          a.tracks.some((t) => t.title.toLowerCase().includes(q)),
      )
    }
    return list
  }, [albumsWithTracks, activeVibe, searchQuery])

  // Downloaded / Offline tracks
  const downloadedTracks = useMemo(() => {
    const list: SoundtrackTrack[] = []
    const seenPaths = new Set<string>()
    const seenIds = new Set<string>()

    for (const alb of albumsWithTracks) {
      for (const t of alb.tracks) {
        if (t.local_path && !seenPaths.has(t.local_path)) {
          seenPaths.add(t.local_path)
          seenIds.add(t.id)
          list.push(t)
        }
      }
    }

    for (const dl of downloadHistory) {
      if (dl.status === 'completed' && dl.save_path && !seenPaths.has(dl.save_path)) {
        seenPaths.add(dl.save_path)
        const filename =
          dl.save_path
            .split(/[\\/]/)
            .pop()
            ?.replace(/\.[^/.]+$/, '') ||
          dl.url
            .split('/')
            .pop()
            ?.replace(/\.[^/.]+$/, '')
            .replace(/%20/g, ' ') ||
          'Downloaded Track'

        const trackId = dl.track_id || `dl_${dl.id}`
        seenIds.add(trackId)
        list.push({
          id: trackId,
          album_id: dl.album_id || '',
          disc_number: 1,
          track_number: 1,
          title: filename,
          artist: 'Offline Audio',
          duration_ms: 0,
          preview_url: null,
          stream_url: null,
          download_url: dl.url,
          local_path: dl.save_path,
          provider_id: 'local',
          external_id: null,
        })
      }
    }

    for (const file of localFiles) {
      if (file.file_path && !seenPaths.has(file.file_path)) {
        seenPaths.add(file.file_path)
        const title =
          file.title ||
          file.file_path
            .split(/[\\/]/)
            .pop()
            ?.replace(/\.[^/.]+$/, '') ||
          'Local Track'

        const trackId = `local_file_${file.id}`
        seenIds.add(trackId)
        list.push({
          id: trackId,
          album_id: file.album_id || '',
          disc_number: 1,
          track_number: 1,
          title,
          artist: file.artist || 'Local Soundtrack',
          duration_ms: file.duration_ms || 0,
          preview_url: null,
          stream_url: null,
          download_url: null,
          local_path: file.file_path,
          provider_id: 'local',
          external_id: null,
        })
      }
    }

    return list
  }, [albumsWithTracks, downloadHistory, localFiles])

  // Favorited albums (resolved across ALL known albums + savedFavoriteAlbums)
  const favoritedAlbums = useMemo(() => {
    const out: SoundtrackAlbumWithTracks[] = []
    const seen = new Set<string>()
    for (const [id, fullAlb] of allKnownFullAlbumsById.entries()) {
      if (effectiveFavoriteIds.has(id) && !seen.has(id)) {
        seen.add(id)
        out.push(fullAlb)
      }
    }
    return out
  }, [allKnownFullAlbumsById, effectiveFavoriteIds])

  // Favorited tracks (resolved across savedFavoriteTracks, allKnownTracksById, downloadedTracks, cur_trk_ slugs, AND tracks from favoritedAlbums!)
  const favoritedTracks = useMemo(() => {
    const list: SoundtrackTrack[] = []
    const seenIds = new Set<string>()

    // 1. Direct tracks saved when clicking Heart in right-hand sidebar or player
    for (const [trkId, entry] of Object.entries(savedFavoriteTracks || {})) {
      if (effectiveFavoriteIds.has(trkId) && entry?.track && !seenIds.has(trkId)) {
        seenIds.add(trkId)
        list.push(entry.track)
      }
    }

    // 2. All known tracks across curated, library, SQLite, and online catalogs
    for (const [trkId, entry] of allKnownTracksById.entries()) {
      if (effectiveFavoriteIds.has(trkId) && !seenIds.has(trkId)) {
        seenIds.add(trkId)
        list.push(entry.track)
      }
    }

    // 3. Downloaded tracks
    for (const t of downloadedTracks) {
      if (effectiveFavoriteIds.has(t.id) && !seenIds.has(t.id)) {
        seenIds.add(t.id)
        list.push(t)
      }
    }

    // 4. Reconstruct curated track IDs (`cur_trk_<slug>_<num>`) if needed
    for (const favId of effectiveFavoriteIds) {
      if (seenIds.has(favId)) continue
      if (favId.startsWith('cur_trk_')) {
        const m = favId.match(/^cur_trk_(.+)_(\d+)$/)
        if (m) {
          const slugTitle = m[1].replace(/_/g, ' ')
          const trkNum = parseInt(m[2], 10)
          const cur = lookupCuratedSoundtrack({ gameId: `curated_${m[1]}`, title: slugTitle })
          const foundTrk =
            cur?.tracks.find((t) => t.track_number === trkNum) || cur?.tracks[trkNum - 1]
          if (foundTrk) {
            seenIds.add(favId)
            list.push(foundTrk)
          }
        }
      }
    }

    // 5. If user liked an Album from the right-hand sidebar header, also include its top tracks so Favorite Soundtrack Cards are populated and immediately playable!
    if (list.length === 0 && favoritedAlbums.length > 0) {
      for (const favAlb of favoritedAlbums) {
        for (const trk of favAlb.tracks) {
          if (!seenIds.has(trk.id)) {
            seenIds.add(trk.id)
            list.push({ ...trk, album_id: trk.album_id || favAlb.album.id })
          }
        }
      }
    }

    return list
  }, [
    savedFavoriteTracks,
    allKnownTracksById,
    downloadedTracks,
    effectiveFavoriteIds,
    favoritedAlbums,
  ])

  const [studioDeckAlbumId, setStudioDeckAlbumId] = useState<string | null>(null)
  const [activeEqPreset, setActiveEqPreset] = useState<StudioEqPresetId>('symphonic')
  const [vinylSpeed, setVinylSpeed] = useState<0.85 | 1.0 | 1.15>(1.0)
  const [customEqOffsets, setCustomEqOffsets] = useState<number[]>([0, 0, 0, 0, 0, 0, 0, 0, 0, 0])

  useEffect(() => {
    const audios = document.querySelectorAll('audio')
    audios.forEach((a) => {
      try {
        a.playbackRate = vinylSpeed
      } catch {
        // Ignore
      }
    })
  }, [vinylSpeed, currentTrack?.id, playbackState])

  const activeEqConfig = useMemo(
    () => STUDIO_EQ_PRESETS.find((p) => p.id === activeEqPreset) ?? STUDIO_EQ_PRESETS[0],
    [activeEqPreset],
  )

  // Active or Featured Album for the Top Studio Workstation Stage
  const heroAlbum = useMemo(() => {
    if (studioDeckAlbumId) {
      const manual = albumsWithTracks.find((a) => a.album.id === studioDeckAlbumId)
      if (manual) return manual
    }
    if (currentAlbum) {
      const found = albumsWithTracks.find((a) => a.album.id === currentAlbum.id)
      if (found) return found
    }
    return spotlightShelfAlbums[0] || albumsWithTracks[0] || null
  }, [studioDeckAlbumId, currentAlbum, spotlightShelfAlbums, albumsWithTracks])

  const isPlaying =
    Boolean(currentTrack) &&
    (playbackState === 'playing' ||
      (playbackState !== 'paused' && playbackState !== 'error' && currentTime > 0))

  const effectiveDuration = useMemo(() => {
    if (duration > 0) return duration
    if (currentTrack?.duration_ms && currentTrack.duration_ms > 0) {
      return currentTrack.duration_ms / 1000
    }
    return 0
  }, [duration, currentTrack?.duration_ms])

  const progressPercent =
    effectiveDuration > 0 ? Math.min(100, Math.max(0, (currentTime / effectiveDuration) * 100)) : 0

  const heroCoverSrc =
    assetUrl(currentAlbum?.cover_url) ||
    assetUrl(currentGame?.coverUrl) ||
    assetUrl(heroAlbum?.album.cover_url) ||
    null

  const shelfScrollRef = useRef<HTMLDivElement>(null)
  function scrollShelf(dir: 'left' | 'right') {
    if (!shelfScrollRef.current) return
    shelfScrollRef.current.scrollBy({
      left: dir === 'left' ? -440 : 440,
      behavior: 'smooth',
    })
  }

  function handleOpenAlbumById(albumId: string) {
    const found = fullAlbumsById.get(albumId)
    if (found) setSelectedAlbum(found)
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-bg p-6 lg:p-8 select-none">
      <div className="mx-auto flex w-full max-w-[1920px] flex-col gap-6">
        {/* ── 1. Game Hub-Style Dynamic Command Header & Instant Live Search ── */}
        <header className="relative overflow-hidden rounded-3xl border border-border/85 bg-gradient-to-br from-surface-raised/95 via-surface to-surface-raised/80 p-5 sm:p-6 shadow-card">
          <div className="pointer-events-none absolute -right-20 -top-24 size-80 rounded-full bg-accent/10 blur-3xl" />

          <div className="relative z-10 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-center gap-4">
              <div className="relative flex size-13 shrink-0 items-center justify-center rounded-2xl border border-accent/40 bg-gradient-to-br from-accent/25 via-accent/10 to-surface-raised shadow-[0_0_24px_-6px_var(--nx-accent)]">
                <Disc3 className={cn('size-7 text-accent', isPlaying && 'animate-spin')} />
                <span className="absolute -right-1 -top-1 flex size-4.5 items-center justify-center rounded-full bg-emerald-500 text-white ring-2 ring-surface">
                  <Sparkles className="size-2.5 fill-current" />
                </span>
              </div>

              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/35 bg-accent/15 px-2.5 py-0.5 font-mono text-[10px] font-black uppercase tracking-[0.16em] text-accent">
                    <Sparkles className="size-3" />
                    <span>NEXUS AUDIO HUB</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/35 bg-emerald-500/12 px-2.5 py-0.5 font-mono text-[10px] font-bold text-emerald-400">
                    <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>{albumsWithTracks.length} Live Scores • Instant CDN</span>
                  </span>
                </div>
                <h1 className="mt-1 text-2xl font-black tracking-tight text-text sm:text-3xl">
                  Soundtrack &amp; Score Hub
                </h1>
              </div>
            </div>

            {/* Search Input + Live Sync + Visualizer + Scan */}
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative flex-1 sm:w-88">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-accent" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && searchQuery.trim()) {
                      void handleDiscoverOnline()
                    }
                  }}
                  placeholder="Instant search any game OST, track, or composer..."
                  className="w-full rounded-2xl border border-border/80 bg-surface pl-10 pr-20 py-2.5 text-xs font-medium text-text placeholder:text-subtle focus:border-accent focus:outline-none transition-all"
                />
                <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  {isSearchingOnline && (
                    <span className="inline-flex items-center gap-1 rounded-lg bg-accent/15 px-1.5 py-0.5 font-mono text-[9px] font-bold text-accent">
                      <Loader2 className="size-3 animate-spin" />
                      <span>LIVE</span>
                    </span>
                  )}
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="rounded-lg p-1 text-subtle hover:bg-surface-raised hover:text-text"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Sync Live OSTs Button */}
              <button
                type="button"
                onClick={() => void handleSyncLiveFeed()}
                disabled={isSyncingLiveFeed}
                title="Fetch fresh online soundtracks & rotate discovery shelves"
                className="flex items-center gap-1.5 rounded-2xl border border-accent/40 bg-accent/15 px-3.5 py-2.5 text-xs font-bold text-accent hover:bg-accent hover:text-white active:scale-95 disabled:opacity-60 transition-all cursor-pointer"
              >
                <RefreshCw className={cn('size-3.5', isSyncingLiveFeed && 'animate-spin')} />
                <span>{isSyncingLiveFeed ? 'Syncing...' : 'Sync Live'}</span>
              </button>

              {/* Visualizer Mode Switcher */}
              <div className="hidden 2xl:flex items-center gap-0.5 rounded-2xl border border-border/80 bg-surface p-1">
                {(
                  [
                    { id: 'minimal' as const, label: 'Bars', icon: BarChart3 },
                    { id: 'reactive' as const, label: 'Wave', icon: Activity },
                    { id: 'off' as const, label: 'Off', icon: EyeOff },
                  ]
                ).map((v) => {
                  const VIcon = v.icon
                  const active = visualizerMode === v.id
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => {
                        playButtonClick()
                        setVisualizerMode(v.id)
                      }}
                      className={cn(
                        'flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-semibold transition-all cursor-pointer',
                        active ? 'bg-accent text-white shadow-2xs' : 'text-muted hover:text-text',
                      )}
                    >
                      <VIcon className="size-3" />
                      <span>{v.label}</span>
                    </button>
                  )
                })}
              </div>

              {/* Scan Local Music Folder */}
              <button
                type="button"
                onClick={() => void handleScan()}
                disabled={isScanning}
                className="flex items-center gap-2 rounded-2xl border border-border/80 bg-surface px-3.5 py-2.5 text-xs font-semibold text-text hover:border-accent/40 hover:bg-surface-raised active:scale-95 disabled:opacity-50 transition-all shrink-0 cursor-pointer"
              >
                <FolderSync className={cn('size-3.5 text-accent', isScanning && 'animate-spin')} />
                <span>{isScanning ? 'Scanning...' : 'Scan Local'}</span>
              </button>
            </div>
          </div>

          {/* ── Quick Vibe & Genre Filter Strip ── */}
          <div className="relative z-10 mt-4 flex items-center gap-1.5 overflow-x-auto border-t border-border/60 pt-3.5 no-scrollbar">
            {VIBE_FILTERS.map((vibe) => {
              const VIcon = vibe.icon
              const isActive = activeVibe === vibe.id
              return (
                <button
                  key={vibe.id}
                  type="button"
                  onClick={() => {
                    playButtonClick()
                    setActiveVibe(vibe.id)
                    if (activeTab !== 'overview') setActiveTab('overview')
                  }}
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition-all active:scale-95 cursor-pointer',
                    isActive
                      ? 'border-accent bg-accent text-white shadow-xs'
                      : 'border-border/80 bg-surface text-muted hover:border-accent/40 hover:bg-surface-raised hover:text-text',
                  )}
                >
                  <VIcon className="size-3.5" />
                  <span>{vibe.label}</span>
                </button>
              )
            })}
          </div>
        </header>

        {/* ── 2. Pro-Grade Studio Mastering Workstation, Vinyl Deck & Live Tracklist Rack ── */}
        {heroAlbum && !searchQuery && activeTab === 'overview' && (
          <section className="relative overflow-hidden rounded-3xl border border-border/90 bg-gradient-to-br from-surface-raised via-surface to-bg p-5 sm:p-6 shadow-card">
            {heroCoverSrc && (
              <div
                className="pointer-events-none absolute -right-12 -top-16 size-96 rounded-full opacity-20 blur-3xl transition-all duration-700"
                style={{
                  backgroundImage: `url(${heroCoverSrc})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
              />
            )}

            {/* Top Studio Deck Selector Strip: Switch Turntable Album with 1 Click */}
            <div className="relative z-10 mb-5 flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3.5">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-xl border border-accent/40 bg-accent/15 px-2.5 py-1 font-mono text-[10px] font-black uppercase tracking-widest text-accent">
                  <SlidersHorizontal className="size-3" />
                  <span>MASTERING CONSOLE</span>
                </span>
                <span className="hidden sm:inline-flex items-center gap-1 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-mono text-[10px] font-bold text-emerald-500 dark:text-emerald-300">
                  24-BIT / 96kHz • STEREO • -14 LUFS
                </span>
                <span className="hidden md:inline-flex items-center gap-1 rounded-xl border border-border bg-surface-raised px-2.5 py-1 font-mono text-[10px] font-semibold text-muted">
                  DSP: {activeEqConfig.label}
                </span>
              </div>

              {/* Quick Deck Switcher Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar max-w-full">
                <span className="mr-1 font-mono text-[10px] font-bold uppercase tracking-wider text-subtle shrink-0">
                  Load Deck:
                </span>
                {spotlightShelfAlbums.slice(0, 6).map((alb) => {
                  const isSelectedDeck = heroAlbum.album.id === alb.album.id
                  const shortName = cleanGameTitleFromAlbumTitle(alb.album.title)
                  return (
                    <button
                      key={`deck-pill-${alb.album.id}`}
                      type="button"
                      onClick={() => {
                        playButtonClick()
                        setStudioDeckAlbumId(alb.album.id)
                      }}
                      className={cn(
                        'shrink-0 rounded-xl border px-2.5 py-1 text-[11px] font-bold transition-all cursor-pointer',
                        isSelectedDeck
                          ? 'border-accent bg-accent text-white shadow-xs'
                          : 'border-border/75 bg-surface text-muted hover:border-accent/40 hover:text-text',
                      )}
                    >
                      {shortName.length > 20 ? `${shortName.slice(0, 18)}…` : shortName}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 3-Column Studio Workstation Grid */}
            <div className="relative z-10 grid grid-cols-1 gap-6 xl:grid-cols-12 xl:items-stretch">
              {/* COLUMN 1 (4 cols): Dual-Layer Sleeve + 33⅓ RPM Strobe Turntable + Pivoting Tonearm */}
              <div className="flex flex-col justify-between rounded-2xl border border-border/80 bg-surface/75 p-4 shadow-inner xl:col-span-4">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="font-mono text-[10px] font-extrabold uppercase tracking-wider text-subtle">
                     Direct-Drive Turntable Deck A
                  </span>
                  {/* Vinyl Platter RPM Speed Selector */}
                  <div className="flex items-center gap-1 rounded-xl border border-border/80 bg-surface-raised p-0.5">
                    {(
                      [
                        { rate: 0.85 as const, label: '0.85x Slow' },
                        { rate: 1.0 as const, label: '33⅓ RPM' },
                        { rate: 1.15 as const, label: '45 RPM' },
                      ]
                    ).map((spd) => (
                      <button
                        key={spd.label}
                        type="button"
                        onClick={() => {
                          playButtonClick()
                          setVinylSpeed(spd.rate)
                        }}
                        className={cn(
                          'rounded-lg px-2 py-0.5 font-mono text-[9.5px] font-bold transition-all cursor-pointer',
                          vinylSpeed === spd.rate
                            ? 'bg-accent text-white shadow-2xs'
                            : 'text-subtle hover:text-text',
                        )}
                      >
                        {spd.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sleeve + Spinning Vinyl Platter + Pivoting Tonearm */}
                <div className="relative my-2 flex items-center justify-center py-2">
                  <div
                    onClick={() => setSelectedAlbum(heroAlbum)}
                    className="group relative flex cursor-pointer items-center justify-center pr-14 sm:pr-16"
                    title="Click to inspect full album & tracklist"
                  >
                    {/* Spinning Vinyl Record with Strobe Dots */}
                    <div
                      className={cn(
                        'pointer-events-none absolute right-2 size-40 sm:size-44 rounded-full border-4 border-zinc-800 bg-[radial-gradient(circle_at_center,#18181b_0%,#09090b_46%,#27272a_48%,#09090b_50%,#18181b_72%,#09090b_100%)] shadow-2xl transition-transform duration-500 group-hover:translate-x-2',
                        isPlaying && 'animate-[spin_5s_linear_infinite]',
                      )}
                    >
                      <div className="absolute inset-2 rounded-full border border-dashed border-white/15" />
                      <div className="absolute inset-5 rounded-full border border-white/10" />
                      <div className="absolute inset-9 rounded-full border border-white/10" />
                      <div className="absolute inset-1/2 size-14 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full border-2 border-accent/70 bg-surface shadow-inner">
                        {heroCoverSrc && (
                          <img src={heroCoverSrc} alt="" className="size-full object-cover" />
                        )}
                        <div className="absolute inset-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-zinc-950 ring-2 ring-white/50" />
                      </div>
                    </div>

                    {/* Animated Pivoting Studio Tonearm */}
                    <div
                      className={cn(
                        'pointer-events-none absolute -right-1 top-1 z-20 h-28 w-8 origin-top-right transition-transform duration-700',
                        isPlaying ? 'rotate-[22deg]' : 'rotate-0',
                      )}
                    >
                      <div className="ml-auto size-5 rounded-full border-2 border-zinc-400/60 bg-zinc-800 shadow-md" />
                      <div className="mr-2 ml-auto h-20 w-1 rounded-full bg-gradient-to-b from-zinc-300 via-zinc-400 to-accent shadow-sm" />
                      <div className="mr-1 ml-auto h-3 w-2.5 rounded-xs bg-accent shadow-[0_0_8px_var(--nx-accent)]" />
                    </div>

                    {/* High-Res Album Sleeve */}
                    <div className="relative z-10 size-40 sm:size-44 overflow-hidden rounded-2xl border border-border/90 bg-surface-raised shadow-[0_18px_38px_rgba(0,0,0,0.5)]">
                      {heroCoverSrc ? (
                        <img
                          src={heroCoverSrc}
                          alt={heroAlbum.album.title}
                          className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex size-full items-center justify-center bg-accent/15 text-accent">
                          <Disc3 className="size-14" />
                        </div>
                      )}
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-2.5">
                        <span className="inline-flex items-center gap-1 rounded-md bg-black/80 px-2 py-0.5 font-mono text-[9px] font-black uppercase tracking-wider text-emerald-300 backdrop-blur-sm">
                          <Disc className={cn('size-2.5', isPlaying && 'animate-spin')} />
                          <span>{isPlaying ? 'STYLUS LOCKED • ON AIR' : 'DECK READY'}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bottom Metadata & Fullscreen Vinyl Action */}
                <div className="mt-2 flex items-center justify-between gap-2 border-t border-border/60 pt-3">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-extrabold text-text">
                      {cleanGameTitleFromAlbumTitle(heroAlbum.album.title)}
                    </div>
                    <div className="truncate font-mono text-[10px] text-subtle">
                      {heroAlbum.album.artist || 'Official Game Score'} • {heroAlbum.tracks.length} Tracks
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setSelectedAlbum(heroAlbum)}
                      className="rounded-xl border border-border bg-surface-raised px-2.5 py-1.5 text-[10.5px] font-bold text-text hover:border-accent/50 hover:text-accent transition-all cursor-pointer"
                    >
                      Sleeve Notes
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        playButtonClick()
                        setExpanded(true)
                      }}
                      title="Open Fullscreen Vinyl Stage"
                      className="flex size-7 items-center justify-center rounded-xl border border-accent/35 bg-accent/15 text-accent hover:bg-accent hover:text-white transition-all cursor-pointer"
                    >
                      <Maximize2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* COLUMN 2 (5 cols): Mastering Transport, 44-Bar Interactive Waveform Scrubber & 10-Band DSP Equalizer */}
              <div className="flex flex-col justify-between gap-4 rounded-2xl border border-border/85 bg-surface/90 p-4 sm:p-5 shadow-inner xl:col-span-5">
                {/* Track Header + Transport Buttons */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 rounded-md bg-accent/15 px-2 py-0.5 font-mono text-[9.5px] font-black uppercase tracking-wider text-accent">
                        <Headphones className="size-2.5" />
                        <span>{currentTrack ? 'NOW PLAYING' : 'READY ON DECK'}</span>
                      </span>
                      <AudioVisualizer mode={visualizerMode} className="h-4 w-20" />
                    </div>
                    <h2 className="mt-1 truncate text-lg sm:text-xl font-black tracking-tight text-text">
                      {currentTrack
                        ? currentTrack.title
                        : heroAlbum.tracks[0]?.title || heroAlbum.album.title}
                    </h2>
                    <p className="truncate text-xs font-semibold text-accent">
                      {currentTrack
                        ? currentGame?.title ||
                          (currentAlbum
                            ? cleanGameTitleFromAlbumTitle(currentAlbum.title)
                            : heroAlbum.album.title)
                        : heroAlbum.album.title}
                    </p>
                  </div>

                  {/* Primary Transport Controls */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        playButtonClick()
                        toggleShuffle()
                      }}
                      className={cn(
                        'rounded-xl border p-2 transition-all cursor-pointer',
                        shuffle
                          ? 'border-accent/50 bg-accent/15 text-accent'
                          : 'border-border/70 bg-surface-raised text-muted hover:text-text',
                      )}
                      title="Toggle Shuffle"
                    >
                      <Shuffle className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        playButtonClick()
                        void previous()
                      }}
                      className="rounded-xl border border-border/70 bg-surface-raised p-2 text-text hover:border-accent/40 transition-all cursor-pointer"
                      title="Previous Track"
                    >
                      <SkipBack className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        playButtonClick()
                        if (currentTrack && (!studioDeckAlbumId || currentAlbum?.id === heroAlbum.album.id)) {
                          togglePlay()
                        } else if (heroAlbum.tracks.length > 0) {
                          void playAlbum(
                            heroAlbum.album,
                            heroAlbum.tracks,
                            0,
                            deriveGameIdentityFromAlbum(heroAlbum.album),
                          )
                        }
                      }}
                      className="flex size-11 items-center justify-center rounded-2xl bg-accent text-white shadow-[0_0_20px_-4px_var(--nx-accent)] hover:scale-105 active:scale-95 transition-all cursor-pointer"
                      title={isPlaying ? 'Pause' : 'Play'}
                    >
                      {isPlaying ? (
                        <Pause className="size-5 fill-current" />
                      ) : (
                        <Play className="size-5 fill-current translate-x-0.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        playButtonClick()
                        void next()
                      }}
                      className="rounded-xl border border-border/70 bg-surface-raised p-2 text-text hover:border-accent/40 transition-all cursor-pointer"
                      title="Next Track"
                    >
                      <SkipForward className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        playButtonClick()
                        cycleRepeatMode()
                      }}
                      className={cn(
                        'relative rounded-xl border p-2 transition-all cursor-pointer',
                        repeatMode !== 'off'
                          ? 'border-accent/50 bg-accent/15 text-accent'
                          : 'border-border/70 bg-surface-raised text-muted hover:text-text',
                      )}
                      title={`Repeat Mode: ${repeatMode}`}
                    >
                      <Repeat className="size-3.5" />
                      {repeatMode === 'track' && (
                        <span className="absolute -right-1 -top-1 rounded-full bg-accent px-1 font-mono text-[8px] font-black text-white">
                          1
                        </span>
                      )}
                    </button>
                  </div>
                </div>

                {/* Interactive 44-Bar Waveform Scrubber + Timecode */}
                <div className="rounded-2xl border border-border/75 bg-bg/65 p-3">
                  <div className="mb-1.5 flex items-center justify-between font-mono text-[10px]">
                    <span className="font-bold text-accent">{formatSeconds(currentTime)}</span>
                    <span className="text-[9px] font-bold uppercase tracking-widest text-subtle">
                      Interactive Waveform Scrubber (Click to Seek)
                    </span>
                    <span className="font-semibold text-muted">
                      {formatSeconds(effectiveDuration)}
                    </span>
                  </div>

                  <div
                    onClick={(e) => {
                      if (!currentTrack || effectiveDuration <= 0) {
                        if (heroAlbum.tracks.length > 0) {
                          void playAlbum(
                            heroAlbum.album,
                            heroAlbum.tracks,
                            0,
                            deriveGameIdentityFromAlbum(heroAlbum.album),
                          )
                        }
                        return
                      }
                      const rect = e.currentTarget.getBoundingClientRect()
                      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
                      seek(ratio * effectiveDuration)
                    }}
                    className="group/wave flex h-12 w-full cursor-pointer items-end justify-between gap-[2px] pt-1"
                  >
                    {WAVEFORM_BAR_HEIGHTS.map((h, i) => {
                      const barPct = ((i + 1) / WAVEFORM_BAR_HEIGHTS.length) * 100
                      const isPlayed = progressPercent >= barPct
                      return (
                        <div
                          key={`wf-${i}`}
                          style={{
                            height: `${ isPlaying ? Math.min(100, Math.max(20, h + ((i * 7) % 15) - 7)) : h }%`,
                          }}
                          className={cn(
                            'flex-1 rounded-full transition-all duration-150 group-hover/wave:opacity-95',
                            isPlayed
                              ? 'bg-gradient-to-t from-accent to-cyan-400 shadow-[0_0_6px_var(--nx-accent)]'
                              : 'bg-border/90 hover:bg-accent/50',
                          )}
                        />
                      )
                    })}
                  </div>
                </div>

                {/* 5-Preset Studio Acoustic Equalizer & Interactive 10-Band Frequency Curve */}
                <div className="rounded-2xl border border-border/75 bg-bg/65 p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-1.5">
                    <span className="font-mono text-[10px] font-extrabold uppercase tracking-wider text-text">
                      10-Band Parametric EQ &amp; Acoustic Stage
                    </span>
                    <div className="flex flex-wrap items-center gap-1">
                      {STUDIO_EQ_PRESETS.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => {
                            playButtonClick()
                            setActiveEqPreset(preset.id)
                            setCustomEqOffsets([0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
                          }}
                          className={cn(
                            'rounded-lg border px-2 py-0.5 text-[9.5px] font-bold transition-all cursor-pointer',
                            activeEqPreset === preset.id
                              ? 'border-accent bg-accent text-white shadow-2xs'
                              : 'border-border/70 bg-surface text-subtle hover:text-text',
                          )}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Interactive 10-Band Sliders */}
                  <div className="grid grid-cols-10 gap-1.5 pt-1">
                    {activeEqConfig.bands.map((baseDb, idx) => {
                      const val = Math.max(-6, Math.min(10, baseDb + (customEqOffsets[idx] ?? 0)))
                      const pct = Math.round(((val + 6) / 16) * 100)
                      return (
                        <button
                          key={`eq-band-${idx}`}
                          type="button"
                          onClick={() => {
                            playButtonClick()
                            setCustomEqOffsets((prev) => {
                              const next = [...prev]
                              next[idx] = ((next[idx] ?? 0) + 2) > 4 ? -4 : (next[idx] ?? 0) + 2
                              return next
                            })
                          }}
                          title={`${EQ_FREQ_LABELS[idx]}Hz: ${val >= 0 ? `+${val}` : val} dB (Click to tune)`}
                          className="group/band flex flex-col items-center gap-1 cursor-pointer"
                        >
                          <div className="relative flex h-12 w-full items-end justify-center overflow-hidden rounded-lg border border-border/60 bg-surface p-0.5">
                            <div
                              style={{ height: `${Math.max(15, pct)}%` }}
                              className="w-full rounded-sm bg-gradient-to-t from-accent/80 via-accent to-emerald-400 transition-all duration-300"
                            />
                          </div>
                          <span className="font-mono text-[8.5px] font-bold text-subtle group-hover/band:text-accent">
                            {EQ_FREQ_LABELS[idx]}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Volume Fader & Favorite Footer */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-2.5">
                  <div className="flex items-center gap-2 flex-1 min-w-[180px]">
                    <button
                      type="button"
                      onClick={() => {
                        playButtonClick()
                        toggleMute()
                      }}
                      className="rounded-lg p-1.5 text-subtle hover:bg-surface-raised hover:text-text cursor-pointer"
                      title={isMuted ? 'Unmute' : 'Mute'}
                    >
                      {isMuted || volume === 0 ? (
                        <VolumeX className="size-4 text-rose-400" />
                      ) : (
                        <Volume2 className="size-4 text-accent" />
                      )}
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={isMuted ? 0 : volume}
                      onChange={(e) => setVolume(Number(e.target.value))}
                      className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-border accent-accent"
                    />
                    <span className="w-9 text-right font-mono text-[10px] font-bold text-subtle">
                      {Math.round((isMuted ? 0 : volume) * 100)}%
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const targetTrack = currentTrack ?? heroAlbum.tracks[0]
                        if (!targetTrack) return
                        playButtonClick()
                        void toggleFavorite('track', targetTrack.id, {
                          track: targetTrack,
                          album: currentAlbum ?? heroAlbum.album,
                          tracks: queue.length > 0 ? queue : heroAlbum.tracks,
                        })
                      }}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition-all cursor-pointer',
                        currentTrack && effectiveFavoriteIds.has(currentTrack.id)
                          ? 'border-rose-500/45 bg-rose-500/15 text-rose-400'
                          : 'border-border bg-surface-raised text-muted hover:text-rose-400',
                      )}
                    >
                      <Heart
                        className={cn(
                          'size-3.5',
                          currentTrack && effectiveFavoriteIds.has(currentTrack.id) && 'fill-current',
                        )}
                      />
                      <span>Favorite</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* COLUMN 3 (3 cols): Embedded Live Album Tracklist & Instant Sampler Rack */}
              <div className="flex flex-col justify-between rounded-2xl border border-border/85 bg-surface/90 p-4 shadow-inner xl:col-span-3">
                <div className="mb-2.5 flex items-center justify-between gap-2 border-b border-border/60 pb-2">
                  <div>
                    <span className="font-mono text-[10px] font-black uppercase tracking-wider text-accent">
                      LIVE TRACK RACK
                    </span>
                    <h4 className="truncate text-xs font-extrabold text-text">
                      {cleanGameTitleFromAlbumTitle(heroAlbum.album.title)} ({heroAlbum.tracks.length})
                    </h4>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      playButtonClick()
                      if (heroAlbum.tracks.length > 0) {
                        void playAlbum(
                          heroAlbum.album,
                          heroAlbum.tracks,
                          0,
                          deriveGameIdentityFromAlbum(heroAlbum.album),
                        )
                      }
                    }}
                    className="inline-flex items-center gap-1 rounded-xl bg-accent px-2.5 py-1 text-[10.5px] font-bold text-white shadow-2xs hover:bg-accent-hover cursor-pointer"
                  >
                    <Play className="size-3 fill-current" />
                    <span>Play All</span>
                  </button>
                </div>

                {/* Scrollable Tracklist inside the Studio Console */}
                <div className="flex max-h-64 flex-1 flex-col gap-1 overflow-y-auto pr-1 scrollbar-thin">
                  {heroAlbum.tracks.slice(0, 16).map((trk, idx) => {
                    const isThisPlaying = currentTrack?.id === trk.id
                    const isFav = effectiveFavoriteIds.has(trk.id)
                    return (
                      <div
                        key={`rack-${trk.id}-${idx}`}
                        onClick={() => {
                          playButtonClick()
                          void playAlbum(
                            heroAlbum.album,
                            heroAlbum.tracks,
                            idx,
                            deriveGameIdentityFromAlbum(heroAlbum.album),
                          )
                        }}
                        className={cn(
                          'group/rtrk flex items-center justify-between gap-2 rounded-xl border px-2.5 py-1.5 text-left transition-all cursor-pointer',
                          isThisPlaying
                            ? 'border-accent bg-accent/15 text-accent font-bold shadow-2xs'
                            : 'border-transparent bg-surface-raised/55 text-text hover:border-border hover:bg-surface-raised',
                        )}
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="w-4 shrink-0 font-mono text-[10px] font-bold text-subtle">
                            {isThisPlaying && isPlaying ? '▶' : String(idx + 1).padStart(2, '0')}
                          </span>
                          <span className="truncate text-xs font-semibold">{trk.title}</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              playButtonClick()
                              void toggleFavorite('track', trk.id, {
                                track: trk,
                                album: heroAlbum.album,
                                tracks: heroAlbum.tracks,
                              })
                            }}
                            className={cn(
                              'rounded p-0.5 transition-colors cursor-pointer',
                              isFav
                                ? 'text-rose-500'
                                : 'text-subtle opacity-0 group-hover/rtrk:opacity-100 hover:text-rose-400',
                            )}
                          >
                            <Heart className={cn('size-3', isFav && 'fill-current')} />
                          </button>
                          {trk.duration_ms > 0 && (
                            <span className="font-mono text-[9.5px] text-subtle">
                              {formatSeconds(trk.duration_ms / 1000)}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedAlbum(heroAlbum)}
                  className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl border border-border/80 bg-surface-raised py-1.5 text-[11px] font-bold text-subtle hover:border-accent/40 hover:text-text transition-all cursor-pointer"
                >
                  <ListMusic className="size-3.5 text-accent" />
                  <span>Open Full Album Modal ({heroAlbum.tracks.length} Tracks)</span>
                </button>
              </div>
            </div>
          </section>
        )}

        {/* ── 3. Spring-Morphing Navigation Tabs ───────────────────────────── */}
        <nav className="flex items-center gap-1.5 overflow-x-auto border-b border-border/60 pb-3 no-scrollbar">
          {(
            [
              { id: 'overview' as const, label: 'Discover & Featured', icon: Sparkles },
              {
                id: 'radios' as const,
                label: 'Live Online Radios (6)',
                icon: Radio,
              },
              {
                id: 'games' as const,
                label: `My Library OSTs (${libraryMatchedAlbums.length})`,
                icon: Gamepad2,
              },
              {
                id: 'favorites' as const,
                label: `Favorites (${favoritedAlbums.length + favoritedTracks.length})`,
                icon: Heart,
              },
              {
                id: 'queue' as const,
                label: `Live Queue (${queue.length})`,
                icon: ListMusic,
              },
              {
                id: 'downloaded' as const,
                label: `Local / Offline (${downloadedTracks.length})`,
                icon: HardDrive,
              },
            ]
          ).map((tab) => {
            const Icon = tab.icon
            const active = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  if (activeTab === tab.id) return
                  playButtonClick()
                  setActiveTab(tab.id)
                }}
                className={cn(
                  'relative flex shrink-0 cursor-pointer items-center gap-2 rounded-2xl px-4 py-2 text-xs font-semibold transition-colors duration-200 select-none',
                  active ? 'text-white' : 'text-muted hover:bg-surface-raised hover:text-text',
                )}
              >
                {active && (
                  <motion.span
                    layoutId="soundtrack-center-tab-pill"
                    transition={{ type: 'spring', stiffness: 420, damping: 32, mass: 0.75 }}
                    className="absolute inset-0 rounded-2xl bg-accent shadow-sm shadow-accent/30"
                  />
                )}
                <Icon className="relative z-10 size-3.5" />
                <span className="relative z-10">{tab.label}</span>
              </button>
            )
          })}
        </nav>

        {/* ── 4. Animated Tab Stage ────────────────────────────────────────── */}
        <AnimatePresence mode="wait" initial={false}>
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <motion.div
              key="ost-tab-overview"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 * speed, ease: 'easeOut' }}
              className="flex flex-col gap-7"
            >
              {/* Game Hub-Style Horizontal Spotlight Shelf */}
              {!searchQuery && activeVibe === 'all' && spotlightShelfAlbums.length > 0 && (
                <section className="flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Flame className="size-4 text-amber-400" />
                        <h3 className="text-base font-bold text-text">
                          Spotlight Masterpiece Scores
                        </h3>
                        <span className="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 font-mono text-[10px] font-bold text-accent">
                          Live Shelf
                        </span>
                      </div>
                      <p className="text-xs text-muted">
                        Rotated selection of acclaimed video game soundtracks — click any sleeve to
                        inspect or play
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          playButtonClick()
                          setRotationNonce((n) => n + 1)
                          shelfScrollRef.current?.scrollTo({ left: 0, behavior: 'smooth' })
                        }}
                        title="Shuffle spotlight shelf"
                        className="flex size-8 items-center justify-center rounded-xl border border-border bg-surface text-muted hover:border-accent/40 hover:text-accent cursor-pointer"
                      >
                        <Shuffle className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => scrollShelf('left')}
                        className="flex size-8 items-center justify-center rounded-xl border border-border bg-surface text-muted hover:border-accent/40 hover:text-text cursor-pointer"
                      >
                        <ChevronLeft className="size-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => scrollShelf('right')}
                        className="flex size-8 items-center justify-center rounded-xl border border-border bg-surface text-muted hover:border-accent/40 hover:text-text cursor-pointer"
                      >
                        <ChevronRight className="size-4" />
                      </button>
                    </div>
                  </div>

                  <div
                    ref={shelfScrollRef}
                    className="flex items-stretch gap-4 overflow-x-auto pb-2 pt-1 no-scrollbar"
                  >
                    {spotlightShelfAlbums.map((item) => (
                      <div key={`spot-${item.album.id}`} className="w-52 shrink-0">
                        <AlbumCard
                          albumWithTracks={item}
                          onOpenDetails={setSelectedAlbum}
                          className="h-full"
                        />
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Quick Mood & Atmosphere Radio Strip */}
              {!searchQuery && activeVibe === 'all' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Radio className="size-4 text-accent" />
                      <h3 className="text-base font-bold text-text">
                        1-Click Live Online Mood Radios
                      </h3>
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/35 bg-emerald-500/10 px-2 py-0.5 font-mono text-[9.5px] font-bold text-emerald-400">
                        <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        <span>DYNAMIC ONLINE STREAM</span>
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('radios')}
                      className="text-xs font-semibold text-accent hover:underline cursor-pointer"
                    >
                      View All 6 Live Stations →
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {MOOD_STATIONS.slice(0, 3).map((station) => {
                      const StIcon = station.icon
                      const isStationLoading = loadingStationId === station.id
                      const isStationActive = activeStationId === station.id
                      return (
                        <button
                          key={station.id}
                          type="button"
                          onClick={() => void handlePlayMoodStation(station)}
                          className={cn(
                            'group relative flex items-start justify-between gap-3 overflow-hidden rounded-2xl border bg-gradient-to-br p-4 text-left shadow-xs transition-all hover:border-accent/50 hover:shadow-md cursor-pointer',
                            isStationActive ? 'border-accent ring-1 ring-accent/35' : 'border-border/80',
                            station.gradient,
                          )}
                        >
                          <div className="space-y-1.5">
                            <span
                              className={cn(
                                'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[9.5px] font-bold uppercase tracking-wider',
                                station.accentText,
                              )}
                            >
                              <StIcon className="size-3" />
                              <span>{station.badge}</span>
                            </span>
                            <div className="text-sm font-bold text-text group-hover:text-accent transition-colors">
                              {station.title}
                            </div>
                            <p className="line-clamp-2 text-xs text-muted leading-relaxed">
                              {station.subtitle}
                            </p>
                          </div>

                          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-white shadow-md transition-transform group-hover:scale-110">
                            {isStationLoading ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <Play className="size-4 fill-current translate-x-0.5" />
                            )}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Albums Catalog Grid */}
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Music className="size-4 text-accent" />
                    <h3 className="text-base font-bold text-text">
                      {searchQuery
                        ? `Soundtrack Results for “${searchQuery}” (${filteredAlbums.length})`
                        : activeVibe !== 'all'
                          ? `${VIBE_FILTERS.find((v) => v.id === activeVibe)?.label} (${filteredAlbums.length})`
                          : 'Complete Video Game Soundtrack Catalog'}
                    </h3>
                    {isSearchingOnline && (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-0.5 font-mono text-[10px] font-bold text-accent">
                        <Loader2 className="size-3 animate-spin" />
                        <span>Streaming Online Results...</span>
                      </span>
                    )}
                  </div>
                  <span className="font-mono text-xs text-muted">
                    {filteredAlbums.length} Albums
                  </span>
                </div>

                {filteredAlbums.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-3xl border border-border/80 bg-surface/40 p-12 text-center">
                    {isSearchingOnline ? (
                      <>
                        <Loader2 className="size-10 text-accent animate-spin mb-3" />
                        <h4 className="text-sm font-bold text-text">
                          Fetching &ldquo;{searchQuery}&rdquo; Soundtrack Online...
                        </h4>
                        <p className="mt-1 text-xs text-muted max-w-sm">
                          Querying Apple Music CDN, KHInsider, and YouTube in parallel...
                        </p>
                      </>
                    ) : (
                      <>
                        <Music className="size-12 text-muted/40 mb-3" />
                        <h4 className="text-sm font-bold text-text">
                          No match yet for &ldquo;{searchQuery}&rdquo;
                        </h4>
                        <p className="mt-1 text-xs text-muted max-w-sm">
                          Click below to run a deep search across Apple Music CDN, KHInsider, and
                          YouTube OST archives.
                        </p>
                        <button
                          type="button"
                          onClick={() => void handleDiscoverOnline()}
                          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-xs font-bold text-white shadow-md cursor-pointer"
                        >
                          <Globe className="size-3.5" />
                          <span>Search &ldquo;{searchQuery}&rdquo; OST Online</span>
                        </button>
                      </>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                      {filteredAlbums.slice(0, visibleAlbumLimit).map((item) => (
                        <AlbumCard
                          key={item.album.id}
                          albumWithTracks={item}
                          onOpenDetails={setSelectedAlbum}
                        />
                      ))}
                    </div>

                    {/* Bottom "More" Pagination & Online Discovery Button */}
                    <div className="mt-6 flex flex-col items-center justify-center gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => void handleLoadMoreSoundtracks()}
                        disabled={isLoadingMore}
                        className="group inline-flex items-center gap-2.5 rounded-2xl border border-accent/40 bg-gradient-to-r from-accent/15 via-surface-raised to-accent/15 px-7 py-3 text-xs font-extrabold text-text shadow-md transition-all hover:border-accent hover:bg-accent hover:text-white active:scale-95 disabled:opacity-60 cursor-pointer"
                      >
                        {isLoadingMore ? (
                          <>
                            <Loader2 className="size-4 animate-spin text-accent group-hover:text-white" />
                            <span>Loading More Soundtracks...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="size-4 text-accent group-hover:text-white transition-colors" />
                            <span>
                              {visibleAlbumLimit < filteredAlbums.length
                                ? `More Soundtracks (${filteredAlbums.length - visibleAlbumLimit} Remaining + Online)`
                                : 'More Soundtracks (Discover Online)'}
                            </span>
                          </>
                        )}
                      </button>
                      <span className="font-mono text-[10px] text-subtle">
                        Showing {Math.min(visibleAlbumLimit, filteredAlbums.length)} of {filteredAlbums.length} loaded albums
                      </span>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          )}

          {/* TAB 2: LIVE ONLINE MOOD RADIOS */}
          {activeTab === 'radios' && (
            <motion.div
              key="ost-tab-radios"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 * speed, ease: 'easeOut' }}
              className="flex flex-col gap-5"
            >
              {/* Live Online Radio Tuner Header */}
              <div className="relative overflow-hidden rounded-3xl border border-accent/35 bg-gradient-to-br from-accent/15 via-surface-raised/90 to-surface p-6 shadow-card">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl border border-accent/40 bg-accent/20 text-accent shadow-[0_0_24px_var(--nx-accent)]">
                      <Radio className="size-7 animate-pulse" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-0.5 font-mono text-[9.5px] font-black uppercase tracking-wider text-emerald-400">
                          <span className="size-1.5 rounded-full bg-emerald-400 animate-ping" />
                          <span>ONLINE STREAMING TUNER • WAVE #{radioWaveGeneration}</span>
                        </span>
                      </div>
                      <h3 className="mt-1 text-xl font-black text-text">
                        24/7 Live Dynamic Game Soundtrack Radios
                      </h3>
                      <p className="mt-0.5 text-xs text-muted">
                        Every station dynamically fetches fresh online tracks from Apple Music,
                        Deezer &amp; KHInsider on each wave — never repeating the same playlist.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => void handleInjectFreshRadioWave()}
                      disabled={Boolean(loadingStationId)}
                      className="flex items-center gap-2 rounded-2xl bg-accent px-4 py-2.5 text-xs font-bold text-white shadow-md hover:bg-accent-hover active:scale-95 disabled:opacity-60 transition-all cursor-pointer"
                    >
                      <RefreshCw
                        className={cn('size-3.5', Boolean(loadingStationId) && 'animate-spin')}
                      />
                      <span>
                        {loadingStationId ? 'Fetching Online Wave...' : 'Stream Fresh Online Wave'}
                      </span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {MOOD_STATIONS.map((station) => {
                  const StIcon = station.icon
                  const isStationActive = activeStationId === station.id
                  const isStationLoading = loadingStationId === station.id
                  const currentSeeds =
                    stationLiveSeeds[station.id] || station.onlineSeeds.slice(0, 3)

                  return (
                    <div
                      key={station.id}
                      className={cn(
                        'flex flex-col justify-between gap-4 rounded-3xl border bg-gradient-to-br p-6 shadow-sm transition-all',
                        isStationActive
                          ? 'border-accent ring-2 ring-accent/30 shadow-lg'
                          : 'border-border/80 hover:border-accent/40',
                        station.gradient,
                      )}
                    >
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span
                            className={cn(
                              'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider',
                              station.accentText,
                            )}
                          >
                            <StIcon className="size-3.5" />
                            <span>{station.badge}</span>
                          </span>
                          {isStationActive ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-0.5 font-mono text-[9.5px] font-bold text-emerald-400">
                              <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                              <span>ON AIR</span>
                            </span>
                          ) : (
                            <Radio className="size-4 text-subtle" />
                          )}
                        </div>
                        <h3 className="text-lg font-bold text-text">{station.title}</h3>
                        <p className="text-xs text-muted leading-relaxed">{station.subtitle}</p>

                        {/* Live Rotating Online Seeds Preview */}
                        <div className="pt-1 flex flex-wrap items-center gap-1.5">
                          <span className="font-mono text-[9.5px] font-bold uppercase text-subtle">
                            Live Seeds:
                          </span>
                          {currentSeeds.map((seed) => (
                            <span
                              key={seed}
                              className="rounded-md border border-border/70 bg-surface/75 px-2 py-0.5 text-[10px] font-semibold text-text/85"
                            >
                              {seed}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void handlePlayMoodStation(station)}
                          disabled={isStationLoading}
                          className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-accent py-2.5 text-xs font-bold text-white shadow-md hover:bg-accent-hover active:scale-98 disabled:opacity-60 transition-all cursor-pointer"
                        >
                          {isStationLoading ? (
                            <>
                              <Loader2 className="size-3.5 animate-spin" />
                              <span>Syncing Live Stream...</span>
                            </>
                          ) : (
                            <>
                              <Play className="size-3.5 fill-current translate-x-0.5" />
                              <span>
                                {isStationActive ? 'Fetch Next Online Wave' : 'Start Live Radio'}
                              </span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </motion.div>
          )}

          {/* TAB 3: LIBRARY GAMES */}
          {activeTab === 'games' && (
            <motion.div
              key="ost-tab-games"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 * speed, ease: 'easeOut' }}
              className="flex flex-col gap-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-text">
                  Soundtracks Matched to Your Library &amp; Wishlist
                </h3>
                <span className="font-mono text-xs text-muted">
                  {libraryMatchedAlbums.length} Games
                </span>
              </div>

              {libraryMatchedAlbums.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-3xl border border-border/80 bg-surface/40 p-12 text-center">
                  <Gamepad2 className="size-10 text-muted/40 mb-2" />
                  <h4 className="text-sm font-bold text-text">No library games matched yet</h4>
                  <p className="mt-1 text-xs text-muted max-w-sm">
                    Add games from Game Hub or open any game in your Library sidebar to sync its
                    official soundtrack.
                  </p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                    {libraryMatchedAlbums.slice(0, visibleAlbumLimit).map((item) => (
                      <AlbumCard
                        key={item.album.id}
                        albumWithTracks={item}
                        onOpenDetails={setSelectedAlbum}
                      />
                    ))}
                  </div>
                  <div className="mt-6 flex justify-center">
                    <button
                      type="button"
                      onClick={() => void handleLoadMoreSoundtracks()}
                      disabled={isLoadingMore}
                      className="inline-flex items-center gap-2 rounded-2xl border border-accent/40 bg-surface-raised px-6 py-2.5 text-xs font-extrabold text-text shadow-sm transition-all hover:border-accent hover:bg-accent hover:text-white active:scale-95 cursor-pointer"
                    >
                      {isLoadingMore ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="size-3.5 text-accent" />
                      )}
                      <span>More Soundtracks</span>
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          )}

          {/* ── TAB 4: FAVORITES ── */}
          {activeTab === 'favorites' && (
            <motion.div
              key="ost-tab-favorites"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 * speed, ease: 'easeOut' }}
              className="flex flex-col gap-6"
            >
              {/* Favorites Hero Header Card */}
              <div className="relative overflow-hidden rounded-3xl border border-rose-500/30 bg-gradient-to-br from-rose-500/12 via-surface-raised/90 to-surface p-6 shadow-card">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl border border-rose-500/40 bg-rose-500/20 text-rose-400 shadow-[0_0_24px_rgba(244,63,94,0.3)]">
                      <Heart className="size-7 fill-current" />
                    </div>
                    <div>
                      <div className="font-mono text-[10px] font-black uppercase tracking-[0.2em] text-rose-400">
                        Personal Masterpiece Vault
                      </div>
                      <h3 className="text-xl font-black text-text">
                        Favorite Albums &amp; Tracks
                      </h3>
                      <p className="mt-0.5 text-xs text-muted">
                        {favoritedAlbums.length} Favorite Albums • {favoritedTracks.length} Favorite
                        Tracks
                      </p>
                    </div>
                  </div>

                  {favoritedTracks.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => {
                          playButtonClick()
                          const first = favoritedTracks[0]
                          const alb = albumsById.get(first.album_id) ?? null
                          void playTrack(
                            first,
                            alb,
                            deriveGameIdentityFromAlbum(alb),
                            favoritedTracks,
                          )
                        }}
                        className="flex items-center gap-2 rounded-2xl bg-rose-500 px-4 py-2.5 text-xs font-bold text-white shadow-md hover:bg-rose-400 active:scale-95 transition-all cursor-pointer"
                      >
                        <Play className="size-3.5 fill-current translate-x-0.5" />
                        <span>Play All Favorites</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          playButtonClick()
                          const copy = [...favoritedTracks]
                          for (let i = copy.length - 1; i > 0; i--) {
                            const j = Math.floor(Math.random() * (i + 1))
                            ;[copy[i], copy[j]] = [copy[j], copy[i]]
                          }
                          const first = copy[0]
                          const alb = albumsById.get(first.album_id) ?? null
                          void playTrack(first, alb, deriveGameIdentityFromAlbum(alb), copy)
                        }}
                        className="flex items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-2.5 text-xs font-bold text-text hover:border-rose-500/40 hover:text-rose-400 active:scale-95 transition-all cursor-pointer"
                      >
                        <Shuffle className="size-3.5" />
                        <span>Shuffle Favorites</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {favoritedAlbums.length === 0 && favoritedTracks.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-3xl border border-border/80 bg-surface/40 p-12 text-center">
                  <Heart className="size-10 text-muted/40 mb-2" />
                  <h4 className="text-sm font-bold text-text">No favorites saved yet</h4>
                  <p className="mt-1 text-xs text-muted max-w-sm">
                    Click the heart icon on any soundtrack album or track (including in the right
                    game details sidebar) to build your personal collection.
                  </p>
                </div>
              ) : (
                <>
                  {favoritedAlbums.length > 0 && (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-base font-bold text-text flex items-center gap-2">
                          <Disc3 className="size-4 text-rose-400" />
                          <span>Saved Soundtrack Albums ({favoritedAlbums.length})</span>
                        </h3>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                        {favoritedAlbums.map((item) => (
                          <AlbumCard
                            key={item.album.id}
                            albumWithTracks={item}
                            onOpenDetails={setSelectedAlbum}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {favoritedTracks.length > 0 && (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-base font-bold text-text flex items-center gap-2">
                          <Music className="size-4 text-accent" />
                          <span>Favorite Soundtrack Cards ({favoritedTracks.length})</span>
                        </h3>
                      </div>
                      <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 2xl:grid-cols-3">
                        {favoritedTracks.map((t, idx) => {
                          const resolvedAlb =
                            albumsById.get(t.album_id) ??
                            savedFavoriteTracks?.[t.id]?.album ??
                            null
                          return (
                            <TrackRow
                              key={t.id}
                              track={t}
                              album={resolvedAlb}
                              game={deriveGameIdentityFromAlbum(resolvedAlb)}
                              index={idx}
                              allTracks={favoritedTracks}
                              variant="card"
                              badgeType="favorite"
                              onOpenAlbum={handleOpenAlbumById}
                            />
                          )
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </motion.div>
          )}

          {/* ── TAB 5: LIVE QUEUE ── */}
          {activeTab === 'queue' && (
            <motion.div
              key="ost-tab-queue"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 * speed, ease: 'easeOut' }}
              className="flex flex-col gap-5"
            >
              <div className="relative overflow-hidden rounded-3xl border border-accent/30 bg-gradient-to-br from-accent/12 via-surface-raised/90 to-surface p-6 shadow-card">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl border border-accent/40 bg-accent/20 text-accent shadow-[0_0_24px_var(--nx-accent)]">
                      <ListMusic className="size-7" />
                    </div>
                    <div>
                      <div className="font-mono text-[10px] font-black uppercase tracking-[0.2em] text-accent">
                        Live Playback Stream
                      </div>
                      <h3 className="text-xl font-black text-text">
                        Active Soundtrack Queue ({queue.length} Tracks)
                      </h3>
                      <p className="mt-0.5 text-xs text-muted">
                        {currentTrack
                          ? `Currently playing: ${currentTrack.title}`
                          : 'Select any track below to jump immediately'}
                      </p>
                    </div>
                  </div>

                  {queue.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => {
                          playButtonClick()
                          toggleShuffle()
                        }}
                        className={cn(
                          'flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-xs font-bold transition-all cursor-pointer',
                          shuffle
                            ? 'border-accent bg-accent text-white shadow-md'
                            : 'border-border bg-surface text-text hover:border-accent/40',
                        )}
                      >
                        <Shuffle className="size-3.5" />
                        <span>{shuffle ? 'Shuffle On' : 'Shuffle Queue'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          playButtonClick()
                          clearQueue()
                        }}
                        className="flex items-center gap-1.5 rounded-2xl border border-rose-500/35 bg-rose-500/10 px-4 py-2.5 text-xs font-bold text-rose-400 hover:bg-rose-500/20 cursor-pointer"
                      >
                        <Trash2 className="size-3.5" />
                        <span>Clear Queue</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {queue.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-3xl border border-border/80 bg-surface/40 p-12 text-center">
                  <History className="size-10 text-muted/40 mb-2" />
                  <h4 className="text-sm font-bold text-text">Playback queue is empty</h4>
                  <p className="mt-1 text-xs text-muted max-w-sm">
                    Start any album or Live Mood Radio station to populate your live queue.
                  </p>
                </div>
              ) : (
                <>
                <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 2xl:grid-cols-3">
                  {queue.slice(0, visibleTrackLimit).map((t, idx) => {
                    const resolvedAlb = albumsById.get(t.album_id) ?? currentAlbum
                    return (
                      <TrackRow
                        key={`${t.id}_${idx}`}
                        track={t}
                        album={resolvedAlb}
                        game={deriveGameIdentityFromAlbum(resolvedAlb)}
                        index={idx}
                        allTracks={queue}
                        variant="card"
                        badgeType="queue"
                        onOpenAlbum={handleOpenAlbumById}
                      />
                    )
                  })}
                </div>
                {queue.length > visibleTrackLimit && (
                  <div className="mt-4 flex justify-center">
                    <button
                      type="button"
                      onClick={() => setVisibleTrackLimit((prev) => prev + 18)}
                      className="inline-flex items-center gap-2 rounded-2xl border border-accent/40 bg-surface-raised px-6 py-2.5 text-xs font-extrabold text-text shadow-sm transition-all hover:border-accent hover:bg-accent hover:text-white active:scale-95 cursor-pointer"
                    >
                      <Sparkles className="size-3.5 text-accent" />
                      <span>More Tracks ({queue.length - visibleTrackLimit} more)</span>
                    </button>
                  </div>
                )}
                </>
              )}
            </motion.div>
          )}

          {/* ── TAB 6: LOCAL / OFFLINE ── */}
          {activeTab === 'downloaded' && (
            <motion.div
              key="ost-tab-downloaded"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 * speed, ease: 'easeOut' }}
              className="flex flex-col gap-5"
            >
              <div className="relative overflow-hidden rounded-3xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/12 via-surface-raised/90 to-surface p-6 shadow-card">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl border border-emerald-500/40 bg-emerald-500/20 text-emerald-400 shadow-[0_0_24px_rgba(16,185,129,0.3)]">
                      <HardDrive className="size-7" />
                    </div>
                    <div>
                      <div className="font-mono text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400">
                        Zero-Latency Offline Storage
                      </div>
                      <h3 className="text-xl font-black text-text">
                        Local &amp; Downloaded Soundtracks ({downloadedTracks.length})
                      </h3>
                      <p className="mt-0.5 text-xs text-muted">
                        Direct disk playback for FLAC, MP3, WAV &amp; M4A game soundtracks
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    {downloadedTracks.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          playButtonClick()
                          const first = downloadedTracks[0]
                          const alb = albumsById.get(first.album_id) ?? null
                          void playTrack(
                            first,
                            alb,
                            deriveGameIdentityFromAlbum(alb),
                            downloadedTracks,
                          )
                        }}
                        className="flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2.5 text-xs font-bold text-black shadow-md hover:bg-emerald-400 active:scale-95 transition-all cursor-pointer"
                      >
                        <Play className="size-3.5 fill-current translate-x-0.5" />
                        <span>Play All Local</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => void handleScan()}
                      disabled={isScanning}
                      className="flex items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-2.5 text-xs font-bold text-text hover:border-emerald-500/40 hover:text-emerald-400 cursor-pointer"
                    >
                      <FolderSync className={cn('size-3.5', isScanning && 'animate-spin')} />
                      <span>{isScanning ? 'Scanning Disk...' : 'Scan Music Folder'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {downloadedTracks.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-3xl border border-border/80 bg-surface/40 p-12 text-center">
                  <HardDrive className="size-10 text-muted/40 mb-2" />
                  <h4 className="text-sm font-bold text-text">No local audio tracks indexed yet</h4>
                  <p className="mt-1 text-xs text-muted max-w-sm">
                    Click &ldquo;Scan Music Folder&rdquo; above or download tracks from any album to
                    listen offline with zero latency.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 2xl:grid-cols-3">
                  {downloadedTracks.map((t, idx) => (
                    <TrackRow
                      key={t.id}
                      track={t}
                      album={albumsById.get(t.album_id) ?? null}
                      game={deriveGameIdentityFromAlbum(albumsById.get(t.album_id))}
                      index={idx}
                      allTracks={downloadedTracks}
                      variant="card"
                      badgeType="local"
                      onOpenAlbum={handleOpenAlbumById}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Album Detail Modal */}
      <AlbumDetailModal albumWithTracks={selectedAlbum} onClose={() => setSelectedAlbum(null)} />
    </div>
  )
}
