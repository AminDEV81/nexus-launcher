import { useEffect, useRef } from 'react'
import { audioEngine } from '../../services/audio-engine'
import { useSoundtrackStore, type VisualizerMode } from '../../store/soundtrack-store'
import { useWindowActive } from '@/hooks/use-window-active'

interface AudioVisualizerProps {
  mode?: VisualizerMode
  className?: string
}

export function AudioVisualizer({ mode = 'minimal', className = '' }: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const isPlaying = useSoundtrackStore((s) => s.playbackState === 'playing')
  const windowActive = useWindowActive()

  useEffect(() => {
    if (mode === 'off') return

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animationId: number | null = null
    const analyser = audioEngine.getAnalyser()

    const bufferLength = analyser ? analyser.frequencyBinCount : 48
    const dataArray = new Uint8Array(bufferLength)

    const width = canvas.width
    const height = canvas.height

    // Multi-stop neon gradient that looks vivid in both Console Mode and Legacy Mode
    const barGrad = ctx.createLinearGradient(0, height, 0, 0)
    barGrad.addColorStop(0, 'rgba(6, 182, 212, 0.28)')
    barGrad.addColorStop(0.55, 'rgba(56, 189, 248, 0.88)')
    barGrad.addColorStop(1, 'rgba(168, 85, 247, 0.98)')

    const waveGrad = ctx.createLinearGradient(0, 0, width, 0)
    waveGrad.addColorStop(0, '#06b6d4')
    waveGrad.addColorStop(0.5, '#6366f1')
    waveGrad.addColorStop(1, '#ec4899')

    const renderFrame = (activePlaying: boolean) => {
      ctx.clearRect(0, 0, width, height)

      let hasData = false
      if (activePlaying && analyser && audioEngine.getState() === 'playing') {
        analyser.getByteFrequencyData(dataArray)
        for (let i = 0; i < bufferLength; i++) {
          if (dataArray[i] > 0) {
            hasData = true
            break
          }
        }
      }

      const now = performance.now() / 1000
      if (!hasData) {
        for (let i = 0; i < bufferLength; i++) {
          if (activePlaying) {
            const w1 = Math.sin(now * 6.2 + i * 0.42)
            const w2 = Math.cos(now * 3.8 - i * 0.27)
            const w3 = Math.sin(now * 9.1 + i * 0.75) * 0.4
            const env = 1 - Math.abs(i - bufferLength * 0.45) / (bufferLength * 0.75)
            const raw = Math.abs(w1 * 0.55 + w2 * 0.35 + w3) * Math.max(0.3, env)
            dataArray[i] = Math.min(255, Math.max(28, Math.round(raw * 225 + 24)))
          } else {
            // Subtle breathing idle wave so the user always sees the visualizer style clearly
            const idleWave = Math.sin(now * 1.8 + i * 0.35) * 0.5 + 0.5
            dataArray[i] = Math.round(24 + idleWave * 36)
          }
        }
      }

      if (mode === 'minimal') {
        const barCount = 32
        const gap = 3
        const barWidth = (width - gap * (barCount - 1)) / barCount
        for (let i = 0; i < barCount; i++) {
          const sampleIndex = Math.floor((i / barCount) * (bufferLength * 0.75))
          const val = dataArray[sampleIndex] || 24
          const barHeight = Math.max(4, (val / 255) * (height - 6))
          const x = i * (barWidth + gap)
          const y = height - barHeight

          ctx.fillStyle = barGrad
          ctx.beginPath()
          ctx.roundRect(x, y, barWidth, barHeight, 2.5)
          ctx.fill()

          // Glowing peak cap
          ctx.fillStyle = activePlaying ? '#22d3ee' : 'rgba(34, 211, 238, 0.55)'
          ctx.fillRect(x, Math.max(1, y - 3), barWidth, 2)
        }
      } else if (mode === 'reactive') {
        const points = 40
        const sliceWidth = width / (points - 1)

        // Primary neon wave
        ctx.beginPath()
        for (let i = 0; i < points; i++) {
          const v = (dataArray[i % bufferLength] || 30) / 255
          const offset =
            Math.sin(now * (activePlaying ? 5.5 : 1.6) + i * 0.35) * v * (height * 0.38)
          const x = i * sliceWidth
          const y = height / 2 + offset
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.strokeStyle = waveGrad
        ctx.lineWidth = 2.8
        ctx.stroke()

        // Secondary mirrored harmonic wave
        ctx.beginPath()
        for (let i = 0; i < points; i++) {
          const v = (dataArray[(i + 6) % bufferLength] || 30) / 255
          const offset = Math.cos(now * (activePlaying ? 4.2 : 1.2) - i * 0.3) * v * (height * 0.28)
          const x = i * sliceWidth
          const y = height / 2 - offset
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.strokeStyle = 'rgba(34, 211, 238, 0.45)'
        ctx.lineWidth = 1.6
        ctx.stroke()
      }
    }

    if (!windowActive) {
      renderFrame(false)
      return
    }

    const loop = () => {
      renderFrame(isPlaying)
      animationId = requestAnimationFrame(loop)
    }

    loop()

    return () => {
      if (animationId !== null) {
        cancelAnimationFrame(animationId)
      }
    }
  }, [mode, isPlaying, windowActive])

  if (mode === 'off') return null

  return (
    <canvas
      ref={canvasRef}
      width={360}
      height={54}
      className={`pointer-events-none transition-opacity ${className}`}
    />
  )
}
