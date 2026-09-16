import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { toast } from 'sonner'
import { queryClient } from '@/app/query-client'
import type { AudioPlaybackState } from '../services/audio-engine'
import { audioEngine } from '../services/audio-engine'
import { soundtrackResolver } from '../services/soundtrack-resolver'
import {
  getSoundtrackFavorites,
  getSoundtrackPlayHistory,
  recordSoundtrackPlay,
  toggleSoundtrackFavorite,
} from '../services/tauri-soundtrack'
import type {
  DownloadProgressPayload,
  GameIdentity,
  SoundtrackAlbum,
  SoundtrackFavorite,
  SoundtrackPlayHistory,
  SoundtrackTrack,
} from '../types'

export type RepeatMode = 'off' | 'track' | 'queue'
export type VisualizerMode = 'off' | 'minimal' | 'reactive'

interface SoundtrackState {
  currentTrack: SoundtrackTrack | null
  currentAlbum: SoundtrackAlbum | null
  currentGame: GameIdentity | null
  queue: SoundtrackTrack[]
  queueIndex: number
  unshuffledQueue: SoundtrackTrack[]

  playbackState: AudioPlaybackState
  currentTime: number
  duration: number
  volume: number
  isMuted: boolean

  shuffle: boolean
  repeatMode: RepeatMode
  isExpanded: boolean
  visualizerMode: VisualizerMode

  favorites: Set<string>
  recentlyPlayed: SoundtrackPlayHistory[]
  activeDownloads: Map<string, DownloadProgressPayload>

  // Actions
  playTrack: (
    track: SoundtrackTrack,
    album?: SoundtrackAlbum | null,
    game?: GameIdentity | null,
    newQueue?: SoundtrackTrack[],
  ) => Promise<void>
  playAlbum: (
    album: SoundtrackAlbum,
    tracks: SoundtrackTrack[],
    startIndex?: number,
    game?: GameIdentity | null,
  ) => Promise<void>
  pause: () => void
  resume: () => void
  togglePlay: () => void
  seek: (seconds: number) => void
  next: () => Promise<void>
  previous: () => Promise<void>

  setVolume: (volume: number) => void
  toggleMute: () => void
  toggleShuffle: () => void
  cycleRepeatMode: () => void

  addToQueue: (track: SoundtrackTrack) => void
  playNextInQueue: (track: SoundtrackTrack) => void
  removeFromQueue: (index: number) => void
  clearQueue: () => void

  setExpanded: (expanded: boolean) => void
  setVisualizerMode: (mode: VisualizerMode) => void
  closePlayer: () => void

  toggleFavorite: (targetType: 'track' | 'album', targetId: string) => Promise<void>
  loadFavorites: () => Promise<void>
  loadHistory: () => Promise<void>

  setActiveDownload: (id: string, payload: DownloadProgressPayload) => void
  removeActiveDownload: (id: string) => void
}

let playRequestId = 0

