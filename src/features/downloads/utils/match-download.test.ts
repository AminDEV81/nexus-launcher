import { describe, expect, it } from 'vitest'
import { findActiveDownloadForGame, isDownloadActiveOrPending } from './match-download'
import { isTimeInWindow } from '../hooks/use-download-scheduler'
import type { DownloadInfo } from '@/services/download'

function makeDownload(overrides: Partial<DownloadInfo> = {}): DownloadInfo {
  return {
    id: 'dl-1',
    game_id: 'game-1',
    url: 'https://cdn.example.com/elden-ring.zip',
    save_path: 'C:/Games/Elden Ring',
    file_path: 'C:/Games/Elden Ring/elden-ring.zip',
    total_bytes: 1000,
    downloaded_bytes: 500,
    status: 'downloading',
    error_message: null,
    speed_bps: 1024,
    created_at: '2026-10-14T00:00:00Z',
    updated_at: '2026-10-14T00:00:00Z',
    auto_extract: true,
    ...overrides,
  }
}

describe('match-download utilities', () => {
  it('identifies active or pending download statuses', () => {
    expect(isDownloadActiveOrPending('downloading')).toBe(true)
    expect(isDownloadActiveOrPending('paused')).toBe(true)
    expect(isDownloadActiveOrPending('queued')).toBe(true)
    expect(isDownloadActiveOrPending('extracting')).toBe(true)
    expect(isDownloadActiveOrPending('failed')).toBe(true)
    expect(isDownloadActiveOrPending('completed')).toBe(false)
    expect(isDownloadActiveOrPending('cancelled')).toBe(false)
  })

  it('matches downloads by direct game_id first and ignores completed entries', () => {
    const completed = makeDownload({ id: 'dl-done', status: 'completed' })
    const active = makeDownload({ id: 'dl-active', status: 'downloading' })
    expect(findActiveDownloadForGame([completed], { id: 'game-1', name: 'Elden Ring' })).toBeUndefined()
    expect(findActiveDownloadForGame([completed, active], { id: 'game-1', name: 'Elden Ring' })?.id).toBe('dl-active')
  })

  it('falls back to normalized game name matching on save_path or file_path', () => {
    const rawDownload = makeDownload({
      id: 'dl-raw',
      game_id: 'new-download',
      save_path: 'D:/Downloads/Cyberpunk_2077_Repack',
      file_path: 'D:/Downloads/Cyberpunk_2077_Repack/part1.rar',
      status: 'queued',
    })
    const matched = findActiveDownloadForGame([rawDownload], {
      id: 'unrelated-id',
      name: 'Cyberpunk 2077',
    })
    expect(matched?.id).toBe('dl-raw')
  })
})

describe('isTimeInWindow scheduler helper', () => {
  it('handles standard daytime windows', () => {
    expect(isTimeInWindow('02:00', '07:00', new Date('2026-10-14T03:30:00'))).toBe(true)
    expect(isTimeInWindow('02:00', '07:00', new Date('2026-10-14T08:00:00'))).toBe(false)
  })

  it('handles overnight windows crossing midnight', () => {
    expect(isTimeInWindow('23:00', '06:00', new Date('2026-10-14T23:30:00'))).toBe(true)
    expect(isTimeInWindow('23:00', '06:00', new Date('2026-10-14T04:15:00'))).toBe(true)
    expect(isTimeInWindow('23:00', '06:00', new Date('2026-10-14T14:00:00'))).toBe(false)
  })
})
