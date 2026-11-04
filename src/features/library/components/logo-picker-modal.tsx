import { useEffect, useMemo, useState } from 'react'
import {
  Clock,
  Flame,
  ImageOff,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  Upload,
  X,
} from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { CoverMedia } from '@/components/ui/cover-media'
import { cn } from '@/lib/utils'
import {
  sortArtworkOptions,
  useApplyLogo,
  useLogoOptions,
  useResetArtwork,
  type ArtworkSortMode,
} from '../hooks/use-cover-options'
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
  } = useLogoOptions(gameId ?? undefined, open, submittedQuery, refreshTick)

  const applyLogo = useApplyLogo()
  const resetArtwork = useResetArtwork()
  const isApplying = applyLogo.isPending || resetArtwork.isPending

  useEffect(() => {
    if (open) {
      setVisibleCount(12)
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

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault()
    setVisibleCount(12)
    setSubmittedQuery(searchInput.trim())
  }

  function handleLiveRefresh() {
    setVisibleCount(12)
    setRefreshTick((t) => t + 1)
  }

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
        <div className="flex h-[min(75vh,650px)] flex-col p-6">
          <div className="flex shrink-0 items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-text">Choose a Logo</h2>
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                  <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live SteamGridDB
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted">
                Real-time community logos from SteamGridDB, official Steam logos, or your own image.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2 pr-9">
              <button
                type="button"
                onClick={handleLiveRefresh}
                disabled={isFetching || isApplying}
                title="Fetch latest community logos live from SteamGridDB"
                className="flex items-center gap-1.5 rounded-xl border border-border/80 bg-surface/70 px-3 py-1.5 text-xs font-semibold text-text shadow-xs transition-all duration-200 hover:bg-surface-raised hover:border-emerald-500/50 hover:text-emerald-400 hover:scale-105 active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={cn('size-3.5', isFetching && 'animate-spin text-emerald-400')} />
                <span>Sync Live</span>
              </button>
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

          {/* Live SteamGridDB Search & Sort Bar */}
          <div className="mt-3 flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 bg-surface/50 p-2">
            <form onSubmit={handleSearchSubmit} className="relative flex flex-1 items-center min-w-[220px]">
              <Search className="pointer-events-none absolute left-3 size-3.5 text-muted" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search SteamGridDB by custom game title or edition…"
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
              >
                <Flame className="size-3" />
                <span>Popular</span>
              </button>
            </div>
          </div>

          {isPending && (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-sm text-muted">
              <Loader2 className="size-5 animate-spin text-accent" />
              Fetching live logos from SteamGridDB…
            </div>
          )}
          {!isPending && isError && (
            <Empty message={error instanceof Error ? error.message : 'Could not load logos.'} />
          )}
          {!isPending && !isError && options.length === 0 && (
            <Empty message="No logos found for this game — try searching by base title above or use Browse." />
          )}
          {!isPending && options.length > 0 && (
            <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {options.slice(0, visibleCount).map((option) => (
                  <LogoTile
                    key={`${option.id}-${option.url}`}
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
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100 flex items-end justify-center p-2.5">
        <span className="rounded-lg bg-accent/90 backdrop-blur-sm px-2.5 py-1 text-[10px] font-bold text-white shadow-sm transition-transform duration-200 translate-y-1 group-hover:translate-y-0">
          Apply Logo
        </span>
      </div>
    </button>
  )
}
