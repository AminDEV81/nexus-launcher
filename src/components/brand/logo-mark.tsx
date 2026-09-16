import {
  GEM_FACETS,
  GEM_OUTLINE_COLOR,
  GEM_OUTLINE_POINTS,
  GEM_BELT_LINE,
  facetGradientId,
} from './gem-geometry'
import { GemGradientDefs } from './gem-gradient-defs'

/**
 * The app's mark, fully assembled and at rest — used in the sidebar and
 * title bar. Shares its facet geometry and gradients with
 * `StartupSplash` (which assembles these same shapes from flying
 * shards) and `ClosingOverlay` (which shatters them back apart), so the
 * logo never looks like a different mark depending on where it's shown.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden="true">
      <GemGradientDefs />
      {GEM_FACETS.map((facet) => (
        <polygon key={facet.id} points={facet.points} fill={`url(#${facetGradientId(facet)})`} />
      ))}
      <polygon
        points={GEM_OUTLINE_POINTS}
        fill="none"
        stroke={GEM_OUTLINE_COLOR}
        strokeWidth={14}
        strokeLinejoin="round"
      />
      <line
        x1={GEM_BELT_LINE.x1}
        y1={GEM_BELT_LINE.y1}
        x2={GEM_BELT_LINE.x2}
        y2={GEM_BELT_LINE.y2}
        stroke={GEM_OUTLINE_COLOR}
        strokeWidth={12}
      />
    </svg>
  )
}
