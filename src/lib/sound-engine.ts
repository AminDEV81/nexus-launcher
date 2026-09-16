/**
 * Small, synthesized UI sounds — no files or external audio library.
 * Every cue uses the same soft bell + rounded low-tone palette so the
 * app feels intentional without becoming noisy during normal navigation.
 */

let ctx: AudioContext | null = null
let unlocked = false
let soundsEnabled = true

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AudioCtor =
      window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioCtor) return null
    ctx = new AudioCtor()
  }
  return ctx
}

export function unlockAudioOnFirstInteraction() {
  if (unlocked) return
  unlocked = true
  const resume = () => {
    void getContext()
      ?.resume()
      .catch(() => undefined)
  }
  window.addEventListener('pointerdown', resume, { once: true })
  window.addEventListener('keydown', resume, { once: true })
}

export function setSoundsEnabled(enabled: boolean) {
  soundsEnabled = enabled
}

export function getSoundsEnabled() {
  return soundsEnabled
}

function note(
  audio: AudioContext,
  frequency: number,
  startTime: number,
  duration: number,
  peakGain: number,
  type: OscillatorType = 'sine',
  detune = 0,
) {
  const oscillator = audio.createOscillator()
  const gain = audio.createGain()
  oscillator.type = type
  oscillator.frequency.setValueAtTime(frequency, startTime)
  oscillator.detune.setValueAtTime(detune, startTime)

  gain.gain.setValueAtTime(0.0001, startTime)
  gain.gain.exponentialRampToValueAtTime(peakGain, startTime + 0.008)
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration)

  oscillator.connect(gain)
  gain.connect(audio.destination)
  oscillator.start(startTime)
  oscillator.stop(startTime + duration + 0.03)
}

/** Fast glassy confirmation — deliberately quiet because every button uses it. */
export function playClick() {
  if (!soundsEnabled) return
  const audio = getContext()
  if (!audio || audio.state === 'suspended') return
  const now = audio.currentTime
  note(audio, 620, now, 0.055, 0.025, 'triangle')
  note(audio, 1240, now + 0.012, 0.075, 0.012, 'sine')
}

/**
 * Three phases timed to the original startup animation: a rising sweep
 * while shards converge, a sparkle hit at impact, then a warm chord as
 * the mark and wordmark settle.
 */
export function playStartupChime() {
  if (!soundsEnabled) return
  const audio = getContext()
  if (!audio || audio.state === 'suspended') return
  const now = audio.currentTime

  const sweep = audio.createOscillator()
  const sweepGain = audio.createGain()
  sweep.type = 'sine'
  sweep.frequency.setValueAtTime(180, now)
  sweep.frequency.exponentialRampToValueAtTime(760, now + 0.85)
  sweepGain.gain.setValueAtTime(0, now)
  sweepGain.gain.linearRampToValueAtTime(0.035, now + 0.5)
  sweepGain.gain.linearRampToValueAtTime(0.0001, now + 0.9)
  sweep.connect(sweepGain)
  sweepGain.connect(audio.destination)
  sweep.start(now)
  sweep.stop(now + 0.95)

  const impactTime = now + 0.9
  ;[1568, 2093, 2637].forEach((frequency, index) => {
    note(audio, frequency, impactTime + index * 0.02, 0.35, 0.035, 'sine')
  })
  note(audio, 523, impactTime, 0.6, 0.05, 'triangle')

  const resolveTime = now + 1.15
  ;[523, 659, 784].forEach((frequency) => {
    note(audio, frequency, resolveTime, 1.1, 0.04, 'sine')
    note(audio, frequency, resolveTime, 1.1, 0.02, 'sine', 6)
  })
  note(audio, 1046, resolveTime + 0.05, 1.2, 0.035, 'sine')
}

/** A short, resolved descent for closing — no harsh synthetic sweep. */
export function playCloseSound() {
  if (!soundsEnabled) return
  const audio = getContext()
  if (!audio || audio.state === 'suspended') return
  const now = audio.currentTime
  note(audio, 659.25, now, 0.22, 0.026, 'triangle')
  note(audio, 493.88, now + 0.1, 0.3, 0.025, 'sine')
  note(audio, 329.63, now + 0.2, 0.42, 0.02, 'sine')
}

/** A rising power surge for initiating game boost. */
export function playBoostCharge() {
  if (!soundsEnabled) return
  const audio = getContext()
  if (!audio || audio.state === 'suspended') return
  const now = audio.currentTime

  const sweep = audio.createOscillator()
  const sweepGain = audio.createGain()
  sweep.type = 'sawtooth'
  sweep.frequency.setValueAtTime(140, now)
  sweep.frequency.exponentialRampToValueAtTime(880, now + 0.6)
  sweepGain.gain.setValueAtTime(0.0001, now)
  sweepGain.gain.linearRampToValueAtTime(0.04, now + 0.3)
  sweepGain.gain.linearRampToValueAtTime(0.0001, now + 0.65)
  sweep.connect(sweepGain)
  sweepGain.connect(audio.destination)
  sweep.start(now)
  sweep.stop(now + 0.7)

  note(audio, 440, now + 0.1, 0.25, 0.03, 'sine')
  note(audio, 880, now + 0.4, 0.35, 0.04, 'triangle')
}

