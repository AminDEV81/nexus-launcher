import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Check } from 'lucide-react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/modal'
import { cn } from '@/lib/utils'
import { useScanModalStore } from '../store/scan-modal-store'
import { scanAllStores, importScannedGames } from '@/services/scan'
import type { ScanResult, ScannedGame } from '@/services/scan'
import { storeLabel } from '../utils/store-labels'

export function ScanResultsModal() {
  const { isOpen, close } = useScanModalStore()
  const queryClient = useQueryClient()

  const [result, setResult] = useState<ScanResult | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())

  const scan = useMutation({
    mutationFn: scanAllStores,
    onSuccess: (data) => {
      setResult(data)
      setSelected(new Set(data.games.map((_, index) => index)))
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'The scan failed.')
    },
  })

  const importGames = useMutation({
    mutationFn: importScannedGames,
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['games'] })
      toast.success(`Added ${count} game${count === 1 ? '' : 's'} to your library.`)
      close()
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not import the selected games.')
    },
  })

  // Kick off a fresh scan every time the modal opens — results are
  // ephemeral and "Allow rescanning anytime" implies each open reflects
  // whatever is installed right now, not a stale cached list.
  useEffect(() => {
    if (isOpen) {
      setResult(null)
      scan.mutate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  function toggle(index: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  function handleImport() {
    if (!result) return
    const chosen: ScannedGame[] = result.games.filter((_, index) => selected.has(index))
    if (chosen.length === 0) return
    importGames.mutate(chosen)
  }

  return (
    <Modal open={isOpen} onClose={close} widthClassName="max-w-xl">
      <div className="flex max-h-[32rem] flex-col p-5">
        <h2 className="text-base font-semibold text-text">Scan for Games</h2>
        <p className="mt-0.5 text-xs text-muted">
          Checking Steam, Epic, GOG, EA, Ubisoft, Battle.net, Amazon, and Xbox for installed games.
        </p>

        {scan.isPending && (
          <div className="flex flex-col items-center gap-2 py-10 text-sm text-muted">
            <Loader2 className="size-5 animate-spin text-accent" />
            Scanning your library folders…
          </div>
        )}

        {result && !scan.isPending && (
          <>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {result.summaries
                .filter((summary) => summary.found > 0)
                .map((summary) => (
                  <span
                    key={summary.source}
                    className="rounded-full border border-border bg-surface px-2.5 py-1 text-xs text-muted"
                  >
                    {storeLabel(summary.source)} · {summary.found}
                  </span>
                ))}
            </div>

            {result.games.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted">
                No new games found. Everything detected is already in your library.
              </p>
            ) : (
              <div className="mt-3 flex-1 overflow-y-auto rounded-lg border border-border">
                {result.games.map((game, index) => (
                  <GameRow
                    key={`${game.source}-${game.executable_path ?? game.install_path ?? game.name}-${index}`}
                    game={game}
                    checked={selected.has(index)}
                    onToggle={() => toggle(index)}
                  />
                ))}
              </div>
            )}

            <div className="mt-4 flex items-center justify-between">
              <button
                type="button"
                onClick={close}
                className="rounded-lg px-3 py-2 text-xs font-medium text-muted transition-colors hover:bg-surface-raised hover:text-text"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleImport}
                disabled={selected.size === 0 || importGames.isPending}
                className={cn(
                  'rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover',
                  (selected.size === 0 || importGames.isPending) && 'cursor-not-allowed opacity-50',
                )}
              >
                {importGames.isPending ? 'Adding…' : `Add ${selected.size} to Library`}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

function GameRow({
  game,
  checked,
  onToggle,
}: {
  game: ScannedGame
  checked: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-3 border-b border-border px-3 py-2 text-left last:border-0 hover:bg-surface-raised"
    >
      <span
        className={cn(
          'flex size-4 shrink-0 items-center justify-center rounded border',
          checked ? 'border-accent bg-accent' : 'border-border',
        )}
      >
        {checked && <Check className="size-3 text-white" strokeWidth={3} />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-text">{game.name}</div>
        <div className="truncate text-xs text-subtle">
          {game.install_path ?? game.executable_path}
        </div>
      </div>
      <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-[11px] text-muted">
        {storeLabel(game.source)}
      </span>
    </button>
  )
}
