import { useEffect, useRef } from 'react'
import type { NotificationSettings, OverlayMetrics, OverlayNotification } from '../types/overlay'

type Push = (n: OverlayNotification) => void

interface AlertRule {
  id: string
  /** Current value, or `null` when the sensor is unavailable. */
  value: number | null
  threshold: number
  /** Value must drop this far below the threshold before the alert re-arms. */
  hysteresis: number
  /** `true` → alert when value <= threshold (battery), else when value >= threshold. */
  below?: boolean
  title: (value: number) => string
  body: string
}

interface AlertState {
  hits: number
  active: boolean
  lastFiredAt: number
}

/** A reading must breach the threshold this many consecutive polls (filters spikes). */
const REQUIRED_HITS = 3
const COOLDOWN_MS = 90_000

/**
 * Turns hardware readings into in-game warnings. Each rule fires once,
 * re-arms only after the value recovers past a hysteresis band, and is
 * rate-limited — so a sensor hovering at the threshold can't spam the screen.
 */
export function useHardwareAlerts(
  metrics: OverlayMetrics,
  settings: NotificationSettings,
  push: Push,
): void {
  const states = useRef<Record<string, AlertState>>({})
  const lastGame = useRef<string | null>(null)

  useEffect(() => {
    if (!settings.enabled) return

    // "Now playing" once per detected game.
    const title = metrics.game_title
    if (title && title !== lastGame.current) {
      push({ id: 'now-playing', kind: 'info', title: 'Now playing', body: title })
    }
    lastGame.current = title ?? lastGame.current

    if (!settings.alerts_enabled) return

    const vramPercent =
      metrics.gpu_vram_used_bytes != null && metrics.gpu_vram_total_bytes
        ? (metrics.gpu_vram_used_bytes / metrics.gpu_vram_total_bytes) * 100
        : null

    const rules: AlertRule[] = [
      {
        id: 'alert-gpu-temp',
        value: metrics.gpu_temp,
        threshold: settings.gpu_temp_warn_c,
        hysteresis: 5,
        title: (v) => `GPU temperature ${v.toFixed(0)}°C`,
        body: 'Check case airflow and the GPU fan curve.',
      },
      {
        id: 'alert-gpu-hotspot',
        value: metrics.gpu_hotspot_temp,
        threshold: settings.gpu_hotspot_warn_c,
        hysteresis: 5,
        title: (v) => `GPU hotspot ${v.toFixed(0)}°C`,
        body: 'Junction temperature is high — the GPU may throttle.',
      },
      {
        id: 'alert-cpu-temp',
        value: metrics.cpu_temp,
        threshold: settings.cpu_temp_warn_c,
        hysteresis: 5,
        title: (v) => `CPU temperature ${v.toFixed(0)}°C`,
        body: 'Check the CPU cooler and case airflow.',
      },
      {
        id: 'alert-vram',
        value: vramPercent,
        threshold: settings.vram_warn_percent,
        hysteresis: 4,
        title: (v) => `VRAM ${v.toFixed(0)}% used`,
        body: 'Lower texture quality to avoid stutter.',
      },
      {
        id: 'alert-battery',
        value: metrics.battery_charging ? null : metrics.battery_percent,
        threshold: settings.low_battery_percent,
        hysteresis: 5,
        below: true,
        title: (v) => `Battery low — ${v.toFixed(0)}%`,
        body: 'Plug in your charger.',
      },
    ]

    const now = Date.now()
    for (const rule of rules) {
      const state = (states.current[rule.id] ??= { hits: 0, active: false, lastFiredAt: 0 })

      if (rule.value == null || !Number.isFinite(rule.value)) {
        state.hits = 0
        continue
      }

      const breached = rule.below ? rule.value <= rule.threshold : rule.value >= rule.threshold
      const recovered = rule.below
        ? rule.value > rule.threshold + rule.hysteresis
        : rule.value < rule.threshold - rule.hysteresis

      if (breached) {
        state.hits += 1
        if (!state.active && state.hits >= REQUIRED_HITS && now - state.lastFiredAt > COOLDOWN_MS) {
          state.active = true
          state.lastFiredAt = now
          push({
            id: rule.id,
            kind: 'warning',
            title: rule.title(rule.value),
            body: rule.body,
            duration_ms: 7000,
          })
        }
      } else {
        state.hits = 0
        if (state.active && recovered) state.active = false
      }
    }
    // `metrics` identity changes every poll — that is the intended trigger.
  }, [metrics, settings, push])
}
