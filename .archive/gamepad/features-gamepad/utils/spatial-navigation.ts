import type { NavigationDirection, SpatialCandidate } from '../types/navigation'

export interface RectLike {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

/**
 * Checks if candidate is within the directional search cone.
 */
export function isInDirectionCone(
  current: RectLike,
  candidate: RectLike,
  direction: NavigationDirection,
): boolean {
  switch (direction) {
    case 'right':
      return candidate.right > current.right && candidate.left >= current.left - 5
    case 'left':
      return candidate.left < current.left && candidate.right <= current.right + 5
    case 'down':
      return candidate.bottom > current.bottom && candidate.top >= current.top - 5
    case 'up':
      return candidate.top < current.top && candidate.bottom <= current.bottom + 5
  }
}

/**
 * Computes spatial distance score between current element and candidate in given direction.
 * Lower score means a better, more natural navigation target.
 */
export function computeSpatialScore(
  current: RectLike,
  candidate: RectLike,
  direction: NavigationDirection,
  sameGroup = false,
  priority = 0,
): number {
  let primaryDistance = 0
  let secondaryDistance = 0
  let overlap = 0

  const currentWidth = current.right - current.left
  const candidateWidth = candidate.right - candidate.left
  const currentHeight = current.bottom - current.top
  const candidateHeight = candidate.bottom - candidate.top

  if (direction === 'right' || direction === 'left') {
    if (direction === 'right') {
      primaryDistance = Math.max(0, candidate.left - current.right)
    } else {
      primaryDistance = Math.max(0, current.left - candidate.right)
    }

    const overlapTop = Math.max(current.top, candidate.top)
    const overlapBottom = Math.min(current.bottom, candidate.bottom)
    overlap = Math.max(0, overlapBottom - overlapTop)

    const minH = Math.max(1, Math.min(currentHeight, candidateHeight))
    const overlapRatio = Math.min(1, overlap / minH)

    if (overlap > 0) {
      secondaryDistance = 0
    } else {
      const currentCenterY = (current.top + current.bottom) / 2
      const candidateCenterY = (candidate.top + candidate.bottom) / 2
      secondaryDistance = Math.abs(candidateCenterY - currentCenterY)
    }

    let score = primaryDistance * 2.0 + secondaryDistance * 2.5 - overlapRatio * 25
    if (sameGroup) score -= 15
    score -= priority * 20
    return score
  } else {
    // 'down' or 'up'
    if (direction === 'down') {
      primaryDistance = Math.max(0, candidate.top - current.bottom)
    } else {
      primaryDistance = Math.max(0, current.top - candidate.bottom)
    }

    const overlapLeft = Math.max(current.left, candidate.left)
    const overlapRight = Math.min(current.right, candidate.right)
    overlap = Math.max(0, overlapRight - overlapLeft)

    const minW = Math.max(1, Math.min(currentWidth, candidateWidth))
    const overlapRatio = Math.min(1, overlap / minW)

    if (overlap > 0) {
      secondaryDistance = 0
    } else {
      const currentCenterX = (current.left + current.right) / 2
      const candidateCenterX = (candidate.left + candidate.right) / 2
      secondaryDistance = Math.abs(candidateCenterX - currentCenterX)
    }

    let score = primaryDistance * 2.0 + secondaryDistance * 2.5 - overlapRatio * 25
    if (sameGroup) score -= 15
    score -= priority * 20
    return score
  }
}

/**
 * Finds the best spatial candidate in the requested direction.
 */
export function findBestSpatialCandidate(
  currentElement: HTMLElement,
  eligibleElements: HTMLElement[],
  direction: NavigationDirection,
): HTMLElement | null {
  if (!currentElement || eligibleElements.length === 0) {
    return null
  }

  const currentRect = currentElement.getBoundingClientRect()
  const currentGroup = currentElement.getAttribute('data-gamepad-group') ?? undefined

  const candidates: SpatialCandidate[] = []

  for (const el of eligibleElements) {
    if (el === currentElement) continue
    if (
      (typeof currentElement.contains === 'function' && currentElement.contains(el)) ||
      (typeof el.contains === 'function' && el.contains(currentElement))
    ) {
      continue
    }

    // Element must be visible in layout
    const rect = el.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) continue

    if (!isInDirectionCone(currentRect, rect, direction)) {
      continue
    }

    const candidateGroup = el.getAttribute('data-gamepad-group') ?? undefined
    const priorityAttr = el.getAttribute('data-gamepad-priority')
    const priority = priorityAttr ? parseInt(priorityAttr, 10) || 0 : 0

    const sameGroup = Boolean(currentGroup && candidateGroup && currentGroup === candidateGroup)
    const score = computeSpatialScore(currentRect, rect, direction, sameGroup, priority)

    candidates.push({
      element: el,
      rect,
      score,
      group: candidateGroup,
      priority,
    })
  }

  if (candidates.length === 0) {
    return null
  }

  // Sort by score ascending (lowest score is best)
  candidates.sort((a, b) => a.score - b.score)

  return candidates[0].element
}
