import { ExternalLink, Gamepad2, Globe2, Layers } from 'lucide-react'
import { formatReleaseDate } from '@/features/library/utils/format'
import { cn } from '@/lib/utils'
import { HubScoreBadge } from './hub-score-badge'
import { genreColor } from './hub-game-hero'
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
        'flex flex-col justify-between gap-5 rounded-3xl border border-border bg-surface p-6 shadow-sm',
        className,
      )}
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-accent">
          <Gamepad2 className="size-4" />
          <span>Game Specifications</span>
          <span className="h-px flex-1 bg-gradient-to-r from-accent/40 to-transparent" />
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
                    className="inline-flex items-center gap-1 rounded-md border border-border/80 bg-surface-raised px-1.5 py-0.5 text-[10px] font-bold text-text hover:border-accent hover:text-accent active:scale-95 transition-all cursor-pointer"
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

        {/* Full-Width All Genres & Themes Section (Never Truncated) */}
        <div className="rounded-2xl border border-border/80 bg-surface-raised/60 p-3.5">
          <div className="mb-2.5 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-subtle">
              <Layers className="size-3.5 text-accent" />
              <span>All Genres &amp; Themes</span>
            </div>
            {game.genres.length > 0 && (
              <span className="rounded-md bg-accent/15 px-1.5 py-0.2 font-mono text-[10px] font-bold text-accent">
                {game.genres.length}
              </span>
            )}
          </div>

          {game.genres && game.genres.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {game.genres.map((genre) => {
                const color = genreColor(genre)
                return (
                  <span
                    key={genre}
                    className="inline-flex items-center gap-1.5 rounded-xl border bg-surface px-2.5 py-1 text-[11px] font-semibold text-text shadow-2xs"
                    style={{
                      borderColor: `${color}55`,
                      backgroundColor: `${color}12`,
                    }}
                  >
                    <span
                      className="size-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <span>{genre}</span>
                  </span>
                )
              })}
            </div>
          ) : (
            <span className="text-xs text-subtle">No genre classifications listed</span>
          )}
        </div>
      </div>

      {/* Embedded Critic Reviews Showcase (Metacritic + OpenCritic + IGDB) */}
      <div className="pt-3 border-t border-border/70">
        <HubScoreBadge
          variant="details"
          metacriticScore={game.metacritic_score}
          opencriticScore={game.opencritic_score}
          igdbRating={game.rating}
          igdbRatingCount={game.rating_count}
          gameName={game.name}
          releaseDate={game.release_date}
        />
      </div>
    </section>
  )
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/70 pb-2.5 last:border-0 last:pb-0">
      <dt className="shrink-0 text-subtle font-medium">{label}</dt>
      <dd className="min-w-0 text-right font-semibold text-text break-words">{children}</dd>
    </div>
  )
}
