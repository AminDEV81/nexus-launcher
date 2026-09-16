import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Copy, Check, Crown, Sparkles, Flame, Gamepad2 } from 'lucide-react'
import type { Profile, StatsSummary, GenrePlaytime } from '@/types/models'
import type { GamerLevelInfo } from '../utils/gamer-level'
import type { Milestone } from '../utils/milestones'
import { formatPlaytime } from '@/features/library/utils/format'
import { assetUrl } from '@/lib/asset-url'
import { cn } from '@/lib/utils'
import { ModalCloseButton } from '@/components/ui/modal'

interface GamerPassportModalProps {
  isOpen: boolean
  onClose: () => void
  profile: Profile | null
  levelInfo: GamerLevelInfo
  summary: StatsSummary | undefined
  topGenre: GenrePlaytime | undefined
  streak: number
  milestones: Milestone[]
}

export function GamerPassportModal({
  isOpen,
  onClose,
  profile,
  levelInfo,
  summary,
  topGenre,
  streak,
  milestones,
}: GamerPassportModalProps) {
  const [copied, setCopied] = useState(false)
  const unlockedCount = milestones.filter((m) => m.unlocked).length

  function handleCopy() {
    const cardText = [
      `🎮 NEXUS GAMER PASSPORT 🎮`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `👤 Operative: ${profile?.name ?? 'Player 1'}`,
      `⭐ Rank: Level ${levelInfo.level} — ${levelInfo.rankTitle}`,
      `⏱️ Total Playtime: ${formatPlaytime(summary?.total_playtime_seconds ?? 0)}`,
      `🔥 Active Streak: ${streak} Days`,
      `🏆 Top Champion: ${summary?.most_played_game?.name ?? 'None'}`,
      `🎨 Top Genre: ${topGenre?.genre ?? 'Unassigned'}`,
      `🎖️ Milestones: ${unlockedCount} / ${milestones.length} Unlocked`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `Logged with Nexus Launcher`,
    ].join('\n')

    void navigator.clipboard.writeText(cardText).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/80 backdrop-blur-md"
        />

        {/* Modal Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 12 }}
          transition={{ type: 'spring', damping: 26, stiffness: 350 }}
          className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-accent/40 bg-surface/95 p-6 shadow-2xl backdrop-blur-xl sm:p-8"
        >
          {/* Cyber Ambient Background Lights */}
          <div className="pointer-events-none absolute -left-16 -top-16 size-48 rounded-full bg-accent/20 blur-3xl" />
          <div className="pointer-events-none absolute -right-16 -bottom-16 size-48 rounded-full bg-accent/25 blur-3xl" />

          {/* Close button */}
          <ModalCloseButton
            onClick={onClose}
            aria-label="Close passport"
            className="absolute right-5 top-5"
          />

          {/* Header */}
          <div className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-accent">
            <Sparkles className="size-3.5" />
            Nexus Identity Matrix
          </div>
          <h2 className="mt-1 text-2xl font-black tracking-tight text-text">
            Digital Gamer Passport
          </h2>
          <p className="mt-1 text-xs text-muted">
            Official telemetry identity and performance credentials for this profile.
          </p>

          {/* The Holographic ID Card */}
          <div className="relative mt-6 overflow-hidden rounded-2xl border border-accent/40 bg-gradient-to-br from-surface to-surface-raised p-5 shadow-xl ring-1 ring-inset ring-white/10">
            {/* Top Bar inside Card */}
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div className="flex items-center gap-3">
                {/* Profile Color Dot / Badge */}
                <div
                  className="flex size-11 items-center justify-center rounded-xl font-mono text-sm font-black text-white shadow-md ring-2 ring-white/20"
                  style={{ backgroundColor: profile?.color || 'var(--color-accent)' }}
                >
                  {profile?.name?.slice(0, 2).toUpperCase() || 'P1'}
                </div>
                <div>
                  <div className="text-base font-black text-text">
                    {profile?.name || 'Main Player'}
                  </div>
                  <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold text-accent">
                    <Crown className="size-3" />
                    <span>{levelInfo.rankTitle}</span>
                  </div>
                </div>
              </div>

              {/* Level Badge */}
              <div className="flex flex-col items-end">
                <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-subtle">
                  OPERATIVE TIER
                </span>
                <span className="font-mono text-xl font-black text-accent">
                  LVL {levelInfo.level}
                </span>
              </div>
            </div>

            {/* XP Progress Bar */}
            <div className="mt-3.5 flex flex-col gap-1.5">
              <div className="flex items-center justify-between font-mono text-[10px] font-bold text-subtle">
                <span>XP PROGRESSION</span>
                <span>{levelInfo.progressPercent}% to next rank</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-surface">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${levelInfo.progressPercent}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                  className="h-full rounded-full bg-gradient-to-r from-accent to-accent-hover shadow-[0_0_8px_var(--nx-accent)]"
                />
              </div>
            </div>

            {/* Stats Metrics Matrix */}
            <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <div className="rounded-xl border border-border/60 bg-surface/70 p-2.5 text-center">
                <span className="block font-mono text-[9px] font-bold uppercase text-subtle">
                  Playtime
                </span>
                <span className="mt-0.5 block font-mono text-sm font-black text-text">
                  {levelInfo.totalHours}h
                </span>
              </div>

              <div className="rounded-xl border border-border/60 bg-surface/70 p-2.5 text-center">
                <span className="block font-mono text-[9px] font-bold uppercase text-subtle">
                  Streak
                </span>
                <span className="mt-0.5 flex items-center justify-center gap-1 font-mono text-sm font-black text-amber-500">
                  <Flame className="size-3.5 fill-current" />
                  {streak}d
                </span>
              </div>

              <div className="rounded-xl border border-border/60 bg-surface/70 p-2.5 text-center">
                <span className="block font-mono text-[9px] font-bold uppercase text-subtle">
                  Library
                </span>
                <span className="mt-0.5 block font-mono text-sm font-black text-text">
                  {summary?.total_games ?? 0}
                </span>
              </div>

              <div className="rounded-xl border border-border/60 bg-surface/70 p-2.5 text-center">
                <span className="block font-mono text-[9px] font-bold uppercase text-subtle">
                  Trophies
                </span>
                <span className="mt-0.5 block font-mono text-sm font-black text-accent">
                  {unlockedCount} / {milestones.length}
                </span>
              </div>
            </div>

            {/* Favorite Champion Game */}
            {summary?.most_played_game && (
              <div className="mt-3 flex items-center gap-3 rounded-xl border border-border/60 bg-surface/70 p-2.5">
                <span className="relative flex h-10 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/80 bg-surface">
                  {summary.most_played_game.cover_path ? (
                    <img
                      src={assetUrl(summary.most_played_game.cover_path) ?? ''}
                      alt=""
                      className="size-full object-cover"
                    />
                  ) : (
                    <Gamepad2 className="size-4 text-accent" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <span className="block font-mono text-[9px] font-bold uppercase text-accent">
                    Top Champion Game
                  </span>
                  <span className="block truncate text-xs font-bold text-text">
                    {summary.most_played_game.name}
                  </span>
                </div>
                <span className="font-mono text-[11px] font-bold text-muted">
                  {formatPlaytime(summary.most_played_game.total_playtime_seconds)}
                </span>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="mt-6 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-border/80 px-4 py-2.5 text-xs font-semibold text-muted transition-colors hover:bg-surface-raised hover:text-text"
            >
              Close
            </button>

            <button
              type="button"
              onClick={handleCopy}
              className={cn(
                'flex items-center gap-2 rounded-xl px-5 py-2.5 font-mono text-xs font-bold text-white shadow-lg transition-all active:scale-95',
                copied
                  ? 'bg-emerald-600 shadow-emerald-500/20'
                  : 'bg-accent hover:bg-accent-hover shadow-accent/25 hover:shadow-accent/40',
              )}
            >
              {copied ? (
                <>
                  <Check className="size-4" />
                  <span>Card Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="size-4" />
                  <span>Copy Gamer Bio</span>
                </>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
