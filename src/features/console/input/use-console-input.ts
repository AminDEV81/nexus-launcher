import { useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { toast } from 'sonner'
import {
  applyStickDeadzoneAndLock,
  dedupeLogicalGamepads,
  isWithinSwallowWindow,
  mapFaceButtonAction,
  StepRepeatTimer,
  type ConsoleAction,
} from './InputManager'
import { consoleNavController } from '../nav/FocusScope'
import { useConsoleStore } from '../store/console-store'
import { consoleSoundEngine } from '../audio/ui-sounds'
import type { NavDirection } from '../nav/spatial'

export interface ConsoleInputHandlers {
  onAction?: (action: ConsoleAction) => boolean | void
  onBack?: () => void
  onOptions?: () => void
  onTabPrev?: () => void
  onTabNext?: () => void
  onPagePrev?: () => void
  onPageNext?: () => void
  onSearch?: () => void
  onGuide?: () => void
}

export function useConsoleInputController(handlers: ConsoleInputHandlers = {}, active = true) {
  const handlersRef = useRef<ConsoleInputHandlers>(handlers)
  handlersRef.current = handlers

  const lastFocusRegainedAtRef = useRef<number>(0)
  const repeatTimerRef = useRef<StepRepeatTimer>(new StepRepeatTimer())
  const prevStickDirRef = useRef<NavDirection | null>(null)
  const prevButtonsRef = useRef<Record<string, boolean[]>>({})
  const prevPadCountRef = useRef<number>(0)
  const dualSenseCountsRef = useRef<{ connected: number; emulating: number }>({
    connected: 0,
    emulating: 0,
  })
  const lastActivityAtRef = useRef<number>(Date.now())

  useEffect(() => {
    if (!active) return

    const markActivity = () => {
      lastActivityAtRef.current = Date.now()
      if (useConsoleStore.getState().screensaverActive) {
        useConsoleStore.getState().setScreensaverActive(false)
      }
    }

    const dispatchAction = (action: ConsoleAction) => {
      markActivity()
      const customHandled = handlersRef.current.onAction?.(action)
      if (customHandled) return

      switch (action) {
        case 'up':
        case 'down':
        case 'left':
        case 'right':
          consoleNavController.move(action)
          break
        case 'confirm':
          consoleNavController.triggerConfirm()
          break
        case 'back':
          consoleSoundEngine.play('back')
          handlersRef.current.onBack?.()
          break
        case 'options':
          if (!consoleNavController.triggerOptions()) {
            consoleSoundEngine.play('tab')
            handlersRef.current.onOptions?.()
          }
          break
        case 'secondary':
          consoleNavController.triggerSecondary()
          break
        case 'tertiary':
          if (!consoleNavController.triggerTertiary()) {
            handlersRef.current.onSearch?.()
          }
          break
        case 'tabPrev':
          consoleSoundEngine.play('tab')
          handlersRef.current.onTabPrev?.()
          break
        case 'tabNext':
          consoleSoundEngine.play('tab')
          handlersRef.current.onTabNext?.()
          break
        case 'pagePrev':
          consoleSoundEngine.play('move')
          handlersRef.current.onPagePrev?.()
          break
        case 'pageNext':
          consoleSoundEngine.play('move')
          handlersRef.current.onPageNext?.()
          break
        case 'search':
          consoleSoundEngine.play('confirm')
          handlersRef.current.onSearch?.()
          break
        case 'guide':
          consoleSoundEngine.play('tab')
          handlersRef.current.onGuide?.()
          break
      }
    }

    const onWindowFocus = () => {
      lastFocusRegainedAtRef.current = performance.now()
    }

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const isTextInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)

      useConsoleStore.getState().setDetectedDevice('keyboard')
      markActivity()

      if (isTextInput) {
        if (e.key === 'Escape') {
          e.preventDefault()
          dispatchAction('back')
        }
        return
      }

      switch (e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          e.preventDefault()
          dispatchAction('up')
          break
        case 'ArrowDown':
        case 's':
        case 'S':
          e.preventDefault()
          dispatchAction('down')
          break
        case 'ArrowLeft':
        case 'a':
        case 'A':
          e.preventDefault()
          dispatchAction('left')
          break
        case 'ArrowRight':
        case 'd':
        case 'D':
          e.preventDefault()
          dispatchAction('right')
          break
        case 'Enter':
        case ' ':
          e.preventDefault()
          dispatchAction('confirm')
          break
        case 'Escape':
        case 'Backspace':
          e.preventDefault()
          dispatchAction('back')
          break
        case 'Tab':
          e.preventDefault()
          dispatchAction('options')
          break
        case 'q':
        case 'Q':
          e.preventDefault()
          dispatchAction('tabPrev')
          break
        case 'e':
        case 'E':
          e.preventDefault()
          dispatchAction('tabNext')
          break
        case 'PageUp':
          e.preventDefault()
          dispatchAction('pagePrev')
          break
        case 'PageDown':
          e.preventDefault()
          dispatchAction('pageNext')
          break
        case 'f':
        case 'F':
        case '/':
          if (e.ctrlKey || e.key === '/') {
            e.preventDefault()
            dispatchAction('search')
          }
          break
        case 'Home':
          e.preventDefault()
          dispatchAction('guide')
          break
      }
    }

    window.addEventListener('focus', onWindowFocus)
    window.addEventListener('keydown', onKeyDown)

    // Poll DualSense emulation count every 3s for accurate deduplication
    const syncDualSense = () => {
      invoke<{ connectedCount?: number; emulatingCount?: number }>('dualsense_get_state')
        .then((snap) => {
          dualSenseCountsRef.current = {
            connected: snap?.connectedCount ?? 0,
            emulating: snap?.emulatingCount ?? 0,
          }
        })
        .catch(() => {})
    }
    syncDualSense()
    const dsInterval = window.setInterval(syncDualSense, 3000)

    // Idle screensaver check every 5s
    const idleInterval = window.setInterval(() => {
      const st = useConsoleStore.getState()
      if (!st.screensaverEnabled || st.screensaverActive) return
      const idleMs = Date.now() - lastActivityAtRef.current
      if (idleMs >= st.idleMinutes * 60 * 1000) {
        st.setScreensaverActive(true)
      }
    }, 5000)

    // 60Hz Gamepad RAF polling loop
    let rafId = 0
    const pollGamepads = () => {
      const now = performance.now()
      const rawPads =
        typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function'
          ? Array.from(navigator.getGamepads())
          : []

      const st = useConsoleStore.getState()
      const descriptors = dedupeLogicalGamepads(
        rawPads.map((p) => (p ? { index: p.index, id: p.id, connected: p.connected } : null)),
        dualSenseCountsRef.current.emulating,
        dualSenseCountsRef.current.connected,
        st.glyphOverride,
      )

      const activePads = descriptors.filter((d) => !d.isShadowedDuplicate)
      if (activePads.length !== prevPadCountRef.current) {
        if (activePads.length > prevPadCountRef.current && activePads[0]) {
          st.setDetectedDevice(activePads[0].glyphFamily, activePads.length)
          st.setControllerDisconnectedModal(false)
          consoleSoundEngine.play('toast')
          toast.success(`Controller connected (${activePads[0].glyphFamily.toUpperCase()})`)
        } else if (activePads.length === 0 && prevPadCountRef.current > 0) {
          st.setDetectedDevice(st.detectedGlyphFamily, 0)
          st.setControllerDisconnectedModal(true)
        }
        prevPadCountRef.current = activePads.length
      }

      if (!isWithinSwallowWindow(lastFocusRegainedAtRef.current, now)) {
        let combinedDir: NavDirection | null = null

        for (const desc of activePads) {
          const pad = rawPads[desc.index]
          if (!pad) continue

          const lx = pad.axes[0] ?? 0
          const ly = pad.axes[1] ?? 0
          const stickDir = applyStickDeadzoneAndLock(lx, ly, prevStickDirRef.current)
          if (stickDir) combinedDir = stickDir

          // D-Pad buttons 12=Up, 13=Down, 14=Left, 15=Right
          if (pad.buttons[12]?.pressed) combinedDir = 'up'
          else if (pad.buttons[13]?.pressed) combinedDir = 'down'
          else if (pad.buttons[14]?.pressed) combinedDir = 'left'
          else if (pad.buttons[15]?.pressed) combinedDir = 'right'

          const prevBtns = prevButtonsRef.current[desc.index] || []
          const curBtns = pad.buttons.map((b) => Boolean(b?.pressed))
          prevButtonsRef.current[desc.index] = curBtns

          const justPressed = (idx: number) => Boolean(curBtns[idx] && !prevBtns[idx])

          for (let bIdx = 0; bIdx <= 3; bIdx++) {
            if (justPressed(bIdx)) {
              st.setDetectedDevice(desc.glyphFamily, activePads.length)
              const faceAction = mapFaceButtonAction(bIdx, st.confirmSwap)
              if (faceAction) dispatchAction(faceAction)
            }
          }

          if (justPressed(4)) dispatchAction('tabPrev')
          if (justPressed(5)) dispatchAction('tabNext')
          if (justPressed(6)) dispatchAction('pagePrev')
          if (justPressed(7)) dispatchAction('pageNext')
          if (justPressed(8)) dispatchAction('search')
          if (justPressed(9)) dispatchAction('options')
          if (justPressed(16)) dispatchAction('guide')
        }

        prevStickDirRef.current = combinedDir
        const stepDir = repeatTimerRef.current.update(combinedDir, now)
        if (stepDir) {
          if (activePads[0]) {
            st.setDetectedDevice(activePads[0].glyphFamily, activePads.length)
          }
          dispatchAction(stepDir)
        }
      }

      rafId = window.requestAnimationFrame(pollGamepads)
    }

    rafId = window.requestAnimationFrame(pollGamepads)

    return () => {
      window.removeEventListener('focus', onWindowFocus)
      window.removeEventListener('keydown', onKeyDown)
      window.clearInterval(dsInterval)
      window.clearInterval(idleInterval)
      window.cancelAnimationFrame(rafId)
    }
  }, [active])
}
