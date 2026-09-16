import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Play,
  Square,
  Heart,
  EyeOff,
  Eye,
  FolderOpen,
  Copy,
  Trash2,
  Image,
  Sparkles,
  FolderPlus,
  BookmarkMinus,
  Tags,
  Compass,
  AlertTriangle,
  Gamepad2,
  Calendar,
  RefreshCw,
} from 'lucide-react'
import { ContextMenu, ContextMenuItem, ContextMenuSeparator } from '@/components/ui/context-menu'
import { Modal } from '@/components/ui/modal'
import {
  useUpdateGameFlags,
  useDeleteGame,
  usePromoteWishlistGame,
  useLaunchGame,
  useStopGame,
  useSyncGameMetadata,
  gamesKey,
} from '../hooks/use-games'
import { setGameIgdbId } from '@/services/games'
import { searchMetadataCandidates } from '@/services/metadata'
import { useLaunchStore } from '@/store/launch-store'
import { CoverPickerModal } from './cover-picker-modal'
import { TagEditorModal } from './tag-editor-modal'
import { AddToCollectionModal } from '@/features/collections/components/add-to-collection-modal'
import { openGameFolder, copyGamePath } from '../utils/game-actions'
import { isGameUnreleased, formatReleaseDate } from '../utils/format'
import { assetUrl } from '@/lib/asset-url'
import { playButtonClick } from '@/lib/sound-engine'
import type { Game } from '@/types/models'

interface GameContextMenuProps {
  game: Game | null
  position: { x: number; y: number } | null
  onClose: () => void
}

