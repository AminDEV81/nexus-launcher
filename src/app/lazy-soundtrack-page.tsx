import { lazy } from 'react'

export const LazySoundtrackPage = lazy(() =>
  import('@/features/soundtrack/pages/soundtrack-center-page').then((module) => ({
    default: module.SoundtrackCenterPage,
  })),
)
