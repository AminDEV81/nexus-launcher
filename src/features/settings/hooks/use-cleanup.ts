import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import * as cleanupService from '@/services/cleanup'

export const cleanupScanKey = ['cleanup', 'scan'] as const

export function useCleanupScan() {
  return useQuery({
    queryKey: cleanupScanKey,
    queryFn: cleanupService.scanCleanupTargets,
    staleTime: 30_000,
  })
}

export function useExecuteCleanup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: cleanupService.executeCleanup,
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: cleanupScanKey })
      if (res.errors.length > 0) {
        toast.warning(`Cleaned with ${res.errors.length} issue(s): ${res.errors[0]}`)
      }
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Cleanup operation failed.')
    },
  })
}
