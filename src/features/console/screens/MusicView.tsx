import React from 'react'
import { Play, Pause, SkipBack, SkipForward, Shuffle, Repeat } from 'lucide-react'
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
      <div className="flex flex-wrap items-center justify-between gap-10 px-6 pt-2">
        <div className="min-w-0 max-w-[44rem]">
          <p className="text-[0.95rem] font-medium tracking-wide text-white/45">
            {currentAlbum?.title || 'Music'}
          </p>
          <h1 className="mt-1 line-clamp-2 text-[3.2rem] font-semibold leading-[1.02] tracking-tight text-white">
            {currentTrack ? currentTrack.title : 'Nothing playing'}
          </h1>
          <p className="mt-2 text-[1.15rem] text-white/55">
            {currentTrack?.artist || 'Pick a game soundtrack to start listening'}
          </p>
        </div>

        <FocusScope
          id="console_music_controls"
          orientation="horizontal"
          className="flex items-center gap-3"
        >
          <button
            type="button"
            {...shuffleFocus.focusProps}
            className={`flex size-[3.2rem] items-center justify-center rounded-full outline-none transition-all ${
              shuffleFocus.isFocused
                ? 'bg-white text-black scale-110'
                : shuffle
                  ? 'bg-white/22 text-white'
                  : 'bg-white/10 text-white/80'
            }`}
          >
            <Shuffle className="w-5 h-5" />
          </button>

          <button
            type="button"
            {...prevFocus.focusProps}
            className={`flex size-[3.6rem] items-center justify-center rounded-full outline-none transition-all ${
              prevFocus.isFocused ? 'bg-white text-black scale-110' : 'bg-white/10 text-white'
            }`}
          >
            <SkipBack className="w-5 h-5" />
          </button>

          <button
            type="button"
            {...playFocus.focusProps}
            className={`flex size-[4.4rem] items-center justify-center rounded-full outline-none transition-all ${
              playFocus.isFocused
                ? 'bg-white text-black scale-110 shadow-[0_18px_50px_-8px_var(--console-ambient,#7dd3fc)]'
                : 'bg-white text-black'
            }`}
          >
            {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 fill-current" />}
          </button>

          <button
            type="button"
            {...nextFocus.focusProps}
            className={`flex size-[3.6rem] items-center justify-center rounded-full outline-none transition-all ${
              nextFocus.isFocused ? 'bg-white text-black scale-110' : 'bg-white/10 text-white'
            }`}
          >
            <SkipForward className="w-5 h-5" />
          </button>

          <button
            type="button"
            {...repeatFocus.focusProps}
            className={`flex size-[3.2rem] items-center justify-center rounded-full outline-none transition-all ${
              repeatFocus.isFocused
                ? 'bg-white text-black scale-110'
                : repeatMode !== 'off'
                  ? 'bg-white/22 text-white'
                  : 'bg-white/10 text-white/80'
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
          className="p-6 rounded-3xl bg-white/[0.06] border border-transparent space-y-2.5"
        >
          <h2 className="text-lg font-semibold text-white mb-3">Current Queue ({queue.length})</h2>
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
          ? 'bg-white text-black border-transparent scale-[1.01]'
          : active
            ? 'bg-violet-500/20 text-white/70 border-violet-400/40'
            : 'bg-slate-900/60 text-slate-200 border-transparent'
      }`}
    >
      <span className="font-bold text-sm truncate">{title}</span>
      <span className="text-xs opacity-75">{artist}</span>
    </button>
  )
}
