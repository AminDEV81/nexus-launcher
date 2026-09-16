/**
 * The app's mark is a faceted gem, built from a handful of SVG polygons
 * rather than one flat shape — that's what lets the startup splash
 * assemble it from flying shards and the closing overlay shatter it
 * apart again, using the exact same geometry both times.
 *
 * Every facet's fill is a gradient between two *shades of the current
 * accent color* (`facetGradientStops`), not fixed hex values — so the
 * mark automatically matches whichever of the five palettes and
 * dark/light mode combination is active (`store/theme-store.ts`),
 * instead of always rendering violet regardless of what the person
 * picked in Settings.
 */

export interface GemFacet {
  id: string
  /** SVG `points` attribute, on a 0-512 viewBox matching the previous
   *  static `assets/brand-mark.svg`. */
  points: string
  /** Lighter facets catch more light and sit toward the "front" of the
   *  gem; darker ones read as shadowed/receding — this is what gives a
   *  single accent hue the illusion of a faceted 3D surface instead of
   *  a flat cutout. */
  shade: 'light' | 'base' | 'dark'
  gradientAngle: 'vertical' | 'toLeft' | 'toRight'
  /** Where this facet flies in from for the splash's assembly — and,
   *  reversed, where it flies back out to for the closing overlay's
   *  shatter. Purely a direction+distance the entrance/exit animations
   *  consume; irrelevant to the assembled, static logo. */
  from: { x: number; y: number; rotate: number }
}

export const GEM_FACETS: GemFacet[] = [
  {
    id: 'crown-left',
    points: '256,60 256,256 98,256',
    shade: 'light',
    gradientAngle: 'toRight',
    from: { x: -300, y: -260, rotate: -60 },
  },
  {
    id: 'crown-right',
    points: '256,60 414,256 256,256',
    shade: 'base',
    gradientAngle: 'toLeft',
    from: { x: 300, y: -260, rotate: 60 },
  },
  {
    id: 'girdle-left',
    points: '98,256 256,256 170,340',
    shade: 'base',
    gradientAngle: 'toRight',
    from: { x: -420, y: 40, rotate: 40 },
  },
  {
    id: 'girdle-right',
    points: '256,256 414,256 342,340',
    shade: 'dark',
    gradientAngle: 'toLeft',
    from: { x: 420, y: 40, rotate: -40 },
  },
  {
    id: 'pavilion-left',
    points: '98,256 170,340 256,452',
    shade: 'base',
    gradientAngle: 'toRight',
    from: { x: -260, y: 340, rotate: -70 },
  },
  {
    id: 'pavilion-right',
    points: '414,256 256,452 342,340',
    shade: 'dark',
    gradientAngle: 'toLeft',
    from: { x: 260, y: 340, rotate: 70 },
  },
]

/** Outline drawn over the assembled facets — same silhouette + the
 *  center "belt" line separating crown from pavilion. Kept a fixed dark
 *  neutral rather than theme-reactive: a dark ink outline reads
 *  correctly against light *and* dark facet fills alike (the same
 *  reasoning most flat gem/jewel marks use a dark outline regardless of
 *  the surrounding palette). */
export const GEM_OUTLINE_COLOR = '#0a0a12'
export const GEM_OUTLINE_POINTS = '256,60 414,256 256,452 98,256'
export const GEM_BELT_LINE = { x1: 98, y1: 256, x2: 414, y2: 256 }

export const SHADE_STOPS: Record<GemFacet['shade'], [string, string]> = {
  light: [
    'color-mix(in srgb, var(--color-accent) 55%, white 45%)',
    'color-mix(in srgb, var(--color-accent) 85%, white 15%)',
  ],
  base: ['color-mix(in srgb, var(--color-accent) 90%, white 10%)', 'var(--color-accent)'],
  dark: ['var(--color-accent)', 'color-mix(in srgb, var(--color-accent) 70%, black 30%)'],
}

export function facetGradientId(facet: GemFacet): string {
  return `gem-facet-${facet.id}`
}
