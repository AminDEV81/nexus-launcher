import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Compass,
  Dices,
  Flame,
  Gamepad2,
  Play,
  RotateCw,
  Sparkles,
  Swords,
  Trophy,
  Clock,
  Check,
} from 'lucide-react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/modal'
import { ModalCloseButton } from '@/components/ui/modal-close-button'
import { cn } from '@/lib/utils'
import { assetUrl } from '@/lib/asset-url'
import { formatPlaytime } from '../utils/format'
import { useGames, useLaunchGame } from '../hooks/use-games'
import { useUiStore } from '@/store/ui-store'
import { playButtonClick } from '@/lib/sound-engine'
import type { Game } from '@/types/models'

interface SmartRouletteModalProps {
  open: boolean
  onClose: () => void
  games?: Game[]
}

type MoodFilterId = 'all' | 'action' | 'story_rpg' | 'chill' | 'backlog'

const MOOD_PRESETS: Array<{
  id: MoodFilterId
  label: string
  subtitle: string
  icon: typeof Flame
  keywords: string[]
}> = [
  {
    id: 'all',
    label: 'Any Vibe',
    subtitle: 'All eligible games',
    icon: Sparkles,
    keywords: [],
  },
  {
    id: 'action',
    label: 'High Adrenaline',
    subtitle: 'Shooter, Action, Fighting, Racing',
    icon: Swords,
    keywords: ['shooter', 'hack and slash', 'fighting', 'racing', 'arcade', 'action', 'tactical'],
  },
  {
    id: 'story_rpg',
    label: 'Deep Story & RPG',
    subtitle: 'RPG, Adventure, Strategy',
    icon: Flame,
    keywords: ['role-playing', 'rpg', 'adventure', 'strategy', 'turn-based', 'visual novel'],
  },
  {
    id: 'chill',
    label: 'Chill & Creative',
    subtitle: 'Indie, Puzzle, Platform, Sim',
    icon: Compass,
    keywords: ['indie', 'puzzle', 'platform', 'simulator', 'card', 'music', 'sport'],
  },
  {
    id: 'backlog',
    label: 'Unplayed Backlog',
    subtitle: 'Under 1 hour played',
    icon: Clock,
    keywords: [],
  },
]

