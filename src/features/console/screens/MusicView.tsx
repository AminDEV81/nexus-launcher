import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  BarChart3,
  Compass,
  Disc3,
  Flame,
  FolderSync,
  Gamepad2,
  HardDrive,
  Heart,
  Keyboard,
  ListMusic,
  Loader2,
  Moon,
  Music,
  Pause,
  Play,
  Radio,
  Repeat,
  Search,
  Shuffle,
  SkipBack,
  SkipForward,
  Sparkles,
  Swords,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import type { Game } from '@/types/models'
import {
  useSoundtrackStore,
  type VisualizerMode,
} from '@/features/soundtrack/store/soundtrack-store'
import { soundtrackResolver } from '@/features/soundtrack/services/soundtrack-resolver'
import { getAllCuratedSoundtracks } from '@/features/soundtrack/services/curated-soundtracks'
import {
  getSoundtrackDownloads,
  getSoundtrackLocalFiles,
  scanSoundtrackLibrary,
  type SoundtrackDownloadRow,
} from '@/features/soundtrack/services/tauri-soundtrack'
import { AudioVisualizer } from '@/features/soundtrack/components/player/audio-visualizer'
import type {
  SoundtrackAlbumWithTracks,
  SoundtrackLocalFile,
  SoundtrackTrack,
} from '@/features/soundtrack/types'
import { useConsoleStore } from '../store/console-store'
import { CONSOLE_THEMES } from '../theme/tokens'
import { FocusScope, useFocusable } from '../nav/FocusScope'
import { resolveConsoleHighResUrl } from '../ui/Tile'

export interface MusicViewProps {
  games?: Game[]
}

type CenterSubTab = 'overview' | 'games' | 'radios' | 'favorites' | 'queue' | 'downloaded'

type VibeFilterId =
  | 'all'
  | 'boss_action'
  | 'rpg_fantasy'
  | 'cyber_scifi'
  | 'story_emotional'
  | 'open_world'
  | 'horror_dark'

const SUB_TABS: Array<{ id: CenterSubTab; label: string; icon: typeof Sparkles }> = [
  { id: 'overview', label: 'Overview', icon: Sparkles },
  { id: 'games', label: 'My Games', icon: Gamepad2 },
  { id: 'radios', label: 'Live Radios', icon: Radio },
  { id: 'favorites', label: 'Favorites', icon: Heart },
  { id: 'queue', label: 'Queue', icon: ListMusic },
  { id: 'downloaded', label: 'Local & Cached', icon: HardDrive },
]

