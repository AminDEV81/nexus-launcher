import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  AlertCircle,
  ArrowUp,
  ArrowUpDown,
  Compass,
  Crown,
  Download,
  Flame,
  Gamepad2,
  Globe,
  Heart,
  Image as ImageIcon,
  Layers,
  LayoutGrid,
  Loader2,
  Maximize2,
  Monitor,
  Palette,
  Ratio,
  RefreshCw,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Square,
  Tv,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  useArtSearch,
  useLikedArtworks,
  useToggleLikeArtwork,
} from '../hooks/use-art-wallpaper'
import { ArtDownloadModal } from '../components/art-download-modal'
import { ArtLightboxModal } from '../components/art-lightbox-modal'
import { ArtDropdown, type ArtDropdownOption } from '../components/art-dropdown'
import {
  setDesktopWallpaper,
  type ArtCategory,
  type ArtItem,
} from '@/services/art-wallpaper'
import { useAnimationSpeed } from '@/hooks/use-animation-speed'
import { playBoostComplete, playButtonClick } from '@/lib/sound-engine'
import { cn } from '@/lib/utils'

const POPULAR_GAMES = [
  { label: 'Elden Ring', query: 'Elden Ring' },
  { label: 'Cyberpunk 2077', query: 'Cyberpunk 2077' },
  { label: 'God of War', query: 'God of War' },
  { label: 'Red Dead 2', query: 'Red Dead Redemption 2' },
  { label: 'Ghost of Tsushima', query: 'Ghost of Tsushima' },
  { label: 'The Witcher 3', query: 'The Witcher 3' },
  { label: 'Black Myth: Wukong', query: 'Black Myth Wukong' },
  { label: "Baldur's Gate 3", query: "Baldur's Gate 3" },
  { label: 'GTA V', query: 'Grand Theft Auto' },
  { label: 'DOOM Eternal', query: 'DOOM Eternal' },
  { label: 'Hollow Knight', query: 'Hollow Knight' },
  { label: 'Sekiro', query: 'Sekiro' },
  { label: 'Resident Evil', query: 'Resident Evil' },
]

const STYLE_MOODS = [
  { label: 'Cyberpunk Neon', query: 'cyberpunk neon city' },
  { label: 'Dark Fantasy', query: 'dark fantasy medieval' },
  { label: 'Sci-Fi & Space', query: 'sci-fi space planet' },
  { label: 'Samurai & Ronin', query: 'samurai katana japan' },
  { label: '3D Unreal Render', query: 'unreal engine 3d render' },
  { label: 'Pixel Art Retro', query: 'pixel art retro game' },
  { label: 'Post-Apocalyptic', query: 'post apocalyptic ruins' },
  { label: 'Minimalist Gaming', query: 'minimalist game wallpaper' },
  { label: 'Mecha & Robots', query: 'mecha robot sci-fi' },
  { label: 'Anime Gaming', query: 'anime game landscape' },
]

type ResolutionFilter = 'all' | '8k' | '4k' | '2k' | '1080p' | 'ultrasharp' | 'compact'
type AspectFilter =
  | 'all'
  | '16_9'
  | '16_10'
  | '21_9'
  | '32_9'
  | '4_3'
  | '9_16'
  | 'cover_2_3'
  | 'square'
type SourceFilter =
  | 'all'
  | 'official'
  | 'wallhaven'
  | 'concept_art'
  | 'ultrawide'
  | 'bing_openverse'
  | 'nasa'
  | 'anime'
type SortOption = 'default' | 'highest_res' | 'megapixels' | 'widest' | 'tallest' | 'png_first'
type GridDensity = 'cinema' | 'balanced' | 'compact'

const CATEGORY_OPTIONS: ArtDropdownOption<ArtCategory>[] = [
  {
    id: 'all',
    label: 'All Art & Wallpapers',
    description: 'Mixed gaming wallpapers, concept art & vertical art',
    icon: <Layers className="size-3.5" />,
  },
  {
    id: 'wallpaper',
    label: 'Desktop Wallpapers',
    description: 'High-res widescreen gaming & 4K/8K scenes',
    badge: 'HD–8K',
    icon: <Monitor className="size-3.5" />,
  },
  {
    id: 'hero',
    label: 'Ultrawide & Heroes',
    description: 'Cinematic 21:9, 32:9 & panoramic banners',
    badge: 'WIDE',
    icon: <Tv className="size-3.5" />,
  },
  {
    id: 'cover',
    label: 'Vertical & Mobile Art',
    description: 'Tall 9:16 portrait wallpapers & digital art',
    badge: 'VERTICAL',
    icon: <Smartphone className="size-3.5" />,
  },
  {
    id: 'concept',
    label: 'Concept & Key Art',
    description: 'Digital paintings & game concept art',
    badge: 'ART',
    icon: <Palette className="size-3.5" />,
  },
]

const RESOLUTION_OPTIONS: ArtDropdownOption<ResolutionFilter>[] = [
  {
    id: 'all',
    label: 'All Sizes',
    description: 'Show every available resolution',
    icon: <Maximize2 className="size-3.5" />,
  },
  {
    id: '8k',
    label: '5K – 8K Master',
    description: '5120px+ ultra-detailed displays',
    badge: '8K',
    icon: <Crown className="size-3.5" />,
  },
  {
    id: '4k',
    label: '4K UHD+',
    description: '3840px wide or taller',
    badge: '4K',
    icon: <Sparkles className="size-3.5" />,
  },
  {
    id: '2k',
    label: '2K QHD+',
    description: '2560px+ sharp gaming monitors',
    badge: '1440p',
    icon: <Monitor className="size-3.5" />,
  },
  {
    id: '1080p',
    label: 'Full HD+',
    description: '1920px+ standard crisp quality',
    badge: '1080p',
    icon: <Monitor className="size-3.5" />,
  },
  {
    id: 'ultrasharp',
    label: 'Ultra-Sharp (>8 MP)',
    description: 'Over 8 million total pixels',
    badge: '8MP+',
    icon: <Flame className="size-3.5" />,
  },
  {
    id: 'compact',
    label: 'Compact / Fast',
    description: 'Under 1920px, instant loading',
    badge: 'FAST',
    icon: <ImageIcon className="size-3.5" />,
  },
]

