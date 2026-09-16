import { useEffect, useRef, useState } from 'react'

/**
 * IDM-Style Exponential Moving Average (EMA) Speed Smoother & ETA Calculator.
 *
 * Instead of jumping wildly with every 400ms tick, this stabilizes
 * download speed estimates and produces a rock-solid, smooth ETA
 * that mirrors Internet Download Manager (IDM).
 */
export function useSmoothedSpeed(rawSpeed: number, remainingBytes: number, isActive: boolean) {
  const [smoothedSpeed, setSmoothedSpeed] = useState(rawSpeed)
  const smoothedRef = useRef(rawSpeed)
  const lastUpdateRef = useRef(Date.now())

  useEffect(() => {
    if (!isActive) {
      smoothedRef.current = 0
      setSmoothedSpeed(0)
      return
    }

    const now = Date.now()
    const dt = (now - lastUpdateRef.current) / 1000
    lastUpdateRef.current = now

    // Weight factor: scales with elapsed time for smooth continuous curve
    // Alpha roughly 0.18 for ~2s half-life responsiveness
    const alpha = Math.min(1, Math.max(0.08, 1 - Math.exp(-dt / 2.2)))

    if (smoothedRef.current === 0) {
      smoothedRef.current = rawSpeed
    } else {
      smoothedRef.current = Math.round(smoothedRef.current * (1 - alpha) + rawSpeed * alpha)
    }

    setSmoothedSpeed(smoothedRef.current)
  }, [rawSpeed, isActive])

  const secondsRemaining =
    isActive && smoothedSpeed > 0 && remainingBytes > 0
      ? Math.round(remainingBytes / smoothedSpeed)
      : null

  const etaText =
    secondsRemaining === null
      ? null
      : secondsRemaining < 60
        ? `${secondsRemaining}s`
        : secondsRemaining < 3600
          ? `${Math.floor(secondsRemaining / 60)}m ${secondsRemaining % 60}s`
          : `${Math.floor(secondsRemaining / 3600)}h ${Math.floor((secondsRemaining % 3600) / 60)}m`

  return {
    smoothedSpeed,
    secondsRemaining,
    etaText,
  }
}
