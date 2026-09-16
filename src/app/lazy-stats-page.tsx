import { lazy } from 'react'

/**
 * `recharts` (and the d3 modules it pulls in) alone adds a few hundred
 * KB to the bundle — real weight for a chart library nobody but the
 * Stats page needs. `lazy()` keeps that out of the initial load
 * entirely; it's fetched only the first time someone actually opens
 * `/stats`, same tradeoff Epic 16's "code splitting" pass was always
 * going to make for exactly this kind of page.
 */
export const LazyStatsPage = lazy(() =>
  import('@/features/stats/pages/stats-page').then((module) => ({ default: module.StatsPage })),
)
