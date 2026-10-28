import { useConsoleStore } from '../store/console-store'
import { useSoundtrackStore } from '@/features/soundtrack/store/soundtrack-store'

export type ConsoleSoundKind =
  | 'move'
  | 'confirm'
  | 'back'
  | 'tab'
  | 'error'
  | 'toast'
  | 'boot'

class ConsoleUiSoundEngine {
  private ctx: AudioContext | null = null
  private duckTimeout: ReturnType<typeof setTimeout> | null = null
  private savedSoundtrackVolume: number | null = null

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) return null
    if (!this.ctx) {
      this.ctx = new AudioCtx()
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {})
    }
    return this.ctx
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

  public play(kind: ConsoleSoundKind): void {
    const { soundsEnabled, soundVolume } = useConsoleStore.getState()
    if (!soundsEnabled || soundVolume <= 0) return

    const ctx = this.getContext()
    if (!ctx) return

    const masterGain = (soundVolume / 100) * 0.18
    const now = ctx.currentTime

    try {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)

      switch (kind) {
        case 'move': {
          osc.type = 'sine'
          osc.frequency.setValueAtTime(520, now)
          osc.frequency.exponentialRampToValueAtTime(680, now + 0.032)
          gain.gain.setValueAtTime(masterGain * 0.55, now)
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.038)
          osc.start(now)
          osc.stop(now + 0.04)
          break
        }
        case 'confirm': {
          this.duckSoundtrackBriefly(180)
          osc.type = 'triangle'
          osc.frequency.setValueAtTime(540, now)
          osc.frequency.exponentialRampToValueAtTime(880, now + 0.085)
          gain.gain.setValueAtTime(masterGain * 0.9, now)
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.095)
          osc.start(now)
          osc.stop(now + 0.1)
          break
        }
        case 'back': {
          osc.type = 'sine'
          osc.frequency.setValueAtTime(480, now)
          osc.frequency.exponentialRampToValueAtTime(310, now + 0.075)
          gain.gain.setValueAtTime(masterGain * 0.75, now)
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.085)
          osc.start(now)
          osc.stop(now + 0.09)
          break
        }
        case 'tab': {
          osc.type = 'sine'
          osc.frequency.setValueAtTime(620, now)
          osc.frequency.exponentialRampToValueAtTime(760, now + 0.045)
          gain.gain.setValueAtTime(masterGain * 0.65, now)
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05)
          osc.start(now)
          osc.stop(now + 0.055)
          break
        }
        case 'error': {
          this.duckSoundtrackBriefly(240)
          osc.type = 'sawtooth'
          osc.frequency.setValueAtTime(220, now)
          osc.frequency.setValueAtTime(175, now + 0.07)
          gain.gain.setValueAtTime(masterGain * 0.85, now)
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16)
          osc.start(now)
          osc.stop(now + 0.17)
          break
        }
        case 'toast': {
          this.duckSoundtrackBriefly(260)
          osc.type = 'triangle'
          osc.frequency.setValueAtTime(660, now)
          osc.frequency.exponentialRampToValueAtTime(990, now + 0.14)
          gain.gain.setValueAtTime(masterGain * 0.85, now)
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16)
          osc.start(now)
          osc.stop(now + 0.17)
          break
        }
        case 'boot': {
          this.duckSoundtrackBriefly(450)
          osc.type = 'sine'
          osc.frequency.setValueAtTime(330, now)
          osc.frequency.exponentialRampToValueAtTime(660, now + 0.28)
          gain.gain.setValueAtTime(masterGain, now)
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.34)
          osc.start(now)
          osc.stop(now + 0.35)
          break
        }
      }
    } catch {
      // Ignore WebAudio restrictions before user gesture
    }
  }
}

export const consoleSoundEngine = new ConsoleUiSoundEngine()
