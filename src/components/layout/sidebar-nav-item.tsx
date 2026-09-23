import { motion } from 'framer-motion'
import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useUpdaterStore } from '@/store/updater-store'
import type { NavItem } from './nav-items'

export function SidebarNavItem({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const Icon = item.icon
  const isUpdateAvailable = useUpdaterStore((s) => s.status === 'available')
  const showUpdateBadge = item.path === '/settings' && isUpdateAvailable

  return (
    <NavLink
      to={item.path}
      end={item.path === '/'}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        cn(
          'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
          isActive ? 'text-accent' : 'text-muted hover:bg-surface-raised hover:text-text',
          collapsed && 'justify-center px-0',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId="sidebar-active-pill"
              className="absolute inset-0 rounded-xl bg-accent/10 ring-1 ring-inset ring-accent/15"
              transition={{ type: 'spring', stiffness: 500, damping: 40 }}
            />
          )}
          <span className="relative z-[1] flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors group-hover:bg-accent/10">
            <Icon className="size-[18px]" strokeWidth={isActive ? 2.25 : 2} />
          </span>
          {!collapsed && <span className="relative z-[1] truncate">{item.label}</span>}
          {showUpdateBadge && (
            <span
              className={cn(
                'relative z-[1] flex size-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#00f0ff]',
                !collapsed && 'ml-auto mr-1',
                collapsed && 'absolute top-1.5 right-1.5',
              )}
              title="New update available"
            />
          )}
          {isActive && !collapsed && !showUpdateBadge && (
            <motion.span
              layoutId="sidebar-active-dot"
              className="relative z-[1] ml-auto size-1.5 rounded-full bg-accent shadow-[0_0_10px_var(--nx-accent)]"
              transition={{ type: 'spring', stiffness: 500, damping: 40 }}
            />
          )}
        </>
      )}
    </NavLink>
  )
}
