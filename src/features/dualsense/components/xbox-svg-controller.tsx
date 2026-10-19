import React, { useEffect, useRef, useState } from 'react'

export interface XboxVisualState {
  a: boolean
  b: boolean
  x: boolean
  y: boolean
  lb: boolean
  rb: boolean
  lt: number // 0..255
  rt: number // 0..255
  back: boolean // View button
  start: boolean // Menu button
  guide: boolean // Xbox Guide button
  share: boolean // Share button
  ls: boolean
  rs: boolean
  dpadUp: boolean
  dpadDown: boolean
  dpadLeft: boolean
  dpadRight: boolean
  thumbLx: number // -32768..32767
  thumbLy: number // -32768..32767 (positive is Up in XInput)
  thumbRx: number // -32768..32767
  thumbRy: number // -32768..32767 (positive is Up in XInput)
}

interface XboxSvgControllerProps {
  state: XboxVisualState
  isActiveController: boolean
  isConnected?: boolean
  onButtonToggle?: (dsMappedBtn: string, pressed: boolean) => void
  onStickMove?: (stick: 'left' | 'right', dsX: number, dsY: number) => void
}

/**
 * Spring-damped 60fps 2D analog stick interpolator for fluid Xbox thumbstick motion.
 */
function useSmoothXboxStick(targetX: number, targetY: number, isDragging: boolean) {
  const [pos, setPos] = useState({ x: targetX, y: targetY })
  const currentRef = useRef({ x: targetX, y: targetY, vx: 0, vy: 0 })
  const targetRef = useRef({ x: targetX, y: targetY, dragging: isDragging })
  targetRef.current = { x: targetX, y: targetY, dragging: isDragging }

  useEffect(() => {
    let rafId: number | null = null
    let active = true

    const step = () => {
      if (!active) return
      const cur = currentRef.current
      const tgt = targetRef.current
      const dx = tgt.x - cur.x
      const dy = tgt.y - cur.y

      if (Math.abs(dx) < 0.04 && Math.abs(dy) < 0.04 && Math.abs(cur.vx) < 0.04 && Math.abs(cur.vy) < 0.04) {
        cur.x = tgt.x
        cur.y = tgt.y
        cur.vx = 0
        cur.vy = 0
        setPos({ x: tgt.x, y: tgt.y })
        rafId = null
        return
      }

      const stiffness = tgt.dragging ? 0.42 : 0.24
      const damping = tgt.dragging ? 0.52 : 0.68
      cur.vx = (cur.vx + dx * stiffness) * damping
      cur.vy = (cur.vy + dy * stiffness) * damping
      cur.x += cur.vx
      cur.y += cur.vy

      setPos({ x: cur.x, y: cur.y })
      rafId = requestAnimationFrame(step)
    }

    rafId = requestAnimationFrame(step)
    return () => {
      active = false
      if (rafId !== null) cancelAnimationFrame(rafId)
    }
  }, [targetX, targetY, isDragging])

  return pos
}

