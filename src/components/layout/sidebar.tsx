import { AnimatePresence, motion } from 'framer-motion'
import { PanelLeftClose, PanelLeftOpen, Plus, Search, Sun, Moon, Sparkles } from 'lucide-react'
import { LogoMark } from '@/components/brand/logo-mark'
import { cn } from '@/lib/utils'
import { useUiStore } from '@/store/ui-store'
import { useThemeStore } from '@/store/theme-store'
import { useAddGameModalStore } from '@/features/library/store/add-game-modal-store'
import { useAnimationSpeed } from '@/hooks/use-animation-speed'
import { LIBRARY_NAV_ITEMS, MANAGE_NAV_ITEMS, DISCOVER_NAV_ITEMS } from './nav-items'
import { SidebarNavItem } from './sidebar-nav-item'

const WIDTH_EXPANDED = 252
const WIDTH_COLLAPSED = 76

export function Sidebar() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  const openAddGameModal = useAddGameModalStore((s) => s.open)
  const mode = useThemeStore((s) => s.mode)
  const toggleMode = useThemeStore((s) => s.toggleMode)
  const speed = useAnimationSpeed()

  return (
    <motion.aside
      animate={{ width: collapsed ? WIDTH_COLLAPSED : WIDTH_EXPANDED }}
      transition={{ duration: 0.28 * speed, ease: [0.16, 1, 0.3, 1] }}
      className="chrome-surface relative z-10 flex shrink-0 flex-col overflow-hidden border-r border-border"
    >
      <div
        className={cn(
          'relative flex h-[76px] shrink-0 items-center px-4',
          collapsed && 'justify-center px-0',
        )}
      >
        <div className="pointer-events-none absolute inset-x-4 bottom-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent" />
        <motion.div
          whileHover={{ rotate: 8, scale: 1.08 }}
          transition={{ type: 'spring', stiffness: 400, damping: 18 }}
          className="relative flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 ring-1 ring-accent/20"
        >
          <LogoMark className="size-6 drop-shadow-[0_0_10px_var(--nx-accent)]" />
        </motion.div>
        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.16 * speed }}
              className="ml-3 min-w-0"
            >
              <div className="text-sm font-bold tracking-[0.22em] text-text">NEXUS</div>
              <div className="mt-0.5 flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-subtle">
                <Sparkles className="size-2.5 text-accent" />
                Game library
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-5">
        {!collapsed && <SectionLabel>Discover</SectionLabel>}
        {DISCOVER_NAV_ITEMS.map((item) => (
          <SidebarNavItem key={item.path} item={item} collapsed={collapsed} />
        ))}

        <div className="my-4 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
        {!collapsed && <SectionLabel>Library</SectionLabel>}
        {LIBRARY_NAV_ITEMS.map((item) => (
          <SidebarNavItem key={item.path} item={item} collapsed={collapsed} />
        ))}

        <div className="my-4 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
        {!collapsed && <SectionLabel>Manage</SectionLabel>}

        <SidebarAction
          icon={Plus}
          label="Add Game"
          collapsed={collapsed}
          onClick={() => openAddGameModal()}
        />

        <div className="mt-2" />
        {MANAGE_NAV_ITEMS.map((item) => (
          <SidebarNavItem key={item.path} item={item} collapsed={collapsed} />
        ))}
      </nav>

      <div className={cn('border-t border-border p-3', collapsed && 'px-2')}>
        {!collapsed && (
          <div className="mb-3 flex items-center gap-2 rounded-xl bg-surface/70 px-3 py-2.5 ring-1 ring-border/60">
            <span className="flex size-7 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <Search className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-text">Quick search</div>
              <div className="text-[10px] text-subtle">Press Ctrl K</div>
            </div>
            <kbd className="rounded border border-border px-1.5 py-0.5 text-[10px] text-subtle">
              ⌘K
            </kbd>
          </div>
        )}
        <div className={cn('flex items-center gap-1', collapsed && 'flex-col gap-2')}>
          <SidebarFooterButton
            label={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={toggleMode}
            collapsed={collapsed}
          >
            {mode === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </SidebarFooterButton>
          <SidebarFooterButton
            label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={toggleSidebar}
            collapsed={collapsed}
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4" />
            ) : (
              <PanelLeftClose className="size-4" />
            )}
          </SidebarFooterButton>
        </div>
      </div>
    </motion.aside>
  )
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-subtle">
      {children}
    </div>
  )
}

function SidebarAction({
  icon: Icon,
  label,
  collapsed,
  onClick,
}: {
  icon: typeof Plus
  label: string
  collapsed: boolean
  onClick: () => void
}) {
  return (
    <motion.button
      type="button"
      title={collapsed ? label : undefined}
      onClick={onClick}
      whileHover={{ x: collapsed ? 0 : 2 }}
      whileTap={{ scale: 0.97 }}
      className={cn(
        'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-surface-raised hover:text-text',
        collapsed && 'justify-center px-0',
      )}
    >
      <Icon
        className="size-[18px] shrink-0 transition-colors group-hover:text-accent"
        strokeWidth={2}
      />
      {!collapsed && <span className="truncate">{label}</span>}
    </motion.button>
  )
}

function SidebarFooterButton({
  label,
  onClick,
  collapsed,
  children,
}: {
  label: string
  onClick: () => void
  collapsed: boolean
  children: React.ReactNode
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      whileHover={{ scale: 1.06 }}
      whileTap={{ scale: 0.94 }}
      className={cn(
        'flex size-9 items-center justify-center rounded-xl text-subtle transition-colors hover:bg-surface-raised hover:text-text',
        !collapsed && 'flex-1',
      )}
    >
      {children}
    </motion.button>
  )
}
