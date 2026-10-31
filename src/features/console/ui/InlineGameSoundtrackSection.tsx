import React, { useEffect, useState } from 'react'
import { Music, Play, Pause, SkipForward, Disc3, Volume2, Loader2 } from 'lucide-react'
import { useSoundtrackStore } from '@/features/soundtrack/store/soundtrack-store'
import { soundtrackResolver } from '@/features/soundtrack/services/soundtrack-resolver'
import { lookupCuratedSoundtrack } from '@/features/soundtrack/services/curated-soundtracks'
import type { SoundtrackAlbumWithTracks, SoundtrackTrack } from '@/features/soundtrack/types'
import { useFocusable } from '../nav/FocusScope'
import { resolveConsoleHighResUrl } from './Tile'

export interface InlineGameSoundtrackSectionProps {
  scopeId: string
  gameId: string
  gameName: string
  coverUrl?: string | null
  steamAppId?: string | null
  igdbId?: number | null
  isLight: boolean
  expandedByButton?: boolean
}

export const InlineGameSoundtrackSection: React.FC<InlineGameSoundtrackSectionProps> = ({
  scopeId,
  gameId,
  gameName,
  coverUrl,
  steamAppId,
  igdbId,
  isLight,
}) => {
  const currentTrack = useSoundtrackStore((s) => s.currentTrack)
  const playbackState = useSoundtrackStore((s) => s.playbackState)
  const togglePlay = useSoundtrackStore((s) => s.togglePlay)
  const next = useSoundtrackStore((s) => s.next)
  const playAlbum = useSoundtrackStore((s) => s.playAlbum)

  const [bundle, setBundle] = useState<SoundtrackAlbumWithTracks | null>(() =>
    lookupCuratedSoundtrack({
      gameId,
      title: gameName,
      coverUrl: coverUrl ?? null,
    }),
  )
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    const immediate = lookupCuratedSoundtrack({
      gameId,
      title: gameName,
      coverUrl: coverUrl ?? null,
    })
    if (immediate) {
      setBundle(immediate)
    }
    setLoading(true)

    soundtrackResolver
      .resolveGame({
        gameId,
        title: gameName,
        coverUrl: coverUrl ?? null,
        steamAppId: steamAppId ?? null,
        igdbId: igdbId ?? null,
      })
      .then((albums) => {
        if (cancelled) return
        if (albums.length > 0 && albums[0].tracks.length > 0) {
          setBundle(albums[0])
          return
        }
        return soundtrackResolver.searchOnlineSoundtracksFast(gameName).then((online) => {
          if (!cancelled && online.length > 0 && online[0].tracks.length > 0) {
            setBundle(online[0])
          }
        })
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [gameId, gameName, coverUrl, steamAppId, igdbId])

  const tracks: SoundtrackTrack[] = bundle?.tracks ?? []
  const isThisAlbumPlaying =
    playbackState === 'playing' &&
    Boolean(currentTrack && tracks.some((t) => t.id === currentTrack.id))

  const playAllBtn = useFocusable<HTMLButtonElement>({
    id: `inline_ost_play_all_${gameId}`,
    scopeId,
    onConfirm: () => {
      if (!bundle || tracks.length === 0) return
      if (isThisAlbumPlaying) {
        togglePlay()
      } else {
        void playAlbum(bundle.album, tracks, 0, {
          gameId,
          title: gameName,
          coverUrl: coverUrl ?? bundle.album.cover_url,
        })
      }
    },
  })

  const nextTrackBtn = useFocusable<HTMLButtonElement>({
    id: `inline_ost_next_${gameId}`,
    scopeId,
    onConfirm: () => {
      void next()
    },
  })

  const albumArt = resolveConsoleHighResUrl(bundle?.album.cover_url ?? coverUrl)

  return (
    <div
      id="game-page-inline-soundtrack"
      className={`rounded-3xl border p-6 space-y-5 transition-all ${
        isLight
          ? 'border-violet-300 bg-white/95 shadow-sm'
          : 'border-violet-400/30 bg-gradient-to-br from-violet-950/35 via-[#0e1528] to-[#0a101f] shadow-xl'
      }`}
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div className="flex items-center gap-4">
          <div className="relative size-16 shrink-0 overflow-hidden rounded-2xl border border-violet-400/40 bg-slate-900 shadow-lg">
            {albumArt ? (
              <img src={albumArt} alt={gameName} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-violet-300">
                <Disc3 className={`size-8 ${isThisAlbumPlaying ? 'animate-spin' : ''}`} />
              </div>
            )}
          </div>
          <div>
            <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-violet-400">
              <Music className="size-3.5" />
              <span>Original Game Soundtrack (Inline Player)</span>
              {loading && <Loader2 className="size-3.5 animate-spin text-cyan-400" />}
            </div>
            <h2
              className={`mt-0.5 text-xl font-black ${
                isLight ? 'text-slate-900' : 'text-white'
              }`}
            >
              {bundle?.album.title || `${gameName} — Official Soundtrack`}
            </h2>
            <p className="text-xs text-slate-400">
              {bundle?.album.artist || `${tracks.length} Tracks Available`}
            </p>
          </div>
        </div>

        {tracks.length > 0 && (
          <div className="flex items-center gap-3">
            <button
              type="button"
              {...playAllBtn.focusProps}
              className={`flex items-center gap-2 rounded-2xl px-6 py-3 text-xs font-extrabold transition-all cursor-pointer ${
                playAllBtn.isFocused
                  ? 'scale-105 bg-cyan-400 text-slate-950 ring-4 ring-cyan-300/50 shadow-lg'
                  : 'bg-violet-500 text-white hover:bg-violet-400'
              }`}
            >
              {isThisAlbumPlaying ? (
                <>
                  <Pause className="size-4" />
                  <span>Pause OST</span>
                </>
              ) : (
                <>
                  <Play className="size-4 fill-current" />
                  <span>Play Soundtrack ({tracks.length})</span>
                </>
              )}
            </button>

            {isThisAlbumPlaying && (
              <button
                type="button"
                {...nextTrackBtn.focusProps}
                className={`flex items-center gap-1.5 rounded-2xl border px-4 py-3 text-xs font-bold transition-all cursor-pointer ${
                  nextTrackBtn.isFocused
                    ? 'scale-105 border-cyan-300 bg-cyan-400 text-slate-950'
                    : isLight
                      ? 'border-slate-300 bg-slate-100 text-slate-800'
                      : 'border-white/15 bg-white/10 text-white'
                }`}
              >
                <SkipForward className="size-4" />
                <span>Next</span>
              </button>
            )}
          </div>
        )}
      </div>

      {tracks.length === 0 ? (
        <p className="py-4 text-sm text-slate-400">
          {loading
            ? `Searching soundtrack providers for ${gameName}...`
            : `No soundtrack tracks found for ${gameName}.`}
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-[20rem] overflow-y-auto no-scrollbar pr-1">
          {tracks.slice(0, 18).map((track, idx) => (
            <InlineOstTrackButton
              key={`${track.id}_${idx}`}
              id={`inline_ost_trk_${gameId}_${idx}`}
              scopeId={scopeId}
              index={idx + 1}
              track={track}
              active={currentTrack?.id === track.id}
              playing={playbackState === 'playing' && currentTrack?.id === track.id}
              isLight={isLight}
              onSelect={() => {
                if (!bundle) return
                if (currentTrack?.id === track.id) {
                  togglePlay()
                } else {
                  void playAlbum(bundle.album, tracks, idx, {
                    gameId,
                    title: gameName,
                    coverUrl: coverUrl ?? bundle.album.cover_url,
                  })
                }
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

const InlineOstTrackButton: React.FC<{
  id: string
  scopeId: string
  index: number
  track: SoundtrackTrack
  active: boolean
  playing: boolean
  isLight: boolean
  onSelect: () => void
}> = ({ id, scopeId, index, track, active, playing, isLight, onSelect }) => {
  const { focusProps, isFocused } = useFocusable<HTMLButtonElement>({
    id,
    scopeId,
    onConfirm: onSelect,
  })
  const sec = Math.max(0, Math.round((track.duration_ms || 0) / 1000))
  const dur = sec > 0 ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` : ''

  return (
    <button
      type="button"
      {...focusProps}
      className={`flex items-center justify-between gap-3 rounded-2xl border p-3 text-left transition-all cursor-pointer ${
        isFocused
          ? 'scale-[1.02] border-cyan-300 bg-cyan-400 text-slate-950 shadow-md'
          : active
            ? 'border-violet-400 bg-violet-500/25 text-white'
            : isLight
              ? 'border-slate-200 bg-slate-50 text-slate-900 hover:bg-slate-100'
              : 'border-white/10 bg-slate-950/60 text-slate-200 hover:bg-white/10'
      }`}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-black/20 font-mono text-xs font-bold">
          {playing ? <Volume2 className="size-3.5 text-cyan-300 animate-pulse" /> : index}
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs font-extrabold">{track.title}</p>
          {track.artist && <p className="truncate text-[10px] opacity-75">{track.artist}</p>}
        </div>
      </div>
      {dur && <span className="shrink-0 font-mono text-[11px] font-bold opacity-75">{dur}</span>}
    </button>
  )
}
