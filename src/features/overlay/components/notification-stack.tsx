import React, { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'
import { useNotificationStore, type ToastItem } from '../store/notification-store'
import type { NotificationKind } from '../types/overlay'

const KIND_STYLE: Record<
  NotificationKind,
  { color: string; Icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }> }
> = {
  info: { color: '', Icon: Info },
  success: { color: '#34d399', Icon: CheckCircle2 },
  warning: { color: '#fbbf24', Icon: AlertTriangle },
  error: { color: '#f87171', Icon: XCircle },
}

interface NotificationCardProps {
  item: ToastItem
  accent: string
  fromRight: boolean
}

const NotificationCard: React.FC<NotificationCardProps> = ({ item, accent, fromRight }) => {
  const dismiss = useNotificationStore((s) => s.dismiss)
  const { color, Icon } = KIND_STYLE[item.kind]
  const tint = color || accent

  // Restarts whenever the toast is (re)shown, e.g. an alert replacing itself.
  useEffect(() => {
    const timer = setTimeout(() => dismiss(item.key), item.duration)
    return () => clearTimeout(timer)
  }, [item.key, item.shownAt, item.duration, dismiss])

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: fromRight ? 36 : -36, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: fromRight ? 36 : -36, scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 420, damping: 34, mass: 0.7 }}
      className="relative w-[320px] overflow-hidden rounded-xl border border-white/10 bg-zinc-950/85 shadow-[0_10px_30px_rgba(0,0,0,0.45)] backdrop-blur-md"
      style={{ boxShadow: `0 10px 30px rgba(0,0,0,0.45), 0 0 18px ${tint}22` }}
    >
      <div className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: tint }} />
      <div className="flex items-start gap-3 py-2.5 pl-4 pr-3">
        <div
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${tint}22` }}
        >
          <Icon className="h-4 w-4" style={{ color: tint }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold leading-snug text-white">
            {item.title}
          </div>
          {item.body && (
            <div className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-zinc-300/80">
              {item.body}
            </div>
          )}
        </div>
      </div>
      {/* Time-left bar: transform-only animation, restarted per showing. */}
      <div key={item.shownAt} className="h-[2px] w-full bg-white/5">
        <div
          className="nx-toast-progress h-full w-full origin-left"
          style={{ backgroundColor: tint, animationDuration: `${item.duration}ms` }}
        />
      </div>
    </motion.div>
  )
}

interface NotificationStackProps {
  accent: string
  /** Screen side the stack hugs; decides the slide-in direction. */
  side: 'left' | 'right' | 'center'
  className?: string
}

export const NotificationStack: React.FC<NotificationStackProps> = ({
  accent,
  side,
  className = '',
}) => {
  const items = useNotificationStore((s) => s.items)

  return (
    <div className={`pointer-events-none flex flex-col gap-2 ${className}`}>
      <AnimatePresence initial={false} mode="popLayout">
        {items.map((item) => (
          <NotificationCard
            key={item.key}
            item={item}
            accent={accent}
            fromRight={side === 'right'}
          />
        ))}
      </AnimatePresence>
    </div>
  )
}