// Exact Carbon-Black Xbox Series X|S controller silhouette matching the studio reference photo
const XBOX_BODY_SPLINE =
  'M 684.5 29.0 Q 676 26 664.0 34.0 Q 652 42 645.0 45.5 Q 638 49 587.5 49.0 Q 537 49 498.5 49.0 Q 460 49 406.5 49.0 Q 353 49 345.0 45.0 Q 337 41 325.0 33.5 Q 313 26 296.0 26.5 Q 279 27 254.0 34.0 Q 229 41 206.0 52.0 Q 183 63 166.5 76.5 Q 150 90 137.5 117.5 Q 125 145 111.0 180.0 Q 97 215 83.5 253.0 Q 70 291 58.0 330.0 Q 46 369 36.0 409.5 Q 26 450 20.0 489.0 Q 14 528 12.0 562.5 Q 10 597 15.0 625.0 Q 20 653 31.5 676.0 Q 43 699 63.0 712.5 Q 83 726 102.0 726.5 Q 121 727 137.0 714.0 Q 153 701 174.5 670.0 Q 196 639 218.5 604.0 Q 241 569 258.5 543.5 Q 276 518 290.5 510.0 Q 305 502 325.0 502.5 Q 345 503 499.0 503.0 Q 653 503 672.5 502.5 Q 692 502 706.5 510.5 Q 721 519 738.5 544.5 Q 756 570 778.5 605.0 Q 801 640 822.0 670.5 Q 843 701 859.5 714.0 Q 876 727 894.5 726.5 Q 913 726 933.5 712.0 Q 954 698 965.5 674.5 Q 977 651 981.5 622.5 Q 986 594 984.0 558.5 Q 982 523 975.5 483.0 Q 969 443 959.0 402.0 Q 949 361 936.5 321.5 Q 924 282 910.0 243.5 Q 896 205 882.0 170.5 Q 868 136 855.5 110.5 Q 843 85 825.5 72.0 Q 808 59 784.0 48.0 Q 760 37 734.0 31.0 Q 708 25 692.0 32.0 Z'

