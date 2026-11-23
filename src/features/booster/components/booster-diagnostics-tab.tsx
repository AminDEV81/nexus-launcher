import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Activity,
  CheckCircle2,
  Clock,
  Flame,
  History,
  Loader2,
  RefreshCw,
  Trash2,
  Wifi,
  Zap,
} from 'lucide-react'
import { toast } from 'sonner'
import { measureGamingLatency, purgeShaderCaches, scanShaderCaches } from '@/services/booster'
import { playBoostComplete, playButtonClick } from '@/lib/sound-engine'
import { cn } from '@/lib/utils'

export interface BoostHistoryRecord {
  id: string
  timestamp: number
  profile: string
  freedRamBytes: number
  closedAppsCount: number
  appliedSteps: number
  totalSteps: number
}

const BOOST_HISTORY_KEY = 'nexus_booster_history_v1'

export function readBoostHistory(): BoostHistoryRecord[] {
  try {
    const raw = localStorage.getItem(BOOST_HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as BoostHistoryRecord[]) : []
  } catch {
    return []
  }
}

export function appendBoostHistory(record: Omit<BoostHistoryRecord, 'id' | 'timestamp'>): void {
  try {
    const list = readBoostHistory()
    const next: BoostHistoryRecord[] = [
      {
        ...record,
        id: `bh_${Date.now()}`,
        timestamp: Date.now(),
      },
      ...list,
    ].slice(0, 12)
    localStorage.setItem(BOOST_HISTORY_KEY, JSON.stringify(next))
  } catch {
    // Ignore storage errors
  }
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 MB'
  const gb = bytes / 1024 ** 3
  if (gb >= 1) return `${gb.toFixed(2)} GB`
  const mb = bytes / 1024 ** 2
  if (mb >= 1) return `${mb.toFixed(1)} MB`
  return `${Math.round(bytes / 1024)} KB`
}