export function GameContextMenu({ game, position, onClose }: GameContextMenuProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const updateFlags = useUpdateGameFlags()
  const deleteGame = useDeleteGame()
  const promoteWishlist = usePromoteWishlistGame()
  const launchGame = useLaunchGame()
  const stopGame = useStopGame()
  const syncGameMetadata = useSyncGameMetadata()

  const lastGameRef = useRef<Game | null>(game)
  if (game) lastGameRef.current = game
  const activeGame = game ?? lastGameRef.current

  const isRunning = useLaunchStore((s) =>
    activeGame ? s.runningGameIds.has(activeGame.id) : false,
  )
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const [coverPickerOpen, setCoverPickerOpen] = useState(false)
  const [tagsEditorOpen, setTagsEditorOpen] = useState(false)
  const [addToCollectionOpen, setAddToCollectionOpen] = useState(false)

  if (!activeGame) return null

  function handlePlay() {
    if (!activeGame) return
    if (isRunning) {
      if (!stopGame.isPending) stopGame.mutate(activeGame.id)
    } else if (!launchGame.isPending) {
      launchGame.mutate(activeGame.id)
    }
    onClose()
  }

  function handleToggleFavorite() {
    if (!activeGame) return
    updateFlags.mutate({ id: activeGame.id, is_favorite: !activeGame.is_favorite })
    onClose()
  }

  function handleToggleHidden() {
    if (!activeGame) return
    updateFlags.mutate({ id: activeGame.id, is_hidden: !activeGame.is_hidden })
    onClose()
  }

  function handleToggleLiveCover() {
    if (!activeGame) return
    updateFlags.mutate({
      id: activeGame.id,
      animated_cover_enabled: !activeGame.animated_cover_enabled,
    })
    onClose()
  }

  async function handleOpenFolder() {
    if (!activeGame) return
    await openGameFolder(activeGame)
    onClose()
  }

  async function handleCopyPath() {
    if (!activeGame) return
    await copyGamePath(activeGame)
    onClose()
  }

  /** Games with an IGDB match jump straight there. Manual entries
   *  don't have one — resolve it by name (same first-match philosophy
   *  as the auto metadata pipeline), persist it so the next click is
   *  direct and the hub's in-library badge starts recognizing the game,
   *  then navigate. A genuinely unmatchable name just says so. */
  async function handleViewInHub() {
    if (!activeGame) return
    const current = activeGame
    onClose()

    if (current.igdb_id !== null) {
      navigate(`/hub/${current.igdb_id}`)
      return
    }

    try {
      const matches = await searchMetadataCandidates(current.name)
      const match = matches[0]
      if (!match) {
        toast.error(`Couldn't find “${current.name}” on IGDB.`)
        return
      }
      await setGameIgdbId(current.id, match.igdb_id)
      queryClient.invalidateQueries({ queryKey: gamesKey })
      navigate(`/hub/${match.igdb_id}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not reach IGDB.')
    }
  }

  return (
    <>
      <ContextMenu
        position={
          confirmingRemove || coverPickerOpen || tagsEditorOpen || addToCollectionOpen
            ? null
            : position
        }
        onClose={onClose}
      >
        <ContextMenuItem
          icon={isRunning ? Square : Play}
          label={isRunning ? 'Stop' : 'Play'}
          onClick={handlePlay}
        />
        <ContextMenuItem
          icon={Heart}
          label={activeGame.is_favorite ? 'Remove from Favorites' : 'Add to Favorites'}
          onClick={handleToggleFavorite}
        />
        <ContextMenuItem
          icon={activeGame.is_hidden ? Eye : EyeOff}
          label={activeGame.is_hidden ? 'Unhide' : 'Hide'}
          onClick={handleToggleHidden}
        />
        <ContextMenuItem
          icon={FolderPlus}
          label="Add to Collection…"
          onClick={() => setAddToCollectionOpen(true)}
          disabled={!activeGame.is_installed}
          title={
            activeGame.is_installed
              ? undefined
              : 'Install this game first to add it to a collection'
          }
        />
        <ContextMenuItem
          icon={Tags}
          label="Tags…"
          onClick={() => setTagsEditorOpen(true)}
          hint={activeGame.tag_ids.length > 0 ? String(activeGame.tag_ids.length) : undefined}
        />
        <ContextMenuItem icon={Compass} label="View in Game Hub" onClick={handleViewInHub} />
        <ContextMenuItem
          icon={RefreshCw}
          label="Sync Metadata from IGDB"
          onClick={() => {
            syncGameMetadata.mutate(activeGame.id)
            onClose()
          }}
        />
        <ContextMenuSeparator />
        {activeGame.is_wishlist &&
          (!isGameUnreleased(activeGame.release_date) || activeGame.is_installed) && (
            <ContextMenuItem
              icon={BookmarkMinus}
              label="Move to Library"
              onClick={() => {
                promoteWishlist.mutate(activeGame.id)
                onClose()
              }}
            />
          )}
        <ContextMenuItem
          icon={Image}
          label="Change Cover"
          onClick={() => setCoverPickerOpen(true)}
        />
        {activeGame.cover_is_animated && (
          <ContextMenuItem
            icon={Sparkles}
            label={activeGame.animated_cover_enabled ? 'Disable Live Cover' : 'Enable Live Cover'}
            onClick={handleToggleLiveCover}
          />
        )}
        <ContextMenuItem icon={FolderOpen} label="Open Folder" onClick={handleOpenFolder} />
        <ContextMenuItem icon={Copy} label="Copy Path" onClick={handleCopyPath} />
        <ContextMenuSeparator />
        <ContextMenuItem
          icon={Trash2}
          label={activeGame.is_wishlist ? 'Remove from Wishlist' : 'Remove from Library'}
          danger
          onClick={() => setConfirmingRemove(true)}
        />
      </ContextMenu>

      <CoverPickerModal
        gameId={activeGame.id}
        open={coverPickerOpen}
        onClose={() => {
          setCoverPickerOpen(false)
          onClose()
        }}
      />

      <TagEditorModal
        game={activeGame}
        open={tagsEditorOpen}
        onClose={() => {
          setTagsEditorOpen(false)
          onClose()
        }}
      />

      <AddToCollectionModal
        gameId={activeGame.id}
        open={addToCollectionOpen}
        onClose={() => {
          setAddToCollectionOpen(false)
          onClose()
        }}
      />

      <Modal
        open={confirmingRemove}
        onClose={() => {
          setConfirmingRemove(false)
          onClose()
        }}
        widthClassName="max-w-md"
      >
        <div className="p-6">
          <div className="flex items-center gap-3.5 mb-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-400 shadow-inner">
              <AlertTriangle className="size-5.5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-text">
                {activeGame.is_wishlist ? 'Remove from Wishlist?' : 'Remove from Library?'}
              </h3>
              <p className="text-xs text-subtle">
                {activeGame.is_wishlist
                  ? 'This game will be removed from your saved wishlist.'
                  : 'This game will be removed from your Nexus library.'}
              </p>
            </div>
          </div>

          {/* Preview of game being removed */}
          <div className="mb-5 flex items-center gap-3.5 rounded-2xl border border-border/80 bg-surface/80 p-3 shadow-xs">
            {activeGame.cover_path ? (
              <img
                src={assetUrl(activeGame.cover_path) ?? ''}
                alt={activeGame.name}
                className="h-16 w-12 rounded-xl object-cover border border-white/10 shrink-0 shadow-sm"
              />
            ) : (
              <div className="flex h-16 w-12 shrink-0 items-center justify-center rounded-xl bg-surface-raised text-subtle border border-white/10">
                <Gamepad2 className="size-6" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h4 className="font-bold text-sm text-text truncate">{activeGame.name}</h4>
              <p className="text-xs text-subtle truncate">
                {activeGame.developer ?? 'Unknown Studio'}
              </p>
              <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted">
                <Calendar className="size-3 shrink-0" />
                <span>{formatReleaseDate(activeGame.release_date)}</span>
              </div>
            </div>
          </div>

          <p className="mb-6 text-xs text-subtle leading-relaxed">
            {activeGame.is_wishlist ? (
              <>
                Are you sure you want to remove{' '}
                <strong className="text-text font-bold">{activeGame.name}</strong> from your
                wishlist? You can easily search and re-add it from Game Hub anytime.
              </>
            ) : (
              <>
                Are you sure you want to remove{' '}
                <strong className="text-text font-bold">{activeGame.name}</strong> from your
                library? This only removes it from Nexus — the game files stay installed on your
                computer.
              </>
            )}
          </p>

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={() => {
                playButtonClick()
                setConfirmingRemove(false)
                onClose()
              }}
              className="rounded-xl border border-border/80 bg-surface-raised px-4 py-2 text-xs font-semibold text-subtle transition-all hover:bg-surface hover:text-text active:scale-95"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                playButtonClick()
                const targetId = activeGame.id
                deleteGame.mutate(targetId)
                setConfirmingRemove(false)
                onClose()
              }}
              disabled={deleteGame.isPending}
              className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-rose-600/20 transition-all hover:bg-rose-500 hover:scale-102 active:scale-95 disabled:opacity-60"
            >
              <Trash2 className="size-3.5" />
              <span>{activeGame.is_wishlist ? 'Remove from Wishlist' : 'Remove from Library'}</span>
            </button>
          </div>
        </div>
      </Modal>
    </>
  )
}