export function SmartRouletteModal({ open, onClose, games: propGames }: SmartRouletteModalProps) {
  const { data: queryGames } = useGames()
  const games = useMemo(() => propGames ?? queryGames ?? [], [propGames, queryGames])
  const [mood, setMood] = useState<MoodFilterId>('all')
  const [onlyInstalled, setOnlyInstalled] = useState(true)
  const [isSpinning, setIsSpinning] = useState(false)
  const [reelIndex, setReelIndex] = useState(0)
  const [winner, setWinner] = useState<Game | null>(null)

  const selectGame = useUiStore((s) => s.selectGame)
  const launchGame = useLaunchGame()

  const pool = useMemo(() => {
    const visible = games.filter((g) => !g.is_hidden && !g.is_wishlist && !g.is_memory)
    const byInstall = onlyInstalled
      ? visible.filter((g) => g.is_installed)
      : visible
    const basePool = byInstall.length > 0 ? byInstall : visible

    if (mood === 'all') return basePool
    if (mood === 'backlog') {
      const unplayed = basePool.filter((g) => (g.total_playtime_seconds ?? 0) < 3600)
      return unplayed.length > 0 ? unplayed : basePool
    }

    const preset = MOOD_PRESETS.find((m) => m.id === mood)
    if (!preset || preset.keywords.length === 0) return basePool

    const matched = basePool.filter((g) => {
      const hay = `${g.name} ${(g.genres ?? []).join(' ')} ${g.description ?? ''}`.toLowerCase()
      return preset.keywords.some((kw) => hay.includes(kw))
    })
    return matched.length > 0 ? matched : basePool
  }, [games, mood, onlyInstalled])

  useEffect(() => {
    if (!open) {
      setIsSpinning(false)
      setWinner(null)
      return
    }
    if (pool.length > 0 && !winner && !isSpinning) {
      setWinner(pool[0])
    }
  }, [open, pool, winner, isSpinning])

  function handleSpin() {
    if (pool.length === 0 || isSpinning) return
    playButtonClick()
    setIsSpinning(true)

    const targetIdx = Math.floor(Math.random() * pool.length)
    const chosen = pool[targetIdx]
    let step = 0
    const totalSteps = 14

    const timer = window.setInterval(() => {
      step += 1
      setReelIndex((prev) => (prev + 1) % pool.length)
      if (step >= totalSteps) {
        window.clearInterval(timer)
        setReelIndex(targetIdx)
        setWinner(chosen)
        setIsSpinning(false)
      }
    }, 65)
  }

  const displayedGame = isSpinning ? (pool[reelIndex % Math.max(1, pool.length)] ?? winner) : winner
  const coverSrc = assetUrl(displayedGame?.cover_path)

  return (
    <Modal open={open} onClose={onClose} hideCloseButton widthClassName="max-w-xl">
      <div className="relative overflow-hidden bg-surface">
        {/* Header */}
        <div className="relative flex items-center justify-between border-b border-border/80 bg-gradient-to-r from-accent/15 via-surface-raised to-surface px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-2xl bg-accent text-white shadow-md ring-2 ring-accent/30">
              <Dices className={cn('size-5', isSpinning && 'animate-spin')} />
            </span>
            <div>
              <div className="font-mono text-[10px] font-black uppercase tracking-[0.2em] text-accent">
                AI MOOD MATCHER &amp; BACKLOG DECIDER
              </div>
              <h2 className="text-lg font-black tracking-tight text-text">
                Smart Game Roulette
              </h2>
            </div>
          </div>
          <ModalCloseButton onClick={onClose} />
        </div>

        <div className="flex flex-col gap-5 p-6">
          {/* Mood Selector Pills */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-subtle">
                1. Pick Your Current Mood ({pool.length} Matching Games)
              </span>
              <button
                type="button"
                onClick={() => setOnlyInstalled((v) => !v)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold transition-all cursor-pointer',
                  onlyInstalled
                    ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400'
                    : 'border-border bg-surface-raised text-muted hover:text-text',
                )}
              >
                <Check className="size-3" />
                <span>{onlyInstalled ? 'Installed Only' : 'All Library Games'}</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {MOOD_PRESETS.map((item) => {
                const Icon = item.icon
                const active = mood === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      playButtonClick()
                      setMood(item.id)
                    }}
                    className={cn(
                      'flex flex-col items-start gap-1 rounded-xl border p-2.5 text-left transition-all cursor-pointer',
                      active
                        ? 'border-accent bg-accent/15 ring-1 ring-accent shadow-xs'
                        : 'border-border/70 bg-surface-raised/60 hover:border-border hover:bg-surface-raised',
                    )}
                  >
                    <Icon className={cn('size-4', active ? 'text-accent' : 'text-subtle')} />
                    <div className="text-xs font-bold text-text leading-tight">{item.label}</div>
                    <div className="text-[9.5px] text-muted line-clamp-1">{item.subtitle}</div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Roulette Stage */}
          {displayedGame ? (
            <AnimatePresence mode="popLayout">
              <motion.div
                key={displayedGame.id}
                initial={{ opacity: 0.7, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.14 }}
                className="relative flex flex-col gap-4 overflow-hidden rounded-2xl border border-accent/40 bg-gradient-to-br from-surface-raised via-surface to-accent/10 p-4 shadow-md sm:flex-row sm:items-center"
              >
                <div className="relative h-36 w-27 shrink-0 overflow-hidden rounded-xl border border-border bg-surface shadow-md mx-auto sm:mx-0">
                  {coverSrc ? (
                    <img src={coverSrc} alt={displayedGame.name} className="size-full object-cover" />
                  ) : (
                    <div className="flex size-full items-center justify-center bg-surface-raised text-accent">
                      <Gamepad2 className="size-8" />
                    </div>
                  )}
                  {displayedGame.is_installed && (
                    <span className="absolute left-1.5 top-1.5 rounded bg-emerald-600/95 px-1.5 py-0.5 font-mono text-[8.5px] font-black uppercase text-white">
                      READY
                    </span>
                  )}
                </div>

                <div className="flex min-w-0 flex-1 flex-col justify-between gap-2 text-center sm:text-left">
                  <div>
                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1.5">
                      <span className="rounded-md border border-accent/35 bg-accent/15 px-2 py-0.5 font-mono text-[9.5px] font-black uppercase text-accent">
                        {isSpinning ? 'SPINNING REEL...' : 'TONIGHT’S PICK'}
                      </span>
                      {displayedGame.metacritic_score && (
                        <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/35 bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[9.5px] font-bold text-emerald-400">
                          <Trophy className="size-2.5" />
                          <span>{displayedGame.metacritic_score}</span>
                        </span>
                      )}
                    </div>

                    <h3 className="mt-1.5 truncate text-lg font-black text-text">
                      {displayedGame.name}
                    </h3>
                    <p className="mt-0.5 text-xs text-muted">
                      {(displayedGame.genres ?? []).slice(0, 3).join(' · ') || 'Action / Adventure'}{' '}
                      • {formatPlaytime(displayedGame.total_playtime_seconds ?? 0)} played
                    </p>
                  </div>

                  <p className="line-clamp-2 text-xs text-muted/90 leading-relaxed">
                    {displayedGame.description ||
                      'Selected by Nexus Smart Roulette based on your active mood filter and library history.'}
                  </p>
                </div>
              </motion.div>
            </AnimatePresence>
          ) : (
            <div className="rounded-2xl border border-dashed border-border p-8 text-center text-xs text-muted">
              No games in your library yet — add or scan games first!
            </div>
          )}

          {/* Action Footer */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-border/70 pt-3">
            <button
              type="button"
              onClick={handleSpin}
              disabled={pool.length === 0 || isSpinning}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-accent/50 bg-accent/15 px-4 py-2.5 text-xs font-extrabold text-accent transition-all hover:bg-accent hover:text-white active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              <RotateCw className={cn('size-4', isSpinning && 'animate-spin')} />
              <span>{isSpinning ? 'Spinning...' : 'Spin Again'}</span>
            </button>

            {displayedGame && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    selectGame(displayedGame.id)
                    onClose()
                  }}
                  className="rounded-xl border border-border bg-surface-raised px-4 py-2.5 text-xs font-bold text-text hover:border-accent/40 transition-all cursor-pointer"
                >
                  Inspect Details
                </button>

                {displayedGame.is_installed && (
                  <button
                    type="button"
                    onClick={() => {
                      launchGame.mutate(displayedGame.id)
                      toast.success(`Launching ${displayedGame.name}!`)
                      onClose()
                    }}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-extrabold text-white shadow-md hover:bg-emerald-500 active:scale-95 transition-all cursor-pointer"
                  >
                    <Play className="size-3.5 fill-current" />
                    <span>Play Now</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}
