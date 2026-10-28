export type NavDirection = 'up' | 'down' | 'left' | 'right'

export interface NavRect {
  left: number
  top: number
  width: number
  height: number
}

export interface FocusNode {
  id: string
  scopeId: string
  rect: NavRect
  disabled?: boolean
  hidden?: boolean
  domOrder?: number
  nextUp?: string
  nextDown?: string
  nextLeft?: string
  nextRight?: string
}

export interface ScopeConfig {
  id: string
  parentScopeId?: string
  orientation?: 'horizontal' | 'vertical' | 'grid'
  wrap?: boolean
  memory?: boolean
  trapFocus?: boolean
  rtl?: boolean
}

export function mirrorDirectionForRtl(dir: NavDirection, isRtl: boolean): NavDirection {
  if (!isRtl) return dir
  if (dir === 'left') return 'right'
  if (dir === 'right') return 'left'
  return dir
}

export function rectCenter(r: NavRect): { cx: number; cy: number } {
  return {
    cx: r.left + r.width / 2,
    cy: r.top + r.height / 2,
  }
}

export function isInHalfPlane(current: NavRect, candidate: NavRect, dir: NavDirection): boolean {
  if (candidate.width <= 0 || candidate.height <= 0) return false
  const { cx: ax, cy: ay } = rectCenter(current)
  const { cx: bx, cy: by } = rectCenter(candidate)
  const dx = bx - ax
  const dy = by - ay

  switch (dir) {
    case 'right':
      return dx > 2 && Math.abs(dy) <= dx * 1.85 + current.height
    case 'left':
      return dx < -2 && Math.abs(dy) <= -dx * 1.85 + current.height
    case 'down':
      return dy > 2 && Math.abs(dx) <= dy * 2.25 + current.width
    case 'up':
      return dy < -2 && Math.abs(dx) <= -dy * 2.25 + current.width
  }
}

export function computeAxisOverlap(current: NavRect, candidate: NavRect, dir: NavDirection): number {
  if (dir === 'left' || dir === 'right') {
    const top = Math.max(current.top, candidate.top)
    const bottom = Math.min(current.top + current.height, candidate.top + candidate.height)
    const overlap = Math.max(0, bottom - top)
    return overlap / Math.max(1, Math.min(current.height, candidate.height))
  } else {
    const left = Math.max(current.left, candidate.left)
    const right = Math.min(current.left + current.width, candidate.left + candidate.width)
    const overlap = Math.max(0, right - left)
    return overlap / Math.max(1, Math.min(current.width, candidate.width))
  }
}

/**
 * Pure scoring function per Section 7 specification:
 * `primaryDistance + 2 * crossAxisOffset - overlapBonus`
 */
export function scoreSpatialCandidate(
  current: FocusNode,
  candidate: FocusNode,
  dir: NavDirection,
  rememberedIdForScope?: string,
): number {
  const { cx: ax, cy: ay } = rectCenter(current.rect)
  const { cx: bx, cy: by } = rectCenter(candidate.rect)

  const primaryDistance =
    dir === 'left' || dir === 'right' ? Math.abs(bx - ax) : Math.abs(by - ay)
  const crossAxisOffset =
    dir === 'left' || dir === 'right' ? Math.abs(by - ay) : Math.abs(bx - ax)

  const overlapRatio = computeAxisOverlap(current.rect, candidate.rect, dir)
  const overlapBonus = overlapRatio * 45
  const sameScopeBonus = current.scopeId === candidate.scopeId ? 35 : 0
  const memoryBonus = rememberedIdForScope && candidate.id === rememberedIdForScope ? 60 : 0

  return primaryDistance + 2 * crossAxisOffset - overlapBonus - sameScopeBonus - memoryBonus
}

export function selectNextCandidate(
  currentId: string,
  nodes: FocusNode[],
  dir: NavDirection,
  scopes: Record<string, ScopeConfig> = {},
  scopeMemory: Record<string, string> = {},
): string | null {
  const activeNodes = nodes.filter(
    (n) => !n.disabled && !n.hidden && n.rect.width > 0 && n.rect.height > 0,
  )
  if (activeNodes.length === 0) return null

  const current = activeNodes.find((n) => n.id === currentId)
  if (!current) {
    return activeNodes[0].id
  }

  const currentScope = scopes[current.scopeId]
  const effectiveDir = mirrorDirectionForRtl(dir, Boolean(currentScope?.rtl))

  // 1. Explicit directional overrides on the current node
  const explicitTarget =
    effectiveDir === 'up'
      ? current.nextUp
      : effectiveDir === 'down'
        ? current.nextDown
        : effectiveDir === 'left'
          ? current.nextLeft
          : current.nextRight

  if (explicitTarget) {
    const foundExplicit = activeNodes.find((n) => n.id === explicitTarget)
    if (foundExplicit) return foundExplicit.id
  }

  // 2. If current scope is a modal focus trap, restrict candidates to the same scope
  const candidatePool = currentScope?.trapFocus
    ? activeNodes.filter((n) => n.scopeId === current.scopeId && n.id !== current.id)
    : activeNodes.filter((n) => n.id !== current.id)

  const inPlane = candidatePool.filter((cand) =>
    isInHalfPlane(current.rect, cand.rect, effectiveDir),
  )

  if (inPlane.length > 0) {
    inPlane.sort((a, b) => {
      const remA = scopeMemory[a.scopeId]
      const remB = scopeMemory[b.scopeId]
      const scoreA = scoreSpatialCandidate(current, a, effectiveDir, remA)
      const scoreB = scoreSpatialCandidate(current, b, effectiveDir, remB)
      if (Math.abs(scoreA - scoreB) > 0.01) return scoreA - scoreB
      return (a.domOrder ?? 0) - (b.domOrder ?? 0)
    })

    const winner = inPlane[0]
    // If transitioning into a different scope that has memory enabled, prefer its remembered child
    if (winner.scopeId !== current.scopeId) {
      const targetScope = scopes[winner.scopeId]
      const rememberedId = scopeMemory[winner.scopeId]
      if (targetScope?.memory !== false && rememberedId) {
        const remNode = candidatePool.find(
          (n) => n.id === rememberedId && n.scopeId === winner.scopeId,
        )
        if (remNode) return remNode.id
      }
    }
    return winner.id
  }

  // 3. Wrap support if enabled on the current scope
  if (currentScope?.wrap) {
    const sameScopeNodes = candidatePool.filter((n) => n.scopeId === current.scopeId)
    if (sameScopeNodes.length > 0) {
      sameScopeNodes.sort((a, b) => {
        if (effectiveDir === 'right') return a.rect.left - b.rect.left
        if (effectiveDir === 'left') return b.rect.left - a.rect.left
        if (effectiveDir === 'down') return a.rect.top - b.rect.top
        return b.rect.top - a.rect.top
      })
      return sameScopeNodes[0].id
    }
  }

  return null
}
