import { useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { playDownloadComplete } from '@/lib/sound-engine'
import * as service from '@/services/download'
import type { DownloadProgress } from '@/services/download'

export const downloadsKey = ['downloads'] as const

/**
 * Live download list. The Rust engine emits `download-updated` on every
 * progress tick and status change, so the query only bootstraps the
 * list — the listener patches rows in place, no polling.
 */
export function useDownloads() {
  return useQuery({
    queryKey: downloadsKey,
    queryFn: service.getDownloads,
    refetchOnMount: 'always',
  })
}

/** Patches progress events straight into the cache so cards update in
 *  real time without refetching the whole list. */
export function useDownloadUpdatesListener() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const unlisten = listen<DownloadProgress>('download-updated', (event) => {
      const p = event.payload
      queryClient.setQueryData<service.DownloadInfo[]>(downloadsKey, (rows) => {
        if (!rows) return rows
        if (p.status === 'cancelled') {
          return rows.filter((row) => row.id !== p.id)
        }
        if (!rows.some((row) => row.id === p.id)) {
          // New or uninitialized download: fetch full list immediately so it appears right away
          void queryClient.invalidateQueries({ queryKey: downloadsKey, refetchType: 'all' })
          return rows
        }
        return rows.map((row) =>
          row.id === p.id
            ? {
                ...row,
                downloaded_bytes: p.downloaded_bytes,
                total_bytes: p.total_bytes,
                speed_bps: p.speed_bps,
                status: p.status,
                error_message: p.error_message,
                chunks: p.chunks ?? row.chunks,
                extract_percent: p.extract_percent ?? row.extract_percent,
              }
            : row,
        )
      })
    })

    return () => {
      unlisten.then((fn) => fn())
    }
  }, [queryClient])
}

/** A linked game finished downloading and was marked installed —
 *  refresh the library grid and tell the user. */
export function useDownloadCompletedListener() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const unlisten = listen<service.DownloadCompletedEvent>('download-completed', (event) => {
      void queryClient.invalidateQueries({ queryKey: downloadsKey, refetchType: 'all' })
      void queryClient.refetchQueries({ queryKey: downloadsKey })
      queryClient.invalidateQueries({ queryKey: ['games'] })
      if (event.payload.game_id) {
        queryClient.invalidateQueries({ queryKey: ['games', event.payload.game_id] })
      }
      playDownloadComplete()
      toast.success('Download complete — the game is now in your library.')
    })

    return () => {
      unlisten.then((fn) => fn())
    }
  }, [queryClient])
}

export function useStartGameDownload() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ igdbId, url, savePath }: { igdbId: number; url: string; savePath: string }) =>
      service.startGameDownload(igdbId, url, savePath),
    onSuccess: ({ game }) => {
      void queryClient.invalidateQueries({ queryKey: downloadsKey, refetchType: 'all' })
      void queryClient.refetchQueries({ queryKey: downloadsKey })
      queryClient.invalidateQueries({ queryKey: ['games'] })
      toast.success(`Downloading ${game.name}.`)
    },
    onError: (error) => toast.error(error.message),
  })
}

export function useStartRawDownload() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ url, savePath, gameId }: { url: string; savePath: string; gameId?: string }) =>
      service.startDownload(gameId ?? 'new-download', url, savePath),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: downloadsKey, refetchType: 'all' })
      void queryClient.refetchQueries({ queryKey: downloadsKey })
      queryClient.invalidateQueries({ queryKey: ['games'] })
    },
    onError: (error) => toast.error(error.message),
  })
}

export function useStartBatchDownloads() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (params: {
      gameId?: string
      igdbId?: number
      urls: string[]
      savePath: string
      sequential: boolean
    }) => service.startBatchDownloads(params),
    onSuccess: (_ids, vars) => {
      void queryClient.invalidateQueries({ queryKey: downloadsKey, refetchType: 'all' })
      void queryClient.refetchQueries({ queryKey: downloadsKey })
      queryClient.invalidateQueries({ queryKey: ['games'] })
      toast.success(
        vars.sequential
          ? `Queued ${vars.urls.length} parts sequentially (Part 1 starting now).`
          : `Started downloading ${vars.urls.length} parts simultaneously.`,
      )
    },
    onError: (error) => toast.error(error.message),
  })
}

