import { call } from '@/services/tauri'
import type {
  HotkeyStatus,
  MonitorDto,
  OverlayNotification,
  OverlayConfig,
  OverlayMetrics,
  TelemetryProviderStatus,
} from '../types/overlay'

export function getOverlayConfig(): Promise<OverlayConfig> {
  return call<OverlayConfig>('get_overlay_config')
}

/** Persists the config; resolves with the sanitised config the backend applied. */
export function saveOverlayConfig(config: OverlayConfig): Promise<OverlayConfig> {
  return call<OverlayConfig>('save_overlay_config', { config })
}

export function getOverlayMetrics(): Promise<OverlayMetrics> {
  return call<OverlayMetrics>('get_overlay_metrics')
}

export function startOverlayTelemetry(): Promise<void> {
  return call<void>('start_overlay_telemetry')
}

export function stopOverlayTelemetry(): Promise<void> {
  return call<void>('stop_overlay_telemetry')
}

export function toggleOverlayWindow(show?: boolean): Promise<boolean> {
  return call<boolean>('toggle_overlay_window', { show })
}

export function setOverlayClickThrough(enabled: boolean): Promise<void> {
  return call<void>('set_overlay_click_through', { enabled })
}

export function getOverlayMonitors(): Promise<MonitorDto[]> {
  return call<MonitorDto[]>('get_overlay_monitors')
}

export function getTelemetryStatus(): Promise<TelemetryProviderStatus> {
  return call<TelemetryProviderStatus>('get_telemetry_status')
}

export function isOverlayVisible(): Promise<boolean> {
  return call<boolean>('is_overlay_visible')
}

export function getOverlayHotkeyStatus(): Promise<HotkeyStatus> {
  return call<HotkeyStatus>('get_overlay_hotkey_status')
}

/** Resolves `true` when the overlay was showing and the notification was delivered. */
export function pushOverlayNotification(notification: OverlayNotification): Promise<boolean> {
  return call<boolean>('push_overlay_notification', { notification })
}
