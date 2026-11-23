import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronDown } from 'lucide-react'
import { playButtonClick } from '@/lib/sound-engine'
import { cn } from '@/lib/utils'

export interface ArtDropdownOption<T extends string> {
  id: T
  label: string
  description?: string
  badge?: string
  icon?: ReactNode
}

interface ArtDropdownProps<T extends string> {
  label: string
  value: T
  options: ArtDropdownOption<T>[]
  onChange: (value: T) => void
  icon?: ReactNode
  defaultId?: T
  align?: 'left' | 'right'
  minMenuWidth?: string
}

export function ArtDropdown<T extends string>({
  label,
  value,
  options,
  onChange,
  icon,
  defaultId,
  align = 'left',
  minMenuWidth = 'min-w-[230px]',
}: ArtDropdownProps<T>) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const selected = options.find((o) => o.id === value) ?? options[0]
  const isFiltered = defaultId !== undefined ? value !== defaultId : value !== options[0]?.id

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          playButtonClick()
          setOpen((v) => !v)
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          'group inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-bold transition-all active:scale-[0.98] cursor-pointer',
          open
            ? 'border-accent bg-accent/15 text-text shadow-md shadow-accent/10'
            : isFiltered
              ? 'border-accent/55 bg-accent/10 text-text shadow-2xs'
              : 'border-border bg-surface-raised text-muted hover:border-accent/40 hover:text-text',
        )}
      >
        {icon && (
          <span
            className={cn(
              'flex items-center justify-center transition-colors',
              isFiltered || open ? 'text-accent' : 'text-subtle group-hover:text-accent',
            )}
          >
            {icon}
          </span>
        )}
        <span className="text-[10.5px] font-semibold uppercase tracking-wider text-subtle">
          {label}:
        </span>
        <span className="max-w-[140px] truncate font-extrabold text-text">{selected?.label}</span>
        {isFiltered && <span className="size-1.5 rounded-full bg-accent" />}
        <ChevronDown
          className={cn(
            'size-3.5 text-subtle transition-transform duration-200',
            open && 'rotate-180 text-accent',
          )}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.97 }}
            transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
            role="listbox"
            className={cn(
              'solid-panel absolute top-full z-50 mt-2 max-h-[340px] overflow-y-auto rounded-2xl border border-border/90 p-1.5 shadow-2xl ring-1 ring-white/5',
              minMenuWidth,
              align === 'right' ? 'right-0' : 'left-0',
            )}
          >
            <div className="mb-1 flex items-center justify-between px-2.5 py-1">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-subtle">
                {label}
              </span>
              {selected?.badge && (
                <span className="rounded-md bg-accent/15 px-1.5 py-0.5 font-mono text-[9.5px] font-bold text-accent">
                  {selected.badge}
                </span>
              )}
            </div>

            <div className="flex flex-col gap-0.5">
              {options.map((opt) => {
                const active = opt.id === value
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      playButtonClick()
                      onChange(opt.id)
                      setOpen(false)
                    }}
                    className={cn(
                      'flex w-full items-center justify-between gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors cursor-pointer',
                      active
                        ? 'bg-accent/15 text-text'
                        : 'text-muted hover:bg-surface-raised hover:text-text',
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      {opt.icon && (
                        <span
                          className={cn(
                            'flex size-6 shrink-0 items-center justify-center rounded-lg border',
                            active
                              ? 'border-accent/40 bg-accent/20 text-accent'
                              : 'border-border/70 bg-surface-raised text-subtle',
                          )}
                        >
                          {opt.icon}
                        </span>
                      )}
                      <div className="min-w-0">
                        <div className="truncate text-xs font-bold text-text">{opt.label}</div>
                        {opt.description && (
                          <div className="truncate text-[10.5px] text-subtle">
                            {opt.description}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      {opt.badge && (
                        <span
                          className={cn(
                            'rounded-md border px-1.5 py-0.5 font-mono text-[9.5px] font-bold',
                            active
                              ? 'border-accent/40 bg-accent/15 text-accent'
                              : 'border-border/70 bg-surface-raised text-subtle',
                          )}
                        >
                          {opt.badge}
                        </span>
                      )}
                      {active && <Check className="size-3.5 text-accent" />}
                    </div>
                  </button>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
