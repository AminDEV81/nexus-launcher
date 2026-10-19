import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Check,
  Copy,
  Download,
  Image as ImageIcon,
  Loader2,
  Moon,
  Palette,
  Share2,
  Sparkles,
  Sun,
} from 'lucide-react'
import { toast } from 'sonner'
import type { Profile, StatsSummary, GenrePlaytime } from '@/types/models'
import type { CircadianHabits, GamerLevelInfo } from '../utils/gamer-level'
import type { Milestone } from '../utils/milestones'
import { formatPlaytime } from '@/features/library/utils/format'
import { assetUrl } from '@/lib/asset-url'
import { cn } from '@/lib/utils'
import { ModalCloseButton } from '@/components/ui/modal'
import { playButtonClick } from '@/lib/sound-engine'

interface GenreHourItem {
  genre: string
  total_seconds: number
  game_count: number
  hours: number
}

interface GamerPassportModalProps {
  isOpen: boolean
  onClose: () => void
  profile: Profile | null
  levelInfo: GamerLevelInfo
  summary: StatsSummary | undefined
  topGenre: GenrePlaytime | undefined
  genres?: GenreHourItem[]
  streak: number
  milestones: Milestone[]
  habits?: CircadianHabits
  completionRate?: number
  avgSessionMins?: number
  recentHours?: number
  playedCount?: number
  totalGamesCount?: number
}

type ShareCardThemeId =
  | 'cyber_violet'
  | 'crimson_gold'
  | 'emerald_matrix'
  | 'obsidian_gold'
  | 'sunset_synth'
  | 'arctic_Light'
  | 'sakura_light'
  | 'pearl_daylight'

interface ShareCardTheme {
  id: ShareCardThemeId
  label: string
  isLight: boolean
  swatch: string
  bgStart: string
  bgMid: string
  bgEnd: string
  primary: string
  secondary: string
  accentGlow: string
  cardBg: string
  cardBorder: string
}

const SHARE_THEMES: ShareCardTheme[] = [
  // ── DARK MODE PALETTES ──
  {
    id: 'cyber_violet',
    label: 'Cyber Neon',
    isLight: false,
    swatch: '#8b5cf6',
    bgStart: '#070711',
    bgMid: '#0f0d26',
    bgEnd: '#091326',
    primary: '#8b5cf6',
    secondary: '#38bdf8',
    accentGlow: 'rgba(139, 92, 246, 0.35)',
    cardBg: 'rgba(19, 19, 38, 0.88)',
    cardBorder: 'rgba(139, 92, 246, 0.40)',
  },
  {
    id: 'crimson_gold',
    label: 'Apex Crimson',
    isLight: false,
    swatch: '#f43f5e',
    bgStart: '#0d0609',
    bgMid: '#1f0b14',
    bgEnd: '#171008',
    primary: '#f43f5e',
    secondary: '#f59e0b',
    accentGlow: 'rgba(244, 63, 94, 0.35)',
    cardBg: 'rgba(30, 14, 22, 0.88)',
    cardBorder: 'rgba(244, 63, 94, 0.40)',
  },
  {
    id: 'emerald_matrix',
    label: 'Emerald Matrix',
    isLight: false,
    swatch: '#10b981',
    bgStart: '#050d0b',
    bgMid: '#09201b',
    bgEnd: '#071624',
    primary: '#10b981',
    secondary: '#06b6d4',
    accentGlow: 'rgba(16, 185, 129, 0.35)',
    cardBg: 'rgba(11, 29, 25, 0.88)',
    cardBorder: 'rgba(16, 185, 129, 0.40)',
  },
  {
    id: 'obsidian_gold',
    label: 'Royal Gold',
    isLight: false,
    swatch: '#eab308',
    bgStart: '#0a0906',
    bgMid: '#181409',
    bgEnd: '#12100e',
    primary: '#eab308',
    secondary: '#f97316',
    accentGlow: 'rgba(234, 179, 8, 0.32)',
    cardBg: 'rgba(26, 22, 14, 0.90)',
    cardBorder: 'rgba(234, 179, 8, 0.42)',
  },
  {
    id: 'sunset_synth',
    label: 'Synthwave',
    isLight: false,
    swatch: '#ec4899',
    bgStart: '#0c0517',
    bgMid: '#220b34',
    bgEnd: '#1b0c24',
    primary: '#ec4899',
    secondary: '#a855f7',
    accentGlow: 'rgba(236, 72, 153, 0.35)',
    cardBg: 'rgba(32, 14, 48, 0.88)',
    cardBorder: 'rgba(236, 72, 153, 0.40)',
  },
  // ── LIGHT MODE PALETTES ──
  {
    id: 'pearl_daylight',
    label: 'Daylight Pro',
    isLight: true,
    swatch: '#4f46e5',
    bgStart: '#f8fafc',
    bgMid: '#eef2ff',
    bgEnd: '#f1f5f9',
    primary: '#4f46e5',
    secondary: '#0284c7',
    accentGlow: 'rgba(79, 70, 229, 0.16)',
    cardBg: 'rgba(255, 255, 255, 0.94)',
    cardBorder: 'rgba(79, 70, 229, 0.28)',
  },
  {
    id: 'arctic_Light',
    label: 'Arctic Frost',
    isLight: true,
    swatch: '#0ea5e9',
    bgStart: '#f0f9ff',
    bgMid: '#e0f2fe',
    bgEnd: '#f8fafc',
    primary: '#0284c7',
    secondary: '#0d9488',
    accentGlow: 'rgba(2, 132, 199, 0.16)',
    cardBg: 'rgba(255, 255, 255, 0.94)',
    cardBorder: 'rgba(2, 132, 199, 0.28)',
  },
  {
    id: 'sakura_light',
    label: 'Sakura Daylight',
    isLight: true,
    swatch: '#e11d48',
    bgStart: '#fff1f2',
    bgMid: '#ffe4e6',
    bgEnd: '#fdf2f8',
    primary: '#e11d48',
    secondary: '#9333ea',
    accentGlow: 'rgba(225, 29, 72, 0.15)',
    cardBg: 'rgba(255, 255, 255, 0.94)',
    cardBorder: 'rgba(225, 29, 72, 0.28)',
  },
]

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

function truncateCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  let out = text
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) {
    out = out.slice(0, -1)
  }
  return `${out}…`
}

export function GamerPassportModal({
  isOpen,
  onClose,
  profile,
  levelInfo,
  summary,
  topGenre,
  genres = [],
  streak,
  milestones,
  habits,
  completionRate = 0,
  avgSessionMins = 0,
  recentHours = 0,
  playedCount = 0,
  totalGamesCount = 0,
}: GamerPassportModalProps) {
  const [themeId, setThemeId] = useState<ShareCardThemeId>(() => {
    const isLightApp = document.documentElement.getAttribute('data-theme') === 'light'
    return isLightApp ? 'pearl_daylight' : 'cyber_violet'
  })
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null)
  const [isRendering, setIsRendering] = useState(false)
  const [copiedImage, setCopiedImage] = useState(false)
  const [copiedText, setCopiedText] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const unlockedMilestones = milestones.filter((m) => m.unlocked)
  const unlockedCount = unlockedMilestones.length
  const activeTheme = SHARE_THEMES.find((t) => t.id === themeId) ?? SHARE_THEMES[0]

  const renderShareStatsCanvas = useCallback(async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    setIsRendering(true)

    const W = 1600
    const H = 1000
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      setIsRendering(false)
      return
    }

    const isLight = activeTheme.isLight
    const textMain = isLight ? '#0f172a' : '#ffffff'
    const textSub = isLight ? '#475569' : '#94a3b8'
    const textMuted = isLight ? '#334155' : '#cbd5e1'
    const trackBg = isLight ? 'rgba(15, 23, 42, 0.08)' : 'rgba(255, 255, 255, 0.08)'
    const subtleBoxBg = isLight ? 'rgba(15, 23, 42, 0.035)' : 'rgba(255, 255, 255, 0.045)'
    const subtleBoxBorder = isLight ? 'rgba(15, 23, 42, 0.10)' : 'rgba(255, 255, 255, 0.10)'

    // Load cover image if available
    const champCoverUrl = summary?.most_played_game?.cover_path
      ? assetUrl(summary.most_played_game.cover_path)
      : null
    let loadedCover: HTMLImageElement | null = null
    if (champCoverUrl) {
      loadedCover = await new Promise<HTMLImageElement | null>((resolve) => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => resolve(img)
        img.onerror = () => resolve(null)
        img.src = champCoverUrl
      })
    }

    // 1. Deep Multi-Stop Background Gradient
    const bgGrad = ctx.createLinearGradient(0, 0, W, H)
    bgGrad.addColorStop(0, activeTheme.bgStart)
    bgGrad.addColorStop(0.52, activeTheme.bgMid)
    bgGrad.addColorStop(1, activeTheme.bgEnd)
    ctx.fillStyle = bgGrad
    ctx.fillRect(0, 0, W, H)

    // 2. Ambient Volumetric Glow Orbs
    const glowTopRight = ctx.createRadialGradient(W - 220, 140, 20, W - 220, 140, 520)
    glowTopRight.addColorStop(0, activeTheme.accentGlow)
    glowTopRight.addColorStop(1, 'transparent')
    ctx.fillStyle = glowTopRight
    ctx.fillRect(0, 0, W, H)

    const glowBottomLeft = ctx.createRadialGradient(260, H - 120, 20, 260, H - 120, 480)
    glowBottomLeft.addColorStop(0, activeTheme.accentGlow)
    glowBottomLeft.addColorStop(1, 'transparent')
    ctx.fillStyle = glowBottomLeft
    ctx.fillRect(0, 0, W, H)

    // 3. Subtle Cyber Telemetry Grid
    ctx.strokeStyle = isLight ? 'rgba(15, 23, 42, 0.04)' : 'rgba(255, 255, 255, 0.035)'
    ctx.lineWidth = 1
    for (let x = 0; x < W; x += 40) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, H)
      ctx.stroke()
    }
    for (let y = 0; y < H; y += 40) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(W, y)
      ctx.stroke()
    }

    // 4. Outer Frame Border
    drawRoundedRect(ctx, 28, 28, W - 56, H - 56, 32)
    ctx.strokeStyle = activeTheme.cardBorder
    ctx.lineWidth = 2.5
    ctx.stroke()

    // ── TOP HEADER BAR (y: 56..165) ──────────────────────────────────────
    const operativeName = profile?.name || 'NEXUS OPERATIVE'
    drawRoundedRect(ctx, 68, 60, 46, 46, 14)
    const badgeGrad = ctx.createLinearGradient(68, 60, 114, 106)
    badgeGrad.addColorStop(0, activeTheme.primary)
    badgeGrad.addColorStop(1, activeTheme.secondary)
    ctx.fillStyle = badgeGrad
    ctx.fill()

    ctx.fillStyle = '#ffffff'
    ctx.font = '900 22px system-ui, -apple-system, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('NX', 91, 91)

    ctx.textAlign = 'left'
    ctx.fillStyle = activeTheme.primary
    ctx.font = '800 13px monospace'
    ctx.fillText('NEXUS LAUNCHER // OFFICIAL PLAYTIME & TELEMETRY STATE CARD', 130, 77)

    ctx.fillStyle = textMain
    ctx.font = '900 34px system-ui, -apple-system, sans-serif'
    ctx.fillText(operativeName, 130, 114)

    // Right Header Timestamp & Verification Pill
    const dateLabel = new Date().toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
    drawRoundedRect(ctx, W - 360, 64, 292, 54, 16)
    ctx.fillStyle = activeTheme.cardBg
    ctx.fill()
    ctx.strokeStyle = activeTheme.cardBorder
    ctx.lineWidth = 1.5
    ctx.stroke()

    ctx.fillStyle = '#10b981'
    ctx.beginPath()
    ctx.arc(W - 332, 91, 6, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = textMain
    ctx.font = '800 14px monospace'
    ctx.fillText(`VERIFIED STATE • ${dateLabel.toUpperCase()}`, W - 314, 96)

    // Divider line
    ctx.strokeStyle = subtleBoxBorder
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(68, 144)
    ctx.lineTo(W - 68, 144)
    ctx.stroke()

    // ── LEFT COLUMN: RPG LEVEL RING & CIRCADIAN PERSONA (x: 68..520, y: 170..565) ──
    drawRoundedRect(ctx, 68, 170, 450, 395, 26)
    ctx.fillStyle = activeTheme.cardBg
    ctx.fill()
    ctx.strokeStyle = activeTheme.cardBorder
    ctx.lineWidth = 1.5
    ctx.stroke()

    const ringCx = 185
    const ringCy = 305
    const ringR = 82

    ctx.beginPath()
    ctx.arc(ringCx, ringCy, ringR, 0, Math.PI * 2)
    ctx.strokeStyle = trackBg
    ctx.lineWidth = 14
    ctx.stroke()

    const startAngle = -Math.PI / 2
    const endAngle = startAngle + (Math.PI * 2 * Math.max(4, levelInfo.progressPercent)) / 100
    const ringGrad = ctx.createLinearGradient(
      ringCx - ringR,
      ringCy - ringR,
      ringCx + ringR,
      ringCy + ringR,
    )
    ringGrad.addColorStop(0, activeTheme.primary)
    ringGrad.addColorStop(1, activeTheme.secondary)
    ctx.beginPath()
    ctx.arc(ringCx, ringCy, ringR, startAngle, endAngle)
    ctx.strokeStyle = ringGrad
    ctx.lineWidth = 14
    ctx.lineCap = 'round'
    ctx.stroke()

    ctx.textAlign = 'center'
    ctx.fillStyle = textSub
    ctx.font = '800 12px monospace'
    ctx.fillText('OPERATIVE LVL', ringCx, ringCy - 24)

    ctx.fillStyle = textMain
    ctx.font = '900 54px monospace'
    ctx.fillText(String(levelInfo.level), ringCx, ringCy + 22)

    ctx.fillStyle = activeTheme.primary
    ctx.font = '800 13px monospace'
    ctx.fillText(`${levelInfo.progressPercent}% XP`, ringCx, ringCy + 48)

    ctx.textAlign = 'left'
    ctx.fillStyle = activeTheme.primary
    ctx.font = '800 12px monospace'
    ctx.fillText('CURRENT RANK TIER', 295, 245)

    ctx.fillStyle = textMain
    ctx.font = '900 26px system-ui, -apple-system, sans-serif'
    ctx.fillText(truncateCanvasText(ctx, levelInfo.rankTitle, 200), 295, 280)

    ctx.fillStyle = textSub
    ctx.font = '600 14px system-ui, -apple-system, sans-serif'
    ctx.fillText(`${levelInfo.totalHours}h Total Logged`, 295, 310)
    ctx.fillText(`Next Rank: ${levelInfo.nextLevelHours}h`, 295, 334)

    // XP Bar inside Left Card
    drawRoundedRect(ctx, 98, 420, 390, 14, 7)
    ctx.fillStyle = trackBg
    ctx.fill()

    const fillW = Math.max(18, Math.round((390 * levelInfo.progressPercent) / 100))
    drawRoundedRect(ctx, 98, 420, fillW, 14, 7)
    ctx.fillStyle = ringGrad
    ctx.fill()

    // Circadian Rhythm Persona Footer inside Left Card
    drawRoundedRect(ctx, 98, 456, 390, 84, 18)
    ctx.fillStyle = subtleBoxBg
    ctx.fill()
    ctx.strokeStyle = subtleBoxBorder
    ctx.lineWidth = 1
    ctx.stroke()

    ctx.fillStyle = activeTheme.secondary
    ctx.font = '800 11px monospace'
    ctx.fillText('CIRCADIAN PLAYBIORHYTHM', 118, 482)

    ctx.fillStyle = textMain
    ctx.font = '800 20px system-ui, -apple-system, sans-serif'
    ctx.fillText(habits?.personaTitle || 'Tactical All-Rounder', 118, 510)

    ctx.fillStyle = textSub
    ctx.font = '600 12px monospace'
    ctx.fillText(`Peak Window: ${habits?.peakHourLabel || '20:00 – 23:00'}`, 118, 529)

    // ── RIGHT 6-METRIC TELEMETRY GRID (x: 544..1532, y: 170..565) ─────────
    const totalPlaytimeFormatted = formatPlaytime(summary?.total_playtime_seconds ?? 0)
    const kpiBoxes = [
      {
        label: 'LIFETIME PLAYTIME',
        value: totalPlaytimeFormatted,
        sub: `${levelInfo.totalHours} Hours Logged`,
        accent: activeTheme.primary,
      },
      {
        label: 'ACTIVE PLAY STREAK',
        value: `${streak} Day${streak === 1 ? '' : 's'}`,
        sub: streak > 0 ? 'Consecutive Daily Momentum' : 'Ready for Next Session',
        accent: isLight ? '#d97706' : '#f59e0b',
      },
      {
        label: 'LIBRARY MASTERY',
        value: `${completionRate}% Engaged`,
        sub: `${playedCount} of ${totalGamesCount || (summary?.total_games ?? 0)} Games Played`,
        accent: isLight ? '#059669' : '#10b981',
      },
      {
        label: 'AVG SESSION DURATION',
        value:
          avgSessionMins >= 60
            ? `${(avgSessionMins / 60).toFixed(1)} hrs`
            : `${avgSessionMins} mins`,
        sub: `${recentHours.toFixed(1)}h Played Last 4 Weeks`,
        accent: activeTheme.secondary,
      },
      {
        label: 'DOMINANT GENRE DNA',
        value: topGenre?.genre || 'Multi-Genre',
        sub: topGenre
          ? `${(topGenre.total_seconds / 3600).toFixed(1)}h (${topGenre.game_count} Titles)`
          : 'Balanced Catalog',
        accent: isLight ? '#db2777' : '#ec4899',
      },
      {
        label: 'TROPHIES & MILESTONES',
        value: `${unlockedCount} / ${milestones.length}`,
        sub: `${Math.round((unlockedCount / Math.max(1, milestones.length)) * 100)}% Achievements Unlocked`,
        accent: isLight ? '#ca8a04' : '#eab308',
      },
    ]

    const colW = 314
    const rowH = 186
    kpiBoxes.forEach((box, idx) => {
      const col = idx % 3
      const row = Math.floor(idx / 3)
      const bx = 544 + col * (colW + 22)
      const by = 170 + row * (rowH + 23)

      drawRoundedRect(ctx, bx, by, colW, rowH, 24)
      ctx.fillStyle = activeTheme.cardBg
      ctx.fill()
      ctx.strokeStyle = subtleBoxBorder
      ctx.lineWidth = 1.5
      ctx.stroke()

      drawRoundedRect(ctx, bx + 24, by + 24, 38, 6, 3)
      ctx.fillStyle = box.accent
      ctx.fill()

      ctx.textAlign = 'left'
      ctx.fillStyle = textSub
      ctx.font = '800 12px monospace'
      ctx.fillText(box.label, bx + 24, by + 56)

      ctx.fillStyle = textMain
      ctx.font = '900 32px system-ui, -apple-system, sans-serif'
      ctx.fillText(truncateCanvasText(ctx, box.value, colW - 48), bx + 24, by + 108)

      ctx.fillStyle = box.accent
      ctx.font = '700 13px system-ui, -apple-system, sans-serif'
      ctx.fillText(truncateCanvasText(ctx, box.sub, colW - 48), bx + 24, by + 148)
    })

    // ── BOTTOM ROW LEFT: TOP CHAMPION GAME SHOWCASE (x: 68..784, y: 590..935) ──
    drawRoundedRect(ctx, 68, 590, 716, 345, 26)
    ctx.fillStyle = activeTheme.cardBg
    ctx.fill()
    ctx.strokeStyle = activeTheme.cardBorder
    ctx.lineWidth = 1.5
    ctx.stroke()

    const champGame = summary?.most_played_game
    const posterX = 98
    const posterY = 620
    const posterW = 195
    const posterH = 285

    drawRoundedRect(ctx, posterX, posterY, posterW, posterH, 18)
    ctx.save()
    ctx.clip()
    if (loadedCover) {
      ctx.drawImage(loadedCover, posterX, posterY, posterW, posterH)
    } else {
      const fallbackGrad = ctx.createLinearGradient(
        posterX,
        posterY,
        posterX + posterW,
        posterY + posterH,
      )
      fallbackGrad.addColorStop(0, activeTheme.primary)
      fallbackGrad.addColorStop(1, activeTheme.secondary)
      ctx.fillStyle = fallbackGrad
      ctx.fillRect(posterX, posterY, posterW, posterH)
      ctx.fillStyle = '#ffffff'
      ctx.textAlign = 'center'
      ctx.font = '900 26px monospace'
      ctx.fillText('CHAMPION', posterX + posterW / 2, posterY + posterH / 2)
    }
    ctx.restore()

    drawRoundedRect(ctx, posterX, posterY, posterW, posterH, 18)
    ctx.strokeStyle = subtleBoxBorder
    ctx.lineWidth = 2
    ctx.stroke()

    const cxText = 322
    ctx.textAlign = 'left'
    ctx.fillStyle = isLight ? '#d97706' : '#f59e0b'
    ctx.font = '800 13px monospace'
    ctx.fillText('★ MOST PLAYED CHAMPION TITLE', cxText, 648)

    ctx.fillStyle = textMain
    ctx.font = '900 34px system-ui, -apple-system, sans-serif'
    ctx.fillText(
      truncateCanvasText(ctx, champGame?.name || 'No Game Logged Yet', 430),
      cxText,
      696,
    )

    const champSharePct =
      champGame && (summary?.total_playtime_seconds ?? 0) > 0
        ? Math.min(
            100,
            Math.round(
              (champGame.total_playtime_seconds / (summary?.total_playtime_seconds ?? 1)) * 100,
            ),
          )
        : 0

    ctx.fillStyle = textMuted
    ctx.font = '600 16px system-ui, -apple-system, sans-serif'
    ctx.fillText(
      champGame
        ? `${formatPlaytime(champGame.total_playtime_seconds)} Invested (${champSharePct}% of Total Playtime)`
        : 'Launch any game in your library to crown your top title',
      cxText,
      734,
    )

    drawRoundedRect(ctx, cxText, 762, 430, 14, 7)
    ctx.fillStyle = trackBg
    ctx.fill()

    drawRoundedRect(ctx, cxText, 762, Math.max(20, Math.round((430 * champSharePct) / 100)), 14, 7)
    ctx.fillStyle = isLight ? '#d97706' : '#f59e0b'
    ctx.fill()

    ctx.fillStyle = textSub
    ctx.font = '800 12px monospace'
    ctx.fillText('UNLOCKED OPERATIVE HONORS', cxText, 816)

    const topUnlocked = unlockedMilestones.slice(0, 3)
    if (topUnlocked.length > 0) {
      topUnlocked.forEach((m, idx) => {
        const tx = cxText + idx * 144
        drawRoundedRect(ctx, tx, 832, 136, 68, 14)
        ctx.fillStyle = subtleBoxBg
        ctx.fill()
        ctx.strokeStyle = subtleBoxBorder
        ctx.lineWidth = 1
        ctx.stroke()

        ctx.fillStyle = activeTheme.primary
        ctx.font = '800 10px monospace'
        ctx.fillText(`#${idx + 1} HONOR`, tx + 14, 855)

        ctx.fillStyle = textMain
        ctx.font = '800 13px system-ui, -apple-system, sans-serif'
        ctx.fillText(truncateCanvasText(ctx, m.title, 110), tx + 14, 880)
      })
    } else {
      ctx.fillStyle = textSub
      ctx.font = '600 14px system-ui, -apple-system, sans-serif'
      ctx.fillText('Play sessions automatically unlock tactical trophies', cxText, 860)
    }

    // ── BOTTOM ROW RIGHT: GENRE DNA SPECTRUM (x: 810..1532, y: 590..935) ──
    drawRoundedRect(ctx, 810, 590, 722, 345, 26)
    ctx.fillStyle = activeTheme.cardBg
    ctx.fill()
    ctx.strokeStyle = activeTheme.cardBorder
    ctx.lineWidth = 1.5
    ctx.stroke()

    ctx.textAlign = 'left'
    ctx.fillStyle = activeTheme.primary
    ctx.font = '800 13px monospace'
    ctx.fillText('GENRE DNA & PLAYSTYLE SPECTRUM', 842, 636)

    const displayGenres =
      genres.length > 0
        ? genres.slice(0, 4)
        : [
            {
              genre: topGenre?.genre || 'Action / RPG',
              hours: levelInfo.totalHours || 12,
              game_count: 3,
              total_seconds: 43200,
            },
            {
              genre: 'Adventure',
              hours: Math.max(2, Math.round(levelInfo.totalHours * 0.45)),
              game_count: 2,
              total_seconds: 18000,
            },
            {
              genre: 'Shooter / Tactical',
              hours: Math.max(1, Math.round(levelInfo.totalHours * 0.25)),
              game_count: 2,
              total_seconds: 9000,
            },
            {
              genre: 'Indie / Strategy',
              hours: Math.max(1, Math.round(levelInfo.totalHours * 0.15)),
              game_count: 1,
              total_seconds: 5400,
            },
          ]
    const maxGenreHours = Math.max(1, ...displayGenres.map((g) => g.hours || 1))
    const barColors = [
      activeTheme.primary,
      activeTheme.secondary,
      isLight ? '#059669' : '#10b981',
      isLight ? '#d97706' : '#f59e0b',
    ]

    displayGenres.forEach((g, idx) => {
      const gy = 668 + idx * 62
      const ratio = Math.min(1, Math.max(0.08, (g.hours || 0.5) / maxGenreHours))

      ctx.textAlign = 'left'
      ctx.fillStyle = textMain
      ctx.font = '800 16px system-ui, -apple-system, sans-serif'
      ctx.fillText(truncateCanvasText(ctx, g.genre, 280), 842, gy)

      ctx.textAlign = 'right'
      ctx.fillStyle = textMuted
      ctx.font = '800 14px monospace'
      ctx.fillText(`${g.hours.toFixed(1)}h • ${g.game_count} Games`, 1500, gy)

      drawRoundedRect(ctx, 842, gy + 12, 658, 14, 7)
      ctx.fillStyle = trackBg
      ctx.fill()

      drawRoundedRect(ctx, 842, gy + 12, Math.round(658 * ratio), 14, 7)
      ctx.fillStyle = barColors[idx % barColors.length]
      ctx.fill()
    })

    setPreviewDataUrl(canvas.toDataURL('image/png'))
    setIsRendering(false)
  }, [
    activeTheme,
    avgSessionMins,
    completionRate,
    genres,
    habits,
    levelInfo,
    milestones.length,
    playedCount,
    profile?.name,
    recentHours,
    streak,
    summary,
    topGenre,
    totalGamesCount,
    unlockedCount,
    unlockedMilestones,
  ])

  useEffect(() => {
    if (!isOpen) return
    void renderShareStatsCanvas()
  }, [isOpen, renderShareStatsCanvas])

  function handleDownloadPng() {
    playButtonClick()
    const canvas = canvasRef.current
    const dataUrl = canvas ? canvas.toDataURL('image/png') : previewDataUrl
    if (!dataUrl) return
    const safeName = (profile?.name || 'operative')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
    const link = document.createElement('a')
    link.download = `nexus-stats-${safeName}-${activeTheme.id}.png`
    link.href = dataUrl
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    toast.success('Saved high-resolution Stats Card (.PNG) to your downloads!')
  }

  async function handleCopyImageToClipboard() {
    playButtonClick()
    const canvas = canvasRef.current
    if (!canvas) return
    try {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/png'),
      )
      if (blob && typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
        setCopiedImage(true)
        setTimeout(() => setCopiedImage(false), 2400)
        toast.success('Stats Image copied to clipboard! Press Ctrl+V in Discord, Telegram, or X.')
        return
      }
      handleDownloadPng()
    } catch {
      handleDownloadPng()
    }
  }

  function handleCopyTextBio() {
    playButtonClick()
    const cardText = [
      `🎮 NEXUS LAUNCHER — PLAYER STATE CARD 🎮`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `👤 Operative: ${profile?.name ?? 'Player 1'}`,
      `⭐ Rank: Level ${levelInfo.level} — ${levelInfo.rankTitle} (${levelInfo.progressPercent}% XP)`,
      `⏱️ Lifetime Playtime: ${formatPlaytime(summary?.total_playtime_seconds ?? 0)}`,
      `🔥 Active Streak: ${streak} Days`,
      `🎯 Library Mastery: ${completionRate}% (${playedCount}/${totalGamesCount || (summary?.total_games ?? 0)} Games)`,
      `🏆 Top Champion: ${summary?.most_played_game?.name ?? 'None'}`,
      `🎨 Top Genre: ${topGenre?.genre ?? 'Multi-Genre'}`,
      `🎖️ Trophies Unlocked: ${unlockedCount} / ${milestones.length}`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ].join('\n')

    void navigator.clipboard.writeText(cardText).then(() => {
      setCopiedText(true)
      setTimeout(() => setCopiedText(false), 2000)
      toast.success('Copied text summary to clipboard!')
    })
  }

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 sm:p-6">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/75 backdrop-blur-md"
        />

        {/* Hidden High-Res 1600x1000 Render Canvas */}
        <canvas ref={canvasRef} className="hidden" width={1600} height={1000} />

        {/* Modal Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 10 }}
          transition={{ type: 'spring', damping: 28, stiffness: 360 }}
          className="relative z-10 flex w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-border bg-surface p-5 shadow-2xl sm:p-7"
        >
          {/* Header */}
          <div className="flex flex-col gap-3.5 border-b border-border/80 pb-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex size-11 items-center justify-center rounded-2xl border border-accent/40 bg-accent/15 text-accent shadow-inner">
                  <Share2 className="size-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-accent">
                    <Sparkles className="size-3" />
                    <span>1600×1000 RETINA INFOGRAPHIC GENERATOR • 8 DARK &amp; LIGHT PALETTES</span>
                  </div>
                  <h2 className="text-xl font-black tracking-tight text-text sm:text-2xl">
                    Share Your Gaming State &amp; Telemetry
                  </h2>
                </div>
              </div>

              <ModalCloseButton onClick={onClose} aria-label="Close Share Stats modal" />
            </div>

            {/* 8 Color Palettes Strip (5 Dark Mode + 3 Light Mode) */}
            <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-border bg-surface-raised p-1.5">
              <span className="ml-2 mr-1 inline-flex items-center gap-1 font-mono text-[10px] font-bold uppercase text-subtle">
                <Palette className="size-3.5 text-accent" />
                <span>Theme:</span>
              </span>
              {SHARE_THEMES.map((t) => {
                const active = themeId === t.id
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      playButtonClick()
                      setThemeId(t.id)
                    }}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs font-bold transition-all cursor-pointer',
                      active
                        ? 'border-accent bg-accent text-white shadow-xs'
                        : 'border-border/70 bg-surface text-muted hover:border-accent/40 hover:text-text',
                    )}
                  >
                    <span
                      className="size-2.5 rounded-full ring-1 ring-white/30 shrink-0"
                      style={{ backgroundColor: t.swatch }}
                    />
                    <span>{t.label}</span>
                    {t.isLight ? (
                      <Sun className={cn('size-3', active ? 'text-amber-200' : 'text-amber-500')} />
                    ) : (
                      <Moon className={cn('size-2.5', active ? 'text-white/80' : 'text-subtle')} />
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Live Rendered High-Res Image Preview */}
          <div className="relative mt-4 overflow-hidden rounded-2xl border border-border bg-surface-raised shadow-xl">
            {previewDataUrl ? (
              <img
                src={previewDataUrl}
                alt="Nexus Share Stats Infographic Preview"
                className="aspect-[16/10] w-full object-contain"
              />
            ) : (
              <div className="flex aspect-[16/10] w-full flex-col items-center justify-center gap-2 text-muted">
                <Loader2 className="size-8 animate-spin text-accent" />
                <span className="text-xs font-bold">Rendering 1600×1000 Infographic...</span>
              </div>
            )}

            {isRendering && (
              <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full border border-border bg-surface/90 px-3 py-1 font-mono text-[10px] font-bold text-accent shadow-sm">
                <Loader2 className="size-3 animate-spin" />
                <span>Updating Canvas...</span>
              </div>
            )}
          </div>

          {/* Action Bar Footer */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-4">
            <div className="flex items-center gap-2 text-xs text-muted">
              <ImageIcon className="size-4 text-accent" />
              <span>
                Switch between Dark &amp; Light Mode palettes above, then copy or download in 1600×1000 HD.
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={handleCopyTextBio}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface-raised px-3.5 py-2.5 text-xs font-bold text-text transition-all hover:border-accent/50 hover:text-accent active:scale-95 cursor-pointer"
              >
                {copiedText ? (
                  <Check className="size-3.5 text-emerald-500" />
                ) : (
                  <Copy className="size-3.5" />
                )}
                <span>{copiedText ? 'Bio Text Copied!' : 'Copy Bio Text'}</span>
              </button>

              <button
                type="button"
                onClick={() => void handleCopyImageToClipboard()}
                className={cn(
                  'inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-extrabold transition-all active:scale-95 cursor-pointer',
                  copiedImage
                    ? 'border-emerald-500 bg-emerald-500 text-black shadow-lg shadow-emerald-500/20'
                    : 'border-accent/40 bg-accent/15 text-accent hover:bg-accent hover:text-white',
                )}
              >
                {copiedImage ? <Check className="size-4" /> : <Copy className="size-4" />}
                <span>{copiedImage ? 'Image Copied (Ctrl+V)!' : 'Copy Image to Clipboard'}</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadPng}
                className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-xs font-extrabold text-white shadow-lg shadow-accent/25 transition-all hover:bg-accent-hover hover:scale-102 active:scale-95 cursor-pointer"
              >
                <Download className="size-4" />
                <span>Save HD Image (.PNG)</span>
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
