import React, { useEffect, useState } from 'react'
import {
  Play,
  Heart,
  ShieldCheck,
  Music,
  RotateCcw,
  Sparkles,
  Clock,
  Calendar,
  Building2,
  ArrowLeft,
} from 'lucide-react'
import { toast } from 'sonner'
import type { Game, SaveSnapshot } from '@/types/models'
import { formatPlaytime } from '@/features/library/utils/format'
import { listSaveSnapshots, restoreSaveSnapshot } from '@/services/save-manager'
import { useConsoleStore } from '../store/console-store'
import { CONSOLE_STRINGS } from '../i18n/strings'
import { FocusScope, useFocusable } from '../nav/FocusScope'
import { resolveConsoleMediaUrl } from '../ui/Tile'
import { Glyph } from '../ui/Glyph'

export interface GameHubViewProps {
  game: Game
  isRunning: boolean
  onBack: () => void
  onPlayOrResume: (game: Game) => void
  onToggleFavorite: (game: Game) => void
  onOpenMusicTab: () => void
}

export const GameHubView: React.FC<GameHubViewProps> = ({
  game,
  isRunning,
  onBack,
  onPlayOrResume,
  onToggleFavorite,
  onOpenMusicTab,
}) => {
  const lang = useConsoleStore((s) => s.language)
  const t = CONSOLE_STRINGS[lang]
  const [snapshots, setSnapshots] = useState<SaveSnapshot[]>([])
  const [restoringId, setRestoringId] = useState<string | null>(null)

  useEffect(() => {
    listSaveSnapshots(game.id)
      .then((list) => setSnapshots(list.slice(0, 5)))
      .catch(() => setSnapshots([]))
  }, [game.id])

  const playBtn = useFocusable<HTMLButtonElement>({
    id: 'hub_action_play',
    scopeId: 'console_game_hub',
    onConfirm: () => onPlayOrResume(game),
  })

  const favBtn = useFocusable<HTMLButtonElement>({
    id: 'hub_action_fav',
    scopeId: 'console_game_hub',
    onConfirm: () => onToggleFavorite(game),
  })

  const ostBtn = useFocusable<HTMLButtonElement>({
    id: 'hub_action_ost',
    scopeId: 'console_game_hub',
    onConfirm: onOpenMusicTab,
  })

  const backBtn = useFocusable<HTMLButtonElement>({
    id: 'hub_action_back',
    scopeId: 'console_game_hub',
    onConfirm: onBack,
  })

  const handleRestoreSnapshot = async (snap: SaveSnapshot) => {
    if (restoringId) return
    setRestoringId(snap.id)
    try {
      await restoreSaveSnapshot(game.id, snap.id)
      toast.success('Save snapshot restored safely via Save Guardian!')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to restore snapshot')
    } finally {
      setRestoringId(null)
    }
  }

  const backdrop = resolveConsoleMediaUrl(
    game.banner_path ?? game.background_path ?? game.cover_path,
  )
  const cover = resolveConsoleMediaUrl(game.cover_path)
  const score = game.opencritic_score ?? game.metacritic_score

  return (
    <FocusScope id="console_game_hub" orientation="vertical" className="space-y-8 pb-16">
      {/* Hero Banner */}
      <div className="relative rounded-3xl overflow-hidden border border-white/15 bg-slate-950 shadow-2xl">
        {backdrop && (
          <img
            src={backdrop}
            alt={game.name}
            className="absolute inset-0 w-full h-full object-cover opacity-35 filter blur-[2px] scale-105"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/80 to-slate-950/40" />

        <div className="relative z-10 p-8 md:p-10 flex flex-col md:flex-row gap-8 items-start md:items-end">
          {cover && (
            <img
              src={cover}
              alt={game.name}
              className="w-44 h-64 object-cover rounded-2xl border-2 border-white/15 shadow-2xl shrink-0"
            />
          )}

          <div className="flex-1 space-y-4">
            <div className="flex flex-wrap items-center gap-2.5">
              {game.genres.map((gn) => (
                <span
                  key={gn}
                  className="px-3 py-1 rounded-full bg-white/10 text-xs font-bold text-slate-200"
                >
                  {gn}
                </span>
              ))}
              {score && score > 0 ? (
                <span className="px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-xs font-extrabold flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5" />
                  Critic {score}
                </span>
              ) : null}
            </div>

            <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight">
              {game.name}
            </h1>

            <div className="flex flex-wrap items-center gap-6 text-sm text-slate-300">
              <span className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-cyan-400" />
                {formatPlaytime(game.total_playtime_seconds)}
              </span>
              {game.developer && (
                <span className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-violet-400" />
                  {game.developer}
                </span>
              )}
              {game.release_date && (
                <span className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-amber-400" />
                  {game.release_date}
                </span>
              )}
            </div>

            {game.description && (
              <p className="text-sm md:text-base text-slate-300/90 max-w-3xl leading-relaxed line-clamp-4">
                {game.description.replace(/<[^>]+>/g, '')}
              </p>
            )}

            {/* Primary Action Bar */}
            <div className="flex flex-wrap items-center gap-4 pt-3">
              <button
                type="button"
                {...playBtn.focusProps}
                className={`px-8 py-4 rounded-2xl font-extrabold text-base flex items-center gap-3 transition-all ${
                  playBtn.isFocused
                    ? 'bg-cyan-400 text-slate-950 scale-105 ring-4 ring-cyan-300/60 shadow-[0_0_35px_rgba(0,229,255,0.65)]'
                    : 'bg-cyan-500 text-slate-950'
                }`}
              >
                <Play className="w-5 h-5 fill-current" />
                <span>{isRunning ? t.actions.resume : t.actions.play}</span>
                <Glyph button="confirm" size="sm" />
              </button>

              <button
                type="button"
                {...favBtn.focusProps}
                className={`px-6 py-4 rounded-2xl font-bold text-sm flex items-center gap-2.5 border transition-all ${
                  favBtn.isFocused
                    ? 'bg-amber-400 text-slate-950 border-amber-300 scale-105'
                    : 'bg-white/10 text-slate-200 border-white/15'
                }`}
              >
                <Heart className={`w-4 h-4 ${game.is_favorite ? 'fill-current' : ''}`} />
                <span>{game.is_favorite ? t.actions.unfavorite : t.actions.favorite}</span>
              </button>

              <button
                type="button"
                {...ostBtn.focusProps}
                className={`px-6 py-4 rounded-2xl font-bold text-sm flex items-center gap-2.5 border transition-all ${
                  ostBtn.isFocused
                    ? 'bg-violet-400 text-slate-950 border-violet-300 scale-105'
                    : 'bg-white/10 text-slate-200 border-white/15'
                }`}
              >
                <Music className="w-4 h-4" />
                <span>{t.actions.ost}</span>
              </button>

              <button
                type="button"
                {...backBtn.focusProps}
                className={`px-5 py-4 rounded-2xl font-bold text-sm flex items-center gap-2 border transition-all ${
                  backBtn.isFocused
                    ? 'bg-white/25 text-white border-cyan-300 scale-105'
                    : 'bg-white/5 text-slate-300 border-white/10'
                }`}
              >
                <ArrowLeft className="w-4 h-4" />
                <span>{t.actions.back}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Save Guardian Snapshots Section */}
      <div className="p-6 rounded-3xl bg-white/5 border border-white/10 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-cyan-400" />
            <h2 className="text-xl font-extrabold text-white">{t.actions.saves}</h2>
          </div>
          <span className="text-xs text-slate-400 font-semibold">
            {snapshots.length} Recent Checkpoints
          </span>
        </div>

        {snapshots.length === 0 ? (
          <p className="text-sm text-slate-400">
            Save snapshots are captured automatically each time you exit the game.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {snapshots.map((snap) => (
              <SnapshotCard
                key={snap.id}
                snap={snap}
                busy={restoringId === snap.id}
                onRestore={() => {
                  void handleRestoreSnapshot(snap)
                }}
              />
            ))}
          </div>
        )}
      </div>
    </FocusScope>
  )
}

const SnapshotCard: React.FC<{
  snap: SaveSnapshot
  busy: boolean
  onRestore: () => void
}> = ({ snap, busy, onRestore }) => {
  const { focusProps, isFocused } = useFocusable<HTMLButtonElement>({
    id: `hub_snap_${snap.id}`,
    scopeId: 'console_game_hub',
    onConfirm: onRestore,
  })
  return (
    <button
      type="button"
      {...focusProps}
      disabled={busy}
      className={`p-4 rounded-2xl border text-left transition-all flex items-center justify-between ${
        isFocused
          ? 'bg-cyan-500/20 border-cyan-300 scale-[1.03] shadow-lg'
          : 'bg-slate-900/70 border-white/10'
      }`}
    >
      <div>
        <p className="text-sm font-bold text-white line-clamp-1">
          {snap.note || `Checkpoint ${snap.id.slice(0, 6)}`}
        </p>
        <p className="text-xs text-slate-400 mt-1">{snap.created_at}</p>
      </div>
      <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-cyan-300">
        <RotateCcw className="w-4 h-4" />
        Restore
      </span>
    </button>
  )
}
