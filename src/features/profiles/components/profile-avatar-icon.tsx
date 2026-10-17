import { useState } from 'react'
import { Gamepad2 } from 'lucide-react'
import { AVATAR_ICONS } from './avatar-icons'
import { cn } from '@/lib/utils'

function upgradeAvatarUrl(raw: string): string {
  if (raw.includes('images.igdb.com/igdb/image/upload/')) {
    return raw
      .replace('/t_thumb/', '/t_720p/')
      .replace('/t_cover_small/', '/t_720p/')
      .replace('/t_micro/', '/t_720p/')
  }
  return raw
}

export function ProfileAvatarIcon({ avatar, className }: { avatar?: string; className?: string }) {
  const [failed, setFailed] = useState(false)

  if (
    !failed &&
    avatar &&
    (avatar.startsWith('http://') ||
      avatar.startsWith('https://') ||
      avatar.startsWith('data:image/') ||
      avatar.startsWith('asset:') ||
      avatar.startsWith('blob:'))
  ) {
    const hdSrc = upgradeAvatarUrl(avatar)
    return (
      <img
        src={hdSrc}
        alt="Avatar"
        onError={(e) => {
          const target = e.currentTarget
          if (target.src.endsWith('/library_600x900_2x.jpg')) {
            target.src = target.src.replace('/library_600x900_2x.jpg', '/library_600x900.jpg')
          } else if (target.src.endsWith('/library_600x900.jpg')) {
            target.src = target.src.replace('/library_600x900.jpg', '/header.jpg')
          } else {
            setFailed(true)
          }
        }}
        className={cn(
          'size-full rounded-full object-cover object-top select-none pointer-events-none',
          className,
        )}
        draggable={false}
      />
    )
  }

  const IconComponent = AVATAR_ICONS[avatar ?? 'gamepad'] ?? Gamepad2
  return <IconComponent className={className} />
}
