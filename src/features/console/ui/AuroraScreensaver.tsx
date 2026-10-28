import React from 'react'
import { useConsoleStore } from '../store/console-store'
import { useSoundtrackStore } from '@/features/soundtrack/store/soundtrack-store'

export const AuroraScreensaver: React.FC = () => {
  const active = useConsoleStore((s) => s.screensaverActive)
  const setScreensaverActive = useConsoleStore((s) => s.setScreensaverActive)
  const ambientColor = useConsoleStore((s) => s.ambientColor)
  const currentTrack = useSoundtrackStore((s) => s.currentTrack)
  const currentAlbum = useSoundtrackStore((s) => s.currentAlbum)

  if (!active) return null

  return (
    <div
      onClick={() => setScreensaverActive(false)}
      className="fixed inset-0 z-[300] flex flex-col items-center justify-end bg-black/95 p-16 select-none cursor-pointer"
      style={{
        background: `radial-gradient(circle at 25% 30%, ${ambientColor}33 0%, transparent 55%), radial-gradient(circle at 75% 70%, #7c5cff33 0%, #000000 75%)`,
      }}
    >
      <div className="flex w-full items-end justify-between">
        <div>
          <p className="text-sm font-bold tracking-[0.25em] uppercase text-cyan-400">
            Nexus Aurora Standby
          </p>
          {currentTrack ? (
            <div className="mt-2">
              <p className="text-3xl font-extrabold text-white">{currentTrack.title}</p>
              <p className="text-lg text-slate-400">
                {currentTrack.artist || currentAlbum?.title || 'Game Soundtrack'}
              </p>
            </div>
          ) : (
            <p className="mt-2 text-2xl font-bold text-slate-300">
              Press any controller button to wake
            </p>
          )}
        </div>
        <div className="text-right font-mono text-5xl font-black text-white/80">
          {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  )
}