export function usePauseDownload() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: service.pauseDownload,
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: downloadsKey })
      const prev = queryClient.getQueryData<service.DownloadInfo[]>(downloadsKey)
      queryClient.setQueryData<service.DownloadInfo[]>(downloadsKey, (old) =>
        old?.map((d) => (d.id === id ? { ...d, status: 'paused', speed_bps: 0 } : d)),
      )
      return { prev }
    },
    onError: (error, _id, context) => {
      if (context?.prev) {
        queryClient.setQueryData(downloadsKey, context.prev)
      }
      toast.error(error.message)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: downloadsKey })
    },
  })
}

export function useResumeDownload() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: service.resumeDownload,
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: downloadsKey })
      const prev = queryClient.getQueryData<service.DownloadInfo[]>(downloadsKey)
      queryClient.setQueryData<service.DownloadInfo[]>(downloadsKey, (old) =>
        old?.map((d) => (d.id === id ? { ...d, status: 'downloading', error_message: null } : d)),
      )
      return { prev }
    },
    onError: (error, _id, context) => {
      if (context?.prev) {
        queryClient.setQueryData(downloadsKey, context.prev)
      }
      toast.error(error.message)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: downloadsKey })
    },
  })
}

export function useQueueDownload() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, queue }: { id: string; queue: boolean }) => service.queueDownload(id, queue),
    onMutate: async ({ id, queue }) => {
      await queryClient.cancelQueries({ queryKey: downloadsKey })
      const prev = queryClient.getQueryData<service.DownloadInfo[]>(downloadsKey)
      queryClient.setQueryData<service.DownloadInfo[]>(downloadsKey, (old) =>
        old?.map((d) =>
          d.id === id ? { ...d, status: queue ? 'queued' : 'paused', speed_bps: 0 } : d,
        ),
      )
      return { prev }
    },
    onError: (error, _vars, context) => {
      if (context?.prev) {
        queryClient.setQueryData(downloadsKey, context.prev)
      }
      toast.error(error.message)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: downloadsKey })
    },
  })
}

export function useQueueBundle() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (params: { gameId?: string; savePath: string; queue: boolean }) =>
      service.queueBundle(params),
    onMutate: async (params) => {
      await queryClient.cancelQueries({ queryKey: downloadsKey })
      const prev = queryClient.getQueryData<service.DownloadInfo[]>(downloadsKey)
      queryClient.setQueryData<service.DownloadInfo[]>(downloadsKey, (old) =>
        old?.map((d) => {
          const matches = params.gameId
            ? d.game_id === params.gameId
            : d.save_path === params.savePath
          if (matches) {
            return { ...d, status: params.queue ? 'queued' : 'paused', speed_bps: 0 }
          }
          return d
        }),
      )
      return { prev }
    },
    onError: (error, _vars, context) => {
      if (context?.prev) {
        queryClient.setQueryData(downloadsKey, context.prev)
      }
      toast.error(error.message)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: downloadsKey })
    },
  })
}

export function useResumeQueueSequential() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: service.resumeQueueSequential,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: downloadsKey })
      toast.success('Resumed queue in sequential order.')
    },
    onError: (error) => toast.error(error.message),
  })
}

export function useCancelDownload() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: service.cancelDownload,
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: downloadsKey })
      const prev = queryClient.getQueryData<service.DownloadInfo[]>(downloadsKey)
      queryClient.setQueryData<service.DownloadInfo[]>(downloadsKey, (old) =>
        old?.filter((d) => d.id !== id),
      )
      return { prev }
    },
    onError: (error, _id, context) => {
      if (context?.prev) {
        queryClient.setQueryData(downloadsKey, context.prev)
      }
      toast.error(error.message)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: downloadsKey })
    },
  })
}

export function useDeleteDownload() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, deleteFile }: { id: string; deleteFile?: boolean }) =>
      service.deleteDownload(id, deleteFile ?? false),
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: downloadsKey })
      const prev = queryClient.getQueryData<service.DownloadInfo[]>(downloadsKey)
      queryClient.setQueryData<service.DownloadInfo[]>(downloadsKey, (old) =>
        old?.filter((d) => d.id !== id),
      )
      return { prev }
    },
    onError: (error, _vars, context) => {
      if (context?.prev) {
        queryClient.setQueryData(downloadsKey, context.prev)
      }
      toast.error(error.message)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: downloadsKey })
    },
  })
}
