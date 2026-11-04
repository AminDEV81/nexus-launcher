import { useEffect, useMemo, useState } from 'react'
import { open as openFileDialog } from '@tauri-apps/plugin-dialog'
import {
  Loader2,
  Sparkles,
  ImageOff,
  Upload,
  Crop,
  RotateCcw,
  RefreshCw,
  Search,
  Flame,
  Clock,
  X,
} from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { CoverMedia } from '@/components/ui/cover-media'
import { cn } from '@/lib/utils'
import {
  useCoverOptions,
  useApplyCover,
  useApplyCustomCover,
  useResetArtwork,
  sortArtworkOptions,
  type ArtworkSortMode,
} from '../hooks/use-cover-options'
import { useArtworkCrop } from '../hooks/use-artwork-crop'
import { CropModal } from './crop-modal'
import { LargeArtworkModal } from './large-artwork-modal'
import type { CoverOption } from '@/services/metadata'

const PAGE_SIZE = 20

interface CoverPickerModalProps {
  gameId: string | null
  open: boolean
  onClose: () => void
}

export function CoverPickerModal({ gameId, open, onClose }: CoverPickerModalProps) {
  const [visibleStatic, setVisibleStatic] = useState(PAGE_SIZE)
  const [visibleAnimated, setVisibleAnimated] = useState(12)
  const [searchInput, setSearchInput] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState('')
  const [sortMode, setSortMode] = useState<ArtworkSortMode>('newest')
  const [refreshTick, setRefreshTick] = useState(0)
  const [pendingLargeOption, setPendingLargeOption] = useState<{
    option: CoverOption
    sizeBytes: number
  } | null>(null)

  const {
    data: rawOptions,
    isPending,
    isFetching,
    isError,
    error,
  } = useCoverOptions(gameId ?? undefined, open, submittedQuery, refreshTick)

  const applyCover = useApplyCover()
  const applyCustomCover = useApplyCustomCover()
  const resetArtwork = useResetArtwork()
  const crop = useArtworkCrop(gameId)

  useEffect(() => {
    if (open) {
      setVisibleStatic(PAGE_SIZE)
      setVisibleAnimated(12)
      setPendingLargeOption(null)
      setSearchInput('')
      setSubmittedQuery('')
      setRefreshTick((t) => t + 1)
    }
  }, [open, gameId])

  const options = useMemo(
    () => sortArtworkOptions(rawOptions, sortMode),
    [rawOptions, sortMode],
  )

  const newestCommunityIds = useMemo(() => {
    if (!rawOptions) return new Set<number>()
    const communityIds = rawOptions
      .filter((o) => o.id > 0)
      .map((o) => o.id)
      .sort((a, b) => b - a)
      .slice(0, 8)
    return new Set(communityIds)
  }, [rawOptions])

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault()
    setVisibleStatic(PAGE_SIZE)
    setVisibleAnimated(12)
    setSubmittedQuery(searchInput.trim())
  }

  function handleLiveRefresh() {
    setVisibleStatic(PAGE_SIZE)
    setVisibleAnimated(12)
    setRefreshTick((t) => t + 1)
  }

  function handlePick(option: CoverOption, allowLarge = false) {
    if (!gameId) return
    // Clicking any Live Cover opens the confirmation popup first so the user sees its
    // exact download file size and live download progress bar before downloading!
    if (option.is_animated && !allowLarge) {
      setPendingLargeOption({ option, sizeBytes: 0 })
      return
    }
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
      filters: [
        {
          name: 'Image / Live Cover',
          extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'webm', 'mp4'],
        },
      ],
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

  const staticOptions = options.filter((option) => !option.is_animated)
  const animatedOptions = options.filter((option) => option.is_animated)

  return (
    <>
      <Modal open={open} onClose={onClose} widthClassName="max-w-4xl">
        <div className="flex h-[40rem] flex-col p-5">
          <div className="flex shrink-0 items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-bold text-text">Choose a Cover</h2>
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                  <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live SteamGridDB
                </span>
                {!isPending && options.length > 0 && (
                  <span className="rounded-full border border-border/70 bg-surface/80 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-muted">
                    {options.length} Total ({staticOptions.length} Static • {animatedOptions.length} Live)
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-muted">
                Static previews in list for low data usage — click any Live Cover to check download size &amp; apply.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2 pr-9">
              <button
                type="button"
                onClick={handleLiveRefresh}
                disabled={isFetching || isApplying}
                title="Fetch latest community covers live from SteamGridDB"
                className="flex items-center gap-1.5 rounded-xl border border-border/80 bg-surface/70 px-3 py-1.5 text-xs font-semibold text-text shadow-xs transition-all duration-200 hover:bg-surface-raised hover:border-emerald-500/50 hover:text-emerald-400 hover:scale-105 active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={cn('size-3.5', isFetching && 'animate-spin text-emerald-400')} />
                <span>Sync Live</span>
              </button>
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

          {/* Live SteamGridDB Search & Sort Bar */}
          <div className="mt-3 flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 bg-surface/50 p-2">
            <form onSubmit={handleSearchSubmit} className="relative flex flex-1 items-center min-w-[240px]">
              <Search className="pointer-events-none absolute left-3 size-3.5 text-muted" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search by game title or paste SteamGridDB link/ID (e.g. 5439908)…"
                className="w-full rounded-lg border border-border/70 bg-background/80 py-1.5 pl-8 pr-16 text-xs text-text placeholder:text-muted focus:border-accent focus:outline-none"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchInput('')
                    setSubmittedQuery('')
                  }}
                  className="absolute right-12 rounded p-0.5 text-muted hover:text-text cursor-pointer"
                  title="Clear custom search"
                >
                  <X className="size-3.5" />
                </button>
              )}
              <button
                type="submit"
                disabled={isFetching}
                className="absolute right-1.5 rounded-md bg-accent/20 px-2 py-0.5 text-[11px] font-bold text-accent hover:bg-accent hover:text-white transition-colors cursor-pointer"
              >
                Find
              </button>
            </form>

            <div className="flex items-center gap-1 rounded-lg border border-border/70 bg-background/70 p-0.5">
              <button
                type="button"
                onClick={() => setSortMode('newest')}
                className={cn(
                  'flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-bold transition-all cursor-pointer',
                  sortMode === 'newest'
                    ? 'bg-accent text-white shadow-xs'
                    : 'text-muted hover:text-text',
                )}
                title="Show newest community uploads on SteamGridDB first"
              >
                <Clock className="size-3" />
                <span>Newest Uploads</span>
              </button>
              <button
                type="button"
                onClick={() => setSortMode('popular')}
                className={cn(
                  'flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-bold transition-all cursor-pointer',
                  sortMode === 'popular'
                    ? 'bg-accent text-white shadow-xs'
                    : 'text-muted hover:text-text',
                )}
                title="Show most popular / default covers first"
              >
                <Flame className="size-3" />
                <span>Popular</span>
              </button>
            </div>
          </div>

          {isPending && (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-sm text-muted">
              <Loader2 className="size-5 animate-spin text-accent" />
              Fetching all static &amp; live covers from SteamGridDB…
            </div>
          )}

          {!isPending && isError && (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-sm text-muted">
              <ImageOff className="size-6 text-subtle" />
              <p>{error instanceof Error ? error.message : 'Could not load covers.'}</p>
              <button
                type="button"
                onClick={handleLiveRefresh}
                className="mt-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text hover:border-accent cursor-pointer"
              >
                Try Again
              </button>
            </div>
          )}

          {!isPending && !isError && options.length === 0 && (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-sm text-muted">
              <ImageOff className="size-6 text-subtle" />
              No covers found for this title — try typing the base game name or SteamGridDB ID above.
            </div>
          )}

          {!isPending && options.length > 0 && (
            <div className="mt-3 min-h-0 flex-1 space-y-6 overflow-y-auto pr-1">
              <CoverSection
                title="Static Covers"
                options={staticOptions}
                newestIds={newestCommunityIds}
                visibleCount={visibleStatic}
                pageSize={PAGE_SIZE}
                onShowMore={() => setVisibleStatic((count) => count + PAGE_SIZE)}
                onShowAll={() => setVisibleStatic(staticOptions.length)}
                disabled={isApplying}
                onPick={handlePick}
                emptyMessage="No static covers found for this game."
              />
              <CoverSection
                title="Live Covers"
                icon={Sparkles}
                options={animatedOptions}
                newestIds={newestCommunityIds}
                visibleCount={visibleAnimated}
                pageSize={12}
                onShowMore={() => setVisibleAnimated((count) => count + 12)}
                onShowAll={() => setVisibleAnimated(animatedOptions.length)}
                disabled={isApplying}
                onPick={handlePick}
                emptyMessage="No Live Covers found for this game."
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
  newestIds,
  visibleCount,
  pageSize,
  onShowMore,
  onShowAll,
  disabled,
  onPick,
  emptyMessage,
}: {
  title: string
  icon?: typeof Sparkles
  options: CoverOption[]
  newestIds: Set<number>
  visibleCount: number
  pageSize: number
  onShowMore: () => void
  onShowAll: () => void
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
      <div className="mt-2 grid grid-cols-4 gap-3 sm:grid-cols-5">
        {visible.map((option) => (
          <CoverOptionThumb
            key={`${option.id}-${option.url}`}
            option={option}
            isRecentUpload={newestIds.has(option.id)}
            disabled={disabled}
            onClick={() => onPick(option)}
          />
        ))}
      </div>
      {hasMore && (
        <div className="mt-4 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={onShowMore}
            className="flex items-center justify-center gap-2 rounded-xl border border-border/80 bg-surface/70 px-5 py-2 text-xs font-bold text-text shadow-xs transition-all duration-200 hover:border-accent/60 hover:bg-surface-raised hover:text-accent hover:scale-105 hover:shadow-md active:scale-95 cursor-pointer"
          >
            <span>Show {Math.min(pageSize, options.length - visibleCount)} More</span>
          </button>
          {options.length - visibleCount > pageSize && (
            <button
              type="button"
              onClick={onShowAll}
              className="flex items-center justify-center gap-2 rounded-xl border border-accent/40 bg-accent/10 px-4 py-2 text-xs font-bold text-accent shadow-xs transition-all duration-200 hover:bg-accent hover:text-white active:scale-95 cursor-pointer"
            >
              <span>Show All ({options.length})</span>
            </button>
          )}
        </div>
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
  isRecentUpload,
  disabled,
  onClick,
}: {
  option: CoverOption
  isRecentUpload: boolean
  disabled: boolean
  onClick: () => void
}) {
  // Always use the lightweight thumbnail URL in the picker list and render a static snapshot
  // (`animatedEnabled={false}`, `alwaysLive={false}`) so browsing Live Covers uses minimal bandwidth!
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
        fallbackSrc={option.url}
        mime={!option.thumbnail_url ? option.mime : undefined}
        isAnimated={option.is_animated}
        animatedEnabled={false}
        alwaysLive={false}
        className="size-full object-cover transition-transform duration-500 ease-out group-hover:scale-108"
      />
      {option.is_animated && (
        <span className="absolute right-1.5 top-1.5 z-10 flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-white shadow-xs">
          <Sparkles className="size-2.5" />
          LIVE
        </span>
      )}
      {!option.is_animated && isRecentUpload && (
        <span className="absolute left-1.5 top-1.5 z-10 rounded-full bg-emerald-500/90 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-white shadow-xs">
          NEW
        </span>
      )}
      {option.width > 0 && option.height > 0 && (
        <span className="absolute bottom-1.5 right-1.5 z-10 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-white/80 opacity-0 transition-opacity group-hover:opacity-100">
          {option.width}×{option.height}
        </span>
      )}

      {/* Dim overlay & apply badge on hover */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100 flex items-end justify-center p-2.5">
        <span className="rounded-lg bg-accent/90 backdrop-blur-sm px-2.5 py-1 text-[10px] font-bold text-white shadow-sm transition-transform duration-200 translate-y-1 group-hover:translate-y-0">
          {option.is_animated ? 'Check Size & Download' : 'Apply Cover'}
        </span>
      </div>
    </button>
  )
}
