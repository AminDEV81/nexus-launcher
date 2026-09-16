import { motion } from 'framer-motion'
import { Globe2, Sparkles, ArrowRight } from 'lucide-react'
import { useAnimationSpeed } from '@/hooks/use-animation-speed'
import { useDefaultSteamRegion, useSteamPrice, POPULAR_REGIONS } from '../hooks/use-steam-price'
import { cn } from '@/lib/utils'

interface HubSteamPriceBadgeProps {
  steamAppId?: string | null
  gameName: string
  onOpenRegionalModal: () => void
}

export function HubSteamPriceBadge({
  steamAppId,
  gameName: _gameName,
  onOpenRegionalModal,
}: HubSteamPriceBadgeProps) {
  const speed = useAnimationSpeed()
  const { defaultRegion } = useDefaultSteamRegion()
  const { data: price, isLoading, isError } = useSteamPrice(steamAppId, defaultRegion)

  if (!steamAppId) {
    return null
  }

  const activeRegion = POPULAR_REGIONS.find((r) => r.code === defaultRegion) || {
    code: 'us',
    name: 'United States',
    flag: '🇺🇸',
    currency: 'USD',
  }

  if (isLoading) {
    return (
      <div className="flex h-11 w-56 animate-pulse items-center gap-2.5 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 backdrop-blur-md">
        <div className="size-5 rounded-full bg-white/20" />
        <div className="h-4 w-32 rounded bg-white/20" />
      </div>
    )
  }

  if (isError || !price) {
    return null
  }

  if (price.is_free) {
    return (
      <motion.button
        type="button"
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        transition={{ duration: 0.2 * speed }}
        onClick={onOpenRegionalModal}
        className="group relative inline-flex items-center gap-2.5 rounded-2xl border border-emerald-500/50 bg-gradient-to-r from-emerald-500/25 via-emerald-600/20 to-transparent px-4 py-2 text-sm font-bold text-emerald-300 shadow-lg backdrop-blur-md transition-all hover:border-emerald-400 hover:from-emerald-500/35 cursor-pointer"
      >
        <span className="flex size-6 items-center justify-center rounded-xl bg-emerald-500/30 text-emerald-300 ring-1 ring-emerald-500/40">
          <Sparkles className="size-3.5" />
        </span>
        <span className="font-black tracking-wide uppercase text-sm">Free to Play</span>
        <span className="text-xs text-emerald-200/70 font-medium">on Steam</span>
      </motion.button>
    )
  }

  const hasDiscount = price.discount_percent > 0
  const isForeignCurrency = price.currency !== 'USD'

  return (
    <motion.button
      type="button"
      whileHover={{ scale: 1.03, y: -1 }}
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.2 * speed }}
      onClick={onOpenRegionalModal}
      title="Click to compare Steam prices across all regions (SteamDB style)"
      className={cn(
        'group relative flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-2 sm:px-4.5 sm:py-2.5 text-sm shadow-xl backdrop-blur-md transition-all cursor-pointer select-none',
        hasDiscount
          ? 'border-emerald-500/50 bg-gradient-to-r from-emerald-950/80 via-black/70 to-surface/90 hover:border-emerald-400 hover:shadow-emerald-500/25'
          : 'border-white/25 bg-black/70 hover:border-accent hover:shadow-accent/25',
      )}
    >
      {/* Country Flag & Region Info */}
      <div className="flex items-center gap-2 border-r border-white/20 pr-2.5">
        <span className="text-xl sm:text-2xl select-none leading-none drop-shadow-sm">
          {activeRegion.flag}
        </span>
        <span className="text-xs font-bold text-white/90 group-hover:text-white uppercase tracking-wider font-mono">
          {activeRegion.code.toUpperCase()}
        </span>
      </div>

      {/* Pricing Data */}
      <div className="flex items-center gap-2.5">
        {hasDiscount && (
          <span className="flex items-center rounded-lg bg-emerald-500 px-2 py-0.5 font-mono text-xs sm:text-sm font-black text-black shadow-md">
            -{price.discount_percent}%
          </span>
        )}

        <div className="flex items-baseline gap-2">
          {hasDiscount && price.initial_formatted && (
            <span className="line-through text-xs sm:text-sm font-semibold text-white/50">
              {price.initial_formatted}
            </span>
          )}

          <span className="font-mono text-sm sm:text-base font-black text-white tracking-tight">
            {price.final_formatted}
          </span>

          {isForeignCurrency && price.converted_usd > 0 && (
            <span className="text-xs font-mono font-bold text-emerald-400/90">
              (≈ ${price.converted_usd.toFixed(2)} USD)
            </span>
          )}
        </div>
      </div>

      {/* SteamDB Compare Regions Cue */}
      <div className="hidden sm:flex items-center gap-1.5 border-l border-white/20 pl-2.5 text-xs font-bold text-accent transition-colors group-hover:text-accent-hover">
        <Globe2 className="size-3.5" />
        <span>Regions</span>
        <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
      </div>
    </motion.button>
  )
}
