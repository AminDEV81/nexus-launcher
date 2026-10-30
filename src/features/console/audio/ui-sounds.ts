import { useConsoleStore } from '../store/console-store'
import { useSoundtrackStore } from '@/features/soundtrack/store/soundtrack-store'

export type ConsoleSoundKind =
  'move' | 'confirm' | 'back' | 'tab' | 'error' | 'toast' | 'boot' | 'launch' | 'open' | 'close'

export interface ConsoleSoundOptions {
  /** Semitone-ish detune multiplier (1 = none). Used to give focus moves a tactile, varied feel. */
  pitch?: number
}

/** Minimum gap between two sounds of the same kind, so held-stick repeats stay pleasant. */
const MIN_GAP_MS: Record<ConsoleSoundKind, number> = {
  move: 38,
  confirm: 60,
  back: 60,
  tab: 45,
  error: 120,
  toast: 120,
  boot: 500,
  launch: 500,
  open: 80,
  close: 80,
}

type ToneType = 'sine' | 'triangle' | 'square' | 'sawtooth'

class ConsoleUiSoundEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private noiseBuffer: AudioBuffer | null = null
  private lastPlayedAt: Partial<Record<ConsoleSoundKind, number>> = {}
  private duckTimeout: ReturnType<typeof setTimeout> | null = null
  private savedSoundtrackVolume: number | null = null
  private moveToggle = false

  /** Creates (once) the audio graph: voices -> master gain -> compressor -> speakers. */
  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null
    if (this.ctx) return this.ctx
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) return null
    try {
      const ctx = new AudioCtx({ latencyHint: 'interactive' })
      const master = ctx.createGain()
      master.gain.value = 0.9
      const compressor = ctx.createDynamicsCompressor()
      compressor.threshold.value = -14
      compressor.ratio.value = 6
      compressor.attack.value = 0.003
      compressor.release.value = 0.12
      master.connect(compressor)
      compressor.connect(ctx.destination)
      this.ctx = ctx
      this.master = master
      return ctx
    } catch {
      return null
    }
  }

  /**
   * Resumes the AudioContext. Chromium treats gamepad input as "not a user gesture", so without
   * `--autoplay-policy=no-user-gesture-required` (set in tauri.conf.json) or an explicit resume
   * on the first key / pointer / controller event, a controller-only session would stay silent.
   */
  public unlock(): void {
    const ctx = this.ensureContext()
    if (ctx && ctx.state !== 'running') {
      void ctx.resume().catch(() => {})
    }
  }

  private duckSoundtrackBriefly(durationMs: number) {
    try {
      const st = useSoundtrackStore.getState()
      if (st.playbackState !== 'playing') return
      if (this.savedSoundtrackVolume === null) {
        this.savedSoundtrackVolume = st.volume
      }
      const ducked = Math.max(0.08, this.savedSoundtrackVolume * 0.55)
      st.setVolume(ducked)
      if (this.duckTimeout) clearTimeout(this.duckTimeout)
      this.duckTimeout = setTimeout(() => {
        if (this.savedSoundtrackVolume !== null) {
          useSoundtrackStore.getState().setVolume(this.savedSoundtrackVolume)
          this.savedSoundtrackVolume = null
        }
      }, durationMs)
    } catch {
      // Ignore soundtrack ducking errors
    }
  }

  /** One enveloped oscillator voice. Frequencies glide exponentially from `from` to `to`. */
  private tone(
    ctx: AudioContext,
    opts: {
      from: number
      to: number
      duration: number
      type?: ToneType
      peak?: number
      delay?: number
      attack?: number
    },
  ) {
    if (!this.master) return
    const { from, to, duration, type = 'sine', peak = 0.3, delay = 0, attack = 0.006 } = opts
    const start = ctx.currentTime + delay
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(from, start)
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + duration)
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(peak, start + attack)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    osc.connect(gain)
    gain.connect(this.master)
    osc.start(start)
    osc.stop(start + duration + 0.02)
  }

  /** Band-passed noise sweep used for the launch "whoosh". */
  private whoosh(ctx: AudioContext, duration: number, peak: number) {
    if (!this.master) return
    if (!this.noiseBuffer) {
      const length = Math.floor(ctx.sampleRate * 1)
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
      const data = buffer.getChannelData(0)
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
      this.noiseBuffer = buffer
    }
    const start = ctx.currentTime
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuffer
    src.loop = true
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.Q.value = 1.4
    filter.frequency.setValueAtTime(300, start)
    filter.frequency.exponentialRampToValueAtTime(3200, start + duration)
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(peak, start + duration * 0.45)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    src.connect(filter)
    filter.connect(gain)
    gain.connect(this.master)
    src.start(start)
    src.stop(start + duration + 0.02)
  }

  private schedule(ctx: AudioContext, kind: ConsoleSoundKind, pitch: number) {
    switch (kind) {
      case 'move': {
        // Alternate a hair of detune so rapid navigation never sounds like a machine gun.
        this.moveToggle = !this.moveToggle
        const p = pitch * (this.moveToggle ? 1 : 1.045)
        this.tone(ctx, { from: 560 * p, to: 780 * p, duration: 0.07, type: 'triangle', peak: 0.34 })
        this.tone(ctx, { from: 1120 * p, to: 1560 * p, duration: 0.05, type: 'sine', peak: 0.1 })
        break
      }
      case 'confirm': {
        this.duckSoundtrackBriefly(260)
        this.tone(ctx, { from: 520, to: 700, duration: 0.09, type: 'triangle', peak: 0.38 })
        this.tone(ctx, {
          from: 780,
          to: 1040,
          duration: 0.14,
          type: 'triangle',
          peak: 0.34,
          delay: 0.06,
        })
        this.tone(ctx, {
          from: 1560,
          to: 2080,
          duration: 0.1,
          type: 'sine',
          peak: 0.1,
          delay: 0.06,
        })
        break
      }
      case 'back': {
        this.tone(ctx, { from: 560, to: 340, duration: 0.11, type: 'triangle', peak: 0.34 })
        this.tone(ctx, {
          from: 420,
          to: 260,
          duration: 0.12,
          type: 'sine',
          peak: 0.16,
          delay: 0.03,
        })
        break
      }
      case 'tab': {
        this.tone(ctx, { from: 640, to: 900, duration: 0.08, type: 'triangle', peak: 0.32 })
        this.tone(ctx, {
          from: 960,
          to: 1280,
          duration: 0.07,
          type: 'sine',
          peak: 0.12,
          delay: 0.035,
        })
        break
      }
      case 'error': {
        this.duckSoundtrackBriefly(320)
        this.tone(ctx, { from: 240, to: 200, duration: 0.12, type: 'square', peak: 0.18 })
        this.tone(ctx, {
          from: 200,
          to: 160,
          duration: 0.16,
          type: 'square',
          peak: 0.18,
          delay: 0.1,
        })
        break
      }
      case 'toast': {
        this.duckSoundtrackBriefly(420)
        this.tone(ctx, { from: 660, to: 700, duration: 0.12, type: 'sine', peak: 0.3 })
        this.tone(ctx, { from: 880, to: 920, duration: 0.14, type: 'sine', peak: 0.3, delay: 0.09 })
        this.tone(ctx, {
          from: 1320,
          to: 1380,
          duration: 0.2,
          type: 'sine',
          peak: 0.22,
          delay: 0.18,
        })
        break
      }
      case 'boot': {
        this.duckSoundtrackBriefly(900)
        this.tone(ctx, { from: 330, to: 340, duration: 0.5, type: 'sine', peak: 0.28 })
        this.tone(ctx, { from: 495, to: 505, duration: 0.5, type: 'sine', peak: 0.24, delay: 0.1 })
        this.tone(ctx, { from: 660, to: 680, duration: 0.6, type: 'sine', peak: 0.22, delay: 0.2 })
        this.tone(ctx, {
          from: 990,
          to: 1010,
          duration: 0.7,
          type: 'triangle',
          peak: 0.12,
          delay: 0.3,
        })
        break
      }
      case 'launch': {
        this.duckSoundtrackBriefly(700)
        this.whoosh(ctx, 0.5, 0.22)
        this.tone(ctx, { from: 220, to: 880, duration: 0.5, type: 'sawtooth', peak: 0.1 })
        this.tone(ctx, {
          from: 660,
          to: 1320,
          duration: 0.3,
          type: 'triangle',
          peak: 0.28,
          delay: 0.32,
        })
        break
      }
      case 'open': {
        this.tone(ctx, { from: 420, to: 640, duration: 0.12, type: 'triangle', peak: 0.3 })
        this.tone(ctx, { from: 840, to: 1180, duration: 0.1, type: 'sine', peak: 0.1, delay: 0.04 })
        break
      }
      case 'close': {
        this.tone(ctx, { from: 640, to: 420, duration: 0.12, type: 'triangle', peak: 0.28 })
        break
      }
    }
  }

  public play(kind: ConsoleSoundKind, options: ConsoleSoundOptions = {}): void {
    const { soundsEnabled, soundVolume } = useConsoleStore.getState()
    if (!soundsEnabled || soundVolume <= 0) return

    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const last = this.lastPlayedAt[kind] ?? 0
    if (nowMs - last < MIN_GAP_MS[kind]) return

    const ctx = this.ensureContext()
    if (!ctx || !this.master) return

    const run = () => {
      if (!this.master) return
      this.master.gain.setTargetAtTime(Math.min(1, soundVolume / 100) * 0.95, ctx.currentTime, 0.01)
      this.lastPlayedAt[kind] = nowMs
      try {
        this.schedule(ctx, kind, options.pitch ?? 1)
      } catch {
        // WebAudio can throw while the context is closing; sounds are never critical.
      }
    }

    if (ctx.state === 'running') {
      run()
      return
    }
    // Suspended (autoplay policy): resume first, then schedule so the clock is actually running.
    void ctx
      .resume()
      .then(run)
      .catch(() => {})
  }
}

export const consoleSoundEngine = new ConsoleUiSoundEngine()
