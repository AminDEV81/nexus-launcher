import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  Check,
  Clock,
  FolderOpen,
  HardDrive,
  Layers,
  Loader2,
  PackageX,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { useCleanRedistTargets, useStorageAnalysis } from '../hooks/use-cleanup'
import type { GameStorageNode } from '@/services/cleanup'
import { playBoostComplete, playButtonClick } from '@/lib/sound-engine'
import { cn } from '@/lib/utils'

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B'
  const gb = bytes / 1024 ** 3
  if (gb >= 1) return `${gb.toFixed(2)} GB`
  const mb = bytes / 1024 ** 2
  if (mb >= 1) return `${mb.toFixed(1)} MB`
  return `${Math.round(bytes / 1024)} KB`
}

interface TreemapRect {
  game: GameStorageNode
  x: number
  y: number
  w: number
  h: number
}

function computeTreemapRects(games: GameStorageNode[]): TreemapRect[] {
  const valid = games.filter((g) => g.size_bytes > 0).slice(0, 28)
  const total = valid.reduce((sum, g) => sum + g.size_bytes, 0)
  if (total <= 0) return []

  const rects: TreemapRect[] = []
  let x = 0
  let y = 0
  let w = 100
  let h = 100
  let remainingTotal = total

  for (let i = 0; i < valid.length; i++) {
    const g = valid[i]
    const ratio = Math.min(1, g.size_bytes / Math.max(1, remainingTotal))
    const horizontalSplit = w >= h

    if (horizontalSplit) {
      const sliceW = i === valid.length - 1 ? w : w * ratio
      rects.push({ game: g, x, y, w: sliceW, h })
      x += sliceW
      w = Math.max(0, w - sliceW)
    } else {
      const sliceH = i === valid.length - 1 ? h : h * ratio
      rects.push({ game: g, x, y, w, h: sliceH })
      y += sliceH
      h = Math.max(0, h - sliceH)
    }
    remainingTotal = Math.max(0, remainingTotal - g.size_bytes)
  }

  return rects
}

const TREEMAP_COLORS = [
  'from-cyan-500/30 to-blue-600/25 border-cyan-400/40 text-cyan-100',
  'from-violet-500/30 to-indigo-600/25 border-violet-400/40 text-violet-100',
  'from-emerald-500/30 to-teal-600/25 border-emerald-400/40 text-emerald-100',
  'from-sky-500/30 to-indigo-500/25 border-sky-400/40 text-sky-100',
  'from-fuchsia-500/25 to-purple-600/25 border-fuchsia-400/40 text-fuchsia-100',
]

