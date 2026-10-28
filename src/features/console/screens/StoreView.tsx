import React from 'react'
import { Sparkles, Flame, Calendar, Tag } from 'lucide-react'
import type { HubGame } from '@/types/models'
import { ConsoleRow } from '../ui/Row'

export interface StoreViewProps {
  topRated: HubGame[]
  newReleases: HubGame[]
  comingSoon: HubGame[]
  discounted: HubGame[]
  onSelectHubGame: (hubGame: HubGame) => void
}

export const StoreView: React.FC<StoreViewProps> = ({
  topRated,
  newReleases,
  comingSoon,
  discounted,
  onSelectHubGame,
}) => {
  return (
    <div className="space-y-6 pb-16">
      <div className="p-6 rounded-3xl bg-gradient-to-r from-cyan-950/70 via-slate-900/80 to-violet-950/70 border border-white/15 flex items-center justify-between">
        <div>
          <span className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-widest text-cyan-400">
            <Sparkles className="w-4 h-4" />
            IGDB + Steam Live Catalog
          </span>
          <h1 className="text-3xl font-black text-white mt-1">Game Hub & Store Deals</h1>
        </div>
        <div className="hidden md:flex items-center gap-4 text-xs text-slate-300">
          <span className="flex items-center gap-1.5">
            <Tag className="w-4 h-4 text-emerald-400" />
            {discounted.length} Active Deals
          </span>
          <span className="flex items-center gap-1.5">
            <Flame className="w-4 h-4 text-amber-400" />
            {topRated.length} Top Rated
          </span>
          <span className="flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-cyan-400" />
            {comingSoon.length} Upcoming
          </span>
        </div>
      </div>

      <ConsoleRow
        rowId="store_deals"
        title="Spotlight Steam Deals"
        subtitle="Live Verified Discounts"
        items={discounted.map((hg) => ({ id: `deal_${hg.igdb_id}`, hubGame: hg }))}
        onSelectGame={() => {}}
        onSelectHubGame={onSelectHubGame}
      />

      <ConsoleRow
        rowId="store_new"
        title="Hot New Releases"
        items={newReleases.map((hg) => ({ id: `new_${hg.igdb_id}`, hubGame: hg }))}
        onSelectGame={() => {}}
        onSelectHubGame={onSelectHubGame}
      />

      <ConsoleRow
        rowId="store_top"
        title="Critically Acclaimed"
        items={topRated.map((hg) => ({ id: `top_${hg.igdb_id}`, hubGame: hg }))}
        onSelectGame={() => {}}
        onSelectHubGame={onSelectHubGame}
      />

      <ConsoleRow
        rowId="store_soon"
        title="Coming Soon"
        items={comingSoon.map((hg) => ({ id: `soon_${hg.igdb_id}`, hubGame: hg }))}
        onSelectGame={() => {}}
        onSelectHubGame={onSelectHubGame}
      />
    </div>
  )
}
