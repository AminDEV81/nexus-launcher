import { useEffect, useRef, useState } from 'react'
import { ImageOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { isVideoAsset } from '@/lib/media-type'
import { useInViewport } from '@/hooks/use-in-viewport'
import { useWindowActive } from '@/hooks/use-window-active'

const MAX_CONCURRENT_THUMBS = 4
let activeThumbLoads = 0
const thumbQueue: Array<() => void> = []

function acquireThumbSlot(): Promise<() => void> {
  return new Promise((resolve) => {
    const tryStart = () => {
      if (activeThumbLoads < MAX_CONCURRENT_THUMBS) {
        activeThumbLoads++
        let released = false
        resolve(() => {
          if (released) return
          released = true
          activeThumbLoads = Math.max(0, activeThumbLoads - 1)
          const next = thumbQueue.shift()
          if (next) next()
        })
      } else {
        thumbQueue.push(tryStart)
      }
    }
    tryStart()
  })
}

interface CoverMediaProps {
  src: string
  fallbackSrc?: string
  mime?: string | null
  className?: string
  isAnimated?: boolean
  animatedEnabled?: boolean
  alwaysLive?: boolean
  hovered?: boolean
  fallback?: React.ReactNode
  onError?: () => void
}

export function CoverMedia({
  src,
  fallbackSrc,
  mime,
  className,
  isAnimated = false,
  animatedEnabled = true,
  alwaysLive = false,
  hovered,
  fallback,
  onError,
}: CoverMediaProps) {
  const [activeSrc, setActiveSrc] = useState(src)
  const [triedFallback, setTriedFallback] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setActiveSrc(src)
    setTriedFallback(false)
    setFailed(false)
  }, [src, fallbackSrc])

  const handleFail = () => {
    if (!triedFallback && fallbackSrc && fallbackSrc !== activeSrc) {
      setTriedFallback(true)
      setActiveSrc(fallbackSrc)
      return
    }
    setFailed(true)
    onError?.()
  }

  if (failed) {
    if (fallback) {
      return <>{fallback}</>
    }
    return (
      <div className={`flex items-center justify-center bg-surface-raised ${className ?? ''}`}>
        <ImageOff className="size-5 text-subtle" strokeWidth={1.5} />
      </div>
    )
  }

  if (isVideoAsset(activeSrc, mime)) {
    if (!animatedEnabled && !alwaysLive) {
      return <StaticVideoThumbnail src={activeSrc} className={className} onError={handleFail} />
    }
    return (
      <VideoCover
        src={activeSrc}
        className={className}
        canPlay={animatedEnabled}
        alwaysLive={alwaysLive}
        hoveredProp={hovered}
        onError={handleFail}
      />
    )
  }

  if (isAnimated) {
    return (
      <AnimatedImageCover
        src={activeSrc}
        className={className}
        canPlay={animatedEnabled}
        alwaysLive={alwaysLive}
        hoveredProp={hovered}
        onError={handleFail}
      />
    )
  }

  return (
    <img
      src={activeSrc}
      alt=""
      className={className}
      draggable={false}
      loading="lazy"
      decoding="async"
      onError={handleFail}
    />
  )
}

/**
 * Pure static preview for `.webm`/`.mp4` Live Cover thumbnails when `animatedEnabled={false}`.
 * Never calls `play()` — seeks once to `#t=0.75` (past any black intro fade) and stays strictly
 * paused so the user sees a clear, completely static image of the Live Cover with zero FPS drop.
 */
function StaticVideoThumbnail({
  src,
  className,
  onError,
}: {
  src: string
  className?: string
  onError: () => void
}) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const inViewport = useInViewport(wrapperRef)
  const [slotAcquired, setSlotAcquired] = useState(false)
  const [frameReady, setFrameReady] = useState(false)
  const releaseRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    setSlotAcquired(false)
    setFrameReady(false)
  }, [src])

  useEffect(() => {
    if (slotAcquired || !inViewport) return
    let cancelled = false

    acquireThumbSlot().then((release) => {
      if (cancelled) {
        release()
        return
      }
      releaseRef.current = release
      setSlotAcquired(true)
    })

    return () => {
      cancelled = true
      if (releaseRef.current) {
        releaseRef.current()
        releaseRef.current = null
      }
    }
  }, [inViewport, slotAcquired, src])

  function releaseSlot() {
    if (releaseRef.current) {
      releaseRef.current()
      releaseRef.current = null
    }
  }

  const videoSrcWithTime = src.includes('#') ? src : `${src}#t=0.75`

  return (
    <div
      ref={wrapperRef}
      className={cn(
        'relative overflow-hidden bg-slate-800/80',
        !frameReady && 'animate-pulse',
        className,
      )}
    >
      {slotAcquired && (
        <video
          src={videoSrcWithTime}
          muted
          playsInline
          disablePictureInPicture
          preload="metadata"
          className={cn(
            'pointer-events-none size-full object-cover transition-opacity duration-200',
            frameReady ? 'opacity-100' : 'opacity-0',
          )}
          onLoadedMetadata={(e) => {
            const v = e.currentTarget
            v.pause()
            const dur = v.duration
            const target =
              dur && Number.isFinite(dur) && dur > 0.3
                ? Math.min(1.2, Math.max(0.4, dur * 0.35))
                : 0.75
            try {
              v.currentTime = target
            } catch {
              setFrameReady(true)
              releaseSlot()
            }
          }}
          onLoadedData={(e) => {
            e.currentTarget.pause()
            setFrameReady(true)
            releaseSlot()
          }}
          onSeeked={(e) => {
            e.currentTarget.pause()
            setFrameReady(true)
            releaseSlot()
          }}
          onError={() => {
            releaseSlot()
            onError()
          }}
        />
      )}
    </div>
  )
}

