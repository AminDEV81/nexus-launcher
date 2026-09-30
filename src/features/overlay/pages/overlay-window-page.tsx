import React, { useCallback, useEffect, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { useOverlayStore, EMPTY_METRICS, normalizeConfig } from '../store/overlay-store'
import { useNotificationStore } from '../store/notification-store'
import { useHardwareAlerts } from '../hooks/use-hardware-alerts'
import { NotificationStack } from '../components/notification-stack'
import { ThemeRenderer } from '../themes/theme-renderer'
import { THEME_REGISTRY } from '../themes/theme-registry'
import { isOverlayVisible } from '../services/overlay'
import type { OverlayConfig, OverlayNotification, OverlayPosition } from '../types/overlay'

const POSITION_CLASSES: Record<OverlayPosition, string> = {
  'top-left': 'justify-start items-start',
  'top-right': 'justify-start items-end',
  'bottom-left': 'justify-end items-start',
  'bottom-right': 'justify-end items-end',
  'top-center': 'justify-start items-center',
  'bottom-center': 'justify-end items-center',
}

const sideOf = (pos: OverlayPosition): 'left' | 'right' | 'center' =>
  pos.endsWith('left') ? 'left' : pos.endsWith('right') ? 'right' : 'center'

export const OverlayWindowPage: React.FC = () => {
  const config = useOverlayStore((s) => s.config)
  const metrics = useOverlayStore((s) => s.metrics)
  const pushToast = useNotificationStore((s) => s.push)
  const clearToasts = useNotificationStore((s) => s.clear)
  const [visible, setVisible] = useState(false)

  const notif = config.notifications

  const pushNotification = useCallback(
    (n: OverlayNotification) => {
      const { notifications } = useOverlayStore.getState().config
      if (!notifications.enabled) return
      pushToast(n, { duration: notifications.duration_ms, max: notifications.max_visible })
    },
    [pushToast],
  )

  // Transparent root + initial state + backend subscriptions.
  useEffect(() => {
    document.documentElement.setAttribute('data-overlay-window', 'true')
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
    document.body.style.overflow = 'hidden'

    // Never flash the demo numbers the store uses for the settings preview.
    useOverlayStore.setState({ metrics: EMPTY_METRICS })

    let active = true
    const unlisteners: Array<() => void> = []

    void (async () => {
      await useOverlayStore.getState().loadConfig()

      // Subscribe first, then read the current state, so a show/hide that
      // lands in between can't be missed.
      const subs = await Promise.all([
        listen<boolean>('overlay://visibility', (e) => {
          setVisible(Boolean(e.payload))
          if (!e.payload) clearToasts()
        }),
        // Settings changed in the main window → apply live, no reload.
        listen<OverlayConfig>('overlay://config-changed', (e) => {
          useOverlayStore.setState({ config: normalizeConfig(e.payload) })
        }),
        listen<OverlayNotification>('overlay://notification', (e) => pushNotification(e.payload)),
      ])
      if (!active) {
        subs.forEach((un) => un())
        return
      }
      unlisteners.push(...subs)

      const initiallyVisible = await isOverlayVisible().catch(() => true)
      if (active) setVisible(initiallyVisible)
    })()

    return () => {
      active = false
      unlisteners.forEach((un) => un())
    }
  }, [clearToasts, pushNotification])

  // Poll only while visible. Telemetry itself is started/stopped by the
  // backend together with the window, so the page must not register a
  // consumer of its own.
  useEffect(() => {
    if (!visible) return
    let cancelled = false
    const intervalMs = Math.max(100, config.refresh_interval_ms || 500)

    const tick = async () => {
      if (!cancelled) await useOverlayStore.getState().pollMetrics()
    }
    void tick()
    const timer = setInterval(() => void tick(), intervalMs)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [visible, config.refresh_interval_ms])

  useHardwareAlerts(metrics, notif, pushNotification)

  const themeId = config.theme_id || 'cyberpunk'
  const accent = (THEME_REGISTRY[themeId] ?? THEME_REGISTRY.cyberpunk).tokens.accentColor
  const posClass = POSITION_CLASSES[config.position] || POSITION_CLASSES['top-left']
  const sameCorner = notif.position === config.position
  const stackAtBottom = config.position.startsWith('bottom')

  const stack = (
    <NotificationStack
      accent={accent}
      side={sideOf(notif.position)}
      className={sameCorner ? (stackAtBottom ? 'mb-2' : 'mt-2') : ''}
    />
  )

  if (!visible) return null

  return (
    <>
      <div
        className={`pointer-events-none fixed inset-0 z-[9999] flex select-none flex-col p-4 ${posClass}`}
      >
        {/* Same corner as the HUD: stack the toasts next to it instead of on top of it. */}
        {sameCorner && stackAtBottom && stack}
        <ThemeRenderer
          themeId={themeId}
          metrics={metrics}
          toggles={config.metrics}
          scale={config.scale || 1.0}
          opacity={config.opacity ?? 0.95}
          position={config.position}
        />
        {sameCorner && !stackAtBottom && stack}
      </div>

      {!sameCorner && (
        <div
          className={`pointer-events-none fixed inset-0 z-[10000] flex flex-col p-4 ${
            POSITION_CLASSES[notif.position]
          }`}
        >
          {stack}
        </div>
      )}
    </>
  )
}

export default OverlayWindowPage
