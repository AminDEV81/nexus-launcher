import { listen } from '@tauri-apps/api/event'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { playDownloadComplete } from '@/lib/sound-engine'
import { soundtrackResolver } from '../services/soundtrack-resolver'
import {
  cancelSoundtrackDownload,
  getSoundtrackDownloadDirectory,
  getSoundtrackDownloads,
  startSoundtrackDownload,
} from '../services/tauri-soundtrack'
import type {
  DownloadCompletePayload,
  DownloadProgressPayload,
  GameIdentity,
  SoundtrackAlbum,
  SoundtrackTrack,
} from '../types'

import { useSoundtrackStore } from '../store/soundtrack-store'

function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '_').trim()
}

export function useSoundtrackDownloads() {
  const queryClient = useQueryClient()
  const activeProgress = useSoundtrackStore((s) => s.activeDownloads)
  const setActiveDownload = useSoundtrackStore((s) => s.setActiveDownload)
  const removeActiveDownload = useSoundtrackStore((s) => s.removeActiveDownload)

  const { data: downloadHistory = [], refetch } = useQuery({
    queryKey: ['soundtrack', 'downloads'],
    queryFn: () => getSoundtrackDownloads(),
    refetchInterval: activeProgress.size > 0 ? 1000 : false,
  })

  useEffect(() => {
    let unlistenProgress: (() => void) | undefined
    let unlistenComplete: (() => void) | undefined
    let unlistenError: (() => void) | undefined

    async function setupListeners() {
      unlistenProgress = await listen<DownloadProgressPayload>(
        'soundtrack-download-progress',
        (event) => {
          setActiveDownload(event.payload.id, event.payload)
        },
      )

      unlistenComplete = await listen<DownloadCompletePayload>(
        'soundtrack-download-complete',
        (event) => {
          removeActiveDownload(event.payload.id)
          playDownloadComplete()
          toast.success('Track downloaded successfully', {
            description: event.payload.local_path,
          })
          void queryClient.invalidateQueries({ queryKey: ['soundtrack'] })
        },
      )

      unlistenError = await listen<DownloadProgressPayload>(
        'soundtrack-download-error',
        (event) => {
          removeActiveDownload(event.payload.id)
          toast.error('Soundtrack download failed', {
            description: event.payload.error_message || 'Network error occurred',
          })
          void refetch()
        },
      )
    }

    void setupListeners()

    return () => {
      unlistenProgress?.()
      unlistenComplete?.()
      unlistenError?.()
    }
  }, [queryClient, refetch, setActiveDownload, removeActiveDownload])

  async function downloadTrack(
    track: SoundtrackTrack,
    album?: SoundtrackAlbum | null,
    game?: GameIdentity | null,
  ): Promise<boolean> {
    const source = await soundtrackResolver.resolveDownloadSource(track)
    if (!source) {
      toast.error('Download unavailable', {
        description: 'This soundtrack source does not support direct downloading.',
      })
      return false
    }

    try {
      const baseDir = await getSoundtrackDownloadDirectory()
      const gameFolder = sanitizeFilename(game?.title || 'Unknown Game')
      const albumFolder = sanitizeFilename(album?.title || 'Soundtrack')
      const trackFile = `${String(track.track_number).padStart(2, '0')} - ${sanitizeFilename(track.title)}.${source.format}`
      const targetPath = `${baseDir}\\${gameFolder}\\${albumFolder}\\${trackFile}`

      const downloadId = `dl_${track.id}_${Date.now()}`

      await startSoundtrackDownload({
        download_id: downloadId,
        track_id: track.id,
        album_id: album?.id || null,
        game_id: game?.gameId || null,
        url: source.url,
        target_path: targetPath,
      })

      toast.info('Download started', {
        description: `${track.title} (${source.format.toUpperCase()})`,
      })
      return true
    } catch (err) {
      toast.error('Failed to start download', {
        description: err instanceof Error ? err.message : String(err),
      })
      return false
    }
  }

  async function cancelDownload(downloadId: string) {
    try {
      await cancelSoundtrackDownload(downloadId)
      removeActiveDownload(downloadId)
      void refetch()
    } catch {
      // Ignore
    }
  }

  return {
    activeProgress,
    downloadHistory,
    downloadTrack,
    cancelDownload,
    refetchDownloads: refetch,
  }
}
