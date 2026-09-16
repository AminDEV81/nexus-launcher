import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowRight,
  Check,
  ExternalLink,
  Gamepad2,
  KeyRound,
  Loader2,
  Radar,
  Sparkles,
} from 'lucide-react'
import { openUrl } from '@tauri-apps/plugin-opener'
import { toast } from 'sonner'
import { LogoMark } from '@/components/brand/logo-mark'
import { useAnimationSpeed } from '@/hooks/use-animation-speed'
import { useSetSetting } from '@/features/settings/hooks/use-settings'
import { scanAllStores, importScannedGames, type ScannedGame } from '@/services/scan'

/**
 * First-run experience, shown once over the app until the user finishes
 * or skips it (tracked via the `onboarded` setting). Three steps:
 * welcome, an automatic store scan (the existing scanner — this only
 * orchestrates it), and the optional IGDB keys that unlock the Game Hub
 * and metadata. Nothing here is required; skipping lands the user in a
 * normal, just-empty app.
 */

type Step = 'welcome' | 'scan' | 'keys'

const STEPS: { id: Step; label: string }[] = [
  { id: 'welcome', label: 'Welcome' },
  { id: 'scan', label: 'Find your games' },
  { id: 'keys', label: 'Metadata' },
]

export function OnboardingOverlay({ onDone }: { onDone: () => void }) {
  const speed = useAnimationSpeed()
  const setSetting = useSetSetting()
  const [step, setStep] = useState<Step>('welcome')
  const [scanning, setScanning] = useState(false)
  const [found, setFound] = useState<ScannedGame[] | null>(null)
  const [importing, setImporting] = useState(false)
  const [igdbId, setIgdbId] = useState('')
  const [igdbSecret, setIgdbSecret] = useState('')

  const stepIndex = STEPS.findIndex((entry) => entry.id === step)

  // Kick the scan off as soon as its step appears — no button needed,
  // finding games is the whole point of a launcher's first run.
  useEffect(() => {
    if (step !== 'scan' || found !== null || scanning) return
    setScanning(true)
    scanAllStores()
      .then((result) => setFound(result.games))
      .catch(() => setFound([]))
      .finally(() => setScanning(false))
  }, [step, found, scanning])

  async function finish(extra?: { key: string; value: string }) {
    try {
      if (extra) {
        await setSetting.mutateAsync({ key: extra.key, value: extra.value })
      }
      await setSetting.mutateAsync({ key: 'onboarded', value: '1' })
    } finally {
      onDone()
    }
  }

  async function handleImport() {
    if (!found || found.length === 0 || importing) return
    setImporting(true)
    try {
      const imported = await importScannedGames(found)
      toast.success(`Added ${imported} games to your library.`)
      await finish()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not import those games.')
    } finally {
      setImporting(false)
    }
  }

  const transition = { duration: 0.25 * speed, ease: [0.16, 1, 0.3, 1] as const }

  return (
    <motion.div
      className="absolute inset-0 z-[70] flex items-center justify-center bg-black/55 p-6 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={transition}
    >
      <motion.div
        className="solid-panel relative w-full max-w-lg overflow-hidden rounded-2xl border border-border shadow-elevated"
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={transition}
      >
        {/* Progress dots */}
        <div className="flex items-center justify-center gap-1.5 border-b border-border px-6 py-3">
          {STEPS.map((entry, index) => (
            <span
              key={entry.id}
              className={
                index === stepIndex
                  ? 'h-1.5 w-6 rounded-full bg-accent transition-all'
                  : index < stepIndex
                    ? 'h-1.5 w-1.5 rounded-full bg-accent/50 transition-all'
                    : 'h-1.5 w-1.5 rounded-full bg-border transition-all'
              }
            />
          ))}
        </div>

        <div className="min-h-[19rem] p-7">
          <AnimatePresence mode="wait" initial={false}>
            {step === 'welcome' && (
              <motion.div
                key="welcome"
                initial={{ opacity: 0, x: 14 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -14 }}
                transition={transition}
                className="flex h-full flex-col items-center justify-center text-center"
              >
                <span className="flex size-16 items-center justify-center rounded-2xl bg-accent/12 text-accent">
                  <LogoMark className="size-9" />
                </span>
                <h1 className="mt-4 text-xl font-bold tracking-tight text-text">
                  Welcome to Nexus
                </h1>
                <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">
                  Your personal game library — every store in one place, live covers, playtime
                  tracking, and a discovery hub straight from IGDB. Let&apos;s set things up; it
                  takes under a minute.
                </p>
                <div className="mt-6 flex gap-2">
                  <button
                    type="button"
                    onClick={() => finish()}
                    className="rounded-xl px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-surface-raised hover:text-text"
                  >
                    Skip setup
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep('scan')}
                    className="flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
                  >
                    Get started <ArrowRight className="size-4" />
                  </button>
                </div>
              </motion.div>
            )}

            {step === 'scan' && (
              <motion.div
                key="scan"
                initial={{ opacity: 0, x: 14 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -14 }}
                transition={transition}
                className="flex h-full flex-col"
              >
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-accent/12 text-accent">
                    {scanning ? (
                      <Radar className="size-5 animate-spin" />
                    ) : (
                      <Gamepad2 className="size-5" />
                    )}
                  </span>
                  <div>
                    <h2 className="text-base font-semibold text-text">Find your games</h2>
                    <p className="text-xs text-muted">
                      {scanning
                        ? 'Scanning your installed stores…'
                        : found && found.length > 0
                          ? `Found ${found.length} games across your stores`
                          : 'No installed games were found'}
                    </p>
                  </div>
                </div>

                <div className="mt-4 min-h-[9.5rem] flex-1 overflow-y-auto rounded-xl border border-border bg-surface/60 p-3">
                  {scanning && (
                    <div className="flex h-full items-center justify-center gap-2 text-sm text-subtle">
                      <Loader2 className="size-4 animate-spin" /> Looking for Steam, Epic, GOG, EA,
                      Ubisoft, Battle.net, Amazon and Xbox games…
                    </div>
                  )}
                  {!scanning && found && found.length > 0 && (
                    <ul className="flex flex-col gap-1">
                      {found.map((game, index) => (
                        <li
                          key={`${game.source}-${index}`}
                          className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm"
                        >
                          <span className="min-w-0 truncate text-text">{game.name}</span>
                          <span className="shrink-0 rounded-full bg-surface-raised px-2 py-0.5 text-[10px] text-subtle">
                            {game.source}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {!scanning && found && found.length === 0 && (
                    <p className="flex h-full items-center justify-center text-center text-sm text-subtle">
                      Install games from any store and they&apos;ll appear — or add them manually
                      with the + button anytime.
                    </p>
                  )}
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setStep('keys')}
                    className="rounded-xl px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-surface-raised hover:text-text"
                  >
                    {found && found.length > 0 ? 'Skip for now' : 'Continue'}
                  </button>
                  {found && found.length > 0 && (
                    <button
                      type="button"
                      onClick={handleImport}
                      disabled={importing}
                      className="flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
                    >
                      {importing ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Check className="size-4" />
                      )}
                      Add {found.length} games
                    </button>
                  )}
                </div>
              </motion.div>
            )}

            {step === 'keys' && (
              <motion.div
                key="keys"
                initial={{ opacity: 0, x: 14 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -14 }}
                transition={transition}
                className="flex h-full flex-col"
              >
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-accent/12 text-accent">
                    <KeyRound className="size-5" />
                  </span>
                  <div>
                    <h2 className="text-base font-semibold text-text">Game Hub & Metadata</h2>
                    <p className="text-xs text-muted">Nexus Cloud is active by default</p>
                  </div>
                </div>

                <p className="mt-3 text-sm leading-relaxed text-muted">
                  Nexus Cloud powers your Game Hub, search, and official artwork automatically with
                  zero configuration! If you prefer using personal Twitch/IGDB developer
                  credentials, you can enter them below, or configure them later in Settings.
                </p>

                <div className="mt-4 flex flex-col gap-2.5">
                  <input
                    value={igdbId}
                    onChange={(event) => setIgdbId(event.target.value)}
                    placeholder="IGDB Client ID"
                    className="h-10 rounded-xl border border-border bg-surface px-3.5 text-sm text-text outline-none transition-colors placeholder:text-subtle focus:border-accent/50"
                  />
                  <input
                    type="password"
                    value={igdbSecret}
                    onChange={(event) => setIgdbSecret(event.target.value)}
                    placeholder="IGDB Client Secret"
                    className="h-10 rounded-xl border border-border bg-surface px-3.5 text-sm text-text outline-none transition-colors placeholder:text-subtle focus:border-accent/50"
                  />
                  <button
                    type="button"
                    onClick={() => void openUrl('https://api-docs.igdb.com/#account-creation')}
                    className="flex w-fit items-center gap-1.5 text-xs text-accent transition-colors hover:text-accent-hover"
                  >
                    <ExternalLink className="size-3" /> How to get free IGDB keys
                  </button>
                </div>

                <div className="mt-auto flex items-center justify-between pt-5">
                  <button
                    type="button"
                    onClick={() => finish()}
                    className="rounded-xl px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-surface-raised hover:text-text"
                  >
                    Skip for now
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const id = igdbId.trim()
                      const secret = igdbSecret.trim()
                      if (id && secret) {
                        await setSetting.mutateAsync({ key: 'igdb_client_id', value: id })
                        await setSetting.mutateAsync({ key: 'igdb_client_secret', value: secret })
                      }
                      await finish()
                    }}
                    className="flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
                  >
                    <Sparkles className="size-4" />
                    Finish
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  )
}
