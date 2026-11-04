import React, { createContext, useCallback, useContext, useEffect, useId, useRef } from 'react'
import { consoleSoundEngine } from '../audio/ui-sounds'
import { animateScrollTo, followFocus } from './smooth-scroll'
import { useConsoleStore } from '../store/console-store'
import { selectNextCandidate, type FocusNode, type NavDirection, type ScopeConfig } from './spatial'

const HEADER_SCOPES = new Set(['console_top_tabs', 'console_top_actions'])

// Suppress synthetic onMouseEnter focus thrashing when tiles scroll underneath a stationary cursor
let lastWheelScrollTs = 0
let pointerMovedSinceScroll = true
if (typeof window !== 'undefined') {
  window.addEventListener(
    'wheel',
    () => {
      lastWheelScrollTs = performance.now()
      pointerMovedSinceScroll = false
    },
    { passive: true },
  )
  window.addEventListener(
    'mousemove',
    () => {
      pointerMovedSinceScroll = true
    },
    { passive: true },
  )
}

interface RegisteredItem {
  id: string
  scopeId: string
  getElement: () => HTMLElement | null
  disabled?: boolean
  nextUp?: string
  nextDown?: string
  nextLeft?: string
  nextRight?: string
  onConfirm?: () => void
  onOptions?: () => void
  onSecondary?: () => void
  onTertiary?: () => void
  onFocus?: () => void
}

class NavigationController {
  private items = new Map<string, RegisteredItem>()
  private scopes = new Map<string, ScopeConfig>()
  private trapStack: string[] = []
  private scopeMemory: Record<string, string> = {}
  private focusedId: string | null = null
  private globalListeners = new Set<(focusedId: string | null) => void>()
  // Targeted O(1) per-item focus listeners so changing focus from tile A to tile B
  // only updates 2 React components instead of broadcasting to 300+ registered items!
  private itemListeners = new Map<string, Set<(isFocused: boolean) => void>>()

  private isScopeInsideTrap(scopeId: string, trapScopeId: string): boolean {
    let cur: string | undefined = scopeId
    const visited = new Set<string>()
    while (cur && !visited.has(cur)) {
      if (cur === trapScopeId) return true
      visited.add(cur)
      cur = this.scopes.get(cur)?.parentScopeId
    }
    return false
  }

  private getActiveTrapScopeId(): string | null {
    for (let i = this.trapStack.length - 1; i >= 0; i--) {
      const id = this.trapStack[i]
      if (this.scopes.get(id)?.trapFocus) return id
    }
    return null
  }

  public registerScope(config: ScopeConfig): () => void {
    this.scopes.set(config.id, config)
    if (config.trapFocus) {
      this.trapStack = this.trapStack.filter((id) => id !== config.id)
      this.trapStack.push(config.id)
      this.ensureFocusInsideActiveTrap()
    }
    return () => {
      this.scopes.delete(config.id)
      this.trapStack = this.trapStack.filter((id) => id !== config.id)
    }
  }

  private ensureFocusInsideActiveTrap(): boolean {
    const activeTrap = this.getActiveTrapScopeId()
    if (!activeTrap) return false
    if (this.focusedId) {
      const curItem = this.items.get(this.focusedId)
      if (curItem && !curItem.disabled && this.isScopeInsideTrap(curItem.scopeId, activeTrap)) {
        return true
      }
    }
    for (const item of this.items.values()) {
      if (!item.disabled && this.isScopeInsideTrap(item.scopeId, activeTrap)) {
        return this.setFocus(item.id, false)
      }
    }
    return false
  }

  public registerItem(item: RegisteredItem): () => void {
    this.items.set(item.id, item)
    const activeTrap = this.getActiveTrapScopeId()
    if (activeTrap && this.isScopeInsideTrap(item.scopeId, activeTrap)) {
      this.ensureFocusInsideActiveTrap()
    } else if (!this.focusedId && !item.disabled && !activeTrap) {
      this.setFocus(item.id, false)
    }
    return () => {
      this.items.delete(item.id)
      if (this.focusedId === item.id) {
        const prev = this.focusedId
        this.focusedId = null
        this.notifyChanged(prev, null)
      }
    }
  }

  public getFocusedId(): string | null {
    return this.focusedId
  }

  public subscribe(cb: (focusedId: string | null) => void): () => void {
    this.globalListeners.add(cb)
    return () => {
      this.globalListeners.delete(cb)
    }
  }

  public subscribeItem(itemId: string, cb: (isFocused: boolean) => void): () => void {
    let set = this.itemListeners.get(itemId)
    if (!set) {
      set = new Set()
      this.itemListeners.set(itemId, set)
    }
    set.add(cb)
    return () => {
      const curSet = this.itemListeners.get(itemId)
      if (curSet) {
        curSet.delete(cb)
        if (curSet.size === 0) {
          this.itemListeners.delete(itemId)
        }
      }
    }
  }

