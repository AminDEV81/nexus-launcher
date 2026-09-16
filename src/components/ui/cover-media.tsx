import { useEffect, useRef, useState } from 'react'
import { ImageOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { isVideoAsset } from '@/lib/media-type'
import { useInViewport } from '@/hooks/use-in-viewport'
import { useWindowActive } from '@/hooks/use-window-active'

interface CoverMediaProps {
  src: string
  mime?: string | null
  className?: string
  /**
   * Whether `src` is a Live Cover (animated WebP or video) rather than
   * a plain static image. Defaults to `false` so existing call sites
   * (screenshots, generic thumbnails) keep rendering a plain `<img>`
   * unless they opt in.
   */
  isAnimated?: boolean
  /**
   * Per-game Live Cover kill switch (`games.animated_cover_enabled`).
   * When `false`, the cover always shows its static first frame, even
   * on hover. Defaults to `true`.
   */
  animatedEnabled?: boolean
  /**
   * Plays the Live Cover without requiring hover — used for the
   * selected card in the grid/list and for the details panel hero,
   * which only renders for the selected game in the first place.
   */
  alwaysLive?: boolean
  /**
   * Controlled hover state. Pass this when an overlay sitting on top
   * of the cover (e.g. the grid card's play-button overlay) would
   * otherwise intercept mouseenter/mouseleave before they reach this
   * component — track hover on the outer card instead and forward it
   * here. When omitted, CoverMedia tracks hover on itself.
   */
  hovered?: boolean
}

/**
 * Renders a cover/thumbnail. Three cases:
 *
 * - Plain static image (`isAnimated` false, not a video) — a regular
 *   `<img>`, same as always.
 * - Video Live Cover — a `<video>` that only plays while hovered (or
 *   `alwaysLive`) *and* in viewport; paused (and reset) otherwise. A
 *   `<canvas>` snapshot of the first frame is kept underneath as the
 *   static poster — without it, a `preload="metadata"` video shows
 *   nothing at all until it's actually played once, which is what
 *   made covers go blank when Live Cover was disabled.
 * - Animated-image Live Cover (WebP/GIF) — same canvas-poster
 *   approach, since `<img>` has no native pause.
 *
 * This keeps at most one Live Cover decoding/animating at a time
 * (whichever is hovered/selected), and unmounts the live media entirely
 * when it is off-screen or the Nexus window is unfocused — instead of
 * letting every visible Live Cover use a decoder in the background.
 *
 * Falls back to a small placeholder icon on a load error instead of
 * the browser's broken-image glyph, since a dead SteamGridDB URL or an
 * unsupported codec should degrade gracefully, not look broken.
 */
export function CoverMedia({
  src,
  mime,
  className,
  isAnimated = false,
  animatedEnabled = true,
  alwaysLive = false,
  hovered,
}: CoverMediaProps) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <div className={`flex items-center justify-center bg-surface-raised ${className ?? ''}`}>
        <ImageOff className="size-5 text-subtle" strokeWidth={1.5} />
      </div>
    )
  }

  if (isVideoAsset(src, mime)) {
    return (
      <VideoCover
        src={src}
        className={className}
        canPlay={animatedEnabled}
        alwaysLive={alwaysLive}
        hoveredProp={hovered}
        onError={() => setFailed(true)}
      />
    )
  }

  if (isAnimated) {
    return (
      <AnimatedImageCover
        src={src}
        className={className}
        canPlay={animatedEnabled}
        alwaysLive={alwaysLive}
        hoveredProp={hovered}
        onError={() => setFailed(true)}
      />
    )
  }

  return (
    <img
      src={src}
      alt=""
      className={className}
      draggable={false}
      loading="lazy"
      onError={() => setFailed(true)}
    />
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
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [selfHovered, setSelfHovered] = useState(false)
  const [posterReady, setPosterReady] = useState(false)
  const [liveTimedOut, setLiveTimedOut] = useState(false)
  const hovered = hoveredProp ?? selfHovered
  const inViewport = useInViewport(wrapperRef)
  const windowActive = useWindowActive()

  useEffect(() => {
    if (!alwaysLive) {
      setLiveTimedOut(false)
      return
    }
    setLiveTimedOut(false)
    const timer = setTimeout(() => {
      setLiveTimedOut(true)
    }, 12000)
    return () => clearTimeout(timer)
  }, [alwaysLive, src])

  const playing =
    windowActive && canPlay && (hovered || (alwaysLive && !liveTimedOut)) && inViewport
  // Fully unmount the media element when its host window is inactive. Calling
  // `pause()` alone is not enough for every WebView2 codec path: keeping a
  // sourced video in the DOM can retain its decoder and GPU texture.
  const shouldRenderVideo = windowActive && inViewport
  // Chromium (and the WebView2/WebKit views Tauri uses) suspends a
  // `display: none` video's network loading entirely, so it never
  // reaches `loadeddata` — which is why covers stayed blank until the
  // first hover. Keep the video visible-but-behind-the-canvas (via
  // z-index, not display) until a poster frame has actually been
  // captured, then switch to display:none for real once there's a
  // fallback frame to show underneath it.
  const videoLoading = shouldRenderVideo && !posterReady

  function drawPosterFrame() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || !video.videoWidth) return
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')?.drawImage(video, 0, 0)
    setPosterReady(true)
  }

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    if (playing) {
      el.play().catch(() => {
        // Autoplay can still be rejected in some embedding contexts;
        // the canvas poster stays visible either way, so there's
        // nothing to recover from here.
      })
    } else {
      el.pause()
      el.currentTime = 0
    }
  }, [playing])

  return (
    <div
      ref={wrapperRef}
      className={cn('relative', className)}
      onMouseEnter={() => setSelfHovered(true)}
      onMouseLeave={() => setSelfHovered(false)}
    >
      {/* Static poster underneath, always mounted so there's no flash
          while the video is hidden — and so a disabled/never-played
          Live Cover still shows *something* instead of a blank box. */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 size-full object-cover"
        style={{ zIndex: videoLoading ? 1 : 0 }}
      />
      {shouldRenderVideo && (
        <video
          ref={videoRef}
          src={src}
          className="absolute inset-0 size-full object-cover"
          style={{ display: playing || videoLoading ? 'block' : 'none', zIndex: 0 }}
          loop
          muted
          playsInline
          disablePictureInPicture
          preload="auto"
          onLoadedData={drawPosterFrame}
          onError={onError}
        />
      )}
    </div>
  )
}

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
  const [liveTimedOut, setLiveTimedOut] = useState(false)
  const hovered = hoveredProp ?? selfHovered
  const inViewport = useInViewport(wrapperRef)
  const windowActive = useWindowActive()

  useEffect(() => {
    if (!alwaysLive) {
      setLiveTimedOut(false)
      return
    }
    setLiveTimedOut(false)
    const timer = setTimeout(() => {
      setLiveTimedOut(true)
    }, 12000)
    return () => clearTimeout(timer)
  }, [alwaysLive, src])

  const playing =
    windowActive && canPlay && (hovered || (alwaysLive && !liveTimedOut)) && inViewport
  // An animated image has no pause API. Once its first frame is in the
  // canvas, unmount it until it is actually needed again so it cannot keep
  // decoding in the background.
  const shouldRenderImage = windowActive && inViewport && (!posterReady || playing)
  // Stay visible-but-behind-the-canvas until a poster frame is captured;
  // a `display: none` image could not reliably load its first frame.
  const imgLoading = shouldRenderImage && !posterReady

  function drawPosterFrame() {
    const img = imgRef.current
    const canvas = canvasRef.current
    if (!img || !canvas || !img.naturalWidth) return
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    canvas.getContext('2d')?.drawImage(img, 0, 0)
    setPosterReady(true)
  }

  return (
    <div
      ref={wrapperRef}
      className={cn('relative', className)}
      onMouseEnter={() => setSelfHovered(true)}
      onMouseLeave={() => setSelfHovered(false)}
    >
      {/* Static poster: a canvas snapshot of the first decoded frame.
          Always mounted underneath so there's no flash while the live
          <img> is hidden. */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 size-full object-cover"
        style={{ zIndex: imgLoading ? 1 : 0 }}
      />
      {/* The real animated asset is only mounted to capture its poster or
          while it is live. Unmounting is stronger than hiding it: WebP/GIF
          decoding cannot continue in an inactive window. */}
      {shouldRenderImage && (
        <img
          ref={imgRef}
          src={src}
          alt=""
          draggable={false}
          className="absolute inset-0 size-full object-cover"
          style={{ display: playing || imgLoading ? 'block' : 'none', zIndex: 0 }}
          onLoad={drawPosterFrame}
          onError={onError}
        />
      )}
    </div>
  )
}
