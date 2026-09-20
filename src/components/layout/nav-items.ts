import type { LucideIcon } from 'lucide-react'
import {
  Gamepad2,
  History,
  HardDrive,
  FolderHeart,
  EyeOff,
  Compass,
  Bookmark,
  BarChart3,
  Settings,
  Download,
  Sparkles,
} from 'lucide-react'

export interface NavItem {
  label: string
  path: string
  icon: LucideIcon
}

/** Discovery shelf above the library — the IGDB-backed storefront feed
 *  plus the wishlist it feeds into. */
export const DISCOVER_NAV_ITEMS: NavItem[] = [
  { label: 'Game Hub', path: '/hub', icon: Compass },
  { label: 'Wishlist', path: '/wishlist', icon: Bookmark },
  { label: 'Download Games', path: '/downloads', icon: Download },
]

/** Primary library views. Order here is the order rendered in the sidebar. */
export const LIBRARY_NAV_ITEMS: NavItem[] = [
  { label: 'Library', path: '/', icon: Gamepad2 },
  { label: 'Recently Played', path: '/recently-played', icon: History },
  { label: 'Installed', path: '/installed', icon: HardDrive },
  { label: 'Collections', path: '/collections', icon: FolderHeart },
  { label: 'Hidden', path: '/hidden', icon: EyeOff },
  { label: 'Memory', path: '/memory', icon: Sparkles },
]

/** Secondary items, rendered under a "Manage" divider. */
export const MANAGE_NAV_ITEMS: NavItem[] = [
  { label: 'Stats', path: '/stats', icon: BarChart3 },
  { label: 'Settings', path: '/settings', icon: Settings },
]