  private notifyChanged(prevId: string | null, nextId: string | null) {
    if (prevId && prevId !== nextId) {
      const prevSet = this.itemListeners.get(prevId)
      if (prevSet) {
        for (const cb of prevSet) cb(false)
      }
    }
    if (nextId && nextId !== prevId) {
      const nextSet = this.itemListeners.get(nextId)
      if (nextSet) {
        for (const cb of nextSet) cb(true)
      }
    }
    for (const cb of this.globalListeners) {
      cb(nextId)
    }
  }

  public setFocus(id: string, playSound = true, fromPointer = false): boolean {
    const item = this.items.get(id)
    if (!item || item.disabled) return false
    const prevId = this.focusedId
    const changed = prevId !== id
    this.focusedId = id
    this.scopeMemory[item.scopeId] = id
    useConsoleStore.getState().rememberFocus(item.scopeId, id)

    const el = item.getElement()
    if (el && !fromPointer) {
      try {
        followFocus(el)
      } catch {
        // Ignore in headless tests
      }
    }
    if (changed) {
      if (playSound) consoleSoundEngine.play('move')
      this.notifyChanged(prevId, id)
      item.onFocus?.()
    }
    return true
  }

  public move(dir: NavDirection): boolean {
    const activeTrap = this.getActiveTrapScopeId()
    if (activeTrap) {
      const curItem = this.focusedId ? this.items.get(this.focusedId) : undefined
      if (!curItem || !this.isScopeInsideTrap(curItem.scopeId, activeTrap)) {
        return this.ensureFocusInsideActiveTrap()
      }
    }

    const mainEl = typeof document !== 'undefined' ? document.querySelector('main') : null
    const mainScrollY = mainEl ? mainEl.scrollTop : 0

    const nodes: FocusNode[] = []
    let idx = 0
    for (const item of this.items.values()) {
      if (activeTrap && !this.isScopeInsideTrap(item.scopeId, activeTrap)) {
        continue
      }
      const el = item.getElement()
      if (!el) continue
      const rect = el.getBoundingClientRect()
      const hidden = rect.width <= 0 || rect.height <= 0

      // Use scroll-compensated document Y coordinates for elements inside <main>
      // without calling getComputedStyle(el) or el.closest('main') per item!
      const inMain = mainEl ? mainEl.contains(el) : !HEADER_SCOPES.has(item.scopeId)
      const effectiveTop = inMain ? rect.top + mainScrollY : rect.top

      nodes.push({
        id: item.id,
        scopeId: item.scopeId,
        rect: {
          left: rect.left,
          top: effectiveTop,
          width: rect.width,
          height: rect.height,
        },
        disabled: item.disabled,
        hidden,
        domOrder: ++idx,
        nextUp: item.nextUp,
        nextDown: item.nextDown,
        nextLeft: item.nextLeft,
        nextRight: item.nextRight,
      })
    }

    if (nodes.length === 0) return false
    if (!this.focusedId || !nodes.some((n) => n.id === this.focusedId)) {
      return this.setFocus(nodes[0].id, true)
    }

    const scopeRecord: Record<string, ScopeConfig> = {}
    for (const [k, v] of this.scopes.entries()) {
      scopeRecord[k] = v
    }

    const currentNode = nodes.find((n) => n.id === this.focusedId)

    if (dir === 'up' && currentNode && !HEADER_SCOPES.has(currentNode.scopeId) && !activeTrap) {
      const mainOnlyNodes = nodes.filter((n) => !HEADER_SCOPES.has(n.scopeId))
      const nextInMain = selectNextCandidate(
        this.focusedId,
        mainOnlyNodes,
        dir,
        scopeRecord,
        this.scopeMemory,
      )
      if (nextInMain && nextInMain !== this.focusedId) {
        return this.setFocus(nextInMain, true)
      }
      if (mainEl instanceof HTMLElement && mainEl.scrollTop > 4) {
        animateScrollTo(mainEl, 'y', 0)
      }
    }

    const nextId = selectNextCandidate(this.focusedId, nodes, dir, scopeRecord, this.scopeMemory)
    if (nextId && nextId !== this.focusedId) {
      return this.setFocus(nextId, true)
    }
    return false
  }

  public triggerConfirm(): boolean {
    const activeTrap = this.getActiveTrapScopeId()
    if (activeTrap) this.ensureFocusInsideActiveTrap()
    if (!this.focusedId) return false
    const item = this.items.get(this.focusedId)
    if (!item || item.disabled || !item.onConfirm) return false
    consoleSoundEngine.play('confirm')
    item.onConfirm()
    return true
  }

  public triggerOptions(): boolean {
    if (!this.focusedId) return false
    const item = this.items.get(this.focusedId)
    if (!item || item.disabled || !item.onOptions) return false
    consoleSoundEngine.play('confirm')
    item.onOptions()
    return true
  }

