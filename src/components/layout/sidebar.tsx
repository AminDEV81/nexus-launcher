import { AnimatePresence, motion } from 'framer-motion'
import {
  Disc3,
  Maximize2,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Pause,
  Play,
  Plus,
  Search,
  Settings,
  SkipForward,
  Sparkles,
  Sun,
  MonitorPlay,
} from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { LogoMark } from '@/components/brand/logo-mark'
import { cn } from '@/lib/utils'
import { assetUrl } from '@/lib/asset-url'
import { playButtonClick } from '@/lib/sound-engine'
import { useUiStore } from '@/store/ui-store'
import { useThemeStore } from '@/store/theme-store'
import { useUpdaterStore } from '@/store/updater-store'
import { useAddGameModalStore } from '@/features/library/store/add-game-modal-store'
import {
  cleanGameTitleFromAlbumTitle,
  useSoundtrackStore,
} from '@/features/soundtrack/store/soundtrack-store'
import { useAnimationSpeed } from '@/hooks/use-animation-speed'
import { DISCOVER_NAV_ITEMS, LIBRARY_NAV_ITEMS, MANAGE_NAV_ITEMS } from './nav-items'
import { SidebarNavItem } from './sidebar-nav-item'

const WIDTH_EXPANDED = 252
const WIDTH_COLLAPSED = 76

export function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const collapsed = useUiStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  const openAddGameModal = useAddGameModalStore((s) => s.open)
  const mode = useThemeStore((s) => s.mode)
  const toggleMode = useThemeStore((s) => s.toggleMode)
  const isUpdateAvailable = useUpdaterStore((s) => s.status === 'available')
  const speed = useAnimationSpeed()

  const currentTrack = useSoundtrackStore((s) => s.currentTrack)
  const currentAlbum = useSoundtrackStore((s) => s.currentAlbum)
  const currentGame = useSoundtrackStore((s) => s.currentGame)
  const playbackState = useSoundtrackStore((s) => s.playbackState)
  const currentTime = useSoundtrackStore((s) => s.currentTime)
  const togglePlay = useSoundtrackStore((s) => s.togglePlay)
  const nextTrack = useSoundtrackStore((s) => s.next)
  const setExpanded = useSoundtrackStore((s) => s.setExpanded)

  const isPlaying =
    Boolean(currentTrack) &&
    (playbackState === 'playing' ||
      (playbackState !== 'paused' && playbackState !== 'error' && currentTime > 0))
  const coverSrc = assetUrl(currentAlbum?.cover_url) || assetUrl(currentGame?.coverUrl) || null

  const isSettingsActive = location.pathname.startsWith('/settings')

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
        <ConsoleModeButton
          collapsed={collapsed}
          onClick={() => {
            playButtonClick()
            navigate('/console')
          }}
        />

        <div className="my-4 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
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
        {/* Live Soundtrack Quick Deck in Left Sidebar */}
        {!collapsed && currentTrack && (
          <div className="mb-2.5 overflow-hidden rounded-xl border border-accent/30 bg-gradient-to-r from-accent/12 via-surface/90 to-surface p-2.5 shadow-xs">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => {
                  playButtonClick()
                  setExpanded(true)
                }}
                title="Open Fullscreen Vinyl Stage"
                className="group relative size-9 shrink-0 overflow-hidden rounded-lg border border-border/80 bg-surface-raised cursor-pointer"
              >
                {coverSrc ? (
                  <img src={coverSrc} alt="" className="size-full object-cover" />
                ) : (
                  <span className="flex size-full items-center justify-center bg-accent/15 text-accent">
                    <Disc3 className={cn('size-4', isPlaying && 'animate-spin')} />
                  </span>
                )}
                <span className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition-opacity group-hover:opacity-100">
                  <Maximize2 className="size-3 text-white" />
                </span>
              </button>

              <div
                onClick={() => navigate('/soundtrack')}
                className="min-w-0 flex-1 cursor-pointer"
              >
                <div className="truncate text-[11px] font-semibold text-text hover:text-accent transition-colors">
                  {currentTrack.title}
                </div>
                <div className="truncate text-[10px] text-accent/90">
                  {currentGame?.title ||
                    (currentAlbum ? cleanGameTitleFromAlbumTitle(currentAlbum.title) : 'OST')}
                </div>
              </div>

              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    playButtonClick()
                    togglePlay()
                  }}
                  className="flex size-7 items-center justify-center rounded-lg bg-accent text-white shadow-2xs hover:scale-105 active:scale-95 transition-transform cursor-pointer"
                  title={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? (
                    <Pause className="size-3 fill-current" />
                  ) : (
                    <Play className="size-3 fill-current translate-x-0.5" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    playButtonClick()
                    void nextTrack()
                  }}
                  className="flex size-6.5 items-center justify-center rounded-lg text-muted hover:bg-surface-raised hover:text-text transition-colors cursor-pointer"
                  title="Next Track"
                >
                  <SkipForward className="size-3" />
                </button>
              </div>
            </div>
          </div>
        )}

        {!collapsed && !currentTrack && (
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
          <SidebarFooterButton
            label="Settings"
            onClick={() => navigate('/settings')}
            collapsed={collapsed}
            className={
              isSettingsActive
                ? 'text-accent bg-accent/15 ring-1 ring-accent/30 hover:bg-accent/20 hover:text-accent'
                : undefined
            }
          >
            <div className="relative flex items-center justify-center">
              <Settings className="size-4" />
              {isUpdateAvailable && (
                <span
                  className="absolute -top-1 -right-1 size-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#00f0ff]"
                  title="New update available"
                />
              )}
            </div>
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

/** Prominent entry point for the fullscreen, controller-first Console Mode (Big Picture). */
function ConsoleModeButton({ collapsed, onClick }: { collapsed: boolean; onClick: () => void }) {
  return (
    <motion.button
      type="button"
      title="Console Mode"
      aria-label="Open Console Mode"
      onClick={onClick}
      whileHover={{ x: collapsed ? 0 : 2 }}
      whileTap={{ scale: 0.97 }}
      className={cn(
        'group relative flex items-center gap-3 overflow-hidden rounded-xl border border-accent/30 bg-gradient-to-r from-accent/18 via-accent/8 to-transparent px-3 py-2.5 text-sm font-semibold text-text transition-colors hover:border-accent/55 hover:from-accent/28',
        collapsed && 'justify-center px-0',
      )}
    >
      <MonitorPlay className="size-[18px] shrink-0 text-accent" strokeWidth={2} />
      {!collapsed && (
        <>
          <span className="truncate">Console Mode</span>
          <span className="ml-auto rounded-md bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-accent">
            TV
          </span>
        </>
      )}
    </motion.button>
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
  className,
}: {
  label: string
  onClick: () => void
  collapsed: boolean
  children: React.ReactNode
  className?: string
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
        'flex size-9 items-center justify-center rounded-xl text-subtle transition-colors hover:bg-surface-raised hover:text-text cursor-pointer',
        !collapsed && 'flex-1',
        className,
      )}
    >
      {children}
    </motion.button>
  )
}
