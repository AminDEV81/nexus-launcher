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
import { useLaunchStore } from '@/store/launch-store'

export function useLiveSystemMetrics() {
  const windowActive = useWindowActive()
  const gpuEcoMode = useAppearanceSettingsStore((s) => s.gpuEcoMode)
  const isAnyGameRunning = useLaunchStore((s) => (s.runningGameIds?.size ?? 0) > 0)

  return useQuery({
    queryKey: liveMetricsQueryKey,
    queryFn: getLiveMetrics,
    enabled: !isAnyGameRunning,
    refetchInterval: windowActive && !isAnyGameRunning ? (gpuEcoMode ? 8000 : 4000) : false,
    staleTime: 3500,
    refetchOnWindowFocus: false,
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
