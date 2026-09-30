import { useMemo, useState } from 'react'
import {
  Gamepad2,
  Folder,
  Tag,
  Clock,
  HardDrive,
  Sliders,
  Download,
  Music,
  ListMusic,
  Database,
  Image as ImageIcon,
  Check,
  Package,
  Sparkles,
  Search,
  X,
  Layers,
} from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import type { BackupStats } from '@/services/backup'

export interface BackupCategoryOption {
  id: string
  title: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  tables: string[]
  countBadge?: string
}

interface ExportBackupModalProps {
  open: boolean
  onClose: () => void
  onConfirm: (tables: string[]) => void
  isExporting?: boolean
  stats?: BackupStats
  counts?: {
    games?: number
    collections?: number
    tags?: number
    profiles?: number
  }
}

export function ExportBackupModal({
  open,
  onClose,
  onConfirm,
  isExporting = false,
  stats,
  counts,
}: ExportBackupModalProps) {
  const [searchQuery, setSearchQuery] = useState('')

  const categories: BackupCategoryOption[] = useMemo(() => {
    return [
      {
        id: 'games',
        title: 'Game Library',
        description:
          'Installed & imported games, executable paths, launch parameters, ratings, and favorites',
        icon: Gamepad2,
        tables: ['games'],
        countBadge: stats
          ? `${stats.games} games`
          : counts?.games !== undefined
            ? `${counts.games} games`
            : undefined,
      },
      {
        id: 'artwork',
        title: 'Artwork & Grid Covers',
        description: 'Cached cover posters, hero banners, game logos, and custom grid artwork',
        icon: ImageIcon,
        tables: ['artwork_cache'],
        countBadge: stats ? `${stats.artwork_cache} images` : undefined,
      },
      {
        id: 'collections',
        title: 'Collections & Folders',
        description: 'Custom organization folders, categories, and game assignments',
        icon: Folder,
        tables: ['collections', 'collection_games'],
        countBadge: stats
          ? `${stats.collections} collections`
          : counts?.collections !== undefined
            ? `${counts.collections} collections`
            : undefined,
      },
      {
        id: 'tags',
        title: 'Tags & Labels',
        description: 'Custom tags, color markers, badges, and game associations',
        icon: Tag,
        tables: ['tags', 'game_tags'],
        countBadge: stats
          ? `${stats.tags} tags`
          : counts?.tags !== undefined
            ? `${counts.tags} tags`
            : undefined,
      },
      {
        id: 'playtime',
        title: 'Playtime History & Stats',
        description: 'Recorded gameplay sessions, total hours, milestones, and launch logs',
        icon: Clock,
        tables: ['playtime_sessions'],
        countBadge: stats ? `${stats.playtime_sessions} sessions` : undefined,
      },
      {
        id: 'saves',
        title: 'Player Profiles & Save States',
        description: 'Player profiles, save locations, backup snapshots, and rollback points',
        icon: HardDrive,
        tables: [
          'profiles',
          'game_save_locations',
          'profile_game_saves',
          'save_operations',
          'save_operation_locations',
        ],
        countBadge: stats
          ? `${stats.profiles} profiles • ${stats.saves} saves`
          : counts?.profiles !== undefined
            ? `${counts.profiles} profiles`
            : undefined,
      },
      {
        id: 'settings',
        title: 'Launcher Settings & Preferences',
        description:
          'Appearance themes, accent colors, Game Booster config, sound volume, and API keys',
        icon: Sliders,
        tables: ['settings'],
        countBadge: stats ? `${stats.settings} preferences` : undefined,
      },
      {
        id: 'downloads',
        title: 'Downloads Manager & Queue',
        description: 'Download tasks, active queue, completed packages, and extract states',
        icon: Download,
        tables: ['downloads'],
        countBadge: stats ? `${stats.downloads} items` : undefined,
      },
      {
        id: 'soundtracks',
        title: 'Game Soundtracks & OSTs',
        description: 'Saved soundtrack albums, tracklists, game links, and provider configurations',
        icon: Music,
        tables: [
          'soundtrack_albums',
          'soundtrack_tracks',
          'soundtrack_game_links',
          'soundtrack_providers',
        ],
        countBadge: stats
          ? `${stats.soundtrack_albums} albums • ${stats.soundtrack_tracks} tracks`
          : undefined,
      },
      {
        id: 'soundtrack_history',
        title: 'Soundtrack Playlists & Favorites',
        description: 'Favorite tracks, playback queue, listening history, and local audio registry',
        icon: ListMusic,
        tables: [
          'soundtrack_favorites',
          'soundtrack_play_history',
          'soundtrack_queue',
          'soundtrack_downloads',
          'soundtrack_local_files',
        ],
        countBadge: stats ? `${stats.soundtrack_favorites} favorites` : undefined,
      },
      {
        id: 'metadata',
        title: 'IGDB & Steam Metadata Cache',
        description: 'Offline cache of IGDB game summaries, genres, dates, and Steam prices',
        icon: Database,
        tables: ['metadata_cache'],
        countBadge: stats ? `${stats.metadata_cache} cached queries` : undefined,
      },
    ]
  }, [stats, counts])

  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(categories.map((c) => c.id)),
  )

  const isAllSelected = selectedIds.size === categories.length
  const selectedCount = selectedIds.size

  function toggleCategory(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  function toggleAll() {
    if (isAllSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(categories.map((c) => c.id)))
    }
  }

  function applyPreset(preset: 'all' | 'essential' | 'saves' | 'media') {
    switch (preset) {
      case 'all':
        setSelectedIds(new Set(categories.map((c) => c.id)))
        break
      case 'essential':
        setSelectedIds(new Set(['games', 'collections', 'tags', 'playtime', 'saves', 'settings']))
        break
      case 'saves':
        setSelectedIds(new Set(['saves']))
        break
      case 'media':
        setSelectedIds(new Set(['artwork', 'soundtracks', 'soundtrack_history', 'metadata']))
        break
    }
  }

  const filteredCategories = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return categories
    return categories.filter(
      (c) => c.title.toLowerCase().includes(q) || c.description.toLowerCase().includes(q),
    )
  }, [categories, searchQuery])

  function handleExport() {
    const selectedTables = categories.filter((c) => selectedIds.has(c.id)).flatMap((c) => c.tables)
    onConfirm(selectedTables)
  }

  return (
    <Modal open={open} onClose={onClose} widthClassName="max-w-2xl">
      <div className="flex flex-col gap-4.5 p-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-accent/15 text-accent shadow-xs">
              <Package className="size-5.5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-text">Choose What to Back Up</h2>
              <p className="mt-0.5 text-xs text-muted">
                Select the components, settings, and library data to include in your backup.
              </p>
            </div>
          </div>
        </div>

        {/* Quick Presets */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-subtle mr-1">Presets:</span>
          <button
            type="button"
            onClick={() => applyPreset('all')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
              isAllSelected
                ? 'bg-accent text-white shadow-xs'
                : 'border border-border/80 bg-surface/60 text-muted hover:bg-surface-raised hover:text-text'
            }`}
          >
            <Sparkles className="size-3" />
            <span>Full Backup</span>
          </button>
          <button
            type="button"
            onClick={() => applyPreset('essential')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-surface/60 px-2.5 py-1 text-xs font-semibold text-muted transition-all hover:bg-surface-raised hover:text-text"
          >
            <Gamepad2 className="size-3" />
            <span>Essential Library</span>
          </button>
          <button
            type="button"
            onClick={() => applyPreset('saves')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-surface/60 px-2.5 py-1 text-xs font-semibold text-muted transition-all hover:bg-surface-raised hover:text-text"
          >
            <HardDrive className="size-3" />
            <span>Saves & Profiles</span>
          </button>
          <button
            type="button"
            onClick={() => applyPreset('media')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-surface/60 px-2.5 py-1 text-xs font-semibold text-muted transition-all hover:bg-surface-raised hover:text-text"
          >
            <Music className="size-3" />
            <span>Media & Music</span>
          </button>
        </div>

        {/* Toolbar: Search & Select All */}
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-surface/50 p-2 text-xs">
          <div className="relative flex flex-1 items-center">
            <Search className="absolute left-2.5 size-3.5 text-subtle pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter items..."
              className="w-full rounded-lg bg-surface/80 pl-8 pr-7 py-1 text-xs text-text placeholder:text-subtle focus:outline-none focus:ring-1 focus:ring-accent"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 text-subtle hover:text-text"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-3 pr-1 shrink-0">
            <span className="font-medium text-muted">
              <span className="font-bold text-accent">{selectedCount}</span> of {categories.length}{' '}
              selected
            </span>
            <button
              type="button"
              onClick={toggleAll}
              className="text-xs font-bold text-accent transition-colors hover:text-accent-hover hover:underline"
            >
              {isAllSelected ? 'Deselect All' : 'Select All'}
            </button>
          </div>
        </div>

        {/* Categories Grid */}
        <div className="grid max-h-[48vh] grid-cols-1 gap-2.5 overflow-y-auto pr-1 sm:grid-cols-2">
          {filteredCategories.map((cat) => {
            const isSelected = selectedIds.has(cat.id)
            const Icon = cat.icon
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => toggleCategory(cat.id)}
                className={`group flex items-start gap-3 rounded-xl border p-3 text-left transition-all ${
                  isSelected
                    ? 'border-accent/60 bg-accent/10 shadow-xs'
                    : 'border-border/60 bg-surface/40 hover:border-border hover:bg-surface-raised'
                }`}
              >
                {/* Custom Checkbox */}
                <div
                  className={`mt-0.5 flex size-4.5 shrink-0 items-center justify-center rounded-md border transition-all ${
                    isSelected
                      ? 'border-accent bg-accent text-white shadow-xs'
                      : 'border-border/80 bg-surface/80 group-hover:border-subtle'
                  }`}
                >
                  {isSelected && <Check className="size-3 stroke-[3]" />}
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <Icon
                      className={`size-3.5 shrink-0 ${isSelected ? 'text-accent' : 'text-subtle'}`}
                    />
                    <span className="truncate text-xs font-bold text-text">{cat.title}</span>
                  </div>

                  <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted">
                    {cat.description}
                  </p>

                  {cat.countBadge && (
                    <span className="mt-2 inline-flex items-center rounded-md border border-border/60 bg-surface/80 px-1.5 py-0.5 text-[10px] font-medium text-subtle">
                      {cat.countBadge}
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-border/60 pt-3.5">
          <div className="flex items-center gap-1.5 text-[11px] text-subtle">
            <Layers className="size-3.5 text-accent" />
            <span>
              {selectedCount === 0
                ? 'Select at least one item to export'
                : `${categories.filter((c) => selectedIds.has(c.id)).flatMap((c) => c.tables).length} database tables selected`}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isExporting}
              className="rounded-xl border border-border/80 bg-surface px-4 py-2 text-xs font-bold text-text shadow-xs transition-colors hover:bg-surface-raised active:scale-95 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={selectedCount === 0 || isExporting}
              className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-xs font-bold text-white shadow-md shadow-accent/25 transition-all hover:bg-accent-hover active:scale-95 disabled:opacity-50"
            >
              <Download className="size-3.5" />
              <span>Export Backup {selectedCount > 0 ? `(${selectedCount})` : ''}</span>
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
