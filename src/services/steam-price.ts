import { call } from './tauri'

export interface SteamRegionalPrice {
  country_code: string
  country_name: string
  flag_emoji: string
  currency: string
  raw_initial: number
  raw_final: number
  initial_formatted: string
  final_formatted: string
  discount_percent: number
  converted_usd: number
  difference_percent: number
  is_free: boolean
}

export interface SteamPriceOverview {
  steam_app_id: string
  is_free: boolean
  base_usd_price: number
  active_price?: SteamRegionalPrice | null
  regions: SteamRegionalPrice[]
}

export function getSteamGamePrice(steamAppId: string, countryCode?: string) {
  return call<SteamRegionalPrice | null>('get_steam_game_price', {
    steamAppId,
    countryCode: countryCode ?? null,
  })
}

export function getSteamRegionalPrices(steamAppId: string, activeCountry?: string) {
  return call<SteamPriceOverview | null>('get_steam_regional_prices', {
    steamAppId,
    activeCountry: activeCountry ?? null,
  })
}
