import { useEffect, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Minus, Square, Copy, X, Sparkles } from 'lucide-react'
import { LogoMark } from '@/components/brand/logo-mark'
import { ProfileBadgeButton } from './profile-badge-button'
import { useUpdaterStore } from '@/store/updater-store'
import { cn } from '@/lib/utils'

const appWindow =
  typeof window !== 'undefined'
    ? getCurrentWindow()
    : (null as unknown as ReturnType<typeof getCurrentWindow>)

/**
 * Custom title bar for the chromeless window (`decorations: false` in
 * tauri.conf.json). Handles its own drag region and window controls —
 * there is no native title bar anywhere to fall back on.
 *
 * The center area (the part not covered by buttons or the brand) is the
 * drag region via `data-tauri-drag-region`; double-clicking it toggles
 * maximize, matching native Windows title bar behavior.
 */
export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false)
  const status = useUpdaterStore((s) => s.status)
  const update = useUpdaterStore((s) => s.update)
  const openModal = useUpdaterStore((s) => s.openModal)

  useEffect(() => {
    const syncMaximized = () => {
      appWindow
        .isMaximized()
        .then(setIsMaximized)
        .catch(() => {})
    }

    syncMaximized()
    const unlisten = appWindow.onResized(syncMaximized)

    return () => {
      unlisten.then((fn) => fn())
    }
  }, [])

  return (
    <header
      data-tauri-drag-region
      className="chrome-surface relative z-40 flex h-9 shrink-0 select-none items-center justify-between border-b border-border pl-3"
    >
      <div
        data-tauri-drag-region
        className="flex items-center gap-2 text-xs font-medium text-muted"
      >
        <LogoMark className="size-3.5" />
        <span data-tauri-drag-region>Nexus</span>
      </div>

      {/* Fills the remaining space so the whole bar (minus the buttons) is draggable */}
      <div data-tauri-drag-region className="h-full flex-1" />

      <div data-tauri-drag-region="false" className="flex h-full shrink-0 items-center">
        <div data-tauri-drag-region="false" className="mr-2 flex items-center gap-2">
          {status === 'available' && update && (
            <button
              type="button"
              onClick={() => openModal()}
              className="flex items-center gap-1.5 rounded-full bg-accent/20 px-2.5 py-0.5 text-[11px] font-bold text-accent border border-accent/40 hover:bg-accent/30 transition-all shadow-[0_0_12px_rgba(var(--nx-accent-rgb),0.3)] animate-pulse cursor-pointer"
              title={`Update v${update.version} is available! Click to update`}
            >
              <Sparkles className="size-3" />
              <span>Update v{update.version}</span>
            </button>
          )}
          <ProfileBadgeButton />
        </div>
        <TitleBarButton label="Minimize" onClick={() => void appWindow.minimize()}>
          <Minus className="size-3.5" />
        </TitleBarButton>
        <TitleBarButton
          label={isMaximized ? 'Restore' : 'Maximize'}
          onClick={() => void appWindow.toggleMaximize()}
        >
          {isMaximized ? <Copy className="size-3" /> : <Square className="size-3" />}
        </TitleBarButton>
        <TitleBarButton label="Close" onClick={() => void appWindow.close()} danger>
          <X className="size-4" />
        </TitleBarButton>
      </div>
    </header>
  )
}

function TitleBarButton({
  label,
  onClick,
  danger,
  children,
}: {
  label: string
  onClick: () => void
  danger?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      tabIndex={-1}
      className={cn(
        'flex h-full w-11 items-center justify-center text-muted transition-colors',
        // Text-tinted overlay rather than bg-surface-raised: the title
        // bar is a glass panel, and surface-raised is invisible against
        // it in light mode (both #fff). text/10 reads clearly in dark
        // (white tint) and light (black tint) alike.
        danger ? 'hover:bg-red-500 hover:text-white' : 'hover:bg-text/10 hover:text-text',
      )}
    >
      {children}
    </button>
  )
}
