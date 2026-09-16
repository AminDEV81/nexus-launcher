import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FolderSync, HardDrive, Heart, Music, Play, Search, Sparkles } from 'lucide-react'
import { playButtonClick } from '@/lib/sound-engine'
import { useSoundtrackPlayer } from '../hooks/use-soundtrack-player'
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
import type { SoundtrackAlbumWithTracks, SoundtrackTrack } from '../types'
import { toast } from 'sonner'
import { queryClient } from '@/app/query-client'
import { assetUrl } from '@/lib/asset-url'

type CenterTab = 'overview' | 'games' | 'favorites' | 'downloaded' | 'all'

export function SoundtrackCenterPage() {
  const [activeTab, setActiveTab] = useState<CenterTab>('overview')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedAlbum, setSelectedAlbum] = useState<SoundtrackAlbumWithTracks | null>(null)
  const [isScanning, setIsScanning] = useState(false)

  const { favorites, playTrack } = useSoundtrackPlayer()

  // Load all albums saved in SQLite
  const { data: allAlbums = [], refetch: refetchAlbums } = useQuery({
    queryKey: ['soundtrack', 'all-albums'],
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
    queryKey: ['soundtrack', 'favorites-list'],
    queryFn: () => getSoundtrackFavorites(),
  })

  // Full album objects with tracks for grid
  const { data: albumsWithTracks = [] } = useQuery({
    queryKey: ['soundtrack', 'albums-with-tracks', allAlbums.length],
    queryFn: async () => {
      const results: SoundtrackAlbumWithTracks[] = []
      for (const alb of allAlbums.slice(0, 40)) {
        const full = await getSoundtrackAlbum(alb.id)
        if (full) results.push(full)
      }
      return results
    },
    enabled: allAlbums.length > 0,
  })

  async function handleScan() {
    playButtonClick()
    setIsScanning(true)
    toast.info('Scanning for local soundtracks...')
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

  // Filtered albums by search
  const filteredAlbums = useMemo(() => {
    let list = albumsWithTracks
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
  }, [albumsWithTracks, searchQuery])

  // Downloaded / Offline tracks unified from albums, download table, and local file scans
  const downloadedTracks = useMemo(() => {
    const list: SoundtrackTrack[] = []
    const seenPaths = new Set<string>()
    const seenIds = new Set<string>()

    // 1. Tracks already loaded in albums with local_path
    for (const alb of albumsWithTracks) {
      for (const t of alb.tracks) {
        if (t.local_path && !seenPaths.has(t.local_path)) {
          seenPaths.add(t.local_path)
          seenIds.add(t.id)
          list.push(t)
        }
      }
    }

    // 2. Completed download rows from SQLite
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

    // 3. Local scanned files
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

  // Favorited tracks reactively linked to favorites Set & SQLite records
  const favoritedTracks = useMemo(() => {
    const list: SoundtrackTrack[] = []
    const seenIds = new Set<string>()

    // Favorited from albumsWithTracks
    for (const alb of albumsWithTracks) {
      for (const t of alb.tracks) {
        if (favorites.has(t.id) && !seenIds.has(t.id)) {
          seenIds.add(t.id)
          list.push(t)
        }
      }
    }

    // Favorited from downloaded tracks
    for (const t of downloadedTracks) {
      if (favorites.has(t.id) && !seenIds.has(t.id)) {
        seenIds.add(t.id)
        list.push(t)
      }
    }

    // Also include favorite rows from SQLite if not found in loaded albums
    for (const f of favoriteRows) {
      if (f.target_type === 'track' && !seenIds.has(f.target_id) && favorites.has(f.target_id)) {
        seenIds.add(f.target_id)
        list.push({
          id: f.target_id,
          album_id: '',
          disc_number: 1,
          track_number: 1,
          title: 'Favorited Track',
          artist: 'Soundtrack',
          duration_ms: 0,
          preview_url: null,
          stream_url: null,
          download_url: null,
          local_path: null,
          provider_id: 'soundtrack',
          external_id: null,
        })
      }
    }

    return list
  }, [albumsWithTracks, downloadedTracks, favoriteRows, favorites])

  // Favorited albums reactively linked to favorites Set
  const favoritedAlbums = useMemo(() => {
    return albumsWithTracks.filter((alb) => favorites.has(alb.album.id))
  }, [albumsWithTracks, favorites])

  // Featured Hero Album (first album with tracks or current album)
  const featuredAlbum = useMemo(() => {
    if (albumsWithTracks.length === 0) return null
    return albumsWithTracks[0]
  }, [albumsWithTracks])

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-bg p-6 lg:p-8 select-none">
      <div className="mx-auto flex w-full max-w-[1920px] flex-col gap-8">
        {/* Header Title & Search / Scan Bar */}
        <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-border/80 pb-6">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-accent">
              <Sparkles className="size-3.5" />
              <span>Cinematic Soundtrack Platform</span>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-text mt-1">Soundtrack</h1>
            <p className="text-xs text-muted mt-1">
              Stream and discover video game original scores and soundtracks.
            </p>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            {/* Search Input */}
            <div className="relative flex-1 md:w-72">
              <Search className="size-4 text-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search soundtracks, artists, songs..."
                className="w-full rounded-2xl border border-border/80 bg-surface/80 pl-10 pr-4 py-2 text-xs font-medium text-text placeholder:text-muted/60 focus:border-accent focus:outline-none transition-all"
              />
            </div>

            {/* Scan Music Folder */}
            <button
              type="button"
              onClick={handleScan}
              disabled={isScanning}
              className="flex items-center gap-2 rounded-2xl border border-border/80 bg-surface px-4 py-2 text-xs font-semibold text-text hover:bg-surface-raised active:scale-95 disabled:opacity-50 transition-all shrink-0"
            >
              <FolderSync className={`size-3.5 text-accent ${isScanning ? 'animate-spin' : ''}`} />
              <span>{isScanning ? 'Scanning...' : 'Scan Music'}</span>
            </button>
          </div>
        </header>

        {/* Cinematic Featured Hero */}
        {featuredAlbum && activeTab === 'overview' && !searchQuery && (
          <section className="relative overflow-hidden rounded-3xl border border-border/80 bg-surface p-6 sm:p-8 shadow-xl">
            <div
              className="pointer-events-none absolute -right-20 -top-20 size-96 rounded-full opacity-25 blur-3xl"
              style={{
                background:
                  'radial-gradient(circle, var(--nx-accent) 0%, rgba(99, 102, 241, 0.4) 50%, transparent 70%)',
              }}
            />

            <div className="relative z-10 flex flex-col sm:flex-row items-center sm:items-end gap-6">
              <div className="size-40 sm:size-48 shrink-0 overflow-hidden rounded-2xl border border-border/80 bg-surface-raised shadow-card">
                {assetUrl(featuredAlbum.album.cover_url) ? (
                  <img
                    src={assetUrl(featuredAlbum.album.cover_url) ?? ''}
                    alt={featuredAlbum.album.title}
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center bg-accent/10 font-bold text-accent text-3xl">
                    OST
                  </div>
                )}
              </div>

              <div className="flex flex-col min-w-0 flex-1 text-center sm:text-left">
                <span className="text-[10px] font-bold uppercase tracking-widest text-accent">
                  Featured Album
                </span>
                <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-text mt-1 truncate">
                  {featuredAlbum.album.title}
                </h2>
                <p className="text-sm font-medium text-muted mt-1">{featuredAlbum.album.artist}</p>

                <div className="mt-4 flex flex-wrap items-center justify-center sm:justify-start gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      playButtonClick()
                      if (featuredAlbum.tracks.length > 0) {
                        void playTrack(featuredAlbum.tracks[0], featuredAlbum.album)
                      }
                    }}
                    className="flex items-center gap-2 rounded-2xl bg-accent px-5 py-2.5 text-xs font-bold text-white shadow-[0_0_16px_var(--nx-accent)] hover:scale-104 active:scale-95 transition-all"
                  >
                    <Play className="size-4 fill-current translate-x-0.5" />
                    <span>Listen Now</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedAlbum(featuredAlbum)}
                    className="flex items-center gap-2 rounded-2xl border border-border/80 bg-surface-raised px-4 py-2.5 text-xs font-bold text-text hover:border-accent/40 hover:bg-accent/10 transition-all"
                  >
                    <span>View Tracklist ({featuredAlbum.tracks.length})</span>
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Navigation Tabs */}
        <nav className="flex items-center gap-2 border-b border-border/60 pb-3 overflow-x-auto">
          {[
            { id: 'overview', label: 'Overview', icon: Music },
            { id: 'games', label: 'Library Games', icon: Sparkles },
            { id: 'favorites', label: `Favorites (${favoritedTracks.length})`, icon: Heart },
            {
              id: 'downloaded',
              label: `Local / Offline (${downloadedTracks.length})`,
              icon: HardDrive,
            },
            { id: 'all', label: `All Albums (${allAlbums.length})`, icon: Music },
          ].map((tab) => {
            const Icon = tab.icon
            const active = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  playButtonClick()
                  setActiveTab(tab.id as CenterTab)
                }}
                className={`flex items-center gap-2 rounded-2xl px-4 py-2 text-xs font-bold transition-all shrink-0 ${
                  active
                    ? 'border border-accent/40 bg-accent/15 text-accent shadow-sm'
                    : 'text-muted hover:bg-surface-raised hover:text-text'
                }`}
              >
                <Icon className="size-3.5" />
                <span>{tab.label}</span>
              </button>
            )
          })}
        </nav>

        {/* Tab 1: Overview / Albums Grid */}
        {activeTab === 'overview' && (
          <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-text">Discovered Albums</h3>
              <span className="text-xs text-muted">{filteredAlbums.length} albums</span>
            </div>

            {filteredAlbums.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-3xl border border-border/80 bg-surface/40 p-12 text-center">
                <Music className="size-12 text-muted/40 mb-3" />
                <h4 className="text-sm font-bold text-text">No soundtracks in catalog yet</h4>
                <p className="mt-1 text-xs text-muted max-w-sm">
                  Open any game in Game Hub or your Library to discover its original soundtrack, or
                  scan your music folder.
                </p>
                <button
                  type="button"
                  onClick={handleScan}
                  className="mt-4 rounded-xl bg-accent px-4 py-2 text-xs font-bold text-white shadow-md"
                >
                  Scan Music Folder
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {filteredAlbums.map((item) => (
                  <AlbumCard
                    key={item.album.id}
                    albumWithTracks={item}
                    onOpenDetails={setSelectedAlbum}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Library Games */}
        {activeTab === 'games' && (
          <div className="flex flex-col gap-4">
            <h3 className="text-base font-bold text-text">Soundtracks from your Installed Games</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {filteredAlbums
                .filter((a) => a.album.game_id)
                .map((item) => (
                  <AlbumCard
                    key={item.album.id}
                    albumWithTracks={item}
                    onOpenDetails={setSelectedAlbum}
                  />
                ))}
            </div>
          </div>
        )}

        {/* Tab 3: Favorites */}
        {activeTab === 'favorites' && (
          <div className="flex flex-col gap-6">
            {favoritedAlbums.length === 0 && favoritedTracks.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-3xl border border-border/80 bg-surface/40 p-12 text-center">
                <Heart className="size-10 text-muted/40 mb-2" />
                <h4 className="text-sm font-bold text-text">No favorites yet</h4>
                <p className="mt-1 text-xs text-muted max-w-sm">
                  Click the heart icon on any album or track to save them to your favorites for
                  instant access.
                </p>
              </div>
            ) : (
              <>
                {/* Favorited Albums */}
                {favoritedAlbums.length > 0 && (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-base font-bold text-text flex items-center gap-2">
                        <Heart className="size-4 fill-rose-500 text-rose-500" />
                        <span>Favorite Albums</span>
                      </h3>
                      <span className="text-xs text-muted font-mono">
                        {favoritedAlbums.length} albums
                      </span>
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

                {/* Favorited Tracks */}
                {favoritedTracks.length > 0 && (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-base font-bold text-text flex items-center gap-2">
                        <Music className="size-4 text-accent" />
                        <span>Favorite Tracks</span>
                      </h3>
                      <span className="text-xs text-muted font-mono">
                        {favoritedTracks.length} tracks
                      </span>
                    </div>
                    <div className="flex flex-col gap-1 rounded-2xl border border-border/80 bg-surface/60 p-2">
                      {favoritedTracks.map((t, idx) => (
                        <TrackRow key={t.id} track={t} index={idx} allTracks={favoritedTracks} />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Tab 4: Local / Offline */}
        {activeTab === 'downloaded' && (
          <div className="flex flex-col gap-4">
            <h3 className="text-base font-bold text-text">Local & Offline Soundtracks</h3>
            {downloadedTracks.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-3xl border border-border/80 bg-surface/40 p-12 text-center">
                <HardDrive className="size-10 text-muted/40 mb-2" />
                <p className="text-xs text-muted">No local offline tracks found.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-1 rounded-2xl border border-border/80 bg-surface/60 p-2">
                {downloadedTracks.map((t, idx) => (
                  <TrackRow key={t.id} track={t} index={idx} allTracks={downloadedTracks} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 5: All Albums */}
        {activeTab === 'all' && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {filteredAlbums.map((item) => (
              <AlbumCard
                key={item.album.id}
                albumWithTracks={item}
                onOpenDetails={setSelectedAlbum}
              />
            ))}
          </div>
        )}
      </div>

      {/* Album Detail Modal */}
      <AlbumDetailModal albumWithTracks={selectedAlbum} onClose={() => setSelectedAlbum(null)} />
    </div>
  )
}
