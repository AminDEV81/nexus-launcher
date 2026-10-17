import React, { useEffect, useRef, useState } from 'react'

export interface DualSenseVisualState {
  cross: boolean
  circle: boolean
  square: boolean
  triangle: boolean
  l1: boolean
  r1: boolean
  l2: number // 0..255
  r2: number // 0..255
  create: boolean
  options: boolean
  l3: boolean
  r3: boolean
  ps: boolean
  touchpadClick: boolean
  mute: boolean
  dpadUp: boolean
  dpadDown: boolean
  dpadLeft: boolean
  dpadRight: boolean
  lx: number // 0..255 (128 center)
  ly: number // 0..255 (128 center)
  rx: number // 0..255 (128 center)
  ry: number // 0..255 (128 center)
  touch1Active?: boolean
  touch1X?: number // 0..1920
  touch1Y?: number // 0..1080
  mouseLeftClick?: boolean
  mouseRightClick?: boolean
  touchpadMouseEnabled?: boolean
  emulationActive?: boolean
  playerLedMask?: number
  lightbarR?: number
  lightbarG?: number
  lightbarB?: number
}

interface DualSenseSvgControllerProps {
  state: DualSenseVisualState
  isActiveController: boolean
  isConnected?: boolean
  onButtonToggle?: (btn: string, pressed: boolean) => void
  onStickMove?: (stick: 'left' | 'right', x: number, y: number) => void
  onTouchpadInput?: (
    active: boolean,
    x: number,
    y: number,
    clicked: boolean,
  ) => void
}

/**
 * Spring-damped 60fps 2D analog stick interpolator so thumbstick motion
 * is silky-smooth both from hardware HID polling and mouse drag.
 */
