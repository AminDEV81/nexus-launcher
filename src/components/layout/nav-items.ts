import { createElement } from 'react'
import type { LucideIcon, LucideProps } from 'lucide-react'
import {
  Gamepad2,
  History,
  HardDrive,
  FolderHeart,
  EyeOff,
  Compass,
  Bookmark,
  BarChart3,
  Download,
  Sparkles,
  Activity,
  Rocket,
  Music,
} from 'lucide-react'

/** Dedicated custom Sony DualSense PS5 Controller icon for the left sidebar */
export const DualSenseNavIcon: LucideIcon = ((props: LucideProps) =>
  createElement(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: props.strokeWidth ?? 2,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      className: props.className,
    },
    // DualSense sculpted outer shell with elongated PS5 grips
    createElement('path', {
      d: 'M6.2 6h11.6c2.1 0 3.7 1.8 4 4.1l.6 4.7c.3 2.2-.8 4.2-2.6 4.2-1.2 0-2.1-.8-2.8-2.1L15.8 15H8.2L7 16.9C6.3 18.2 5.4 19 4.2 19c-1.8 0-2.9-2-2.6-4.2l.6-4.7C2.5 7.8 4.1 6 6.2 6z',
    }),
    // DualSense top central touchpad trapezoid
    createElement('path', {
      d: 'M8.5 6l.7 3.2h5.6L15.5 6',
    }),
    // Symmetrical PlayStation left & right analog sticks
    createElement('circle', { cx: '9.5', cy: '12.5', r: '1.15' }),
    createElement('circle', { cx: '14.5', cy: '12.5', r: '1.15' }),
    // Left D-pad cross & right action dots
    createElement('path', { d: 'M5.5 10.2h2M6.5 9.2v2' }),
    createElement('circle', { cx: '17.5', cy: '9.5', r: '0.55', fill: 'currentColor' }),
    createElement('circle', { cx: '18.5', cy: '10.5', r: '0.55', fill: 'currentColor' }),
  )) as unknown as LucideIcon

export interface NavItem {
  label: string
  path: string
  icon: LucideIcon
  badge?: string
}

/** Discovery shelf above the library — the IGDB-backed storefront feed,
 *  Soundtrack Studio, Wishlist, and Download Manager. */
export const DISCOVER_NAV_ITEMS: NavItem[] = [
  { label: 'Game Hub', path: '/hub', icon: Compass },
  { label: 'Soundtrack', path: '/soundtrack', icon: Music, badge: 'OST' },
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
  { label: 'DualSense', path: '/dualsense', icon: DualSenseNavIcon, badge: 'DS4W' },
  { label: 'Game Booster', path: '/booster', icon: Rocket },
  { label: 'Stats', path: '/stats', icon: BarChart3 },
  { label: 'Overlay HUD', path: '/overlay', icon: Activity },
]
