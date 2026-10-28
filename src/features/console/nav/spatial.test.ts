import { describe, expect, it } from 'vitest'
import {
  mirrorDirectionForRtl,
  selectNextCandidate,
  type FocusNode,
  type ScopeConfig,
} from './spatial'

function makeNode(
  id: string,
  left: number,
  top: number,
  scopeId = 'row1',
  extra: Partial<FocusNode> = {},
): FocusNode {
  return {
    id,
    scopeId,
    rect: { left, top, width: 200, height: 120 },
    ...extra,
  }
}

describe('Console Spatial Navigation Engine', () => {
  it('selects nearest aligned neighbor in each cardinal direction and obeys symmetry', () => {
    const nodes = [
      makeNode('n1', 100, 100),
      makeNode('n2', 340, 100),
      makeNode('n3', 580, 100),
      makeNode('n4', 100, 300, 'row2'),
    ]

    const rightFrom1 = selectNextCandidate('n1', nodes, 'right')
    expect(rightFrom1).toBe('n2')

    const leftFrom2 = selectNextCandidate('n2', nodes, 'left')
    expect(leftFrom2).toBe('n1')

    const downFrom1 = selectNextCandidate('n1', nodes, 'down')
    expect(downFrom1).toBe('n4')

    const upFrom4 = selectNextCandidate('n4', nodes, 'up')
    expect(upFrom4).toBe('n1')
  })

  it('never focuses hidden or disabled nodes', () => {
    const nodes = [
      makeNode('n1', 100, 100),
      makeNode('n2', 340, 100, 'row1', { disabled: true }),
      makeNode('n3', 580, 100, 'row1', { hidden: true }),
      makeNode('n4', 820, 100),
    ]
    expect(selectNextCandidate('n1', nodes, 'right')).toBe('n4')
  })

  it('restores remembered child when entering a scope with memory enabled', () => {
    const nodes = [
      makeNode('top_1', 100, 100, 'row_top'),
      makeNode('bot_1', 100, 300, 'row_bot'),
      makeNode('bot_2', 340, 300, 'row_bot'),
      makeNode('bot_3', 580, 300, 'row_bot'),
    ]
    const scopes: Record<string, ScopeConfig> = {
      row_top: { id: 'row_top', memory: true },
      row_bot: { id: 'row_bot', memory: true },
    }
    const memory = { row_bot: 'bot_3' }
    expect(selectNextCandidate('top_1', nodes, 'down', scopes, memory)).toBe('bot_3')
  })

  it('enforces modal focus traps and horizontal wrap rules', () => {
    const nodes = [
      makeNode('modal_1', 100, 100, 'modal'),
      makeNode('modal_2', 340, 100, 'modal'),
      makeNode('outside', 580, 100, 'background'),
    ]
    const scopes: Record<string, ScopeConfig> = {
      modal: { id: 'modal', trapFocus: true, wrap: true },
      background: { id: 'background' },
    }
    // Moving right from modal_2 must NOT escape to 'outside'; because wrap=true, it wraps to modal_1
    expect(selectNextCandidate('modal_2', nodes, 'right', scopes)).toBe('modal_1')
  })

  it('mirrors horizontal directions for RTL (Persian) scopes', () => {
    expect(mirrorDirectionForRtl('left', true)).toBe('right')
    expect(mirrorDirectionForRtl('right', true)).toBe('left')
    expect(mirrorDirectionForRtl('up', true)).toBe('up')
  })
})
