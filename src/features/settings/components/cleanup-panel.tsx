import { useState, useMemo } from 'react'
import {
  Trash2,
  HardDrive,
  ShieldCheck,
  RefreshCw,
  Loader2,
  FolderX,
  History,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Layers,
  Sparkles,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { useCleanupScan, useExecuteCleanup } from '../hooks/use-cleanup'
import type { CleanupCategory } from '@/services/cleanup'
import { useAnimationSpeed } from '@/hooks/use-animation-speed'
import { playButtonClick, playBoostComplete } from '@/lib/sound-engine'
import { cn } from '@/lib/utils'

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B'
  const gb = bytes / (1024 * 1024 * 1024)
  if (gb >= 1) return `${gb.toFixed(2)} GB`
  const mb = bytes / (1024 * 1024)
  if (mb >= 1) return `${mb.toFixed(1)} MB`
  const kb = bytes / 1024
  return `${kb.toFixed(0)} KB`
}

const CATEGORY_META: Record<
  CleanupCategory,
  { label: string; icon: typeof Trash2; badgeColor: string }
> = {
  orphaned_saves: {
    label: 'Orphaned Game Saves',
    icon: FolderX,
    badgeColor: 'border-rose-500/30 bg-rose-500/10 text-rose-500 dark:text-rose-400',
  },
  save_snapshots: {
    label: 'Save Snapshots',
    icon: History,
    badgeColor: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  },
  orphaned_artworks: {
    label: 'Artwork Cache',
    icon: ImageIcon,
    badgeColor: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
  },
  legacy_appdata: {
    label: 'Legacy AppData',
    icon: HardDrive,
    badgeColor: 'border-purple-500/30 bg-purple-500/10 text-purple-600 dark:text-purple-400',
  },
  staging_cache: {
    label: 'Staging Scratch',
    icon: Layers,
    badgeColor: 'border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400',
  },
}