  public triggerSecondary(): boolean {
    if (!this.focusedId) return false
    const item = this.items.get(this.focusedId)
    if (!item || item.disabled || !item.onSecondary) return false
    consoleSoundEngine.play('confirm')
    item.onSecondary()
    return true
  }

  public triggerTertiary(): boolean {
    if (!this.focusedId) return false
    const item = this.items.get(this.focusedId)
    if (!item || item.disabled || !item.onTertiary) return false
    consoleSoundEngine.play('confirm')
    item.onTertiary()
    return true
  }
}

export const consoleNavController = new NavigationController()

if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as { __consoleNav?: NavigationController }).__consoleNav =
    consoleNavController
}

const ScopeContext = createContext<string>('root')

export interface FocusScopeProps {
  id: string
  orientation?: 'horizontal' | 'vertical' | 'grid'
  wrap?: boolean
  memory?: boolean
  trapFocus?: boolean
  rtl?: boolean
  className?: string
  children: React.ReactNode
}

export const FocusScope: React.FC<FocusScopeProps> = ({
  id,
  orientation = 'grid',
  wrap = false,
  memory = true,
  trapFocus = false,
  rtl = false,
  className,
  children,
}) => {
  const parentScopeId = useContext(ScopeContext)
  const previousFocusRef = useRef<string | null>(null)

  useEffect(() => {
    if (trapFocus) {
      previousFocusRef.current = consoleNavController.getFocusedId()
    }
    const unregister = consoleNavController.registerScope({
      id,
      parentScopeId,
      orientation,
      wrap,
      memory,
      trapFocus,
      rtl,
    })
    return () => {
      unregister()
      if (trapFocus && previousFocusRef.current) {
        consoleNavController.setFocus(previousFocusRef.current, false)
      }
    }
  }, [id, parentScopeId, orientation, wrap, memory, trapFocus, rtl])

  return (
    <ScopeContext.Provider value={id}>
      <div data-console-scope={id} className={className}>
        {children}
      </div>
    </ScopeContext.Provider>
  )
}

export interface UseFocusableOptions {
  id?: string
  scopeId?: string
  disabled?: boolean
  nextUp?: string
  nextDown?: string
  nextLeft?: string
  nextRight?: string
  onConfirm?: () => void
  onOptions?: () => void
  onSecondary?: () => void
  onTertiary?: () => void
  onFocus?: () => void
}

export function useFocusable<T extends HTMLElement = HTMLElement>(
  options: UseFocusableOptions = {},
) {
  const autoId = useId()
  const itemId = options.id || `focus_${autoId}`
  const inheritedScope = useContext(ScopeContext)
  const scopeId = options.scopeId || inheritedScope
  const ref = useRef<T | null>(null)
  const [isFocused, setIsFocused] = React.useState(
    () => consoleNavController.getFocusedId() === itemId,
  )

  useEffect(() => {
    setIsFocused(consoleNavController.getFocusedId() === itemId)
    return consoleNavController.subscribeItem(itemId, (focused) => {
      setIsFocused(focused)
    })
  }, [itemId])

  const latest = useRef(options)
  latest.current = options

  useEffect(() => {
    return consoleNavController.registerItem({
      id: itemId,
      scopeId,
      getElement: () => ref.current,
      get disabled() {
        return latest.current.disabled
      },
      get nextUp() {
        return latest.current.nextUp
      },
      get nextDown() {
        return latest.current.nextDown
      },
      get nextLeft() {
        return latest.current.nextLeft
      },
      get nextRight() {
        return latest.current.nextRight
      },
      get onConfirm() {
        return latest.current.onConfirm
      },
      get onOptions() {
        return latest.current.onOptions
      },
      get onSecondary() {
        return latest.current.onSecondary
      },
      get onTertiary() {
        return latest.current.onTertiary
      },
      get onFocus() {
        return latest.current.onFocus
      },
    })
  }, [itemId, scopeId])

  const focusSelf = useCallback(() => {
    consoleNavController.setFocus(itemId, true)
  }, [itemId])

  return {
    ref,
    id: itemId,
    isFocused,
    focusSelf,
    focusProps: {
      ref,
      'data-focus-id': itemId,
      'data-focused': isFocused ? 'true' : 'false',
      tabIndex: options.disabled ? -1 : 0,
      onMouseEnter: () => {
        if (!pointerMovedSinceScroll && performance.now() - lastWheelScrollTs < 220) {
          return
        }
        if (!isFocused && !options.disabled) {
          consoleSoundEngine.unlock()
          consoleNavController.setFocus(itemId, true, true)
        }
      },
      onClick: () => {
        if (options.disabled) return
        consoleNavController.setFocus(itemId, false, true)
        consoleSoundEngine.play('confirm')
        options.onConfirm?.()
      },
    },
  }
}
