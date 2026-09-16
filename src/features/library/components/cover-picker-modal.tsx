import { useEffect, useState } from 'react'
import { open as openFileDialog } from '@tauri-apps/plugin-dialog'
import { Loader2, Sparkles, ImageOff, Upload, Crop, RotateCcw } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { CoverMedia } from '@/components/ui/cover-media'
import { cn } from '@/lib/utils'
import {
  useCoverOptions,
  useApplyCover,
  useApplyCustomCover,
  useResetArtwork,
} from '../hooks/use-cover-options'
import { useArtworkCrop } from '../hooks/use-artwork-crop'
import { CropModal } from './crop-modal'
import { LargeArtworkModal } from './large-artwork-modal'
import type { CoverOption } from '@/services/metadata'

const PAGE_SIZE = 10

interface CoverPickerModalProps {
  gameId: string | null
  open: boolean
  onClose: () => void
}

export function CoverPickerModal({ gameId, open, onClose }: CoverPickerModalProps) {
  const [visibleStatic, setVisibleStatic] = useState(PAGE_SIZE)
  const [visibleAnimated, setVisibleAnimated] = useState(PAGE_SIZE)
  const [pendingLargeOption, setPendingLargeOption] = useState<{
    option: CoverOption
    sizeBytes: number
  } | null>(null)
  const { data: options, isPending, isError, error } = useCoverOptions(gameId ?? undefined, open)
  const applyCover = useApplyCover()
  const applyCustomCover = useApplyCustomCover()
  const resetArtwork = useResetArtwork()
  const crop = useArtworkCrop(gameId)

  useEffect(() => {
    if (open) {
      setVisibleStatic(PAGE_SIZE)
      setVisibleAnimated(PAGE_SIZE)
      setPendingLargeOption(null)
    }
  }, [open, gameId])

  function handlePick(option: CoverOption, allowLarge = false) {
    if (!gameId) return
    applyCover.mutate(
      { gameId, url: option.url, isAnimated: option.is_animated, allowLarge },
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

  async function handleBrowse() {
    if (!gameId) return
    const picked = await openFileDialog({
      multiple: false,
      filters: [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
    })
    if (typeof picked === 'string') {
      applyCustomCover.mutate({ gameId, filePath: picked }, { onSuccess: onClose })
    }
  }

  function handleReset() {
    if (!gameId) return
    resetArtwork.mutate({ gameId, kind: 'cover' }, { onSuccess: onClose })
  }

  const isApplying = applyCover.isPending || applyCustomCover.isPending || resetArtwork.isPending

  const staticOptions = options?.filter((option) => !option.is_animated) ?? []
  const animatedOptions = options?.filter((option) => option.is_animated) ?? []

  return (
    <>
      <Modal open={open} onClose={onClose} widthClassName="max-w-2xl">
        {/* Fixed-height flex column: the header/browse row never scrolls,
          only the section(s) below do — this is what keeps "Show More"
          from making new rows overlap the old ones, which happened
          before when the scrollable area had no bounded height. */}
        <div className="flex h-[34rem] flex-col p-5">
          <div className="flex shrink-0 items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-text">Choose a Cover</h2>
              <p className="mt-0.5 text-xs text-muted">
                From Steam, SteamGridDB, or your own image.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2 pr-9">
              <button
                type="button"
                onClick={handleReset}
                disabled={isApplying}
                title="Re-download the default cover"
                className="flex items-center gap-1.5 rounded-xl border border-border/80 bg-surface/70 px-3 py-1.5 text-xs font-semibold text-text shadow-xs transition-all duration-200 hover:bg-surface-raised hover:border-amber-500/50 hover:text-amber-400 hover:scale-105 active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                <RotateCcw className="size-3.5 transition-transform duration-300 group-hover:-rotate-45" />
                <span>Reset</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose()
                  void crop.pickAndCrop('cover')
                }}
                disabled={isApplying}
                title="Crop an existing image"
                className="flex items-center gap-1.5 rounded-xl border border-border/80 bg-surface/70 px-3 py-1.5 text-xs font-semibold text-text shadow-xs transition-all duration-200 hover:bg-surface-raised hover:border-accent/50 hover:text-accent hover:scale-105 active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                <Crop className="size-3.5" />
                <span>Crop…</span>
              </button>
              <button
                type="button"
                onClick={handleBrowse}
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
              Looking up covers…
            </div>
          )}

          {isError && (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-sm text-muted">
              <ImageOff className="size-6 text-subtle" />
              {error instanceof Error ? error.message : 'Could not load covers.'}
            </div>
          )}

          {options && options.length === 0 && (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-sm text-muted">
              <ImageOff className="size-6 text-subtle" />
              No covers found for this game — try Browse instead.
            </div>
          )}

          {options && options.length > 0 && (
            <div className="mt-3 min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
              <CoverSection
                title="Live Covers"
                icon={Sparkles}
                options={animatedOptions}
                visibleCount={visibleAnimated}
                onShowMore={() => setVisibleAnimated((count) => count + PAGE_SIZE)}
                disabled={isApplying}
                onPick={handlePick}
                emptyMessage="No Live Covers found for this game."
              />
              <CoverSection
                title="Static Covers"
                options={staticOptions}
                visibleCount={visibleStatic}
                onShowMore={() => setVisibleStatic((count) => count + PAGE_SIZE)}
                disabled={isApplying}
                onPick={handlePick}
                emptyMessage="No static covers found for this game."
              />
            </div>
          )}
        </div>
      </Modal>

      <CropModal
        open={crop.pending !== null}
        imageSrc={crop.pending?.previewSrc ?? null}
        targetKind="cover"
        isSaving={crop.isSaving}
        onCancel={crop.cancel}
        onSave={(rect) => crop.save(rect)}
      />

      <LargeArtworkModal
        gameId={gameId}
        open={pendingLargeOption !== null}
        onClose={() => setPendingLargeOption(null)}
        onConfirm={() => {
          if (pendingLargeOption) {
            handlePick(pendingLargeOption.option, true)
          }
        }}
        isDownloading={applyCover.isPending && pendingLargeOption !== null}
        option={pendingLargeOption?.option ?? null}
        sizeBytes={pendingLargeOption?.sizeBytes ?? 0}
        artworkType="cover"
      />
    </>
  )
}

