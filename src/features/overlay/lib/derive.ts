import type { MetricToggles, OverlayMetrics } from '../types/overlay'
import type { ThemeVisualTokens } from '../themes/theme-tokens'
import { formatBytesGb, loadSeverity, severityColor, tempSeverity } from './severity'
import { fmtRate, fmtSession, fmtTempValue } from './format'

export interface HudStat {
  key: string
  label: string
  value: string
  unit?: string
  /** Inline colour override (severity); `undefined` keeps the theme colour. */
  color?: string
}

export interface HudBar {
  percent: number | null
  text: string
  color: string
}

export interface HudGroup {
  id: 'gpu' | 'cpu' | 'ram' | 'net' | 'disk'
  title: string
  /** Headline reading (usage %). */
  main: HudBar | null
  /** Second bar (VRAM). */
  extra: (HudBar & { label: string }) | null
  stats: HudStat[]
}

export interface HudModel {
  fps: {
    show: boolean
    value: number | null
    text: string
    color: string | undefined
    frametime: HudStat | null
    lows: HudStat[]
    graph: boolean
  }
  session: { title: string; time: string } | null
  groups: HudGroup[]
  footer: { battery: boolean; clock: boolean }
}

const WARN = '#fbbf24'

export function perfColor(fps: number | null, tokens: ThemeVisualTokens): string | undefined {
  if (fps == null) return undefined
  if (fps < 30) return tokens.dangerColor
  if (fps < 55) return WARN
  return undefined
}

function pingColor(ms: number | null, tokens: ThemeVisualTokens): string | undefined {
  if (ms == null) return undefined
  if (ms > 120) return tokens.dangerColor
  if (ms > 60) return WARN
  return undefined
}

const pct = (used: number | null, total: number | null): number | null =>
  used != null && total ? (used / total) * 100 : null

