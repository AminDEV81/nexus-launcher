import { useEffect, useState, useRef } from 'react'
import { Pencil, Gamepad2, Check, X, Sparkles } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { assetUrl } from '@/lib/asset-url'
import { playButtonClick } from '@/lib/sound-engine'
import { useUpdateGameName } from '@/features/library/hooks/use-games'
import type { Game } from '@/types/models'

interface EditGameNameModalProps {
  game: Game | null
  open: boolean
  onClose: () => void
}

export function EditGameNameModal({ game, open, onClose }: EditGameNameModalProps) {
  const [name, setName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const updateNameMutation = useUpdateGameName()

  useEffect(() => {
    if (game && open) {
      setName(game.name)
      setTimeout(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      }, 50)
    }
  }, [game, open])

  if (!game) return null

  const trimmed = name.trim()
  const isChanged = trimmed !== game.name
  const isValid = trimmed.length > 0
  const isPending = updateNameMutation.isPending

  const handleSave = () => {
    if (!isValid || !isChanged || isPending) return
    playButtonClick()
    updateNameMutation.mutate(
      { id: game.id, name: trimmed },
      {
        onSuccess: () => {
          onClose()
        },
      },
    )
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSave()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  return (
    <Modal open={open} onClose={onClose} widthClassName="max-w-md">
      <div className="relative overflow-hidden bg-surface p-6">
        {/* Subtle Ambient Radial Highlight */}
        <div className="pointer-events-none absolute -top-12 -right-12 size-36 rounded-full bg-accent/15 blur-2xl" />

        {/* Modal Header */}
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-accent/30 bg-accent/15 text-accent shadow-xs">
              <Pencil className="size-4.5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-text">Rename Game</h3>
              <p className="text-xs text-subtle">
                {game.is_memory
                  ? 'Change this game’s title in Memory'
                  : 'Update the title in your library'}
              </p>
            </div>
          </div>

          {game.is_memory && (
            <span className="flex items-center gap-1 rounded-full border border-amber-400/35 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-300">
              <Sparkles className="size-2.5" />
              <span>Memory</span>
            </span>
          )}
        </div>

        {/* Game Preview Card */}
        <div className="mb-5 flex items-center gap-3.5 rounded-2xl border border-border/80 bg-surface-raised/70 p-3 shadow-2xs">
          {game.cover_path ? (
            <img
              src={assetUrl(game.cover_path) ?? ''}
              alt={game.name}
              className="h-16 w-12 shrink-0 rounded-xl border border-white/10 object-cover shadow-sm"
            />
          ) : (
            <div className="flex h-16 w-12 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-surface text-subtle">
              <Gamepad2 className="size-6" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-semibold text-muted">Current Title:</div>
            <div className="truncate text-sm font-bold text-text">{game.name}</div>
            {game.developer && (
              <div className="truncate text-[11px] text-subtle">{game.developer}</div>
            )}
          </div>
        </div>

        {/* Name Input Field */}
        <div className="mb-6 flex flex-col gap-1.5">
          <label htmlFor="edit-game-name-input" className="text-xs font-bold text-subtle">
            New Title
          </label>
          <div className="relative">
            <input
              id="edit-game-name-input"
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleKeyDown}
              maxLength={120}
              placeholder="Enter game title..."
              disabled={isPending}
              className="w-full rounded-xl border border-border/80 bg-surface-raised px-3.5 py-2.5 text-sm font-medium text-text placeholder:text-muted/60 transition-all focus:border-accent focus:bg-surface focus:outline-hidden focus:ring-2 focus:ring-accent/20 disabled:opacity-50"
            />
            {name.length > 0 && (
              <button
                type="button"
                onClick={() => setName('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted transition-colors hover:text-text cursor-pointer"
                title="Clear input"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center justify-between px-1 text-[10px] text-muted">
            <span>Press Enter to save, Esc to cancel</span>
            <span>{name.length}/120</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={() => {
              playButtonClick()
              onClose()
            }}
            disabled={isPending}
            className="rounded-xl border border-border/80 bg-surface-raised px-4 py-2 text-xs font-semibold text-subtle transition-all hover:bg-surface hover:text-text active:scale-95 cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!isValid || !isChanged || isPending}
            className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4.5 py-2 text-xs font-bold text-white shadow-md shadow-accent/25 transition-all hover:bg-accent-hover hover:scale-102 active:scale-95 disabled:pointer-events-none disabled:opacity-40 cursor-pointer"
          >
            <Check className="size-3.5" />
            <span>{isPending ? 'Saving...' : 'Save Title'}</span>
          </button>
        </div>
      </div>
    </Modal>
  )
}
