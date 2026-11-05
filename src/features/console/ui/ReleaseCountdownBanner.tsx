import React, { useEffect, useState } from 'react'
import { CalendarDays, Clock, Sparkles, Bookmark } from 'lucide-react'
import { formatReleaseDate, isGameUnreleased } from '@/features/library/utils/format'
import { useWindowActive } from '@/hooks/use-window-active'

export function parseReleaseTargetMs(releaseDate: string | null | undefined): number {
  if (!releaseDate) return 0
  const trimmed = releaseDate.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [year, month, day] = trimmed.split('-').map(Number)
    return new Date(year, month - 1, day).getTime()
  }
  const parsed = new Date(trimmed)
  return !Number.isNaN(parsed.getTime()) ? parsed.getTime() : 0
}

export function formatCompactCountdown(
  releaseDate: string | null | undefined,
  nowMs = Date.now(),
): string | null {
  if (!releaseDate || !isGameUnreleased(releaseDate)) return null
  const targetMs = parseReleaseTargetMs(releaseDate)
  if (targetMs <= 0) return `TBA (${releaseDate})`
  const diffSec = Math.max(0, Math.floor((targetMs - nowMs) / 1000))
  if (diffSec <= 0) return 'Releasing Today'
  const days = Math.floor(diffSec / 86400)
  const hours = Math.floor((diffSec % 86400) / 3600)
  const mins = Math.floor((diffSec % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h ${mins}m`
  return `${hours}h ${mins}m`
}

export interface ReleaseCountdownBannerProps {
  releaseDate: string | null | undefined
  isWishlist?: boolean
  isLight?: boolean
  compact?: boolean
}

export const ReleaseCountdownBanner: React.FC<ReleaseCountdownBannerProps> = ({
  releaseDate,
  isWishlist = false,
  isLight = false,
  compact = false,
}) => {
  const windowActive = useWindowActive()
  const [now, setNow] = useState(() => Date.now())

  const unreleased = isGameUnreleased(releaseDate ?? null)

  useEffect(() => {
    if (!windowActive || !unreleased) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [windowActive, unreleased])

  if (!unreleased && !isWishlist) return null

  const targetMs = parseReleaseTargetMs(releaseDate)
  const remainingMs = Math.max(0, targetMs - now)
  const totalSeconds = Math.floor(remainingMs / 1000)

  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  // If in wishlist and already released, show a clean Wishlist Release status pill
  if (!unreleased && isWishlist) {
    return (
      <div
        className={`flex items-center justify-between gap-4 rounded-2xl border px-5 py-3.5 ${
          isLight
            ? 'border-emerald-300 bg-emerald-50 text-slate-900'
            : 'border-emerald-400/40 bg-emerald-500/15 text-white'
        }`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`flex size-10 items-center justify-center rounded-xl ${
              isLight ? 'bg-emerald-100 text-emerald-700' : 'bg-emerald-400/20 text-emerald-300'
            }`}
          >
            <Sparkles className="size-5" />
          </div>
          <div>
            <div
              className={`text-xs font-black uppercase tracking-wider ${
                isLight ? 'text-emerald-800' : 'text-emerald-400'
              }`}
            >
              Wishlisted Title · Released &amp; Available Now
            </div>
            <div className="text-xs opacity-80">
              Released on {releaseDate ? formatReleaseDate(releaseDate) : 'PC'}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Unreleased without exact YYYY-MM-DD (e.g. "2026" or "TBA")
  if (targetMs <= 0) {
    return (
      <div
        className={`flex items-center justify-between gap-4 rounded-2xl border px-5 py-4 ${
          isLight
            ? 'border-amber-300 bg-amber-50 text-slate-900'
            : 'border-amber-400/40 bg-gradient-to-r from-amber-500/15 via-slate-900/80 to-slate-950 text-white'
        }`}
      >
        <div className="flex items-center gap-3.5">
          <div
            className={`flex size-11 items-center justify-center rounded-xl ${
              isLight ? 'bg-amber-100 text-amber-700' : 'bg-amber-400/20 text-amber-300'
            }`}
          >
            <Clock className="size-5" />
          </div>
          <div>
            <div
              className={`text-xs font-extrabold uppercase tracking-widest ${
                isLight ? 'text-amber-800' : 'text-amber-400'
              }`}
            >
              Upcoming Release · Countdown Active
            </div>
            <div className="text-base font-black mt-0.5">
              Expected Launch Window: {releaseDate || 'TBA'}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const segments = [
    { label: 'Days', value: days },
    { label: 'Hours', value: hours },
    { label: 'Mins', value: minutes },
    { label: 'Secs', value: seconds },
  ]

  return (
    <div
      className={`overflow-hidden rounded-3xl border p-5 shadow-xl ${
        isLight
          ? 'border-indigo-200 bg-gradient-to-r from-indigo-50/90 via-white to-sky-50/90 text-slate-900'
          : 'border-cyan-400/40 bg-gradient-to-r from-cyan-500/15 via-[#0e172c] to-violet-500/15 text-white'
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div
            className={`inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider ${
              isLight ? 'text-indigo-700' : 'text-cyan-400'
            }`}
          >
            <span
              className={`size-2 rounded-full animate-ping ${
                isLight ? 'bg-indigo-600' : 'bg-cyan-400'
              }`}
            />
            <CalendarDays className="size-4" />
            <span>Live Release Countdown</span>
            {isWishlist && (
              <span
                className={`ml-1 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-black ${
                  isLight
                    ? 'bg-amber-100 border-amber-300 text-amber-800'
                    : 'bg-amber-400/20 border-amber-400/40 text-amber-300'
                }`}
              >
                <Bookmark className="size-3 fill-current" />
                Wishlisted
              </span>
            )}
          </div>
          <div className={`text-sm font-bold ${isLight ? 'text-slate-700' : 'text-slate-200'}`}>
            Official Launch Date:{' '}
            <span className={`font-black ${isLight ? 'text-indigo-700' : 'text-cyan-300'}`}>
              {releaseDate ? formatReleaseDate(releaseDate) : 'Upcoming'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2.5 sm:min-w-[20rem]">
          {segments.map((seg, idx) => {
            const isSec = idx === 3
            return (
              <div
                key={seg.label}
                className={`flex flex-col items-center justify-center rounded-2xl border px-3 py-2 text-center ${
                  isSec
                    ? isLight
                      ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                      : 'border-cyan-400/50 bg-cyan-400/15 text-cyan-300'
                    : isLight
                      ? 'border-slate-300 bg-white text-slate-900 shadow-2xs'
                      : 'border-white/15 bg-slate-950/75 text-white'
                }`}
              >
                <span
                  className={`font-mono font-black tabular-nums leading-tight ${
                    compact ? 'text-lg' : 'text-2xl'
                  }`}
                >
                  {String(seg.value).padStart(2, '0')}
                </span>
                <span className="text-[10px] font-extrabold uppercase tracking-widest opacity-75">
                  {seg.label}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
