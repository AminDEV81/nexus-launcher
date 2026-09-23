import { Sparkles, RotateCcw, Clock, Calendar, Star, Gamepad2, Award } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { CoverMedia } from '@/components/ui/cover-media'
import { assetUrl } from '@/lib/asset-url'
import { formatRelativeDate } from '@/features/library/utils/format'
import { playButtonClick } from '@/lib/sound-engine'
import type { Game } from '@/types/models'

interface RestoreFromMemoryModalProps {
  game: Game | null
  open: boolean
  onClose: () => void
  onRestore: (game: Game) => void
  isPending?: boolean
}

export function RestoreFromMemoryModal({
  game,
  open,
  onClose,
  onRestore,
  isPending = false,
}: RestoreFromMemoryModalProps) {
  if (!game) return null

  const coverSrc = assetUrl(game.cover_path)
  const releaseYear = game.release_date ? game.release_date.split('-')[0] : null
  const playtimeHours = (game.total_playtime_seconds / 3600).toFixed(1)

  return (
    <Modal open={open} onClose={onClose} widthClassName="max-w-lg">
      <div className="relative overflow-hidden bg-surface p-6 sm:p-7">
        {/* Ambient Amber Memory Glow */}
        <div className="pointer-events-none absolute -top-16 -right-16 size-56 rounded-full bg-amber-500/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-16 size-48 rounded-full bg-accent/10 blur-3xl" />

        {/* Top Header */}
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-amber-400/40 bg-amber-500/20 text-amber-400 shadow-md shadow-amber-500/10">
              <Sparkles className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 font-mono text-[10px] font-black uppercase tracking-wider text-amber-400">
                <span>MEMORY VAULT RECOVERY</span>
              </div>
              <h3 className="text-base font-black tracking-tight text-text">
                Game Found in Memory!
              </h3>
            </div>
          </div>

          <span className="flex items-center gap-1 rounded-full border border-amber-400/40 bg-black/60 px-2.5 py-1 text-[10px] font-black tracking-wider text-amber-300 shadow-xs">
            <Award className="size-3 text-amber-400" />
            <span>ARCHIVED</span>
          </span>
        </div>

        {/* Showcase Poster Card */}
        <div className="mb-5 flex flex-col sm:flex-row items-center sm:items-start gap-4 rounded-2xl border border-amber-500/25 bg-gradient-to-br from-amber-500/10 via-surface-raised/80 to-surface p-4 shadow-sm">
          {/* Cover Media 3:4 Aspect Poster */}
          <div className="relative aspect-3/4 w-28 shrink-0 overflow-hidden rounded-xl border border-white/15 bg-black/50 shadow-md">
            {coverSrc ? (
              <CoverMedia
                src={coverSrc}
                className="size-full object-cover"
                isAnimated={game.cover_is_animated}
                animatedEnabled={game.animated_cover_enabled}
              />
            ) : (
              <div className="flex size-full flex-col items-center justify-center gap-2 p-2 text-center text-subtle">
                <Gamepad2 className="size-8 text-amber-400/40" />
                <span className="text-[10px] font-bold line-clamp-2">{game.name}</span>
              </div>
            )}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          </div>

          {/* Game Dossier Details */}
          <div className="flex min-w-0 flex-1 flex-col justify-between self-stretch text-center sm:text-left">
            <div>
              <div className="flex items-center justify-center sm:justify-start gap-2">
                <h4 className="truncate text-base font-black text-text" title={game.name}>
                  {game.name}
                </h4>
                {releaseYear && (
                  <span className="rounded-md border border-border/70 bg-surface px-1.5 py-0.5 font-mono text-[10px] font-bold text-muted">
                    {releaseYear}
                  </span>
                )}
              </div>
              {game.developer && (
                <p className="truncate text-xs font-semibold text-subtle mt-0.5">
                  {game.developer}
                </p>
              )}
            </div>

            {/* Preserved Stats Pill Grid */}
            <div className="my-2.5 grid grid-cols-2 gap-2 text-left">
              <div className="flex items-center gap-2 rounded-xl border border-border/80 bg-surface/80 p-2">
                <Clock className="size-3.5 text-cyan-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-[9px] text-muted">Playtime Preserved</div>
                  <div className="truncate font-mono text-xs font-bold text-text">
                    {playtimeHours} hrs
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 rounded-xl border border-border/80 bg-surface/80 p-2">
                <Calendar className="size-3.5 text-amber-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-[9px] text-muted">Last Played</div>
                  <div className="truncate text-xs font-bold text-text">
                    {game.last_played_at ? formatRelativeDate(game.last_played_at) : 'Never'}
                  </div>
                </div>
              </div>
            </div>

            {game.user_rating !== null && (
              <div className="flex items-center justify-center sm:justify-start gap-1.5 text-xs text-subtle">
                <span className="text-[11px]">Your rating:</span>
                <span className="flex items-center gap-0.5 font-mono font-bold text-amber-400">
                  <Star className="size-3 fill-amber-400" />
                  {game.user_rating}/10
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Narrative Callout */}
        <div className="mb-6 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs leading-relaxed text-subtle">
          <p>
            You previously removed <strong className="text-text font-bold">{game.name}</strong> from
            your library, but its records and play history were securely archived in your{' '}
            <strong className="text-amber-400 font-semibold">Memory Vault</strong>.
          </p>
          <p className="mt-1.5 text-text/90 font-medium">
            Would you like to restore this game back to your active library?
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => {
              playButtonClick()
              onClose()
            }}
            disabled={isPending}
            className="rounded-xl border border-border/80 bg-surface-raised px-4 py-2 text-xs font-semibold text-subtle transition-all hover:bg-surface hover:text-text active:scale-95 cursor-pointer disabled:opacity-50"
          >
            Keep in Memory
          </button>
          <button
            type="button"
            onClick={() => {
              playButtonClick()
              onRestore(game)
            }}
            disabled={isPending}
            className="inline-flex items-center gap-2 rounded-xl border border-amber-400/40 bg-gradient-to-r from-amber-500 to-amber-600 px-5 py-2 text-xs font-black text-black shadow-lg shadow-amber-500/20 transition-all hover:from-amber-400 hover:to-amber-500 hover:scale-102 active:scale-95 disabled:pointer-events-none disabled:opacity-50 cursor-pointer"
          >
            <RotateCcw className="size-3.5" />
            <span>{isPending ? 'Restoring…' : 'Restore to Library'}</span>
          </button>
        </div>
      </div>
    </Modal>
  )
}
