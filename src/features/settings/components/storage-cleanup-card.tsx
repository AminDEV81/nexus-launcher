import { useState } from 'react'
import { HardDrive, Loader2, Trash2, CheckCircle2, RefreshCw } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getOrphanedArtworkSummary, cleanupOrphanedArtworks } from '@/services/metadata'
import { useSettings, useSetSetting } from '@/features/settings/hooks/use-settings'
import { cn } from '@/lib/utils'

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B'
  const mb = bytes / (1024 * 1024)
  if (mb >= 1) return `${mb.toFixed(1)} MB`
  const kb = bytes / 1024
  return `${kb.toFixed(0)} KB`
}

export function StorageCleanupCard({ className }: { className?: string }) {
  const queryClient = useQueryClient()
  const [isRefreshing, setIsRefreshing] = useState(false)
  const { data: settings } = useSettings()
  const setSetting = useSetSetting()
  const autoDelete =
    settings?.auto_delete_artwork_on_remove === 'true' ||
    settings?.auto_delete_artwork_on_remove === '1'

  const {
    data: summary,
    isPending,
    refetch,
  } = useQuery({
    queryKey: ['orphaned-artworks'],
    queryFn: getOrphanedArtworkSummary,
    staleTime: 30_000,
  })

  const cleanupMutation = useMutation({
    mutationFn: cleanupOrphanedArtworks,
    onSuccess: (res) => {
      queryClient.setQueryData(['orphaned-artworks'], { orphaned_count: 0, total_bytes: 0 })
      if (res.orphaned_count > 0) {
        toast.success(
          `Freed ${formatBytes(res.total_bytes)} across ${res.orphaned_count} unused game artwork folder${
            res.orphaned_count === 1 ? '' : 's'
          }.`,
        )
      } else {
        toast.info('No orphaned artwork folders found on disk.')
      }
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Could not clean orphaned artworks.')
    },
  })

  async function handleRefresh() {
    setIsRefreshing(true)
    try {
      await refetch()
    } finally {
      setIsRefreshing(false)
    }
  }

  const orphanedCount = summary?.orphaned_count ?? 0
  const freedBytes = summary?.total_bytes ?? 0
  const hasOrphans = orphanedCount > 0

  return (
    <div
      className={cn(
        'flex flex-col gap-4 rounded-2xl border border-border/80 bg-surface/60 p-5 shadow-sm',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3 border-b border-border/60 pb-3.5">
        <div className="flex items-start gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-accent/15 text-accent shadow-xs">
            <HardDrive className="size-5" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-text">Cover &amp; Artwork Storage</span>
              <span
                className={cn(
                  'flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] font-bold',
                  hasOrphans
                    ? 'border border-amber-500/30 bg-amber-500/10 text-amber-500'
                    : 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
                )}
              >
                <span
                  className={cn(
                    'size-1.5 rounded-full',
                    hasOrphans ? 'bg-amber-500' : 'bg-emerald-400',
                  )}
                />
                <span>
                  {hasOrphans
                    ? `${orphanedCount} Unused Folder${orphanedCount === 1 ? '' : 's'}`
                    : 'Storage Clean'}
                </span>
              </span>
            </div>
            <div className="mt-0.5 text-xs text-subtle">
              Manage and purge cached covers, banners, and logos for games deleted from your
              library.
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleRefresh}
          disabled={isPending || isRefreshing || cleanupMutation.isPending}
          title="Scan disk again"
          className="flex size-8 items-center justify-center rounded-lg border border-border text-subtle transition-colors hover:bg-surface-raised hover:text-text disabled:opacity-50"
        >
          <RefreshCw className={cn('size-3.5', (isRefreshing || isPending) && 'animate-spin')} />
        </button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-border/60 bg-surface px-3 py-2">
            <span className="block text-[10px] font-bold uppercase text-subtle">
              Orphaned Space
            </span>
            <span className="mt-0.5 font-mono text-sm font-black text-text">
              {isPending ? '…' : formatBytes(freedBytes)}
            </span>
          </div>
          <div className="rounded-xl border border-border/60 bg-surface px-3 py-2">
            <span className="block text-[10px] font-bold uppercase text-subtle">Deleted Games</span>
            <span className="mt-0.5 font-mono text-sm font-black text-text">
              {isPending ? '…' : orphanedCount}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => cleanupMutation.mutate()}
          disabled={cleanupMutation.isPending || isPending || !hasOrphans}
          className={cn(
            'flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold shadow-sm transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed',
            hasOrphans
              ? 'bg-accent text-white shadow-accent/25 hover:bg-accent-hover'
              : 'border border-border/80 bg-surface text-subtle',
          )}
        >
          {cleanupMutation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : hasOrphans ? (
            <Trash2 className="size-4" />
          ) : (
            <CheckCircle2 className="size-4 text-emerald-400" />
          )}
          <span>
            {cleanupMutation.isPending
              ? 'Purging Files…'
              : hasOrphans
                ? 'Purge Unused Covers'
                : 'All Artwork in Use'}
          </span>
        </button>
      </div>

      {/* Auto-Delete Toggle Option */}
      <div className="flex items-center justify-between border-t border-border/60 pt-3">
        <div className="flex flex-col">
          <span className="text-xs font-semibold text-text">
            Auto-delete artwork when game is removed
          </span>
          <span className="text-[11px] text-muted leading-tight">
            If disabled, artwork is preserved on disk until you manually purge it above.
          </span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={autoDelete}
          onClick={() =>
            setSetting.mutate({
              key: 'auto_delete_artwork_on_remove',
              value: autoDelete ? 'false' : 'true',
            })
          }
          className={cn(
            'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none',
            autoDelete ? 'bg-accent' : 'bg-surface-raised border border-border',
          )}
        >
          <span
            className={cn(
              'pointer-events-none inline-block size-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out',
              autoDelete ? 'translate-x-4' : 'translate-x-0',
            )}
          />
        </button>
      </div>
    </div>
  )
}
