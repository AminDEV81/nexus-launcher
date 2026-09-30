import React from 'react'
import type {
  MetricToggles,
  OverlayMetrics,
  OverlayPosition,
  OverlayThemeId,
} from '../types/overlay'
import { THEME_REGISTRY } from './theme-registry'
import { HorizontalBarLayout } from './layouts/horizontal-bar'
import { VerticalStripLayout } from './layouts/vertical-strip'
import { ModularCardsLayout } from './layouts/modular-cards'
import { BracketHudLayout } from './layouts/bracket-hud'
import { CompactBadgeLayout } from './layouts/compact-badge'
import { RadialGaugesLayout } from './layouts/radial-gauges'

const ORIGINS: Record<OverlayPosition, string> = {
  'top-left': 'top left',
  'top-right': 'top right',
  'bottom-left': 'bottom left',
  'bottom-right': 'bottom right',
  'top-center': 'top center',
  'bottom-center': 'bottom center',
}

interface ThemeRendererProps {
  themeId: OverlayThemeId
  metrics: OverlayMetrics
  toggles: MetricToggles
  scale?: number
  opacity?: number
  /** Screen anchor; scaling grows away from it so the HUD never leaves the screen. */
  position?: OverlayPosition
  className?: string
}

export const ThemeRenderer: React.FC<ThemeRendererProps> = ({
  themeId,
  metrics,
  toggles,
  scale = 1.0,
  opacity = 0.95,
  position = 'top-left',
  className = '',
}) => {
  const theme = THEME_REGISTRY[themeId] || THEME_REGISTRY.cyberpunk
  const { definition, tokens } = theme

  const renderLayout = () => {
    switch (definition.layout) {
      case 'horizontal-bar':
        return <HorizontalBarLayout metrics={metrics} toggles={toggles} tokens={tokens} />
      case 'vertical-strip':
        return <VerticalStripLayout metrics={metrics} toggles={toggles} tokens={tokens} />
      case 'bracket-hud':
        return <BracketHudLayout metrics={metrics} toggles={toggles} tokens={tokens} />
      case 'compact-badge':
        return <CompactBadgeLayout metrics={metrics} toggles={toggles} tokens={tokens} />
      case 'radial-gauges':
        return <RadialGaugesLayout metrics={metrics} toggles={toggles} tokens={tokens} />
      case 'modular-cards':
      default:
        return <ModularCardsLayout metrics={metrics} toggles={toggles} tokens={tokens} />
    }
  }

  return (
    <div
      className={`transition-opacity duration-150 will-change-transform ${className}`}
      style={{
        transform: `scale(${scale})`,
        transformOrigin: ORIGINS[position] ?? 'top left',
        opacity,
      }}
    >
      {renderLayout()}
    </div>
  )
}