function VideoCover({
  src,
  className,
  canPlay,
  alwaysLive,
  hoveredProp,
  onError,
}: {
  src: string
  className?: string
  canPlay: boolean
  alwaysLive: boolean
  hoveredProp?: boolean
  onError: () => void
}) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [selfHovered, setSelfHovered] = useState(false)
  const hovered = hoveredProp ?? selfHovered
  const inViewport = useInViewport(wrapperRef)
  const windowActive = useWindowActive()

  const playing = windowActive && canPlay && (hovered || alwaysLive) && inViewport

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    if (playing) {
      el.play().catch(() => {})
    } else {
      el.pause()
      try {
        if (el.readyState >= 1) {
          el.currentTime = 0.65
        }
      } catch {}
    }
  }, [playing, src])

  return (
    <div
      ref={wrapperRef}
      className={cn('relative overflow-hidden bg-slate-800/80', className)}
      onMouseEnter={() => setSelfHovered(true)}
      onMouseLeave={() => setSelfHovered(false)}
    >
      <video
        ref={videoRef}
        src={src}
        className="size-full object-cover"
        autoPlay={playing}
        loop
        muted
        playsInline
        disablePictureInPicture
        preload="metadata"
        onLoadedMetadata={(e) => {
          const v = e.currentTarget
          if (playing) {
            v.play().catch(() => {})
          } else {
            try {
              v.currentTime = 0.65
            } catch {}
          }
        }}
        onError={onError}
      />
    </div>
  )
}

/**
 * Freezes animated `.webp` / `.gif` images onto a static `<canvas>` and unmounts the `<img>`
 * whenever `playing` is false (`canPlay={false}` in the picker list and popup), so animated WebP
 * covers never play at low FPS or consume CPU/GPU decoding in the background!
 */
function AnimatedImageCover({
  src,
  className,
  canPlay,
  alwaysLive,
  hoveredProp,
  onError,
}: {
  src: string
  className?: string
  canPlay: boolean
  alwaysLive: boolean
  hoveredProp?: boolean
  onError: () => void
}) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [selfHovered, setSelfHovered] = useState(false)
  const [posterReady, setPosterReady] = useState(false)
  const hovered = hoveredProp ?? selfHovered
  const inViewport = useInViewport(wrapperRef)
  const windowActive = useWindowActive()

  useEffect(() => {
    setPosterReady(false)
  }, [src])

  const playing = windowActive && canPlay && (hovered || alwaysLive) && inViewport
  const shouldKeepImgMounted = !posterReady || playing

  function drawPosterFrame() {
    const img = imgRef.current
    const canvas = canvasRef.current
    if (!img || !canvas || !img.naturalWidth || !img.naturalHeight) return
    try {
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        setPosterReady(true)
      }
    } catch {
      setPosterReady(false)
    }
  }

  return (
    <div
      ref={wrapperRef}
      className={cn(
        'relative overflow-hidden bg-slate-800/80',
        !posterReady && 'animate-pulse',
        className,
      )}
      onMouseEnter={() => setSelfHovered(true)}
      onMouseLeave={() => setSelfHovered(false)}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 size-full object-cover"
        style={{ display: posterReady && !playing ? 'block' : 'none' }}
      />
      {shouldKeepImgMounted && (
        <img
          ref={imgRef}
          src={src}
          alt=""
          draggable={false}
          loading="lazy"
          decoding="async"
          className="size-full object-cover"
          style={{ display: !posterReady || playing ? 'block' : 'none' }}
          onLoad={drawPosterFrame}
          onError={onError}
        />
      )}
    </div>
  )
}
