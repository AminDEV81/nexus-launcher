import React, { useEffect, useState } from 'react'
import { Disc3, Heart, Loader2, Music, Pause, Play, Plus, Radio } from 'lucide-react'
import { useSoundtrackStore } from '@/features/soundtrack/store/soundtrack-store'
import { soundtrackResolver } from '@/features/soundtrack/services/soundtrack-resolver'
import type { SoundtrackAlbumWithTracks, SoundtrackTrack } from '@/features/soundtrack/types'
import { FocusScope, useFocusable } from '../nav/FocusScope'

export interface InlineGameSoundtrackSectionProps {
  gameId: string
  gameName: string
  coverUrl?: string | null
  steamAppId?: string | null
  igdbId?: number | string | null
  isLight: boolean
  scopeId?: string
  onOpenFullCenter?: () => void
}

export const InlineGameSoundtrackSection: React.FC<InlineGameSoundtrackSectionProps> = ({
  gameId,
  gameName,
  coverUrl,
  steamAppId,
  igdbId,
  isLight,
  scopeId = 'console_inline_ost',
  onOpenFullCenter,
}) => {
  const [albums, setAlbums] = useState<SoundtrackAlbumWithTracks[]>([])
  const [selectedAlbumIdx, setSelectedAlbumIdx] = useState(0)
  const [visibleTrackLimit, setVisibleTrackLimit] = useState(24)
  const [loading, setLoading] = useState(true)

  const currentTrack = useSoundtrackStore((s) => s.currentTrack)
  const playbackState = useSoundtrackStore((s) => s.playbackState)
  const favorites = useSoundtrackStore((s) => s.favorites)
  const playAlbum = useSoundtrackStore((s) => s.playAlbum)
  const playTrack = useSoundtrackStore((s) => s.playTrack)
  const togglePlay = useSoundtrackStore((s) => s.togglePlay)
  const toggleFavorite = useSoundtrackStore((s) => s.toggleFavorite)

  useEffect(() => {
    if (!gameName) return
    let cancelled = false
    setLoading(true)
    setSelectedAlbumIdx(0)
    setVisibleTrackLimit(24)

    soundtrackResolver
      .resolveGame({
        gameId,
        title: gameName,
        coverUrl: coverUrl ?? null,
        steamAppId: steamAppId ?? null,
        igdbId:
          typeof igdbId === 'string' ? Number.parseInt(igdbId, 10) || null : (igdbId ?? null),
      })
      .then((resolved) => {
        if (cancelled) return
        if (resolved.length > 0 && resolved.some((a) => a.tracks.length > 0)) {
          setAlbums(resolved.filter((a) => a.tracks.length > 0))
          setLoading(false)
        } else {
          return soundtrackResolver.searchOnlineSoundtracksFast(gameName).then((online) => {
            if (cancelled) return
            setAlbums(online.filter((a) => a.tracks.length > 0))
            setLoading(false)
          })
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [gameId, gameName, coverUrl, steamAppId, igdbId])

  const activeBundle = albums[selectedAlbumIdx] ?? albums[0] ?? null
  const tracks = activeBundle?.tracks ?? []
  const visibleTracks = tracks.slice(0, visibleTrackLimit)
  const isPlayingThisAlbum =
    Boolean(currentTrack && tracks.some((t) => t.id === currentTrack.id)) &&
    playbackState === 'playing'

  const playAllFocus = useFocusable<HTMLButtonElement>({
    id: `${scopeId}_play_all`,
    scopeId,
    onConfirm: () => {
      if (!activeBundle || tracks.length === 0) return
      if (isPlayingThisAlbum) {
        togglePlay()
      } else {
        void playAlbum(activeBundle.album, tracks, 0, {
          gameId,
          title: gameName,
          coverUrl: activeBundle.album.cover_url ?? coverUrl ?? null,
        })
      }
    },
  })

  const openCenterFocus = useFocusable<HTMLButtonElement>({
    id: `${scopeId}_open_center`,
    scopeId,
    onConfirm: () => onOpenFullCenter?.(),
  })

  return (
    <div
      className={`rounded-3xl p-6 border backdrop-blur-xl ${
        isLight ? 'bg-white/92 border-slate-300 shadow-sm' : 'bg-slate-900/65 border-white/10'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <div
            className={`flex size-11 items-center justify-center rounded-2xl border ${
              isLight
                ? 'bg-indigo-50 border-indigo-200 text-indigo-600'
                : 'bg-cyan-500/15 border-cyan-400/30 text-cyan-400'
            }`}
          >
            <Disc3 className={`size-5 ${isPlayingThisAlbum ? 'animate-spin' : ''}`} />
          </div>
          <div>
            <h3
              className={`text-sm font-black uppercase tracking-wider flex items-center gap-2 ${
                isLight ? 'text-slate-900' : 'text-white'
              }`}
            >
              Official Game Soundtrack
              {tracks.length > 0 && (
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-extrabold ${
                    isLight
                      ? 'bg-indigo-100 text-indigo-800'
                      : 'bg-cyan-500/20 text-cyan-300'
                  }`}
                >
                  {tracks.length} Full Tracks
                </span>
              )}
            </h3>
            <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              {activeBundle?.album.title ?? `${gameName} Original Soundtrack`}
            </p>
          </div>
        </div>

        <FocusScope
          id={`${scopeId}_header_actions`}
          orientation="horizontal"
          className="flex items-center gap-2.5"
        >
          {tracks.length > 0 && (
            <button
              type="button"
              {...playAllFocus.focusProps}
              className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-xs font-black transition-all cursor-pointer outline-none ${
                playAllFocus.isFocused
                  ? 'scale-105 bg-cyan-300 text-slate-950 ring-2 ring-white shadow-lg'
                  : isLight
                    ? 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-xs'
                    : 'bg-cyan-400 text-slate-950 hover:bg-cyan-300'
              }`}
            >
              {isPlayingThisAlbum ? (
                <>
                  <Pause className="size-3.5 fill-current" />
                  Pause OST
                </>
              ) : (
                <>
                  <Play className="size-3.5 fill-current" />
                  Play Full OST
                </>
              )}
            </button>
          )}

          {onOpenFullCenter && (
            <button
              type="button"
              {...openCenterFocus.focusProps}
              className={`inline-flex items-center gap-1.5 rounded-2xl border px-3.5 py-2 text-xs font-extrabold transition-all cursor-pointer outline-none ${
                openCenterFocus.isFocused
                  ? 'scale-105 bg-cyan-400 text-slate-950 border-white shadow-lg'
                  : isLight
                    ? 'border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200'
                    : 'border-white/15 bg-white/5 text-slate-200 hover:bg-white/10'
              }`}
            >
              <Radio className={`size-3.5 ${isLight ? 'text-indigo-600' : 'text-cyan-400'}`} />
              Open in Soundtrack Center
            </button>
          )}
        </FocusScope>
      </div>

      {/* Album Selector Tabs when multiple albums exist */}
      {albums.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {albums.map((alb, i) => (
            <button
              key={alb.album.id}
              type="button"
              onClick={() => {
                setSelectedAlbumIdx(i)
                setVisibleTrackLimit(24)
              }}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                selectedAlbumIdx === i
                  ? isLight
                    ? 'bg-indigo-600 text-white'
                    : 'bg-cyan-400 text-slate-950'
                  : isLight
                    ? 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                    : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {alb.album.title} ({alb.tracks.length})
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div
          className={`flex items-center justify-center gap-2.5 py-8 text-sm ${
            isLight ? 'text-slate-600' : 'text-slate-400'
          }`}
        >
          <Loader2
            className={`size-4 animate-spin ${isLight ? 'text-indigo-600' : 'text-cyan-400'}`}
          />
          Resolving full soundtrack tracklist for {gameName}...
        </div>
      ) : tracks.length === 0 ? (
        <div
          className={`flex items-center justify-between py-4 text-xs ${
            isLight ? 'text-slate-500' : 'text-slate-400'
          }`}
        >
          <span>No indexed tracks found yet. Try searching in the Soundtrack Center.</span>
        </div>
      ) : (
        <div className="space-y-3">
          <FocusScope
            id={scopeId}
            className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[380px] overflow-y-auto pr-1"
          >
            {visibleTracks.map((track, idx) => (
              <InlineTrackRow
                key={track.id}
                track={track}
                index={idx}
                scopeId={scopeId}
                active={currentTrack?.id === track.id}
                isPlaying={currentTrack?.id === track.id && playbackState === 'playing'}
                isFavorite={favorites.has(`track:${track.id}`)}
                isLight={isLight}
                onPlay={() => {
                  if (!activeBundle) return
                  if (currentTrack?.id === track.id) {
                    togglePlay()
                  } else {
                    void playTrack(
                      track,
                      activeBundle.album,
                      {
                        gameId,
                        title: gameName,
                        coverUrl: activeBundle.album.cover_url ?? coverUrl ?? null,
                      },
                      tracks,
                    )
                  }
                }}
                onToggleFav={() => {
                  void toggleFavorite('track', track.id, {
                    track,
                    album: activeBundle?.album ?? null,
                  })
                }}
              />
            ))}
          </FocusScope>

          {tracks.length > visibleTrackLimit && (
            <div className="flex justify-center pt-1">
              <button
                type="button"
                onClick={() => setVisibleTrackLimit((prev) => prev + 30)}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-xs font-extrabold transition-all cursor-pointer ${
                  isLight
                    ? 'border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white'
                    : 'border-cyan-400/40 bg-cyan-400/15 text-cyan-300 hover:bg-cyan-400 hover:text-slate-950'
                }`}
              >
                <Plus className="size-3.5" />
                Show More Tracks ({tracks.length - visibleTrackLimit} remaining)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const InlineTrackRow: React.FC<{
  track: SoundtrackTrack
  index: number
  scopeId: string
  active: boolean
  isPlaying: boolean
  isFavorite: boolean
  isLight: boolean
  onPlay: () => void
  onToggleFav: () => void
}> = ({ track, index, scopeId, active, isPlaying, isFavorite, isLight, onPlay, onToggleFav }) => {
  const { focusProps, isFocused } = useFocusable<HTMLButtonElement>({
    id: `${scopeId}_track_${track.id}_${index}`,
    scopeId,
    onConfirm: onPlay,
  })
  const mins = track.duration_ms ? Math.floor(track.duration_ms / 60000) : 0
  const secs = track.duration_ms ? Math.floor((track.duration_ms % 60000) / 1000) : 0

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        {...focusProps}
        className={`flex-1 flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-left transition-all cursor-pointer outline-none ${
          isFocused
            ? 'bg-cyan-400 text-slate-950 font-extrabold scale-[1.01] shadow-md'
            : active
              ? isLight
                ? 'bg-indigo-50 text-indigo-900 border border-indigo-300 font-bold'
                : 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 font-bold'
              : isLight
                ? 'bg-slate-100/90 text-slate-800 hover:bg-slate-200'
                : 'bg-slate-800/45 text-slate-200 hover:bg-slate-800/80'
        }`}
      >
        <div className="flex items-center gap-2.5 truncate pr-2">
          <span className="text-[11px] font-mono opacity-65 w-5 shrink-0">
            {isPlaying ? '▶' : String(index + 1).padStart(2, '0')}
          </span>
          <Music className="size-3.5 opacity-60 shrink-0" />
          <span className="text-xs font-bold truncate">{track.title}</span>
        </div>
        <span className="text-[11px] font-mono opacity-75 shrink-0">
          {track.duration_ms ? `${mins}:${secs.toString().padStart(2, '0')}` : 'OST'}
        </span>
      </button>

      <button
        type="button"
        onClick={onToggleFav}
        className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
          isFavorite
            ? isLight
              ? 'bg-rose-50 border-rose-300 text-rose-600'
              : 'bg-rose-500/20 border-rose-400/40 text-rose-400'
            : isLight
              ? 'bg-slate-100 border-slate-300 text-slate-500 hover:text-rose-500'
              : 'bg-slate-800/45 border-white/10 text-slate-400 hover:text-rose-400'
        }`}
        title="Favorite Track"
      >
        <Heart className={`size-3.5 ${isFavorite ? 'fill-current' : ''}`} />
      </button>
    </div>
  )
}
