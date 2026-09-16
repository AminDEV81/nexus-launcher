import { useCallback, useMemo, useState } from 'react'
import {
  Download,
  Plus,
  Search,
  Package,
  CheckCircle2,
  PauseCircle,
  PlayCircle,
  XCircle,
  Clock,
  Gauge,
  Gamepad2,
  Layers,
} from 'lucide-react'
import { useGames } from '@/features/library/hooks/use-games'
import { useSettings, useSetSetting } from '@/features/settings/hooks/use-settings'
import {
  useDownloads,
  usePauseDownload,
  useResumeDownload,
  useQueueDownload,
  useQueueBundle,
  useResumeQueueSequential,
  useCancelDownload,
  useDeleteDownload,
} from '../hooks/use-downloads'
import { DownloadCard } from '../components/download-card'
import { GroupedDownloadCard, type GroupedDownloadItem } from '../components/grouped-download-card'
import { SpeedGraph } from '../components/speed-graph'
import { SchedulerModal } from '../components/scheduler-modal'
import { QueueConfirmModal, type QueueActionType } from '../components/queue-confirm-modal'
import { DeleteDownloadModal, type DeleteDownloadTarget } from '../components/delete-download-modal'
import { useStartDownloadModalStore } from '../store/start-download-modal-store'
import { cn } from '@/lib/utils'
import type { DownloadInfo } from '@/services/download'

type FilterTab = 'all' | 'active' | 'queued' | 'paused' | 'completed'

const SPEED_LIMITS = [
  { label: 'Unlimited Speed', value: '0' },
  { label: '1 MB/s Limit', value: '1048576' },
  { label: '2 MB/s Limit', value: '2097152' },
  { label: '5 MB/s Limit', value: '5242880' },
  { label: '10 MB/s Limit', value: '10485760' },
  { label: '25 MB/s Limit', value: '26214400' },
  { label: '50 MB/s Limit', value: '52428800' },
]

