/**
 * Focus-follow scrolling for Console Mode.
 *
 * The browser's `scrollIntoView({ behavior: 'smooth', block: 'nearest' })` only nudges the focused
 * item to the closest edge and restarts its animation on every key repeat, which feels stiff and
 * jerky. This helper instead keeps the focused item centred (like a console shelf) and retargets a
 * single critically-damped animation per scroll container, so holding a direction glides.
 */

type Axis = 'x' | 'y'

interface ScrollAnimation {
  raf: number
  target: number
  lastTs: number
}

const animations = new WeakMap<HTMLElement, Record<Axis, ScrollAnimation | undefined>>()

let motionScale = 1
let reduceMotion = false

/** Called by the console shell so scroll speed follows the user's animation settings. */
export function configureScrollMotion(opts: { speed?: number; reduceMotion?: boolean }): void {
  if (typeof opts.speed === 'number' && Number.isFinite(opts.speed)) {
    motionScale = Math.min(4, Math.max(0.25, opts.speed))
  }
  if (typeof opts.reduceMotion === 'boolean') reduceMotion = opts.reduceMotion
}

/** Time constant (ms) of the exponential approach; smaller = snappier. */
const BASE_TAU_MS = 85

export function findScrollParent(el: HTMLElement, axis: Axis): HTMLElement | null {
  let node: HTMLElement | null = el.parentElement
  while (node) {
    const style = window.getComputedStyle(node)
    const overflow = axis === 'x' ? style.overflowX : style.overflowY
    const scrollable =
      axis === 'x'
        ? node.scrollWidth > node.clientWidth + 1
        : node.scrollHeight > node.clientHeight + 1
    if ((overflow === 'auto' || overflow === 'scroll') && scrollable) return node
    node = node.parentElement
  }
  return null
}

function animateTo(container: HTMLElement, axis: Axis, target: number): void {
  const prop = axis === 'x' ? 'scrollLeft' : 'scrollTop'
  const max =
    axis === 'x'
      ? container.scrollWidth - container.clientWidth
      : container.scrollHeight - container.clientHeight
  const clamped = Math.min(Math.max(0, target), Math.max(0, max))

  if (reduceMotion) {
    container[prop] = clamped
    return
  }

  const state = animations.get(container) ?? { x: undefined, y: undefined }
  animations.set(container, state)
  const existing = state[axis]
  if (existing) {
    // Retarget the running animation instead of restarting it: no stutter while a key repeats.
    existing.target = clamped
    return
  }

  const anim: ScrollAnimation = { raf: 0, target: clamped, lastTs: performance.now() }
  state[axis] = anim

  const step = (ts: number) => {
    const dt = Math.min(64, Math.max(1, ts - anim.lastTs))
    anim.lastTs = ts
    const current = container[prop]
    const diff = anim.target - current
    if (Math.abs(diff) < 0.6) {
      container[prop] = anim.target
      state[axis] = undefined
      return
    }
    const tau = BASE_TAU_MS / motionScale
    container[prop] = current + diff * (1 - Math.exp(-dt / tau))
    anim.raf = window.requestAnimationFrame(step)
  }
  anim.raf = window.requestAnimationFrame(step)
}

/** Fraction of the container (0..1) inside which a vertically-visible item is left alone. */
const VERTICAL_COMFORT_TOP = 0.02
const VERTICAL_COMFORT_BOTTOM = 0.99

export function followFocus(el: HTMLElement): void {
  if (typeof window === 'undefined') return

  const hParent = findScrollParent(el, 'x')
  if (hParent) {
    const elRect = el.getBoundingClientRect()
    const parentRect = hParent.getBoundingClientRect()
    const elCenter = elRect.left - parentRect.left + hParent.scrollLeft + elRect.width / 2
    animateTo(hParent, 'x', elCenter - hParent.clientWidth / 2)
  }

  const vParent = findScrollParent(el, 'y')
  if (vParent) {
    const elRect = el.getBoundingClientRect()
    const parentRect = vParent.getBoundingClientRect()
    // Tiles show a caption below themselves, so reserve ~3.5rem under the item before deciding
    // whether it is "comfortably" visible.
    const rootPx = parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 16
    const bottomPad = rootPx * 3.5
    const relTop = (elRect.top - parentRect.top) / parentRect.height
    const relBottom = (elRect.bottom + bottomPad - parentRect.top) / parentRect.height
    const comfortable = relTop >= VERTICAL_COMFORT_TOP && relBottom <= VERTICAL_COMFORT_BOTTOM
    if (!comfortable) {
      const elCenter = elRect.top - parentRect.top + vParent.scrollTop + elRect.height / 2
      animateTo(vParent, 'y', elCenter - vParent.clientHeight / 2)
    }
  }
}
