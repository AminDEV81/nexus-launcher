import { ExternalLink, Gamepad2, Globe2 } from 'lucide-react'
import { formatReleaseDate } from '@/features/library/utils/format'
import { cn } from '@/lib/utils'
import { HubScoreBadge } from './hub-score-badge'
import type { HubGameDetails } from '@/types/models'

interface HubGameSpecsProps {
  game: HubGameDetails
  isReleased: boolean
  className?: string
  onOpenRegionalPrice?: () => void
}

export function HubGameSpecs({
  game,
  isReleased,
  className,
  onOpenRegionalPrice,
}: HubGameSpecsProps) {
  return (
    <section
      className={cn(
        'flex flex-col gap-4 rounded-3xl border border-border bg-surface p-6 shadow-sm',
        className,
      )}
    >
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-accent">
        <Gamepad2 className="size-4" />
        <span>Game Specifications</span>
      </div>

      <dl className="flex flex-col gap-3 text-xs">
        <DetailRow label="Release Status">
          <span
            className={cn(
              'rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
              isReleased
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                : 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
            )}
          >
            {isReleased ? 'Official Launch' : 'In Development'}
          </span>
        </DetailRow>

        <DetailRow label="Launch Date">
          {game.release_date ? formatReleaseDate(game.release_date) : 'To Be Announced'}
        </DetailRow>

        <DetailRow label="Developer">{game.developer ?? '—'}</DetailRow>
        <DetailRow label="Publisher">{game.publisher ?? '—'}</DetailRow>

        {/* Genres Breakdown */}
        <DetailRow label="Genres">
          {game.genres && game.genres.length > 0 ? (
            <div className="flex flex-wrap justify-end gap-1 max-w-[70%]">
              {game.genres.map((genre) => (
                <span
                  key={genre}
                  className="rounded-md border border-border/80 bg-surface-raised px-1.5 py-0.5 text-[10px] font-medium text-text"
                >
                  {genre}
                </span>
              ))}
            </div>
          ) : (
            '—'
          )}
        </DetailRow>

        {/* Steam Availability & Regional Pricing */}
        <DetailRow label="Steam Store">
          {game.steam_app_id ? (
            <div className="flex items-center gap-2">
              <a
                href={`https://store.steampowered.com/app/${game.steam_app_id}/`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 font-bold text-accent hover:underline"
              >
                <span>App #{game.steam_app_id}</span>
                <ExternalLink className="size-3" />
              </a>

              {onOpenRegionalPrice && (
                <button
                  type="button"
                  onClick={onOpenRegionalPrice}
                  title="Compare regional Steam prices (SteamDB)"
                  className="inline-flex items-center gap-1 rounded-md border border-border/80 bg-surface-raised px-1.5 py-0.5 text-[10px] font-bold text-text hover:border-accent hover:text-accent active:scale-95 transition-all"
                >
                  <Globe2 className="size-2.5 text-accent" />
                  <span>Prices</span>
                </button>
              )}
            </div>
          ) : (
            <span className="text-subtle">Not listed on Steam</span>
          )}
        </DetailRow>

        {/* IGDB ID in low-priority subtle typography */}
        <DetailRow label="IGDB Catalog ID">
          <span className="font-mono text-subtle text-[11px]">#{game.igdb_id}</span>
        </DetailRow>
      </dl>

      {/* Embedded Critic Reviews Dual Showcase (Metacritic + IGDB) */}
      <div className="mt-2 pt-3 border-t border-border/70">
        <HubScoreBadge
          variant="details"
          metacriticScore={game.metacritic_score}
          igdbRating={game.rating}
          igdbRatingCount={game.rating_count}
        />
      </div>
    </section>
  )
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/80 pb-2.5 last:border-0 last:pb-0">
      <dt className="text-subtle font-medium">{label}</dt>
      <dd className="truncate font-semibold text-text">{children}</dd>
    </div>
  )
}
