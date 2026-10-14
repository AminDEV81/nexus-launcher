import {
  Zap,
  Cpu,
  MemoryStick,
  Trash2,
  Gauge,
  Gamepad2,
  Search,
  Layers,
  Timer,
  type LucideIcon,
} from 'lucide-react'
import type { BoosterModuleId } from '../hooks/use-game-boost'

export type BoosterModuleCategory = 'cpu_kernel' | 'memory_io' | 'os_desktop'

export interface BoosterModuleMeta {
  id: BoosterModuleId
  label: string
  description: string
  icon: LucideIcon
  category: BoosterModuleCategory
  impactBadge: string
  /** Windows-only modules — shown with a small badge so the toggle
   *  isn't a surprise no-op on macOS/Linux. */
  windowsOnly: boolean
}

export const BOOSTER_CATEGORY_LABELS: Record<BoosterModuleCategory, string> = {
  cpu_kernel: 'CPU, Kernel & Frame Pacing',
  memory_io: 'Memory, Standby Cache & Disk I/O',
  os_desktop: 'Background Apps & Compositor',
}

export const BOOSTER_MODULES: BoosterModuleMeta[] = [
  {
    id: 'close_apps',
    label: 'Close Background Bloatware',
    description:
      'Terminates memory-hungry browsers, updaters, and cloud sync clients while respecting your protected whitelist.',
    icon: Zap,
    category: 'os_desktop',
    impactBadge: '+RAM & CPU',
    windowsOnly: false,
  },
  {
    id: 'ram',
    label: 'Working Set & Standby RAM Purge',
    description:
      'Calls Win32 EmptyWorkingSet across idle processes and flushes the Windows Standby Memory List to prevent micro-stutters.',
    icon: MemoryStick,
    category: 'memory_io',
    impactBadge: 'Zero Stutter',
    windowsOnly: true,
  },
  {
    id: 'cpu',
    label: 'Foreground CPU & GPU Scheduling',
    description:
      'Sets SystemResponsiveness to 0% and elevates GPU Priority (8) and Scheduling Category (High) for active games.',
    icon: Cpu,
    category: 'cpu_kernel',
    impactBadge: '+1% Low FPS',
    windowsOnly: true,
  },
  {
    id: 'gaming_priority',
    label: 'Realtime MMCSS & Network Unthrottle',
    description:
      'Disables MMCSS lazy mode, removes Windows network packet throttling, and suppresses background GameDVR capture.',
    icon: Zap,
    category: 'cpu_kernel',
    impactBadge: '-Input Lag',
    windowsOnly: true,
  },
  {
    id: 'timer_res',
    label: '1.0ms High-Precision Kernel Timer',
    description:
      'Locks Windows multimedia kernel timer resolution to 1.0ms via winmm for ultra-consistent frame delivery.',
    icon: Timer,
    category: 'cpu_kernel',
    impactBadge: '1.0ms Pacing',
    windowsOnly: true,
  },
  {
    id: 'power_plan',
    label: 'Ultimate / High Performance Power Plan',
    description:
      'Switches CPU power delivery to Ultimate Performance mode during gameplay and automatically restores your plan on exit.',
    icon: Gauge,
    category: 'cpu_kernel',
    impactBadge: 'Max Clock',
    windowsOnly: true,
  },
  {
    id: 'game_mode',
    label: 'Windows Game Mode Lock',
    description:
      'Activates native Windows Game Mode to block Windows Update driver installs and background thread preemption.',
    icon: Gamepad2,
    category: 'os_desktop',
    impactBadge: 'Core Lock',
    windowsOnly: true,
  },
  {
    id: 'indexer_pause',
    label: 'Suspend Windows Search Indexer',
    description:
      'Pauses the wsearch disk indexing service while gaming so background SSD/HDD reads never hitch asset streaming.',
    icon: Search,
    category: 'memory_io',
    impactBadge: 'Disk I/O Lock',
    windowsOnly: true,
  },
  {
    id: 'visual_fx',
    label: 'Desktop DWM & VRAM Optimizer',
    description:
      'Suppresses desktop window transition overhead to free dedicated VRAM and DWM compositor bandwidth.',
    icon: Layers,
    category: 'os_desktop',
    impactBadge: '+VRAM Free',
    windowsOnly: true,
  },
  {
    id: 'temp',
    label: 'Flush OS Temporary Scratch Files',
    description:
      'Cleans loose temporary files in %TEMP% and Windows\\Temp before launch for clean shader and scratch writes.',
    icon: Trash2,
    category: 'memory_io',
    impactBadge: 'Clean Scratch',
    windowsOnly: false,
  },
]
