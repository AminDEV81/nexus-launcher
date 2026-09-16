import { useEffect } from 'react'
import { Command } from 'cmdk'
import { useNavigate } from 'react-router-dom'
import { Search, Gamepad2, FolderHeart } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { assetUrl } from '@/lib/asset-url'
import { useCommandPaletteStore } from '@/store/command-palette-store'
import { useUiStore } from '@/store/ui-store'
import { useGames } from '@/features/library/hooks/use-games'
import { useCollections } from '@/features/collections/hooks/use-collections'

/**
 * Mounted once at the app root (`app-shell.tsx`), same pattern as
 * `usePlaytimeTracking`. Reuses `Modal` for the overlay/backdrop/escape
 * handling rather than `cmdk`'s own `Command.Dialog` — that renders via
 * a Radix portal to `document.body` by default, which would escape the
 * app window's rounded-corner clipping the same way a plain `<Modal>`
 * portal would (see `Modal`'s own doc comment).
 *
 * Filtering is `cmdk`'s built-in fuzzy match (no custom `filter`) — it
 * already handles "type a few letters, best matches float up" well
 * enough for a games+collections list of this size that a bespoke
 * ranking isn't worth building.
 */
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

  return (
    <Modal open={isOpen} onClose={close} widthClassName="max-w-lg">
      <Command shouldFilter className="flex max-h-[28rem] flex-col overflow-hidden">
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-4">
          <Search className="size-4 shrink-0 text-subtle" />
          <Command.Input
            autoFocus
            placeholder="Search games and collections…"
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
              {games.map((game) => {
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
        </Command.List>
      </Command>
    </Modal>
  )
}