/** Triumphant cybernetic resolve when booster completes. */
export function playBoostComplete() {
  if (!soundsEnabled) return
  const audio = getContext()
  if (!audio || audio.state === 'suspended') return
  const now = audio.currentTime

  ;[523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
    note(audio, freq, now + i * 0.06, 0.45, 0.035, 'triangle')
    note(audio, freq * 2, now + i * 0.06 + 0.02, 0.3, 0.015, 'sine')
  })
}

/** Crisp, celebratory fanfare when a download finishes and installs successfully. */
export function playDownloadComplete() {
  if (!soundsEnabled) return
  const audio = getContext()
  if (!audio || audio.state === 'suspended') return
  const now = audio.currentTime

  ;[440, 554.37, 659.25, 880, 1108.73, 1318.51].forEach((freq, i) => {
    note(audio, freq, now + i * 0.045, 0.4, 0.03, 'sine')
    note(audio, freq * 1.5, now + i * 0.045 + 0.015, 0.25, 0.015, 'triangle')
  })
}

let lastSwitchSoundTime = 0

/**
 * Soft, futuristic electronic hover / focus pulse.
 * Recreates a sleek holographic console cursor:
 * - Upward electronic dual-sine chirp (520Hz -> 780Hz in 32ms)
 * - Shimmering electronic harmonic overtone (1040Hz -> 1320Hz)
 * - Soft low-frequency electronic cushion (240Hz)
 * - Buttery smooth attack and decay, zero harshness
 */
export function playProfileSwitch() {
  if (!soundsEnabled) return
  const nowMs = performance.now()
  if (nowMs - lastSwitchSoundTime < 60) return
  lastSwitchSoundTime = nowMs

  const audio = getContext()
  if (!audio || audio.state === 'suspended') return
  const now = audio.currentTime

  // Filter to keep it warm, velvety, and electronic
  const filter = audio.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(2200, now)
  filter.Q.setValueAtTime(1.2, now)
  filter.connect(audio.destination)

  // 1. Primary upward electronic pitch chirp
  const osc1 = audio.createOscillator()
  const gain1 = audio.createGain()
  osc1.type = 'sine'
  osc1.frequency.setValueAtTime(520, now)
  osc1.frequency.exponentialRampToValueAtTime(780, now + 0.032)

  gain1.gain.setValueAtTime(0.0001, now)
  gain1.gain.linearRampToValueAtTime(0.038, now + 0.005)
  gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.038)

  osc1.connect(gain1)
  gain1.connect(filter)
  osc1.start(now)
  osc1.stop(now + 0.042)

  // 2. High electronic holographic shimmer
  const osc2 = audio.createOscillator()
  const gain2 = audio.createGain()
  osc2.type = 'sine'
  osc2.frequency.setValueAtTime(1040, now)
  osc2.frequency.exponentialRampToValueAtTime(1320, now + 0.028)

  gain2.gain.setValueAtTime(0.0001, now)
  gain2.gain.linearRampToValueAtTime(0.016, now + 0.004)
  gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.03)

  osc2.connect(gain2)
  gain2.connect(filter)
  osc2.start(now)
  osc2.stop(now + 0.035)

  // 3. Soft electronic low body
  const sub = audio.createOscillator()
  const subGain = audio.createGain()
  sub.type = 'sine'
  sub.frequency.setValueAtTime(240, now)
  sub.frequency.exponentialRampToValueAtTime(190, now + 0.035)

  subGain.gain.setValueAtTime(0.0001, now)
  subGain.gain.linearRampToValueAtTime(0.028, now + 0.004)
  subGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04)

  sub.connect(subGain)
  subGain.connect(filter)
  sub.start(now)
  sub.stop(now + 0.045)
}

/**
 * Soft, futuristic electronic profile entrance — Ambient Cyber Synth Bloom.
 * Designed with a rich analog/digital synthesizer character:
 * 1. Warm electronic filter sweep (cutoff sweeps 750Hz -> 2600Hz -> 650Hz over 1.6s)
 * 2. Gentle cybernetic power surge swell (rising sub-tones, no harsh clicks)
 * 3. Deep warm electronic sub-drone (110Hz A2 + 164.8Hz E3) sustaining for 1.4s
 * 4. Lush 9-harmonic futuristic synth pad (A Maj9 / F#m11) with detuned chorus
 * 5. Extended 1.6s silky exponential fade out
 */
