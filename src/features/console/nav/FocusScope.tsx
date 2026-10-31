import React, { createContext, useCallback, useContext, useEffect, useId, useRef } from 'react'
import { consoleSoundEngine } from '../audio/ui-sounds'
import { animateScrollTo, followFocus } from './smooth-scroll'
import { useConsoleStore } from '../store/console-store'
import { selectNextCandidate, type FocusNode, type NavDirection, type ScopeConfig } from './spatial'

const HEADER_SCOPES = new Set(['console_top_tabs', 'console_top_actions'])

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
  private listeners = new Set<(focusedId: string | null) => void>()

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
      // Immediately move focus into the newly opened trapFocus scope (#2)
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
        this.focusedId = null
        this.notify()
      }
    }
  }

  public getFocusedId(): string | null {
    return this.focusedId
  }

  public subscribe(cb: (focusedId: string | null) => void): () => void {
    this.listeners.add(cb)
    return () => {
      this.listeners.delete(cb)
    }
  }

  private notify() {
    for (const cb of this.listeners) {
      cb(this.focusedId)
    }
  }

  public setFocus(id: string, playSound = true, fromPointer = false): boolean {
    const item = this.items.get(id)
    if (!item || item.disabled) return false
    const changed = this.focusedId !== id
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
      item.onFocus?.()
    }
    this.notify()
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

    const nodes: FocusNode[] = []
    let idx = 0
    for (const item of this.items.values()) {
      if (activeTrap && !this.isScopeInsideTrap(item.scopeId, activeTrap)) {
        continue
      }
      const el = item.getElement()
      if (!el) continue
      const rect = el.getBoundingClientRect()
      const style = typeof window !== 'undefined' ? window.getComputedStyle(el) : null
      const hidden =
        rect.width <= 0 ||
        rect.height <= 0 ||
        style?.display === 'none' ||
        style?.visibility === 'hidden'

      // Requirement #3: Use scroll-compensated document Y coordinates for elements inside <main>
      // so scrolled-off-screen upper rows remain above lower rows instead of jumping to <header>!
      const mainEl = el.closest('main')
      const scrollY = mainEl ? mainEl.scrollTop : 0
      const effectiveTop = mainEl ? rect.top + scrollY : rect.top

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

    // Requirement #3: If moving 'up' from inside <main> (not in HEADER_SCOPES),
    // always prefer upper items inside <main> before ever jumping into HEADER_SCOPES!
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
      // Already at the very top of <main>: scroll <main> to 0 and move into header
      const mainContainer = document.querySelector('main')
      if (mainContainer instanceof HTMLElement && mainContainer.scrollTop > 4) {
        animateScrollTo(mainContainer, 'y', 0)
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
    return consoleNavController.subscribe((cur) => {
      setIsFocused(cur === itemId)
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
        if (!isFocused && !options.disabled) {
          consoleSoundEngine.unlock()
          consoleNavController.setFocus(itemId, true, true)
        }
      },
      onClick: () => {
        if (options.disabled) return
        consoleNavController.setFocus(itemId, false)
        consoleSoundEngine.play('confirm')
        options.onConfirm?.()
      },
    },
  }
}
