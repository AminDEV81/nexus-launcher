import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { toast } from 'sonner'
import { queryClient } from '@/app/query-client'
import type { AudioPlaybackState } from '../services/audio-engine'
import { audioEngine } from '../services/audio-engine'
import { soundtrackResolver } from '../services/soundtrack-resolver'
import {
  getSoundtrackAlbum,
  getSoundtrackFavorites,
  getSoundtrackPlayHistory,
  recordSoundtrackPlay,
  saveSoundtrackAlbum,
  toggleSoundtrackFavorite,
} from '../services/tauri-soundtrack'
import type {
  DownloadProgressPayload,
  GameIdentity,
  SoundtrackAlbum,
  SoundtrackAlbumWithTracks,
  SoundtrackFavorite,
  SoundtrackPlayHistory,
  SoundtrackTrack,
} from '../types'

export type RepeatMode = 'off' | 'track' | 'queue'
export type VisualizerMode = 'off' | 'minimal' | 'reactive'

export interface FavoriteMutationContext {
  track?: SoundtrackTrack
  album?: SoundtrackAlbum | null
  tracks?: SoundtrackTrack[]
}

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
  savedFavoriteTracks: Record<
    string,
    { track: SoundtrackTrack; album: SoundtrackAlbum | null }
  >
  savedFavoriteAlbums: Record<string, SoundtrackAlbumWithTracks>
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
  appendRadioWaveToQueue: (tracks: SoundtrackTrack[]) => void
  playNextInQueue: (track: SoundtrackTrack) => void
  removeFromQueue: (index: number) => void
  clearQueue: () => void

  setExpanded: (expanded: boolean) => void
  setVisualizerMode: (mode: VisualizerMode) => void
  closePlayer: () => void

  toggleFavorite: (
    targetType: 'track' | 'album',
    targetId: string,
    context?: FavoriteMutationContext,
  ) => Promise<void>
  loadFavorites: () => Promise<void>
  loadHistory: () => Promise<void>

  setActiveDownload: (id: string, payload: DownloadProgressPayload) => void
  removeActiveDownload: (id: string) => void
}

let playRequestId = 0

