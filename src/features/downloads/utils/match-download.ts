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

export function matchDownloadToGame<
  T extends { id: string; name?: string; folder_path?: string | null; exe_path?: string | null },
>(dl: DownloadInfo | undefined, games: T[] | undefined): T | undefined {
  if (!dl || !games || games.length === 0) return undefined

  // 1. Direct game_id match
  if (dl.game_id) {
    const direct = games.find((g) => g.id === dl.game_id)
    if (direct) return direct
  }

  const norm = (v?: string | null) =>
    (v ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9\u0600-\u06FF]+/g, "")
      .trim()

  // 2. Match by explicit download game_name
  const dlGameName = norm(dl.game_name)
  if (dlGameName.length >= 2) {
    const exactName = games.find((g) => norm(g.name) === dlGameName)
    if (exactName) return exactName
    const partialName = games.find((g) => {
      const gn = norm(g.name)
      return gn.length >= 3 && (dlGameName.includes(gn) || gn.includes(dlGameName))
    })
    if (partialName) return partialName
  }

  // 3. Match by save_path or file_path against game name or folder_path
  const normSave = norm(dl.save_path)
  const normFile = norm(dl.file_path)
  return games.find((g) => {
    const gn = norm(g.name)
    if (gn.length >= 3 && (normSave.includes(gn) || normFile.includes(gn))) {
      return true
    }
    const gf = norm(g.folder_path)
    if (gf.length >= 4 && (normSave.includes(gf) || gf.includes(normSave))) {
      return true
    }
    return false
  })
}
