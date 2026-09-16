import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  getSteamGamePrice,
  getSteamRegionalPrices,
  type SteamPriceOverview,
  type SteamRegionalPrice,
} from '@/services/steam-price'
import { useSettings, useSetSetting } from '@/features/settings/hooks/use-settings'

export const DEFAULT_STEAM_REGION_KEY = 'default_steam_region'

export const POPULAR_REGIONS = [
  { code: 'us', name: 'United States', flag: '🇺🇸', currency: 'USD' },
  { code: 'ua', name: 'Ukraine', flag: '🇺🇦', currency: 'UAH' },
  { code: 'kz', name: 'Kazakhstan', flag: '🇰🇿', currency: 'KZT' },
  { code: 'tr', name: 'Turkey (MENA)', flag: '🇹🇷', currency: 'USD' },
  { code: 'ar', name: 'Argentina (LATAM)', flag: '🇦🇷', currency: 'USD' },
  { code: 'in', name: 'India', flag: '🇮🇳', currency: 'INR' },
  { code: 'br', name: 'Brazil', flag: '🇧🇷', currency: 'BRL' },
  { code: 'cn', name: 'China', flag: '🇨🇳', currency: 'CNY' },
  { code: 'jp', name: 'Japan', flag: '🇯🇵', currency: 'JPY' },
  { code: 'de', name: 'Eurozone', flag: '🇪🇺', currency: 'EUR' },
  { code: 'gb', name: 'United Kingdom', flag: '🇬🇧', currency: 'GBP' },
  { code: 'ca', name: 'Canada', flag: '🇨🇦', currency: 'CAD' },
  { code: 'au', name: 'Australia', flag: '🇦🇺', currency: 'AUD' },
  { code: 'pl', name: 'Poland', flag: '🇵🇱', currency: 'PLN' },
] as const

/** Fetches real-time price for a single region (used on hero price badge) */
export function useSteamPrice(steamAppId?: string | null, countryCode?: string) {
  return useQuery<SteamRegionalPrice | null>({
    queryKey: ['steam-price', steamAppId, countryCode ?? 'default'],
    queryFn: () => getSteamGamePrice(steamAppId!, countryCode),
    enabled: Boolean(steamAppId && steamAppId.trim().length > 0),
    staleTime: 5 * 60 * 1000, // 5 minutes fresh
  })
}

/** Fetches full regional comparison across all benchmark regions (SteamDB-style) */
export function useSteamRegionalPrices(steamAppId?: string | null, activeCountry?: string) {
  return useQuery<SteamPriceOverview | null>({
    queryKey: ['steam-regional-prices', steamAppId, activeCountry ?? 'default'],
    queryFn: () => getSteamRegionalPrices(steamAppId!, activeCountry),
    enabled: Boolean(steamAppId && steamAppId.trim().length > 0),
    staleTime: 5 * 60 * 1000,
  })
}

/** Hook to read and save the user's default Steam region preference */
export function useDefaultSteamRegion() {
  const { data: settings } = useSettings()
  const setSettingMutation = useSetSetting()

  const defaultRegion = settings?.[DEFAULT_STEAM_REGION_KEY] || 'us'

  function setDefaultRegion(code: string) {
    const cleanCode = code.toLowerCase().trim()
    setSettingMutation.mutate(
      { key: DEFAULT_STEAM_REGION_KEY, value: cleanCode },
      {
        onSuccess: () => {
          const reg = POPULAR_REGIONS.find((r) => r.code === cleanCode)
          toast.success(
            `Default Steam region set to ${reg?.flag ?? ''} ${reg?.name ?? cleanCode.toUpperCase()}`,
          )
        },
      },
    )
  }

  return {
    defaultRegion,
    setDefaultRegion,
    isPending: setSettingMutation.isPending,
  }
}
