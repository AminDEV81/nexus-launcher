import { useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { toast } from 'sonner'
import {
  applyStickDeadzoneAndLock,
  dedupeLogicalGamepads,
  describeGlyphFamily,
  isUsableBrowserPad,
  isWithinSwallowWindow,
  mapFaceButtonAction,
  nativeSlotToPadFrame,
  shouldUseNativePads,
  StepRepeatTimer,
  type ConsoleAction,
  type NativePadSlotFrame,
  type PadFrame,
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
  const nativeFramesRef = useRef<PadFrame[]>([])
  const needNativeRef = useRef(false)
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
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)

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

    // Any first interaction (key, pointer or controller) unlocks WebAudio so UI sounds always work.
    const unlockAudio = () => consoleSoundEngine.unlock()

    window.addEventListener('focus', onWindowFocus)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keydown', unlockAudio, { passive: true })
    window.addEventListener('pointerdown', unlockAudio, { passive: true })
    window.addEventListener('gamepadconnected', unlockAudio)

    // Poll DualSense counts every 3s for accurate deduplication and glyph detection.
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

    // Native DualSense input (Rust engine). Only polled while the browser cannot see a usable pad.
    let nativeInFlight = false
    const pollNative = () => {
      if (!needNativeRef.current || nativeInFlight) return
      nativeInFlight = true
      invoke<NativePadSlotFrame[]>('console_get_native_pad_input')
        .then((slots) => {
          nativeFramesRef.current = (slots ?? []).map(nativeSlotToPadFrame)
        })
        .catch(() => {
          nativeFramesRef.current = []
        })
        .finally(() => {
          nativeInFlight = false
        })
    }
    const nativeInterval = window.setInterval(pollNative, 16)

    // Idle screensaver check every 5s
    const idleInterval = window.setInterval(() => {
      const st = useConsoleStore.getState()
      if (!st.screensaverEnabled || st.screensaverActive) return
      const idleMs = Date.now() - lastActivityAtRef.current
      if (idleMs >= st.idleMinutes * 60 * 1000) {
        st.setScreensaverActive(true)
      }
    }, 5000)

    // 60Hz polling loop over every controller source (browser Gamepad API + native DualSense).
    let rafId = 0
    const pollGamepads = () => {
      const now = performance.now()
      const rawPads =
        typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function'
          ? Array.from(navigator.getGamepads())
          : []

      const st = useConsoleStore.getState()
      const counts = dualSenseCountsRef.current
      const descriptors = dedupeLogicalGamepads(
        rawPads.map((p) => (p ? { index: p.index, id: p.id, connected: p.connected } : null)),
        counts.emulating,
        counts.connected,
        st.glyphOverride,
      )

      const frames: PadFrame[] = []
      for (const desc of descriptors) {
        if (desc.isShadowedDuplicate) continue
        const pad = rawPads[desc.index]
        if (!pad || !isUsableBrowserPad(pad.id, pad.mapping)) continue
        frames.push({
          key: `web:${desc.index}`,
          glyphFamily: desc.glyphFamily,
          lx: pad.axes[0] ?? 0,
          ly: pad.axes[1] ?? 0,
          buttons: pad.buttons.map((b) => Boolean(b?.pressed)),
        })
      }

      needNativeRef.current = shouldUseNativePads(frames.length, counts.connected)
      if (needNativeRef.current) {
        for (const native of nativeFramesRef.current) {
          frames.push(
            st.glyphOverride === 'auto' ? native : { ...native, glyphFamily: st.glyphOverride },
          )
        }
      } else if (nativeFramesRef.current.length > 0) {
        nativeFramesRef.current = []
      }

      if (frames.length !== prevPadCountRef.current) {
        if (frames.length > prevPadCountRef.current && frames[0]) {
          st.setDetectedDevice(frames[0].glyphFamily, frames.length)
          st.setControllerDisconnectedModal(false)
          consoleSoundEngine.unlock()
          consoleSoundEngine.play('toast')
          toast.success(`${describeGlyphFamily(frames[0].glyphFamily)} connected`, {
            id: 'console-pad-connected',
            duration: 2200,
          })
        } else if (frames.length === 0 && prevPadCountRef.current > 0) {
          st.setDetectedDevice(st.detectedGlyphFamily, 0)
          st.setControllerDisconnectedModal(true)
        }
        prevPadCountRef.current = frames.length
      }

      if (!isWithinSwallowWindow(lastFocusRegainedAtRef.current, now)) {
        let combinedDir: NavDirection | null = null

        for (const frame of frames) {
          const stickDir = applyStickDeadzoneAndLock(frame.lx, frame.ly, prevStickDirRef.current)
          if (stickDir) combinedDir = stickDir

          // D-Pad buttons 12=Up, 13=Down, 14=Left, 15=Right
          if (frame.buttons[12]) combinedDir = 'up'
          else if (frame.buttons[13]) combinedDir = 'down'
          else if (frame.buttons[14]) combinedDir = 'left'
          else if (frame.buttons[15]) combinedDir = 'right'

          const prevBtns = prevButtonsRef.current[frame.key] || []
          const curBtns = frame.buttons
          prevButtonsRef.current[frame.key] = curBtns

          const justPressed = (idx: number) => Boolean(curBtns[idx] && !prevBtns[idx])
          if (curBtns.some((pressed, i) => pressed && !prevBtns[i])) {
            // A controller press is real user activity: wake audio and the idle timer.
            consoleSoundEngine.unlock()
            st.setDetectedDevice(frame.glyphFamily, frames.length)
          }

          for (let bIdx = 0; bIdx <= 3; bIdx++) {
            if (justPressed(bIdx)) {
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
          if (frames[0]) st.setDetectedDevice(frames[0].glyphFamily, frames.length)
          dispatchAction(stepDir)
        }
      }

      rafId = window.requestAnimationFrame(pollGamepads)
    }

    rafId = window.requestAnimationFrame(pollGamepads)

    return () => {
      window.removeEventListener('focus', onWindowFocus)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keydown', unlockAudio)
      window.removeEventListener('pointerdown', unlockAudio)
      window.removeEventListener('gamepadconnected', unlockAudio)
      window.clearInterval(dsInterval)
      window.clearInterval(nativeInterval)
      window.clearInterval(idleInterval)
      window.cancelAnimationFrame(rafId)
    }
  }, [active])
}