function CoverSection({
  title,
  icon: Icon,
  options,
  visibleCount,
  onShowMore,
  disabled,
  onPick,
  emptyMessage,
}: {
  title: string
  icon?: typeof Sparkles
  options: CoverOption[]
  visibleCount: number
  onShowMore: () => void
  disabled: boolean
  onPick: (option: CoverOption) => void
  emptyMessage: string
}) {
  if (options.length === 0) {
    return (
      <section>
        <SectionHeading title={title} icon={Icon} count={0} />
        <p className="mt-2 text-xs text-subtle">{emptyMessage}</p>
      </section>
    )
  }

  const visible = options.slice(0, visibleCount)
  const hasMore = options.length > visibleCount

  return (
    <section>
      <SectionHeading title={title} icon={Icon} count={options.length} />
      <div className="mt-2 grid grid-cols-4 gap-3">
        {visible.map((option) => (
          <CoverOptionThumb
            key={option.id}
            option={option}
            disabled={disabled}
            onClick={() => onPick(option)}
          />
        ))}
      </div>
      {hasMore && (
        <button
          type="button"
          onClick={onShowMore}
          className="mx-auto mt-4 flex items-center justify-center gap-2 rounded-xl border border-border/80 bg-surface/70 px-5 py-2 text-xs font-bold text-text shadow-xs transition-all duration-200 hover:border-accent/60 hover:bg-surface-raised hover:text-accent hover:scale-105 hover:shadow-md active:scale-95 cursor-pointer"
        >
          <span>Show 10 More</span>
        </button>
      )}
    </section>
  )
}

function SectionHeading({
  title,
  icon: Icon,
  count,
}: {
  title: string
  icon?: typeof Sparkles
  count: number
}) {
  return (
    <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-subtle">
      {Icon && <Icon className="size-3.5 text-accent animate-pulse" />}
      <span>{title}</span>
      <span className="font-mono text-[10px] text-muted">({count})</span>
    </div>
  )
}

function CoverOptionThumb({
  option,
  disabled,
  onClick,
}: {
  option: CoverOption
  disabled: boolean
  onClick: () => void
}) {
  // `thumb` is virtually always a static raster preview even for
  // animated/video assets (thumbnails are cheap static snapshots) —
  // the `mime` field describes the *full* asset at `url`, so it only
  // applies when there's no thumbnail and we fall back to that full URL.
  const usingFullAsset = !option.thumbnail_url
  const src = option.thumbnail_url || option.url

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'group relative aspect-[2/3] overflow-hidden rounded-xl border border-border/70 bg-surface shadow-xs transition-all duration-300 cursor-pointer select-none',
        'hover:-translate-y-1.5 hover:border-accent hover:shadow-[0_12px_24px_-8px_rgba(0,0,0,0.6),0_0_16px_-4px_var(--nx-accent)] hover:ring-2 hover:ring-accent/50',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <CoverMedia
        src={src}
        mime={usingFullAsset ? option.mime : undefined}
        className="size-full object-cover transition-transform duration-500 ease-out group-hover:scale-108"
      />
      {option.is_animated && (
        <span className="absolute right-1.5 top-1.5 z-10 flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-white shadow-xs">
          <Sparkles className="size-2.5" />
          LIVE
        </span>
      )}

      {/* Dim overlay & apply badge on hover */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100 flex items-end justify-center p-2.5">
        <span className="rounded-lg bg-accent/90 backdrop-blur-sm px-2.5 py-1 text-[10px] font-bold text-white shadow-sm transition-transform duration-200 translate-y-1 group-hover:translate-y-0">
          Apply Cover
        </span>
      </div>
    </button>
  )
}
