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

    const bufferLength = analyser ? analyser.frequencyBinCount : 32
    const dataArray = new Uint8Array(bufferLength)

    // Resolve accent color once per run instead of on every single frame
    const computedStyle = getComputedStyle(canvas)
    const accentColor = computedStyle.getPropertyValue('--nx-accent').trim() || '#7c5cff'

    const width = canvas.width
    const height = canvas.height

    // Pre-create gradient for minimal mode
    const gradient = ctx.createLinearGradient(0, height, 0, 0)
    gradient.addColorStop(0, `${accentColor}33`)
    gradient.addColorStop(1, accentColor)

    const drawIdleFrame = () => {
      ctx.clearRect(0, 0, width, height)
      if (mode === 'minimal') {
        const barCount = 24
        const barWidth = width / barCount - 2
        ctx.fillStyle = `${accentColor}44`
        for (let i = 0; i < barCount; i++) {
          const x = i * (barWidth + 2)
          const barHeight = 3
          const y = height - barHeight
          ctx.beginPath()
          ctx.roundRect(x, y, barWidth, barHeight, 1.5)
          ctx.fill()
        }
      } else if (mode === 'reactive') {
        ctx.beginPath()
        ctx.moveTo(0, height / 2)
        ctx.lineTo(width, height / 2)
        ctx.strokeStyle = `${accentColor}44`
        ctx.lineWidth = 1.5
        ctx.stroke()
      }
    }

    // If not playing or window is unfocused, render single calm frame and do not schedule RAF
    if (!isPlaying || !windowActive) {
      drawIdleFrame()
      return
    }

    const render = () => {
      animationId = requestAnimationFrame(render)

      ctx.clearRect(0, 0, width, height)

      let hasData = false
      if (analyser && audioEngine.getState() === 'playing') {
        analyser.getByteFrequencyData(dataArray)
        for (let i = 0; i < bufferLength; i++) {
          if (dataArray[i] > 0) {
            hasData = true
            break
          }
        }
      }

      if (!hasData && audioEngine.getState() === 'playing') {
        // Dynamic rhythmic wave when audio stream is playing
        const time = Date.now() / 180
        for (let i = 0; i < bufferLength; i++) {
          const beat = Math.sin(time * 1.5 + i * 0.4) * Math.cos(time * 0.8 + i * 0.2)
          dataArray[i] = Math.min(255, Math.max(25, Math.round(Math.abs(beat) * 190 + 30)))
        }
      }

      if (mode === 'minimal') {
        const barCount = 24
        const barWidth = width / barCount - 2
        for (let i = 0; i < barCount; i++) {
          const sampleIndex = Math.floor((i / barCount) * (bufferLength / 2))
          const val = dataArray[sampleIndex] || 0
          const barHeight = Math.max(3, (val / 255) * height * 0.85)

          const x = i * (barWidth + 2)
          const y = height - barHeight

          ctx.fillStyle = gradient
          ctx.beginPath()
          ctx.roundRect(x, y, barWidth, barHeight, 2)
          ctx.fill()
        }
      } else if (mode === 'reactive') {
        ctx.beginPath()
        ctx.moveTo(0, height / 2)

        const sliceWidth = width / (bufferLength / 2)
        let x = 0

        for (let i = 0; i < bufferLength / 2; i++) {
          const v = (dataArray[i] || 0) / 255
          const y = height / 2 - (v - 0.5) * height * 0.8

          if (i === 0) {
            ctx.moveTo(x, y)
          } else {
            ctx.lineTo(x, y)
          }
          x += sliceWidth
        }

        ctx.lineTo(width, height / 2)
        ctx.strokeStyle = accentColor
        ctx.lineWidth = 2.5
        ctx.shadowColor = `${accentColor}88`
        ctx.shadowBlur = 8
        ctx.stroke()
      }
    }

    render()

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
      width={180}
      height={32}
      className={`pointer-events-none opacity-85 transition-opacity ${className}`}
    />
  )
}
