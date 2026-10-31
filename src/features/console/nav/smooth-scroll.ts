/**
 * Critically-damped, velocity-preserving spring scroll engine for Console Mode (#3, #4, #7).
 *
 * Keeps a floating-point `virtualPos` and `velocity` per axis so:
 * 1. Holding D-Pad / Stick repeats retargets `targetPos` smoothly without resetting velocity,
 *    giving a continuous 60/120fps glide.
 * 2. Subpixel browser `scrollTop` quantization can never stall the animation.
 * 3. Any mouse wheel / touch / pointer drag immediately cancels the programmatic glide.
 */

type Axis = 'x' | 'y'

interface ScrollAnimation {
  raf: number
  virtualPos: number
  velocity: number
  targetPos: number
  lastTs: number
}

const animations = new WeakMap<HTMLElement, Record<Axis, ScrollAnimation | undefined>>()
const wheelAttached = new WeakSet<HTMLElement>()

let motionScale = 1
let reduceMotion = false

export function configureScrollMotion(opts: { speed?: number; reduceMotion?: boolean }): void {
  if (typeof opts.speed === 'number' && Number.isFinite(opts.speed)) {
    motionScale = Math.min(4, Math.max(0.25, opts.speed))
  }
  if (typeof opts.reduceMotion === 'boolean') reduceMotion = opts.reduceMotion
}

export function findScrollParent(el: HTMLElement, axis: Axis): HTMLElement | null {
  let node: HTMLElement | null = el.parentElement
  while (node) {
    const style = window.getComputedStyle(node)
    const overflow = axis === 'x' ? style.overflowX : style.overflowY
    const scrollable =
      axis === 'x'
        ? node.scrollWidth > node.clientWidth + 2
        : node.scrollHeight > node.clientHeight + 2
    if ((overflow === 'auto' || overflow === 'scroll') && scrollable) return node
    node = node.parentElement
  }
  return null
}

export function cancelScrollAnimation(container: HTMLElement, axis?: Axis): void {
  const state = animations.get(container)
  if (!state) return
  const axes: Axis[] = axis ? [axis] : ['x', 'y']
  for (const ax of axes) {
    const cur = state[ax]
    if (cur) {
      window.cancelAnimationFrame(cur.raf)
      state[ax] = undefined
    }
  }
}

function attachWheelCanceller(container: HTMLElement): void {
  if (wheelAttached.has(container)) return
  wheelAttached.add(container)
  container.addEventListener(
    'wheel',
    () => {
      cancelScrollAnimation(container)
    },
    { passive: true },
  )
  container.addEventListener(
    'mousedown',
    () => {
      cancelScrollAnimation(container)
    },
    { passive: true },
  )
}

export function animateScrollTo(container: HTMLElement, axis: Axis, target: number): void {
  attachWheelCanceller(container)
  const prop = axis === 'x' ? 'scrollLeft' : 'scrollTop'
  const max =
    axis === 'x'
      ? container.scrollWidth - container.clientWidth
      : container.scrollHeight - container.clientHeight
  const clamped = Math.round(Math.min(Math.max(0, target), Math.max(0, max)))
  const current = container[prop]

  if (reduceMotion) {
    cancelScrollAnimation(container, axis)
    container[prop] = clamped
    return
  }

  const state = animations.get(container) ?? { x: undefined, y: undefined }
  animations.set(container, state)

  const existing = state[axis]
  if (existing) {
    // Retarget smoothly while preserving current velocity!
    existing.targetPos = clamped
    return
  }

  if (Math.abs(clamped - current) < 1.5) {
    container[prop] = clamped
    return
  }

  const anim: ScrollAnimation = {
    raf: 0,
    virtualPos: current,
    velocity: 0,
    targetPos: clamped,
    lastTs: performance.now(),
  }
  state[axis] = anim

  // Critically-damped spring constants (omega ~ 22 rad/s scaled by motionScale)
  const omega = 22 * motionScale

  const step = (now: number) => {
    const dt = Math.min(0.032, Math.max(0.001, (now - anim.lastTs) / 1000))
    anim.lastTs = now

    const displacement = anim.virtualPos - anim.targetPos
    const springForce = -omega * omega * displacement
    const dampingForce = -2 * omega * anim.velocity
    const accel = springForce + dampingForce

    anim.velocity += accel * dt
    anim.virtualPos += anim.velocity * dt
    container[prop] = Math.round(anim.virtualPos)

    if (Math.abs(anim.targetPos - anim.virtualPos) < 0.8 && Math.abs(anim.velocity) < 6) {
      container[prop] = anim.targetPos
      state[axis] = undefined
      return
    }

    anim.raf = window.requestAnimationFrame(step)
  }

  anim.raf = window.requestAnimationFrame(step)
}

export function followFocus(el: HTMLElement): void {
  if (typeof window === 'undefined') return

  const hParent = findScrollParent(el, 'x')
  if (hParent) {
    const elRect = el.getBoundingClientRect()
    const parentRect = hParent.getBoundingClientRect()
    const elCenter = elRect.left - parentRect.left + hParent.scrollLeft + elRect.width / 2
    animateScrollTo(hParent, 'x', elCenter - hParent.clientWidth / 2)
  }

  const vParent = findScrollParent(el, 'y')
  if (vParent) {
    const elRect = el.getBoundingClientRect()
    const parentRect = vParent.getBoundingClientRect()
    const elCenterInScroll = elRect.top - parentRect.top + vParent.scrollTop + elRect.height / 2

    // If the focused item is near the very top of the scroll container (e.g. Hero buttons),
    // scroll all the way to 0 so the Hero banner is fully visible (#3)
    if (elCenterInScroll < vParent.clientHeight * 0.48) {
      animateScrollTo(vParent, 'y', 0)
    } else {
      animateScrollTo(vParent, 'y', elCenterInScroll - vParent.clientHeight * 0.42)
    }
  }
}
