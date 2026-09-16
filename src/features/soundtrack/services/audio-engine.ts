import { convertFileSrc } from '@tauri-apps/api/core'
import type { PlaybackSource } from '../types'

export type AudioPlaybackState =
  'idle' | 'loading' | 'playing' | 'paused' | 'buffering' | 'ended' | 'error'

export interface AudioEngineEvents {
  onStateChange?: (state: AudioPlaybackState) => void
  onTimeUpdate?: (currentTimeSec: number, durationSec: number) => void
  onTrackEnded?: () => void
  onError?: (error: string) => void
}

export class NexusAudioEngine {
  private audio: HTMLAudioElement | null = null
  private audioCtx: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private sourceNode: MediaElementAudioSourceNode | null = null
  private ytIframe: HTMLIFrameElement | null = null
  private ytCurrentTime = 0
  private ytDuration = 0
  private ytPollTimer: ReturnType<typeof setInterval> | null = null
  private ytTickerTimer: ReturnType<typeof setInterval> | null = null
  private ytFallbackTimer: ReturnType<typeof setTimeout> | null = null
  private playbackSessionId = 0
  private state: AudioPlaybackState = 'idle'
  private currentSource: PlaybackSource | null = null
  private events: AudioEngineEvents = {}
  private volume = 0.8
  private muted = false

  constructor() {
    if (typeof window !== 'undefined') {
      this.initAudio()
    }
  }

  private initAudio() {
    if (this.audio) return
    if (typeof Audio === 'undefined') return

    this.audio = new Audio()
    this.audio.preload = 'auto'
    this.audio.volume = this.muted ? 0 : this.volume

    this.audio.addEventListener('play', () => {
      if (this.currentSource?.type !== 'youtube') {
        this.setState('playing')
      }
    })
    this.audio.addEventListener('pause', () => {
      if (
        this.currentSource?.type !== 'youtube' &&
        this.state !== 'ended' &&
        this.state !== 'error'
      ) {
        this.setState('paused')
      }
    })
    this.audio.addEventListener('waiting', () => {
      if (this.currentSource?.type !== 'youtube' && this.audio && this.audio.currentTime === 0) {
        this.setState('buffering')
      }
    })
    this.audio.addEventListener('playing', () => {
      if (this.currentSource?.type !== 'youtube') {
        this.setState('playing')
      }
    })
    this.audio.addEventListener('canplay', () => {
      if (
        this.currentSource?.type !== 'youtube' &&
        this.state === 'loading' &&
        this.audio &&
        !this.audio.paused
      ) {
        this.setState('playing')
      }
    })
    this.audio.addEventListener('ended', () => {
      if (this.currentSource?.type !== 'youtube') {
        this.setState('ended')
        this.events.onTrackEnded?.()
      }
    })

    const emitAudioTimeAndDuration = () => {
      if (this.audio && this.currentSource?.type !== 'youtube') {
        const cur = isFinite(this.audio.currentTime) ? this.audio.currentTime : 0
        const dur =
          isFinite(this.audio.duration) && this.audio.duration > 0 ? this.audio.duration : 0
        this.events.onTimeUpdate?.(cur, dur)
      }
    }

    this.audio.addEventListener('durationchange', emitAudioTimeAndDuration)
    this.audio.addEventListener('loadedmetadata', emitAudioTimeAndDuration)

    this.audio.addEventListener('timeupdate', () => {
      if (this.audio && this.currentSource?.type !== 'youtube') {
        if (!this.audio.paused && (this.state === 'loading' || this.state === 'buffering')) {
          this.setState('playing')
        }
        emitAudioTimeAndDuration()
      }
    })

    this.audio.addEventListener('error', () => {
      if (
        !this.audio?.src ||
        this.audio.src.endsWith('about:blank') ||
        this.audio.src === window.location.href
      ) {
        return
      }
      const msg = this.audio?.error?.message ?? 'Playback error occurred'
      this.setState('error')
      this.events.onError?.(msg)
    })
  }