export function BoosterDiagnosticsTab() {
  const queryClient = useQueryClient()
  const [history, setHistory] = useState<BoostHistoryRecord[]>(() => readBoostHistory())

  useEffect(() => {
    setHistory(readBoostHistory())
  }, [])

  const {
    data: latencyList = [],
    isLoading: isTestingLatency,
    isRefetching: isRefetchingLatency,
    refetch: refetchLatency,
  } = useQuery({
    queryKey: ['booster', 'gaming-latency'],
    queryFn: measureGamingLatency,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })

  const {
    data: shaderCaches = [],
    isLoading: isScanningShaders,
    refetch: refetchShaders,
  } = useQuery({
    queryKey: ['booster', 'shader-caches'],
    queryFn: scanShaderCaches,
    staleTime: 60_000,
  })

  const purgeMutation = useMutation({
    mutationFn: (ids?: string[]) => purgeShaderCaches(ids),
    onSuccess: (res) => {
      playBoostComplete()
      void queryClient.invalidateQueries({ queryKey: ['booster', 'shader-caches'] })
      toast.success('GPU Shader Cache Cleaned', { description: res.detail })
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to purge shader cache.')
    },
  })

  const totalShaderBytes = useMemo(
    () => shaderCaches.reduce((sum, c) => sum + c.size_bytes, 0),
    [shaderCaches],
  )

  const totalHistoricalRamFreed = useMemo(
    () => history.reduce((sum, h) => sum + h.freedRamBytes, 0),
    [history],
  )

  return (
    <div className="flex flex-col gap-5">
      {/* 1. Live Gaming Latency & Jitter Monitor */}
      <div className="rounded-2xl border border-border/80 bg-surface p-5 shadow-xs">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/10 text-cyan-400">
              <Wifi className="size-5" />
            </span>
            <div>
              <h3 className="text-sm font-extrabold text-text">
                Live Gaming Ping &amp; Jitter Monitor
              </h3>
              <p className="text-xs text-subtle">
                Multi-sample TCP handshake latency across gaming DNS &amp; EU/Global server edges
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={isTestingLatency || isRefetchingLatency}
            onClick={() => {
              playButtonClick()
              void refetchLatency()
            }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface-raised px-3.5 py-2 text-xs font-bold text-text transition hover:border-accent/50 hover:text-accent disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw
              className={cn(
                'size-3.5 text-accent',
                (isTestingLatency || isRefetchingLatency) && 'animate-spin',
              )}
            />
            <span>{isTestingLatency || isRefetchingLatency ? 'Measuring...' : 'Test Latency'}</span>
          </button>
        </div>

        {isTestingLatency ? (
          <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted">
            <Loader2 className="size-4 animate-spin text-accent" />
            <span>Probing gaming endpoints (3 samples each)...</span>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {latencyList.map((item) => {
              const tone =
                item.status === 'excellent'
                  ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-400'
                  : item.status === 'good'
                    ? 'border-cyan-500/35 bg-cyan-500/10 text-cyan-400'
                    : item.status === 'moderate'
                      ? 'border-amber-500/35 bg-amber-500/10 text-amber-400'
                      : 'border-rose-500/35 bg-rose-500/10 text-rose-400'
              return (
                <div
                  key={item.name}
                  className="flex flex-col justify-between gap-2 rounded-xl border border-border/70 bg-surface-raised/60 p-3.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-xs font-extrabold text-text">{item.name}</div>
                      <div className="truncate font-mono text-[10px] text-subtle">
                        {item.region}
                      </div>
                    </div>
                    <span
                      className={cn(
                        'shrink-0 rounded-md border px-1.5 py-0.5 font-mono text-[9px] font-black uppercase',
                        tone,
                      )}
                    >
                      {item.status}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between border-t border-border/50 pt-2 font-mono">
                    <span className="text-lg font-black text-text">
                      {item.avg_ms != null ? `${item.avg_ms} ms` : 'Timeout'}
                    </span>
                    <span className="text-[10px] text-subtle">
                      Jitter: {item.jitter_ms != null ? `±${item.jitter_ms}ms` : '—'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 2. GPU Shader Cache Analyzer & 1-Click Purge */}
      <div className="rounded-2xl border border-border/80 bg-surface p-5 shadow-xs">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-400">
              <Flame className="size-5" />
            </span>
            <div>
              <h3 className="text-sm font-extrabold text-text">
                GPU Shader Cache Analyzer (NVIDIA / AMD / DirectX)
              </h3>
              <p className="text-xs text-subtle">
                Stale shader caches after driver updates cause micro-stutter — safely purge unlocked
                files
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                playButtonClick()
                void refetchShaders()
              }}
              className="rounded-xl border border-border bg-surface-raised p-2 text-muted transition hover:text-text cursor-pointer"
              title="Rescan Shader Caches"
            >
              <RefreshCw className="size-4" />
            </button>
            <button
              type="button"
              disabled={purgeMutation.isPending || totalShaderBytes === 0}
              onClick={() => {
                playButtonClick()
                purgeMutation.mutate(undefined)
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-3.5 py-2 font-mono text-xs font-black text-black shadow-sm transition hover:bg-amber-400 disabled:opacity-40 cursor-pointer"
            >
              {purgeMutation.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Trash2 className="size-3.5" />
              )}
              <span>Purge All ({formatBytes(totalShaderBytes)})</span>
            </button>
          </div>
        </div>

        {isScanningShaders ? (
          <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted">
            <Loader2 className="size-4 animate-spin text-accent" />
            <span>Scanning GPU shader directories...</span>
          </div>
        ) : shaderCaches.length === 0 ? (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-4 py-3 text-xs text-emerald-400">
            <CheckCircle2 className="size-4 shrink-0" />
            <span>No GPU shader cache folders detected or all caches are clean.</span>
          </div>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {shaderCaches.map((cache) => (
              <div
                key={cache.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-surface-raised/60 p-3.5"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="rounded bg-accent/15 px-1.5 py-0.5 font-mono text-[9.5px] font-black text-accent">
                      {cache.vendor}
                    </span>
                    <span className="truncate text-xs font-bold text-text">{cache.label}</span>
                  </div>
                  <div className="mt-1 truncate font-mono text-[10px] text-subtle">
                    {cache.file_count} files • {formatBytes(cache.size_bytes)}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={purgeMutation.isPending || cache.size_bytes === 0}
                  onClick={() => {
                    playButtonClick()
                    purgeMutation.mutate([cache.id])
                  }}
                  className="shrink-0 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[11px] font-bold text-text transition hover:border-amber-500/50 hover:text-amber-400 disabled:opacity-40 cursor-pointer"
                >
                  Clean
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 3. Boost Session Impact History */}
      <div className="rounded-2xl border border-border/80 bg-surface p-5 shadow-xs">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
              <History className="size-5" />
            </span>
            <div>
              <h3 className="text-sm font-extrabold text-text">Boost Session Impact History</h3>
              <p className="text-xs text-subtle">
                Total RAM reclaimed across recent sessions:{' '}
                <strong className="font-mono text-emerald-400">
                  {formatBytes(totalHistoricalRamFreed)}
                </strong>
              </p>
            </div>
          </div>

          {history.length > 0 && (
            <button
              type="button"
              onClick={() => {
                playButtonClick()
                try {
                  localStorage.removeItem(BOOST_HISTORY_KEY)
                } catch {
                  // Ignore
                }
                setHistory([])
              }}
              className="rounded-xl border border-border bg-surface-raised px-3 py-1.5 text-xs font-bold text-muted transition hover:text-rose-400 cursor-pointer"
            >
              Clear Log
            </button>
          )}
        </div>

        {history.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-subtle">
            Run a Game Boost from the Reactor tab to record RAM reclaimed and module impact here.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {history.map((entry) => (
              <div
                key={entry.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-surface-raised/50 px-3.5 py-2.5 text-xs"
              >
                <div className="flex items-center gap-2.5">
                  <Zap className="size-4 text-accent" />
                  <div>
                    <span className="font-bold text-text">{entry.profile}</span>
                    <span className="ml-2 inline-flex items-center gap-1 text-[10.5px] text-subtle">
                      <Clock className="size-3" />
                      {new Date(entry.timestamp).toLocaleString()}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3 font-mono text-[11px]">
                  <span className="text-emerald-400 font-bold">
                    +{formatBytes(entry.freedRamBytes)} RAM
                  </span>
                  <span className="text-muted">{entry.closedAppsCount} apps closed</span>
                  <span className="inline-flex items-center gap-1 rounded-md bg-accent/15 px-2 py-0.5 font-bold text-accent">
                    <Activity className="size-3" />
                    {entry.appliedSteps}/{entry.totalSteps} modules
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
