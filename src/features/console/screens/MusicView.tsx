import React from 'react'
import { Music, Play, Pause, SkipBack, SkipForward, Shuffle, Repeat } from 'lucide-react'
import { useSoundtrackStore } from '@/features/soundtrack/store/soundtrack-store'
import { FocusScope, useFocusable } from '../nav/FocusScope'

export const MusicView: React.FC = () => {
  const currentTrack = useSoundtrackStore((s) => s.currentTrack)
  const currentAlbum = useSoundtrackStore((s) => s.currentAlbum)
  const queue = useSoundtrackStore((s) => s.queue)
  const playbackState = useSoundtrackStore((s) => s.playbackState)
  const shuffle = useSoundtrackStore((s) => s.shuffle)
  const repeatMode = useSoundtrackStore((s) => s.repeatMode)
  const togglePlay = useSoundtrackStore((s) => s.togglePlay)
  const previous = useSoundtrackStore((s) => s.previous)
  const next = useSoundtrackStore((s) => s.next)
  const toggleShuffle = useSoundtrackStore((s) => s.toggleShuffle)
  const cycleRepeatMode = useSoundtrackStore((s) => s.cycleRepeatMode)
  const playTrack = useSoundtrackStore((s) => s.playTrack)

  const isPlaying = playbackState === 'playing'

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
    onConfirm: () => togglePlay(),
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

  return (
    <div className="space-y-6 pb-16">
      <div className="p-8 rounded-3xl bg-gradient-to-br from-violet-950/60 via-slate-900/90 to-slate-950 border border-white/15 flex flex-col md:flex-row items-center justify-between gap-8">
        <div className="flex items-center gap-6">
          <div className="w-28 h-28 rounded-3xl bg-violet-500/20 border border-violet-400/30 flex items-center justify-center text-violet-300 shadow-2xl">
            <Music className="w-12 h-12" />
          </div>
          <div>
            <span className="text-xs font-extrabold uppercase tracking-widest text-violet-300">
              Soundtrack Center
            </span>
            <h1 className="text-3xl font-black text-white mt-1">
              {currentTrack ? currentTrack.title : 'No Track Playing'}
            </h1>
            <p className="text-base text-slate-400 mt-1">
              {currentTrack?.artist || currentAlbum?.title || 'Select a game soundtrack to start listening'}
            </p>
          </div>
        </div>

        <FocusScope
          id="console_music_controls"
          orientation="horizontal"
          className="flex items-center gap-3"
        >
          <button
            type="button"
            {...shuffleFocus.focusProps}
            className={`p-3.5 rounded-2xl border transition-all ${
              shuffleFocus.isFocused
                ? 'bg-cyan-400 text-slate-950 border-cyan-300 scale-105'
                : shuffle
                  ? 'bg-violet-500/30 text-violet-200 border-violet-400/50'
                  : 'bg-white/5 text-slate-300 border-white/10'
            }`}
          >
            <Shuffle className="w-5 h-5" />
          </button>

          <button
            type="button"
            {...prevFocus.focusProps}
            className={`p-4 rounded-2xl border transition-all ${
              prevFocus.isFocused
                ? 'bg-cyan-400 text-slate-950 border-cyan-300 scale-105'
                : 'bg-white/10 text-white border-white/15'
            }`}
          >
            <SkipBack className="w-5 h-5" />
          </button>

          <button
            type="button"
            {...playFocus.focusProps}
            className={`p-5 rounded-2xl font-extrabold transition-all ${
              playFocus.isFocused
                ? 'bg-cyan-400 text-slate-950 scale-110 ring-4 ring-cyan-300/50 shadow-xl'
                : 'bg-cyan-500 text-slate-950'
            }`}
          >
            {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 fill-current" />}
          </button>

          <button
            type="button"
            {...nextFocus.focusProps}
            className={`p-4 rounded-2xl border transition-all ${
              nextFocus.isFocused
                ? 'bg-cyan-400 text-slate-950 border-cyan-300 scale-105'
                : 'bg-white/10 text-white border-white/15'
            }`}
          >
            <SkipForward className="w-5 h-5" />
          </button>

          <button
            type="button"
            {...repeatFocus.focusProps}
            className={`p-3.5 rounded-2xl border transition-all ${
              repeatFocus.isFocused
                ? 'bg-cyan-400 text-slate-950 border-cyan-300 scale-105'
                : repeatMode !== 'off'
                  ? 'bg-violet-500/30 text-violet-200 border-violet-400/50'
                  : 'bg-white/5 text-slate-300 border-white/10'
            }`}
          >
            <Repeat className="w-5 h-5" />
          </button>
        </FocusScope>
      </div>

      {/* Active Queue */}
      {queue.length > 0 && (
        <FocusScope
          id="console_music_queue"
          orientation="vertical"
          className="p-6 rounded-3xl bg-white/5 border border-white/10 space-y-2.5"
        >
          <h2 className="text-lg font-extrabold text-white mb-3">Current Queue ({queue.length})</h2>
          {queue.slice(0, 20).map((track, idx) => (
            <QueueTrackRow
              key={track.id}
              id={`music_q_${track.id}_${idx}`}
              title={track.title}
              artist={track.artist || currentAlbum?.title || 'Soundtrack'}
              active={currentTrack?.id === track.id}
              onSelect={() => {
                void playTrack(track, currentAlbum)
              }}
            />
          ))}
        </FocusScope>
      )}
    </div>
  )
}

const QueueTrackRow: React.FC<{
  id: string
  title: string
  artist: string
  active: boolean
  onSelect: () => void
}> = ({ id, title, artist, active, onSelect }) => {
  const { focusProps, isFocused } = useFocusable<HTMLButtonElement>({
    id,
    scopeId: 'console_music_queue',
    onConfirm: onSelect,
  })
  return (
    <button
      type="button"
      {...focusProps}
      className={`w-full p-3.5 rounded-2xl border flex items-center justify-between text-left transition-all ${
        isFocused
          ? 'bg-cyan-400 text-slate-950 border-cyan-300 scale-[1.01]'
          : active
            ? 'bg-violet-500/20 text-violet-200 border-violet-400/40'
            : 'bg-slate-900/60 text-slate-200 border-white/10'
      }`}
    >
      <span className="font-bold text-sm truncate">{title}</span>
      <span className="text-xs opacity-75">{artist}</span>
    </button>
  )
}