export function playProfileEnter() {
  if (!soundsEnabled) return
  const audio = getContext()
  if (!audio || audio.state === 'suspended') return
  const now = audio.currentTime

  // Swept resonant electronic filter (the signature synthesizer "bloom" motion)
  const synthFilter = audio.createBiquadFilter()
  synthFilter.type = 'lowpass'
  synthFilter.frequency.setValueAtTime(750, now)
  synthFilter.frequency.exponentialRampToValueAtTime(2600, now + 0.18)
  synthFilter.frequency.exponentialRampToValueAtTime(650, now + 1.55)
  synthFilter.Q.setValueAtTime(1.8, now)
  synthFilter.connect(audio.destination)

  // --- 1. Soft Cybernetic Power Swell (Soft upward electronic glide, 80ms) ---
  const sweep = audio.createOscillator()
  const sweepGain = audio.createGain()
  sweep.type = 'sine'
  sweep.frequency.setValueAtTime(180, now)
  sweep.frequency.exponentialRampToValueAtTime(440, now + 0.1)

  sweepGain.gain.setValueAtTime(0.0001, now)
  sweepGain.gain.linearRampToValueAtTime(0.04, now + 0.05)
  sweepGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35)

  sweep.connect(sweepGain)
  sweepGain.connect(synthFilter)
  sweep.start(now)
  sweep.stop(now + 0.38)

  // --- 2. Deep Electronic Sub-Bass Drone (110Hz A2 + 164.8Hz E3, 1.4s) ---
  const sub1 = audio.createOscillator()
  const subGain1 = audio.createGain()
  sub1.type = 'sine'
  sub1.frequency.setValueAtTime(110.0, now)

  subGain1.gain.setValueAtTime(0.0001, now)
  subGain1.gain.linearRampToValueAtTime(0.05, now + 0.08)
  subGain1.gain.exponentialRampToValueAtTime(0.0001, now + 1.4)

  sub1.connect(subGain1)
  subGain1.connect(synthFilter)
  sub1.start(now)
  sub1.stop(now + 1.45)

  const sub2 = audio.createOscillator()
  const subGain2 = audio.createGain()
  sub2.type = 'sine'
  sub2.frequency.setValueAtTime(164.81, now)

  subGain2.gain.setValueAtTime(0.0001, now)
  subGain2.gain.linearRampToValueAtTime(0.035, now + 0.1)
  subGain2.gain.exponentialRampToValueAtTime(0.0001, now + 1.3)

  sub2.connect(subGain2)
  subGain2.connect(synthFilter)
  sub2.start(now)
  sub2.stop(now + 1.35)

  // --- 3. Lush Futuristic Ambient Synth Pad (A Maj9 / F#m11 Chord) ---
  // Rich electronic harmonics with subtle chorus detune & slow 1.6s fade
  const notes: {
    freq: number
    delay: number
    attack: number
    duration: number
    peakGain: number
    detune?: number
    type?: OscillatorType
  }[] = [
    // Warm lower synth body (A3, C#4, E4)
    { freq: 220.0, delay: 0.02, attack: 0.07, duration: 1.35, peakGain: 0.025, type: 'sine' },
    { freq: 277.18, delay: 0.03, attack: 0.07, duration: 1.45, peakGain: 0.028, type: 'triangle' },
    {
      freq: 329.63,
      delay: 0.04,
      attack: 0.08,
      duration: 1.5,
      peakGain: 0.03,
      detune: 4,
      type: 'sine',
    },
    // Mid harmonic luster (G#4, B4, E5)
    {
      freq: 415.3,
      delay: 0.06,
      attack: 0.08,
      duration: 1.55,
      peakGain: 0.028,
      detune: -4,
      type: 'sine',
    },
    {
      freq: 493.88,
      delay: 0.08,
      attack: 0.09,
      duration: 1.55,
      peakGain: 0.024,
      detune: 5,
      type: 'triangle',
    },
    {
      freq: 659.25,
      delay: 0.1,
      attack: 0.08,
      duration: 1.6,
      peakGain: 0.025,
      detune: -3,
      type: 'sine',
    },
    // Crystalline electronic leads (G#5, B5)
    {
      freq: 830.61,
      delay: 0.12,
      attack: 0.07,
      duration: 1.5,
      peakGain: 0.018,
      detune: 4,
      type: 'sine',
    },
    {
      freq: 987.77,
      delay: 0.14,
      attack: 0.08,
      duration: 1.4,
      peakGain: 0.014,
      detune: -5,
      type: 'sine',
    },
    // Ethereal futuristic high shimmer (E6)
    {
      freq: 1318.51,
      delay: 0.16,
      attack: 0.09,
      duration: 1.25,
      peakGain: 0.008,
      detune: 6,
      type: 'sine',
    },
  ]

  notes.forEach(({ freq, delay, attack, duration, peakGain, detune = 0, type = 'sine' }) => {
    const osc = audio.createOscillator()
    const gain = audio.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, now + delay)
    if (detune !== 0) {
      osc.detune.setValueAtTime(detune, now + delay)
    }

    gain.gain.setValueAtTime(0.0001, now + delay)
    gain.gain.linearRampToValueAtTime(peakGain, now + delay + attack)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + duration)

    osc.connect(gain)
    gain.connect(synthFilter)
    osc.start(now + delay)
    osc.stop(now + delay + duration + 0.05)
  })
}

export const playButtonClick = playClick
export const playCardHover = playProfileSwitch
