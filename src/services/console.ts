import { call } from './tauri'

export interface ConsoleMonitorDto {
  index: number
  name: string
  width: number
  height: number
  scale_factor: number
  is_primary: boolean
}

export interface ControllerBatteryStatus {
  slot_index: number
  name: string
  glyph_family: 'playstation' | 'xbox'
  connected: boolean
  battery_percent: number
  charging: boolean
  emulation_active: boolean
}

export interface ConsoleSystemStatus {
  in_console_mode: boolean
  quick_menu_open: boolean
  guide_listener_active: boolean
  master_volume: number
  system_battery_percent: number | null
  system_battery_charging: boolean
  controllers: ControllerBatteryStatus[]
  launched_with_console_flag: boolean
}

export type ConsolePowerAction =
  | 'sleep'
  | 'hibernate'
  | 'restart'
  | 'shutdown'
  | 'lock'
  | 'cancel'

export function consoleModeEnter(monitorIndex?: number): Promise<boolean> {
  return call<boolean>('console_mode_enter', { monitorIndex: monitorIndex ?? null })
}

export function consoleModeExit(): Promise<boolean> {
  return call<boolean>('console_mode_exit')
}

export function consoleListMonitors(): Promise<ConsoleMonitorDto[]> {
  return call<ConsoleMonitorDto[]>('console_list_monitors')
}

export function consoleGetSystemStatus(): Promise<ConsoleSystemStatus> {
  return call<ConsoleSystemStatus>('console_get_system_status')
}

export function consoleGetMasterVolume(): Promise<number> {
  return call<number>('console_get_master_volume')
}

export function consoleSetMasterVolume(level: number): Promise<number> {
  return call<number>('console_set_master_volume', { level: Math.round(level) })
}

export function consoleResumeGame(gameId?: string): Promise<boolean> {
  return call<boolean>('console_resume_game', { gameId: gameId ?? null })
}

export function consoleToggleQuickMenu(visible?: boolean): Promise<boolean> {
  return call<boolean>('console_toggle_quick_menu', { visible: visible ?? null })
}

export function consoleGuideListenerStart(): Promise<boolean> {
  return call<boolean>('console_guide_listener_start')
}

export function consoleGuideListenerStop(): Promise<boolean> {
  return call<boolean>('console_guide_listener_stop')
}

export function consolePowerAction(action: ConsolePowerAction): Promise<void> {
  return call<void>('console_power_action', { action })
}

export function consoleExtractDominantColor(gameId: string): Promise<string> {
  return call<string>('console_extract_dominant_color', { gameId })
}
