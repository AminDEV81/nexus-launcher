import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import * as artService from '@/services/art-wallpaper'
import type { ArtCategory, ArtItem } from '@/services/art-wallpaper'

export const likedArtworksKey = ['art-wallpaper', 'liked'] as const

export function useArtSearch(query: string, category: ArtCategory, syncNonce = 0) {
  const trimmed = query.trim()
  return useInfiniteQuery({
    queryKey: ['art-wallpaper', 'search', trimmed.toLowerCase(), category, syncNonce],
    queryFn: ({ pageParam }) =>
      artService.searchArtWallpapers(trimmed, category, pageParam, syncNonce),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length >= 12 ? allPages.length + 1 : undefined,
    staleTime: 30 * 60 * 1000,
    gcTime: 20 * 60 * 1000,
    refetchInterval: false,
    refetchOnWindowFocus: false,
  })
}

export function useLikedArtworks() {
  return useQuery({
    queryKey: likedArtworksKey,
    queryFn: artService.listLikedArtworks,
    staleTime: 60_000,
  })
}

export function useToggleLikeArtwork() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: artService.toggleLikeArtwork,
    onSuccess: (isLiked, item) => {
      void queryClient.invalidateQueries({ queryKey: likedArtworksKey })
      queryClient.setQueriesData<{ pages: ArtItem[][]; pageParams: unknown[] }>(
        { queryKey: ['art-wallpaper', 'search'] },
        (old) => {
          if (!old || !Array.isArray(old.pages)) return old
          return {
            ...old,
            pages: old.pages.map((page) =>
              page.map((entry) => (entry.id === item.id ? { ...entry, is_liked: isLiked } : entry)),
            ),
          }
        },
      )
      toast.success(isLiked ? 'Added to Liked Art' : 'Removed from Liked Art')
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to update liked artwork.')
    },
  })
}
