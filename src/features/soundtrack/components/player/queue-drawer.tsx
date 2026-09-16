import { AnimatePresence, motion } from 'framer-motion'
import { Music, Play, Trash2, X } from 'lucide-react'
import { useSoundtrackStore } from '../../store/soundtrack-store'

interface QueueDrawerProps {
  open: boolean
  onClose: () => void
}

function formatDuration(ms: number) {
  const totalSec = Math.floor(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function QueueDrawer({ open, onClose }: QueueDrawerProps) {
  const queue = useSoundtrackStore((s) => s.queue)
  const queueIndex = useSoundtrackStore((s) => s.queueIndex)
  const playTrack = useSoundtrackStore((s) => s.playTrack)
  const removeFromQueue = useSoundtrackStore((s) => s.removeFromQueue)
  const clearQueue = useSoundtrackStore((s) => s.clearQueue)
  const currentAlbum = useSoundtrackStore((s) => s.currentAlbum)
  const currentGame = useSoundtrackStore((s) => s.currentGame)

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[140] bg-black/40 backdrop-blur-xs"
          />
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-y-0 right-0 z-[145] flex h-full w-84 max-w-[90vw] flex-col border-l border-border bg-surface/95 backdrop-blur-2xl shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border/80 p-4">
              <div className="flex items-center gap-2">
                <Music className="size-4 text-accent" />
                <span className="text-sm font-bold text-text">Playback Queue</span>
                <span className="rounded-full bg-surface-raised px-2 py-0.5 font-mono text-[10px] text-muted">
                  {queue.length}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {queue.length > 0 && (
                  <button
                    type="button"
                    onClick={clearQueue}
                    title="Clear Queue"
                    className="rounded-lg p-1.5 text-muted hover:bg-surface-raised hover:text-rose-400 transition-colors"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg p-1.5 text-muted hover:bg-surface-raised hover:text-text transition-colors"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>

            {/* Tracklist */}
            <div className="flex-1 overflow-y-auto p-2">
              {queue.length === 0 ? (
                <div className="flex h-48 flex-col items-center justify-center text-center">
                  <Music className="size-8 text-subtle/50 mb-2" />
                  <p className="text-xs text-muted">Your playback queue is empty</p>
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  {queue.map((track, idx) => {
                    const isCurrent = idx === queueIndex
                    return (
                      <div
                        key={`${track.id}_${idx}`}
                        onClick={() => void playTrack(track, currentAlbum, currentGame)}
                        className={`group flex items-center justify-between gap-2 rounded-xl p-2 cursor-pointer transition-all ${
                          isCurrent
                            ? 'bg-accent/15 border border-accent/30 text-accent'
                            : 'hover:bg-surface-raised text-text'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <span className="flex size-6 shrink-0 items-center justify-center rounded-lg font-mono text-xs text-muted group-hover:text-accent">
                            {isCurrent ? (
                              <Play className="size-3 fill-current text-accent" />
                            ) : (
                              idx + 1
                            )}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div
                              className={`truncate text-xs font-semibold ${isCurrent ? 'text-accent' : 'text-text'}`}
                            >
                              {track.title}
                            </div>
                            {track.artist && (
                              <div className="truncate text-[10px] text-muted">{track.artist}</div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {track.duration_ms > 0 && (
                            <span className="font-mono text-[10px] text-muted">
                              {formatDuration(track.duration_ms)}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              removeFromQueue(idx)
                            }}
                            className="opacity-0 group-hover:opacity-100 p-1 text-muted hover:text-rose-400 transition-opacity"
                          >
                            <X className="size-3" />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
