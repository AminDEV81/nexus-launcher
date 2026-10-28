import { lazy } from 'react'

export const LazyConsolePage = lazy(() =>
  import('@/features/console/ConsoleShell').then((m) => ({
    default: m.ConsoleShell,
  })),
)
