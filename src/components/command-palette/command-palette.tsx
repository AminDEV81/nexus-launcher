import { useEffect } from 'react'
import { Command } from 'cmdk'
import { useNavigate } from 'react-router-dom'
import {
  Search,
  Gamepad2,
  FolderHeart,
  Rocket,
  Palette,
  MonitorCog,
  Cpu,
  KeyRound,
  Music,
  DatabaseBackup,
  Trash2,
  ArrowUpCircle,
} from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { assetUrl } from '@/lib/asset-url'
import { useCommandPaletteStore } from '@/store/command-palette-store'
import { useUiStore } from '@/store/ui-store'
import { useGames } from '@/features/library/hooks/use-games'
import { useCollections } from '@/features/collections/hooks/use-collections'

const QUICK_SETTINGS_COMMANDS = [
  {
    label: 'Game Booster & OS Tuner',
    keywords: 'boost fps ram process killer kernel timer msi ping',
    path: '/booster',
    icon: Rocket,
  },
  {
    label: 'Settings: Appearance & Theme',
    keywords: 'dark light mode palette accent color font blur compact density sound',
    path: '/settings?section=appearance',
    icon: Palette,
  },
  {
    label: 'Settings: Launcher & Downloads',
    keywords:
      'parallel download streams speed limit bandwidth auto extract 60 fps gpu eco launch window',
    path: '/settings?section=performance',
    icon: MonitorCog,
  },
  {
    label: 'Settings: Storefront, Steam Region & API Keys',
    keywords: 'igdb steamgriddb nexus cloud steam region currency price youtube google',
    path: '/settings?section=metadata',
    icon: KeyRound,
  },
  {
    label: 'Settings: Hardware & System Specs',
    keywords: 'cpu gpu vram ram disk storage motherboard specs',
    path: '/settings?section=system_specs',
    icon: Cpu,
  },
  {
    label: 'Settings: Soundtrack & Audio',
    keywords: 'music ost visualizer download folder providers',
    path: '/settings?section=soundtrack',
    icon: Music,
  },
  {
    label: 'Settings: Storage Cleaner',
    keywords: 'cleanup disk space orphaned saves snapshots artwork cache',
    path: '/settings?section=cleanup',
    icon: Trash2,
  },
  {
    label: 'Settings: Backup & Restore',
    keywords: 'export import json database backup restore',
    path: '/settings?section=backup',
    icon: DatabaseBackup,
  },
  {
    label: 'Settings: Updates & Version',
    keywords: 'update version check github release',
    path: '/settings?section=updates',
    icon: ArrowUpCircle,
  },
]

export function CommandPalette() {
  const isOpen = useCommandPaletteStore((s) => s.isOpen)
  const open = useCommandPaletteStore((s) => s.open)
  const close = useCommandPaletteStore((s) => s.close)
  const navigate = useNavigate()
  const selectGame = useUiStore((s) => s.selectGame)
  const { data: games } = useGames()
  const { data: collections } = useCollections()

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        open()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open])

  function handleSelectGame(gameId: string) {
    selectGame(gameId)
    navigate('/')
    close()
  }

  function handleSelectCollection(collectionId: string) {
    navigate(`/collections/${collectionId}`)
    close()
  }

  function handleNavigate(path: string) {
    navigate(path)
    close()
  }

  return (
    <Modal open={isOpen} onClose={close} widthClassName="max-w-lg">
      <Command shouldFilter className="flex max-h-[28rem] flex-col overflow-hidden">
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-4">
          <Search className="size-4 shrink-0 text-subtle" />
          <Command.Input
            autoFocus
            placeholder="Search games, collections, settings, or tools…"
            className="w-full bg-transparent py-3 text-sm text-text outline-none placeholder:text-subtle"
          />
        </div>

        <Command.List className="min-h-0 flex-1 overflow-y-auto p-2">
          <Command.Empty className="px-2 py-6 text-center text-sm text-subtle">
            No matches.
          </Command.Empty>

          {games && games.length > 0 && (
            <Command.Group
              heading="Games"
              className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-subtle [&_[cmdk-group-items]]:mt-1"
            >
              {games
                .filter((game) => !game.is_memory)
                .map((game) => {
                  const cover = assetUrl(game.cover_path)
                  return (
                    <Command.Item
                      key={game.id}
                      value={game.name}
                      onSelect={() => handleSelectGame(game.id)}
                      className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-text data-[selected=true]:bg-surface-raised"
                    >
                      <span className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-raised">
                        {cover ? (
                          <img src={cover} alt="" className="size-full object-cover" />
                        ) : (
                          <Gamepad2 className="size-3.5 text-subtle" />
                        )}
                      </span>
                      <span className="truncate">{game.name}</span>
                    </Command.Item>
                  )
                })}
            </Command.Group>
          )}

          {collections && collections.length > 0 && (
            <Command.Group
              heading="Collections"
              className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-subtle [&_[cmdk-group-items]]:mt-1"
            >
              {collections.map((collection) => (
                <Command.Item
                  key={collection.id}
                  value={collection.name}
                  onSelect={() => handleSelectCollection(collection.id)}
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-text data-[selected=true]:bg-surface-raised"
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-surface-raised">
                    <FolderHeart className="size-3.5 text-subtle" />
                  </span>
                  <span className="truncate">{collection.name}</span>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          <Command.Group
            heading="Settings & Optimization Tools"
            className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-subtle [&_[cmdk-group-items]]:mt-1"
          >
            {QUICK_SETTINGS_COMMANDS.map((item) => {
              const Icon = item.icon
              return (
                <Command.Item
                  key={item.path}
                  value={`${item.label} ${item.keywords}`}
                  onSelect={() => handleNavigate(item.path)}
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-text data-[selected=true]:bg-surface-raised"
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-accent/15 text-accent">
                    <Icon className="size-3.5" />
                  </span>
                  <span className="truncate">{item.label}</span>
                </Command.Item>
              )
            })}
          </Command.Group>
        </Command.List>
      </Command>
    </Modal>
  )
}
