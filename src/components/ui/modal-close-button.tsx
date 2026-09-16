import React, { forwardRef } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ModalCloseButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: 'sm' | 'md' | 'lg'
  showGlow?: boolean
  showCornerDot?: boolean
}

/**
 * Modern, theme-harmonized Close ("X") button designed for modals and overlays.
 *
 * Features:
 * - Fluid hover rotation & scale on the X glyph
 * - 100% harmonized with current theme accent (var(--nx-accent))
 * - Soft cyber glassmorphism backdrop with border accent highlight
 * - Radiant theme-accent ambient glow on hover
 * - Micro corner cyber telemetry dot
 * - Haptic spring press compression
 */
export const ModalCloseButton = forwardRef<HTMLButtonElement, ModalCloseButtonProps>(
  (
    {
      size = 'md',
      showGlow = true,
      showCornerDot = true,
      className,
      'aria-label': ariaLabel = 'Close dialog',
      title = 'Close (Esc)',
      type = 'button',
      ...props
    },
    ref,
  ) => {
    const sizeClasses = {
      sm: 'size-7 rounded-lg',
      md: 'size-8 rounded-xl',
      lg: 'size-9 rounded-xl',
    }[size]

    const iconSizes = {
      sm: 'size-3.5',
      md: 'size-4',
      lg: 'size-4.5',
    }[size]

    return (
      <button
        ref={ref}
        type={type}
        aria-label={ariaLabel}
        title={title}
        className={cn(
          'group relative flex items-center justify-center select-none cursor-pointer overflow-hidden',
          'border border-border/80 bg-surface/80 text-muted backdrop-blur-md shadow-2xs',
          'transition-all duration-200 ease-out',
          'hover:border-accent/60 hover:bg-accent/15 hover:text-accent',
          'active:scale-90 active:bg-accent/25 active:border-accent',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-1',
          showGlow && 'hover:shadow-[0_0_12px_var(--nx-accent)]/25',
          sizeClasses,
          className,
        )}
        {...props}
      >
        {/* Soft Radial Sheen on Hover */}
        <span className="pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-br from-white/10 via-transparent to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />

        {/* Micro Cyber Corner Indicator */}
        {showCornerDot && (
          <span
            className={cn(
              'pointer-events-none absolute rounded-full bg-accent opacity-0 transition-all duration-200 group-hover:opacity-100 shadow-[0_0_5px_var(--nx-accent)]',
              size === 'sm' ? 'top-0.5 right-0.5 size-0.5' : 'top-1 right-1 size-1',
            )}
          />
        )}

        {/* Rotating & Scaling X Icon */}
        <X
          className={cn(
            'shrink-0 transition-transform duration-200 ease-out group-hover:rotate-90 group-hover:scale-110',
            iconSizes,
          )}
        />
      </button>
    )
  },
)

ModalCloseButton.displayName = 'ModalCloseButton'
