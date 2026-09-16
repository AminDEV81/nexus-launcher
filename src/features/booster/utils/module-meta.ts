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

export interface BoosterModuleMeta {
  id: BoosterModuleId
  label: string
  description: string
  icon: LucideIcon
  /** Windows-only modules — shown with a small badge so the toggle
   *  isn't a surprise no-op on macOS/Linux. */
  windowsOnly: boolean
}

export const BOOSTER_MODULES: BoosterModuleMeta[] = [
  {
    id: 'close_apps',
    label: 'Close background apps',
    description: 'Quits known bloat — browsers, chat apps, cloud sync — if they’re running.',
    icon: Zap,
    windowsOnly: false,
  },
  {
    id: 'cpu',
    label: 'CPU priority for gaming',
    description: 'Tells Windows to favor the game over background tasks for CPU/GPU scheduling.',
    icon: Cpu,
    windowsOnly: true,
  },
  {
    id: 'ram',
    label: 'Free up RAM',
    description: 'Trims idle processes’ memory and triggers Windows’ own memory maintenance.',
    icon: MemoryStick,
    windowsOnly: true,
  },
  {
    id: 'temp',
    label: 'Clear temporary files',
    description: 'Deletes loose files sitting in the temp folder to free up disk space.',
    icon: Trash2,
    windowsOnly: false,
  },
  {
    id: 'power_plan',
    label: 'High performance power plan',
    description: 'Switches Windows to Performance mode, and restores it once you quit.',
    icon: Gauge,
    windowsOnly: true,
  },
  {
    id: 'game_mode',
    label: 'Windows Game Mode',
    description: 'Tells Windows to prioritize the foreground game over background work.',
    icon: Gamepad2,
    windowsOnly: true,
  },
  {
    id: 'gaming_priority',
    label: 'Gaming Thread & MMCSS Priority',
    description:
      'Disables MMCSS lazy mode and network throttling, dedicating 100% CPU thread slices to game rendering.',
    icon: Zap,
    windowsOnly: true,
  },
  {
    id: 'indexer_pause',
    label: 'Pause Windows Search indexer',
    description: 'Suspends background disk indexing to prevent asset loading hitches.',
    icon: Search,
    windowsOnly: true,
  },
  {
    id: 'visual_fx',
    label: 'Optimize desktop visual effects',
    description: 'Suppresses window animations to free GPU video memory and compositor cycles.',
    icon: Layers,
    windowsOnly: true,
  },
  {
    id: 'timer_res',
    label: 'High-precision 1ms timer',
    description: 'Locks system timer resolution to 1.0ms for stutter-free frame pacing.',
    icon: Timer,
    windowsOnly: true,
  },
]
