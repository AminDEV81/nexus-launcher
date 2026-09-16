import { Gamepad2 } from 'lucide-react'
import { AVATAR_ICONS } from './avatar-icons'
import { cn } from '@/lib/utils'

export function ProfileAvatarIcon({ avatar, className }: { avatar?: string; className?: string }) {
  if (
    avatar &&
    (avatar.startsWith('http://') ||
      avatar.startsWith('https://') ||
      avatar.startsWith('data:image/') ||
      avatar.startsWith('asset:') ||
      avatar.startsWith('blob:'))
  ) {
    return (
      <img
        src={avatar}
        alt="Avatar"
        className={cn(
          'size-full rounded-full object-cover select-none pointer-events-none',
          className,
        )}
        draggable={false}
      />
    )
  }

  const IconComponent = AVATAR_ICONS[avatar ?? 'gamepad'] ?? Gamepad2
  return <IconComponent className={className} />
}
