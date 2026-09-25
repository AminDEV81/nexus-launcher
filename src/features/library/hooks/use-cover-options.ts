import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  searchCoverOptions,
  applyCover,
  applyCustomCover,
  searchBannerOptions,
  searchLogoOptions,
  applyBanner,
  applyLogo,
  applyCustomBanner,
  cropAndSaveImage,
  resetArtwork,
} from '@/services/metadata'
import type { ArtworkKind, CropRect } from '@/services/metadata'
import type { Game } from '@/types/models'

function syncGameInCache(queryClient: QueryClient, updatedGame: Game) {
  queryClient.setQueriesData<Game[]>({ queryKey: ['games'] }, (games) =>
    Array.isArray(games)
      ? games.map((game) => (game.id === updatedGame.id ? updatedGame : game))
      : games,
  )
  queryClient.setQueriesData<Game>({ queryKey: ['games'] }, (old) =>
    old && !Array.isArray(old) && old.id === updatedGame.id ? updatedGame : old,
  )
  queryClient.invalidateQueries({ queryKey: ['games'] })
}

export function useCoverOptions(gameId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['cover-options', gameId],
    queryFn: () => searchCoverOptions(gameId as string),
    enabled: Boolean(gameId) && enabled,
    staleTime: 5 * 60_000,
    retry: false,
  })
}

export function useApplyCover() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      gameId,
      url,
      isAnimated,
      allowLarge,
    }: {
      gameId: string
      url: string
      isAnimated: boolean
      allowLarge?: boolean
    }) => applyCover(gameId, url, isAnimated, allowLarge),
    onSuccess: (game) => {
      syncGameInCache(queryClient, game)
      toast.success('Cover updated.')
    },
    onError: (error) => {
      const msg = error instanceof Error ? error.message : String(error)
      if (msg.includes('artwork_too_large:')) return
      toast.error(msg || 'Could not set that cover.')
    },
  })
}

export function useApplyCustomCover() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ gameId, filePath }: { gameId: string; filePath: string }) =>
      applyCustomCover(gameId, filePath),
    onSuccess: (game) => {
      syncGameInCache(queryClient, game)
      toast.success('Cover updated.')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not set that cover.')
    },
  })
}

export function useBannerOptions(gameId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['banner-options', gameId],
    queryFn: () => searchBannerOptions(gameId as string),
    enabled: Boolean(gameId) && enabled,
    staleTime: 5 * 60_000,
    retry: false,
  })
}

export function useLogoOptions(gameId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['logo-options', gameId],
    queryFn: () => searchLogoOptions(gameId as string),
    enabled: Boolean(gameId) && enabled,
    staleTime: 5 * 60_000,
    retry: false,
  })
}

export function useApplyLogo() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      gameId,
      url,
      allowLarge,
    }: {
      gameId: string
      url: string
      allowLarge?: boolean
    }) => applyLogo(gameId, url, allowLarge),
    onSuccess: (game) => {
      syncGameInCache(queryClient, game)
      toast.success('Logo updated.')
    },
    onError: (error) => {
      const msg = error instanceof Error ? error.message : String(error)
      if (msg.includes('artwork_too_large:')) return
      toast.error(msg || 'Could not set that logo.')
    },
  })
}

export function useApplyBanner() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      gameId,
      url,
      allowLarge,
    }: {
      gameId: string
      url: string
      allowLarge?: boolean
    }) => applyBanner(gameId, url, allowLarge),
    onSuccess: (game) => {
      syncGameInCache(queryClient, game)
      toast.success('Banner updated.')
    },
    onError: (error) => {
      const msg = error instanceof Error ? error.message : String(error)
      if (msg.includes('artwork_too_large:')) return
      toast.error(msg || 'Could not set that banner.')
    },
  })
}

export function useApplyCustomBanner() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ gameId, filePath }: { gameId: string; filePath: string }) =>
      applyCustomBanner(gameId, filePath),
    onSuccess: (game) => {
      syncGameInCache(queryClient, game)
      toast.success('Banner updated.')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not set that banner.')
    },
  })
}

const ARTWORK_LABEL: Record<ArtworkKind, string> = {
  cover: 'Cover',
  banner: 'Banner',
  logo: 'Logo',
  background: 'Background',
}

export function useCropAndSaveImage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      gameId,
      sourcePath,
      rect,
      targetKind,
    }: {
      gameId: string
      sourcePath: string
      rect: CropRect
      targetKind: ArtworkKind
    }) => cropAndSaveImage(gameId, sourcePath, rect, targetKind),
    onSuccess: (game, { targetKind }) => {
      syncGameInCache(queryClient, game)
      toast.success(`${ARTWORK_LABEL[targetKind]} updated.`)
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not save the cropped image.')
    },
  })
}

export function useResetArtwork() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ gameId, kind }: { gameId: string; kind: ArtworkKind }) =>
      resetArtwork(gameId, kind),
    onSuccess: (game, { kind }) => {
      syncGameInCache(queryClient, game)
      toast.success(`${ARTWORK_LABEL[kind]} reset to the downloaded original.`)
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not reset that artwork.')
    },
  })
}
