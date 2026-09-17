import { useState, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Globe2,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Search,
  RotateCcw,
  Star,
  Check,
  Tag,
  ExternalLink,
} from 'lucide-react'
import { openUrl } from '@tauri-apps/plugin-opener'
import { useAnimationSpeed } from '@/hooks/use-animation-speed'
import { ModalCloseButton } from '@/components/ui/modal'
import {
  useDefaultSteamRegion,
  useSteamRegionalPrices,
  POPULAR_REGIONS,
} from '../hooks/use-steam-price'
import { cn } from '@/lib/utils'

interface HubRegionalPriceModalProps {
  open: boolean
  onClose: () => void
  steamAppId?: string | null
  gameName: string
  coverUrl?: string | null
}

export function HubRegionalPriceModal({
  open,
  onClose,
  steamAppId,
  gameName,
  coverUrl,
}: HubRegionalPriceModalProps) {
  const speed = useAnimationSpeed()
  const { defaultRegion, setDefaultRegion } = useDefaultSteamRegion()
  const [selectedRegion, setSelectedRegion] = useState(defaultRegion)
  const [searchQuery, setSearchQuery] = useState('')

  const {
    data: overview,
    isLoading,
    isRefetching,
    refetch,
  } = useSteamRegionalPrices(steamAppId, selectedRegion)

  // Keep selectedRegion synced with defaultRegion when opened
  useEffect(() => {
    if (open) {
      setSelectedRegion(defaultRegion)
    }
  }, [open, defaultRegion])

  // Close on Escape key
  useEffect(() => {
    if (!open) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  const regionsList = useMemo(() => {
    if (!overview?.regions) return []
    let list = [...overview.regions]

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      list = list.filter(
        (r) =>
          r.country_name.toLowerCase().includes(q) ||
          r.country_code.toLowerCase().includes(q) ||
          r.currency.toLowerCase().includes(q),
      )
    }

    return list
  }, [overview?.regions, searchQuery])

  // Lowest converted USD price item
  const cheapestRegion = useMemo(() => {
    if (!overview?.regions || overview.regions.length === 0 || overview.is_free) return null
    return overview.regions[0]
  }, [overview])

  const steamStoreUrl = steamAppId ? `https://store.steampowered.com/app/${steamAppId}` : null

  if (!open) return null

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-5 lg:p-8">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 * speed }}
            onClick={onClose}
            className="absolute inset-0 bg-black/85 backdrop-blur-md"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.25 * speed, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-border/80 bg-surface shadow-2xl"
          >
            {/* Header */}
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border/80 bg-surface-raised px-5 py-3 sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                {coverUrl ? (
                  <img
                    src={coverUrl}
                    alt=""
                    className="size-10 shrink-0 rounded-xl object-cover shadow-sm ring-1 ring-border"
                  />
                ) : (
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent shadow-inner">
                    <Globe2 className="size-5" />
                  </div>
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-base font-extrabold text-text sm:text-lg">
                      Regional Price Tracker
                    </h3>
                    <span className="hidden sm:inline-flex items-center rounded-md border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-black text-accent uppercase tracking-wider">
                      SteamDB Style
                    </span>
                  </div>
                  <p className="truncate text-xs font-medium text-subtle">{gameName}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Refresh Prices */}
                <button
                  type="button"
                  onClick={() => void refetch()}
                  disabled={isLoading || isRefetching}
                  title="Refetch live prices from Steam"
                  className="flex size-8.5 items-center justify-center rounded-xl border border-border bg-surface text-subtle hover:text-text hover:bg-surface-raised active:scale-95 transition-all disabled:opacity-50"
                >
                  <RotateCcw
                    className={cn('size-4', (isLoading || isRefetching) && 'animate-spin')}
                  />
                </button>

                {/* Steam Store Link */}
                {steamStoreUrl && (
                  <button
                    type="button"
                    onClick={() => void openUrl(steamStoreUrl)}
                    title="Open Store Page on Steam"
                    className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-subtle hover:text-text hover:bg-surface-raised active:scale-95 transition-all"
                  >
                    <ExternalLink className="size-3.5" />
                    <span className="hidden sm:inline">Steam Store</span>
                  </button>
                )}

                <ModalCloseButton
                  onClick={onClose}
                  size="lg"
                  aria-label="Close regional price tracker"
                />
              </div>
            </div>

            {/* Active & Default Region Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 bg-surface-raised/60 px-5 py-2.5 sm:px-6 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-subtle font-medium">Selected Region:</span>
                <div className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-2.5 py-1 font-semibold text-text shadow-xs">
                  <span>{POPULAR_REGIONS.find((r) => r.code === selectedRegion)?.flag}</span>
                  <span>
                    {POPULAR_REGIONS.find((r) => r.code === selectedRegion)?.name ??
                      selectedRegion.toUpperCase()}
                  </span>
                </div>

                {selectedRegion === defaultRegion ? (
                  <span className="flex items-center gap-1 rounded-xl bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[11px] font-bold text-amber-500">
                    <Star className="size-3 fill-current" />
                    <span>Default Region</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setDefaultRegion(selectedRegion)}
                    className="flex items-center gap-1 rounded-xl border border-border bg-surface px-2 py-0.5 text-[11px] font-semibold text-subtle hover:text-text hover:border-amber-500/50 hover:bg-amber-500/10 active:scale-95 transition-all"
                  >
                    <Star className="size-3 text-amber-500" />
                    <span>Set as Default</span>
                  </button>
                )}
              </div>

              {/* Best Deal Spotlight */}
              {cheapestRegion && !overview?.is_free && cheapestRegion.difference_percent < 0 && (
                <div className="flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  <Sparkles className="size-3.5 text-emerald-500" />
                  <span>
                    Cheapest: {cheapestRegion.flag_emoji} {cheapestRegion.country_name}
                  </span>
                  <span className="font-mono text-emerald-500 font-extrabold">
                    ({cheapestRegion.difference_percent}% off US)
                  </span>
                </div>
              )}
            </div>

            {/* Search and Filters Strip */}
            <div className="flex items-center justify-between gap-3 border-b border-border/80 px-5 py-2.5 sm:px-6">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-subtle" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search region, country, or currency..."
                  className="w-full rounded-xl border border-border bg-surface pl-9 pr-3 py-1.5 text-xs text-text placeholder:text-muted focus:border-accent focus:outline-none"
                />
              </div>

              <div className="text-[11px] text-subtle">
                Showing {regionsList.length} global benchmark regions
              </div>
            </div>

            {/* Content: Regions Table / List */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 scrollbar-thin">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                  <div className="size-10 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                  <p className="text-xs font-semibold text-text">
                    Fetching live prices from Steam across all regions...
                  </p>
                  <p className="text-[11px] text-muted">
                    Converting currencies to USD using real-time forex rates
                  </p>
                </div>
              ) : overview?.is_free ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                  <span className="flex size-14 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-500 shadow-inner">
                    <Sparkles className="size-7" />
                  </span>
                  <div>
                    <h4 className="text-base font-extrabold text-text">Free to Play</h4>
                    <p className="text-xs text-muted mt-1">
                      This game is 100% free to play across all Steam regions.
                    </p>
                  </div>
                </div>
              ) : regionsList.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted">
                  <Tag className="size-8 text-subtle" />
                  <p className="text-xs font-semibold text-text">No regions matched your search.</p>
                </div>
              ) : (
                <div className="grid gap-2 sm:gap-2.5">
                  {regionsList.map((item, idx) => {
                    const isSelected = item.country_code === selectedRegion
                    const isDefault = item.country_code === defaultRegion
                    const isBestDeal = idx === 0 && item.difference_percent < 0
                    const isCheaper = item.difference_percent < 0
                    const isPricier = item.difference_percent > 0

                    return (
                      <div
                        key={item.country_code}
                        onClick={() => setSelectedRegion(item.country_code)}
                        className={cn(
                          'group relative flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-3 sm:px-4 sm:py-3 transition-all cursor-pointer',
                          isSelected
                            ? 'border-accent bg-accent/10 ring-2 ring-accent/30 shadow-md'
                            : 'border-border/80 bg-surface hover:border-accent/40 hover:bg-surface-raised',
                        )}
                      >
                        {/* Left: Flag, Country, and Currency */}
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-2xl select-none leading-none">
                            {item.flag_emoji}
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-text truncate">
                                {item.country_name}
                              </span>
                              <span className="rounded bg-surface-raised border border-border px-1.5 py-0.2 font-mono text-[10px] font-bold text-subtle">
                                {item.currency}
                              </span>
                              {isBestDeal && (
                                <span className="rounded-md bg-emerald-500/20 border border-emerald-500/40 px-1.5 py-0.2 text-[9px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                                  Lowest Price
                                </span>
                              )}
                              {isDefault && (
                                <span className="flex items-center gap-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.2 text-[9px] font-black text-amber-500">
                                  <Star className="size-2.5 fill-current" />
                                  <span>Default</span>
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-subtle">
                              Steam Store Region: {item.country_code.toUpperCase()}
                            </span>
                          </div>
                        </div>

                        {/* Right: Local Price, Converted USD, and Savings Difference */}
                        <div className="flex items-center gap-3 sm:gap-4 shrink-0">
                          {/* Discount tag if on sale */}
                          {item.discount_percent > 0 && (
                            <span className="flex items-center gap-0.5 rounded-lg bg-emerald-500 px-2 py-0.5 font-mono text-xs font-black text-black shadow-xs">
                              -{item.discount_percent}%
                            </span>
                          )}

                          {/* Local Price & Initial Price */}
                          <div className="flex flex-col items-end">
                            {item.discount_percent > 0 && item.initial_formatted && (
                              <span className="line-through font-mono text-[10px] text-muted">
                                {item.initial_formatted}
                              </span>
                            )}
                            <span className="font-mono text-xs font-extrabold text-text">
                              {item.final_formatted}
                            </span>
                          </div>

                          {/* Converted USD Price */}
                          <div className="flex flex-col items-end min-w-[70px]">
                            <span className="font-mono text-sm font-black text-text">
                              ${item.converted_usd.toFixed(2)}
                            </span>
                            <span className="text-[10px] font-mono text-subtle">USD</span>
                          </div>

                          {/* Difference relative to US Base Price (SteamDB Style) */}
                          <div className="min-w-[65px] text-right">
                            {item.country_code === 'us' || item.difference_percent === 0 ? (
                              <span className="inline-flex items-center rounded-lg border border-border bg-surface-raised px-2 py-0.5 font-mono text-[11px] font-bold text-subtle">
                                Base
                              </span>
                            ) : isCheaper ? (
                              <span className="inline-flex items-center gap-0.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 font-mono text-[11px] font-black text-emerald-600 dark:text-emerald-400 shadow-xs">
                                <TrendingDown className="size-3" />
                                <span>{item.difference_percent}%</span>
                              </span>
                            ) : isPricier ? (
                              <span className="inline-flex items-center gap-0.5 rounded-lg border border-rose-500/40 bg-rose-500/15 px-2 py-0.5 font-mono text-[11px] font-bold text-rose-500 shadow-xs">
                                <TrendingUp className="size-3" />
                                <span>+{item.difference_percent}%</span>
                              </span>
                            ) : null}
                          </div>

                          {/* Action Button: Set as default or select */}
                          <div className="pl-1">
                            {isSelected ? (
                              <div className="flex size-7 items-center justify-center rounded-full bg-accent text-white shadow-xs">
                                <Check className="size-3.5 stroke-[3]" />
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setSelectedRegion(item.country_code)
                                }}
                                className="flex size-7 items-center justify-center rounded-full border border-border bg-surface text-subtle hover:text-text hover:border-accent hover:bg-surface-raised transition-all"
                              >
                                <span className="size-1.5 rounded-full bg-subtle" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Footer Information */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/80 bg-surface-raised px-5 py-3 sm:px-6 text-xs text-muted">
              <div className="flex items-center gap-2">
                <Globe2 className="size-3.5 text-accent shrink-0" />
                <span className="text-[11px] text-subtle">
                  Exchange rates updated live via open forex data. Differences calculated relative
                  to the US base price.
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {selectedRegion !== defaultRegion && (
                  <button
                    type="button"
                    onClick={() => setDefaultRegion(selectedRegion)}
                    className="flex items-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-500 hover:bg-amber-500/20 active:scale-95 transition-all"
                  >
                    <Star className="size-3 fill-current" />
                    <span>Set {selectedRegion.toUpperCase()} as Default</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl border border-border bg-surface px-4 py-1 text-xs font-semibold text-text hover:bg-surface-raised active:scale-95 transition-all"
                >
                  Done
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
