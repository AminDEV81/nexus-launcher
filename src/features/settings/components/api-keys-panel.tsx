import { useEffect, useState } from 'react'
import {
  ExternalLink,
  Check,
  Cloud,
  Eye,
  EyeOff,
  Globe2,
  KeyRound,
  Image,
  ShieldCheck,
  Sparkles,
  Video,
  LogIn,
} from 'lucide-react'
import { openUrl } from '@tauri-apps/plugin-opener'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { useSettings, useSetSetting } from '../hooks/use-settings'
import { openGoogleAuthWindow } from '@/services/hub'
import { cn } from '@/lib/utils'
import { StorageCleanupCard } from './storage-cleanup-card'
import { POPULAR_REGIONS, DEFAULT_STEAM_REGION_KEY } from '@/features/hub/hooks/use-steam-price'

export function ApiKeysPanel() {
  const queryClient = useQueryClient()
  const { data: settings, isPending } = useSettings()
  const setSetting = useSetSetting()

  const [values, setValues] = useState<Record<string, string>>({})
  const [showSecret, setShowSecret] = useState<Record<string, boolean>>({})
  const [isGoogleConnected, setIsGoogleConnected] = useState(
    () => localStorage.getItem('google_auth_active') === 'true',
  )

  useEffect(() => {
    if (settings) setValues(settings)
  }, [settings])

  function handleSave(keys: string[]) {
    keys.forEach((key) => {
      const value = (values[key] ?? '').trim()
      setSetting.mutate({ key, value })
    })
    void queryClient.invalidateQueries({ queryKey: ['hub'] })
    toast.success('Settings saved successfully.')
  }

  const providerMode = values.metadata_provider_mode === 'custom' ? 'custom' : 'public'
  const hasIgdb = Boolean(values.igdb_client_id?.trim() && values.igdb_client_secret?.trim())
  const hasSteamGrid = Boolean(values.steamgriddb_api_key?.trim())

  return (
    <div className="flex flex-col gap-6">
      {/* Provider Mode Selection Card */}
      <div className="flex flex-col gap-4 rounded-2xl border border-border/80 bg-surface/60 p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3 border-b border-border/60 pb-3.5">
          <div className="flex items-start gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-accent/15 text-accent shadow-xs">
              <Sparkles className="size-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-text">Metadata & Artwork Mode</span>
                <span className="flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 font-mono text-[10px] font-bold text-accent">
                  {providerMode === 'public' ? 'Nexus Cloud (Active)' : 'Personal Keys (Active)'}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted">
                Select whether to use Nexus Cloud (zero configuration) or your personal API keys.
              </p>
            </div>
          </div>
        </div>

        {/* Dual Mode Switcher Grid */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* Public / Cloud Mode */}
          <button
            type="button"
            onClick={() => {
              setValues((prev) => ({ ...prev, metadata_provider_mode: 'public' }))
              setSetting.mutate({ key: 'metadata_provider_mode', value: 'public' })
              void queryClient.invalidateQueries({ queryKey: ['hub'] })
              toast.success('Switched to Nexus Cloud (Public Mode).')
            }}
            className={cn(
              'group relative flex flex-col items-start gap-2.5 rounded-2xl border p-4 text-left transition-all cursor-pointer',
              providerMode === 'public'
                ? 'border-accent bg-accent/10 shadow-sm ring-1 ring-accent/30'
                : 'border-border/80 bg-surface/40 hover:border-accent/40 hover:bg-surface-raised',
            )}
          >
            <div className="flex w-full items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'flex size-8 items-center justify-center rounded-lg text-xs font-bold transition-colors',
                    providerMode === 'public'
                      ? 'bg-accent text-white'
                      : 'bg-surface-raised text-muted group-hover:text-text',
                  )}
                >
                  <Cloud className="size-4" />
                </span>
                <span className="text-xs font-bold text-text">Nexus Cloud</span>
              </div>
              <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-400">
                Recommended
              </span>
            </div>
            <p className="text-xs text-muted leading-relaxed">
              Zero configuration required. Game Hub feeds, search, and official Steam artworks work
              out of the box powered by Cloudflare edge caching.
            </p>
          </button>

          {/* Custom / Personal API Keys Mode */}
          <button
            type="button"
            onClick={() => {
              setValues((prev) => ({ ...prev, metadata_provider_mode: 'custom' }))
              setSetting.mutate({ key: 'metadata_provider_mode', value: 'custom' })
              void queryClient.invalidateQueries({ queryKey: ['hub'] })
              toast.success('Switched to Personal API Keys mode.')
            }}
            className={cn(
              'group relative flex flex-col items-start gap-2.5 rounded-2xl border p-4 text-left transition-all cursor-pointer',
              providerMode === 'custom'
                ? 'border-accent bg-accent/10 shadow-sm ring-1 ring-accent/30'
                : 'border-border/80 bg-surface/40 hover:border-accent/40 hover:bg-surface-raised',
            )}
          >
            <div className="flex w-full items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'flex size-8 items-center justify-center rounded-lg text-xs font-bold transition-colors',
                    providerMode === 'custom'
                      ? 'bg-accent text-white'
                      : 'bg-surface-raised text-muted group-hover:text-text',
                  )}
                >
                  <KeyRound className="size-4" />
                </span>
                <span className="text-xs font-bold text-text">Personal API Keys</span>
              </div>
              <span className="rounded-md border border-border/80 bg-surface px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted">
                Advanced
              </span>
            </div>
            <p className="text-xs text-muted leading-relaxed">
              Direct connection using your personal Twitch/IGDB credentials and SteamGridDB API key.
              Bypasses the shared gateway.
            </p>
          </button>
        </div>

        {providerMode === 'public' && (
          <div className="mt-1 flex flex-col gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3.5 text-xs">
            <div className="flex items-center gap-2 font-semibold text-emerald-400">
              <ShieldCheck className="size-4" />
              <span>Nexus Cloud Gateway is Active & Connected</span>
            </div>
            <p className="text-muted leading-relaxed">
              Your launcher connects securely to the high-speed Nexus Edge Network. All metadata,
              curated feeds, and official Steam CDN assets work seamlessly out of the box with zero
              configuration.
            </p>
          </div>
        )}
      </div>

      {providerMode === 'public' && (hasIgdb || hasSteamGrid) && (
        <div className="flex items-center justify-between rounded-2xl border border-border/60 bg-surface/30 px-4 py-3 text-xs text-muted">
          <span>
            Personal API keys are saved locally and will be used if you switch to Personal mode.
          </span>
          <button
            type="button"
            onClick={() => {
              setValues((prev) => ({ ...prev, metadata_provider_mode: 'custom' }))
              setSetting.mutate({ key: 'metadata_provider_mode', value: 'custom' })
            }}
            className="font-semibold text-accent hover:underline cursor-pointer"
          >
            Manage Personal Keys
          </button>
        </div>
      )}

      {providerMode === 'custom' && (
        <>
          {/* IGDB Service Card */}
          <div className="flex flex-col gap-4 rounded-2xl border border-border/80 bg-surface/60 p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3 border-b border-border/60 pb-3.5">
              <div className="flex items-start gap-3">
                <span className="flex size-10 items-center justify-center rounded-xl bg-accent/15 text-accent shadow-xs">
                  <KeyRound className="size-5" />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-text">
                      IGDB (Internet Game Database)
                    </span>
                    <span
                      className={cn(
                        'flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] font-bold',
                        hasIgdb
                          ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                          : 'border border-amber-500/30 bg-amber-500/10 text-amber-500',
                      )}
                    >
                      <span
                        className={cn(
                          'size-1.5 rounded-full',
                          hasIgdb ? 'bg-emerald-400' : 'bg-amber-500',
                        )}
                      />
                      <span>{hasIgdb ? 'Configured' : 'Missing Keys'}</span>
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    Powers rich game summaries, genres, developer studios, and official release
                    dates.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => void openUrl('https://api-docs.igdb.com/#getting-started')}
                className="flex items-center gap-1.5 rounded-xl border border-border/80 bg-surface px-3 py-1.5 text-xs font-semibold text-text shadow-xs transition-all hover:border-accent hover:text-accent"
              >
                <span>Get Free Keys</span>
                <ExternalLink className="size-3" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {/* Client ID */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-muted" htmlFor="igdb_client_id">
                  Client ID
                </label>
                <input
                  id="igdb_client_id"
                  type="text"
                  disabled={isPending}
                  placeholder="e.g. 5x9d2k7..."
                  value={values.igdb_client_id ?? ''}
                  onChange={(e) =>
                    setValues((prev) => ({ ...prev, igdb_client_id: e.target.value }))
                  }
                  className="rounded-xl border border-border/80 bg-surface px-3.5 py-2 text-xs font-medium text-text shadow-xs outline-none focus:border-accent"
                />
              </div>

              {/* Client Secret */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-muted" htmlFor="igdb_client_secret">
                  Client Secret
                </label>
                <div className="relative flex items-center">
                  <input
                    id="igdb_client_secret"
                    type={showSecret.igdb_client_secret ? 'text' : 'password'}
                    disabled={isPending}
                    placeholder="e.g. 8b4c9e1..."
                    value={values.igdb_client_secret ?? ''}
                    onChange={(e) =>
                      setValues((prev) => ({ ...prev, igdb_client_secret: e.target.value }))
                    }
                    className="w-full rounded-xl border border-border/80 bg-surface pl-3.5 pr-10 py-2 text-xs font-medium text-text shadow-xs outline-none focus:border-accent"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setShowSecret((prev) => ({
                        ...prev,
                        igdb_client_secret: !prev.igdb_client_secret,
                      }))
                    }
                    className="absolute right-3 text-subtle hover:text-text"
                  >
                    {showSecret.igdb_client_secret ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => handleSave(['igdb_client_id', 'igdb_client_secret'])}
                disabled={setSetting.isPending}
                className="flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-xs font-bold text-white shadow-sm transition-all hover:bg-accent-hover active:scale-95 disabled:opacity-50"
              >
                <Check className="size-3.5" strokeWidth={3} />
                <span>Save IGDB Credentials</span>
              </button>
            </div>
          </div>

          {/* SteamGridDB Service Card */}
          <div className="flex flex-col gap-4 rounded-2xl border border-border/80 bg-surface/60 p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3 border-b border-border/60 pb-3.5">
              <div className="flex items-start gap-3">
                <span className="flex size-10 items-center justify-center rounded-xl bg-accent/15 text-accent shadow-xs">
                  <Image className="size-5" />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-text">SteamGridDB Artwork Engine</span>
                    <span
                      className={cn(
                        'flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] font-bold',
                        hasSteamGrid
                          ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                          : 'border border-amber-500/30 bg-amber-500/10 text-amber-500',
                      )}
                    >
                      <span
                        className={cn(
                          'size-1.5 rounded-full',
                          hasSteamGrid ? 'bg-emerald-400' : 'bg-amber-500',
                        )}
                      />
                      <span>{hasSteamGrid ? 'Configured' : 'Missing Key'}</span>
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    Supplies ultra HD covers, transparent logos, banners, and animated Live Covers.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => void openUrl('https://www.steamgriddb.com/profile/preferences/api')}
                className="flex items-center gap-1.5 rounded-xl border border-border/80 bg-surface px-3 py-1.5 text-xs font-semibold text-text shadow-xs transition-all hover:border-accent hover:text-accent"
              >
                <span>Get Free Key</span>
                <ExternalLink className="size-3" />
              </button>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-muted" htmlFor="steamgriddb_api_key">
                SteamGridDB API Key
              </label>
              <div className="relative flex items-center">
                <input
                  id="steamgriddb_api_key"
                  type={showSecret.steamgriddb_api_key ? 'text' : 'password'}
                  disabled={isPending}
                  placeholder="e.g. 9f8e7d6c5b4a..."
                  value={values.steamgriddb_api_key ?? ''}
                  onChange={(e) =>
                    setValues((prev) => ({ ...prev, steamgriddb_api_key: e.target.value }))
                  }
                  className="w-full rounded-xl border border-border/80 bg-surface pl-3.5 pr-10 py-2 text-xs font-medium text-text shadow-xs outline-none focus:border-accent"
                />
                <button
                  type="button"
                  onClick={() =>
                    setShowSecret((prev) => ({
                      ...prev,
                      steamgriddb_api_key: !prev.steamgriddb_api_key,
                    }))
                  }
                  className="absolute right-3 text-subtle hover:text-text"
                >
                  {showSecret.steamgriddb_api_key ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => handleSave(['steamgriddb_api_key'])}
                disabled={setSetting.isPending}
                className="flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-xs font-bold text-white shadow-sm transition-all hover:bg-accent-hover active:scale-95 disabled:opacity-50"
              >
                <Check className="size-3.5" strokeWidth={3} />
                <span>Save SteamGridDB Key</span>
              </button>
            </div>
          </div>
        </>
      )}

      {/* Google / YouTube Account Card for Age Restrictions */}
      <div className="flex flex-col gap-4 rounded-2xl border border-border/80 bg-surface/60 p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3 border-b border-border/60 pb-3.5">
          <div className="flex items-start gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-red-500/15 text-red-500 shadow-xs">
              <Video className="size-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-text">YouTube & Google Account</span>
                <span
                  className={cn(
                    'flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] font-bold',
                    isGoogleConnected
                      ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                      : 'border border-border/80 bg-surface-raised text-muted',
                  )}
                >
                  <span
                    className={cn(
                      'size-1.5 rounded-full',
                      isGoogleConnected ? 'bg-emerald-400' : 'bg-muted',
                    )}
                  />
                  <span>{isGoogleConnected ? 'Signed In' : 'Not Connected'}</span>
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted">
                Sign into your Google account to unlock age-restricted (18+) game trailers inside
                Nexus Launcher.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-subtle">
          <span>
            {isGoogleConnected
              ? 'Your Google authentication is stored securely in your local WebView profile.'
              : 'Click below to open the official Google authentication window and sign in.'}
          </span>

          <div className="flex items-center gap-2">
            {isGoogleConnected && (
              <button
                type="button"
                onClick={() => {
                  setIsGoogleConnected(false)
                  localStorage.removeItem('google_auth_active')
                  toast.info('Google account status reset in Nexus.')
                }}
                className="rounded-xl border border-border/80 bg-surface px-3 py-1.5 text-xs font-semibold text-muted hover:text-text active:scale-95"
              >
                Sign Out
              </button>
            )}

            <button
              type="button"
              onClick={async () => {
                try {
                  await openGoogleAuthWindow()
                  setIsGoogleConnected(true)
                  localStorage.setItem('google_auth_active', 'true')
                  toast.success('Google sign-in window opened.')
                } catch {
                  toast.error('Could not open Google sign-in window.')
                }
              }}
              className="flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition-all hover:bg-red-500 active:scale-95"
            >
              <LogIn className="size-3.5" />
              <span>{isGoogleConnected ? 'Switch Google Account' : 'Sign in to Google'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Steam Store & Regional Pricing Settings Card */}
      <div className="flex flex-col gap-4 rounded-2xl border border-border/80 bg-surface/60 p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3 border-b border-border/60 pb-3.5">
          <div className="flex items-start gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-accent/15 text-accent shadow-xs">
              <Globe2 className="size-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-text">Steam Store & Regional Pricing</span>
                <span className="rounded-md border border-accent/30 bg-accent/10 px-2 py-0.5 font-mono text-[10px] font-bold text-accent uppercase tracking-wider">
                  SteamDB
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted">
                Select your default Steam storefront region for real-time game prices, discount
                tracking, and currency conversion.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-xs font-bold text-muted">Default Storefront Region</span>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {POPULAR_REGIONS.map((reg) => {
              const currentDefault = values[DEFAULT_STEAM_REGION_KEY] || 'us'
              const isSelected = currentDefault === reg.code
              return (
                <button
                  key={reg.code}
                  type="button"
                  onClick={() => {
                    setValues((prev) => ({ ...prev, [DEFAULT_STEAM_REGION_KEY]: reg.code }))
                    setSetting.mutate({ key: DEFAULT_STEAM_REGION_KEY, value: reg.code })
                    toast.success(`Default Steam region set to ${reg.flag} ${reg.name}`)
                  }}
                  className={cn(
                    'flex items-center justify-between rounded-xl border p-2.5 text-xs font-semibold transition-all text-left',
                    isSelected
                      ? 'border-accent bg-accent/15 text-text ring-2 ring-accent/30 shadow-xs'
                      : 'border-border/80 bg-surface text-subtle hover:text-text hover:border-accent/40 hover:bg-surface-raised',
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-lg leading-none select-none">{reg.flag}</span>
                    <span className="truncate">{reg.name}</span>
                  </div>
                  <span className="font-mono text-[10px] text-muted uppercase">{reg.currency}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Storage Maintenance & Orphaned Cover Purge */}
      <StorageCleanupCard />

      {/* Auto-Detection Note */}
      <div className="flex items-center gap-3 rounded-2xl border border-border/80 bg-surface/50 p-4 text-xs text-muted shadow-xs">
        <Sparkles className="size-5 shrink-0 text-accent" />
        <span>
          Games imported directly from Steam receive official covers, genres, and store metadata
          automatically — no API keys required.
        </span>
      </div>
    </div>
  )
}
