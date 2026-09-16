import { useNavigate } from 'react-router-dom'
import { ExternalLink, Settings, Cloud, Sparkles } from 'lucide-react'
import { openUrl } from '@tauri-apps/plugin-opener'
import { useSetSetting } from '@/features/settings/hooks/use-settings'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

/**
 * The hub's "fix your setup first" state, shared by the shelves, search,
 * feed pages, and game pages alike. Users can either activate Nexus Cloud
 * with 1-click (zero configuration) or configure their personal IGDB keys.
 */
export function MissingKeysPanel() {
  const navigate = useNavigate()
  const setSetting = useSetSetting()
  const queryClient = useQueryClient()

  async function handleSwitchToCloud() {
    try {
      await setSetting.mutateAsync({ key: 'metadata_provider_mode', value: 'public' })
      await queryClient.invalidateQueries({ queryKey: ['hub'] })
      toast.success('Switched to Nexus Cloud! Unlocking Game Hub…')
    } catch {
      toast.error('Failed to switch to Nexus Cloud.')
    }
  }

  return (
    <section className="flex flex-col items-center justify-center gap-6 rounded-2xl border border-dashed border-border bg-surface px-8 py-14 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-accent/12 text-accent">
        <Sparkles className="size-7" />
      </span>

      <div>
        <div className="text-lg font-bold text-text">Unlock the Game Hub</div>
        <p className="mx-auto mt-1 max-w-lg text-sm text-muted">
          Game Hub requires game catalog data. You can unlock it instantly using free Nexus Cloud
          (no setup required), or supply your personal Twitch/IGDB API keys.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-3">
        <button
          type="button"
          onClick={handleSwitchToCloud}
          disabled={setSetting.isPending}
          className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-[0_10px_24px_-10px_var(--nx-accent)] transition-all hover:bg-accent-hover active:scale-95 disabled:opacity-50 cursor-pointer"
        >
          <Cloud className="size-4" />
          <span>Switch to Nexus Cloud (1-Click Unlock)</span>
        </button>

        <button
          type="button"
          onClick={() => navigate('/settings')}
          className="inline-flex items-center gap-2 rounded-xl border border-border/80 bg-surface px-4 py-2.5 text-sm font-medium text-text transition-colors hover:bg-surface-raised cursor-pointer"
        >
          <Settings className="size-4" />
          <span>Configure Personal Keys</span>
        </button>
      </div>

      <div className="w-full max-w-md border-t border-border/60 pt-4 text-left">
        <div className="mb-2 text-xs font-semibold text-muted">Prefer personal keys?</div>
        <ol className="flex flex-col gap-2 text-xs">
          <li className="flex items-start gap-2.5 text-muted">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-surface-raised font-mono text-[10px] font-bold text-text">
              1
            </span>
            <span>
              Create a free Twitch Developer application at{' '}
              <button
                type="button"
                onClick={() => void openUrl('https://api-docs.igdb.com/#getting-started')}
                className="inline-flex items-center gap-1 text-accent hover:underline cursor-pointer"
              >
                <span>api-docs.igdb.com</span>
                <ExternalLink className="size-2.5" />
              </button>
            </span>
          </li>
          <li className="flex items-start gap-2.5 text-muted">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-surface-raised font-mono text-[10px] font-bold text-text">
              2
            </span>
            <span>Paste Client ID & Secret in Settings → Metadata & Artwork Mode.</span>
          </li>
        </ol>
      </div>
    </section>
  )
}