export const XboxSvgController: React.FC<XboxSvgControllerProps> = ({
  state,
  isActiveController,
  isConnected = true,
  onButtonToggle,
  onStickMove,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [draggingStick, setDraggingStick] = useState<'left' | 'right' | null>(null)

  const BODY_OFFSET_Y = 48

  const rawLxOffset = (state.thumbLx / 32767) * 28
  const rawLyOffset = (-state.thumbLy / 32767) * 28
  const rawRxOffset = (state.thumbRx / 32767) * 28
  const rawRyOffset = (-state.thumbRy / 32767) * 28

  const smoothLeft = useSmoothXboxStick(rawLxOffset, rawLyOffset, draggingStick === 'left')
  const smoothRight = useSmoothXboxStick(rawRxOffset, rawRyOffset, draggingStick === 'right')
  const lxOffset = smoothLeft.x
  const lyOffset = smoothLeft.y
  const rxOffset = smoothRight.x
  const ryOffset = smoothRight.y

  const ltRatio = Math.min(1, Math.max(0, state.lt / 255))
  const rtRatio = Math.min(1, Math.max(0, state.rt / 255))

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!draggingStick || !svgRef.current || !onStickMove) return
    const rect = svgRef.current.getBoundingClientRect()
    const svgX = ((e.clientX - rect.left) / rect.width) * 1000
    const svgY = ((e.clientY - rect.top) / rect.height) * 784 - BODY_OFFSET_Y

    const centerX = draggingStick === 'left' ? 247 : 640
    const centerY = draggingStick === 'left' ? 200 : 351
    const maxRadius = 46
    const rawDx = svgX - centerX
    const rawDy = svgY - centerY
    const dist = Math.hypot(rawDx, rawDy)
    const scale = dist > maxRadius ? maxRadius / dist : 1
    const dx = rawDx * scale
    const dy = rawDy * scale

    const normX = Math.round(128 + (dx / maxRadius) * 127)
    const normY = Math.round(128 + (dy / maxRadius) * 127)
    onStickMove(
      draggingStick,
      Math.max(0, Math.min(255, normX)),
      Math.max(0, Math.min(255, normY)),
    )
  }

  const stopStickDrag = () => {
    if (draggingStick && onStickMove) {
      onStickMove(draggingStick, 128, 128)
    }
    setDraggingStick(null)
  }

  const bindBtn = (dsMappedBtn: string) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.stopPropagation()
      onButtonToggle?.(dsMappedBtn, true)
    },
    onPointerUp: (e: React.PointerEvent) => {
      e.stopPropagation()
      onButtonToggle?.(dsMappedBtn, false)
    },
    onPointerLeave: () => {
      onButtonToggle?.(dsMappedBtn, false)
    },
    style: { cursor: 'pointer' },
  })

  return (
    <div
      className={`relative select-none transition-all duration-500 ${
        !isConnected
          ? 'grayscale saturate-0 opacity-60 contrast-95'
          : isActiveController
            ? 'opacity-100 scale-100 filter-none'
            : 'opacity-45 scale-[0.98] saturate-[0.3] brightness-90'
      }`}
    >
      <svg
        ref={svgRef}
        viewBox="0 0 1000 784"
        className="w-full h-auto max-w-[540px] mx-auto overflow-visible"
        onPointerMove={handlePointerMove}
        onPointerUp={stopStickDrag}
        onPointerLeave={stopStickDrag}
      >
        <defs>
          <radialGradient id="xb-orig-aura" cx="50%" cy="48%" r="50%">
            <stop
              offset="0%"
              stopColor={isConnected && isActiveController ? '#10B981' : '#1e293b'}
              stopOpacity={isConnected && isActiveController ? '0.24' : '0.04'}
            />
            <stop
              offset="58%"
              stopColor="#3B82F6"
              stopOpacity={isConnected && isActiveController ? '0.08' : '0'}
            />
            <stop offset="100%" stopColor="#000000" stopOpacity="0" />
          </radialGradient>

          {/* Original Xbox Series X|S Carbon-Black Fine-Grain Matte Shell Gradient */}
          <linearGradient id="xb-orig-carbon" x1="50%" y1="0%" x2="50%" y2="100%">
            <stop offset="0%" stopColor="#2E3138" />
            <stop offset="28%" stopColor="#23262C" />
            <stop offset="65%" stopColor="#1B1D22" />
            <stop offset="90%" stopColor="#14161A" />
            <stop offset="100%" stopColor="#0E1013" />
          </linearGradient>

          {/* Soft 3D Cylindrical Left/Right Handle Highlights */}
          <radialGradient id="xb-orig-grip-l" cx="26%" cy="42%" r="56%">
            <stop offset="0%" stopColor="#3B3F49" stopOpacity="0.55" />
            <stop offset="65%" stopColor="#1E2026" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#0B0C0E" stopOpacity="0.7" />
          </radialGradient>

          <radialGradient id="xb-orig-grip-r" cx="74%" cy="42%" r="56%">
            <stop offset="0%" stopColor="#3B3F49" stopOpacity="0.55" />
            <stop offset="65%" stopColor="#1E2026" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#0B0C0E" stopOpacity="0.7" />
          </radialGradient>

          {/* Top Bumper & Trigger Gradients */}
          <linearGradient id="xb-orig-crown" x1="50%" y1="0%" x2="50%" y2="100%">
            <stop offset="0%" stopColor="#343842" />
            <stop offset="50%" stopColor="#23262D" />
            <stop offset="100%" stopColor="#181A20" />
          </linearGradient>

          <linearGradient id="xb-trigger-grad" x1="50%" y1="0%" x2="50%" y2="100%">
            <stop offset="0%" stopColor="#2C3038" />
            <stop offset="50%" stopColor="#1C1E24" />
            <stop offset="100%" stopColor="#101216" />
          </linearGradient>

          {/* 3D Glossy Polycarbonate Carbon-Black ABXY Dome Cap (Matches photo's dark glossy buttons) */}
          <radialGradient id="xb-orig-abxy" cx="35%" cy="28%" r="70%">
            <stop offset="0%" stopColor="#3D414C" />
            <stop offset="40%" stopColor="#181A20" />
            <stop offset="82%" stopColor="#0B0C0F" />
            <stop offset="100%" stopColor="#050608" />
          </radialGradient>

          {/* 3D Spherical Xbox Guide Jewel */}
          <radialGradient id="xb-orig-guide" cx="38%" cy="30%" r="68%">
            <stop offset="0%" stopColor="#383C46" />
            <stop offset="55%" stopColor="#191B20" />
            <stop offset="100%" stopColor="#0B0C0F" />
          </radialGradient>

          {/* 3D Gimbal Socket Well */}
          <radialGradient id="xb-orig-gimbal" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#060709" />
            <stop offset="65%" stopColor="#0F1116" />
            <stop offset="88%" stopColor="#1B1E26" />
            <stop offset="100%" stopColor="#282C36" />
          </radialGradient>

          {/* 3D Rubber Thumbstick Dome & Concave Dish */}
          <radialGradient id="xb-orig-stick-dome" cx="36%" cy="32%" r="68%">
            <stop offset="0%" stopColor="#3F434E" />
            <stop offset="45%" stopColor="#24272E" />
            <stop offset="82%" stopColor="#14161B" />
            <stop offset="100%" stopColor="#0A0B0E" />
          </radialGradient>

          <radialGradient id="xb-orig-stick-dish" cx="62%" cy="65%" r="65%">
            <stop offset="0%" stopColor="#333742" />
            <stop offset="55%" stopColor="#1B1D24" />
            <stop offset="100%" stopColor="#0F1115" />
          </radialGradient>

          {/* Faceted Hybrid D-Pad Metallic Dish Gradients */}
          <linearGradient id="xb-orig-dpad-dish" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#272A32" />
            <stop offset="50%" stopColor="#16181D" />
            <stop offset="100%" stopColor="#0B0C0F" />
          </linearGradient>

          <linearGradient id="xb-orig-dpad-arm" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#30343E" />
            <stop offset="55%" stopColor="#1E2027" />
            <stop offset="100%" stopColor="#121419" />
          </linearGradient>

          <filter id="xb-orig-shadow" x="-15%" y="-15%" width="130%" height="135%">
            <feDropShadow dx="0" dy="20" stdDeviation="16" floodColor="#000000" floodOpacity="0.56" />
          </filter>

          <filter id="xb-orig-stick-shadow" x="-35%" y="-35%" width="170%" height="170%">
            <feDropShadow dx="0" dy="9" stdDeviation="6" floodColor="#000000" floodOpacity="0.7" />
          </filter>

          <filter id="xb-orig-btn-shadow" x="-25%" y="-25%" width="150%" height="150%">
            <feDropShadow dx="0" dy="3" stdDeviation="2.2" floodColor="#000000" floodOpacity="0.58" />
          </filter>

          <filter id="xb-orig-glow" x="-45%" y="-45%" width="190%" height="190%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Studio Aura */}
        <ellipse cx="500" cy="410" rx="440" ry="290" fill="url(#xb-orig-aura)" />

        {/* ==================== UNIFIED CHASSIS GROUP ==================== */}
        <g transform={`translate(0, ${BODY_OFFSET_Y})`}>
          {/* 1. EXACT STUDIO-PHOTO LOW-PROFILE LB/RB & LT/RT SHOULDERS (No text labels, no progress bars, no double-hump overhang!) */}
          <g transform={`translate(0, ${(state.lb ? 3 : 0) + ltRatio * 4})`} {...bindBtn('l1')}>
            <path
              d="M 176 68
                 C 202 38, 256 20, 308 22
                 C 324 22, 336 28, 344 42
                 L 344 64 L 174 74 Z"
              fill={state.lb || state.lt > 10 ? '#10B981' : 'url(#xb-orig-crown)'}
            />
          </g>

          <g transform={`translate(0, ${(state.rb ? 3 : 0) + rtRatio * 4})`} {...bindBtn('r1')}>
            <path
              d="M 824 68
                 C 798 38, 744 20, 692 22
                 C 676 22, 664 28, 656 42
                 L 656 64 L 826 74 Z"
              fill={state.rb || state.rt > 10 ? '#10B981' : 'url(#xb-orig-crown)'}
            />
          </g>

          <g filter="url(#xb-orig-shadow)">
            {/* 2. Main Carbon-Black Sculpted Body */}
            <path
              d={XBOX_BODY_SPLINE}
              fill="url(#xb-orig-carbon)"
              stroke="#2C303A"
              strokeWidth="1.8"
            />

            {/* Left & Right 3D Cylindrical Handle Volume Highlights */}
            <path
              d="M 158 84
                 C 190 120, 220 220, 210 340
                 C 200 440, 268 518, 308 505
                 C 268 518, 236 575, 196 638
                 C 158 698, 126 726, 96 720
                 C 52 708, 22 655, 18 585
                 C 14 510, 34 405, 64 295
                 C 94 185, 124 112, 158 84 Z"
              fill="url(#xb-orig-grip-l)"
            />
            <path
              d="M 842 84
                 C 810 120, 780 220, 790 340
                 C 800 440, 732 518, 692 505
                 C 732 518, 764 575, 804 638
                 C 842 698, 874 726, 904 720
                 C 948 708, 978 655, 982 585
                 C 986 510, 966 405, 936 295
                 C 906 185, 876 112, 842 84 Z"
              fill="url(#xb-orig-grip-r)"
            />

            {/* Authentic Xbox Series X|S Sculpted Top Crown Surround */}
            <path
              d="M 296 27
                 Q 325 33, 345 45
                 Q 420 49, 500 49
                 Q 580 49, 655 45
                 Q 675 33, 704 27
                 C 672 88, 616 130, 500 130
                 C 384 130, 328 88, 296 27 Z"
              fill="url(#xb-orig-crown)"
              opacity="0.55"
            />

            {/* Authentic Side Grip Panel Seam Lines (Visible on the lower handles in the reference photo) */}
            <path
              d="M 160 82 C 188 168, 206 286, 196 412 C 190 488, 162 598, 128 716"
              fill="none"
              stroke="#101216"
              strokeWidth="2"
              opacity="0.75"
            />
            <path
              d="M 840 82 C 812 168, 794 286, 804 412 C 810 488, 838 598, 872 716"
              fill="none"
              stroke="#101216"
              strokeWidth="2"
              opacity="0.75"
            />

            {/* Bottom Expansion Port Step */}
            <path d="M 436 502 L 564 502 L 556 508 L 444 508 Z" fill="#0B0C0F" />
          </g>

          {/* ==================== 3D SPHERICAL XBOX NEXUS GUIDE BUTTON (500, 108) ==================== */}
          <g
            transform={`translate(500, 108) scale(${state.guide ? 0.91 : 1})`}
            {...bindBtn('ps')}
            filter="url(#xb-orig-btn-shadow)"
          >
            <circle cx="0" cy="0" r="36" fill="#0A0B0E" stroke="#282C36" strokeWidth="1.6" />
            <circle
              cx="0"
              cy="0"
              r="32"
              fill={state.guide ? '#10B981' : 'url(#xb-orig-guide)'}
              stroke={state.guide ? '#FFFFFF' : '#323642'}
              strokeWidth="1.8"
            />
            <path
              d="M -19 -19 C -6 -7, 6 -7, 19 -19 M -21 18 C -7 2.5, 7 2.5, 21 18"
              stroke={
                state.guide
                  ? '#042F2E'
                  : isConnected && isActiveController
                    ? '#D1D5DB'
                    : '#64748B'
              }
              strokeWidth="4.6"
              strokeLinecap="round"
              fill="none"
            />
          </g>

          {/* ==================== VIEW, MENU & SHARE SYSTEM BUTTONS ==================== */}
          {/* View Button (426, 206) */}
          <g
            transform={`translate(426, 206) scale(${state.back ? 0.9 : 1})`}
            {...bindBtn('create')}
            filter="url(#xb-orig-btn-shadow)"
          >
            <circle cx="0" cy="0" r="20" fill="#0D0F13" stroke="#2A2E38" strokeWidth="1.4" />
            <circle
              cx="0"
              cy="0"
              r="16.5"
              fill={state.back ? '#10B981' : 'url(#xb-orig-abxy)'}
              stroke={state.back ? '#FFFFFF' : '#383C48'}
              strokeWidth="1.5"
            />
            <path
              d="M -6 -1 V -6 H 1 V -3.5 M -2.5 -2.5 H 6 V 6 H -2.5 Z"
              fill="none"
              stroke="#CBD5E1"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </g>

          {/* Menu Button (574, 206) */}
          <g
            transform={`translate(574, 206) scale(${state.start ? 0.9 : 1})`}
            {...bindBtn('options')}
            filter="url(#xb-orig-btn-shadow)"
          >
            <circle cx="0" cy="0" r="20" fill="#0D0F13" stroke="#2A2E38" strokeWidth="1.4" />
            <circle
              cx="0"
              cy="0"
              r="16.5"
              fill={state.start ? '#10B981' : 'url(#xb-orig-abxy)'}
              stroke={state.start ? '#FFFFFF' : '#383C48'}
              strokeWidth="1.5"
            />
            <path
              d="M -6 -4.5 H 6 M -6 0 H 6 M -6 4.5 H 6"
              stroke="#CBD5E1"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </g>

          {/* Share Pill Button (500, 256) */}
          <g
            transform={`translate(500, 256) scale(${state.share ? 0.9 : 1})`}
            {...bindBtn('mute')}
            filter="url(#xb-orig-btn-shadow)"
          >
            <rect x="-23" y="-12.5" width="46" height="25" rx="12.5" fill="#0D0F13" stroke="#2A2E38" strokeWidth="1.4" />
            <rect
              x="-19"
              y="-9.5"
              width="38"
              height="19"
              rx="9.5"
              fill={state.share ? '#10B981' : 'url(#xb-orig-abxy)'}
              stroke={state.share ? '#FFFFFF' : '#383C48'}
              strokeWidth="1.5"
            />
            <path
              d="M -6 1.5 V 4.5 H 6 V 1.5 M 0 2.5 V -4.5 M -3 -1.5 L 0 -4.5 L 3 -1.5"
              fill="none"
              stroke="#CBD5E1"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>

          {/* ==================== 3D FACETED 8-WAY CIRCULAR HYBRID D-PAD (370, 362) ==================== */}
          <g transform="translate(370, 362)" filter="url(#xb-orig-btn-shadow)">
            <circle cx="0" cy="0" r="76" fill="#0B0D11" stroke="#282C36" strokeWidth="2.2" />
            <circle cx="0" cy="0" r="70" fill="url(#xb-orig-dpad-dish)" stroke="#1C1F26" strokeWidth="1.5" />

            {/* 4 Sculpted Diagonal Facet Planes */}
            <polygon points="-22,-22 -64,-22 -22,-64" fill="#171920" stroke="#262A34" strokeWidth="1" />
            <polygon points="22,-22 64,-22 22,-64" fill="#1F222B" stroke="#262A34" strokeWidth="1" />
            <polygon points="-22,22 -64,22 -22,64" fill="#12141A" stroke="#262A34" strokeWidth="1" />
            <polygon points="22,22 64,22 22,64" fill="#181A22" stroke="#262A34" strokeWidth="1" />

            {/* UP */}
            <g {...bindBtn('dpadUp')}>
              <path
                d="M -22 -66 C -10 -70, 10 -70, 22 -66 L 22 -22 L -22 -22 Z"
                fill={state.dpadUp ? '#10B981' : 'url(#xb-orig-dpad-arm)'}
                stroke={state.dpadUp ? '#FFFFFF' : '#323744'}
                strokeWidth="1.6"
              />
            </g>
            {/* DOWN */}
            <g {...bindBtn('dpadDown')}>
              <path
                d="M -22 66 C -10 70, 10 70, 22 66 L 22 22 L -22 22 Z"
                fill={state.dpadDown ? '#10B981' : 'url(#xb-orig-dpad-arm)'}
                stroke={state.dpadDown ? '#FFFFFF' : '#323744'}
                strokeWidth="1.6"
              />
            </g>
            {/* LEFT */}
            <g {...bindBtn('dpadLeft')}>
              <path
                d="M -66 -22 C -70 -10, -70 10, -66 22 L -22 22 L -22 -22 Z"
                fill={state.dpadLeft ? '#10B981' : 'url(#xb-orig-dpad-arm)'}
                stroke={state.dpadLeft ? '#FFFFFF' : '#323744'}
                strokeWidth="1.6"
              />
            </g>
            {/* RIGHT */}
            <g {...bindBtn('dpadRight')}>
              <path
                d="M 66 -22 C 70 -10, 70 10, 66 22 L 22 22 L 22 -22 Z"
                fill={state.dpadRight ? '#10B981' : 'url(#xb-orig-dpad-arm)'}
                stroke={state.dpadRight ? '#FFFFFF' : '#323744'}
                strokeWidth="1.6"
              />
            </g>

            {/* Concave Center Facet */}
            <rect x="-22" y="-22" width="44" height="44" rx="4" fill="#181A21" stroke="#282C36" strokeWidth="1.2" />
          </g>

          {/* ==================== 3D GLOSSY CARBON-BLACK ABXY DOME BUTTONS ==================== */}
          {[
            { key: 'triangle', label: 'Y', cx: 760, cy: 144, active: state.y, color: '#F59E0B', textCol: '#94A3B8' },
            { key: 'circle', label: 'B', cx: 826, cy: 206, active: state.b, color: '#EF4444', textCol: '#94A3B8' },
            { key: 'cross', label: 'A', cx: 760, cy: 268, active: state.a, color: '#10B981', textCol: '#94A3B8' },
            { key: 'square', label: 'X', cx: 694, cy: 206, active: state.x, color: '#3B82F6', textCol: '#94A3B8' },
          ].map((b) => (
            <g
              key={b.label}
              transform={`translate(${b.cx}, ${b.cy}) scale(${b.active ? 0.9 : 1})`}
              {...bindBtn(b.key)}
              filter={b.active ? 'url(#xb-orig-glow)' : 'url(#xb-orig-btn-shadow)'}
            >
              <circle cx="0" cy="0" r="34" fill="#090A0D" stroke="#262A34" strokeWidth="1.5" />
              <circle
                cx="0"
                cy="0"
                r="30"
                fill={b.active ? b.color : 'url(#xb-orig-abxy)'}
                stroke={b.active ? '#FFFFFF' : '#363B48'}
                strokeWidth="1.8"
              />
              <path
                d="M -19 -13 A 23 23 0 0 1 17 -16"
                fill="none"
                stroke="#FFFFFF"
                strokeWidth="1.8"
                strokeLinecap="round"
                opacity="0.38"
              />
              <text
                x="0"
                y="10"
                textAnchor="middle"
                className="font-sans text-[28px] font-black"
                fill={b.active ? '#FFFFFF' : b.textCol}
              >
                {b.label}
              </text>
            </g>
          ))}

          {/* ==================== ULTRA-SMOOTH SPRING-PHYSICS ANALOG THUMBSTICKS (LS & RS) ==================== */}
          {/* LEFT STICK (LS at 247, 200) */}
          <g transform="translate(247, 200)">
            <circle cx="0" cy="0" r="68" fill="#181A20" stroke="#2E323D" strokeWidth="2" />
            <circle cx="0" cy="0" r="60" fill="url(#xb-orig-gimbal)" stroke="#07080B" strokeWidth="2.2" />
            <line
              x1="0"
              y1="0"
              x2={lxOffset * 0.7}
              y2={lyOffset * 0.7}
              stroke="#1E293B"
              strokeWidth="18"
              strokeLinecap="round"
            />
            <circle
              cx={lxOffset * 0.62}
              cy={lyOffset * 0.62 + 6}
              r="38"
              fill="#000000"
              opacity="0.68"
            />

            <g
              transform={`translate(${lxOffset.toFixed(2)}, ${lyOffset.toFixed(2)}) scale(${state.ls ? 0.92 : 1})`}
              onPointerDown={(e) => {
                e.stopPropagation()
                e.currentTarget.setPointerCapture(e.pointerId)
                setDraggingStick('left')
              }}
              onDoubleClick={() => onButtonToggle?.('l3', !state.ls)}
              style={{ cursor: draggingStick === 'left' ? 'grabbing' : 'grab' }}
              filter="url(#xb-orig-stick-shadow)"
            >
              <circle
                cx="0"
                cy="0"
                r="51"
                fill="url(#xb-orig-stick-dome)"
                stroke={
                  state.ls || Math.hypot(lxOffset, lyOffset) > 2.2
                    ? '#10B981'
                    : '#323642'
                }
                strokeWidth="2.2"
              />
              <circle
                cx="0"
                cy="0"
                r="42"
                fill="none"
                stroke="#475569"
                strokeWidth="5.5"
                strokeDasharray="3.2 2.4"
                opacity="0.72"
              />
              <circle
                cx={-lxOffset * 0.08}
                cy={-lyOffset * 0.08}
                r="32"
                fill="url(#xb-orig-stick-dish)"
                stroke="#16181F"
                strokeWidth="2"
              />
              <path
                d="M -22 -16 A 28 28 0 0 1 20 -18"
                fill="none"
                stroke="#64748B"
                strokeWidth="1.4"
                opacity="0.4"
              />
            </g>
          </g>

          {/* RIGHT STICK (RS at 640, 351) */}
          <g transform="translate(640, 351)">
            <circle cx="0" cy="0" r="68" fill="#181A20" stroke="#2E323D" strokeWidth="2" />
            <circle cx="0" cy="0" r="60" fill="url(#xb-orig-gimbal)" stroke="#07080B" strokeWidth="2.2" />
            <line
              x1="0"
              y1="0"
              x2={rxOffset * 0.7}
              y2={ryOffset * 0.7}
              stroke="#1E293B"
              strokeWidth="18"
              strokeLinecap="round"
            />
            <circle
              cx={rxOffset * 0.62}
              cy={ryOffset * 0.62 + 6}
              r="38"
              fill="#000000"
              opacity="0.68"
            />

            <g
              transform={`translate(${rxOffset.toFixed(2)}, ${ryOffset.toFixed(2)}) scale(${state.rs ? 0.92 : 1})`}
              onPointerDown={(e) => {
                e.stopPropagation()
                e.currentTarget.setPointerCapture(e.pointerId)
                setDraggingStick('right')
              }}
              onDoubleClick={() => onButtonToggle?.('r3', !state.rs)}
              style={{ cursor: draggingStick === 'right' ? 'grabbing' : 'grab' }}
              filter="url(#xb-orig-stick-shadow)"
            >
              <circle
                cx="0"
                cy="0"
                r="51"
                fill="url(#xb-orig-stick-dome)"
                stroke={
                  state.rs || Math.hypot(rxOffset, ryOffset) > 2.2
                    ? '#10B981'
                    : '#323642'
                }
                strokeWidth="2.2"
              />
              <circle
                cx="0"
                cy="0"
                r="42"
                fill="none"
                stroke="#475569"
                strokeWidth="5.5"
                strokeDasharray="3.2 2.4"
                opacity="0.72"
              />
              <circle
                cx={-rxOffset * 0.08}
                cy={-ryOffset * 0.08}
                r="32"
                fill="url(#xb-orig-stick-dish)"
                stroke="#16181F"
                strokeWidth="2"
              />
              <path
                d="M -22 -16 A 28 28 0 0 1 20 -18"
                fill="none"
                stroke="#64748B"
                strokeWidth="1.4"
                opacity="0.4"
              />
            </g>
          </g>
        </g>
      </svg>
    </div>
  )
}