const ASPECT_OPTIONS: ArtDropdownOption<AspectFilter>[] = [
  {
    id: 'all',
    label: 'Any Ratio',
    description: 'All monitor & mobile proportions',
    icon: <Ratio className="size-3.5" />,
  },
  {
    id: '16_9',
    label: '16:9 Standard',
    description: 'Standard gaming monitors & TVs',
    badge: '16:9',
    icon: <Monitor className="size-3.5" />,
  },
  {
    id: '16_10',
    label: '16:10 Laptop / Deck',
    description: 'Gaming laptops & Steam Deck',
    badge: '16:10',
    icon: <Monitor className="size-3.5" />,
  },
  {
    id: '21_9',
    label: '21:9 Ultrawide',
    description: '3440×1440 & cinematic ultrawides',
    badge: '21:9',
    icon: <Tv className="size-3.5" />,
  },
  {
    id: '32_9',
    label: '32:9 Dual-Monitor',
    description: 'Super ultrawide & multi-screen',
    badge: '32:9',
    icon: <Tv className="size-3.5" />,
  },
  {
    id: '4_3',
    label: '4:3 / 5:4 Classic',
    description: 'Retro & classic desktop proportions',
    badge: '4:3',
    icon: <Square className="size-3.5" />,
  },
  {
    id: '9_16',
    label: '9:16 Mobile Vertical',
    description: 'Tall phone & vertical monitor setups',
    badge: '9:16',
    icon: <Smartphone className="size-3.5" />,
  },
  {
    id: 'cover_2_3',
    label: '2:3 / 3:4 Vertical Art',
    description: 'Portrait posters & vertical illustrations',
    badge: '2:3',
    icon: <ImageIcon className="size-3.5" />,
  },
  {
    id: 'square',
    label: '1:1 Square / Avatar',
    description: 'Balanced square profile & album art',
    badge: '1:1',
    icon: <Square className="size-3.5" />,
  },
]

const SOURCE_OPTIONS: ArtDropdownOption<SourceFilter>[] = [
  {
    id: 'all',
    label: 'All Sources',
    description: 'Every verified SFW art & wallpaper source',
    icon: <Globe className="size-3.5" />,
  },
  {
    id: 'official',
    label: 'Gaming Art & Heroes',
    description: 'Steam, IGDB & SteamGridDB (no box covers)',
    badge: 'GAME',
    icon: <Gamepad2 className="size-3.5" />,
  },
  {
    id: 'wallhaven',
    label: 'Wallhaven 4K / 8K',
    description: 'Most-favorited gaming & 8K wallpapers',
    badge: 'UHD',
    icon: <Sparkles className="size-3.5" />,
  },
  {
    id: 'concept_art',
    label: 'Digital & Fine Art',
    description: 'Wallhaven Concept Art & Art Institute IIIF',
    badge: 'ART',
    icon: <Palette className="size-3.5" />,
  },
  {
    id: 'ultrawide',
    label: 'Ultrawide Panoramic',
    description: 'Dedicated 21:9 & 32:9 stream',
    badge: 'UW',
    icon: <Tv className="size-3.5" />,
  },
  {
    id: 'bing_openverse',
    label: 'Bing 4K & Openverse',
    description: 'Microsoft Bing 4K UHD & Openverse HD art',
    badge: '4K',
    icon: <Monitor className="size-3.5" />,
  },
  {
    id: 'nasa',
    label: 'NASA Deep Space',
    description: '8K nebula & cosmic photography',
    badge: '8K',
    icon: <Compass className="size-3.5" />,
  },
  {
    id: 'anime',
    label: 'Anime & Illustration',
    description: 'Safebooru, Konachan & character art',
    badge: 'ANIME',
    icon: <Sparkles className="size-3.5" />,
  },
]

const SORT_OPTIONS: ArtDropdownOption<SortOption>[] = [
  {
    id: 'default',
    label: 'Most Popular First',
    description: 'Top-favorited & trending gaming art first',
    badge: 'HOT',
    icon: <Flame className="size-3.5" />,
  },
  {
    id: 'highest_res',
    label: 'Highest Resolution',
    description: 'Sort from 8K down to HD',
    badge: '8K↓',
    icon: <Crown className="size-3.5" />,
  },
  {
    id: 'megapixels',
    label: 'Most Megapixels',
    description: 'Largest total pixel density first',
    badge: 'MP↓',
    icon: <Maximize2 className="size-3.5" />,
  },
  {
    id: 'widest',
    label: 'Widest First',
    description: '32:9 & 21:9 panoramic at the top',
    badge: 'WIDE',
    icon: <Tv className="size-3.5" />,
  },
  {
    id: 'tallest',
    label: 'Tallest First',
    description: 'Vertical covers & phone art first',
    badge: 'TALL',
    icon: <Smartphone className="size-3.5" />,
  },
  {
    id: 'png_first',
    label: 'Lossless PNG First',
    description: 'Prioritize uncompressed PNG files',
    badge: 'PNG',
    icon: <Sparkles className="size-3.5" />,
  },
]

function matchesResolutionFilter(item: ArtItem, resFilter: ResolutionFilter): boolean {
  if (resFilter === 'all') return true
  const w = item.width ?? 0
  const h = item.height ?? 0
  const maxDim = Math.max(w, h)
  if (resFilter === '8k') return maxDim >= 5120
  if (resFilter === '4k') return maxDim >= 3840
  if (resFilter === '2k') return maxDim >= 2560
  if (resFilter === '1080p') return maxDim >= 1920
  if (resFilter === 'ultrasharp') return w * h >= 8_000_000
  if (resFilter === 'compact') return maxDim > 0 && maxDim < 1920
  return true
}

