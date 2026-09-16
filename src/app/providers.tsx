import type { PropsWithChildren } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { MotionConfig } from 'framer-motion'
import { Toaster } from 'sonner'
import { queryClient } from './query-client'
import { useAppearanceSettingsStore } from '@/store/appearance-settings-store'

/**
 * Every app-wide provider lives here so `main.tsx` stays a one-liner and
 * new providers (e.g. an error-reporting context in Epic 16) have one
 * obvious place to be added.
 */
export function AppProviders({ children }: PropsWithChildren) {
  const reduceMotion = useAppearanceSettingsStore((s) => s.reduceMotion)

  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion={reduceMotion ? 'always' : 'never'}>
        {children}
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: {
              background: 'var(--nx-surface-raised)',
              border: '1px solid var(--nx-border)',
              color: 'var(--nx-text)',
            },
          }}
        />
      </MotionConfig>
    </QueryClientProvider>
  )
}
