import React, { useEffect, useState } from 'react'
import { Play, Heart, Music, RotateCcw, ArrowLeft } from 'lucide-react'
import { motion } from 'framer-motion'
import { useAnimationSpeed } from '@/hooks/use-animation-speed'
import { toast } from 'sonner'
import type { Game, SaveSnapshot } from '@/types/models'
import { formatPlaytime } from '@/features/library/utils/format'
import { listSaveSnapshots, restoreSaveSnapshot } from '@/services/save-manager'
import { useConsoleStore } from '../store/console-store'
import { CONSOLE_STRINGS } from '../i18n/strings'
import { FocusScope, useFocusable } from '../nav/FocusScope'

function formatSnapshotDate(raw: string): string {
  const d = new Date(raw)
  return Number.isNaN(d.getTime())
    ? raw
    : d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

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

  const speed = useAnimationSpeed()
  const score = game.opencritic_score ?? game.metacritic_score
  const meta = [
    game.genres.slice(0, 3).join(' · '),
    game.developer,
    game.release_date?.slice(0, 4),
    score && score > 0 ? `Critic ${score}` : null,
  ]
    .filter(Boolean)
    .join('   ·   ')
  const description = game.description?.replace(/<[^>]+>/g, '').trim()

  return (
    <FocusScope id="console_game_hub" orientation="vertical" className="flex flex-col gap-14 pb-16">
      <div className="flex max-w-[52rem] flex-col gap-5 pt-14">
        <p className="text-[0.95rem] font-medium tracking-wide text-white/55">{meta}</p>
        <h1 className="line-clamp-2 text-[4.6rem] font-semibold leading-[0.96] tracking-[-0.03em] text-white [text-shadow:0_4px_40px_rgba(0,0,0,0.45)]">
          {game.name}
        </h1>
        <p className="text-[1.05rem] text-white/60">
          {game.total_playtime_seconds > 0
            ? `${formatPlaytime(game.total_playtime_seconds)} played`
            : 'Not played yet'}
        </p>
        {description && (
          <p className="max-w-[40rem] line-clamp-3 text-[1.05rem] leading-relaxed text-white/55">
            {description}
          </p>
        )}

        <div className="mt-3 flex items-center gap-4">
          <motion.button
            type="button"
            {...playBtn.focusProps}
            animate={{ scale: playBtn.isFocused ? 1.07 : 1 }}
            transition={speed === 0 ? { duration: 0 } : SPRING}
            className={`flex items-center gap-3 rounded-full px-10 py-4 text-[1.15rem] font-semibold outline-none transition-[background-color,box-shadow] duration-200 ${
              playBtn.isFocused
                ? 'bg-white text-black shadow-[0_0_0_4px_rgba(255,255,255,0.28),0_18px_50px_-8px_var(--console-ambient,#7dd3fc)]'
                : 'bg-white/92 text-black/90'
            }`}
          >
            <Play className="size-[1.15rem] fill-current" />
            <span>{isRunning ? t.actions.resume : t.actions.play}</span>
          </motion.button>

          <HubIconAction
            focus={favBtn}
            label={game.is_favorite ? t.actions.unfavorite : t.actions.favorite}
            speed={speed}
          >
            <Heart className={`size-[1.35rem] ${game.is_favorite ? 'fill-current' : ''}`} />
          </HubIconAction>
          <HubIconAction focus={ostBtn} label={t.actions.ost} speed={speed}>
            <Music className="size-[1.35rem]" />
          </HubIconAction>
          <HubIconAction focus={backBtn} label={t.actions.back} speed={speed}>
            <ArrowLeft className="size-[1.35rem]" />
          </HubIconAction>
        </div>
      </div>

      {snapshots.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-[1.1rem] font-medium tracking-wide text-white/65">
            {t.actions.saves}
          </h2>
          <div className="flex flex-wrap gap-4">
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
        </section>
      )}
    </FocusScope>
  )
}

const SPRING = { type: 'spring', stiffness: 460, damping: 30, mass: 0.7 } as const

const HubIconAction: React.FC<{
  focus: { focusProps: Record<string, unknown>; isFocused: boolean }
  label: string
  speed: number
  children: React.ReactNode
}> = ({ focus, label, speed, children }) => (
  <div className="relative">
    <motion.button
      type="button"
      {...(focus.focusProps as React.ComponentProps<typeof motion.button>)}
      aria-label={label}
      animate={{ scale: focus.isFocused ? 1.1 : 1 }}
      transition={speed === 0 ? { duration: 0 } : SPRING}
      className={`flex size-[3.7rem] items-center justify-center rounded-full outline-none transition-colors duration-200 ${
        focus.isFocused ? 'bg-white text-black' : 'bg-white/12 text-white backdrop-blur-sm'
      }`}
    >
      {children}
    </motion.button>
    <span
      className={`pointer-events-none absolute left-1/2 top-full mt-3 -translate-x-1/2 whitespace-nowrap text-[0.85rem] font-medium text-white transition-opacity duration-200 ${
        focus.isFocused ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {label}
    </span>
  </div>
)

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
      className={`flex min-w-[17rem] items-center justify-between gap-6 rounded-2xl px-5 py-4 text-left outline-none transition-[background-color,color,transform] duration-200 ${
        isFocused ? 'scale-[1.04] bg-white text-black' : 'bg-white/8 text-white'
      }`}
    >
      <div>
        <p className="line-clamp-1 text-[1rem] font-semibold">
          {snap.label || `Checkpoint ${snap.id.slice(0, 6)}`}
        </p>
        <p className={`mt-0.5 text-[0.82rem] ${isFocused ? 'text-black/60' : 'text-white/45'}`}>
          {formatSnapshotDate(snap.created_at)}
        </p>
      </div>
      <RotateCcw className="size-[1.2rem] shrink-0" />
    </button>
  )
}
