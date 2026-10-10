import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import * as tweaksService from '@/services/system-tweaks'

const systemTweaksKey = ['system-tweaks', 'status'] as const

export function useSystemTweakStatus() {
  return useQuery({
    queryKey: systemTweaksKey,
    queryFn: tweaksService.getSystemTweakStatus,
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  })
}

export function useCreateRestorePoint() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: tweaksService.createRestorePoint,
    onSuccess: (res) => {
      if (res.success) {
        toast.success(res.message)
      } else {
        toast.error(res.message)
      }
      queryClient.invalidateQueries({ queryKey: systemTweaksKey })
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to create restore point.')
    },
  })
}

export function useToggleNetworkTweaks() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (enable: boolean) => tweaksService.toggleNetworkTweaks(enable),
    onSuccess: (res) => {
      if (res.success) {
        toast.success(res.message)
      } else {
        toast.error(res.message)
      }
      queryClient.invalidateQueries({ queryKey: systemTweaksKey })
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to modify network tweaks.')
    },
  })
}

export function useToggleGpuMsiMode() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (enable: boolean) => tweaksService.toggleGpuMsiMode(enable),
    onSuccess: (res) => {
      if (res.success) {
        toast.success(res.message)
      } else {
        toast.error(res.message)
      }
      queryClient.invalidateQueries({ queryKey: systemTweaksKey })
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to update GPU MSI mode.')
    },
  })
}

export function useToggleBcdTweaks() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (enable: boolean) => tweaksService.toggleBcdTweaks(enable),
    onSuccess: (res) => {
      if (res.success) {
        toast.success(res.message)
      } else {
        toast.error(res.message)
      }
      queryClient.invalidateQueries({ queryKey: systemTweaksKey })
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to apply BCD tweaks.')
    },
  })
}

export function useToggleTelemetryDebloat() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (enable: boolean) => tweaksService.toggleTelemetryDebloat(enable),
    onSuccess: (res) => {
      if (res.success) {
        toast.success(res.message)
      } else {
        toast.error(res.message)
      }
      queryClient.invalidateQueries({ queryKey: systemTweaksKey })
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to update telemetry settings.')
    },
  })
}

export function useCleanShaderCaches() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: tweaksService.cleanShaderCaches,
    onSuccess: (res) => {
      const mb = (res.freed_bytes / (1024 * 1024)).toFixed(1)
      toast.success(
        `Purged ${res.files_deleted} shader cache file(s), freeing ${mb} MB across ${res.paths_cleaned.length} folder(s).`,
      )
      queryClient.invalidateQueries({ queryKey: systemTweaksKey })
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Shader cache cleaning failed.')
    },
  })
}
