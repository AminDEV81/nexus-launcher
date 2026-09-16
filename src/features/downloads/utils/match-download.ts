import type { DownloadInfo, DownloadStatus } from '@/services/download'

export function isDownloadActiveOrPending(status: DownloadStatus): boolean {
  return (
    status === 'downloading' ||
    status === 'paused' ||
    status === 'queued' ||
    status === 'extracting' ||
    status === 'failed'
  )
}

export function findActiveDownloadForGame(
  downloads: DownloadInfo[] | undefined,
  game: { id: string; name?: string; igdb_id?: number | null } | undefined,
): DownloadInfo | undefined {
  if (!downloads || downloads.length === 0 || !game) return undefined

  // 1. Direct game_id match
  const directMatch = downloads.find(
    (d) => d.game_id === game.id && isDownloadActiveOrPending(d.status),
  )
  if (directMatch) return directMatch

  // 2. Normalized name match on save_path or file_path
  if (game.name) {
    const normName = game.name.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (normName.length > 2) {
      const fallback = downloads.find((d) => {
        if (!isDownloadActiveOrPending(d.status)) return false
        const normSave = (d.save_path ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
        const normFile = (d.file_path ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
        return normSave.includes(normName) || normFile.includes(normName)
      })
      if (fallback) return fallback
    }
  }

  return undefined
}
