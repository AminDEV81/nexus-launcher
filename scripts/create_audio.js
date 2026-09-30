import fs from 'fs'
import path from 'path'

const SAMPLE_RATE = 44100
const DURATION_SEC = 25.0
const TOTAL_SAMPLES = Math.floor(SAMPLE_RATE * DURATION_SEC)
const BPM = 124
const BEAT_SEC = 60 / BPM
const STEP_SEC = BEAT_SEC / 4 // 16th note

const left = new Float32Array(TOTAL_SAMPLES)
const right = new Float32Array(TOTAL_SAMPLES)

function addSample(i, l, r) {
  if (i >= 0 && i < TOTAL_SAMPLES) {
    left[i] += l
    right[i] += r
  }
}

// 1. Synthesize Kicks
for (let t = 0; t < DURATION_SEC; t += BEAT_SEC) {
  const startSample = Math.floor(t * SAMPLE_RATE)
  const kickLength = Math.floor(SAMPLE_RATE * 0.3)
  for (let s = 0; s < kickLength; s++) {
    const p = s / kickLength
    const freq = 160 * Math.exp(-p * 12) + 38
    const phase = (s / SAMPLE_RATE) * freq * Math.PI * 2
    const env = Math.exp(-p * 7)
    let sample = Math.sin(phase) * env * 0.85
    // Soft clip distortion
    sample = Math.tanh(sample * 1.5)
    addSample(startSample + s, sample, sample)
  }
}

// 2. Synthesize Snares on beats 2 and 4 (offset by BEAT_SEC)
for (let t = BEAT_SEC; t < DURATION_SEC; t += BEAT_SEC * 2) {
  const startSample = Math.floor(t * SAMPLE_RATE)
  const snareLength = Math.floor(SAMPLE_RATE * 0.22)
  for (let s = 0; s < snareLength; s++) {
    const p = s / snareLength
    const env = Math.exp(-p * 9)
    // Noise + tone
    const noise = (Math.random() * 2 - 1) * 0.5
    const tone = Math.sin((s / SAMPLE_RATE) * 210 * Math.PI * 2) * 0.35
    const sample = (noise + tone) * env * 0.7
    addSample(startSample + s, sample, sample)
  }
}

// 3. Synthesize Hi-Hats
for (let t = 0; t < DURATION_SEC; t += STEP_SEC) {
  const stepIdx = Math.floor(t / STEP_SEC)
  const isOffbeat = stepIdx % 4 === 2
  const hatLength = Math.floor(SAMPLE_RATE * (isOffbeat ? 0.08 : 0.04))
  const startSample = Math.floor(t * SAMPLE_RATE)
  const vol = isOffbeat ? 0.35 : 0.2
  for (let s = 0; s < hatLength; s++) {
    const p = s / hatLength
    const env = Math.exp(-p * 14)
    const noise = (Math.random() * 2 - 1) * vol * env
    // Slight stereo pan
    addSample(startSample + s, noise * 0.9, noise * 1.1)
  }
}

// 4. Synthesize Rolling Synth Bass (16th notes)
// Progression: C (bars 1-2), Eb (bar 3), F (bar 4), G (bar 5)...
const bassFreqs = [65.41, 65.41, 77.78, 65.41, 87.31, 87.31, 98.0, 77.78]
for (let t = 0; t < DURATION_SEC; t += STEP_SEC) {
  const stepIdx = Math.floor(t / STEP_SEC)
  const noteIdx = Math.floor(stepIdx / 2) % bassFreqs.length
  const baseFreq = bassFreqs[noteIdx]
  const startSample = Math.floor(t * SAMPLE_RATE)
  const noteLen = Math.floor(SAMPLE_RATE * (STEP_SEC * 0.85))

  for (let s = 0; s < noteLen; s++) {
    const p = s / noteLen
    const env = Math.exp(-p * 5)
    const timeSec = s / SAMPLE_RATE
    // Sawtooth approximation + sub sine
    let saw = ((timeSec * baseFreq) % 1) * 2 - 1
    let sub = Math.sin(timeSec * (baseFreq * 0.5) * Math.PI * 2) * 0.5
    let sample = (saw * 0.4 + sub * 0.6) * env * 0.6
    addSample(startSample + s, sample, sample)
  }
}

// 5. Synthesize Cyberpunk Arp Melody
const arpFreqs = [
  261.63, 311.13, 392.0, 523.25, 466.16, 392.0, 311.13, 392.0, 261.63, 349.23, 392.0, 523.25,
  587.33, 523.25, 392.0, 349.23,
]
for (let t = 0; t < DURATION_SEC; t += STEP_SEC) {
  const stepIdx = Math.floor(t / STEP_SEC)
  const freq = arpFreqs[stepIdx % arpFreqs.length]
  const startSample = Math.floor(t * SAMPLE_RATE)
  const noteLen = Math.floor(SAMPLE_RATE * 0.18)

  for (let s = 0; s < noteLen; s++) {
    const p = s / noteLen
    const env = Math.exp(-p * 7)
    const timeSec = s / SAMPLE_RATE
    // Square wave with fast decay
    const sq = Math.sign(Math.sin(timeSec * freq * Math.PI * 2))
    const sample = sq * env * 0.22
    // Delay / stereo echo
    addSample(startSample + s, sample * 0.8, sample * 1.2)
    // Ping pong echo after 120ms
    const delaySample = startSample + s + Math.floor(SAMPLE_RATE * 0.12)
    addSample(delaySample, sample * 0.3, sample * 0.15)
  }
}