function useSmoothAnalogStick(targetX: number, targetY: number, isDragging: boolean) {
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

      if (
        Math.abs(dx) < 0.04 &&
        Math.abs(dy) < 0.04 &&
        Math.abs(cur.vx) < 0.04 &&
        Math.abs(cur.vy) < 0.04
      ) {
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

/**
 * 1:1 Studio-Photo-Calibrated Front-Elevation Silhouette of the Sony PS5 DualSense Controller (1000 x 720 space).
 * Directly traced from the 2K reference studio photograph (`PlayStation_and_Xbox_controllers_2K.jpg`):
 * - Top touchpad crown: (307, 40) to (693, 40)
 * - Sculpted white shoulder arches: (143, 60) and (857, 60)
 * - Outer handle curve sweeping through (99, 129) -> (62, 232) -> (38, 351) -> (26, 488) -> (34, 591) -> (64, 668)
 * - Rounded two-tone grip tip at (102, 682) -> (148, 668)
 * - Inner handle arch rising through (215, 574) -> (238, 506) -> (257, 454) to the flat lower bridge (304, 440) .. (696, 440)
 */
const PS5_OUTER_CHASSIS_PATH = `
  M 307 40
  C 370 36, 435 35, 500 35
  C 565 35, 630 36, 693 40
  C 748 28, 816 36, 857 60
  C 886 80, 906 118, 922 178
  C 942 252, 962 346, 971 437
  C 976 498, 974 556, 966 596
  C 956 642, 936 672, 898 682
  C 876 686, 856 676, 840 648
  C 812 598, 784 542, 762 496
  C 744 458, 726 440, 696 440
  L 304 440
  C 274 440, 256 458, 238 496
  C 216 542, 188 598, 160 648
  C 144 676, 124 686, 102 682
  C 64 672, 44 642, 34 596
  C 26 556, 24 498, 29 437
  C 38 346, 58 252, 78 178
  C 94 118, 114 80, 143 60
  C 184 36, 252 28, 307 40
  Z
`

/**
 * 1:1 Studio-Photo-Calibrated Left Ceramic-White Wing Faceplate Path.
 * Follows the exact two-tone seam measured from the 2K reference photograph:
 * - Starts at top-left touchpad groove (306, 36)
 * - Runs down the angled touchpad left edge to (346, 214)
 * - Wraps smoothly around the upper-left arch of the Left Stick dome:
 *   (300, 231) -> (268, 266) -> (244, 300) -> (232, 317)
 * - From the outer tangent (232, 317), flows in one continuous, uninterrupted curve down-left
 *   through (198, 385) -> (165, 454) -> (141, 523) -> (126, 574) right to the bottom tip (102, 684).
 */
const PS5_LEFT_WHITE_WING_PATH = `
  M 0 0
  L 306 0
  L 306 40
  C 314 102, 328 164, 346 214
  C 348 221, 343 226, 332 228
  C 292 234, 254 264, 232 317
  C 212 364, 186 414, 165 454
  C 146 492, 132 544, 120 598
  C 111 638, 105 664, 102 690
  L 0 690
  Z
`

/**
 * 1:1 Studio-Photo-Calibrated Right Ceramic-White Wing Faceplate Path (exact mirror around X = 500).
 */
const PS5_RIGHT_WHITE_WING_PATH = `
  M 1000 0
  L 694 0
  L 694 40
  C 686 102, 672 164, 654 214
  C 652 221, 657 226, 668 228
  C 708 234, 746 264, 768 317
  C 788 364, 814 414, 835 454
  C 854 492, 868 544, 880 598
  C 889 638, 895 664, 898 690
  L 1000 690
  Z
`

export const DualSenseSvgController: React.FC<DualSenseSvgControllerProps> = ({
  state,
  isActiveController,
  isConnected = true,
  onButtonToggle,
  onStickMove,
  onTouchpadInput,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [draggingStick, setDraggingStick] = useState<'left' | 'right' | null>(null)
  const [touchDragging, setTouchDragging] = useState(false)
  const [touchClicked, setTouchClicked] = useState(false)

  const BODY_OFFSET_Y = 48

  const rawLxOffset = ((state.lx - 128) / 127) * 26
  const rawLyOffset = ((state.ly - 128) / 127) * 26
  const rawRxOffset = ((state.rx - 128) / 127) * 26
  const rawRyOffset = ((state.ry - 128) / 127) * 26

  const smoothLeft = useSmoothAnalogStick(rawLxOffset, rawLyOffset, draggingStick === 'left')
  const smoothRight = useSmoothAnalogStick(rawRxOffset, rawRyOffset, draggingStick === 'right')
  const lxOffset = smoothLeft.x
  const lyOffset = smoothLeft.y
  const rxOffset = smoothRight.x
  const ryOffset = smoothRight.y

  const l2Ratio = Math.min(1, Math.max(0, state.l2 / 255))
  const r2Ratio = Math.min(1, Math.max(0, state.r2 / 255))

  const lbR = state.lightbarR ?? 0
  const lbG = state.lightbarG ?? 112
  const lbB = state.lightbarB ?? 255
  const lightbarColor = isConnected ? `rgb(${lbR}, ${lbG}, ${lbB})` : '#64748B'

  const isMouseModeActive = Boolean(
    isConnected && state.emulationActive && (state.touchpadMouseEnabled ?? true),
  )

  const toBodyCoords = (e: React.PointerEvent) => {
    if (!svgRef.current) return { x: 500, y: 370 }
    const rect = svgRef.current.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * 1000,
      y: ((e.clientY - rect.top) / rect.height) * 784 - BODY_OFFSET_Y,
    }
  }

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (draggingStick && onStickMove) {
      const { x: svgX, y: svgY } = toBodyCoords(e)
      const centerX = draggingStick === 'left' ? 334 : 666
      const centerY = 314
      const maxRadius = 44
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
    } else if (touchDragging && onTouchpadInput) {
      const { x: svgX, y: svgY } = toBodyCoords(e)
      const normTx = Math.round(
        Math.max(0, Math.min(1, (svgX - 335) / (665 - 335))) * 1920,
      )
      const normTy = Math.round(
        Math.max(0, Math.min(1, (svgY - 40) / (218 - 40))) * 1080,
      )
      onTouchpadInput(true, normTx, normTy, touchClicked)
    }
  }

  const stopAllDrags = () => {
    if (draggingStick && onStickMove) {
      onStickMove(draggingStick, 128, 128)
    }
    if (touchDragging && onTouchpadInput) {
      onTouchpadInput(false, 960, 540, false)
    }
    setDraggingStick(null)
    setTouchDragging(false)
    setTouchClicked(false)
  }

  const bindBtn = (name: string) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.stopPropagation()
      onButtonToggle?.(name, true)
    },
    onPointerUp: (e: React.PointerEvent) => {
      e.stopPropagation()
      onButtonToggle?.(name, false)
    },
    onPointerLeave: () => {
      onButtonToggle?.(name, false)
    },
    style: { cursor: 'pointer' },
  })

  const tpSvgX = 335 + ((state.touch1X ?? 960) / 1920) * (665 - 335)
  const tpSvgY = 40 + ((state.touch1Y ?? 540) / 1080) * (218 - 40)
  const playerMask = state.playerLedMask ?? 0x04

  return (
    <div
      className={`relative select-none transition-all duration-500 ${
        !isConnected
          ? 'grayscale saturate-0 opacity-60 contrast-95'
          : isActiveController
            ? 'opacity-100 scale-100 filter-none'
            : 'opacity-45 scale-[0.98] saturate-[0.35] brightness-90'
      }`}
    >
      <svg
        ref={svgRef}
        viewBox="0 0 1000 784"
        className="w-full h-auto max-w-[540px] mx-auto overflow-visible"
        onPointerMove={handlePointerMove}
        onPointerUp={stopAllDrags}
        onPointerLeave={stopAllDrags}
      >
        <defs>
          <clipPath id="ds-chassis-master-clip">
            <path d={PS5_OUTER_CHASSIS_PATH} />
          </clipPath>

          <radialGradient id="ds-orig-aura" cx="50%" cy="48%" r="50%">
            <stop
              offset="0%"
              stopColor={lightbarColor}
              stopOpacity={isConnected && isActiveController ? '0.22' : '0.04'}
            />
            <stop
              offset="62%"
              stopColor={lightbarColor}
              stopOpacity={isConnected && isActiveController ? '0.06' : '0.01'}
            />
            <stop offset="100%" stopColor="#000000" stopOpacity="0" />
          </radialGradient>

          {/* Sony PS5 Ceramic Matte-White Wing Shell Gradient */}
          <linearGradient id="ds-ceramic-white" x1="50%" y1="0%" x2="50%" y2="100%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="35%" stopColor="#F8FAFC" />
            <stop offset="72%" stopColor="#EEF2F6" />
            <stop offset="92%" stopColor="#E2E8F0" />
            <stop offset="100%" stopColor="#CBD5E1" />
          </linearGradient>

          {/* Subtle 3D contoured studio lighting on left & right white wings */}
          <radialGradient id="ds-wing-shade-l" cx="24%" cy="30%" r="68%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.95" />
            <stop offset="62%" stopColor="#F1F5F9" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#CBD5E1" stopOpacity="0.52" />
          </radialGradient>

          <radialGradient id="ds-wing-shade-r" cx="76%" cy="30%" r="68%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.95" />
            <stop offset="62%" stopColor="#F1F5F9" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#CBD5E1" stopOpacity="0.52" />
          </radialGradient>

          {/* Authentic PS5 Deep Matte-Charcoal/Black Central Core & Inner Grips */}
          <linearGradient id="ds-matte-black-core" x1="50%" y1="0%" x2="50%" y2="100%">
            <stop offset="0%" stopColor="#2A2D37" />
            <stop offset="28%" stopColor="#1F222A" />
            <stop offset="68%" stopColor="#15171E" />
            <stop offset="100%" stopColor="#0C0E13" />
          </linearGradient>

          {/* Low-Profile Sculpted Shoulder Bumper Gradient */}
          <linearGradient id="ds-trigger-grad" x1="50%" y1="0%" x2="50%" y2="100%">
            <stop offset="0%" stopColor="#262934" />
            <stop offset="55%" stopColor="#171920" />
            <stop offset="100%" stopColor="#0E1015" />
          </linearGradient>

          {/* Sculpted Matte-White Touchpad Surface */}
          <linearGradient id="ds-orig-touchpad" x1="50%" y1="0%" x2="50%" y2="100%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="70%" stopColor="#F6F8FC" />
            <stop offset="100%" stopColor="#E8EEF6" />
          </linearGradient>

          {/* 3D Translucent Polycarbonate Crystal Button Cap */}
          <radialGradient id="ds-orig-crystal" cx="38%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="58%" stopColor="#F1F5F9" />
            <stop offset="86%" stopColor="#DCE4EE" />
            <stop offset="100%" stopColor="#B8C4D4" />
          </radialGradient>

          {/* 3D Gimbal Socket Well */}
          <radialGradient id="ds-orig-gimbal" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#08090C" />
            <stop offset="65%" stopColor="#12141C" />
            <stop offset="88%" stopColor="#1D202B" />
            <stop offset="100%" stopColor="#2A2E3D" />
          </radialGradient>

          {/* 3D Rubber Thumbstick Outer Dome */}
          <radialGradient id="ds-orig-stick-dome" cx="36%" cy="32%" r="68%">
            <stop offset="0%" stopColor="#3F4454" />
            <stop offset="45%" stopColor="#262934" />
            <stop offset="82%" stopColor="#171920" />
            <stop offset="100%" stopColor="#0E1015" />
          </radialGradient>

          {/* 3D Concave Inner Thumb Dish */}
          <radialGradient id="ds-orig-stick-dish" cx="62%" cy="64%" r="65%">
            <stop offset="0%" stopColor="#343946" />
            <stop offset="55%" stopColor="#1E212A" />
            <stop offset="100%" stopColor="#13151C" />
          </radialGradient>

          <filter id="ds-orig-shadow" x="-15%" y="-15%" width="130%" height="135%">
            <feDropShadow dx="0" dy="20" stdDeviation="16" floodColor="#000000" floodOpacity="0.48" />
          </filter>

          <filter id="ds-orig-stick-shadow" x="-35%" y="-35%" width="170%" height="170%">
            <feDropShadow dx="0" dy="8" stdDeviation="5.5" floodColor="#000000" floodOpacity="0.65" />
          </filter>

          <filter id="ds-orig-btn-shadow" x="-25%" y="-25%" width="150%" height="150%">
            <feDropShadow dx="0" dy="2" stdDeviation="1.8" floodColor="#475569" floodOpacity="0.28" />
          </filter>

          <filter id="ds-orig-bloom" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="5" result="b6" />
            <feGaussianBlur stdDeviation="2" result="b2" />
            <feMerge>
              <feMergeNode in="b6" />
              <feMergeNode in="b2" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Ambient Studio Aura */}
        <ellipse cx="500" cy="410" rx="430" ry="280" fill="url(#ds-orig-aura)" />

        {/* ==================== UNIFIED CHASSIS GROUP ==================== */}
        <g transform={`translate(0, ${BODY_OFFSET_Y})`}>
          {/* 1. EXACT STUDIO-PHOTO LOW-PROFILE L1 / R1 SHOULDER CRESCENTS
              Tucked cleanly behind the white shoulder arch (x=161..276 and x=724..839),
              with ZERO L2/R2 progress bars, ZERO protruding double-humps, and ZERO diagonal black lines! */}
          <g
            transform={`translate(0, ${(state.l1 ? 3 : 0) + l2Ratio * 4})`}
            {...bindBtn('l1')}
          >
            <path
              d="M 161 52
                 C 184 29, 228 24, 268 30
                 C 276 32, 282 36, 286 44
                 L 286 64 L 158 64 Z"
              fill={state.l1 || state.l2 > 10 ? lightbarColor : 'url(#ds-trigger-grad)'}
            />
          </g>

          <g
            transform={`translate(0, ${(state.r1 ? 3 : 0) + r2Ratio * 4})`}
            {...bindBtn('r1')}
          >
            <path
              d="M 839 52
                 C 816 29, 772 24, 732 30
                 C 724 32, 718 36, 714 44
                 L 714 64 L 842 64 Z"
              fill={state.r1 || state.r2 > 10 ? lightbarColor : 'url(#ds-trigger-grad)'}
            />
          </g>

          {/* 2. MAIN SCULPTED CHASSIS (Matte-Black Base Core + Strictly Clipped Ceramic-White Left/Right Wing Plates) */}
          <g filter="url(#ds-orig-shadow)">
            {/* Base Full Silhouette in Deep Matte Charcoal-Black */}
            <path d={PS5_OUTER_CHASSIS_PATH} fill="url(#ds-matte-black-core)" />

            {/* Strictly Clipped Ceramic-White Left & Right Wing Faceplates */}
            <g clipPath="url(#ds-chassis-master-clip)">
              {/* Left White Wing */}
              <path d={PS5_LEFT_WHITE_WING_PATH} fill="url(#ds-ceramic-white)" />
              <path d={PS5_LEFT_WHITE_WING_PATH} fill="url(#ds-wing-shade-l)" />

              {/* Right White Wing */}
              <path d={PS5_RIGHT_WHITE_WING_PATH} fill="url(#ds-ceramic-white)" />
              <path d={PS5_RIGHT_WHITE_WING_PATH} fill="url(#ds-wing-shade-r)" />

              {/* Subtle 3D Circular Bezel Rings Around Left & Right Thumbstick Domes Inside the Black Core */}
              <circle
                cx="334"
                cy="314"
                r="82"
                fill="url(#ds-matte-black-core)"
                stroke="#252834"
                strokeWidth="1.5"
              />
              <circle
                cx="666"
                cy="314"
                r="82"
                fill="url(#ds-matte-black-core)"
                stroke="#252834"
                strokeWidth="1.5"
              />

              {/* Crisp 1.8px Inner Seam where Ceramic-White Wing meets the Matte-Black Core */}
              <path
                d="M 306 40
                   C 314 102, 328 164, 346 214
                   C 348 221, 343 226, 332 228
                   C 292 234, 254 264, 232 317
                   C 212 364, 186 414, 165 454
                   C 146 492, 132 544, 120 598
                   C 111 638, 105 664, 102 690"
                fill="none"
                stroke="#0E1016"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <path
                d="M 694 40
                   C 686 102, 672 164, 654 214
                   C 652 221, 657 226, 668 228
                   C 708 234, 746 264, 768 317
                   C 788 364, 814 414, 835 454
                   C 854 492, 868 544, 880 598
                   C 889 638, 895 664, 898 690"
                fill="none"
                stroke="#0E1016"
                strokeWidth="2"
                strokeLinecap="round"
              />

              {/* Soft Ceramic Outer Rim Contour */}
              <path
                d={PS5_OUTER_CHASSIS_PATH}
                fill="none"
                stroke="#CBD5E1"
                strokeWidth="1.5"
                opacity="0.7"
              />
            </g>

            {/* Bottom Headset Port & Dock Contacts Step (Matches the bottom center detail in the studio photo) */}
            <path
              d="M 444 440 L 556 440 L 548 447 L 452 447 Z"
              fill="#090A0E"
            />
            <rect x="488" y="442" width="24" height="3" rx="1.5" fill="#1E293B" />
          </g>

          {/* ==================== SLEEK RGB LIGHTBAR SLITS FLANKING TOUCHPAD ==================== */}
          <g filter="url(#ds-orig-bloom)">
            <path
              d="M 310 45 C 318 104, 331 164, 349 212"
              fill="none"
              stroke={lightbarColor}
              strokeWidth="4.8"
              strokeLinecap="round"
            />
            <path
              d="M 310 45 C 318 104, 331 164, 349 212"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="1.5"
              strokeLinecap="round"
              opacity="0.85"
            />

            <path
              d="M 690 45 C 682 104, 669 164, 651 212"
              fill="none"
              stroke={lightbarColor}
              strokeWidth="4.8"
              strokeLinecap="round"
            />
            <path
              d="M 690 45 C 682 104, 669 164, 651 212"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="1.5"
              strokeLinecap="round"
              opacity="0.85"
            />
          </g>

          {/* ==================== SCULPTED TRAPEZOIDAL CAPACITIVE TOUCHPAD ==================== */}
          <g>
            {/* Outer Touchpad Dark Bezel */}
            <path
              d="M 313 39
                 Q 500 35, 687 39
                 C 679 101, 665 163, 647 214
                 Q 641 227, 623 228
                 L 377 228
                 Q 359 227, 353 214
                 C 335 163, 321 101, 313 39 Z"
              fill="#11131A"
            />

            {/* Main Matte-White Capacitive Touchpad Surface */}
            <path
              d="M 319 40
                 Q 500 37, 681 40
                 C 673 100, 660 159, 643 208
                 Q 637 220, 621 221
                 L 379 221
                 Q 363 220, 357 208
                 C 340 159, 327 100, 319 40 Z"
              fill="url(#ds-orig-touchpad)"
              stroke={
                state.touchpadClick || state.mouseLeftClick || state.mouseRightClick
                  ? lightbarColor
                  : '#CBD5E1'
              }
              strokeWidth={
                state.touchpadClick || state.mouseLeftClick || state.mouseRightClick ? '3' : '1.4'
              }
              onPointerDown={(e) => {
                e.stopPropagation()
                e.currentTarget.setPointerCapture(e.pointerId)
                setTouchDragging(true)
                const isClick = e.buttons === 1 || e.button === 0
                setTouchClicked(isClick)
                if (onTouchpadInput) {
                  const { x: svgX, y: svgY } = toBodyCoords(e)
                  const normTx = Math.round(
                    Math.max(0, Math.min(1, (svgX - 335) / (665 - 335))) * 1920,
                  )
                  const normTy = Math.round(
                    Math.max(0, Math.min(1, (svgY - 40) / (218 - 40))) * 1080,
                  )
                  onTouchpadInput(true, normTx, normTy, isClick)
                }
              }}
              onDoubleClick={() => onButtonToggle?.('touchpadClick', !state.touchpadClick)}
              style={{ cursor: 'crosshair' }}
            />

            {isMouseModeActive && (
              <g pointerEvents="none">
                <path
                  d="M 322 43 L 500 43 L 500 218 L 379 218 Q 365 217, 359 206 C 343 158, 330 100, 322 43 Z"
                  fill={
                    state.mouseLeftClick ? 'rgba(16, 185, 129, 0.25)' : 'rgba(59, 130, 246, 0.04)'
                  }
                />
                <path
                  d="M 500 43 L 678 43 C 670 100, 657 158, 641 206 Q 635 217, 621 218 L 500 218 Z"
                  fill={
                    state.mouseRightClick ? 'rgba(245, 158, 11, 0.25)' : 'rgba(168, 85, 247, 0.04)'
                  }
                />
                <line
                  x1="500"
                  y1="50"
                  x2="500"
                  y2="210"
                  stroke="#94A3B8"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                  opacity="0.45"
                />
              </g>
            )}

            {/* Player Indicator LED Bar Under Touchpad */}
            <g transform="translate(500, 224.5)">
              {[-32, -16, 0, 16, 32].map((dx, i) => {
                const bit = 1 << i
                const lit = (playerMask & bit) !== 0
                return (
                  <rect
                    key={i}
                    x={dx - 4.5}
                    y="-1.2"
                    width="9"
                    height="2.4"
                    rx="1.2"
                    fill={lit && isConnected ? '#FFFFFF' : '#475569'}
                    filter={lit && isConnected ? 'url(#ds-orig-bloom)' : undefined}
                  />
                )
              })}
            </g>

            {state.touch1Active && (
              <g pointerEvents="none">
                <circle
                  cx={tpSvgX}
                  cy={tpSvgY}
                  r="18"
                  fill="none"
                  stroke={lightbarColor}
                  strokeWidth="2"
                  opacity="0.5"
                />
                <circle
                  cx={tpSvgX}
                  cy={tpSvgY}
                  r="8"
                  fill={
                    state.mouseLeftClick
                      ? '#10B981'
                      : state.mouseRightClick
                        ? '#F59E0B'
                        : lightbarColor
                  }
                  stroke="#FFFFFF"
                  strokeWidth="2"
                  filter="url(#ds-orig-bloom)"
                />
              </g>
            )}
          </g>

          {/* ==================== CREATE & OPTIONS PILL BUTTONS ==================== */}
          {/* CREATE BUTTON (Left: 282, 82) */}
          <g transform="translate(282, 82) rotate(-16)">
            <g
              transform="translate(0, -23)"
              stroke="#94A3B8"
              strokeWidth="1.6"
              strokeLinecap="round"
            >
              <line x1="-4" y1="2" x2="-6.5" y2="-4" />
              <line x1="0" y1="1" x2="0" y2="-5.5" />
              <line x1="4" y1="2" x2="6.5" y2="-4" />
            </g>
            <rect
              x="-7.5"
              y="-16"
              width="15"
              height="32"
              rx="7.5"
              fill={state.create ? lightbarColor : '#F8FAFC'}
              stroke={state.create ? '#FFFFFF' : '#CBD5E1'}
              strokeWidth="1.5"
              filter="url(#ds-orig-btn-shadow)"
              {...bindBtn('create')}
            />
          </g>

          {/* OPTIONS BUTTON (Right: 718, 82) */}
          <g transform="translate(718, 82) rotate(16)">
            <g
              transform="translate(0, -23)"
              stroke="#94A3B8"
              strokeWidth="1.6"
              strokeLinecap="round"
            >
              <line x1="-4.5" y1="-4.5" x2="4.5" y2="-4.5" />
              <line x1="-4.5" y1="-1" x2="4.5" y2="-1" />
              <line x1="-4.5" y1="2.5" x2="4.5" y2="2.5" />
            </g>
            <rect
              x="-7.5"
              y="-16"
              width="15"
              height="32"
              rx="7.5"
              fill={state.options ? lightbarColor : '#F8FAFC'}
              stroke={state.options ? '#FFFFFF' : '#CBD5E1'}
              strokeWidth="1.5"
              filter="url(#ds-orig-btn-shadow)"
              {...bindBtn('options')}
            />
          </g>

          {/* ==================== 3D TRANSLUCENT CRYSTAL D-PAD (198, 180) ==================== */}
          <g transform="translate(198, 180)">
            {/* Subtle recessed dish on white wing */}
            <circle cx="0" cy="0" r="74" fill="#E2E8F0" opacity="0.24" />

            {/* D-Pad UP */}
            <g
              transform={`translate(0, ${state.dpadUp ? 2 : 0}) scale(${state.dpadUp ? 0.95 : 1})`}
              {...bindBtn('dpadUp')}
              filter="url(#ds-orig-btn-shadow)"
            >
              <path
                d="M -21 -68 C -10 -72, 10 -72, 21 -68 L 21 -25 L 0 -7 L -21 -25 Z"
                fill={state.dpadUp ? lightbarColor : 'url(#ds-orig-crystal)'}
                stroke={state.dpadUp ? '#FFFFFF' : '#B8C4D4'}
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
              <path
                d="M -15 -62 L 15 -62 L 15 -28 L 0 -14 L -15 -28 Z"
                fill="none"
                stroke="#FFFFFF"
                strokeWidth="1.4"
                opacity="0.9"
              />
              <polygon
                points="0,-54 -7,-43 7,-43"
                fill={state.dpadUp ? '#FFFFFF' : '#94A3B8'}
              />
            </g>

            {/* D-Pad DOWN */}
            <g
              transform={`translate(0, ${state.dpadDown ? 2 : 0}) scale(${state.dpadDown ? 0.95 : 1})`}
              {...bindBtn('dpadDown')}
              filter="url(#ds-orig-btn-shadow)"
            >
              <path
                d="M -21 68 C -10 72, 10 72, 21 68 L 21 25 L 0 7 L -21 25 Z"
                fill={state.dpadDown ? lightbarColor : 'url(#ds-orig-crystal)'}
                stroke={state.dpadDown ? '#FFFFFF' : '#B8C4D4'}
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
              <path
                d="M -15 62 L 15 62 L 15 28 L 0 14 L -15 28 Z"
                fill="none"
                stroke="#FFFFFF"
                strokeWidth="1.4"
                opacity="0.9"
              />
              <polygon
                points="0,54 -7,43 7,43"
                fill={state.dpadDown ? '#FFFFFF' : '#94A3B8'}
              />
            </g>

            {/* D-Pad LEFT */}
            <g
              transform={`translate(${state.dpadLeft ? 2 : 0}, 0) scale(${state.dpadLeft ? 0.95 : 1})`}
              {...bindBtn('dpadLeft')}
              filter="url(#ds-orig-btn-shadow)"
            >
              <path
                d="M -68 -21 C -72 -10, -72 10, -68 21 L -25 21 L -7 0 L -25 -21 Z"
                fill={state.dpadLeft ? lightbarColor : 'url(#ds-orig-crystal)'}
                stroke={state.dpadLeft ? '#FFFFFF' : '#B8C4D4'}
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
              <path
                d="M -62 -15 L -62 15 L -28 15 L -14 0 L -28 -15 Z"
                fill="none"
                stroke="#FFFFFF"
                strokeWidth="1.4"
                opacity="0.9"
              />
              <polygon
                points="-54,0 -43,-7 -43,7"
                fill={state.dpadLeft ? '#FFFFFF' : '#94A3B8'}
              />
            </g>

            {/* D-Pad RIGHT */}
            <g
              transform={`translate(${state.dpadRight ? 2 : 0}, 0) scale(${state.dpadRight ? 0.95 : 1})`}
              {...bindBtn('dpadRight')}
              filter="url(#ds-orig-btn-shadow)"
            >
              <path
                d="M 68 -21 C 72 -10, 72 10, 68 21 L 25 21 L 7 0 L 25 -21 Z"
                fill={state.dpadRight ? lightbarColor : 'url(#ds-orig-crystal)'}
                stroke={state.dpadRight ? '#FFFFFF' : '#B8C4D4'}
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
              <path
                d="M 62 -15 L 62 15 L 28 15 L 14 0 L 28 -15 Z"
                fill="none"
                stroke="#FFFFFF"
                strokeWidth="1.4"
                opacity="0.9"
              />
              <polygon
                points="54,0 43,-7 43,7"
                fill={state.dpadRight ? '#FFFFFF' : '#94A3B8'}
              />
            </g>
          </g>

          {/* ==================== 3D TRANSLUCENT CRYSTAL PLAYSTATION ACTION BUTTONS (△ ○ ✕ □ around 802, 180) ==================== */}
          {/* TRIANGLE (802, 114) */}
          <g
            transform={`translate(802, 114) scale(${state.triangle ? 0.91 : 1})`}
            {...bindBtn('triangle')}
            filter="url(#ds-orig-btn-shadow)"
          >
            <circle
              cx="0"
              cy="0"
              r="28"
              fill={state.triangle ? '#10B981' : 'url(#ds-orig-crystal)'}
              stroke={state.triangle ? '#FFFFFF' : '#B8C4D4'}
              strokeWidth="1.6"
            />
            <circle
              cx="0"
              cy="0"
              r="22.5"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="1.4"
              opacity="0.88"
            />
            <polygon
              points="0,-14 -13,9.5 13,9.5"
              fill="none"
              stroke={state.triangle ? '#FFFFFF' : '#94A3B8'}
              strokeWidth="2.6"
              strokeLinejoin="round"
            />
          </g>

          {/* CIRCLE (868, 180) */}
          <g
            transform={`translate(868, 180) scale(${state.circle ? 0.91 : 1})`}
            {...bindBtn('circle')}
            filter="url(#ds-orig-btn-shadow)"
          >
            <circle
              cx="0"
              cy="0"
              r="28"
              fill={state.circle ? '#EF4444' : 'url(#ds-orig-crystal)'}
              stroke={state.circle ? '#FFFFFF' : '#B8C4D4'}
              strokeWidth="1.6"
            />
            <circle
              cx="0"
              cy="0"
              r="22.5"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="1.4"
              opacity="0.88"
            />
            <circle
              cx="0"
              cy="0"
              r="12.5"
              fill="none"
              stroke={state.circle ? '#FFFFFF' : '#94A3B8'}
              strokeWidth="2.6"
            />
          </g>

          {/* CROSS (802, 246) */}
          <g
            transform={`translate(802, 246) scale(${state.cross ? 0.91 : 1})`}
            {...bindBtn('cross')}
            filter="url(#ds-orig-btn-shadow)"
          >
            <circle
              cx="0"
              cy="0"
              r="28"
              fill={state.cross ? '#3B82F6' : 'url(#ds-orig-crystal)'}
              stroke={state.cross ? '#FFFFFF' : '#B8C4D4'}
              strokeWidth="1.6"
            />
            <circle
              cx="0"
              cy="0"
              r="22.5"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="1.4"
              opacity="0.88"
            />
            <path
              d="M -10.5 -10.5 L 10.5 10.5 M 10.5 -10.5 L -10.5 10.5"
              stroke={state.cross ? '#FFFFFF' : '#94A3B8'}
              strokeWidth="2.8"
              strokeLinecap="round"
            />
          </g>

          {/* SQUARE (736, 180) */}
          <g
            transform={`translate(736, 180) scale(${state.square ? 0.91 : 1})`}
            {...bindBtn('square')}
            filter="url(#ds-orig-btn-shadow)"
          >
            <circle
              cx="0"
              cy="0"
              r="28"
              fill={state.square ? '#EC4899' : 'url(#ds-orig-crystal)'}
              stroke={state.square ? '#FFFFFF' : '#B8C4D4'}
              strokeWidth="1.6"
            />
            <circle
              cx="0"
              cy="0"
              r="22.5"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="1.4"
              opacity="0.88"
            />
            <rect
              x="-10.5"
              y="-10.5"
              width="21"
              height="21"
              rx="2"
              fill="none"
              stroke={state.square ? '#FFFFFF' : '#94A3B8'}
              strokeWidth="2.6"
            />
          </g>

          {/* ==================== SPEAKER GRILLE, SCULPTED BLACK PS EMBLEM & MIC MUTE ==================== */}
          {/* Top tiny mic pinhole & 2 rows of speaker holes */}
          <circle cx="500" cy="240" r="2" fill="#090A0E" />
          <g fill="#08090C">
            {[-28, -16.8, -5.6, 5.6, 16.8, 28].map((dx, i) => (
              <circle key={`sp1-${i}`} cx={500 + dx} cy={252} r="2.8" />
            ))}
            {[-22.4, -11.2, 0, 11.2, 22.4].map((dx, i) => (
              <circle key={`sp2-${i}`} cx={500 + dx} cy={262} r="2.8" />
            ))}
          </g>

          {/* Authentic Sculpted Cutout PlayStation Emblem Button (500, 310) */}
          <g
            transform={`translate(500, 310) scale(${state.ps ? 0.9 : 1})`}
            {...bindBtn('ps')}
            filter="url(#ds-orig-btn-shadow)"
          >
            <circle cx="0" cy="0" r="26" fill="transparent" />
            {/* Vertical 'P' stem & loop */}
            <path
              d="M -6 -17 L -6 15 L 1 17 L 1 -9 C 8 -9, 14 -6, 14 -1 C 14 4, 8 7, 1 7 L 1 2.5 C 6 2.5, 8 1, 8 -1 C 8 -3.5, 6 -4.5, 1 -4.5 L 1 -15.5 Z"
              fill={state.ps ? lightbarColor : '#0B0C10'}
              stroke={state.ps ? '#FFFFFF' : '#383E4E'}
              strokeWidth="1.2"
            />
            {/* Horizontal 'S' ribbon */}
            <path
              d="M -20 9 C -14 5.5, -7 5.5, -4 7.5 L -4 11.5 C -8 10.5, -14 11.5, -14 13.5 C -14 15, -7 16.5, 12 10.5 C 18 8.5, 22 10.5, 20 14 C 17.5 17.5, 7 19.5, -5 18.5 Z"
              fill={state.ps ? '#FFFFFF' : '#11131A'}
              stroke={state.ps ? '#FFFFFF' : '#383E4E'}
              strokeWidth="1.2"
            />
          </g>

          {/* Mic Mute Pill Button & Microphone Icon (500, 362) */}
          <g
            transform={`translate(500, 362) scale(${state.mute ? 0.92 : 1})`}
            {...bindBtn('mute')}
          >
            <rect
              x="-16"
              y="-4.5"
              width="32"
              height="9"
              rx="4.5"
              fill={state.mute ? '#F59E0B' : '#2B2F3C'}
              stroke="#090A0F"
              strokeWidth="1.5"
            />
          </g>
          {/* Tiny Mic Icon & Pinhole Below Mute Button */}
          <g transform="translate(500, 386)" opacity="0.55">
            <rect x="-2" y="-5" width="4" height="6" rx="2" fill="#64748B" />
            <path d="M -4.5 -1 A 4.5 4.5 0 0 0 4.5 -1 M 0 3.5 V 6" fill="none" stroke="#64748B" strokeWidth="1.2" />
          </g>
          <circle cx="500" cy="408" r="2.2" fill="#08090C" />

          {/* ==================== ULTRA-SMOOTH SPRING-PHYSICS ANALOG THUMBSTICKS (L3 at 334, 314 & R3 at 666, 314) ==================== */}
          {/* LEFT STICK (L3 at 334, 314) */}
          <g transform="translate(334, 314)">
            <circle cx="0" cy="0" r="65" fill="#232733" stroke="#14161E" strokeWidth="1.5" />
            <circle
              cx="0"
              cy="0"
              r="56"
              fill="url(#ds-orig-gimbal)"
              stroke="#090A0F"
              strokeWidth="2"
            />
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
              r="36"
              fill="#000000"
              opacity="0.6"
            />

            <g
              transform={`translate(${lxOffset.toFixed(2)}, ${lyOffset.toFixed(2)}) scale(${state.l3 ? 0.92 : 1})`}
              onPointerDown={(e) => {
                e.stopPropagation()
                e.currentTarget.setPointerCapture(e.pointerId)
                setDraggingStick('left')
              }}
              onDoubleClick={() => onButtonToggle?.('l3', !state.l3)}
              style={{ cursor: draggingStick === 'left' ? 'grabbing' : 'grab' }}
              filter="url(#ds-orig-stick-shadow)"
            >
              <circle
                cx="0"
                cy="0"
                r="48"
                fill="url(#ds-orig-stick-dome)"
                stroke={
                  state.l3 || Math.hypot(lxOffset, lyOffset) > 2.2 ? lightbarColor : '#334155'
                }
                strokeWidth="2.2"
              />
              <circle
                cx="0"
                cy="0"
                r="39.5"
                fill="none"
                stroke="#475569"
                strokeWidth="5.2"
                strokeDasharray="3.2 2.4"
                opacity="0.72"
              />
              <circle
                cx={-lxOffset * 0.08}
                cy={-lyOffset * 0.08}
                r="31"
                fill="url(#ds-orig-stick-dish)"
                stroke="#181B24"
                strokeWidth="2"
              />
              <path
                d="M -21 -15 A 26 26 0 0 1 19 -17"
                fill="none"
                stroke="#64748B"
                strokeWidth="1.4"
                opacity="0.4"
              />
            </g>
          </g>

          {/* RIGHT STICK (R3 at 666, 314) */}
          <g transform="translate(666, 314)">
            <circle cx="0" cy="0" r="65" fill="#232733" stroke="#14161E" strokeWidth="1.5" />
            <circle
              cx="0"
              cy="0"
              r="56"
              fill="url(#ds-orig-gimbal)"
              stroke="#090A0F"
              strokeWidth="2"
            />
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
              r="36"
              fill="#000000"
              opacity="0.6"
            />

            <g
              transform={`translate(${rxOffset.toFixed(2)}, ${ryOffset.toFixed(2)}) scale(${state.r3 ? 0.92 : 1})`}
              onPointerDown={(e) => {
                e.stopPropagation()
                e.currentTarget.setPointerCapture(e.pointerId)
                setDraggingStick('right')
              }}
              onDoubleClick={() => onButtonToggle?.('r3', !state.r3)}
              style={{ cursor: draggingStick === 'right' ? 'grabbing' : 'grab' }}
              filter="url(#ds-orig-stick-shadow)"
            >
              <circle
                cx="0"
                cy="0"
                r="48"
                fill="url(#ds-orig-stick-dome)"
                stroke={
                  state.r3 || Math.hypot(rxOffset, ryOffset) > 2.2 ? lightbarColor : '#334155'
                }
                strokeWidth="2.2"
              />
              <circle
                cx="0"
                cy="0"
                r="39.5"
                fill="none"
                stroke="#475569"
                strokeWidth="5.2"
                strokeDasharray="3.2 2.4"
                opacity="0.72"
              />
              <circle
                cx={-rxOffset * 0.08}
                cy={-ryOffset * 0.08}
                r="31"
                fill="url(#ds-orig-stick-dish)"
                stroke="#181B24"
                strokeWidth="2"
              />
              <path
                d="M -21 -15 A 26 26 0 0 1 19 -17"
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
