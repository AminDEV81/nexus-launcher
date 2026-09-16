import { useEffect, useState } from 'react'
import { Activity, FolderOpen, Music, Radio, Sparkles } from 'lucide-react'
import { open } from '@tauri-apps/plugin-dialog'
import { toast } from 'sonner'
import { playButtonClick } from '@/lib/sound-engine'
import { providerRegistry } from '@/features/soundtrack/services/provider-registry'
import {
  getSoundtrackDownloadDirectory,
  setSoundtrackDownloadDirectory,
} from '@/features/soundtrack/services/tauri-soundtrack'
import { useSoundtrackStore } from '@/features/soundtrack/store/soundtrack-store'
import type { VisualizerMode } from '@/features/soundtrack/store/soundtrack-store'

export function SoundtrackSettingsPanel() {
  const visualizerMode = useSoundtrackStore((s) => s.visualizerMode)
  const setVisualizerMode = useSoundtrackStore((s) => s.setVisualizerMode)

  const [downloadDir, setDownloadDir] = useState('')
  const [providers] = useState(() => providerRegistry.getAllProviders())
  const [, setTick] = useState(0)

  useEffect(() => {
    void getSoundtrackDownloadDirectory().then(setDownloadDir)
  }, [])

  async function handleBrowseFolder() {
    playButtonClick()
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Choose Soundtrack Download Directory',
      })
      if (typeof selected === 'string') {
        await setSoundtrackDownloadDirectory(selected)
        setDownloadDir(selected)
        toast.success('Download directory updated')
      }
    } catch {
      // Ignore
    }
  }

  function handleToggleProvider(id: string) {
    playButtonClick()
    const current = providerRegistry.isProviderEnabled(id)
    providerRegistry.setProviderEnabled(id, !current)
    setTick((t) => t + 1)
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold tracking-tight text-text">Soundtrack Preferences</h2>
        <p className="mt-1 text-xs text-muted">
          Manage music discovery sources, download storage, and playback appearance.
        </p>
      </div>

      {/* 1. Appearance & Visualizer */}
      <section className="flex flex-col gap-4 rounded-3xl border border-border/80 bg-surface p-6 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-accent">
          <Sparkles className="size-3.5" />
          <span>Audio Visualizer</span>
        </div>
        <p className="text-xs text-muted">
          Choose the real-time visualizer rendering mode for the bottom mini player and expanded
          player.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(['off', 'minimal', 'reactive'] as VisualizerMode[]).map((mode) => {
            const isSelected = visualizerMode === mode
            return (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  playButtonClick()
                  setVisualizerMode(mode)
                }}
                className={`flex flex-col items-start gap-1 rounded-2xl border p-4 text-left transition-all ${
                  isSelected
                    ? 'border-accent bg-accent/15 text-accent shadow-sm'
                    : 'border-border/80 bg-surface-raised/60 text-text hover:border-accent/40'
                }`}
              >
                <span className="text-xs font-bold capitalize">{mode}</span>
                <span className="text-[11px] text-muted">
                  {mode === 'off'
                    ? 'Disable canvas visualizer'
                    : mode === 'minimal'
                      ? 'Subtle responsive frequency bars'
                      : 'Glowing kinetic waveform'}
                </span>
              </button>
            )
          })}
        </div>
      </section>

      {/* 2. Download Storage */}
      <section className="flex flex-col gap-4 rounded-3xl border border-border/80 bg-surface p-6 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-accent">
          <FolderOpen className="size-3.5" />
          <span>Download Storage Location</span>
        </div>
        <p className="text-xs text-muted">
          Downloaded soundtrack files and offline albums are organized in folders per game inside
          this directory.
        </p>

        <div className="flex items-center gap-3">
          <input
            type="text"
            readOnly
            value={downloadDir}
            className="flex-1 rounded-2xl border border-border bg-surface-raised px-4 py-2.5 font-mono text-xs text-text shadow-inner"
          />
          <button
            type="button"
            onClick={handleBrowseFolder}
            className="flex items-center gap-2 rounded-2xl bg-accent px-4 py-2.5 text-xs font-bold text-white shadow-md hover:scale-104 active:scale-95 transition-all shrink-0"
          >
            <FolderOpen className="size-3.5" />
            <span>Change Folder</span>
          </button>
        </div>
      </section>

      {/* 3. Soundtrack Providers & Health */}
      <section className="flex flex-col gap-4 rounded-3xl border border-border/80 bg-surface p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-accent">
            <Radio className="size-3.5" />
            <span>Discovery & Streaming Providers</span>
          </div>
          <span className="text-[11px] font-mono text-muted">Auto-Failover Active</span>
        </div>
        <p className="text-xs text-muted">
          Nexus automatically queries metadata, artwork, streaming audio, and download packages
          across these providers.
        </p>

        <div className="flex flex-col gap-2">
          {providers.map((p) => {
            const enabled = providerRegistry.isProviderEnabled(p.id)
            const health = providerRegistry.getHealth(p.id)

            return (
              <div
                key={p.id}
                className="flex items-center justify-between gap-4 rounded-2xl border border-border/80 bg-surface-raised/50 p-4 transition-all"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
                    <Music className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-text">{p.name}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 font-mono text-[9px] font-bold border ${
                          health.status === 'healthy'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : health.status === 'degraded'
                              ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                              : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                        }`}
                      >
                        {health.status.toUpperCase()}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2 text-[10px] text-muted mt-1">
                      {p.capabilities.metadata && <span>• Metadata</span>}
                      {p.capabilities.artwork && <span>• Artwork</span>}
                      {p.capabilities.streaming && <span>• Streaming</span>}
                      {p.capabilities.downloading && <span>• Downloads</span>}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleToggleProvider(p.id)}
                    className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                      enabled
                        ? 'bg-accent text-white shadow-sm'
                        : 'bg-surface-raised text-muted hover:text-text'
                    }`}
                  >
                    {enabled ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* 4. Keyboard Shortcuts Cheatsheet */}
      <section className="flex flex-col gap-3 rounded-3xl border border-border/80 bg-surface p-6 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-accent">
          <Activity className="size-3.5" />
          <span>Keyboard Shortcuts</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="flex items-center justify-between rounded-xl bg-surface-raised/60 p-3">
            <span className="text-muted">Play / Pause</span>
            <kbd className="rounded bg-surface border border-border px-2 py-0.5 font-mono font-bold text-text">
              Space
            </kbd>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-surface-raised/60 p-3">
            <span className="text-muted">Previous Track</span>
            <kbd className="rounded bg-surface border border-border px-2 py-0.5 font-mono font-bold text-text">
              Ctrl + ←
            </kbd>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-surface-raised/60 p-3">
            <span className="text-muted">Next Track</span>
            <kbd className="rounded bg-surface border border-border px-2 py-0.5 font-mono font-bold text-text">
              Ctrl + →
            </kbd>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-surface-raised/60 p-3">
            <span className="text-muted">Volume Up / Down</span>
            <kbd className="rounded bg-surface border border-border px-2 py-0.5 font-mono font-bold text-text">
              Ctrl + ↑ / ↓
            </kbd>
          </div>
        </div>
      </section>
    </div>
  )
}
