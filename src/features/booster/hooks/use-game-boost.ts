import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import * as boosterService from '@/services/booster'
import { useSettings, useSetSetting } from '@/features/settings/hooks/use-settings'
import {
  liveMetricsQueryKey,
  systemSpecsQueryKey,
} from '@/features/settings/hooks/use-system-specs'

export const boostableAppsKey = ['booster', 'boostable-apps'] as const

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

export type BoosterPresetId = 'esports_max' | 'streamer_safe' | 'memory_stutter' | 'custom'

export function useBoostableApps() {
  return useQuery({
    queryKey: boostableAppsKey,
    queryFn: boosterService.scanBoostableApps,
    staleTime: 15_000,
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
  })
}

export function useRunGameBoost() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: boosterService.runGameBoost,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: boostableAppsKey })
      void queryClient.invalidateQueries({ queryKey: liveMetricsQueryKey })
      void queryClient.invalidateQueries({ queryKey: systemSpecsQueryKey })
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'The boost could not finish.')
    },
  })
}

export function useRestoreGameBoost() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: boosterService.restoreGameBoost,
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: liveMetricsQueryKey })
      toast.success('System Restored to Normal Mode', {
        description: res.detail,
      })
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not restore normal mode.')
    },
  })
}

export function useKillSelectedApps() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (appNames: string[]) => boosterService.killSelectedApps(appNames),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: boostableAppsKey })
      void queryClient.invalidateQueries({ queryKey: liveMetricsQueryKey })
      if (res.applied) {
        toast.success('Background Processes Terminated', {
          description: res.detail,
        })
      } else {
        toast.info(res.detail)
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not terminate selected apps.')
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
  const enabledIds: BoosterModuleId[] =
    raw !== undefined
      ? raw
          .split(',')
          .map((id) => id.trim())
          .filter((id): id is BoosterModuleId =>
            (BOOSTER_MODULE_IDS as readonly string[]).includes(id),
          )
      : [...BOOSTER_MODULE_IDS]

  function isEnabled(id: BoosterModuleId) {
    return enabledIds.includes(id)
  }

  function toggle(id: BoosterModuleId) {
    const next = isEnabled(id) ? enabledIds.filter((m) => m !== id) : [...enabledIds, id]
    setSetting.mutate({ key: 'booster_enabled_modules', value: next.join(',') })
  }

  function setModules(ids: readonly BoosterModuleId[]) {
    setSetting.mutate({ key: 'booster_enabled_modules', value: ids.join(',') })
  }

  return { enabledIds, isEnabled, toggle, setModules }
}

/** Whitelist / exclusion list of background app display names that should NOT
 *  be closed when `close_apps` runs (e.g. Discord, Spotify during voice chat). */
export function useBoosterExcludedApps() {
  const { data: settings } = useSettings()
  const setSetting = useSetSetting()

  const raw = settings?.booster_excluded_apps ?? ''
  const excludedNames: string[] = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  function isExcluded(appName: string) {
    const lower = appName.toLowerCase()
    return excludedNames.some((n) => n.toLowerCase() === lower)
  }

  function toggleExclude(appName: string) {
    const lower = appName.toLowerCase()
    const next = isExcluded(appName)
      ? excludedNames.filter((n) => n.toLowerCase() !== lower)
      : [...excludedNames, appName]
    setSetting.mutate({ key: 'booster_excluded_apps', value: next.join(',') })
  }

  function setExcluded(names: string[]) {
    setSetting.mutate({ key: 'booster_excluded_apps', value: names.join(',') })
  }

  return { excludedNames, isExcluded, toggleExclude, setExcluded }
}
