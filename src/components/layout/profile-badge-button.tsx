import { ArrowRightLeft } from 'lucide-react'
import { useProfileStore } from '@/store/profile-store'
import { ProfileAvatarIcon } from '@/features/profiles/components/profile-avatar-icon'
import { cn } from '@/lib/utils'

export function ProfileBadgeButton() {
  const activeProfile = useProfileStore((s) => s.activeProfile)
  const openGate = useProfileStore((s) => s.openGate)

  if (!activeProfile) return null

  return (
    <div data-tauri-drag-region="false" className="relative z-30">
      <button
        type="button"
        data-tauri-drag-region="false"
        onClick={openGate}
        title={`Active Player: ${activeProfile.name} • Click to switch profile`}
        aria-label="Switch player profile"
        className={cn(
          'group relative flex h-7.5 items-center gap-2 rounded-full px-2.5 text-xs font-semibold select-none cursor-pointer',
          'border border-border/80 bg-surface/90 transition-all duration-200',
          'hover:bg-surface-raised hover:scale-[1.03] active:scale-[0.97]',
          'shadow-2xs hover:shadow-md',
        )}
        style={{
          borderColor: `${activeProfile.color}40`,
        }}
      >
        {/* Glow halo on hover */}
        <span
          className="pointer-events-none absolute inset-0 rounded-full opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{
            boxShadow: `0 0 14px ${activeProfile.color}35`,
            borderColor: activeProfile.color,
          }}
        />

        {/* Profile Avatar Icon with dynamic color ring */}
        <div className="relative flex items-center justify-center">
          <div
            className="flex size-5.5 items-center justify-center rounded-full text-white shadow-xs transition-transform duration-200 group-hover:scale-110"
            style={{
              backgroundColor: activeProfile.color,
              boxShadow: `0 0 8px ${activeProfile.color}60`,
            }}
          >
            <ProfileAvatarIcon avatar={activeProfile.avatar} className="size-3.5" />
          </div>

          {/* Online status indicator with crisp emerald glow */}
          <span className="absolute -bottom-0.5 -right-0.5 flex size-2 items-center justify-center">
            <span className="size-1.5 rounded-full bg-emerald-500 ring-1 ring-background shadow-[0_0_6px_rgba(16,185,129,0.7)]" />
          </span>
        </div>

        {/* Profile Name */}
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="max-w-[110px] truncate font-bold text-text text-[11px] tracking-tight transition-colors group-hover:text-accent">
            {activeProfile.name}
          </span>
        </div>

        {/* Switch Indicator icon */}
        <div
          className={cn(
            'flex size-4 items-center justify-center rounded-full text-muted transition-all duration-200',
            'group-hover:text-accent group-hover:bg-accent/15 group-hover:rotate-180',
          )}
        >
          <ArrowRightLeft className="size-2.5 stroke-[2.5]" />
        </div>
      </button>
    </div>
  )
}
