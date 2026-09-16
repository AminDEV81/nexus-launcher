import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getAllSettings, setSetting } from '@/services/settings'

const settingsKey = ['settings'] as const

export function useSettings() {
  return useQuery({
    queryKey: settingsKey,
    queryFn: getAllSettings,
    staleTime: Infinity,
  })
}

export function useSetSetting() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) => setSetting(key, value),
    onSuccess: (_data, { key, value }) => {
      queryClient.setQueryData<Record<string, string>>(settingsKey, (prev) => ({
        ...prev,
        [key]: value,
      }))
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not save that setting.')
    },
  })
}