// 6. Synthesize Ambient Synth Chord Pads
const chords = [
  [130.81, 155.56, 196.0], // Cm
  [155.56, 196.0, 233.08], // Eb
  [174.61, 207.65, 261.63], // Fm
  [196.0, 233.08, 293.66], // Gm
]
for (let bar = 0; bar < Math.floor(DURATION_SEC / (BEAT_SEC * 4)); bar++) {
  const chord = chords[bar % chords.length]
  const barStart = Math.floor(bar * BEAT_SEC * 4 * SAMPLE_RATE)
  const chordLen = Math.floor(BEAT_SEC * 4 * SAMPLE_RATE)

  for (let s = 0; s < chordLen; s++) {
    const p = s / chordLen
    const env = Math.sin(p * Math.PI) * 0.25
    const timeSec = s / SAMPLE_RATE
    let chordSample = 0
    for (const f of chord) {
      chordSample += Math.sin(timeSec * f * Math.PI * 2) * 0.33
      chordSample += Math.sin(timeSec * (f * 1.005) * Math.PI * 2) * 0.33 // detune chorus
    }
    const val = chordSample * env * 0.45
    addSample(barStart + s, val, val)
  }
}

// 7. Synthesize Transition Risers and Impacts (at 0s, 5s, 10s, 15s, 20s)
;[0, 5, 10, 15, 20].forEach((dropTime) => {
  // Riser before drop (if dropTime > 0)
  if (dropTime > 0) {
    const riserLen = Math.floor(SAMPLE_RATE * 1.2)
    const riserStart = Math.floor((dropTime - 1.2) * SAMPLE_RATE)
    for (let s = 0; s < riserLen; s++) {
      const p = s / riserLen
      const noise = (Math.random() * 2 - 1) * Math.pow(p, 2) * 0.35
      const pitchSweep = Math.sin((s / SAMPLE_RATE) * (150 + p * 800) * Math.PI * 2) * p * 0.2
      addSample(riserStart + s, (noise + pitchSweep) * 0.7, (noise + pitchSweep) * 0.7)
    }
  }

  // Impact Boom at drop
  const boomLen = Math.floor(SAMPLE_RATE * 1.5)
  const boomStart = Math.floor(dropTime * SAMPLE_RATE)
  for (let s = 0; s < boomLen; s++) {
    const p = s / boomLen
    const env = Math.exp(-p * 4)
    const sub = Math.sin((s / SAMPLE_RATE) * (70 - p * 35) * Math.PI * 2) * 0.45
    const noise = (Math.random() * 2 - 1) * 0.2 * Math.exp(-p * 10)
    const sample = (sub + noise) * env
    addSample(boomStart + s, sample, sample)
  }
})

// 8. Master Limiter / Normalization & 16-bit WAV Encoding
let maxAmp = 0
for (let i = 0; i < TOTAL_SAMPLES; i++) {
  maxAmp = Math.max(maxAmp, Math.abs(left[i]), Math.abs(right[i]))
}

const normFactor = maxAmp > 0 ? 0.95 / maxAmp : 1
const wavBuffer = Buffer.alloc(44 + TOTAL_SAMPLES * 4)

// Write WAV Header
wavBuffer.write('RIFF', 0)
wavBuffer.writeUInt32LE(36 + TOTAL_SAMPLES * 4, 4)
wavBuffer.write('WAVE', 8)
wavBuffer.write('fmt ', 12)
wavBuffer.writeUInt32LE(16, 16) // PCM header size
wavBuffer.writeUInt16LE(1, 20) // Format PCM
wavBuffer.writeUInt16LE(2, 22) // Channels (stereo)
wavBuffer.writeUInt32LE(SAMPLE_RATE, 24)
wavBuffer.writeUInt32LE(SAMPLE_RATE * 4, 28) // Byte rate
wavBuffer.writeUInt16LE(4, 32) // Block align
wavBuffer.writeUInt16LE(16, 34) // Bits per sample
wavBuffer.write('data', 36)
wavBuffer.writeUInt32LE(TOTAL_SAMPLES * 4, 40)

let offset = 44
for (let i = 0; i < TOTAL_SAMPLES; i++) {
  let l = Math.max(-1, Math.min(1, left[i] * normFactor))
  let r = Math.max(-1, Math.min(1, right[i] * normFactor))
  const lInt = l < 0 ? l * 0x8000 : l * 0x7fff
  const rInt = r < 0 ? r * 0x8000 : r * 0x7fff
  wavBuffer.writeInt16LE(Math.floor(lInt), offset)
  wavBuffer.writeInt16LE(Math.floor(rInt), offset + 2)
  offset += 4
}

const outPath = path.resolve('scripts', 'promo_soundtrack.wav')
fs.writeFileSync(outPath, wavBuffer)
console.log(
  `Generated soundtrack: ${outPath} (${(wavBuffer.length / (1024 * 1024)).toFixed(2)} MB, ${DURATION_SEC}s)`,
)