  private getOrCreateYtIframe(): HTMLIFrameElement | null {
    if (typeof document === 'undefined') return null
    if (this.ytIframe && document.body.contains(this.ytIframe)) {
      return this.ytIframe
    }

    const iframe = document.createElement('iframe')
    iframe.id = 'nexus-audio-yt-player'
    iframe.style.position = 'fixed'
    iframe.style.top = '-9999px'
    iframe.style.left = '-9999px'
    iframe.style.width = '10px'
    iframe.style.height = '10px'
    iframe.style.opacity = '0'
    iframe.style.pointerEvents = 'none'
    iframe.allow = 'autoplay; encrypted-media'
    document.body.appendChild(iframe)
    this.ytIframe = iframe

    window.addEventListener('message', (event) => {
      if (!this.ytIframe || this.currentSource?.type !== 'youtube') return
      try {
        const raw = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
        if (!raw) return

        // 1. Handshake
        if (raw.event === 'initialDelivery' || raw.event === 'onReady') {
          this.ytIframe?.contentWindow?.postMessage('{"event":"listening"}', '*')
          this.ytIframe?.contentWindow?.postMessage(
            JSON.stringify({
              event: 'command',
              func: 'setVolume',
              args: [this.muted ? 0 : this.volume * 100],
            }),
            '*',
          )
          this.ytIframe?.contentWindow?.postMessage(
            '{"event":"command","func":"playVideo","args":""}',
            '*',
          )
        }

        // 2. Direct onStateChange events
        if (raw.event === 'onStateChange') {
          const stateVal =
            typeof raw.info === 'number' ? raw.info : typeof raw.data === 'number' ? raw.data : null

          if (stateVal === 1) {
            this.setState('playing')
          } else if (stateVal === 2) {
            this.setState('paused')
          } else if (stateVal === 3) {
            if (this.ytCurrentTime === 0) {
              this.setState('buffering')
            }
          } else if (stateVal === 0) {
            this.setState('ended')
            this.events.onTrackEnded?.()
          }
        }

        // 3. infoDelivery events (composite object or scalar command response)
        if (raw.event === 'infoDelivery') {
          const info = raw.info
          if (info !== undefined && info !== null) {
            if (typeof info === 'object') {
              if (typeof info.currentTime === 'number') {
                this.ytCurrentTime = info.currentTime
                if (info.currentTime > 0 && this.state !== 'paused' && this.state !== 'ended') {
                  this.setState('playing')
                }
              }
              if (typeof info.duration === 'number' && info.duration > 0) {
                this.ytDuration = info.duration
              }
              if (typeof info.playerState === 'number') {
                if (info.playerState === 1) {
                  this.setState('playing')
                } else if (info.playerState === 2) {
                  this.setState('paused')
                } else if (info.playerState === 3) {
                  if (this.ytCurrentTime === 0) {
                    this.setState('buffering')
                  }
                } else if (info.playerState === 0) {
                  this.setState('ended')
                  this.events.onTrackEnded?.()
                }
              }
              this.events.onTimeUpdate?.(this.ytCurrentTime, this.ytDuration)
            } else if (typeof info === 'number') {
              if (info === 1 && this.state !== 'playing') {
                this.setState('playing')
              } else if (info === 2 && this.state === 'playing') {
                this.setState('paused')
              } else if (info === 0) {
                this.setState('ended')
                this.events.onTrackEnded?.()
              } else if (info > 3) {
                if (this.ytDuration > 0 && info <= this.ytDuration) {
                  this.ytCurrentTime = info
                } else if (this.ytDuration === 0) {
                  this.ytDuration = info
                }
                this.events.onTimeUpdate?.(this.ytCurrentTime, this.ytDuration)
              }
            }
          }
        }

        // 4. Playback error from embed
        if (raw.event === 'onError') {
          this.setState('error')
          this.events.onError?.('Track playback failed in embed')
        }
      } catch {
        // Not a JSON message from YT
      }
    })

    return iframe
  }

  public setEventListeners(events: AudioEngineEvents) {
    this.events = events
  }

  public getAnalyser(): AnalyserNode | null {
    // Web Audio CORS limitation:
    // createMediaElementSource on cross-origin streams without CORS headers
    // silences audio or causes playback failures in WebView2 / Chromium.
    // Therefore, only connect AnalyserNode to local files. Remote streams use dynamic visualizer fallback.
    if (this.currentSource?.type !== 'local') {
      return null
    }

    if (this.analyser) return this.analyser
    if (!this.audio || typeof window === 'undefined') return null

    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!AudioContextClass) return null

      if (!this.audioCtx) {
        this.audioCtx = new AudioContextClass()
      }

      if (this.audioCtx.state === 'suspended') {
        void this.audioCtx.resume().catch(() => undefined)
      }

      if (!this.sourceNode) {
        this.sourceNode = this.audioCtx.createMediaElementSource(this.audio)
        this.analyser = this.audioCtx.createAnalyser()
        this.analyser.fftSize = 64
        this.analyser.smoothingTimeConstant = 0.8

        this.sourceNode.connect(this.analyser)
        this.analyser.connect(this.audioCtx.destination)
      }