export default function DownloadsPage() {
  const { data: downloads = [], isLoading } = useDownloads()
  const openModal = useStartDownloadModalStore((s) => s.open)
  const { data: games = [] } = useGames()
  const { data: settings } = useSettings()
  const setSetting = useSetSetting()

  const pause = usePauseDownload()
  const resume = useResumeDownload()
  const queueDownload = useQueueDownload()
  const queueBundle = useQueueBundle()
  const resumeQueueSeq = useResumeQueueSequential()
  const cancel = useCancelDownload()
  const remove = useDeleteDownload()

  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<FilterTab>('all')
  const [deleteTarget, setDeleteTarget] = useState<DeleteDownloadTarget | null>(null)
  const [schedulerOpen, setSchedulerOpen] = useState(false)
  const [queueAction, setQueueAction] = useState<QueueActionType | null>(null)

  const currentSpeedLimit = settings?.download_speed_limit || '0'
  const isGamingMode = settings?.download_gaming_mode !== 'false'
  const isSchedulerActive = settings?.download_scheduler_enabled === 'true'

  const gamesById = useMemo(() => new Map(games.map((g) => [g.id, g])), [games])

  function requestDelete(d: DownloadInfo) {
    const game = gamesById.get(d.game_id)
    const name =
      game?.name ??
      d.file_path?.split(/[\\/]/).pop() ??
      d.url.split('/').pop()?.split('?')[0] ??
      'Download'
    setDeleteTarget({
      id: d.id,
      name,
      isCompleted: d.status === 'completed',
      hasArchive: Boolean(d.file_path),
    })
  }

  function requestDeleteGroup(group: GroupedDownloadItem) {
    setDeleteTarget({
      id: group.parts.map((p) => p.id).join(','),
      name: `${group.gameName} (${group.parts.length} Parts)`,
      isCompleted: group.status === 'completed',
      hasArchive: group.parts.some((p) => Boolean(p.file_path)),
    })
  }

  function handleConfirmDelete(idStr: string, deleteFile: boolean) {
    const ids = idStr.split(',')
    for (const id of ids) {
      remove.mutate({ id, deleteFile })
    }
    setDeleteTarget(null)
  }

  function handleConfirmQueueAction(action: QueueActionType) {
    if (action === 'pause_all') {
      const activeDownloads = downloads.filter(
        (d) => d.status === 'downloading' || d.status === 'extracting' || d.status === 'queued',
      )
      for (const d of activeDownloads) {
        pause.mutate(d.id)
      }
    } else if (action === 'resume_all') {
      const pausedDownloads = downloads.filter(
        (d) => d.status === 'paused' || d.status === 'queued' || d.status === 'failed',
      )
      for (const d of pausedDownloads) {
        resume.mutate(d.id)
      }
    } else if (action === 'resume_sequential') {
      resumeQueueSeq.mutate()
    } else if (action === 'cancel_all') {
      for (const d of downloads) {
        cancel.mutate(d.id)
      }
    }
    setQueueAction(null)
  }

  const filtered = useMemo(
    () =>
      downloads.filter((d) => {
        if (!search) return true
        const needle = search.toLowerCase()
        return (
          d.url.toLowerCase().includes(needle) ||
          (d.file_path ?? '').toLowerCase().includes(needle) ||
          (gamesById.get(d.game_id)?.name.toLowerCase().includes(needle) ?? false)
        )
      }),
    [downloads, search, gamesById],
  )

  const queuedItemsMap = useMemo(() => {
    const map = new Map<string, number>()
    let index = 1
    for (const d of downloads) {
      if (d.status === 'queued') {
        map.set(d.id, index++)
      }
    }
    return map
  }, [downloads])

  // Group downloads into unified multi-part items across the entire list
  const groupDownloads = useCallback(
    (list: DownloadInfo[]) => {
      const map = new Map<string, DownloadInfo[]>()

      for (const d of list) {
        let groupKey = d.id
        const isPart =
          d.url.includes('.part') ||
          (d.file_path && d.file_path.includes('.part')) ||
          d.url.includes('.7z.') ||
          d.url.includes('.zip.') ||
          d.url.includes('.r0') ||
          (d.file_path &&
            (d.file_path.includes('.7z.') ||
              d.file_path.includes('.zip.') ||
              d.file_path.includes('.r0')))

        if (
          d.game_id &&
          d.game_id !== 'raw-download' &&
          d.game_id !== 'new-download' &&
          d.game_id !== ''
        ) {
          groupKey = `game:${d.game_id}`
        } else if (isPart && d.save_path) {
          groupKey = `path:${d.save_path}`
        }

        const existing = map.get(groupKey) ?? []
        existing.push(d)
        map.set(groupKey, existing)
      }

      const items: Array<
        { type: 'single'; download: DownloadInfo } | { type: 'group'; item: GroupedDownloadItem }
      > = []

      for (const [key, rawParts] of map.entries()) {
        if (rawParts.length === 1) {
          items.push({ type: 'single', download: rawParts[0] })
        } else {
          // Sort parts numerically (Part 1, Part 2, Part 3...)
          const parts = [...rawParts].sort((a, b) => {
            const nameA = a.file_path ?? a.url
            const nameB = b.file_path ?? b.url
            return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' })
          })

          const first = parts[0]
          const game = gamesById.get(first.game_id)
          const gameName =
            game?.name ??
            first.file_path
              ?.split(/[\\/]/)
              .pop()
              ?.replace(/\.part\d+.*/i, '') ??
            'Multi-Part Download'
          const coverUrl = game?.cover_path ?? null
          const totalBytes = parts.reduce((acc, p) => acc + (p.total_bytes || 0), 0)
          const downloadedBytes = parts.reduce((acc, p) => acc + (p.downloaded_bytes || 0), 0)
          const speedBps = parts.reduce((acc, p) => acc + (p.speed_bps || 0), 0)

          // Master bundle status: extracting > downloading > failed > queued > paused > completed
          let status: GroupedDownloadItem['status'] = 'completed'
          if (parts.some((p) => p.status === 'extracting')) {
            status = 'extracting'
          } else if (parts.some((p) => p.status === 'downloading')) {
            status = 'downloading'
          } else if (parts.every((p) => p.status === 'completed')) {
            status = 'completed'
          } else if (parts.some((p) => p.status === 'failed')) {
            status = 'failed'
          } else if (parts.some((p) => p.status === 'queued')) {
            status = 'queued'
          } else {
            status = 'paused'
          }

          items.push({
            type: 'group',
            item: {
              key,
              gameId: first.game_id,
              gameName,
              coverUrl,
              parts,
              totalBytes,
              downloadedBytes,
              speedBps,
              status,
              isInstalled: game?.is_installed,
              savePath: first.save_path,
            },
          })
        }
      }

      return items
    },
    [gamesById],
  )

  const allGrouped = useMemo(() => groupDownloads(filtered), [filtered, groupDownloads])

  const activeGrouped = useMemo(
    () =>
      allGrouped.filter((entry) => {
        const status = entry.type === 'group' ? entry.item.status : entry.download.status
        return status === 'downloading' || status === 'extracting'
      }),
    [allGrouped],
  )

  const queuedGrouped = useMemo(
    () =>
      allGrouped.filter((entry) => {
        const status = entry.type === 'group' ? entry.item.status : entry.download.status
        return status === 'queued'
      }),
    [allGrouped],
  )

  const completedGrouped = useMemo(
    () =>
      allGrouped.filter((entry) => {
        const status = entry.type === 'group' ? entry.item.status : entry.download.status
        return status === 'completed'
      }),
    [allGrouped],
  )

  const pausedGrouped = useMemo(
    () =>
      allGrouped.filter((entry) => {
        const status = entry.type === 'group' ? entry.item.status : entry.download.status
        return status === 'paused' || status === 'failed'
      }),
    [allGrouped],
  )

  const busy =
    pause.isPending ||
    resume.isPending ||
    queueDownload.isPending ||
    queueBundle.isPending ||
    resumeQueueSeq.isPending ||
    cancel.isPending ||
    remove.isPending

  const activeCount = activeGrouped.length
  const queuedCount = queuedGrouped.length
  const completedCount = completedGrouped.length
  const pausedCount = pausedGrouped.length
  const resumableCount = pausedCount + queuedCount

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-8 pb-3 pt-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-accent/15 text-accent shadow-sm ring-1 ring-accent/30">
              <Download className="size-5.5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-text">Downloads</h1>
              <p className="text-xs text-subtle">
                {activeCount > 0 ? `${activeCount} downloading now` : 'All tasks up to date'}
                {queuedCount > 0 ? ` · ${queuedCount} in queue` : ''}
                {completedCount > 0 ? ` · ${completedCount} completed` : ''}
              </p>
            </div>
          </div>

          {/* Quick IDM Power Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Speed Limiter */}
            <div className="flex items-center gap-1.5 rounded-xl border border-border/80 bg-surface/60 px-2.5 py-1.5 shadow-sm">
              <Gauge className="size-3.5 text-accent" />
              <select
                value={currentSpeedLimit}
                onChange={(e) =>
                  setSetting.mutate({ key: 'download_speed_limit', value: e.target.value })
                }
                className="bg-transparent text-xs font-semibold text-text focus:outline-none cursor-pointer"
                title="Throttle max aggregate download bandwidth"
              >
                {SPEED_LIMITS.map((opt) => (
                  <option key={opt.value} value={opt.value} className="bg-surface text-text">
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Smart Scheduler Button */}
            <button
              type="button"
              onClick={() => setSchedulerOpen(true)}
              className={cn(
                'flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold shadow-sm transition-all',
                isSchedulerActive
                  ? 'border-accent/50 bg-accent/15 text-accent font-bold ring-1 ring-accent/30'
                  : 'border-border/80 bg-surface/60 text-subtle hover:text-text hover:bg-surface-raised',
              )}
              title="Smart Night Scheduler & Auto-Shutdown"
            >
              <Clock className="size-3.5" />
              <span>{isSchedulerActive ? 'Schedule Active' : 'Scheduler'}</span>
            </button>

            {/* Gaming Mode Auto-Pause */}
            <button
              type="button"
              onClick={() =>
                setSetting.mutate({
                  key: 'download_gaming_mode',
                  value: isGamingMode ? 'false' : 'true',
                })
              }
              className={cn(
                'flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold shadow-sm transition-all',
                isGamingMode
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400 font-bold'
                  : 'border-border/80 bg-surface/60 text-subtle hover:text-text',
              )}
              title="Auto-pause downloads while playing games to prevent lag"
            >
              <Gamepad2 className="size-3.5" />
              <span>{isGamingMode ? 'Gaming Mode ON' : 'Gaming Mode OFF'}</span>
            </button>

            {/* New Download Button */}
            <button
              onClick={() => openModal()}
              className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-xs font-bold text-white shadow-lg shadow-accent/20 transition-all hover:bg-accent-hover active:scale-95"
            >
              <Plus className="size-4" />
              <span>New Download</span>
            </button>
          </div>
        </div>

        {/* Live Rolling Speed Waveform Telemetry */}
        {downloads.length > 0 && (
          <div className="mb-4">
            <SpeedGraph downloads={downloads} />
          </div>
        )}

        {/* Search, Filter Tabs & Batch Action Controls */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-subtle" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search downloads by game, filename or URL…"
              className="w-full rounded-xl border border-border bg-bg/80 py-2 pl-9.5 pr-4 text-xs text-text placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Batch Queue Controls (Pause All, Resume All, Resume One by One, Cancel All) */}
            {activeCount > 0 && (
              <button
                type="button"
                onClick={() => setQueueAction('pause_all')}
                className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-subtle hover:text-accent hover:border-accent/40 transition-colors"
                title="Pause all active downloads"
              >
                <PauseCircle className="size-3.5 text-accent" />
                <span>Pause All</span>
              </button>
            )}

            {resumableCount > 0 && (
              <div className="flex items-center rounded-xl border border-border bg-surface shadow-sm overflow-hidden p-0.5">
                <button
                  type="button"
                  onClick={() => setQueueAction('resume_all')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-subtle hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors rounded-lg"
                  title="Resume all paused and queued downloads simultaneously"
                >
                  <PlayCircle className="size-3.5 text-emerald-400" />
                  <span>Resume All</span>
                </button>
                <div className="h-4 w-px bg-border/80" />
                <button
                  type="button"
                  onClick={() => setQueueAction('resume_sequential')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-subtle hover:text-accent hover:bg-accent/10 transition-colors rounded-lg"
                  title="Queue downloads sequentially (One by One)"
                >
                  <Layers className="size-3.5 text-accent" />
                  <span>One by One (Queue)</span>
                </button>
              </div>
            )}

            {completedCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  const completed = downloads.filter((d) => d.status === 'completed')
                  for (const d of completed) {
                    remove.mutate({ id: d.id, deleteFile: false })
                  }
                }}
                disabled={remove.isPending}
                className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-subtle hover:text-emerald-400 hover:border-emerald-500/40 transition-colors"
                title="Clear finished downloads from list (keeps all game files on disk)"
              >
                <CheckCircle2 className="size-3.5 text-emerald-400" />
                <span>Clear Completed ({completedCount})</span>
              </button>
            )}

            {downloads.length > 0 && (
              <button
                type="button"
                onClick={() => setQueueAction('cancel_all')}
                className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-subtle hover:text-red-400 hover:border-red-500/40 transition-colors"
                title="Cancel and clear entire queue"
              >
                <XCircle className="size-3.5 text-red-400" />
                <span>Cancel All</span>
              </button>
            )}

            {/* Filter Chips */}
            <div className="flex items-center gap-1 rounded-xl border border-border/80 bg-surface/60 p-1">
              <button
                onClick={() => setTab('all')}
                className={cn(
                  'rounded-lg px-3 py-1 text-xs font-semibold transition-colors',
                  tab === 'all'
                    ? 'bg-surface-raised text-text shadow-sm'
                    : 'text-subtle hover:text-text',
                )}
              >
                All ({allGrouped.length})
              </button>
              <button
                onClick={() => setTab('active')}
                className={cn(
                  'rounded-lg px-3 py-1 text-xs font-semibold transition-colors',
                  tab === 'active'
                    ? 'bg-accent/20 text-accent shadow-sm'
                    : 'text-subtle hover:text-text',
                )}
              >
                Active ({activeCount})
              </button>
              {queuedCount > 0 && (
                <button
                  onClick={() => setTab('queued')}
                  className={cn(
                    'rounded-lg px-3 py-1 text-xs font-semibold transition-colors',
                    tab === 'queued'
                      ? 'bg-amber-500/20 text-amber-400 shadow-sm'
                      : 'text-subtle hover:text-text',
                  )}
                >
                  Queued ({queuedCount})
                </button>
              )}
              {pausedCount > 0 && (
                <button
                  onClick={() => setTab('paused')}
                  className={cn(
                    'rounded-lg px-3 py-1 text-xs font-semibold transition-colors',
                    tab === 'paused'
                      ? 'bg-surface-raised text-text shadow-sm'
                      : 'text-subtle hover:text-text',
                  )}
                >
                  Paused ({pausedCount})
                </button>
              )}
              <button
                onClick={() => setTab('completed')}
                className={cn(
                  'rounded-lg px-3 py-1 text-xs font-semibold transition-colors',
                  tab === 'completed'
                    ? 'bg-emerald-500/20 text-emerald-400 shadow-sm'
                    : 'text-subtle hover:text-text',
                )}
              >
                Completed ({completedCount})
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 pb-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-sm text-subtle">
            Loading downloads…
          </div>
        ) : downloads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="mb-4 flex size-18 items-center justify-center rounded-3xl bg-surface border border-border shadow-inner">
              <Package className="size-9 text-subtle/60" />
            </div>
            <p className="text-base font-bold text-text">No active downloads</p>
            <p className="mt-1 max-w-sm text-xs text-subtle">
              Search a game on IGDB or paste a direct download link to start a multi-connection
              download.
            </p>
            <button
              onClick={() => openModal()}
              className="mt-5 flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-xs font-bold text-white shadow transition-all hover:bg-accent-hover"
            >
              <Plus className="size-4" />
              <span>Start New Download</span>
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center text-sm text-subtle">Nothing matches "{search}".</div>
        ) : (
          <div className="space-y-6">
            {/* 1. Active Downloads Section */}
            {(tab === 'all' || tab === 'active') && activeGrouped.length > 0 && (
              <Section
                title="Active Downloads"
                count={activeCount}
                icon={<PlayCircle className="size-3.5 text-accent" />}
              >
                {activeGrouped.map((entry) =>
                  entry.type === 'group' ? (
                    <GroupedDownloadCard
                      key={entry.item.key}
                      group={entry.item}
                      game={gamesById.get(entry.item.gameId)}
                      onPausePart={pause.mutate}
                      onResumePart={resume.mutate}
                      onQueuePart={(id, q) => queueDownload.mutate({ id, queue: q })}
                      onQueueBundle={(gid, sp, q) =>
                        queueBundle.mutate({ gameId: gid, savePath: sp, queue: q })
                      }
                      onCancelPart={(id) => remove.mutate({ id, deleteFile: true })}
                      onDeleteGroup={requestDeleteGroup}
                      busy={busy}
                    />
                  ) : (
                    <DownloadCard
                      key={entry.download.id}
                      download={entry.download}
                      game={gamesById.get(entry.download.game_id)}
                      onPause={pause.mutate}
                      onResume={resume.mutate}
                      onQueue={(id, q) => queueDownload.mutate({ id, queue: q })}
                      queuePosition={queuedItemsMap.get(entry.download.id)}
                      onCancel={cancel.mutate}
                      onDelete={() => requestDelete(entry.download)}
                      busy={busy}
                    />
                  ),
                )}
              </Section>
            )}

            {/* 2. Queued Downloads Section (Waiting for turn) */}
            {(tab === 'all' || tab === 'queued') && queuedGrouped.length > 0 && (
              <Section
                title="In Queue (Waiting for Turn)"
                count={queuedCount}
                icon={<Clock className="size-3.5 text-amber-400" />}
              >
                {queuedGrouped.map((entry) =>
                  entry.type === 'group' ? (
                    <GroupedDownloadCard
                      key={entry.item.key}
                      group={entry.item}
                      game={gamesById.get(entry.item.gameId)}
                      onPausePart={pause.mutate}
                      onResumePart={resume.mutate}
                      onQueuePart={(id, q) => queueDownload.mutate({ id, queue: q })}
                      onQueueBundle={(gid, sp, q) =>
                        queueBundle.mutate({ gameId: gid, savePath: sp, queue: q })
                      }
                      onCancelPart={(id) => remove.mutate({ id, deleteFile: true })}
                      onDeleteGroup={requestDeleteGroup}
                      busy={busy}
                    />
                  ) : (
                    <DownloadCard
                      key={entry.download.id}
                      download={entry.download}
                      game={gamesById.get(entry.download.game_id)}
                      onPause={pause.mutate}
                      onResume={resume.mutate}
                      onQueue={(id, q) => queueDownload.mutate({ id, queue: q })}
                      queuePosition={queuedItemsMap.get(entry.download.id)}
                      onCancel={cancel.mutate}
                      onDelete={() => requestDelete(entry.download)}
                      busy={busy}
                    />
                  ),
                )}
              </Section>
            )}

            {/* 3. Paused / Stopped Downloads Section */}
            {(tab === 'all' || tab === 'paused') && pausedGrouped.length > 0 && (
              <Section
                title="Paused / Incomplete"
                count={pausedCount}
                icon={<PauseCircle className="size-3.5 text-subtle" />}
              >
                {pausedGrouped.map((entry) =>
                  entry.type === 'group' ? (
                    <GroupedDownloadCard
                      key={entry.item.key}
                      group={entry.item}
                      game={gamesById.get(entry.item.gameId)}
                      onPausePart={pause.mutate}
                      onResumePart={resume.mutate}
                      onQueuePart={(id, q) => queueDownload.mutate({ id, queue: q })}
                      onQueueBundle={(gid, sp, q) =>
                        queueBundle.mutate({ gameId: gid, savePath: sp, queue: q })
                      }
                      onCancelPart={(id) => remove.mutate({ id, deleteFile: true })}
                      onDeleteGroup={requestDeleteGroup}
                      busy={busy}
                    />
                  ) : (
                    <DownloadCard
                      key={entry.download.id}
                      download={entry.download}
                      game={gamesById.get(entry.download.game_id)}
                      onPause={pause.mutate}
                      onResume={resume.mutate}
                      onQueue={(id, q) => queueDownload.mutate({ id, queue: q })}
                      queuePosition={queuedItemsMap.get(entry.download.id)}
                      onCancel={cancel.mutate}
                      onDelete={() => requestDelete(entry.download)}
                      busy={busy}
                    />
                  ),
                )}
              </Section>
            )}

            {/* 4. Completed Section */}
            {(tab === 'all' || tab === 'completed') && completedGrouped.length > 0 && (
              <Section
                title="Completed & Installed"
                count={completedCount}
                icon={<CheckCircle2 className="size-3.5 text-emerald-400" />}
              >
                {completedGrouped.map((entry) =>
                  entry.type === 'group' ? (
                    <GroupedDownloadCard
                      key={entry.item.key}
                      group={entry.item}
                      game={gamesById.get(entry.item.gameId)}
                      onPausePart={pause.mutate}
                      onResumePart={resume.mutate}
                      onQueuePart={(id, q) => queueDownload.mutate({ id, queue: q })}
                      onQueueBundle={(gid, sp, q) =>
                        queueBundle.mutate({ gameId: gid, savePath: sp, queue: q })
                      }
                      onCancelPart={(id) => remove.mutate({ id, deleteFile: true })}
                      onDeleteGroup={requestDeleteGroup}
                      busy={busy}
                    />
                  ) : (
                    <DownloadCard
                      key={entry.download.id}
                      download={entry.download}
                      game={gamesById.get(entry.download.game_id)}
                      onPause={pause.mutate}
                      onResume={resume.mutate}
                      onQueue={(id, q) => queueDownload.mutate({ id, queue: q })}
                      queuePosition={queuedItemsMap.get(entry.download.id)}
                      onCancel={cancel.mutate}
                      onDelete={() => requestDelete(entry.download)}
                      busy={busy}
                    />
                  ),
                )}
              </Section>
            )}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <DeleteDownloadModal
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        isPending={remove.isPending}
      />

      {/* Queue Batch Action Confirmation Modal */}
      <QueueConfirmModal
        action={queueAction}
        count={
          queueAction === 'pause_all'
            ? activeCount
            : queueAction === 'resume_all' || queueAction === 'resume_sequential'
              ? resumableCount
              : downloads.length
        }
        onClose={() => setQueueAction(null)}
        onConfirm={handleConfirmQueueAction}
        isPending={busy}
      />

      {/* Smart Scheduler & Power Management Modal */}
      <SchedulerModal open={schedulerOpen} onClose={() => setSchedulerOpen(false)} />
    </div>
  )
}

function Section({
  title,
  count,
  icon,
  children,
}: {
  title: string
  count?: number
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs font-bold text-subtle uppercase tracking-wider">
        {icon}
        <span>{title}</span>
        {count !== undefined && (
          <span className="rounded-md bg-surface-raised px-1.5 py-0.5 font-mono text-[10px] text-text">
            {count}
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3.5">{children}</div>
    </div>
  )
}
