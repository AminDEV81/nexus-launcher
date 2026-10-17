import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { boostRam, getLiveMetrics, getSystemSpecs } from '@/services/system'
import { useWindowActive } from '@/hooks/use-window-active'

export const systemSpecsQueryKey = ['system-specs'] as const
export const liveMetricsQueryKey = ['system-live-metrics'] as const

export function useSystemSpecs() {
  return useQuery({
    queryKey: systemSpecsQueryKey,
    queryFn: getSystemSpecs,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })
}

import { useAppearanceSettingsStore } from '@/store/appearance-settings-store'

export function useLiveSystemMetrics() {
  const windowActive = useWindowActive()
  const gpuEcoMode = useAppearanceSettingsStore((s) => s.gpuEcoMode)

  return useQuery({
    queryKey: liveMetricsQueryKey,
    queryFn: getLiveMetrics,
    refetchInterval: windowActive ? (gpuEcoMode ? 4500 : 2500) : false,
    staleTime: 2000,
    refetchOnWindowFocus: true,
  })
}

export function useBoostRam() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: boostRam,
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: liveMetricsQueryKey })
      void queryClient.invalidateQueries({ queryKey: systemSpecsQueryKey })

      if (result.applied && result.metric) {
        toast.success(`RAM Optimized! Freed ${result.metric}`, {
          description: result.detail,
        })
      } else if (result.applied) {
        toast.success('RAM Optimized!', {
          description: result.detail,
        })
      } else {
        toast.info(result.detail || 'Memory is already optimal.')
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not trim background memory.')
    },
  })
}