function matchesAspectFilter(
  item: ArtItem,
  aspect: AspectFilter,
  measuredRatio?: number,
): boolean {
  if (aspect === 'all') return true
  const whRatio =
    item.width && item.height && item.height > 0
      ? item.width / item.height
      : measuredRatio && measuredRatio > 0
        ? 1 / measuredRatio
        : 1.6
  if (aspect === '32_9') return whRatio >= 2.75
  if (aspect === '21_9') return whRatio >= 2.05 && whRatio < 2.75
  if (aspect === '16_9') return whRatio >= 1.68 && whRatio < 2.05
  if (aspect === '16_10') return whRatio >= 1.45 && whRatio < 1.68
  if (aspect === '4_3') return whRatio >= 1.16 && whRatio < 1.45
  if (aspect === 'square') return whRatio >= 0.88 && whRatio < 1.16
  if (aspect === 'cover_2_3') return whRatio >= 0.6 && whRatio < 0.88
  if (aspect === '9_16') return whRatio < 0.68
  return true
}

function matchesSourceFilter(item: ArtItem, sourceFilter: SourceFilter): boolean {
  if (sourceFilter === 'all') return true
  const src = item.source.toLowerCase()
  if (sourceFilter === 'official') {
    return src === 'steam' || src === 'igdb' || src === 'steamgriddb'
  }
  if (sourceFilter === 'wallhaven') return src === 'wallhaven' || src === 'wallhaven_8k'
  if (sourceFilter === 'concept_art') return src === 'wallhaven_art' || src === 'artic'
  if (sourceFilter === 'ultrawide') return src === 'wallhaven_uw'
  if (sourceFilter === 'bing_openverse') return src === 'bing_uhd' || src === 'openverse'
  if (sourceFilter === 'nasa') return src === 'nasa'
  if (sourceFilter === 'anime') {
    return src === 'safebooru' || src === 'konachan' || src === 'waifu_im' || src === 'nekos_best'
  }
  return true
}

function getQualityBadge(item: ArtItem): string | null {
  const maxDim = Math.max(item.width ?? 0, item.height ?? 0)
  if (maxDim >= 7680) return '8K'
  if (maxDim >= 5120) return '5K+'
  if (maxDim >= 3840) return '4K'
  if (maxDim >= 2560) return '2K'
  if (maxDim >= 1920) return 'FHD'
  return null
}

function useColumnCount(density: GridDensity): number {
  const compute = () => {
    const w = typeof window === 'undefined' ? 1440 : window.innerWidth
    if (w < 640) return 1
    if (w < 1024) return density === 'compact' ? 3 : 2
    if (w < 1280) return density === 'cinema' ? 2 : density === 'compact' ? 4 : 3
    return density === 'cinema' ? 3 : density === 'compact' ? 5 : 4
  }

  const [cols, setCols] = useState(compute)

  useEffect(() => {
    setCols(compute())
    const onResize = () => setCols(compute())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [density])

  return cols
}

interface ArtCardProps {
  item: ArtItem
  prioritize: boolean
  applyingWpId: string | null
  onOpenLightbox: (item: ArtItem) => void
  onToggleLike: (item: ArtItem) => void
  onQuickWallpaper: (item: ArtItem) => void
  onDownload: (item: ArtItem) => void
  onMeasureRatio: (id: string, ratio: number) => void
  onBroken: (id: string) => void
}

const ArtGalleryCard = memo(function ArtGalleryCard({
  item,
  prioritize,
  applyingWpId,
  onOpenLightbox,
  onToggleLike,
  onQuickWallpaper,
  onDownload,
  onMeasureRatio,
  onBroken,
}: ArtCardProps) {
  const imgRef = useRef<HTMLImageElement>(null)
  const [imgSrc, setImgSrc] = useState(item.thumb_url)
  const [loaded, setLoaded] = useState(false)
  const triedFallbackRef = useRef(false)

  useEffect(() => {
    setImgSrc(item.thumb_url)
    setNaturalAspect(null)
    setNaturalDims(null)
    triedFallbackRef.current = false
    const el = imgRef.current
    if (el && el.complete && el.naturalWidth > 0) {
      setLoaded(true)
      setNaturalAspect(el.naturalWidth / el.naturalHeight)
      setNaturalDims({ w: el.naturalWidth, h: el.naturalHeight })
    } else {
      setLoaded(false)
    }
  }, [item.id, item.thumb_url])

  const [naturalAspect, setNaturalAspect] = useState<number | null>(null)
  const [naturalDims, setNaturalDims] = useState<{ w: number; h: number } | null>(null)

  const displayW = item.width && item.width > 0 ? item.width : naturalDims?.w ?? null
  const displayH = item.height && item.height > 0 ? item.height : naturalDims?.h ?? null

  const cardAspect = useMemo(() => {
    const raw =
      naturalAspect ??
      (item.width && item.height && item.width > 0 && item.height > 0
        ? item.width / item.height
        : 16 / 10)
    // Pinterest-style gentle clamp so ultra-tall or ultra-thin strips stay crisp and proportional
    return Math.min(Math.max(raw, 0.52), 2.75)
  }, [naturalAspect, item.width, item.height])

  const qualityBadge = getQualityBadge({
    ...item,
    width: displayW,
    height: displayH,
  })

  return (
    <div className="group relative rounded-2xl bg-gradient-to-br from-accent/40 via-border to-cyan-400/30 p-[1.5px] shadow-sm transition-all duration-300 hover:z-10 hover:-translate-y-0.5 hover:from-accent hover:via-violet-400/70 hover:to-cyan-400 hover:shadow-xl">
      <div
        onClick={() => onOpenLightbox(item)}
        style={{ aspectRatio: String(cardAspect) }}
        className="relative w-full cursor-pointer overflow-hidden rounded-[14.5px] bg-surface-raised ring-1 ring-inset ring-white/10"
      >
        {!loaded && (
          <div className="pointer-events-none absolute inset-0 animate-pulse bg-gradient-to-br from-surface-raised via-surface to-surface-raised" />
        )}

        <img
          ref={imgRef}
          src={imgSrc}
          alt={item.title}
          loading={prioritize ? 'eager' : 'lazy'}
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={(e) => {
            setLoaded(true)
            const img = e.currentTarget
            if (img.naturalWidth > 0 && img.naturalHeight > 0) {
              setNaturalAspect(img.naturalWidth / img.naturalHeight)
              setNaturalDims({ w: img.naturalWidth, h: img.naturalHeight })
              onMeasureRatio(item.id, img.naturalHeight / img.naturalWidth)
            }
          }}
          onError={() => {
            if (!triedFallbackRef.current && item.image_url && imgSrc !== item.image_url) {
              triedFallbackRef.current = true
              setImgSrc(item.image_url)
              return
            }
            onBroken(item.id)
          }}
          className="relative z-1 block h-full w-full object-cover object-center transition-transform duration-500 ease-out group-hover:scale-103"
        />

        {/* Top badges: Source on top-left, Resolution & Quality Tier on top-right */}
        <div className="pointer-events-none absolute inset-x-2.5 top-2.5 z-10 flex items-center justify-between gap-1.5 opacity-95 transition-opacity group-hover:opacity-100">
          <span className="rounded-lg border border-white/15 bg-black/75 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-white shadow-sm">
            {item.source.replace('_', ' ')}
          </span>

          {(displayW && displayH) || qualityBadge ? (
            <div className="flex items-center gap-1">
              {qualityBadge && (
                <span
                  className={cn(
                    'rounded-lg border px-1.5 py-0.5 font-mono text-[10px] font-black shadow-sm',
                    qualityBadge === '8K' || qualityBadge === '5K+'
                      ? 'border-amber-400/40 bg-amber-500/90 text-black'
                      : qualityBadge === '4K'
                        ? 'border-cyan-400/40 bg-cyan-500/90 text-black'
                        : 'border-white/15 bg-black/75 text-emerald-300',
                  )}
                >
                  {qualityBadge}
                </span>
              )}
              {displayW && displayH && (
                <span className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-black/80 px-2 py-0.5 font-mono text-[10px] font-bold text-cyan-300 shadow-sm">
                  <Maximize2 className="size-2.5" />
                  {displayW}×{displayH}
                </span>
              )}
            </div>
          ) : null}
        </div>

        {/* Smooth Hover Overlay */}
        <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-2 bg-gradient-to-t from-black/90 via-black/65 to-transparent p-3 opacity-0 transition-all duration-300 group-hover:opacity-100">
          <div className="min-w-0">
            <div className="truncate text-xs font-extrabold text-white">{item.title}</div>
            {item.author && (
              <div className="truncate text-[10.5px] text-white/75">by {item.author}</div>
            )}
          </div>
          <div className="flex items-center justify-between gap-1.5">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleLike(item)
                }}
                className={cn(
                  'inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-[11px] font-bold transition active:scale-95 cursor-pointer',
                  item.is_liked
                    ? 'border-rose-400/60 bg-rose-500 text-white'
                    : 'border-white/25 bg-black/70 text-white hover:bg-rose-500/80',
                )}
              >
                <Heart className={cn('size-3.5', item.is_liked && 'fill-white')} />
                <span>{item.is_liked ? 'Liked' : 'Like'}</span>
              </button>

              <button
                type="button"
                disabled={applyingWpId === item.id}
                onClick={(e) => {
                  e.stopPropagation()
                  onQuickWallpaper(item)
                }}
                title="Set as Windows Desktop Wallpaper"
                className="inline-flex items-center justify-center rounded-xl border border-emerald-400/40 bg-emerald-600/80 p-1.5 text-white transition hover:bg-emerald-500 active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {applyingWpId === item.id ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Monitor className="size-3.5" />
                )}
              </button>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                playButtonClick()
                onDownload(item)
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-3 py-1.5 text-[11px] font-extrabold text-white shadow-md transition hover:bg-accent-hover active:scale-95 cursor-pointer"
            >
              <Download className="size-3.5" />
              <span>Download</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
})

