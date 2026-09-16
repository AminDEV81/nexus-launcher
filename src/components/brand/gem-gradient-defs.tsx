import { GEM_FACETS, SHADE_STOPS, facetGradientId } from './gem-geometry'

/** Renders the `<linearGradient>` defs every facet's `fill` references
 *  — call once per `<svg>`, not per facet. */
export function GemGradientDefs() {
  return (
    <defs>
      {GEM_FACETS.map((facet) => {
        const [from, to] = SHADE_STOPS[facet.shade]
        const coords =
          facet.gradientAngle === 'vertical'
            ? { x1: '0%', y1: '0%', x2: '0%', y2: '100%' }
            : facet.gradientAngle === 'toLeft'
              ? { x1: '100%', y1: '0%', x2: '0%', y2: '100%' }
              : { x1: '0%', y1: '0%', x2: '100%', y2: '100%' }
        return (
          <linearGradient key={facet.id} id={facetGradientId(facet)} {...coords}>
            <stop offset="0%" stopColor={from} />
            <stop offset="100%" stopColor={to} />
          </linearGradient>
        )
      })}
    </defs>
  )
}