      return this.analyser
    } catch {
      return null
    }
  }

  private setState(state: AudioPlaybackState) {
    this.state = state
    this.events.onStateChange?.(state)
  }

  public getState(): AudioPlaybackState {
    return this.state
  }

  public getCurrentSource(): PlaybackSource | null {
    return this.currentSource
  }

  public async play(source: PlaybackSource): Promise<void> {
    const sessionId = ++this.playbackSessionId
    this.currentSource = source
    this.setState('loading')

    if (source.type === 'youtube') {
      // Pause native audio element
      if (this.audio) {
        try {
          this.audio.pause()
          this.audio.removeAttribute('src')
        } catch {
          // ignore
        }
      }

      const iframe = this.getOrCreateYtIframe()
      if (!iframe) return

      this.ytCurrentTime = 0
      this.ytDuration = 0
      this.events.onTimeUpdate?.(0, 0)

      const originParam =
        typeof window !== 'undefined' && window.location.origin
          ? `&origin=${encodeURIComponent(window.location.origin)}`
          : ''

      if (this.ytIframe && this.ytIframe.src && !this.ytIframe.src.includes('about:blank')) {
        iframe.contentWindow?.postMessage(
          JSON.stringify({
            event: 'command',
            func: 'loadVideoById',
            args: [source.url],
          }),
          '*',
        )
        iframe.contentWindow?.postMessage('{"event":"command","func":"playVideo","args":""}', '*')
      } else {
        iframe.src = `https://www.youtube-nocookie.com/embed/${source.url}?autoplay=1&enablejsapi=1&playsinline=1&controls=0${originParam}`
      }

      // Smooth time ticker for YouTube playback (250ms interval)
      if (this.ytTickerTimer) {
        clearInterval(this.ytTickerTimer)
      }
      this.ytTickerTimer = setInterval(() => {
        if (this.playbackSessionId !== sessionId) return
        if (this.currentSource?.type === 'youtube' && this.state === 'playing') {
          this.ytCurrentTime += 0.25
          if (this.ytDuration > 0 && this.ytCurrentTime >= this.ytDuration) {
            this.setState('ended')
            this.events.onTrackEnded?.()
          } else {
            this.events.onTimeUpdate?.(this.ytCurrentTime, this.ytDuration)
          }
        }
      }, 250)

      // Fallback timer: if embed autoplay starts without explicit postMessage, transition to playing
      if (this.ytFallbackTimer) clearTimeout(this.ytFallbackTimer)
      this.ytFallbackTimer = setTimeout(() => {
        if (
          this.playbackSessionId === sessionId &&
          this.currentSource?.type === 'youtube' &&
          this.state === 'loading'
        ) {
          this.setState('playing')
        }
      }, 1500)

      // Active polling for metadata/listening handshake
      if (this.ytPollTimer) clearInterval(this.ytPollTimer)
      this.ytPollTimer = setInterval(() => {
        if (this.playbackSessionId !== sessionId) return
        if (this.currentSource?.type === 'youtube') {
          iframe.contentWindow?.postMessage('{"event":"listening"}', '*')
          iframe.contentWindow?.postMessage(
            '{"event":"command","func":"getDuration","args":""}',
            '*',
          )
          iframe.contentWindow?.postMessage(
            '{"event":"command","func":"getCurrentTime","args":""}',
            '*',
          )
        }
      }, 1000)
      return
    }

    // Handle stream or local audio
    if (this.ytIframe) {
      try {
        this.ytIframe.contentWindow?.postMessage(
          '{"event":"command","func":"pauseVideo","args":""}',
          '*',
        )
        this.ytIframe.src = 'about:blank'
      } catch {
        // ignore
      }
    }
    if (this.ytPollTimer) {
      clearInterval(this.ytPollTimer)
      this.ytPollTimer = null
    }
    if (this.ytTickerTimer) {
      clearInterval(this.ytTickerTimer)
      this.ytTickerTimer = null
    }
    if (this.ytFallbackTimer) {
      clearTimeout(this.ytFallbackTimer)
      this.ytFallbackTimer = null
    }

    this.initAudio()
    if (!this.audio) return

    // Clean pause of any previous playback
    try {
      this.audio.pause()
      this.audio.currentTime = 0
    } catch {
      // ignore
    }

    this.events.onTimeUpdate?.(0, 0)

    let resolvedUrl = source.url
    if (source.type === 'local') {
      resolvedUrl = convertFileSrc(source.url)
    }

    // Resume AudioContext if suspended (for local files)
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      void this.audioCtx.resume().catch(() => undefined)
    }

    this.audio.src = resolvedUrl

    try {
      const playPromise = this.audio.play()
      if (playPromise !== undefined) {
        await playPromise
      }
      if (this.playbackSessionId === sessionId) {
        this.setState('playing')
      }
    } catch (err: unknown) {
      // If superseded by a newer track request, ignore
      if (this.playbackSessionId !== sessionId) {
        return
      }
      // AbortError or NotAllowedError can happen when rapidly skipping tracks; ignore
      if (err instanceof Error && (err.name === 'AbortError' || err.name === 'NotAllowedError')) {
        return
      }
      const msg = err instanceof Error ? err.message : 'Playback failed'
      this.setState('error')
      this.events.onError?.(msg)
      throw err
    }
  }

  public pause(): void {
    if (this.ytFallbackTimer) {
      clearTimeout(this.ytFallbackTimer)
      this.ytFallbackTimer = null
    }
    if (this.currentSource?.type === 'youtube') {
      this.ytIframe?.contentWindow?.postMessage(
        '{"event":"command","func":"pauseVideo","args":""}',
        '*',
      )
      this.setState('paused')
      return
    }

    if (this.audio && !this.audio.paused) {
      this.audio.pause()
      this.setState('paused')
    }
  }

  public async resume(): Promise<void> {
    if (this.currentSource?.type === 'youtube') {
      this.ytIframe?.contentWindow?.postMessage(
        '{"event":"command","func":"playVideo","args":""}',
        '*',
      )
      this.setState('playing')
      return
    }

    if (this.audio && this.audio.paused) {
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        void this.audioCtx.resume().catch(() => undefined)
      }
      try {
        await this.audio.play()
        this.setState('playing')
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return
        this.setState('error')
        throw err
      }
    }
  }

  public seek(positionSeconds: number): void {
    if (this.currentSource?.type === 'youtube') {
      this.ytIframe?.contentWindow?.postMessage(
        JSON.stringify({ event: 'command', func: 'seekTo', args: [positionSeconds, true] }),
        '*',
      )
      this.ytCurrentTime = positionSeconds
      this.events.onTimeUpdate?.(positionSeconds, this.ytDuration)
      return
    }

    if (this.audio && isFinite(positionSeconds)) {
      this.audio.currentTime = Math.max(0, Math.min(positionSeconds, this.audio.duration || 0))
    }
  }

  public setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol))
    if (this.audio && !this.muted) {
      this.audio.volume = this.volume
    }
    if (this.ytIframe) {
      this.ytIframe.contentWindow?.postMessage(
        JSON.stringify({
          event: 'command',
          func: 'setVolume',
          args: [this.muted ? 0 : this.volume * 100],
        }),
        '*',
      )
    }
  }

  public getVolume(): number {
    return this.volume
  }

  public setMuted(muted: boolean): void {
    this.muted = muted
    if (this.audio) {
      this.audio.volume = muted ? 0 : this.volume
    }
    if (this.ytIframe) {
      this.ytIframe.contentWindow?.postMessage(
        JSON.stringify({
          event: 'command',
          func: muted ? 'mute' : 'unMute',
          args: [],
        }),
        '*',
      )
      this.ytIframe.contentWindow?.postMessage(
        JSON.stringify({
          event: 'command',
          func: 'setVolume',
          args: [muted ? 0 : this.volume * 100],
        }),
        '*',
      )
    }
  }

  public isMuted(): boolean {
    return this.muted
  }

  public getCurrentTime(): number {
    return this.currentSource?.type === 'youtube'
      ? this.ytCurrentTime
      : this.audio?.currentTime || 0
  }

  public getDuration(): number {
    return this.currentSource?.type === 'youtube' ? this.ytDuration : this.audio?.duration || 0
  }

  public stop(): void {
    this.playbackSessionId++
    if (this.ytFallbackTimer) {
      clearTimeout(this.ytFallbackTimer)
      this.ytFallbackTimer = null
    }
    if (this.ytPollTimer) {
      clearInterval(this.ytPollTimer)
      this.ytPollTimer = null
    }
    if (this.ytTickerTimer) {
      clearInterval(this.ytTickerTimer)
      this.ytTickerTimer = null
    }
    if (this.ytIframe) {
      try {
        this.ytIframe.contentWindow?.postMessage(
          '{"event":"command","func":"stopVideo","args":""}',
          '*',
        )
        this.ytIframe.src = 'about:blank'
      } catch {
        // ignore
      }
    }
    if (this.audio) {
      try {
        this.audio.pause()
        this.audio.removeAttribute('src')
      } catch {
        // ignore
      }
    }
    this.setState('idle')
  }
}

export const audioEngine = new NexusAudioEngine()