const VIBE_FILTERS: Array<{
  id: VibeFilterId
  label: string
  subtitle: string
  gradient: string
  icon: typeof Sparkles
  keywords: string[]
}> = [
  {
    id: 'all',
    label: 'All Soundtracks',
    subtitle: 'Full Curated & Online Catalog',
    gradient: 'from-cyan-500/25 via-indigo-500/15 to-transparent',
    icon: Sparkles,
    keywords: [],
  },
  {
    id: 'boss_action',
    label: 'Action & Boss Themes',
    subtitle: 'High-Intensity Orchestral & Metal',
    gradient: 'from-rose-500/25 via-orange-500/15 to-transparent',
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
    subtitle: 'Sweeping World & Choir Scores',
    gradient: 'from-amber-500/25 via-purple-500/15 to-transparent',
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
    subtitle: 'Synthwave, Industrial & Futuristic',
    gradient: 'from-cyan-400/25 via-fuchsia-500/15 to-transparent',
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
    subtitle: 'Acoustic, Piano & Narrative',
    gradient: 'from-pink-500/25 via-indigo-500/15 to-transparent',
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
    subtitle: 'Atmospheric Exploration & Ambient',
    gradient: 'from-emerald-500/25 via-teal-500/15 to-transparent',
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
    subtitle: 'Haunting & Gothic Tension',
    gradient: 'from-violet-600/25 via-slate-800/35 to-transparent',
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

function formatSeconds(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '0:00'
  const total = Math.floor(sec)
  const mins = Math.floor(total / 60)
  const rem = total % 60
  return `${mins}:${rem.toString().padStart(2, '0')}`
}

export const MusicView: React.FC<MusicViewProps> = ({ games = [] }) => {
  const themeId = useConsoleStore((s) => s.theme)
  const isLight = Boolean(CONSOLE_THEMES[themeId]?.isLight)
  const selectedSoundtrackGame = useConsoleStore((s) => s.selectedSoundtrackGame)
  const setSelectedSoundtrackGame = useConsoleStore((s) => s.setSelectedSoundtrackGame)
  const openOsk = useConsoleStore((s) => s.openOsk)

  const currentTrack = useSoundtrackStore((s) => s.currentTrack)
  const currentAlbum = useSoundtrackStore((s) => s.currentAlbum)
  const queue = useSoundtrackStore((s) => s.queue)
  const playbackState = useSoundtrackStore((s) => s.playbackState)
  const currentTime = useSoundtrackStore((s) => s.currentTime)
  const duration = useSoundtrackStore((s) => s.duration)
  const volume = useSoundtrackStore((s) => s.volume)
  const isMuted = useSoundtrackStore((s) => s.isMuted)
  const shuffle = useSoundtrackStore((s) => s.shuffle)
  const repeatMode = useSoundtrackStore((s) => s.repeatMode)
  const visualizerMode = useSoundtrackStore((s) => s.visualizerMode)
  const favorites = useSoundtrackStore((s) => s.favorites)
  const savedFavoriteTracks = useSoundtrackStore((s) => s.savedFavoriteTracks)
  const savedFavoriteAlbums = useSoundtrackStore((s) => s.savedFavoriteAlbums)

  const togglePlay = useSoundtrackStore((s) => s.togglePlay)
  const previous = useSoundtrackStore((s) => s.previous)
  const next = useSoundtrackStore((s) => s.next)
  const seek = useSoundtrackStore((s) => s.seek)
  const setVolume = useSoundtrackStore((s) => s.setVolume)
  const toggleMute = useSoundtrackStore((s) => s.toggleMute)
  const toggleShuffle = useSoundtrackStore((s) => s.toggleShuffle)
  const cycleRepeatMode = useSoundtrackStore((s) => s.cycleRepeatMode)
  const setVisualizerMode = useSoundtrackStore((s) => s.setVisualizerMode)
  const playAlbum = useSoundtrackStore((s) => s.playAlbum)
  const playTrack = useSoundtrackStore((s) => s.playTrack)
  const toggleFavorite = useSoundtrackStore((s) => s.toggleFavorite)
  const loadFavorites = useSoundtrackStore((s) => s.loadFavorites)
  const removeFromQueue = useSoundtrackStore((s) => s.removeFromQueue)
  const clearQueue = useSoundtrackStore((s) => s.clearQueue)

  const isPlaying = playbackState === 'playing'

  const [subTab, setSubTab] = useState<CenterSubTab>('overview')
  const [vibeFilter, setVibeFilter] = useState<VibeFilterId>('all')

  const curatedAlbums = useMemo(() => getAllCuratedSoundtracks(), [])
  const [resolvedAlbums, setResolvedAlbums] = useState<SoundtrackAlbumWithTracks[]>(curatedAlbums)
  const [activeAlbumBundle, setActiveAlbumBundle] = useState<SoundtrackAlbumWithTracks | null>(
    curatedAlbums[0] ?? null,
  )
  const [loadingOst, setLoadingOst] = useState(false)
  const [statusLabel, setStatusLabel] = useState<string>('Console Soundtrack Center')
  const [customQuery, setCustomQuery] = useState('')
  const [localFiles, setLocalFiles] = useState<SoundtrackLocalFile[]>([])
  const [downloads, setDownloads] = useState<SoundtrackDownloadRow[]>([])
  const [scanningLocal, setScanningLocal] = useState(false)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    void loadFavorites().catch(() => {})
    getSoundtrackLocalFiles()
      .then(setLocalFiles)
      .catch(() => {})
    getSoundtrackDownloads()
      .then(setDownloads)
      .catch(() => {})
  }, [loadFavorites])

  // Load album & tracklist when selectedSoundtrackGame changes, without auto-playing
  useEffect(() => {
    if (!selectedSoundtrackGame) return
    let cancelled = false
    setLoadingOst(true)
    setStatusLabel(`Loaded OST for ${selectedSoundtrackGame.name}`)

    soundtrackResolver
      .resolveGame({
        gameId: selectedSoundtrackGame.id,
        title: selectedSoundtrackGame.name,
        coverUrl: selectedSoundtrackGame.coverUrl ?? null,
        steamAppId: selectedSoundtrackGame.steamAppId ?? null,
        igdbId: selectedSoundtrackGame.igdbId ?? null,
      })
      .then((albums) => {
        if (cancelled) return
        if (albums.length > 0 && albums[0].tracks.length > 0) {
          setResolvedAlbums(albums)
          setActiveAlbumBundle(albums[0])
          setStatusLabel(`${selectedSoundtrackGame.name} — Ready to Play`)
        } else {
          return soundtrackResolver
            .searchOnlineSoundtracksFast(selectedSoundtrackGame.name)
            .then((online) => {
              if (cancelled) return
              if (online.length > 0 && online[0].tracks.length > 0) {
                setResolvedAlbums(online)
                setActiveAlbumBundle(online[0])
                setStatusLabel(`${selectedSoundtrackGame.name} — Ready to Play`)
              }
            })
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingOst(false)
      })

    return () => {
      cancelled = true
    }
  }, [selectedSoundtrackGame])

  const executeCustomOstSearch = (rawQuery: string) => {
    const q = rawQuery.trim()
    setCustomQuery(rawQuery)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)

    if (!q) {
      setResolvedAlbums(curatedAlbums)
      setActiveAlbumBundle(curatedAlbums[0] ?? null)
      setStatusLabel('Console Soundtrack Center')
      return
    }

    const lower = q.toLowerCase()
    const instantMatches = curatedAlbums.filter(
      (b) =>
        b.album.title.toLowerCase().includes(lower) ||
        (b.album.artist ?? '').toLowerCase().includes(lower) ||
        b.tracks.some((t) => t.title.toLowerCase().includes(lower)),
    )
    if (instantMatches.length > 0) {
      setResolvedAlbums(instantMatches)
      setActiveAlbumBundle(instantMatches[0])
      setStatusLabel(`Found ${instantMatches.length} Curated Match(es) for "${q}"`)
    }

    searchTimerRef.current = setTimeout(() => {
      setLoadingOst(true)
      soundtrackResolver
        .searchOnlineSoundtracksFast(q)
        .then((online) => {
          const combined = [...instantMatches, ...online].filter(
            (b, i, arr) => arr.findIndex((x) => x.album.title === b.album.title) === i,
          )
          if (combined.length > 0) {
            setResolvedAlbums(combined)
            setActiveAlbumBundle(combined[0])
            setStatusLabel(`Soundtrack Results for "${q}" (${combined.length} Albums)`)
          } else {
            setStatusLabel(`No online OST results found for "${q}"`)
          }
        })
        .catch(() => {})
        .finally(() => setLoadingOst(false))
    }, 220)
  }

  const filteredAlbums = useMemo(() => {
    const activeVibe = VIBE_FILTERS.find((v) => v.id === vibeFilter)
    if (!activeVibe || activeVibe.keywords.length === 0) return resolvedAlbums
    const matches = resolvedAlbums.filter((b) => {
      const hay = `${b.album.title} ${b.album.artist ?? ''}`.toLowerCase()
      return activeVibe.keywords.some((kw) => hay.includes(kw))
    })
    return matches.length > 0 ? matches : resolvedAlbums
  }, [resolvedAlbums, vibeFilter])

  const startLiveRadioWave = (vibeId: VibeFilterId) => {
    const vibe = VIBE_FILTERS.find((v) => v.id === vibeId) ?? VIBE_FILTERS[0]
    const matchingAlbums =
      vibe.keywords.length === 0
        ? curatedAlbums
        : curatedAlbums.filter((b) => {
            const hay = `${b.album.title} ${b.album.artist ?? ''}`.toLowerCase()
            return vibe.keywords.some((kw) => hay.includes(kw))
          })
    const pool = (matchingAlbums.length > 0 ? matchingAlbums : curatedAlbums).flatMap((b) =>
      b.tracks.map((t) => ({ track: t, album: b.album })),
    )
    if (pool.length === 0) return
    const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, 35)
    const first = shuffled[0]
    const radioTracks = shuffled.map((item) => item.track)
    void playTrack(
      first.track,
      first.album,
      {
        gameId: `radio_${vibe.id}`,
        title: `${vibe.label} Radio`,
        coverUrl: first.album.cover_url,
      },
      radioTracks,
    )
    toast.success(`Started ${vibe.label} Live Radio (${radioTracks.length} tracks)`)
  }

  const handleScanLocalFiles = async () => {
    setScanningLocal(true)
    try {
      const scanned = await scanSoundtrackLibrary()
      setLocalFiles(scanned)
      toast.success(`Scanned ${scanned.length} local soundtrack file(s)`)
    } catch {
      toast.error('Could not scan local soundtrack library')
    } finally {
      setScanningLocal(false)
    }
  }

  const handleSelectAlbumBundle = (bundle: SoundtrackAlbumWithTracks, startPlaying = false) => {
    setActiveAlbumBundle(bundle)
    setStatusLabel(bundle.album.title)
    if (startPlaying && bundle.tracks.length > 0) {
      void playAlbum(bundle.album, bundle.tracks, 0, {
        gameId: bundle.album.game_id || bundle.album.id,
        title: bundle.album.title,
        coverUrl: bundle.album.cover_url,
      })
    }
  }

  const prevFocus = useFocusable<HTMLButtonElement>({
    id: 'music_prev',
    scopeId: 'console_music_controls',
    onConfirm: () => {
      void previous()
    },
  })

  const playFocus = useFocusable<HTMLButtonElement>({
    id: 'music_play_toggle',
    scopeId: 'console_music_controls',
    onConfirm: () => {
      if (!currentTrack && activeAlbumBundle && activeAlbumBundle.tracks.length > 0) {
        void playAlbum(activeAlbumBundle.album, activeAlbumBundle.tracks, 0)
      } else {
        togglePlay()
      }
    },
  })

  const nextFocus = useFocusable<HTMLButtonElement>({
    id: 'music_next',
    scopeId: 'console_music_controls',
    onConfirm: () => {
      void next()
    },
  })

  const shuffleFocus = useFocusable<HTMLButtonElement>({
    id: 'music_shuffle',
    scopeId: 'console_music_controls',
    onConfirm: () => toggleShuffle(),
  })

  const repeatFocus = useFocusable<HTMLButtonElement>({
    id: 'music_repeat',
    scopeId: 'console_music_controls',
    onConfirm: () => cycleRepeatMode(),
  })

  const muteFocus = useFocusable<HTMLButtonElement>({
    id: 'music_mute',
    scopeId: 'console_music_controls',
    onConfirm: () => toggleMute(),
  })

  const vizFocus = useFocusable<HTMLButtonElement>({
    id: 'music_viz_mode',
    scopeId: 'console_music_controls',
    onConfirm: () => {
      const modes: VisualizerMode[] = ['minimal', 'reactive', 'off']
      const nextMode = modes[(modes.indexOf(visualizerMode) + 1) % modes.length]
      setVisualizerMode(nextMode)
    },
  })

  const favTrackFocus = useFocusable<HTMLButtonElement>({
    id: 'music_fav_current',
    scopeId: 'console_music_controls',
    onConfirm: () => {
      if (!currentTrack) return
      void toggleFavorite('track', currentTrack.id, {
        track: currentTrack,
        album: currentAlbum ?? activeAlbumBundle?.album ?? null,
      })
    },
  })

  const keypadSearchFocus = useFocusable<HTMLButtonElement>({
    id: 'music_keypad_search',
    scopeId: 'console_music_search_bar',
    onConfirm: () => {
      openOsk('Search Any Game or Custom Soundtrack', customQuery, (val) => {
        executeCustomOstSearch(val)
      })
    },
  })

  const displayedTracks: SoundtrackTrack[] =
    activeAlbumBundle?.tracks?.length
      ? activeAlbumBundle.tracks
      : queue.length > 0
        ? queue
        : (curatedAlbums[0]?.tracks ?? [])

  const activeCover = resolveConsoleHighResUrl(
    currentAlbum?.cover_url ??
      activeAlbumBundle?.album.cover_url ??
      selectedSoundtrackGame?.coverUrl,
  )

  const favoriteTrackEntries = useMemo(
    () => Object.values(savedFavoriteTracks ?? {}),
    [savedFavoriteTracks],
  )
  const favoriteAlbumEntries = useMemo(
    () => Object.values(savedFavoriteAlbums ?? {}),
    [savedFavoriteAlbums],
  )

  const isCurrentTrackFav = Boolean(currentTrack && favorites.has(`track:${currentTrack.id}`))

  return (
    <div className="space-y-6 pb-20">
      {/* Top Search Bar + Sub-Tab Navigation (Matching Desktop SoundtrackCenterPage) */}
      <div className="flex flex-col gap-4">
        <FocusScope
          id="console_music_search_bar"
          orientation="horizontal"
          className={`flex flex-col sm:flex-row items-stretch sm:items-center gap-3 rounded-3xl border p-4 shadow-lg ${
            isLight
              ? 'border-slate-300 bg-white/95'
              : 'border-cyan-400/35 bg-slate-950/85 backdrop-blur-xl'
          }`}
        >
          <div className="flex flex-1 items-center gap-3 px-2">
            <Search className="size-5 text-cyan-400 shrink-0" />
            <input
              type="text"
              value={customQuery}
              onChange={(e) => executeCustomOstSearch(e.target.value)}
              placeholder="Search any game soundtrack, composer, boss theme, or track..."
              className={`w-full bg-transparent text-base font-bold outline-none ${
                isLight
                  ? 'text-slate-900 placeholder:text-slate-400'
                  : 'text-white placeholder:text-slate-500'
              }`}
            />
            {loadingOst && <Loader2 className="size-4 text-cyan-400 animate-spin shrink-0" />}
            {customQuery && (
              <button
                type="button"
                onClick={() => executeCustomOstSearch('')}
                className="rounded-full p-1 text-slate-400 hover:text-white cursor-pointer"
                title="Clear search"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          <button
            type="button"
            {...keypadSearchFocus.focusProps}
            className={`flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-extrabold transition-all cursor-pointer ${
              keypadSearchFocus.isFocused
                ? 'scale-105 bg-cyan-400 text-slate-950 shadow-lg ring-2 ring-white'
                : isLight
                  ? 'bg-slate-900 text-white hover:bg-slate-800'
                  : 'bg-cyan-400/20 text-cyan-300 border border-cyan-400/40 hover:bg-cyan-400/30'
            }`}
          >
            <Keyboard className="size-4" />
            Controller Keypad
          </button>
        </FocusScope>

        {/* Sub-Tabs Strip (Overview, My Games, Live Radios, Favorites, Queue, Local & Cached) */}
        <FocusScope
          id="console_music_subtabs"
          orientation="horizontal"
          className="flex flex-wrap items-center gap-2.5"
        >
          {SUB_TABS.map((tab) => (
            <SubTabPill
              key={tab.id}
              id={tab.id}
              label={tab.label}
              Icon={tab.icon}
              active={subTab === tab.id}
              isLight={isLight}
              badge={
                tab.id === 'queue'
                  ? queue.length
                  : tab.id === 'favorites'
                    ? favoriteTrackEntries.length + favoriteAlbumEntries.length
                    : undefined
              }
              onSelect={() => setSubTab(tab.id)}
            />
          ))}
        </FocusScope>
      </div>

      {/* Main Vinyl Deck + Tracklist / Sub-Tab Stage */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Vinyl Deck + Live Audio Visualizer + Scrubbing & Volume */}
        <div
          className={`lg:col-span-5 rounded-3xl p-7 border backdrop-blur-xl flex flex-col items-center text-center relative overflow-hidden ${
            isLight
              ? 'bg-white/90 border-slate-300 shadow-xl'
              : 'bg-slate-900/75 border-white/10 shadow-2xl'
          }`}
        >
          {activeCover && (
            <img
              src={activeCover}
              alt=""
              className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-15 blur-2xl scale-110"
            />
          )}

          {/* Vinyl Disc + Sleeve */}
          <div className="relative z-10 w-52 h-52 mb-5 flex items-center justify-center">
            <div
              className={`w-48 h-48 rounded-full border-8 shadow-2xl flex items-center justify-center overflow-hidden ${
                isLight ? 'border-slate-300 bg-slate-900' : 'border-slate-800/90 bg-slate-950'
              } ${isPlaying ? 'animate-spin' : ''}`}
              style={{ animationDuration: '9s' }}
            >
              {activeCover ? (
                <img src={activeCover} alt="" className="w-full h-full object-cover opacity-90" />
              ) : (
                <Disc3 className="w-20 h-20 text-cyan-400/60" />
              )}
              <div className="absolute w-12 h-12 rounded-full bg-slate-950 border-4 border-cyan-400/50 shadow-inner" />
            </div>
          </div>

          <div className="relative z-10 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/15 border border-cyan-400/30 text-cyan-400 text-[11px] font-bold uppercase tracking-widest mb-2">
            <Radio className="w-3.5 h-3.5" />
            {statusLabel}
          </div>

          <h2
            className={`relative z-10 text-xl font-black line-clamp-1 ${
              isLight ? 'text-slate-900' : 'text-white'
            }`}
          >
            {currentTrack?.title ??
              activeAlbumBundle?.tracks?.[0]?.title ??
              'Select a Track to Play'}
          </h2>
          <p
            className={`relative z-10 text-sm mt-1 line-clamp-1 ${
              isLight ? 'text-slate-600' : 'text-slate-400'
            }`}
          >
            {currentTrack?.artist ??
              currentAlbum?.title ??
              activeAlbumBundle?.album.title ??
              'Click any track or Live Radio to begin listening'}
          </p>

          {/* Live Audio Visualizer Canvas */}
          {visualizerMode !== 'off' && (
            <div className="relative z-10 w-full h-12 mt-4 px-2">
              <AudioVisualizer
                mode={visualizerMode}
                className="w-full h-full rounded-xl overflow-hidden"
              />
            </div>
          )}

          {/* Seek / Progress Scrub Bar */}
          <div className="relative z-10 w-full mt-4 space-y-1.5">
            <input
              type="range"
              min={0}
              max={Math.max(1, Math.floor(duration || (currentTrack?.duration_ms ?? 0) / 1000))}
              value={Math.min(
                Math.floor(currentTime),
                Math.max(1, Math.floor(duration || (currentTrack?.duration_ms ?? 0) / 1000)),
              )}
              onChange={(e) => seek(Number(e.target.value))}
              className="w-full accent-cyan-400 cursor-pointer h-1.5 rounded-lg"
            />
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
              <span>{formatSeconds(currentTime)}</span>
              <span>
                {formatSeconds(duration || (currentTrack?.duration_ms ?? 0) / 1000)}
              </span>
            </div>
          </div>

          {/* Primary Transport Controls */}
          <FocusScope
            id="console_music_controls"
            orientation="horizontal"
            className="relative z-10 flex items-center justify-center gap-2.5 mt-4 flex-wrap"
          >
            <button
              type="button"
              {...shuffleFocus.focusProps}
              title="Toggle Shuffle"
              className={`p-2.5 rounded-2xl border transition-all cursor-pointer ${
                shuffleFocus.isFocused
                  ? 'bg-cyan-400 text-slate-950 border-white scale-110'
                  : shuffle
                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400/40'
                    : isLight
                      ? 'bg-slate-100 text-slate-600 border-slate-300'
                      : 'bg-slate-800/80 text-slate-400 border-white/10'
              }`}
            >
              <Shuffle className="w-4 h-4" />
            </button>

            <button
              type="button"
              {...prevFocus.focusProps}
              title="Previous Track"
              className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                prevFocus.isFocused
                  ? 'bg-cyan-400 text-slate-950 border-white scale-110'
                  : isLight
                    ? 'bg-slate-100 text-slate-800 border-slate-300'
                    : 'bg-slate-800/80 text-white border-white/10'
              }`}
            >
              <SkipBack className="w-5 h-5" />
            </button>

            <button
              type="button"
              {...playFocus.focusProps}
              title={isPlaying ? 'Pause' : 'Play'}
              className={`p-4 rounded-full transition-all cursor-pointer ${
                playFocus.isFocused
                  ? 'bg-cyan-300 text-slate-950 scale-110 ring-4 ring-white shadow-xl'
                  : 'bg-cyan-400 text-slate-950 shadow-lg hover:bg-cyan-300'
              }`}
            >
              {isPlaying ? (
                <Pause className="w-6 h-6 fill-current" />
              ) : (
                <Play className="w-6 h-6 fill-current" />
              )}
            </button>

            <button
              type="button"
              {...nextFocus.focusProps}
              title="Next Track"
              className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                nextFocus.isFocused
                  ? 'bg-cyan-400 text-slate-950 border-white scale-110'
                  : isLight
                    ? 'bg-slate-100 text-slate-800 border-slate-300'
                    : 'bg-slate-800/80 text-white border-white/10'
              }`}
            >
              <SkipForward className="w-5 h-5" />
            </button>

            <button
              type="button"
              {...repeatFocus.focusProps}
              title={`Repeat: ${repeatMode}`}
              className={`p-2.5 rounded-2xl border transition-all cursor-pointer ${
                repeatFocus.isFocused
                  ? 'bg-cyan-400 text-slate-950 border-white scale-110'
                  : repeatMode !== 'off'
                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400/40'
                    : isLight
                      ? 'bg-slate-100 text-slate-600 border-slate-300'
                      : 'bg-slate-800/80 text-slate-400 border-white/10'
              }`}
            >
              <Repeat className="w-4 h-4" />
            </button>

            <button
              type="button"
              {...favTrackFocus.focusProps}
              title="Favorite Current Track"
              className={`p-2.5 rounded-2xl border transition-all cursor-pointer ${
                favTrackFocus.isFocused
                  ? 'bg-rose-400 text-slate-950 border-white scale-110'
                  : isCurrentTrackFav
                    ? 'bg-rose-500/20 text-rose-400 border-rose-400/40'
                    : isLight
                      ? 'bg-slate-100 text-slate-600 border-slate-300'
                      : 'bg-slate-800/80 text-slate-400 border-white/10'
              }`}
            >
              <Heart className={`w-4 h-4 ${isCurrentTrackFav ? 'fill-current' : ''}`} />
            </button>

            <button
              type="button"
              {...vizFocus.focusProps}
              title={`Visualizer: ${visualizerMode}`}
              className={`p-2.5 rounded-2xl border transition-all cursor-pointer ${
                vizFocus.isFocused
                  ? 'bg-cyan-400 text-slate-950 border-white scale-110'
                  : visualizerMode !== 'off'
                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400/40'
                    : isLight
                      ? 'bg-slate-100 text-slate-600 border-slate-300'
                      : 'bg-slate-800/80 text-slate-400 border-white/10'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
            </button>
          </FocusScope>

          {/* Volume Control Strip */}
          <div className="relative z-10 flex items-center gap-3 w-full mt-4 pt-3 border-t border-white/10">
            <button
              type="button"
              {...muteFocus.focusProps}
              className={`p-2 rounded-xl transition-all cursor-pointer ${
                muteFocus.isFocused
                  ? 'bg-cyan-400 text-slate-950'
                  : 'text-slate-400 hover:text-white'
              }`}
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="size-4 text-rose-400" />
              ) : (
                <Volume2 className="size-4 text-cyan-400" />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={100}
              value={isMuted ? 0 : Math.round(volume * 100)}
              onChange={(e) => setVolume(Number(e.target.value) / 100)}
              className="flex-1 accent-cyan-400 cursor-pointer h-1.5 rounded-lg"
            />
            <span className="text-xs font-mono text-slate-400 w-9 text-right">
              {isMuted ? '0%' : `${Math.round(volume * 100)}%`}
            </span>
          </div>
        </div>

        {/* Right Stage: Switches by Sub-Tab */}
        <div
          className={`lg:col-span-7 rounded-3xl p-6 border backdrop-blur-xl max-h-[540px] overflow-y-auto no-scrollbar ${
            isLight
              ? 'bg-white/90 border-slate-300 shadow-xl'
              : 'bg-slate-900/75 border-white/10 shadow-2xl'
          }`}
        >
          {subTab === 'radios' ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3
                  className={`text-sm font-black uppercase tracking-wider flex items-center gap-2 ${
                    isLight ? 'text-slate-700' : 'text-slate-200'
                  }`}
                >
                  <Radio className="w-4 h-4 text-cyan-400" />
                  Live Vibe Radio Stations (Instant Endless Mix)
                </h3>
              </div>
              <FocusScope
                id="console_music_radios_grid"
                className="grid grid-cols-1 sm:grid-cols-2 gap-3.5"
              >
                {VIBE_FILTERS.map((vibe) => (
                  <LiveRadioStationCard
                    key={vibe.id}
                    vibe={vibe}
                    isLight={isLight}
                    onPlayRadio={() => startLiveRadioWave(vibe.id)}
                  />
                ))}
              </FocusScope>
            </div>
          ) : subTab === 'games' ? (
            <div className="space-y-4">
              <h3
                className={`text-sm font-black uppercase tracking-wider flex items-center gap-2 ${
                  isLight ? 'text-slate-700' : 'text-slate-200'
                }`}
              >
                <Gamepad2 className="w-4 h-4 text-cyan-400" />
                Your Installed & Library Games ({games.length})
              </h3>
              {games.length === 0 ? (
                <p className="text-sm text-slate-400 py-8 text-center">
                  No library games found yet. Use the search bar above to stream any game OST!
                </p>
              ) : (
                <FocusScope
                  id="console_music_my_games"
                  className="grid grid-cols-2 sm:grid-cols-3 gap-3.5"
                >
                  {games.map((g) => (
                    <LibraryOstCard
                      key={g.id}
                      game={g}
                      active={selectedSoundtrackGame?.id === g.id}
                      isLight={isLight}
                      onSelect={() => {
                        setSelectedSoundtrackGame({
                          id: g.id,
                          name: g.name,
                          coverUrl: g.cover_path,
                          steamAppId: g.steam_app_id,
                          igdbId: g.igdb_id,
                        })
                        setSubTab('overview')
                      }}
                    />
                  ))}
                </FocusScope>
              )}
            </div>
          ) : subTab === 'favorites' ? (
            <div className="space-y-4">
              <h3
                className={`text-sm font-black uppercase tracking-wider flex items-center gap-2 ${
                  isLight ? 'text-slate-700' : 'text-slate-200'
                }`}
              >
                <Heart className="w-4 h-4 text-rose-400" />
                Favorite Tracks ({favoriteTrackEntries.length})
              </h3>
              {favoriteTrackEntries.length === 0 ? (
                <p className="text-sm text-slate-400 py-10 text-center">
                  No favorite tracks yet. Press the Heart icon on any track to save it here.
                </p>
              ) : (
                <FocusScope id="console_music_fav_tracks" className="space-y-2">
                  {favoriteTrackEntries.map(({ track, album }, idx) => (
                    <TrackRowButton
                      key={track.id}
                      track={track}
                      index={idx}
                      active={currentTrack?.id === track.id}
                      isFavorite={favorites.has(`track:${track.id}`)}
                      isLight={isLight}
                      onSelect={() => {
                        void playTrack(
                          track,
                          album,
                          album
                            ? {
                                gameId: album.game_id || album.id,
                                title: album.title,
                                coverUrl: album.cover_url,
                              }
                            : null,
                          favoriteTrackEntries.map((e) => e.track),
                        )
                      }}
                      onToggleFav={() => {
                        void toggleFavorite('track', track.id, { track, album })
                      }}
                    />
                  ))}
                </FocusScope>
              )}
            </div>
          ) : subTab === 'queue' ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3
                  className={`text-sm font-black uppercase tracking-wider flex items-center gap-2 ${
                    isLight ? 'text-slate-700' : 'text-slate-200'
                  }`}
                >
                  <ListMusic className="w-4 h-4 text-cyan-400" />
                  Playback Queue ({queue.length} Tracks)
                </h3>
                {queue.length > 0 && (
                  <button
                    type="button"
                    onClick={() => clearQueue()}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-rose-500/15 border border-rose-400/30 px-3 py-1.5 text-xs font-bold text-rose-300 hover:bg-rose-500/25 cursor-pointer"
                  >
                    <Trash2 className="size-3.5" />
                    Clear Queue
                  </button>
                )}
              </div>
              {queue.length === 0 ? (
                <p className="text-sm text-slate-400 py-10 text-center">
                  Your playback queue is empty. Select any track or Live Radio to populate the queue.
                </p>
              ) : (
                <FocusScope id="console_music_queue_list" className="space-y-2">
                  {queue.map((track, idx) => (
                    <div key={`${track.id}_${idx}`} className="flex items-center gap-2">
                      <div className="flex-1">
                        <TrackRowButton
                          track={track}
                          index={idx}
                          active={currentTrack?.id === track.id}
                          isFavorite={favorites.has(`track:${track.id}`)}
                          isLight={isLight}
                          onSelect={() => {
                            void playTrack(track, currentAlbum, null, queue)
                          }}
                          onToggleFav={() => {
                            void toggleFavorite('track', track.id, {
                              track,
                              album: currentAlbum,
                            })
                          }}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFromQueue(idx)}
                        className="p-2 rounded-xl text-slate-400 hover:text-rose-400 cursor-pointer"
                        title="Remove from queue"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  ))}
                </FocusScope>
              )}
            </div>
          ) : subTab === 'downloaded' ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3
                  className={`text-sm font-black uppercase tracking-wider flex items-center gap-2 ${
                    isLight ? 'text-slate-700' : 'text-slate-200'
                  }`}
                >
                  <HardDrive className="w-4 h-4 text-cyan-400" />
                  Local & Cached Soundtracks ({localFiles.length + downloads.length})
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    void handleScanLocalFiles()
                  }}
                  disabled={scanningLocal}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-500/20 border border-cyan-400/40 px-3 py-1.5 text-xs font-extrabold text-cyan-300 hover:bg-cyan-500/30 cursor-pointer"
                >
                  <FolderSync className={`size-3.5 ${scanningLocal ? 'animate-spin' : ''}`} />
                  {scanningLocal ? 'Scanning...' : 'Scan Local Folder'}
                </button>
              </div>
              {localFiles.length === 0 && downloads.length === 0 ? (
                <p className="text-sm text-slate-400 py-10 text-center">
                  No local or downloaded soundtrack files indexed yet. Click &ldquo;Scan Local
                  Folder&rdquo; to scan your soundtrack directory.
                </p>
              ) : (
                <div className="space-y-2">
                  {localFiles.map((lf, idx) => (
                    <button
                      key={lf.id}
                      type="button"
                      onClick={() => {
                        const localTrack: SoundtrackTrack = {
                          id: lf.id,
                          album_id: 'local_files',
                          title: lf.title || lf.file_path.split(/[\\/]/).pop() || 'Local Track',
                          artist: lf.artist ?? 'Local Library',
                          track_number: idx + 1,
                          duration_ms: lf.duration_ms ?? 180000,
                          source_provider: 'local',
                          stream_url: lf.file_path,
                          local_path: lf.file_path,
                          is_Playable: true,
                        }
                        void playTrack(localTrack, null, {
                          gameId: 'local',
                          title: 'Local Soundtrack Library',
                          coverUrl: null,
                        })
                      }}
                      className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl text-left transition-all cursor-pointer ${
                        isLight
                          ? 'bg-slate-100 hover:bg-slate-200 text-slate-900'
                          : 'bg-slate-800/50 hover:bg-slate-800 text-white'
                      }`}
                    >
                      <div className="truncate pr-3">
                        <div className="text-sm font-bold truncate">
                          {lf.title || lf.file_path.split(/[\\/]/).pop()}
                        </div>
                        <div className="text-xs text-slate-400 truncate">
                          {lf.artist ?? 'Local File'} · {lf.album ?? ''}
                        </div>
                      </div>
                      <Play className="size-4 text-cyan-400 shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Overview Tab: Active Album Tracklist */
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3
                  className={`text-sm font-black uppercase tracking-wider flex items-center gap-2 ${
                    isLight ? 'text-slate-700' : 'text-slate-300'
                  }`}
                >
                  <Music className="w-4 h-4 text-cyan-400" />
                  {activeAlbumBundle?.album.title ?? 'Tracklist'} ({displayedTracks.length} Tracks)
                </h3>
                {activeAlbumBundle && activeAlbumBundle.tracks.length > 0 && (
                  <button
                    type="button"
                    onClick={() => handleSelectAlbumBundle(activeAlbumBundle, true)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-400 px-3 py-1.5 text-xs font-black text-slate-950 hover:bg-cyan-300 cursor-pointer"
                  >
                    <Play className="size-3.5 fill-current" />
                    Play Full Album
                  </button>
                )}
              </div>

              <FocusScope id="console_music_tracks" className="space-y-2">
                {displayedTracks.map((track, idx) => (
                  <TrackRowButton
                    key={track.id}
                    track={track}
                    index={idx}
                    active={currentTrack?.id === track.id}
                    isFavorite={favorites.has(`track:${track.id}`)}
                    isLight={isLight}
                    onSelect={() => {
                      const album = activeAlbumBundle?.album ?? currentAlbum
                      void playTrack(
                        track,
                        album,
                        album
                          ? {
                              gameId: album.game_id || album.id,
                              title: album.title,
                              coverUrl: album.cover_url,
                            }
                          : null,
                        displayedTracks,
                      )
                    }}
                    onToggleFav={() => {
                      void toggleFavorite('track', track.id, {
                        track,
                        album: activeAlbumBundle?.album ?? currentAlbum,
                      })
                    }}
                  />
                ))}
              </FocusScope>
            </div>
          )}
        </div>
      </div>

      {/* Vibe Filter Pills + Curated & Online Albums Shelf */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3
            className={`text-sm font-black uppercase tracking-wider flex items-center gap-2 ${
              isLight ? 'text-slate-700' : 'text-slate-300'
            }`}
          >
            <Sparkles className="w-4 h-4 text-cyan-400" />
            {customQuery.trim()
              ? `Soundtrack Albums Matching "${customQuery}"`
              : 'Browse by Vibe & Curated Game Soundtracks'}
          </h3>

          <FocusScope
            id="console_music_vibe_pills"
            orientation="horizontal"
            className="flex flex-wrap items-center gap-2"
          >
            {VIBE_FILTERS.map((v) => (
              <VibePillButton
                key={v.id}
                id={v.id}
                label={v.label}
                active={vibeFilter === v.id}
                isLight={isLight}
                onSelect={() => setVibeFilter(v.id)}
              />
            ))}
          </FocusScope>
        </div>

        <FocusScope
          id="console_music_curated_albums"
          orientation="horizontal"
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4"
        >
          {filteredAlbums.slice(0, 18).map((bundle) => (
            <CuratedAlbumCard
              key={bundle.album.id}
              bundle={bundle}
              active={
                currentAlbum?.id === bundle.album.id ||
                activeAlbumBundle?.album.id === bundle.album.id
              }
              isLight={isLight}
              onSelect={() => handleSelectAlbumBundle(bundle, false)}
              onPlayImmediate={() => handleSelectAlbumBundle(bundle, true)}
            />
          ))}
        </FocusScope>
      </div>
    </div>
  )
}