export const useSoundtrackStore = create<SoundtrackState>()(
  persist(
    (set, get) => {
      // Connect audioEngine events to store
      if (typeof window !== 'undefined') {
        audioEngine.setEventListeners({
          onStateChange: (state) => {
            set({ playbackState: state })
          },
          onTimeUpdate: (currentTime, duration) => {
            const trackDuration = get().currentTrack?.duration_ms
              ? get().currentTrack!.duration_ms / 1000
              : 0
            const effectiveDuration = duration > 0 ? duration : trackDuration || get().duration
            const updates: Partial<SoundtrackState> = {
              currentTime,
              duration: effectiveDuration,
            }
            if (
              currentTime > 0 &&
              (get().playbackState === 'loading' || get().playbackState === 'buffering')
            ) {
              updates.playbackState = 'playing'
            }
            set(updates)
          },
          onTrackEnded: () => {
            const { repeatMode, next, seek } = get()
            if (repeatMode === 'track') {
              seek(0)
              audioEngine.resume().catch(() => undefined)
            } else {
              void next()
            }
          },
        })
      }

      return {
        currentTrack: null,
        currentAlbum: null,
        currentGame: null,
        queue: [],
        queueIndex: -1,
        unshuffledQueue: [],

        playbackState: 'idle',
        currentTime: 0,
        duration: 0,
        volume: 0.8,
        isMuted: false,

        shuffle: false,
        repeatMode: 'off',
        isExpanded: false,
        visualizerMode: 'minimal',

        favorites: new Set<string>(),
        recentlyPlayed: [],
        activeDownloads: new Map<string, DownloadProgressPayload>(),

        playTrack: async (track, album, game, newQueue) => {
          const requestId = ++playRequestId

          let updatedQueue = newQueue ? [...newQueue] : get().queue
          let index = updatedQueue.findIndex((t) => t.id === track.id)

          if (index === -1) {
            updatedQueue = [track, ...updatedQueue]
            index = 0
          }

          const targetAlbum = album !== undefined ? album : get().currentAlbum
          const gameIdentity =
            game ||
            get().currentGame ||
            (targetAlbum
              ? {
                  gameId: targetAlbum.game_id || '',
                  title:
                    targetAlbum.title
                      .replace(/\s*(?:soundtrack|ost|original score).*$/i, '')
                      .trim() || targetAlbum.title,
                }
              : undefined)

          set({
            currentTrack: track,
            currentAlbum: targetAlbum,
            currentGame: gameIdentity || get().currentGame,
            queue: updatedQueue,
            queueIndex: index,
            playbackState: 'loading',
            currentTime: 0,
            duration: track.duration_ms ? track.duration_ms / 1000 : 0,
          })

          // Resolve playback source via capability failover
          const source = await soundtrackResolver.resolvePlaybackSource(track, gameIdentity)

          if (requestId !== playRequestId) return

          if (!source) {
            toast.error('Could not find stream source for this track.')
            set({ playbackState: 'error' })
            return
          }

          if (source.url && source.type === 'stream' && !track.stream_url) {
            track.stream_url = source.url
          }

          try {
            await audioEngine.play(source)

            if (requestId !== playRequestId) return

            const engineState = audioEngine.getState()
            if (engineState === 'playing' || engineState === 'paused') {
              set({ playbackState: engineState })
            }

            // Record history in SQLite
            void recordSoundtrackPlay(
              track.id,
              track.album_id || null,
              gameIdentity?.gameId || null,
              0,
              false,
            )
            void get().loadHistory()
          } catch {
            if (requestId !== playRequestId) return
            track.stream_url = null
            toast.error('Could not play track. Please try another track.')
            set({ playbackState: 'error' })
          }
        },

        playAlbum: async (album, tracks, startIndex = 0, game) => {
          if (tracks.length === 0) return

          const isShuffled = get().shuffle
          let queueToUse = [...tracks]
          let targetIndex = startIndex

          if (isShuffled) {
            const chosen = tracks[startIndex]
            const remaining = tracks.filter((_, i) => i !== startIndex)
            for (let i = remaining.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1))
              ;[remaining[i], remaining[j]] = [remaining[j], remaining[i]]
            }
            queueToUse = [chosen, ...remaining]
            targetIndex = 0
          }

          set({
            unshuffledQueue: [...tracks],
            queue: queueToUse,
            queueIndex: targetIndex,
            currentAlbum: album,
            currentGame: game || null,
          })

          const trackToPlay = queueToUse[targetIndex]
          await get().playTrack(trackToPlay, album, game, queueToUse)
        },

        pause: () => {
          audioEngine.pause()
          set({ playbackState: 'paused' })
        },

        resume: () => {
          audioEngine.resume().catch(() => undefined)
          set({ playbackState: 'playing' })
        },

        togglePlay: () => {
          const { playbackState, resume, pause, currentTrack, queue, queueIndex, playTrack } = get()
          if (playbackState === 'playing') {
            pause()
          } else if (playbackState === 'paused') {
            resume()
          } else if (currentTrack) {
            resume()
          } else if (queue.length > 0) {
            const idx = Math.max(0, queueIndex)
            void playTrack(queue[idx])
          }
        },

        seek: (seconds) => {
          audioEngine.seek(seconds)
          set({ currentTime: seconds })
        },

        next: async () => {
          const { queue, queueIndex, repeatMode, playTrack, currentAlbum, currentGame } = get()
          if (queue.length === 0) return

          let nextIndex = queueIndex + 1
          if (nextIndex >= queue.length) {
            if (repeatMode === 'queue') {
              nextIndex = 0
            } else {
              audioEngine.stop()
              set({ playbackState: 'ended', currentTime: 0 })
              return
            }
          }

          const nextTrack = queue[nextIndex]
          set({
            queueIndex: nextIndex,
            currentTime: 0,
            duration: nextTrack.duration_ms ? nextTrack.duration_ms / 1000 : 0,
          })
          await playTrack(nextTrack, currentAlbum, currentGame)
        },

        previous: async () => {
          const { queue, queueIndex, currentTime, seek, playTrack, currentAlbum, currentGame } =
            get()
          if (queue.length === 0) return

          // If more than 3 seconds in, restart current track
          if (currentTime > 3) {
            seek(0)
            return
          }

          let prevIndex = queueIndex - 1
          if (prevIndex < 0) {
            prevIndex = queue.length - 1
          }

          const prevTrack = queue[prevIndex]
          set({
            queueIndex: prevIndex,
            currentTime: 0,
            duration: prevTrack.duration_ms ? prevTrack.duration_ms / 1000 : 0,
          })
          await playTrack(prevTrack, currentAlbum, currentGame)
        },

        setVolume: (vol) => {
          audioEngine.setVolume(vol)
          set({ volume: vol, isMuted: false })
        },

        toggleMute: () => {
          const newMuted = !get().isMuted
          audioEngine.setMuted(newMuted)
          set({ isMuted: newMuted })
        },

        toggleShuffle: () => {
          const { shuffle, queue, currentTrack, unshuffledQueue } = get()
          const newShuffle = !shuffle

          if (newShuffle) {
            // Shuffle queue while keeping current track first
            const remaining = queue.filter((t) => t.id !== currentTrack?.id)
            for (let i = remaining.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1))
              ;[remaining[i], remaining[j]] = [remaining[j], remaining[i]]
            }
            const newQueue = currentTrack ? [currentTrack, ...remaining] : remaining
            set({
              shuffle: true,
              queue: newQueue,
              queueIndex: 0,
            })
          } else {
            // Restore original queue order
            const original = unshuffledQueue.length > 0 ? unshuffledQueue : queue
            const index = original.findIndex((t) => t.id === currentTrack?.id)
            set({
              shuffle: false,
              queue: original,
              queueIndex: index >= 0 ? index : 0,
            })
          }
        },

        cycleRepeatMode: () => {
          const modes: RepeatMode[] = ['off', 'queue', 'track']
          const currentIndex = modes.indexOf(get().repeatMode)
          const nextMode = modes[(currentIndex + 1) % modes.length]
          set({ repeatMode: nextMode })
        },

        addToQueue: (track) => {
          set((s) => ({ queue: [...s.queue, track] }))
        },

        playNextInQueue: (track) => {
          set((s) => {
            const nextIdx = s.queueIndex + 1
            const updated = [...s.queue]
            updated.splice(nextIdx, 0, track)
            return { queue: updated }
          })
        },

        removeFromQueue: (index) => {
          set((s) => {
            const updated = s.queue.filter((_, i) => i !== index)
            let newIndex = s.queueIndex
            if (index < s.queueIndex) {
              newIndex -= 1
            } else if (index === s.queueIndex) {
              newIndex = Math.min(newIndex, updated.length - 1)
            }
            return { queue: updated, queueIndex: newIndex }
          })
        },

        clearQueue: () => {
          set({ queue: [], queueIndex: -1 })
        },

        setExpanded: (expanded) => {
          set({ isExpanded: expanded })
        },

        closePlayer: () => {
          audioEngine.stop()
          set({
            currentTrack: null,
            currentAlbum: null,
            currentGame: null,
            playbackState: 'idle',
            currentTime: 0,
            duration: 0,
            isExpanded: false,
          })
        },

        setVisualizerMode: (mode) => {
          set({ visualizerMode: mode })
        },

        toggleFavorite: async (targetType, targetId) => {
          try {
            await toggleSoundtrackFavorite(targetType, targetId)
            const favs = new Set(get().favorites)
            if (favs.has(targetId)) {
              favs.delete(targetId)
            } else {
              favs.add(targetId)
            }
            set({ favorites: favs })
            void queryClient.invalidateQueries({ queryKey: ['soundtrack'] })
          } catch {
            // Ignore error
          }
        },

        loadFavorites: async () => {
          try {
            const rows: SoundtrackFavorite[] = await getSoundtrackFavorites()
            const ids = new Set(rows.map((r) => r.target_id))
            set({ favorites: ids })
          } catch {
            // Ignore
          }
        },

        loadHistory: async () => {
          try {
            const history = await getSoundtrackPlayHistory(30)
            set({ recentlyPlayed: history })
          } catch {
            // Ignore
          }
        },

        setActiveDownload: (id, payload) => {
          set((s) => {
            const next = new Map(s.activeDownloads)
            next.set(id, payload)
            return { activeDownloads: next }
          })
        },

        removeActiveDownload: (id) => {
          set((s) => {
            const next = new Map(s.activeDownloads)
            next.delete(id)
            return { activeDownloads: next }
          })
        },
      }
    },
    {
      name: 'nexus-soundtrack-storage',
      partialize: (state) => ({
        volume: state.volume,
        shuffle: state.shuffle,
        repeatMode: state.repeatMode,
        visualizerMode: state.visualizerMode,
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.volume !== undefined) {
          audioEngine.setVolume(state.volume)
        }
      },
    },
  ),
)
