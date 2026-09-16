import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import * as boosterService from '@/services/booster'
import { useSettings, useSetSetting } from '@/features/settings/hooks/use-settings'

const boostableAppsKey = ['booster', 'boostable-apps'] as const

/** Mirrors `ALL_MODULE_IDS` in `src-tauri/src/commands/booster.rs` —
 *  keep the two in sync if a module is ever added/removed. */
export const BOOSTER_MODULE_IDS = [
  'close_apps',
  'cpu',
  'ram',
  'temp',
  'power_plan',
  'game_mode',
  'gaming_priority',
  'indexer_pause',
  'visual_fx',
  'timer_res',
] as const
export type BoosterModuleId = (typeof BOOSTER_MODULE_IDS)[number]

export function useBoostableApps() {
  return useQuery({
    queryKey: boostableAppsKey,
    queryFn: boosterService.scanBoostableApps,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })
}

export function useRunGameBoost() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: boosterService.runGameBoost,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: boostableAppsKey })
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'The boost could not finish.')
    },
  })
}

/** Backed by the same generic `settings` table as everything else in
 *  `use-settings.ts` — has to be, since the Rust side reads it too
 *  (`auto_boost_enabled` in `commands/launch.rs`), not just the UI. */
export function useAutoBoost() {
  const { data: settings } = useSettings()
  const setSetting = useSetSetting()
  const enabled = settings?.auto_boost_enabled === 'true'

  return {
    enabled,
    setEnabled: (value: boolean) =>
      setSetting.mutate({ key: 'auto_boost_enabled', value: value ? 'true' : 'false' }),
  }
}

/** Which modules the settings panel's Boost button (and Auto Boost)
 *  should run — a comma-separated list in the `booster_enabled_modules`
 *  setting, read directly by `perform_boost` in `commands/booster.rs`
 *  so both sides always agree on the current selection. Unset means
 *  "everything on", matching the Rust side's default. */
export function useBoosterModules() {
  const { data: settings } = useSettings()
  const setSetting = useSetSetting()

  const raw = settings?.booster_enabled_modules
  const enabledIds: string[] =
    raw && raw.trim().length > 0
      ? raw
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean)
      : [...BOOSTER_MODULE_IDS]

  function isEnabled(id: BoosterModuleId) {
    return enabledIds.includes(id)
  }

  function toggle(id: BoosterModuleId) {
    const next = isEnabled(id) ? enabledIds.filter((m) => m !== id) : [...enabledIds, id]
    setSetting.mutate({ key: 'booster_enabled_modules', value: next.join(',') })
  }

  return { isEnabled, toggle }
}