const SubTabPill: React.FC<{
  id: CenterSubTab
  label: string
  Icon: typeof Sparkles
  active: boolean
  isLight: boolean
  badge?: number
  onSelect: () => void
}> = ({ id, label, Icon, active, isLight, badge, onSelect }) => {
  const { focusProps, isFocused } = useFocusable<HTMLButtonElement>({
    id: `music_subtab_${id}`,
    scopeId: 'console_music_subtabs',
    onConfirm: onSelect,
  })
  return (
    <button
      type="button"
      {...focusProps}
      className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-extrabold transition-all cursor-pointer outline-none ${
        isFocused
          ? 'scale-105 bg-cyan-400 text-slate-950 shadow-lg ring-2 ring-white'
          : active
            ? isLight
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-cyan-400/20 text-cyan-300 border border-cyan-400/40'
            : isLight
              ? 'bg-white/85 text-slate-700 border border-slate-300 hover:bg-slate-100'
              : 'bg-slate-900/75 text-slate-300 border border-white/10 hover:bg-white/10'
      }`}
    >
      <Icon className="size-3.5" />
      <span>{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="rounded-full bg-cyan-400/30 px-1.5 py-0.5 text-[10px] font-black">
          {badge}
        </span>
      )}
    </button>
  )
}

const VibePillButton: React.FC<{
  id: VibeFilterId
  label: string
  active: boolean
  isLight: boolean
  onSelect: () => void
}> = ({ id, label, active, isLight, onSelect }) => {
  const { focusProps, isFocused } = useFocusable<HTMLButtonElement>({
    id: `music_vibe_${id}`,
    scopeId: 'console_music_vibe_pills',
    onConfirm: onSelect,
  })
  return (
    <button
      type="button"
      {...focusProps}
      className={`rounded-full px-3.5 py-1.5 text-xs font-extrabold transition-all cursor-pointer outline-none ${
        isFocused
          ? 'scale-105 bg-cyan-400 text-slate-950 shadow-md ring-2 ring-white'
          : active
            ? 'bg-cyan-400 text-slate-950'
            : isLight
              ? 'bg-slate-200 text-slate-700 hover:bg-slate-300'
              : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
      }`}
    >
      {label}
    </button>
  )
}

const LiveRadioStationCard: React.FC<{
  vibe: (typeof VIBE_FILTERS)[number]
  isLight: boolean
  onPlayRadio: () => void
}> = ({ vibe, isLight, onPlayRadio }) => {
  const Icon = vibe.icon
  const { focusProps, isFocused } = useFocusable<HTMLButtonElement>({
    id: `music_radio_${vibe.id}`,
    scopeId: 'console_music_radios_grid',
    onConfirm: onPlayRadio,
  })
  return (
    <button
      type="button"
      {...focusProps}
      className={`group relative overflow-hidden rounded-2xl border p-4 text-left transition-all cursor-pointer outline-none bg-gradient-to-br ${vibe.gradient} ${
        isFocused
          ? 'scale-[1.03] border-cyan-300 ring-2 ring-cyan-400 shadow-xl'
          : isLight
            ? 'border-slate-300 bg-white/80 hover:border-indigo-400'
            : 'border-white/10 bg-slate-900/60 hover:border-cyan-400/40'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-cyan-400/20 text-cyan-300">
          <Icon className="size-5" />
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-cyan-400 px-2.5 py-1 text-[10px] font-black uppercase text-slate-950">
          <Play className="size-3 fill-current" />
          Start Wave
        </span>
      </div>
      <div
        className={`mt-3 text-base font-black ${isLight ? 'text-slate-900' : 'text-white'}`}
      >
        {vibe.label}
      </div>
      <div className={`text-xs mt-0.5 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
        {vibe.subtitle}
      </div>
    </button>
  )
}

const TrackRowButton: React.FC<{
  track: SoundtrackTrack
  index: number
  active: boolean
  isFavorite: boolean
  isLight: boolean
  onSelect: () => void
  onToggleFav: () => void
}> = ({ track, index, active, isFavorite, isLight, onSelect, onToggleFav }) => {
  const { focusProps, isFocused } = useFocusable<HTMLButtonElement>({
    id: `music_track_${track.id}_${index}`,
    scopeId: 'console_music_tracks',
    onConfirm: onSelect,
  })
  const mins = track.duration_ms ? Math.floor(track.duration_ms / 60000) : 0
  const secs = track.duration_ms ? Math.floor((track.duration_ms % 60000) / 1000) : 0

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        {...focusProps}
        className={`flex-1 flex items-center justify-between px-4 py-3 rounded-2xl text-left transition-all cursor-pointer outline-none ${
          isFocused
            ? 'bg-cyan-400 text-slate-950 font-extrabold scale-[1.01] shadow-md'
            : active
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 font-bold'
              : isLight
                ? 'bg-slate-100/90 text-slate-800 hover:bg-slate-200'
                : 'bg-slate-800/45 text-slate-300 hover:bg-slate-800/75'
        }`}
      >
        <div className="flex items-center gap-3 truncate pr-3">
          <span className="text-xs font-mono opacity-60 w-6">
            {String(index + 1).padStart(2, '0')}
          </span>
          <div className="truncate">
            <div className="text-sm truncate">{track.title}</div>
            {track.artist && <div className="text-[11px] opacity-70 truncate">{track.artist}</div>}
          </div>
        </div>
        <span className="text-xs font-mono opacity-75 shrink-0">
          {track.duration_ms ? `${mins}:${secs.toString().padStart(2, '0')}` : 'OST'}
        </span>
      </button>

      <button
        type="button"
        onClick={onToggleFav}
        title={isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
        className={`p-3 rounded-2xl border transition-all cursor-pointer ${
          isFavorite
            ? 'bg-rose-500/20 border-rose-400/40 text-rose-400'
            : isLight
              ? 'bg-slate-100 border-slate-300 text-slate-500 hover:text-rose-500'
              : 'bg-slate-800/45 border-white/10 text-slate-400 hover:text-rose-400'
        }`}
      >
        <Heart className={`size-4 ${isFavorite ? 'fill-current' : ''}`} />
      </button>
    </div>
  )
}

const LibraryOstCard: React.FC<{
  game: Game
  active: boolean
  isLight: boolean
  onSelect: () => void
}> = ({ game, active, isLight, onSelect }) => {
  const { focusProps, isFocused } = useFocusable<HTMLButtonElement>({
    id: `music_lib_game_${game.id}`,
    scopeId: 'console_music_my_games',
    onConfirm: onSelect,
  })
  const cover = resolveConsoleHighResUrl(game.cover_path ?? game.background_path)
  return (
    <button
      type="button"
      {...focusProps}
      className={`group relative overflow-hidden rounded-2xl border p-3 text-left transition-all cursor-pointer outline-none ${
        isFocused
          ? 'scale-105 border-cyan-300 ring-2 ring-cyan-400 bg-cyan-500/20 shadow-xl'
          : active
            ? 'border-cyan-400/60 bg-cyan-500/15'
            : isLight
              ? 'border-slate-300 bg-white/90 hover:bg-slate-100'
              : 'border-white/10 bg-slate-900/75 hover:bg-slate-800/80'
      }`}
    >
      <div className="aspect-square w-full overflow-hidden rounded-xl bg-slate-800 mb-2.5">
        {cover ? (
          <img src={cover} alt={game.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Disc3 className="w-8 h-8 text-cyan-400/50" />
          </div>
        )}
      </div>
      <div
        className={`text-xs font-extrabold truncate ${isLight ? 'text-slate-900' : 'text-white'}`}
      >
        {game.name}
      </div>
      <div className="text-[10px] text-cyan-400 font-semibold truncate">Load Game OST</div>
    </button>
  )
}

const CuratedAlbumCard: React.FC<{
  bundle: SoundtrackAlbumWithTracks
  active: boolean
  isLight: boolean
  onSelect: () => void
  onPlayImmediate: () => void
}> = ({ bundle, active, isLight, onSelect, onPlayImmediate }) => {
  const { focusProps, isFocused } = useFocusable<HTMLButtonElement>({
    id: `music_curated_${bundle.album.id}`,
    scopeId: 'console_music_curated_albums',
    onConfirm: onSelect,
  })
  const cover = resolveConsoleHighResUrl(bundle.album.cover_url)
  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border p-3 text-left transition-all ${
        isFocused
          ? 'scale-105 border-cyan-300 ring-2 ring-cyan-400 bg-cyan-500/20 shadow-xl'
          : active
            ? 'border-cyan-400/60 bg-cyan-500/15'
            : isLight
              ? 'border-slate-300 bg-white/90 hover:bg-slate-100'
              : 'border-white/10 bg-slate-900/75 hover:bg-slate-800/80'
      }`}
    >
      <button type="button" {...focusProps} className="w-full text-left outline-none cursor-pointer">
        <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-slate-800 mb-2.5">
          {cover ? (
            <img src={cover} alt={bundle.album.title} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Disc3 className="w-8 h-8 text-cyan-400/50" />
            </div>
          )}
        </div>
        <div
          className={`text-xs font-extrabold truncate ${
            isLight ? 'text-slate-900' : 'text-white'
          }`}
        >
          {bundle.album.title}
        </div>
        <div className="text-[10px] text-slate-400 truncate">
          {bundle.tracks.length} Tracks · {bundle.album.release_year ?? 'OST'}
        </div>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onPlayImmediate()
        }}
        title="Play Album Now"
        className="mt-2 w-full flex items-center justify-center gap-1 rounded-xl bg-cyan-400/20 border border-cyan-400/40 py-1.5 text-[11px] font-extrabold text-cyan-300 hover:bg-cyan-400 hover:text-slate-950 transition-colors cursor-pointer"
      >
        <Play className="size-3 fill-current" />
        Play Album
      </button>
    </div>
  )
}