export function ArtWallpaperPage() {
  const speed = useAnimationSpeed()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [showScrollTop, setShowScrollTop] = useState(false)

  const [activeTab, setActiveTab] = useState<'explore' | 'liked'>('explore')
  const [discoveryMode, setDiscoveryMode] = useState<'games' | 'styles'>('games')
  const [searchInput, setSearchInput] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [category, setCategory] = useState<ArtCategory>('all')
  const [resFilter, setResFilter] = useState<ResolutionFilter>('all')
  const [aspectFilter, setAspectFilter] = useState<AspectFilter>('all')
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')
  const [sortBy, setSortBy] = useState<SortOption>('default')
  const [density, setDensity] = useState<GridDensity>('balanced')
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(true)
  const [syncNonce, setSyncNonce] = useState<number>(() => {
    // Automatically generate a fresh sync seed on every app launch (sessionStorage clears when app closes)
    try {
      const key = 'nexus_art_session_sync_nonce'
      const existing = sessionStorage.getItem(key)
      if (existing !== null) {
        const parsed = Number(existing)
        if (Number.isFinite(parsed) && parsed > 0) return parsed
      }
      const prev = Number(localStorage.getItem('nexus_art_last_nonce') || '0')
      const fresh = ((prev + 1 + Math.floor(Math.random() * 5)) % 97) + 1
      sessionStorage.setItem(key, String(fresh))
      localStorage.setItem('nexus_art_last_nonce', String(fresh))
      localStorage.setItem('nexus_art_last_sync_ts', String(Date.now()))
      return fresh
    } catch {
      return (Math.floor(Date.now() / 1000) % 97) + 1
    }
  })

  const colCount = useColumnCount(density)

  const [lightboxItem, setLightboxItem] = useState<ArtItem | null>(null)
  const [downloadItem, setDownloadItem] = useState<ArtItem | null>(null)
  const [applyingWpId, setApplyingWpId] = useState<string | null>(null)
  const [brokenIds, setBrokenIds] = useState<Set<string>>(() => new Set())
  const [measuredRatios, setMeasuredRatios] = useState<Record<string, number>>({})

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(searchInput.trim()), 420)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  const {
    data: searchPages,
    isLoading: isSearching,
    isFetching: isFetchingSearch,
    isError: isSearchError,
    error: searchError,
    refetch: refetchSearch,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useArtSearch(debouncedQuery, category, syncNonce)

  function handleSyncExplore() {
    playButtonClick()
    setSyncNonce((n) => {
      const next = n + 1
      try {
        sessionStorage.setItem('nexus_art_session_sync_nonce', String(next))
        localStorage.setItem('nexus_art_last_nonce', String(next))
        localStorage.setItem('nexus_art_last_sync_ts', String(Date.now()))
      } catch {
        // Ignore
      }
      return next
    })
    toast.success('Explore feed refreshed with top-rated gaming artworks!')
  }

  useEffect(() => {
    try {
      const last = Number(localStorage.getItem('nexus_art_last_sync_ts') || '0')
      if (last > 0 && Date.now() - last >= 4 * 60 * 60 * 1000) {
        localStorage.setItem('nexus_art_last_sync_ts', String(Date.now()))
        setSyncNonce((n) => n + 1)
      } else if (last === 0) {
        localStorage.setItem('nexus_art_last_sync_ts', String(Date.now()))
      }
    } catch {
      // Ignore
    }
  }, [])

  const { data: likedItems = [], isLoading: isLoadingLiked } = useLikedArtworks()
  const toggleLike = useToggleLikeArtwork()

  const likedIdSet = useMemo(() => new Set(likedItems.map((i) => i.id)), [likedItems])

  const weaveMixedProportions = useCallback(
    (items: ArtItem[]): ArtItem[] => {
      if (items.length <= 2) return items
      const byPop = [...items].sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
      const portrait: ArtItem[] = []
      const landscape: ArtItem[] = []
      const wide: ArtItem[] = []

      for (const item of byPop) {
        const w = item.width ?? 0
        const h = item.height ?? 0
        const r =
          w > 0 && h > 0
            ? w / h
            : measuredRatios[item.id] && measuredRatios[item.id] > 0
              ? 1 / measuredRatios[item.id]
              : item.category === 'cover'
                ? 0.7
                : item.category === 'hero'
                  ? 2.4
                  : 1.77
        if (r < 1.15) portrait.push(item)
        else if (r >= 2.05) wide.push(item)
        else landscape.push(item)
      }

      // Proportional Bresenham-style spread so portrait, wide & landscape stay evenly mixed
      // from the very first card to the very last card of every page (zero rectangular tail!).
      const total = byPop.length
      const result: ArtItem[] = []
      let pIdx = 0
      let wIdx = 0
      let lIdx = 0

      for (let i = 0; i < total; i++) {
        const wantPortrait =
          pIdx < portrait.length && (pIdx + 0.5) / portrait.length <= (i + 0.5) / total
        const wantWide =
          wIdx < wide.length && (wIdx + 0.5) / wide.length <= (i + 0.5) / total

        if (wantPortrait && (!wantWide || i % 2 === 1)) {
          result.push(portrait[pIdx++])
        } else if (wantWide) {
          result.push(wide[wIdx++])
        } else if (lIdx < landscape.length) {
          result.push(landscape[lIdx++])
        } else if (pIdx < portrait.length) {
          result.push(portrait[pIdx++])
        } else if (wIdx < wide.length) {
          result.push(wide[wIdx++])
        }
      }
      return result
    },
    [measuredRatios],
  )

  const exploreItems = useMemo(() => {
    const pages = searchPages?.pages ?? []
    const seen = new Set<string>()
    const out: ArtItem[] = []
    for (const page of pages) {
      const pageFiltered = page
        .filter((i) => {
          if (seen.has(i.id)) return false
          seen.add(i.id)
          return (
            matchesResolutionFilter(i, resFilter) &&
            matchesAspectFilter(i, aspectFilter, measuredRatios[i.id]) &&
            matchesSourceFilter(i, sourceFilter)
          )
        })
        .map((item) => ({
          ...item,
          is_liked: likedIdSet.has(item.id) || item.is_liked,
        }))
      // Weave each page independently so Load More appends varied shapes without shifting earlier pages
      out.push(...(sortBy === 'default' ? weaveMixedProportions(pageFiltered) : pageFiltered))
    }
    return out
  }, [searchPages, likedIdSet, resFilter, aspectFilter, sourceFilter, measuredRatios, sortBy, weaveMixedProportions])

  const displayedLiked = useMemo(() => {
    let list = likedItems
    if (category !== 'all') list = list.filter((i) => i.category === category)
    list = list.filter(
      (i) =>
        matchesResolutionFilter(i, resFilter) &&
        matchesAspectFilter(i, aspectFilter, measuredRatios[i.id]) &&
        matchesSourceFilter(i, sourceFilter),
    )
    if (debouncedQuery) {
      const q = debouncedQuery.toLowerCase()
      list = list.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          (i.game_name ?? '').toLowerCase().includes(q) ||
          (i.author ?? '').toLowerCase().includes(q),
      )
    }
    return list
  }, [likedItems, category, resFilter, aspectFilter, sourceFilter, measuredRatios, debouncedQuery])

  const rawActiveItems = activeTab === 'explore' ? exploreItems : displayedLiked

  const activeItems = useMemo(() => {
    const valid = rawActiveItems.filter((item) => !brokenIds.has(item.id))
    if (sortBy === 'default') {
      // Explore pages are already proportionally woven per-page; weave Liked tab the same way
      return activeTab === 'explore' ? valid : weaveMixedProportions(valid)
    }
    const sorted = [...valid]
    if (sortBy === 'highest_res') {
      sorted.sort((a, b) => Math.max(b.width ?? 0, b.height ?? 0) - Math.max(a.width ?? 0, a.height ?? 0))
    } else if (sortBy === 'megapixels') {
      sorted.sort((a, b) => (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0))
    } else if (sortBy === 'widest') {
      sorted.sort((a, b) => {
        const ra = a.width && a.height ? a.width / a.height : 1.5
        const rb = b.width && b.height ? b.width / b.height : 1.5
        return rb - ra
      })
    } else if (sortBy === 'tallest') {
      sorted.sort((a, b) => {
        const ra = a.width && a.height ? a.height / a.width : 0.65
        const rb = b.width && b.height ? b.height / b.width : 0.65
        return rb - ra
      })
    } else if (sortBy === 'png_first') {
      sorted.sort((a, b) => {
        const ap = (a.file_format ?? '').toLowerCase() === 'png' ? 1 : 0
        const bp = (b.file_format ?? '').toLowerCase() === 'png' ? 1 : 0
        if (bp !== ap) return bp - ap
        return (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0)
      })
    }
    return sorted
  }, [rawActiveItems, brokenIds, sortBy, activeTab, weaveMixedProportions])

  const isBusy = activeTab === 'explore' ? isSearching : isLoadingLiked

  const activeFilterCount =
    (category !== 'all' ? 1 : 0) +
    (resFilter !== 'all' ? 1 : 0) +
    (aspectFilter !== 'all' ? 1 : 0) +
    (sourceFilter !== 'all' ? 1 : 0) +
    (sortBy !== 'default' ? 1 : 0) +
    (searchInput.trim().length > 0 ? 1 : 0)

  const hasActiveFilters = activeFilterCount > 0

  function resetAllFilters() {
    playButtonClick()
    setSearchInput('')
    setDebouncedQuery('')
    setCategory('all')
    setResFilter('all')
    setAspectFilter('all')
    setSourceFilter('all')
    setSortBy('default')
  }

  const columns = useMemo(() => {
    const getRatio = (item: ArtItem) => {
      if (measuredRatios[item.id] !== undefined) return measuredRatios[item.id]
      if (item.width && item.height && item.width > 0) return item.height / item.width
      return 0.65
    }

    const buckets: ArtItem[][] = Array.from({ length: colCount }, () => [])
    const heights = new Array<number>(colCount).fill(0)
    for (const item of activeItems) {
      let minIdx = 0
      for (let i = 1; i < colCount; i++) {
        if (heights[i] < heights[minIdx]) minIdx = i
      }
      buckets[minIdx].push(item)
      heights[minIdx] += getRatio(item)
    }

    for (let step = 0; step < colCount * 2; step++) {
      let minIdx = 0
      let maxIdx = 0
      for (let i = 1; i < colCount; i++) {
        if (heights[i] < heights[minIdx]) minIdx = i
        if (heights[i] > heights[maxIdx]) maxIdx = i
      }
      if (buckets[maxIdx].length <= 1) break
      const lastItem = buckets[maxIdx][buckets[maxIdx].length - 1]
      const lastH = getRatio(lastItem)
      if (heights[maxIdx] - heights[minIdx] > lastH * 1.15) {
        buckets[maxIdx].pop()
        buckets[minIdx].push(lastItem)
        heights[maxIdx] -= lastH
        heights[minIdx] += lastH
      } else {
        break
      }
    }

    return buckets
  }, [activeItems, colCount, measuredRatios])

  const lightboxIndex = useMemo(
    () => (lightboxItem ? activeItems.findIndex((i) => i.id === lightboxItem.id) : -1),
    [lightboxItem, activeItems],
  )

  const handleMeasureRatio = useCallback((id: string, realRatio: number) => {
    setMeasuredRatios((prev) => {
      const cur = prev[id]
      if (cur !== undefined && Math.abs(cur - realRatio) < 0.04) return prev
      return { ...prev, [id]: realRatio }
    })
  }, [])

  const handleBroken = useCallback((id: string) => {
    setBrokenIds((prev) => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }, [])

  const handleToggleLike = useCallback(
    (item: ArtItem) => {
      playButtonClick()
      toggleLike.mutate(item)
      setLightboxItem((cur) => (cur && cur.id === item.id ? { ...cur, is_liked: !cur.is_liked } : cur))
    },
    [toggleLike],
  )

  const handleQuickSetWallpaper = useCallback(
    async (item: ArtItem) => {
      if (applyingWpId) return
      playButtonClick()
      setApplyingWpId(item.id)
      try {
        await setDesktopWallpaper(item.image_url, item.title)
        playBoostComplete()
        toast.success('Desktop wallpaper applied!')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to apply desktop wallpaper.')
      } finally {
        setApplyingWpId(null)
      }
    },
    [applyingWpId],
  )

  const discoveryItems = discoveryMode === 'games' ? POPULAR_GAMES : STYLE_MOODS

  return (
    <div
      ref={scrollRef}
      onScroll={(e) => setShowScrollTop(e.currentTarget.scrollTop > 520)}
      className="relative h-full overflow-y-auto p-4 sm:p-6 lg:p-8 xl:px-10"
    >
      <div className="mx-auto flex w-full max-w-[1920px] flex-col gap-5">
        {/* Header & Morphing Tab Switcher */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 * speed }}
          className="flex flex-wrap items-center justify-between gap-4"
        >
          <div className="flex items-center gap-3.5">
            <div className="flex size-11 items-center justify-center rounded-2xl border border-accent/30 bg-accent/15 text-accent shadow-inner">
              <ImageIcon className="size-5.5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-text">
                  Art &amp; Wallpaper
                </h1>
                <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase text-accent">
                  <Sparkles className="size-2.5" /> 8K Gaming Studio
                </span>
                <span className="rounded-full border border-border bg-surface-raised px-2.5 py-0.5 font-mono text-[10px] font-bold text-subtle">
                  {activeItems.length} Artworks
                </span>
              </div>
              <p className="text-xs text-subtle">
                Fast HQ previews of trending gaming art, 4K/8K wallpapers &amp; ultrawide banners — full-res loads on view or download
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {activeTab === 'explore' && (
              <button
                type="button"
                disabled={isFetchingSearch}
                onClick={handleSyncExplore}
                title="Sync latest gaming artworks"
                className="inline-flex items-center gap-2 rounded-2xl border border-border bg-surface px-3.5 py-2.5 text-xs font-extrabold text-text shadow-2xs transition hover:border-accent/50 hover:text-accent active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={cn('size-3.5 text-accent', isFetchingSearch && 'animate-spin')} />
                <span>{isFetchingSearch ? 'Syncing...' : 'Sync Feed'}</span>
              </button>
            )}

            <div className="relative inline-flex items-center gap-1 rounded-2xl border border-border bg-surface p-1.5 shadow-2xs">
              <button
                type="button"
                onClick={() => {
                  playButtonClick()
                  setActiveTab('explore')
                }}
                className={cn(
                  'relative z-10 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-extrabold transition-colors cursor-pointer',
                  activeTab === 'explore' ? 'text-white' : 'text-muted hover:text-text',
                )}
              >
                {activeTab === 'explore' && (
                  <motion.span
                    layoutId="art-tab-pill"
                    transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                    className="absolute inset-0 -z-10 rounded-xl bg-accent shadow-sm"
                  />
                )}
                <Compass className="size-3.5" />
                <span>Explore &amp; Search</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  playButtonClick()
                  setActiveTab('liked')
                }}
                className={cn(
                  'relative z-10 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-extrabold transition-colors cursor-pointer',
                  activeTab === 'liked' ? 'text-white' : 'text-muted hover:text-text',
                )}
              >
                {activeTab === 'liked' && (
                  <motion.span
                    layoutId="art-tab-pill"
                    transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                    className="absolute inset-0 -z-10 rounded-xl bg-rose-500 shadow-sm"
                  />
                )}
                <Heart className={cn('size-3.5', activeTab === 'liked' && 'fill-white')} />
                <span>Liked ({likedItems.length})</span>
              </button>
            </div>
          </div>
        </motion.div>

        {/* Search + Custom Gaming Dropdowns + Discovery Chips */}
        <div className="flex flex-col gap-3 rounded-3xl border border-border bg-surface p-4 shadow-2xs">
          {/* Row 1: Search Input + Filter Drawer Toggle + Grid Density + Reset */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative min-w-[260px] flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-subtle" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search any game, franchise, style or anime (leave empty for Top Gaming Explore)..."
                className="w-full rounded-2xl border border-border bg-surface-raised py-2.5 pl-10 pr-10 text-sm text-text outline-none transition focus:border-accent"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => setSearchInput('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-subtle transition hover:bg-surface hover:text-text cursor-pointer"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Grid Density Switcher */}
              <div className="inline-flex items-center gap-1 rounded-2xl border border-border bg-surface-raised p-1">
                <LayoutGrid className="mx-1.5 size-3.5 text-subtle" />
                {(['cinema', 'balanced', 'compact'] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      playButtonClick()
                      setDensity(d)
                    }}
                    className={cn(
                      'rounded-xl px-2.5 py-1 text-[11px] font-bold capitalize transition cursor-pointer',
                      density === d ? 'bg-accent text-white shadow-2xs' : 'text-muted hover:text-text',
                    )}
                  >
                    {d}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => {
                  playButtonClick()
                  setShowAdvancedFilters((v) => !v)
                }}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-2xl border px-3.5 py-2 text-xs font-bold transition-all active:scale-95 cursor-pointer',
                  showAdvancedFilters
                    ? 'border-accent/50 bg-accent/10 text-accent'
                    : 'border-border bg-surface-raised text-muted hover:text-text',
                )}
              >
                <SlidersHorizontal className="size-3.5" />
                <span>Filters</span>
                {activeFilterCount > 0 && (
                  <span className="flex size-4.5 items-center justify-center rounded-full bg-accent font-mono text-[10px] font-black text-white">
                    {activeFilterCount}
                  </span>
                )}
              </button>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="inline-flex items-center gap-1.5 rounded-2xl border border-rose-500/35 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-400 transition hover:bg-rose-500/20 active:scale-95 cursor-pointer"
                >
                  <RotateCcw className="size-3.5" />
                  <span>Reset</span>
                </button>
              )}
            </div>
          </div>

          {/* Row 2: Custom Styled Gaming Dropdowns */}
          {showAdvancedFilters && (
            <div className="flex flex-col gap-3 border-t border-border/60 pt-3">
              <div className="flex flex-wrap items-center gap-2">
                <ArtDropdown
                  label="Type"
                  value={category}
                  defaultId="all"
                  options={CATEGORY_OPTIONS}
                  onChange={setCategory}
                  icon={<Layers className="size-3.5" />}
                  minMenuWidth="min-w-[245px]"
                />
                <ArtDropdown
                  label="Size"
                  value={resFilter}
                  defaultId="all"
                  options={RESOLUTION_OPTIONS}
                  onChange={setResFilter}
                  icon={<Maximize2 className="size-3.5" />}
                  minMenuWidth="min-w-[250px]"
                />
                <ArtDropdown
                  label="Screen"
                  value={aspectFilter}
                  defaultId="all"
                  options={ASPECT_OPTIONS}
                  onChange={setAspectFilter}
                  icon={<Ratio className="size-3.5" />}
                  minMenuWidth="min-w-[260px]"
                />
                <ArtDropdown
                  label="Source"
                  value={sourceFilter}
                  defaultId="all"
                  options={SOURCE_OPTIONS}
                  onChange={setSourceFilter}
                  icon={<Globe className="size-3.5" />}
                  minMenuWidth="min-w-[255px]"
                />
                <ArtDropdown
                  label="Sort"
                  value={sortBy}
                  defaultId="default"
                  options={SORT_OPTIONS}
                  onChange={setSortBy}
                  icon={<ArrowUpDown className="size-3.5" />}
                  align="right"
                  minMenuWidth="min-w-[245px]"
                />
              </div>

              {/* Row 3: Interactive Gaming Franchises & Styles Discovery Strip */}
              {activeTab === 'explore' && (
                <div className="flex flex-wrap items-center gap-2 border-t border-border/40 pt-2.5">
                  <div className="inline-flex items-center gap-0.5 rounded-xl border border-border bg-surface-raised p-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        playButtonClick()
                        setDiscoveryMode('games')
                      }}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-extrabold transition cursor-pointer',
                        discoveryMode === 'games'
                          ? 'bg-accent text-white shadow-2xs'
                          : 'text-muted hover:text-text',
                      )}
                    >
                      <Gamepad2 className="size-3" />
                      <span>Popular Games</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        playButtonClick()
                        setDiscoveryMode('styles')
                      }}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-extrabold transition cursor-pointer',
                        discoveryMode === 'styles'
                          ? 'bg-accent text-white shadow-2xs'
                          : 'text-muted hover:text-text',
                      )}
                    >
                      <Palette className="size-3" />
                      <span>Styles &amp; Moods</span>
                    </button>
                  </div>

                  <div className="flex flex-1 flex-wrap items-center gap-1.5">
                    {discoveryItems.map((chip) => {
                      const active = searchInput.trim().toLowerCase() === chip.query.toLowerCase()
                      return (
                        <button
                          key={chip.label}
                          type="button"
                          onClick={() => {
                            playButtonClick()
                            setSearchInput(active ? '' : chip.query)
                          }}
                          className={cn(
                            'rounded-xl border px-2.5 py-1 text-[11px] font-bold transition active:scale-95 cursor-pointer',
                            active
                              ? 'border-accent bg-accent/15 text-accent shadow-2xs'
                              : 'border-border/70 bg-surface-raised text-muted hover:border-accent/50 hover:text-text',
                          )}
                        >
                          {chip.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Gallery Content */}
        {isBusy ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-border bg-surface p-16 text-center">
            <Loader2 className="size-8 animate-spin text-accent" />
            <p className="text-sm font-bold text-text">
              {debouncedQuery
                ? `Fetching high-res art for "${debouncedQuery}"...`
                : 'Loading Trending Gaming Art & 8K Wallpapers...'}
            </p>
            <p className="text-xs text-subtle">
              Querying Wallhaven 8K, Digital Art, Bing 4K, Openverse, Art Institute, Steam, IGDB &amp; NASA
            </p>
          </div>
        ) : activeTab === 'explore' && isSearchError ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-rose-500/30 bg-rose-500/5 p-12 text-center">
            <AlertCircle className="size-9 text-rose-400" />
            <h3 className="text-base font-extrabold text-text">Could not load artworks</h3>
            <p className="max-w-md text-xs text-muted">
              {searchError instanceof Error ? searchError.message : 'Network or backend error occurred.'}
            </p>
            <button
              type="button"
              onClick={() => void refetchSearch()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-xs font-extrabold text-white shadow-sm transition hover:bg-accent-hover cursor-pointer"
            >
              <RefreshCw className="size-3.5" />
              <span>Retry</span>
            </button>
          </div>
        ) : activeItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-border bg-surface/60 p-16 text-center">
            <ImageIcon className="size-10 text-subtle" />
            <h3 className="text-base font-extrabold text-text">
              {activeTab === 'liked' ? 'No Liked Artworks Match Filters' : 'No Artworks Match Active Filters'}
            </h3>
            <p className="max-w-md text-xs text-muted">
              {activeTab === 'liked'
                ? 'Like artworks in Explore or reset your active filters to see all saved items.'
                : 'Try broadening your size, screen ratio, or source filter — or search another game title.'}
            </p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetAllFilters}
                className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-xs font-extrabold text-white shadow-sm transition hover:bg-accent-hover cursor-pointer"
              >
                <RotateCcw className="size-3.5" />
                <span>Reset All Filters</span>
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Balanced Shortest-Column Masonry with Lazy HQ Thumbnails */}
            <div key={activeTab} className="flex items-start gap-3.5">
              {columns.map((colItems, colIdx) => (
                <div
                  key={`${activeTab}-col-${colIdx}`}
                  className="flex min-w-0 flex-1 flex-col gap-3.5"
                >
                  {colItems.map((item, idx) => (
                    <ArtGalleryCard
                      key={`${activeTab}-${item.id}`}
                      item={item}
                      prioritize={idx < 2}
                      applyingWpId={applyingWpId}
                      onOpenLightbox={setLightboxItem}
                      onToggleLike={handleToggleLike}
                      onQuickWallpaper={(it) => void handleQuickSetWallpaper(it)}
                      onDownload={setDownloadItem}
                      onMeasureRatio={handleMeasureRatio}
                      onBroken={handleBroken}
                    />
                  ))}
                </div>
              ))}
            </div>

            {activeTab === 'explore' && hasNextPage && (
              <div className="flex justify-center pt-2">
                <button
                  type="button"
                  disabled={isFetchingNextPage}
                  onClick={() => void fetchNextPage()}
                  className="inline-flex items-center gap-2 rounded-2xl border border-border bg-surface px-6 py-2.5 text-xs font-extrabold text-text shadow-sm transition hover:border-accent/50 hover:text-accent active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  {isFetchingNextPage && <Loader2 className="size-3.5 animate-spin" />}
                  <span>{isFetchingNextPage ? 'Loading More...' : 'Load More Artworks'}</span>
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Floating Scroll to Top Button */}
      {showScrollTop && (
        <button
          type="button"
          onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-6 right-8 z-30 flex size-11 items-center justify-center rounded-2xl border border-accent/40 bg-accent text-white shadow-xl transition hover:scale-105 hover:bg-accent-hover active:scale-95 cursor-pointer"
          title="Back to Top"
        >
          <ArrowUp className="size-5" />
        </button>
      )}

      {/* Smooth Morphing Modals */}
      <ArtLightboxModal
        item={lightboxItem}
        onClose={() => setLightboxItem(null)}
        onToggleLike={handleToggleLike}
        onDownload={(item) => {
          setLightboxItem(null)
          setDownloadItem(item)
        }}
        hasPrev={lightboxIndex > 0}
        hasNext={lightboxIndex >= 0 && lightboxIndex < activeItems.length - 1}
        onPrev={() => {
          if (lightboxIndex > 0) setLightboxItem(activeItems[lightboxIndex - 1])
        }}
        onNext={() => {
          if (lightboxIndex >= 0 && lightboxIndex < activeItems.length - 1) {
            setLightboxItem(activeItems[lightboxIndex + 1])
          }
        }}
      />
      <ArtDownloadModal item={downloadItem} onClose={() => setDownloadItem(null)} />
    </div>
  )
}