/** Turns raw metrics + user toggles into a layout-independent description of what to draw. */
export function buildHudModel(
  m: OverlayMetrics,
  t: MetricToggles,
  tokens: ThemeVisualTokens,
): HudModel {
  const accent = tokens.accentColor
  const loadColor = (p: number | null) => severityColor(loadSeverity(p), tokens) ?? accent

  // ---------- FPS ----------
  const lows: HudStat[] = []
  if (t.fps_one_percent_low)
    lows.push({
      key: 'low1',
      label: '1%',
      value: m.fps_one_percent_low != null ? m.fps_one_percent_low.toFixed(0) : '--',
    })
  if (t.fps_point_one_percent_low)
    lows.push({
      key: 'low01',
      label: '0.1%',
      value: m.fps_point_one_percent_low != null ? m.fps_point_one_percent_low.toFixed(0) : '--',
    })

  const fps: HudModel['fps'] = {
    show: t.fps,
    value: m.fps,
    text: m.fps != null ? m.fps.toFixed(0) : '--',
    color: perfColor(m.fps, tokens),
    frametime: t.frametime
      ? {
          key: 'ft',
          label: 'FT',
          value: m.frametime_ms != null ? m.frametime_ms.toFixed(1) : '--',
          unit: 'ms',
        }
      : null,
    lows,
    graph: t.frametime_graph && (m.frametime_history?.length ?? 0) > 1,
  }

  // ---------- GPU ----------
  const gpuStats: HudStat[] = []
  if (t.gpu_temp)
    gpuStats.push({
      key: 'temp',
      label: 'TEMP',
      value: fmtTempValue(m.gpu_temp),
      unit: '°C',
      color: severityColor(tempSeverity(m.gpu_temp, 'gpu'), tokens),
    })
  if (t.gpu_hotspot)
    gpuStats.push({
      key: 'hotspot',
      label: 'HOT',
      value: fmtTempValue(m.gpu_hotspot_temp),
      unit: '°C',
      color: severityColor(tempSeverity(m.gpu_hotspot_temp, 'hotspot'), tokens),
    })
  if (t.gpu_memory_temp)
    gpuStats.push({
      key: 'memtemp',
      label: 'MEM',
      value: fmtTempValue(m.gpu_memory_temp),
      unit: '°C',
      color: severityColor(tempSeverity(m.gpu_memory_temp, 'memory'), tokens),
    })
  if (t.gpu_clock)
    gpuStats.push({
      key: 'clock',
      label: 'CLK',
      value: m.gpu_clock_mhz != null ? String(m.gpu_clock_mhz) : '--',
      unit: 'MHz',
    })
  if (t.gpu_fan)
    gpuStats.push({
      key: 'fan',
      label: 'FAN',
      value: m.gpu_fan_percent != null ? m.gpu_fan_percent.toFixed(0) : '--',
      unit: '%',
    })
  if (t.gpu_power)
    gpuStats.push({
      key: 'power',
      label: 'PWR',
      value: m.gpu_power_w != null ? m.gpu_power_w.toFixed(0) : '--',
      unit: 'W',
    })

  const vramPct = pct(m.gpu_vram_used_bytes, m.gpu_vram_total_bytes)
  const gpu: HudGroup = {
    id: 'gpu',
    title: 'GPU',
    main: t.gpu_usage
      ? {
          percent: m.gpu_usage,
          text: m.gpu_usage != null ? `${m.gpu_usage.toFixed(0)}` : '--',
          color: loadColor(m.gpu_usage),
        }
      : null,
    extra: t.gpu_vram
      ? {
          label: 'VRAM',
          percent: vramPct,
          text:
            m.gpu_vram_used_bytes != null
              ? `${formatBytesGb(m.gpu_vram_used_bytes)}${
                  m.gpu_vram_total_bytes ? `/${formatBytesGb(m.gpu_vram_total_bytes, 0)}` : ''
                } GB`
              : '--',
          color: loadColor(vramPct),
        }
      : null,
    stats: gpuStats,
  }

  // ---------- CPU ----------
  const cpuStats: HudStat[] = []
  if (t.cpu_temp)
    cpuStats.push({
      key: 'temp',
      label: 'TEMP',
      value: fmtTempValue(m.cpu_temp),
      unit: '°C',
      color: severityColor(tempSeverity(m.cpu_temp, 'cpu'), tokens),
    })
  if (t.cpu_clock)
    cpuStats.push({
      key: 'clock',
      label: 'CLK',
      value: m.cpu_clock_ghz != null ? m.cpu_clock_ghz.toFixed(2) : '--',
      unit: 'GHz',
    })
  if (t.cpu_power)
    cpuStats.push({
      key: 'power',
      label: 'PWR',
      value: m.cpu_power_w != null ? m.cpu_power_w.toFixed(0) : '--',
      unit: 'W',
    })
  if (t.cpu_cores)
    cpuStats.push({
      key: 'cores',
      label: 'THREADS',
      value: m.cpu_cores != null ? String(m.cpu_cores) : '--',
    })
  const cpu: HudGroup = {
    id: 'cpu',
    title: 'CPU',
    main: t.cpu_usage
      ? {
          percent: m.cpu_usage,
          text: m.cpu_usage != null ? `${m.cpu_usage.toFixed(0)}` : '--',
          color: loadColor(m.cpu_usage),
        }
      : null,
    extra: null,
    stats: cpuStats,
  }

  // ---------- RAM ----------
  const ramPct = pct(m.ram_used_bytes, m.ram_total_bytes)
  const ramStats: HudStat[] = []
  if (t.ram_used)
    ramStats.push({
      key: 'used',
      label: 'USED',
      value:
        m.ram_used_bytes != null
          ? `${formatBytesGb(m.ram_used_bytes)}${
              m.ram_total_bytes ? `/${formatBytesGb(m.ram_total_bytes, 0)}` : ''
            }`
          : '--',
      unit: 'GB',
    })
  if (t.ram_available)
    ramStats.push({
      key: 'free',
      label: 'FREE',
      value: formatBytesGb(m.ram_available_bytes),
      unit: 'GB',
    })
  const ram: HudGroup = {
    id: 'ram',
    title: 'RAM',
    main: t.ram_percentage
      ? {
          percent: ramPct,
          text: ramPct != null ? ramPct.toFixed(0) : '--',
          color: loadColor(ramPct),
        }
      : null,
    extra: null,
    stats: ramStats,
  }

  // ---------- Network / Disk ----------
  const netStats: HudStat[] = []
  if (t.ping)
    netStats.push({
      key: 'ping',
      label: 'PING',
      value: m.ping_ms != null ? m.ping_ms.toFixed(0) : '--',
      unit: 'ms',
      color: pingColor(m.ping_ms, tokens),
    })
  if (t.network_download) {
    const r = fmtRate(m.network_download_bps)
    netStats.push({ key: 'down', label: '↓', value: r.value, unit: r.unit })
  }
  if (t.network_upload) {
    const r = fmtRate(m.network_upload_bps)
    netStats.push({ key: 'up', label: '↑', value: r.value, unit: r.unit })
  }
  const net: HudGroup = { id: 'net', title: 'NET', main: null, extra: null, stats: netStats }

  const diskStats: HudStat[] = []
  if (t.disk_read) {
    const r = fmtRate(m.disk_read_bps)
    diskStats.push({ key: 'read', label: 'READ', value: r.value, unit: r.unit })
  }
  if (t.disk_write) {
    const r = fmtRate(m.disk_write_bps)
    diskStats.push({ key: 'write', label: 'WRITE', value: r.value, unit: r.unit })
  }
  const disk: HudGroup = { id: 'disk', title: 'DISK', main: null, extra: null, stats: diskStats }

  const groups = [gpu, cpu, ram, net, disk].filter(
    (g) => g.main !== null || g.extra !== null || g.stats.length > 0,
  )

  return {
    fps,
    session:
      t.game_session && m.game_title
        ? { title: m.game_title, time: fmtSession(m.session_seconds) }
        : null,
    groups,
    footer: { battery: t.battery, clock: t.clock },
  }
}