export function cleanGameTitleFromAlbumTitle(rawTitle: string): string {
  if (!rawTitle) return 'Soundtrack'
  return (
    rawTitle
      .replace(
        /\s*(?:\(|\[|-|–|—|:)?\s*(?:official\s+soundtrack|original\s+(?:game\s+|video\s+game\s+)?soundtrack|original\s+score|complete\s+soundtrack|soundtrack|ost)\b.*$/i,
        '',
      )
      .replace(/\s*[-–—:(]+\s*$/, '')
      .trim() || rawTitle.trim()
  )
}

export function deriveGameIdentityFromAlbum(
  album: SoundtrackAlbum | null | undefined,
): GameIdentity | null {
  if (!album) return null
  return {
    gameId: album.game_id || album.id,
    title: cleanGameTitleFromAlbumTitle(album.title),
    coverUrl: album.cover_url,
  }
}

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
        savedFavoriteTracks: {},
        savedFavoriteAlbums: {},
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

          const prevAlbum = get().currentAlbum
          const prevGame = get().currentGame

          const targetAlbum =
            album !== undefined
              ? album
              : prevAlbum && (!track.album_id || prevAlbum.id === track.album_id)
                ? prevAlbum
                : null

          const isSameAlbumAsPrev = Boolean(
            targetAlbum && prevAlbum && targetAlbum.id === prevAlbum.id,
          )

          const gameIdentity: GameIdentity | null =
            game !== undefined && game !== null
              ? game
              : targetAlbum
                ? isSameAlbumAsPrev &&
                  prevGame &&
                  (!targetAlbum.game_id || prevGame.gameId === targetAlbum.game_id)
                  ? prevGame
                  : deriveGameIdentityFromAlbum(targetAlbum)
                : null

          set({
            currentTrack: track,
            currentAlbum: targetAlbum,
            currentGame: gameIdentity,
            queue: updatedQueue,
            queueIndex: index,
            playbackState: 'loading',
            currentTime: 0,
            duration: track.duration_ms ? track.duration_ms / 1000 : 0,
          })

          const effectiveGameIdentity = gameIdentity ?? undefined
          if (!targetAlbum && track.album_id) {
            void getSoundtrackAlbum(track.album_id)
              .then((fetched) => {
                if (fetched && requestId === playRequestId) {
                  const derived = deriveGameIdentityFromAlbum(fetched.album)
                  set({
                    currentAlbum: fetched.album,
                    currentGame: derived,
                  })
                }
              })
              .catch(() => undefined)
          }

          // Pre-resolve & pre-buffer adjacent tracks in the queue in the background so switching is 0ms!
          const prefetchAdjacent = () => {
            const q = get().queue
            const curIdx = get().queueIndex
            const gm = get().currentGame ?? effectiveGameIdentity
            for (const offset of [1, 2, -1]) {
              const adj = q[curIdx + offset]
              if (adj) {
                void soundtrackResolver.prefetchTrack(adj, gm ?? undefined).then((adjCands) => {
                  if (offset === 1 && adjCands.length > 0 && adjCands[0].type === 'stream') {
                    audioEngine.preloadStream(adjCands[0].url)
                  }
                })
              }
            }
          }
          setTimeout(prefetchAdjacent, 60)

          const candidates = await soundtrackResolver.resolvePlaybackCandidates(
            track,
            effectiveGameIdentity,
          )

          if (requestId !== playRequestId) return

          if (candidates.length === 0) {
            toast.error('Could not find stream source for this track.')
            set({ playbackState: 'error' })
            return
          }

          let playedSuccessfully = false
          for (const candidate of candidates) {
            if (requestId !== playRequestId) return
            try {
              await audioEngine.play(candidate)

              if (requestId !== playRequestId) return

              if (
                candidate.url &&
                candidate.type === 'stream' &&
                !candidate.url.includes('itunes.apple.com') &&
                !candidate.url.includes('mzstatic.com') &&
                !candidate.url.includes('dzcdn.net')
              ) {
                track.stream_url = candidate.url
              }

              const engineState = audioEngine.getState()
              if (engineState === 'playing' || engineState === 'paused') {
                set({ playbackState: engineState })
              } else {
                set({ playbackState: 'playing' })
              }

              playedSuccessfully = true

              void recordSoundtrackPlay(
                track.id,
                track.album_id || null,
                effectiveGameIdentity?.gameId || null,
                0,
                false,
              )
              void get().loadHistory()
              break
            } catch {
              if (track.stream_url === candidate.url) {
                track.stream_url = null
              }
              continue
            }
          }

          if (!playedSuccessfully && requestId === playRequestId) {
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

          const resolvedGame = game ?? deriveGameIdentityFromAlbum(album)

          set({
            unshuffledQueue: [...tracks],
            queue: queueToUse,
            queueIndex: targetIndex,
            currentAlbum: album,
            currentGame: resolvedGame,
          })

          const trackToPlay = queueToUse[targetIndex]
          await get().playTrack(trackToPlay, album, resolvedGame, queueToUse)
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

        appendRadioWaveToQueue: (newTracks) => {
          if (!newTracks || newTracks.length === 0) return
          set((s) => {
            const existingIds = new Set(s.queue.map((t) => t.id))
            const uniqueNew = newTracks.filter((t) => !existingIds.has(t.id))
            if (uniqueNew.length === 0) return s
            const currentIdx = Math.max(0, s.queueIndex)
            const head = s.queue.slice(0, currentIdx + 1)
            const tail = s.queue.slice(currentIdx + 1)
            const mergedTail = [...uniqueNew, ...tail].slice(0, 60)
            return {
              queue: [...head, ...mergedTail],
              unshuffledQueue: [...head, ...mergedTail],
            }
          })
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

        toggleFavorite: async (targetType, targetId, context) => {
          const favs = new Set(get().favorites)
          const isRemoving = favs.has(targetId)
          const nextTracks = { ...get().savedFavoriteTracks }
          const nextAlbums = { ...get().savedFavoriteAlbums }

          if (isRemoving) {
            favs.delete(targetId)
            if (targetType === 'track') {
              delete nextTracks[targetId]
            } else {
              delete nextAlbums[targetId]
            }
          } else {
            favs.add(targetId)
            const resolvedAlbum = context?.album ?? get().currentAlbum ?? null
            const resolvedTrack =
              context?.track ??
              (get().currentTrack?.id === targetId ? get().currentTrack : undefined)

            if (targetType === 'track' && resolvedTrack) {
              nextTracks[targetId] = {
                track: {
                  ...resolvedTrack,
                  album_id: resolvedTrack.album_id || resolvedAlbum?.id || '',
                },
                album: resolvedAlbum,
              }
            }
            if (resolvedAlbum) {
              const tracksForAlbum =
                context?.tracks && context.tracks.length > 0
                  ? context.tracks
                  : resolvedTrack
                    ? [resolvedTrack]
                    : get().queue.filter((t) => t.album_id === resolvedAlbum.id)

              if (tracksForAlbum.length > 0) {
                nextAlbums[resolvedAlbum.id] = {
                  album: resolvedAlbum,
                  tracks: tracksForAlbum,
                }
              }
            }
          }

          // Update in-memory store immediately for 0ms UI response across all pages
          set({
            favorites: favs,
            savedFavoriteTracks: nextTracks,
            savedFavoriteAlbums: nextAlbums,
          })

          try {
            // Persist album & tracks in SQLite first if context is available
            const albumToSave = context?.album ?? get().currentAlbum
            const tracksToSave =
              context?.tracks && context.tracks.length > 0
                ? context.tracks
                : context?.track
                  ? [context.track]
                  : []
            if (albumToSave && tracksToSave.length > 0) {
              await saveSoundtrackAlbum(albumToSave, tracksToSave).catch(() => undefined)
            }

            await toggleSoundtrackFavorite(targetType, targetId)
            void queryClient.invalidateQueries({ queryKey: ['soundtrack'] })
          } catch {
            // Keep optimistic state in memory
          }
        },

        loadFavorites: async () => {
          try {
            const rows: SoundtrackFavorite[] = await getSoundtrackFavorites()
            const merged = new Set<string>(rows.map((r) => r.target_id))
            // Also preserve any keys stored in savedFavoriteTracks / savedFavoriteAlbums if SQLite was empty
            for (const id of Object.keys(get().savedFavoriteTracks)) {
              if (rows.some((r) => r.target_id === id)) merged.add(id)
            }
            set({ favorites: merged })
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
        savedFavoriteTracks: state.savedFavoriteTracks,
        savedFavoriteAlbums: state.savedFavoriteAlbums,
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.volume !== undefined) {
          audioEngine.setVolume(state.volume)
        }
      },
    },
  ),
)