export function CleanupPanel() {
  const speed = useAnimationSpeed()
  const { data: report, isLoading, isRefetching, refetch } = useCleanupScan()
  const executeMutation = useExecuteCleanup()

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [copiedPath, setCopiedPath] = useState<string | null>(null)
  const [showConfirmModal, setShowConfirmModal] = useState(false)

  const items = useMemo(() => report?.items ?? [], [report?.items])
  const hasItems = items.length > 0

  // Auto-select all safe items on first load if nothing selected yet
  const allItemIds = useMemo(() => new Set(items.map((i) => i.id)), [items])

  function handleSelectAll() {
    playButtonClick()
    setSelectedIds(new Set(allItemIds))
  }

  function handleDeselectAll() {
    playButtonClick()
    setSelectedIds(new Set())
  }

  function handleToggleItem(id: string) {
    playButtonClick()
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  function handleCopyPath(path: string) {
    navigator.clipboard.writeText(path)
    setCopiedPath(path)
    toast.success('Path copied to clipboard')
    setTimeout(() => setCopiedPath(null), 2000)
  }

  const selectedItems = useMemo(
    () => items.filter((i) => selectedIds.has(i.id)),
    [items, selectedIds],
  )

  const selectedBytes = useMemo(
    () => selectedItems.reduce((acc, curr) => acc + curr.size_bytes, 0),
    [selectedItems],
  )

  const filteredItems = useMemo(() => {
    if (activeCategory === 'all') return items
    return items.filter((i) => i.category === activeCategory)
  }, [items, activeCategory])

  const isAllFilteredSelected = useMemo(() => {
    if (filteredItems.length === 0) return false
    return filteredItems.every((i) => selectedIds.has(i.id))
  }, [filteredItems, selectedIds])

  const isSomeFilteredSelected = useMemo(() => {
    return filteredItems.some((i) => selectedIds.has(i.id)) && !isAllFilteredSelected
  }, [filteredItems, selectedIds, isAllFilteredSelected])

  const selectedFilteredCount = useMemo(() => {
    return filteredItems.filter((i) => selectedIds.has(i.id)).length
  }, [filteredItems, selectedIds])

  function handleToggleSelectAllFiltered() {
    playButtonClick()
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (isAllFilteredSelected) {
        filteredItems.forEach((i) => next.delete(i.id))
      } else {
        filteredItems.forEach((i) => next.add(i.id))
      }
      return next
    })
  }

  function handleSelectAllFiltered() {
    playButtonClick()
    setSelectedIds((prev) => {
      const next = new Set(prev)
      filteredItems.forEach((i) => next.add(i.id))
      return next
    })
  }

  function handleDeselectAllFiltered() {
    playButtonClick()
    setSelectedIds((prev) => {
      const next = new Set(prev)
      filteredItems.forEach((i) => next.delete(i.id))
      return next
    })
  }

  async function handleExecute() {
    if (selectedIds.size === 0) return
    playButtonClick()
    setShowConfirmModal(false)

    const idsToClean = Array.from(selectedIds)
    try {
      const res = await executeMutation.mutateAsync(idsToClean)
      playBoostComplete()
      toast.success(
        `Successfully reclaimed ${formatBytes(res.freed_bytes)} across ${res.deleted_items_count} target(s)!`,
      )
      setSelectedIds(new Set())
    } catch {
      // Error handled by mutation onError
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header Metric Dashboard */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Card 1: Reclaimable Space */}
        <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-surface/80 p-5 shadow-xs transition-all hover:border-accent/40">
          <div className="flex items-center justify-between text-muted">
            <span className="font-mono text-xs font-bold uppercase tracking-wider">
              Reclaimable Space
            </span>
            <Trash2
              className={cn(
                'size-4',
                (report?.total_reclaimable_bytes ?? 0) > 0 ? 'text-accent' : 'text-emerald-500',
              )}
            />
          </div>
          <div className="mt-2 font-mono text-2xl font-black text-text">
            {formatBytes(report?.total_reclaimable_bytes ?? 0)}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-muted">
            {(report?.total_reclaimable_bytes ?? 0) > 0 ? (
              <span className="inline-flex items-center gap-1 font-medium text-amber-600 dark:text-amber-400">
                <AlertCircle className="size-3" />
                {report?.total_items_count ?? 0} cleanable item(s) found
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="size-3" />
                Storage is clean &amp; optimized
              </span>
            )}
          </div>
        </div>

        {/* Card 2: Selected to Clean */}
        <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-surface/80 p-5 shadow-xs transition-all hover:border-accent/40">
          <div className="flex items-center justify-between text-muted">
            <span className="font-mono text-xs font-bold uppercase tracking-wider">
              Selected Targets
            </span>
            <Sparkles className="size-4 text-accent" />
          </div>
          <div className="mt-2 font-mono text-2xl font-black text-accent">
            {formatBytes(selectedBytes)}
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-muted">
            <span>
              {selectedItems.length} of {items.length} items chosen
            </span>
            {hasItems && (
              <div className="flex items-center gap-1.5 font-medium">
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="text-accent hover:underline"
                >
                  All
                </button>
                <span>•</span>
                <button
                  type="button"
                  onClick={handleDeselectAll}
                  className="text-muted hover:text-text hover:underline"
                >
                  None
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Card 3: Protected Saves */}
        <div className="relative overflow-hidden rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5 shadow-xs">
          <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400">
            <span className="font-mono text-xs font-bold uppercase tracking-wider">
              Protected Game Saves
            </span>
            <ShieldCheck className="size-4" />
          </div>
          <div className="mt-2 font-mono text-2xl font-black text-text">
            {formatBytes(report?.live_saves_protected_bytes ?? 0)}
          </div>
          <div className="mt-1 text-xs text-muted">
            Active game saves in{' '}
            <code className="font-mono text-emerald-600 dark:text-emerald-400">current</code> are
            never touched.
          </div>
        </div>
      </div>

      {/* Control Bar: Category Filters & Action Button */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-border bg-surface-raised/50 p-3.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveCategory('all')}
            className={cn(
              'rounded-xl px-3 py-1.5 text-xs font-bold transition-all',
              activeCategory === 'all'
                ? 'bg-accent text-white shadow-xs'
                : 'text-muted hover:bg-surface hover:text-text',
            )}
          >
            All Categories ({items.length})
          </button>
          {(
            [
              'orphaned_saves',
              'save_snapshots',
              'orphaned_artworks',
              'legacy_appdata',
            ] as CleanupCategory[]
          ).map((cat) => {
            const count = items.filter((i) => i.category === cat).length
            if (count === 0) return null
            const meta = CATEGORY_META[cat]
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className={cn(
                  'flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all',
                  activeCategory === cat
                    ? 'bg-accent text-white shadow-xs'
                    : 'text-muted hover:bg-surface hover:text-text',
                )}
              >
                <span>{meta.label}</span>
                <span className="rounded-full bg-surface-raised/60 px-1.5 py-0.2 font-mono text-[10px]">
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isLoading || isRefetching}
            className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-2 text-xs font-bold text-muted transition-all hover:border-accent/40 hover:text-text active:scale-95 disabled:opacity-50"
            title="Rescan disk for cleanable items"
          >
            <RefreshCw
              className={cn('size-3.5', (isLoading || isRefetching) && 'animate-spin text-accent')}
            />
            <span className="hidden sm:inline">Rescan</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (selectedIds.size > 0) setShowConfirmModal(true)
            }}
            disabled={selectedIds.size === 0 || executeMutation.isPending}
            className={cn(
              'flex items-center gap-2 rounded-xl px-4 py-2 font-mono text-xs font-black shadow-md transition-all active:scale-95 disabled:pointer-events-none disabled:opacity-40',
              selectedIds.size > 0
                ? 'bg-accent hover:bg-accent-hover text-white shadow-accent/25'
                : 'bg-surface-raised text-muted border border-border',
            )}
          >
            {executeMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Trash2 className="size-4" />
            )}
            <span>Clean Selected {selectedBytes > 0 && `(${formatBytes(selectedBytes)})`}</span>
          </button>
        </div>
      </div>

      {/* Target Items List */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-border/80 bg-surface/40 py-16 text-muted">
          <Loader2 className="size-8 animate-spin text-accent" />
          <span className="font-mono text-xs font-bold uppercase tracking-wider">
            Scanning storage paths &amp; save hierarchies...
          </span>
        </div>
      ) : !hasItems ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-3xl border border-emerald-500/30 bg-emerald-500/5 py-16 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-500 shadow-sm ring-1 ring-emerald-500/30">
            <CheckCircle2 className="size-7" />
          </div>
          <div>
            <h3 className="text-base font-bold text-text">Nexus Storage is Clean!</h3>
            <p className="mt-1 max-w-md text-xs text-muted">
              No orphaned save directories, redundant snapshots, or obsolete cache folders were
              found on disk.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {/* Master Select All Bar */}
          {filteredItems.length > 0 && (
            <div className="flex items-center justify-between rounded-2xl border border-border/80 bg-surface/70 px-4 py-3 shadow-xs">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleToggleSelectAllFiltered}
                  className="group flex items-center gap-2.5 text-xs font-bold text-text transition-colors hover:text-accent"
                >
                  <div
                    className={cn(
                      'flex size-5 items-center justify-center rounded-lg border transition-all',
                      isAllFilteredSelected
                        ? 'border-accent bg-accent text-white shadow-xs'
                        : isSomeFilteredSelected
                          ? 'border-accent/60 bg-accent/15 text-accent'
                          : 'border-border/80 bg-surface group-hover:border-accent/50',
                    )}
                  >
                    {isAllFilteredSelected && <Check className="size-3.5 stroke-[3]" />}
                    {!isAllFilteredSelected && isSomeFilteredSelected && (
                      <div className="size-2 rounded-xs bg-accent" />
                    )}
                  </div>
                  <span>
                    Select All{' '}
                    {activeCategory !== 'all'
                      ? `in ${CATEGORY_META[activeCategory as CleanupCategory]?.label ?? activeCategory}`
                      : `(${items.length})`}
                  </span>
                </button>
                <span className="text-muted/40">•</span>
                <span className="font-mono text-[11px] text-muted">
                  {selectedFilteredCount} of {filteredItems.length} selected
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectAllFiltered}
                  className="rounded-xl border border-border/70 bg-surface-raised/60 px-3 py-1.5 text-xs font-bold text-accent transition-all hover:bg-accent hover:text-white active:scale-95"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={handleDeselectAllFiltered}
                  className="rounded-xl border border-border/70 bg-surface px-3 py-1.5 text-xs font-bold text-muted transition-all hover:bg-surface-raised hover:text-text active:scale-95"
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          {filteredItems.length === 0 && (
            <div className="rounded-2xl border border-border/80 bg-surface/40 p-8 text-center text-xs text-muted">
              No items in this category.
            </div>
          )}

          <AnimatePresence>
            {filteredItems.map((item) => {
              const isSelected = selectedIds.has(item.id)
              const meta = CATEGORY_META[item.category as CleanupCategory] || {
                label: item.category,
                icon: HardDrive,
                badgeColor: 'border-border bg-surface-raised text-muted',
              }
              const Icon = meta.icon

              return (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.15 * speed }}
                  className={cn(
                    'group relative flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border p-4 transition-all duration-200',
                    isSelected
                      ? 'border-accent/40 bg-accent/5 shadow-xs'
                      : 'border-border/80 bg-surface/60 hover:border-border hover:bg-surface/90',
                  )}
                >
                  <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                    {/* Custom Cyber Checkbox */}
                    <button
                      type="button"
                      onClick={() => handleToggleItem(item.id)}
                      className={cn(
                        'mt-0.5 sm:mt-0 flex size-5 shrink-0 items-center justify-center rounded-lg border transition-all',
                        isSelected
                          ? 'border-accent bg-accent text-white shadow-xs'
                          : 'border-border bg-surface-raised text-transparent group-hover:border-accent/50',
                      )}
                    >
                      <Check className="size-3.5 stroke-[3]" />
                    </button>

                    {/* Category Icon */}
                    <div
                      className={cn(
                        'hidden sm:flex size-9 shrink-0 items-center justify-center rounded-xl border',
                        meta.badgeColor,
                      )}
                    >
                      <Icon className="size-4.5" />
                    </div>

                    {/* Item Information */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="truncate text-sm font-bold text-text">{item.title}</span>
                        <span
                          className={cn(
                            'rounded-md border px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider',
                            meta.badgeColor,
                          )}
                        >
                          {meta.label}
                        </span>
                        {item.item_count > 0 && (
                          <span className="font-mono text-[10px] text-muted">
                            {item.item_count} file{item.item_count === 1 ? '' : 's'}
                          </span>
                        )}
                      </div>

                      <div className="mt-0.5 truncate text-xs text-muted">{item.subtitle}</div>

                      {/* Path tooltip / copy */}
                      <div className="mt-1 flex items-center gap-1.5 text-[10px] text-subtle font-mono truncate">
                        <span className="truncate max-w-[320px] sm:max-w-md">{item.path}</span>
                        <button
                          type="button"
                          onClick={() => handleCopyPath(item.path)}
                          className="shrink-0 rounded p-0.5 hover:bg-surface-raised hover:text-text transition-colors"
                          title="Copy path"
                        >
                          {copiedPath === item.path ? (
                            <Check className="size-3 text-emerald-500" />
                          ) : (
                            <Copy className="size-3" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Size and Quick Action */}
                  <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/50">
                    <span className="font-mono text-sm font-black text-text">
                      {formatBytes(item.size_bytes)}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedIds(new Set([item.id]))
                        setShowConfirmModal(true)
                      }}
                      className="rounded-xl border border-border bg-surface px-2.5 py-1 text-[11px] font-bold text-muted hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-500 transition-all active:scale-95"
                    >
                      Delete
                    </button>
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm"
            onClick={() => setShowConfirmModal(false)}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="relative w-full max-w-md overflow-hidden rounded-3xl border border-border bg-surface p-6 shadow-2xl text-text z-10"
          >
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-2xl border border-rose-500/30 bg-rose-500/15 text-rose-500">
                <Trash2 className="size-5.5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-text">Confirm Storage Cleanup</h3>
                <p className="text-xs text-muted">Permanent file deletion</p>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-border bg-surface-raised/60 p-4 text-xs text-muted">
              <div className="flex items-center justify-between border-b border-border/60 pb-2">
                <span>Selected Items:</span>
                <span className="font-mono font-bold text-text">{selectedItems.length}</span>
              </div>
              <div className="flex items-center justify-between pt-2">
                <span>Total Space to Reclaim:</span>
                <span className="font-mono font-black text-rose-500 dark:text-rose-400">
                  {formatBytes(selectedBytes)}
                </span>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-[11px] text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
              <ShieldCheck className="size-4 shrink-0 text-emerald-500" />
              <span>
                Safety verified: Your active game saves in{' '}
                <code className="font-mono font-bold">current</code> will not be affected.
              </span>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="rounded-xl border border-border px-4 py-2 text-xs font-bold text-muted hover:bg-surface-raised hover:text-text transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecute}
                disabled={executeMutation.isPending}
                className="flex items-center gap-1.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white px-4 py-2 font-mono text-xs font-black shadow-md transition-all active:scale-95"
              >
                {executeMutation.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Trash2 className="size-3.5" />
                )}
                <span>Permanently Free Space</span>
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}
