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
  private preloadAudio: HTMLAudioElement | null = null
  private preloadedUrl: string | null = null
  private ytIframe: HTMLIFrameElement | null = null
  private ytIframeReady = false
  private ytMessageListenerAttached = false
  private ytCurrentTime = 0
  private ytDuration = 0
  private ytPollTimer: ReturnType<typeof setInterval> | null = null
  private ytPlayConfirmResolver: (() => void) | null = null
  private ytPlayConfirmRejecter: ((err: Error) => void) | null = null
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

  private getEffectiveVolume(): number {
    if (this.muted) return 0
    const v = Number.isFinite(this.volume) ? this.volume : 0.8
    return Math.max(0, Math.min(1, v <= 0 ? 0.8 : v))
  }

  private initAudio() {
    if (this.audio) return
    if (typeof Audio === 'undefined') return

    this.audio = new Audio()
    this.audio.preload = 'auto'
    this.audio.muted = this.muted
    this.audio.volume = this.getEffectiveVolume()
    ;(this.audio as HTMLAudioElement & { referrerPolicy?: string }).referrerPolicy = 'no-referrer'

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
    iframe.style.bottom = '0px'
    iframe.style.right = '0px'
    iframe.style.width = '1px'
    iframe.style.height = '1px'
    iframe.style.opacity = '0.01'
    iframe.style.pointerEvents = 'none'
    iframe.style.zIndex = '-1'
    iframe.allow = 'autoplay; encrypted-media'
    document.body.appendChild(iframe)
    this.ytIframe = iframe

    if (!this.ytMessageListenerAttached && typeof window !== 'undefined') {
      this.ytMessageListenerAttached = true
      window.addEventListener('message', (event) => {
        if (!this.ytIframe || this.currentSource?.type !== 'youtube') return
        if (
          event.origin &&
          !event.origin.includes('youtube.com') &&
          !event.origin.includes('youtube-nocookie.com') &&
          !event.origin.startsWith('http://localhost')
        ) {
          return
        }
        try {
          const raw = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
          if (!raw) return

          // 1. Handshake
          if (raw.event === 'initialDelivery' || raw.event === 'onReady') {
            this.ytIframeReady = true
            this.ytIframe?.contentWindow?.postMessage('{"event":"listening"}', '*')
            this.ytIframe?.contentWindow?.postMessage(
              JSON.stringify({
                event: 'command',
                func: 'unMute',
                args: [],
              }),
              '*',
            )
            this.ytIframe?.contentWindow?.postMessage(
              JSON.stringify({
                event: 'command',
                func: 'setVolume',
                args: [Math.round(this.getEffectiveVolume() * 100)],
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
              typeof raw.info === 'number'
                ? raw.info
                : typeof raw.data === 'number'
                  ? raw.data
                  : null

            if (stateVal === 1) {
              this.setState('playing')
              if (this.ytPlayConfirmResolver) {
                const r = this.ytPlayConfirmResolver
                this.ytPlayConfirmResolver = null
                this.ytPlayConfirmRejecter = null
                r()
              }
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

          // 3. infoDelivery events (real YouTube time/duration updates only!)
          if (raw.event === 'infoDelivery') {
            const info = raw.info
            if (info !== undefined && info !== null && typeof info === 'object') {
              if (typeof info.currentTime === 'number' && info.currentTime > 0) {
                this.ytCurrentTime = info.currentTime
                if (this.state !== 'paused' && this.state !== 'ended') {
                  this.setState('playing')
                  if (this.ytPlayConfirmResolver) {
                    const r = this.ytPlayConfirmResolver
                    this.ytPlayConfirmResolver = null
                    this.ytPlayConfirmRejecter = null
                    r()
                  }
                }
              }
              if (typeof info.duration === 'number' && info.duration > 0) {
                this.ytDuration = info.duration
              }
              if (typeof info.playerState === 'number') {
                if (info.playerState === 1) {
                  this.setState('playing')
                  if (this.ytPlayConfirmResolver) {
                    const r = this.ytPlayConfirmResolver
                    this.ytPlayConfirmResolver = null
                    this.ytPlayConfirmRejecter = null
                    r()
                  }
                } else if (info.playerState === 2) {
                  this.setState('paused')
                } else if (info.playerState === 0) {
                  this.setState('ended')
                  this.events.onTrackEnded?.()
                }
              }
              if (this.ytCurrentTime > 0) {
                this.events.onTimeUpdate?.(this.ytCurrentTime, this.ytDuration)
              }
            }
          }

          // 4. Playback error from embed (e.g. Error 150 restricted music embed)
          if (raw.event === 'onError') {
            this.setState('error')
            if (this.ytPlayConfirmRejecter) {
              const rej = this.ytPlayConfirmRejecter
              this.ytPlayConfirmResolver = null
              this.ytPlayConfirmRejecter = null
              rej(new Error('YouTube embed playback restricted'))
            }
            this.events.onError?.('Track playback failed in embed')
          }
        } catch {
          // Not a JSON message from YT
        }
      })
    }

    return iframe
  }

  public setEventListeners(events: AudioEngineEvents) {
    this.events = events
  }

  public getAnalyser(): AnalyserNode | null {
    // Never attach createMediaElementSource to this.audio!
    // In Chromium/WebView2, calling createMediaElementSource(this.audio) permanently
    // routes the HTMLAudioElement through WebAudio and completely mutes any cross-origin
    // stream (KHInsider / VGM / CDN) that lacks Access-Control-Allow-Origin headers.
    // AudioVisualizer automatically renders a smooth reactive wave when getAnalyser() returns null.
    return null
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
      if (this.audio) {
        try {
          this.audio.pause()
          this.audio.removeAttribute('src')
        } catch {
          // ignore
        }
      }

      const iframe = this.getOrCreateYtIframe()
      if (!iframe) {
        throw new Error('YouTube player unavailable')
      }

      this.ytCurrentTime = 0
      this.ytDuration = 0
      this.events.onTimeUpdate?.(0, 0)

      const originParam =
        typeof window !== 'undefined' && window.location.origin.startsWith('http')
          ? `&origin=${encodeURIComponent(window.location.origin)}`
          : ''

      if (this.ytIframeReady && iframe.src && iframe.src.includes('youtube.com/embed/')) {
        iframe.contentWindow?.postMessage(
          JSON.stringify({
            event: 'command',
            func: 'loadVideoById',
            args: [source.url, 0],
          }),
          '*',
        )
        iframe.contentWindow?.postMessage('{"event":"command","func":"playVideo","args":""}', '*')
      } else {
        this.ytIframeReady = false
        iframe.src = `https://www.youtube.com/embed/${source.url}?autoplay=1&enablejsapi=1&playsinline=1&controls=0${originParam}`
      }

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
      }, 600)

      // Wait for real confirmation that YouTube actually started playing audio;
      // if blocked/restricted within 3.8s, reject so store fails over to direct audio stream!
      await new Promise<void>((resolve, reject) => {
        this.ytPlayConfirmResolver = resolve
        this.ytPlayConfirmRejecter = reject
        setTimeout(() => {
          if (this.ytPlayConfirmRejecter) {
            this.ytPlayConfirmResolver = null
            this.ytPlayConfirmRejecter = null
            reject(new Error('YouTube embed timed out or blocked'))
          }
        }, 5500)
      })
      return
    }

    // Handle direct HTTP stream (.mp3 / .m4a / .ogg) or local audio file
    if (this.ytIframe) {
      try {
        this.ytIframe.contentWindow?.postMessage(
          '{"event":"command","func":"pauseVideo","args":""}',
          '*',
        )
      } catch {
        // ignore
      }
    }
    if (this.ytPollTimer) {
      clearInterval(this.ytPollTimer)
      this.ytPollTimer = null
    }
    this.ytPlayConfirmResolver = null
    this.ytPlayConfirmRejecter = null

    this.initAudio()
    if (!this.audio) {
      throw new Error('HTML5 Audio element unavailable')
    }

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

    // Ensure audio element is unmuted and has audible volume
    this.audio.muted = this.muted
    this.audio.volume = this.getEffectiveVolume()
    this.audio.src = resolvedUrl
    this.audio.load()

    try {
      const playPromise = this.audio.play()
      if (playPromise !== undefined) {
        await playPromise
      }
      if (this.playbackSessionId === sessionId) {
        this.audio.muted = this.muted
        this.audio.volume = this.getEffectiveVolume()
        this.setState('playing')
      }
    } catch (err: unknown) {
      if (this.playbackSessionId !== sessionId) {
        return
      }
      if (err instanceof Error && err.name === 'AbortError') {
        return
      }
      const msg = err instanceof Error ? err.message : 'Playback failed'
      this.setState('error')
      this.events.onError?.(msg)
      throw err
    }
  }

  public pause(): void {
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
      try {
        this.audio.muted = this.muted
        this.audio.volume = this.getEffectiveVolume()
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
          args: [this.muted ? 0 : Math.round(this.volume * 100)],
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
      this.audio.muted = muted
      this.audio.volume = muted ? 0 : this.getEffectiveVolume()
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
          args: [muted ? 0 : Math.round(this.getEffectiveVolume() * 100)],
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
    if (this.ytPollTimer) {
      clearInterval(this.ytPollTimer)
      this.ytPollTimer = null
    }
    this.ytPlayConfirmResolver = null
    this.ytPlayConfirmRejecter = null
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

  public preloadStream(url: string | null | undefined): void {
    if (!url || typeof Audio === 'undefined') return
    if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('asset://')) {
      return
    }
    if (this.preloadedUrl === url) return
    try {
      if (!this.preloadAudio) {
        this.preloadAudio = new Audio()
        this.preloadAudio.preload = 'auto'
        this.preloadAudio.muted = true
        this.preloadAudio.volume = 0
        ;(this.preloadAudio as HTMLAudioElement & { referrerPolicy?: string }).referrerPolicy =
          'no-referrer'
      }
      this.preloadedUrl = url
      this.preloadAudio.src = url
      this.preloadAudio.load()
    } catch {
      // Ignore preload errors
    }
  }
}

export const audioEngine = new NexusAudioEngine()
