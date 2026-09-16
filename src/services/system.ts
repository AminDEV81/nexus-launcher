import { call } from './tauri'

export interface CpuSpecs {
  brand: string
  vendor_id: string
  physical_cores: number
  logical_cores: number
  frequency_mhz: number
  usage_percent: number
}

export interface GpuSpecs {
  name: string
  vendor: string
  driver_version: string
  vram_bytes: number | null
  is_primary: boolean
}

export interface MemorySpecs {
  total_bytes: number
  used_bytes: number
  free_bytes: number
  total_swap_bytes: number
  used_swap_bytes: number
}

export interface DiskSpecs {
  name: string
  mount_point: string
  total_bytes: number
  available_bytes: number
  file_system: string
  kind: string
  is_removable: boolean
}

export interface MotherboardSpecs {
  manufacturer: string | null
  product: string | null
  bios_version: string | null
  bios_date: string | null
}

export interface DisplaySpecs {
  name: string | null
  width: number
  height: number
  scale_factor: number
  is_primary: boolean
}

export interface SystemSpecs {
  os_name: string
  os_version: string
  kernel_version: string
  os_build: string | null
  host_name: string
  cpu_arch: string
  uptime_seconds: number
  boot_time: number
  cpu: CpuSpecs
  gpus: GpuSpecs[]
  memory: MemorySpecs
  disks: DiskSpecs[]
  motherboard: MotherboardSpecs
  displays: DisplaySpecs[]
}

export interface LiveSystemMetrics {
  memory: MemorySpecs
  cpu_usage_percent: number
  cpu_frequency_mhz: number
}

export interface BoostStepResult {
  id: string
  label: string
  applied: boolean
  detail: string
  metric?: string | null
}

export function getSystemSpecs(): Promise<SystemSpecs> {
  return call<SystemSpecs>('get_system_specs')
}

export function getLiveMetrics(): Promise<LiveSystemMetrics> {
  return call<LiveSystemMetrics>('get_live_metrics')
}

export function boostRam(): Promise<BoostStepResult> {
  return call<BoostStepResult>('boost_ram_only')
}