export function StorageTreemapSection() {
  const { data: report, isLoading, isRefetching, refetch } = useStorageAnalysis()
  const cleanRedists = useCleanRedistTargets()

  const [selectedDrive, setSelectedDrive] = useState<string>('all')
  const [hoveredGame, setHoveredGame] = useState<GameStorageNode | null>(null)
  const [selectedRedistPaths, setSelectedRedistPaths] = useState<Set<string>>(new Set())

  const drives = useMemo(() => report?.drives ?? [], [report?.drives])
  const allGames = useMemo(() => report?.games ?? [], [report?.games])
  const redists = useMemo(() => report?.redists ?? [], [report?.redists])

  const filteredGames = useMemo(() => {
    if (selectedDrive === 'all') return allGames
    return allGames.filter((g) => g.drive_mount === selectedDrive)
  }, [allGames, selectedDrive])

  const treemapRects = useMemo(() => computeTreemapRects(filteredGames), [filteredGames])
  const staleGames = useMemo(() => filteredGames.filter((g) => g.is_stale), [filteredGames])

  const selectedRedistBytes = useMemo(
    () =>
      redists
        .filter((r) => selectedRedistPaths.has(r.path))
        .reduce((acc, r) => acc + r.size_bytes, 0),
    [redists, selectedRedistPaths],
  )

  function toggleRedistPath(path: string) {
    playButtonClick()
    setSelectedRedistPaths((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  function selectAllRedists() {
    playButtonClick()
    setSelectedRedistPaths(new Set(redists.map((r) => r.path)))
  }

  function clearRedistsSelection() {
    playButtonClick()
    setSelectedRedistPaths(new Set())
  }

  async function handleCleanRedists() {
    if (selectedRedistPaths.size === 0) return
    playButtonClick()
    try {
      const res = await cleanRedists.mutateAsync(Array.from(selectedRedistPaths))
      playBoostComplete()
      setSelectedRedistPaths(new Set())
      toast.success(
        `Reclaimed ${formatBytes(res.freed_bytes)} across ${res.deleted_items_count} redist/dump target(s).`,
      )
    } catch {
      // Handled by hook
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-surface p-12 text-center">
        <Loader2 className="size-7 animate-spin text-accent" />
        <p className="text-sm font-bold text-text">Analyzing Drives, Game Folders &amp; Redists...</p>
        <p className="text-xs text-subtle">Scanning installed titles and safe cleanup targets</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Summary Header + Refresh */}
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-border bg-surface p-4">
          <span className="text-[10px] font-bold uppercase tracking-wider text-subtle">
            Installed Games
          </span>
          <div className="mt-1 font-mono text-xl font-black text-text">
            {formatBytes(report?.total_games_bytes ?? 0)}
          </div>
          <span className="text-[11px] text-muted">{allGames.length} titles indexed</span>
        </div>

        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
            Dormant (60d+ / ≥15 GB)
          </span>
          <div className="mt-1 font-mono text-xl font-black text-amber-300">
            {formatBytes(report?.stale_games_bytes ?? 0)}
          </div>
          <span className="text-[11px] text-muted">
            {report?.stale_games_count ?? 0} large unused games
          </span>
        </div>

        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
            Safe Redists &amp; Dumps
          </span>
          <div className="mt-1 font-mono text-xl font-black text-emerald-300">
            {formatBytes(report?.total_reclaimable_redist_bytes ?? 0)}
          </div>
          <span className="text-[11px] text-muted">{redists.length} cleanable folders/files</span>
        </div>

        <div className="flex items-center justify-between rounded-2xl border border-border bg-surface p-4">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-subtle">
              Active Drives
            </span>
            <div className="mt-1 font-mono text-xl font-black text-text">{drives.length}</div>
            <span className="text-[11px] text-muted">Click a drive to filter</span>
          </div>
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isRefetching}
            className="flex size-10 items-center justify-center rounded-xl border border-border bg-surface-raised text-text transition hover:border-accent/50 hover:text-accent cursor-pointer"
            title="Rescan Drives & Redists"
          >
            <RefreshCw className={cn('size-4', isRefetching && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Drive Breakdown Bars */}
      {drives.length > 0 && (
        <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-text">
              <HardDrive className="size-4 text-accent" />
              <span>Drive Allocation</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedDrive('all')}
                className={cn(
                  'rounded-lg px-2.5 py-1 text-[11px] font-bold transition cursor-pointer',
                  selectedDrive === 'all'
                    ? 'bg-accent text-white'
                    : 'bg-surface-raised text-muted hover:text-text',
                )}
              >
                All Drives
              </button>
              {drives.map((d) => (
                <button
                  key={d.mount_point}
                  type="button"
                  onClick={() => setSelectedDrive(d.mount_point)}
                  className={cn(
                    'rounded-lg px-2.5 py-1 font-mono text-[11px] font-bold transition cursor-pointer',
                    selectedDrive === d.mount_point
                      ? 'bg-accent text-white'
                      : 'bg-surface-raised text-muted hover:text-text',
                  )}
                >
                  {d.mount_point} ({d.game_count})
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {drives.map((d) => {
              const gamesPct = d.total_bytes > 0 ? (d.games_bytes / d.total_bytes) * 100 : 0
              const otherUsed = Math.max(0, d.used_bytes - d.games_bytes)
              const otherPct = d.total_bytes > 0 ? (otherUsed / d.total_bytes) * 100 : 0
              return (
                <div
                  key={d.mount_point}
                  className="rounded-xl border border-border/70 bg-surface-raised/60 p-3"
                >
                  <div className="flex items-center justify-between text-xs font-bold text-text">
                    <span>
                      {d.mount_point} {d.label ? `(${d.label})` : ''}
                    </span>
                    <span className="font-mono text-[11px] text-muted">
                      {formatBytes(d.available_bytes)} free / {formatBytes(d.total_bytes)}
                    </span>
                  </div>
                  <div className="mt-2 flex h-2.5 w-full overflow-hidden rounded-full bg-black/30">
                    <div
                      className="h-full bg-accent transition-all"
                      style={{ width: `${Math.min(100, gamesPct)}%` }}
                      title={`Nexus Games: ${formatBytes(d.games_bytes)}`}
                    />
                    <div
                      className="h-full bg-slate-500/60 transition-all"
                      style={{ width: `${Math.min(100 - gamesPct, otherPct)}%` }}
                      title={`Other Files: ${formatBytes(otherUsed)}`}
                    />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-[10px] text-subtle">
                    <span className="text-accent font-semibold">
                      Games: {formatBytes(d.games_bytes)} ({d.game_count})
                    </span>
                    <span>Other: {formatBytes(otherUsed)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Interactive Storage Treemap */}
      <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-text">
            <Layers className="size-4 text-accent" />
            <span>Interactive Game Storage Treemap</span>
          </div>
          {hoveredGame ? (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-raised px-3 py-1 text-xs">
              <span className="font-bold text-text">{hoveredGame.name}</span>
              <span className="font-mono font-black text-accent">
                {formatBytes(hoveredGame.size_bytes)}
              </span>
              {hoveredGame.days_since_played != null && (
                <span className="text-subtle">• {hoveredGame.days_since_played}d ago</span>
              )}
            </div>
          ) : (
            <span className="text-[11px] text-subtle">
              Block area reflects disk footprint • Amber = dormant 60d+
            </span>
          )}
        </div>

        {treemapRects.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center text-xs text-muted">
            No installed game folders found on the selected drive.
          </div>
        ) : (
          <div className="relative h-64 w-full overflow-hidden rounded-xl border border-border/80 bg-black/25">
            {treemapRects.map((rect, idx) => {
              const colorCls = rect.game.is_stale
                ? 'from-amber-500/35 to-orange-600/30 border-amber-400/50 text-amber-100'
                : TREEMAP_COLORS[idx % TREEMAP_COLORS.length]
              const showLabel = rect.w >= 11 && rect.h >= 16
              return (
                <div
                  key={rect.game.id}
                  onMouseEnter={() => setHoveredGame(rect.game)}
                  onMouseLeave={() => setHoveredGame(null)}
                  style={{
                    left: `${rect.x}%`,
                    top: `${rect.y}%`,
                    width: `${rect.w}%`,
                    height: `${rect.h}%`,
                  }}
                  className={cn(
                    'absolute p-0.5 transition-transform duration-150 hover:z-10 hover:scale-[1.01]',
                  )}
                  title={`${rect.game.name} — ${formatBytes(rect.game.size_bytes)}`}
                >
                  <div
                    className={cn(
                      'flex size-full flex-col justify-between overflow-hidden rounded-lg border bg-gradient-to-br p-2',
                      colorCls,
                    )}
                  >
                    {showLabel && (
                      <>
                        <span className="line-clamp-2 text-[11px] font-extrabold leading-tight">
                          {rect.game.name}
                        </span>
                        <div className="flex items-center justify-between gap-1 text-[10px] font-mono font-bold opacity-90">
                          <span>{formatBytes(rect.game.size_bytes)}</span>
                          {rect.game.is_stale && <Clock className="size-3 shrink-0 text-amber-300" />}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Dormant Large Games */}
      {staleGames.length > 0 && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="mb-2.5 flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-amber-400">
            <AlertTriangle className="size-4" />
            <span>Dormant Large Titles ({staleGames.length})</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {staleGames.slice(0, 6).map((g) => (
              <div
                key={g.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-amber-500/20 bg-surface/90 px-3 py-2 text-xs"
              >
                <div className="min-w-0">
                  <div className="truncate font-bold text-text">{g.name}</div>
                  <div className="text-[10px] text-subtle">
                    {g.days_since_played != null
                      ? `Last played ${g.days_since_played} days ago`
                      : 'Never launched'}
                  </div>
                </div>
                <span className="shrink-0 font-mono font-black text-amber-400">
                  {formatBytes(g.size_bytes)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Redistributables & Crash Dump Cleaner */}
      <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <PackageX className="size-4 text-emerald-400" />
            <div>
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-text">
                Redistributables &amp; Crash Dump Cleaner
              </h4>
              <p className="text-[11px] text-subtle">
                Safely removes leftover _CommonRedist, DirectX, vcredist installers &amp; .dmp files
              </p>
            </div>
          </div>

          {redists.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={
                  selectedRedistPaths.size === redists.length
                    ? clearRedistsSelection
                    : selectAllRedists
                }
                className="rounded-xl border border-border bg-surface-raised px-3 py-1.5 text-xs font-bold text-text transition hover:border-accent/50 cursor-pointer"
              >
                {selectedRedistPaths.size === redists.length ? 'Deselect All' : 'Select All Safe'}
              </button>
              <button
                type="button"
                disabled={selectedRedistPaths.size === 0 || cleanRedists.isPending}
                onClick={() => void handleCleanRedists()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-1.5 font-mono text-xs font-black text-white shadow-sm transition hover:bg-emerald-500 disabled:opacity-40 cursor-pointer"
              >
                {cleanRedists.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Trash2 className="size-3.5" />
                )}
                <span>
                  Clean ({selectedRedistPaths.size}) • {formatBytes(selectedRedistBytes)}
                </span>
              </button>
            </div>
          )}
        </div>

        {redists.length === 0 ? (
          <div className="flex items-center gap-2.5 rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-4 py-3 text-xs text-emerald-300">
            <ShieldCheck className="size-4 shrink-0" />
            <span>No leftover redistributable installers or crash dumps found in your game folders.</span>
          </div>
        ) : (
          <div className="flex max-h-64 flex-col gap-1.5 overflow-y-auto pr-1">
            {redists.map((item) => {
              const checked = selectedRedistPaths.has(item.path)
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => toggleRedistPath(item.path)}
                  className={cn(
                    'flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left text-xs transition cursor-pointer',
                    checked
                      ? 'border-emerald-500/50 bg-emerald-500/10'
                      : 'border-border/70 bg-surface-raised/50 hover:border-border',
                  )}
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      className={cn(
                        'flex size-4 shrink-0 items-center justify-center rounded border',
                        checked
                          ? 'border-emerald-500 bg-emerald-500 text-white'
                          : 'border-border bg-surface',
                      )}
                    >
                      {checked && <Check className="size-3" />}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-text">{item.game_name}</span>
                        <span className="rounded bg-surface-raised px-1.5 py-0.5 font-mono text-[10px] font-bold text-accent">
                          {item.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 truncate font-mono text-[10px] text-subtle">
                        <FolderOpen className="size-3 shrink-0" />
                        <span className="truncate">{item.path}</span>
                      </div>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-mono font-black text-emerald-400">
                      {formatBytes(item.size_bytes)}
                    </div>
                    <div className="text-[10px] text-subtle">{item.file_count} file(s)</div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
