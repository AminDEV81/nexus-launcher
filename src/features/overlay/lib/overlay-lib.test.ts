import { describe, expect, it } from 'vitest'
import { buildHudModel } from './derive'
import { loadSeverity, tempSeverity } from './severity'
import { fmtRate, fmtSession } from './format'
import {
  DEFAULT_CONFIG,
  DEMO_METRICS,
  EMPTY_METRICS,
  normalizeConfig,
} from '../store/overlay-store'
import { THEME_REGISTRY } from '../themes/theme-registry'
import { useNotificationStore } from '../store/notification-store'

const tokens = THEME_REGISTRY.cyberpunk.tokens

describe('severity', () => {
  it('classifies temperatures per sensor type', () => {
    expect(tempSeverity(70, 'gpu')).toBe('ok')
    expect(tempSeverity(85, 'gpu')).toBe('warn')
    expect(tempSeverity(95, 'gpu')).toBe('danger')
    expect(tempSeverity(95, 'hotspot')).toBe('warn')
    expect(tempSeverity(null, 'cpu')).toBe('ok')
    expect(loadSeverity(97)).toBe('danger')
  })
})

describe('format', () => {
  it('formats rates and sessions', () => {
    expect(fmtRate(2_500_000)).toEqual({ value: '2.5', unit: 'MB/s' })
    expect(fmtRate(48_000)).toEqual({ value: '48', unit: 'KB/s' })
    expect(fmtSession(3725)).toBe('1:02:05')
    expect(fmtSession(65)).toBe('1:05')
  })
})

describe('buildHudModel', () => {
  it('exposes the GPU hotspot only when toggled on', () => {
    const on = buildHudModel(DEMO_METRICS, DEFAULT_CONFIG.metrics, tokens)
    expect(on.groups.find((g) => g.id === 'gpu')?.stats.some((s) => s.key === 'hotspot')).toBe(true)

    const off = buildHudModel(
      DEMO_METRICS,
      { ...DEFAULT_CONFIG.metrics, gpu_hotspot: false },
      tokens,
    )
    expect(off.groups.find((g) => g.id === 'gpu')?.stats.some((s) => s.key === 'hotspot')).toBe(
      false,
    )
  })

  it('marks a hot hotspot as danger and survives empty metrics', () => {
    const hot = buildHudModel(
      { ...DEMO_METRICS, gpu_hotspot_temp: 108 },
      DEFAULT_CONFIG.metrics,
      tokens,
    )
    const stat = hot.groups.find((g) => g.id === 'gpu')?.stats.find((s) => s.key === 'hotspot')
    expect(stat?.color).toBe(tokens.dangerColor)

    const empty = buildHudModel(EMPTY_METRICS, DEFAULT_CONFIG.metrics, tokens)
    expect(empty.fps.text).toBe('--')
    expect(empty.session).toBeNull()
  })
})

describe('config + notifications', () => {
  it('fills fields missing from configs saved by older builds', () => {
    const cfg = normalizeConfig({ theme_id: 'matrix', metrics: { fps: false } as never })
    expect(cfg.metrics.fps).toBe(false)
    expect(cfg.metrics.gpu_hotspot).toBe(true)
    expect(cfg.notifications.duration_ms).toBe(5000)
  })

  it('replaces a toast with the same id and caps the stack', () => {
    const { push, clear } = useNotificationStore.getState()
    clear()
    const d = { duration: 5000, max: 2 }
    push({ id: 'a', kind: 'info', title: 'one' }, d)
    push({ id: 'a', kind: 'warning', title: 'one again' }, d)
    expect(useNotificationStore.getState().items).toHaveLength(1)
    push({ kind: 'info', title: 'two' }, d)
    push({ kind: 'info', title: 'three' }, d)
    expect(useNotificationStore.getState().items.map((i) => i.title)).toEqual(['two', 'three'])
    clear()
  })
})
