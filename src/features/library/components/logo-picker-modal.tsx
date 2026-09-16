import { useState } from 'react'
import { ImageOff, Loader2, RotateCcw, Upload } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { CoverMedia } from '@/components/ui/cover-media'
import { cn } from '@/lib/utils'
import { useApplyLogo, useLogoOptions, useResetArtwork } from '../hooks/use-cover-options'
import { LargeArtworkModal } from './large-artwork-modal'
import type { CoverOption } from '@/services/metadata'

interface LogoPickerModalProps {
  gameId: string | null
  open: boolean
  onClose: () => void
  onBrowse: () => void
}

export function LogoPickerModal({ gameId, open, onClose, onBrowse }: LogoPickerModalProps) {
  const [visibleCount, setVisibleCount] = useState(12)
  const [pendingLargeOption, setPendingLargeOption] = useState<{
    option: CoverOption
    sizeBytes: number
  } | null>(null)
  const { data: options, isPending, isError, error } = useLogoOptions(gameId ?? undefined, open)
  const applyLogo = useApplyLogo()
  const resetArtwork = useResetArtwork()
  const isApplying = applyLogo.isPending || resetArtwork.isPending

  function pick(option: CoverOption, allowLarge = false) {
    if (!gameId) return
    applyLogo.mutate(
      { gameId, url: option.url, allowLarge },
      {
        onSuccess: () => {
          setPendingLargeOption(null)
          onClose()
        },
        onError: (err) => {
          const msg = err instanceof Error ? err.message : String(err)
          if (msg.includes('artwork_too_large:')) {
            const parts = msg.split('artwork_too_large:')
            const bytes = parseInt(parts[1], 10) || 0
            setPendingLargeOption({ option, sizeBytes: bytes })
          }
        },
      },
    )
  }

  function reset() {
    if (!gameId) return
    resetArtwork.mutate({ gameId, kind: 'logo' }, { onSuccess: onClose })
  }

  return (
    <>
      <Modal open={open} onClose={onClose} widthClassName="max-w-[min(92vw,1100px)]">
        <div className="flex h-[min(72vh,620px)] flex-col p-6">
          <div className="flex shrink-0 items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-text">Choose a Logo</h2>
              <p className="mt-0.5 text-xs text-muted">
                Pick a logo from Steam, SteamGridDB, or use your own image.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2 pr-9">
              <button
                type="button"
                onClick={reset}
                disabled={isApplying}
                title="Re-download the default logo"
                className="flex items-center gap-1.5 rounded-xl border border-border/80 bg-surface/70 px-3 py-1.5 text-xs font-semibold text-text shadow-xs transition-all duration-200 hover:bg-surface-raised hover:border-amber-500/50 hover:text-amber-400 hover:scale-105 active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                <RotateCcw className="size-3.5 transition-transform duration-300 group-hover:-rotate-45" />
                <span>Reset</span>
              </button>
              <button
                type="button"
                onClick={onBrowse}
                disabled={isApplying}
                title="Browse local files for an image"
                className="flex items-center gap-1.5 rounded-xl border border-accent/40 bg-accent/15 px-3.5 py-1.5 text-xs font-bold text-accent shadow-xs transition-all duration-200 hover:bg-accent hover:border-accent hover:text-white hover:shadow-md hover:shadow-accent/25 hover:scale-105 active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                <Upload className="size-3.5" />
                <span>Browse…</span>
              </button>
            </div>
          </div>

          {isPending && (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-sm text-muted">
              <Loader2 className="size-5 animate-spin text-accent" />
              Looking up logos…
            </div>
          )}
          {isError && (
            <Empty message={error instanceof Error ? error.message : 'Could not load logos.'} />
          )}
          {options && options.length === 0 && (
            <Empty message="No logos found for this game — try Browse instead." />
          )}
          {options && options.length > 0 && (
            <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {options.slice(0, visibleCount).map((option) => (
                  <LogoTile
                    key={option.id}
                    option={option}
                    disabled={isApplying}
                    onClick={() => pick(option)}
                  />
                ))}
              </div>
              {options.length > visibleCount && (
                <button
                  type="button"
                  onClick={() => setVisibleCount((count) => count + 12)}
                  className="mx-auto mt-4 flex items-center justify-center gap-2 rounded-xl border border-border/80 bg-surface/70 px-5 py-2 text-xs font-bold text-text shadow-xs transition-all duration-200 hover:border-accent/60 hover:bg-surface-raised hover:text-accent hover:scale-105 hover:shadow-md active:scale-95 cursor-pointer"
                >
                  <span>Show 12 More</span>
                </button>
              )}
            </div>
          )}
        </div>
      </Modal>

      <LargeArtworkModal
        gameId={gameId}
        open={pendingLargeOption !== null}
        onClose={() => setPendingLargeOption(null)}
        onConfirm={() => {
          if (pendingLargeOption) {
            pick(pendingLargeOption.option, true)
          }
        }}
        isDownloading={applyLogo.isPending && pendingLargeOption !== null}
        option={pendingLargeOption?.option ?? null}
        sizeBytes={pendingLargeOption?.sizeBytes ?? 0}
        artworkType="logo"
      />
    </>
  )
}

function Empty({ message }: { message: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-sm text-muted">
      <ImageOff className="size-6 text-subtle" />
      {message}
    </div>
  )
}

function LogoTile({
  option,
  disabled,
  onClick,
}: {
  option: CoverOption
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'group relative flex aspect-[16/7] items-center justify-center overflow-hidden rounded-xl border border-border/70 bg-surface-raised/80 p-5 shadow-xs transition-all duration-300 cursor-pointer select-none',
        'hover:-translate-y-1.5 hover:border-accent hover:shadow-[0_12px_24px_-8px_rgba(0,0,0,0.6),0_0_16px_-4px_var(--nx-accent)] hover:ring-2 hover:ring-accent/50',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <CoverMedia
        src={option.thumbnail_url || option.url}
        mime={option.thumbnail_url ? undefined : option.mime}
        className="size-full object-contain transition-transform duration-500 ease-out group-hover:scale-110"
      />
      {/* Dim overlay & apply badge on hover */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100 flex items-end justify-center p-2.5">
        <span className="rounded-lg bg-accent/90 backdrop-blur-sm px-2.5 py-1 text-[10px] font-bold text-white shadow-sm transition-transform duration-200 translate-y-1 group-hover:translate-y-0">
          Apply Logo
        </span>
      </div>
    </button>
  )
}
