import React from 'react'
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
      <h1 className="px-6 pb-2 pt-2 text-[2.6rem] font-semibold tracking-tight text-white">
        Store
      </h1>

      <ConsoleRow
        rowId="store_deals"
        title="Deals"
        items={discounted.map((hg) => ({ id: `deal_${hg.igdb_id}`, hubGame: hg }))}
        onSelectGame={() => {}}
        onSelectHubGame={onSelectHubGame}
      />

      <ConsoleRow
        rowId="store_new"
        title="New releases"
        items={newReleases.map((hg) => ({ id: `new_${hg.igdb_id}`, hubGame: hg }))}
        onSelectGame={() => {}}
        onSelectHubGame={onSelectHubGame}
      />

      <ConsoleRow
        rowId="store_top"
        title="Top rated"
        items={topRated.map((hg) => ({ id: `top_${hg.igdb_id}`, hubGame: hg }))}
        onSelectGame={() => {}}
        onSelectHubGame={onSelectHubGame}
      />

      <ConsoleRow
        rowId="store_soon"
        title="Coming soon"
        items={comingSoon.map((hg) => ({ id: `soon_${hg.igdb_id}`, hubGame: hg }))}
        onSelectGame={() => {}}
        onSelectHubGame={onSelectHubGame}
      />
    </div>
  )
}
